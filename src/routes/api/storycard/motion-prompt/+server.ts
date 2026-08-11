import { json, type RequestHandler } from '@sveltejs/kit';
import { runCharacterAi } from '$lib/server/characterAiRouter';
import { parseAiJson } from '$lib/server/aiJson';
import { getMemoryCharacter } from '$lib/server/characterMemory';
import { getVisualMemoryRecord } from '$lib/server/visualMemoryStore';
import type { ChatImageInput } from '$lib/providers/types';
import type { StoryCard } from '$lib/storycard/storycard';
import { normalizeCharacterVisualMemory } from '$lib/types/characterVisualMemory';

const RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		directives: {
			type: 'ARRAY',
			items: { type: 'STRING' },
		},
		conversationSummary: { type: 'STRING' },
	},
	required: ['directives', 'conversationSummary'],
};

const SYSTEM_PROMPT = [
	'You are a motion director for Seedance video generation.',
	'Semantically analyze the completed StoryCard and extract its production-ready motion directions.',
	'Do not fill a template and do not reuse stock animation language. Derive every directive anew from this StoryCard.',
	'Read all StoryCard fields together, including title, summary, theme, goal, location, duration, cuts, and reference metadata. A requirement may be expressed across more than one field.',
	'Use the supplied Visual Memory as authoritative continuity context for appearance, equipment, articulated-part motion, mustKeep rules, and avoid rules.',
	'Official Reference images are the highest-priority visual authority and must be considered before all other reference images.',
	'Extract the actual framing, subject action, location, viewpoint, visible character parts or equipment, secondary motion implied by the specified action, camera work, cut progression, and total duration.',
	'Translate internal part identifiers into visually meaningful English directions using the StoryCard and reference context; do not merely copy an opaque identifier when its visible meaning is known.',
	'Every directive must be supported by the StoryCard. A physically natural consequence of a specified action is allowed when it is needed to animate a visible articulated part, but unrelated embellishment is forbidden.',
	'If the StoryCard changes, the Motion Prompt must change with it. Never reuse a generic animation prompt.',
	'Preserve the intended cut order, timing, character actions, expressions, camera work, and transitions.',
	'Return directives as an ordered array of short English phrases. Each item must contain exactly one concrete visible fact or motion direction.',
	'Merge duplicate requirements, but do not omit distinct requirements. Prefer direct production language such as a shot, action, view, visibility, or motion phrase; do not add category labels.',
	'Put the total duration in the final directive using the exact numeric duration from StoryCard.duration.',
	'Describe only visible motion and camera direction. Do not explain the StoryCard or add commentary.',
	'Do not invent characters, events, dialogue, captions, or scene details absent from the StoryCard.',
	'Do not add generic actions such as waving, blinking, breathing, smiling, or facing the camera unless the StoryCard specifies them.',
	'Also write conversationSummary as one short, natural Japanese sentence the character can say after finishing the StoryCard.',
	'The conversation summary must describe the planned video briefly without listing cuts or repeating the full StoryCard.',
	'Return JSON only and match the response schema.',
].join('\n');

function isStoryCard(value: unknown): value is StoryCard {
	if (!value || typeof value !== 'object') return false;
	const card = value as Partial<StoryCard>;
	return typeof card.id === 'string'
		&& typeof card.title === 'string'
		&& Array.isArray(card.cuts)
		&& card.cuts.length > 0;
}

async function inlineReferenceParts(references: unknown[], requestUrl: URL): Promise<ChatImageInput[]> {
	const parts: ChatImageInput[] = [];
	for (const value of references) {
		if (!value || typeof value !== 'object') continue;
		const rawUrl = (value as { url?: unknown }).url;
		if (typeof rawUrl !== 'string' || !rawUrl.trim()) continue;
		try {
			const imageUrl = new URL(rawUrl, requestUrl);
			if (imageUrl.origin !== requestUrl.origin) continue;
			const response = await fetch(imageUrl);
			if (!response.ok) continue;
			const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
			if (!mimeType.startsWith('image/')) continue;
			const buffer = Buffer.from(await response.arrayBuffer());
			if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) continue;
			parts.push({
				dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
				name: imageUrl.pathname.split('/').at(-1) || `reference-${parts.length + 1}`,
			});
		} catch {
			// Reference metadata still reaches GPT-5.5 when an image cannot be loaded.
		}
	}
	return parts;
}

export const POST: RequestHandler = async ({ request, url }) => {
	let body: { characterId?: unknown; storyCard?: unknown; references?: unknown; instruction?: unknown; visualMemory?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}

	if (!isStoryCard(body.storyCard)) {
		return json({ message: 'A completed StoryCard is required' }, { status: 400 });
	}

	let model = 'unknown';
	const startedAt = Date.now();
	const characterId = typeof body.characterId === 'string' ? body.characterId : undefined;
	let visualMemory = normalizeCharacterVisualMemory(body.visualMemory);
	if (characterId) {
		try {
			const character = getMemoryCharacter(characterId);
			visualMemory = getVisualMemoryRecord(characterId, character.visualMemory).visualMemory;
		} catch { /* request context remains available */ }
	}
	const requestReferences = Array.isArray(body.references)
		? body.references.filter((value) => value && typeof value === 'object').slice(0, 10)
		: body.storyCard.references.slice(0, 10);
	const officialReferences = visualMemory.referenceImages
		.filter((reference) => reference.official)
		.map((reference) => ({ id: reference.id, url: reference.url, title: reference.fileName, source: 'official-visual-memory', category: reference.category, tags: reference.tags }));
	const references = [...officialReferences, ...requestReferences]
		.filter((reference, index, all) => {
			const item = reference as { id?: unknown; url?: unknown };
			return all.findIndex((candidate) => {
				const other = candidate as { id?: unknown; url?: unknown };
				return (item.id && item.id === other.id) || (item.url && item.url === other.url);
			}) === index;
		})
		.slice(0, 10);
	const inlineReferences = await inlineReferenceParts(references, url);
	const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 2000) : '';
	try {
		const configured = await runCharacterAi({
			characterId,
			role: 'motionPrompt',
			systemPrompt: `${SYSTEM_PROMPT}\nThe response must conform to this JSON schema: ${JSON.stringify(RESPONSE_SCHEMA)}`,
			userMessage: JSON.stringify({
				storyCard: body.storyCard,
				visualMemory,
				relevantReferences: references,
				revisionInstruction: instruction || undefined,
			}),
			images: inlineReferences,
			// ロールAIがGeminiの場合、thinkingトークンもmaxTokens(=maxOutputTokens)に含まれるため余裕を持たせる。
			maxTokens: 4096,
		});
		model = configured.model;
		const raw = configured.text;
		const parsed = parseAiJson(raw, {
			label: 'StoryCard Motion Prompt',
			logTag: '[STORYCARD_MOTION_PROMPT_RAW]',
			context: { provider: configured.provider, model },
		}) as { directives?: unknown; conversationSummary?: unknown };
		const directives = Array.isArray(parsed.directives)
			? parsed.directives
				.filter((value): value is string => typeof value === 'string')
				.map((value) => value.trim().replace(/^[-*]\s*/, ''))
				.filter(Boolean)
				.slice(0, 40)
			: [];
		const motionPrompt = directives.join('\n');
		const conversationSummary = typeof parsed.conversationSummary === 'string' ? parsed.conversationSummary.trim() : '';
		if (!motionPrompt) throw new Error('GPT-5.5 returned an empty Motion Prompt');
		if (!conversationSummary) throw new Error('GPT-5.5 returned an empty conversation summary');

		const latencyMs = Date.now() - startedAt;
		console.log('[STORYCARD_MOTION_PROMPT_CREATED]', {
			storyCardId: body.storyCard.id,
			model,
			latencyMs,
			outputChars: raw.length,
			referenceImages: inlineReferences.length,
		});
		return json({ motionPrompt, conversationSummary, model, provider: configured.provider, latencyMs, usage: { outputChars: raw.length, estimated: true }, timestamp: new Date().toISOString() });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[STORYCARD_MOTION_PROMPT_ERROR]', { message, model });
		return json({ message }, { status: 502 });
	}
};
