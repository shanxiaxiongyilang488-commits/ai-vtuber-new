import { json, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getProviderKey } from '$lib/server/settings';
import {
	geminiFetchErrorMessage,
	geminiGenerateContentUrl,
	geminiParseJsonResponse,
	geminiUsageFromResponse,
	getGeminiTextModelConfig,
} from '$lib/server/geminiText';
import type { ActionCandidate } from '$lib/memoryReview';
import type {
	ThoughtObservationMemoryHint,
	ThoughtObservationRequest,
	ThoughtObservationResponse,
	ThoughtObservationStatus,
} from '$lib/thoughtObservation';

const ACTION_CANDIDATE_ACTIONS = new Set([
	'WEB_SEARCH', 'IMAGE', 'VIDEO', 'VIDEO_EDIT', 'VOICE', 'MANGA', 'YAML', 'MEMORY_LOOKUP', 'NONE',
]);

const OBSERVATION_STATUSES = new Set<ThoughtObservationStatus>(['thinking', 'waiting', 'uncertain', 'ready_to_act']);

const THOUGHT_OBSERVATION_SCHEMA = {
	type: 'OBJECT',
	properties: {
		currentFocus: { type: 'STRING' },
		observation: { type: 'STRING' },
		conflict: { type: 'STRING' },
		memoryReference: { type: 'STRING' },
		actionCandidate: {
			type: 'OBJECT',
			properties: {
				needAction: { type: 'BOOLEAN' },
				suggestedAction: { type: 'STRING' },
				confidence: { type: 'NUMBER' },
				reason: { type: 'STRING' },
				query: { type: 'STRING' },
			},
			required: ['needAction', 'suggestedAction', 'confidence', 'reason'],
		},
		emotionalState: {
			type: 'OBJECT',
			properties: {
				label: { type: 'STRING' },
				intensity: { type: 'NUMBER' },
			},
			required: ['label', 'intensity'],
		},
		status: { type: 'STRING' },
	},
	required: ['currentFocus', 'observation', 'actionCandidate', 'emotionalState', 'status'],
};

const SYSTEM_PROMPT = [
	'You are Thought Observation Mode v1 for Character Memory Chat.',
	'The character does NOT reply to the user in this mode. Instead, produce an observable summary of the character\'s current thought state as structured data for an observation panel.',
	'This is OBSERVABLE THOUGHT STATE, never RAW INTERNAL REASONING. Do not output hidden reasoning, step-by-step deliberation, or chain of thought. Every field must be a short, already-summarized statement.',
	'Write all text fields in natural Japanese from the character\'s perspective (first-person nuance is fine), concise and calm.',
	'currentFocus: what the character is paying attention to right now, one short phrase (max ~40 chars).',
	'observation: how the character received the user input and what it connects to, 1-3 short sentences.',
	'conflict: only when the character is genuinely torn between options, describe the two sides briefly. Otherwise omit or return an empty string.',
	'memoryReference: only when relevantMemories in the input contains a memory clearly related to the user input, return a very short label summarizing that memory (max ~40 chars). Never copy memory bodies verbatim, never enumerate memories, and never invent memories not present in the input. Return an empty string when nothing relates.',
	'actionCandidate: advisory structured data only, never an execution command. Decide by semantic understanding, never by keyword matching. Distinguish requests for fresh external information from historical chatter, and explicit generation requests from opinions or hypotheticals.',
	'Use WEB_SEARCH only when fresh or external web information would genuinely be required. Use MEMORY_LOOKUP when recalling prior conversations, creations, or stored experiences would be required. Use IMAGE, VIDEO, VIDEO_EDIT, VOICE, MANGA, or YAML only for a clear request to perform that action. Otherwise needAction=false and suggestedAction=NONE.',
	'query is a concise proposed search/lookup query, required for WEB_SEARCH or MEMORY_LOOKUP.',
	'emotionalState: the character\'s current emotional tint as a single English label (e.g. curious, calm, excited, worried) with intensity 0.0-1.0. Use the emotion input as a hint when present.',
	'status: exactly one of thinking, waiting, uncertain, ready_to_act. Use uncertain when conflict is non-empty, ready_to_act when needAction is true with confidence >= 0.85, waiting when nothing needs attention, thinking otherwise.',
	'Return exactly one JSON object. No markdown and no extra text.',
	'Schema: {"currentFocus":"","observation":"","conflict":"","memoryReference":"","actionCandidate":{"needAction":false,"suggestedAction":"NONE","confidence":0.0,"reason":"","query":""},"emotionalState":{"label":"","intensity":0.0},"status":"thinking"}',
].join('\n');

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function clamp01(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.min(1, Math.max(0, value))
		: 0;
}

function normalizeActionCandidate(value: unknown): ActionCandidate {
	const data = asRecord(value);
	const suggestedAction = typeof data.suggestedAction === 'string' && ACTION_CANDIDATE_ACTIONS.has(data.suggestedAction)
		? data.suggestedAction as ActionCandidate['suggestedAction']
		: 'NONE';
	const needAction = data.needAction === true && suggestedAction !== 'NONE';
	const query = typeof data.query === 'string' ? data.query.trim().slice(0, 500) : '';
	return {
		needAction,
		suggestedAction: needAction ? suggestedAction : 'NONE',
		confidence: clamp01(data.confidence),
		reason: typeof data.reason === 'string' ? data.reason.trim().slice(0, 500) : '',
		...(query ? { query } : {}),
	};
}

function normalizeMemoryHint(value: unknown): ThoughtObservationMemoryHint | null {
	const data = asRecord(value);
	const title = typeof data.title === 'string' ? data.title.trim().slice(0, 120) : '';
	const summary = typeof data.summary === 'string' ? data.summary.trim().slice(0, 240) : '';
	return title || summary ? { title, summary } : null;
}

function normalizeObservation(
	value: unknown,
	inputChars: number,
	outputChars: number,
	model: string,
	latencyMs: number,
	usage: ReturnType<typeof geminiUsageFromResponse>,
): ThoughtObservationResponse {
	const data = asRecord(value);
	const conflict = typeof data.conflict === 'string' ? data.conflict.trim().slice(0, 400) : '';
	const memoryReference = typeof data.memoryReference === 'string' ? data.memoryReference.trim().slice(0, 120) : '';
	const emotionalStateData = asRecord(data.emotionalState);
	const emotionalLabel = typeof emotionalStateData.label === 'string' ? emotionalStateData.label.trim().slice(0, 40) : '';
	const actionCandidate = normalizeActionCandidate(data.actionCandidate);
	const rawStatus = typeof data.status === 'string' && OBSERVATION_STATUSES.has(data.status as ThoughtObservationStatus)
		? data.status as ThoughtObservationStatus
		: 'thinking';
	// status整合ルール: 高confidenceの行動候補があれば ready_to_act、迷いがあれば uncertain を優先する。
	const status: ThoughtObservationStatus = actionCandidate.needAction && actionCandidate.confidence >= 0.85
		? 'ready_to_act'
		: conflict && rawStatus === 'thinking'
			? 'uncertain'
			: rawStatus;
	return {
		id: randomUUID(),
		currentFocus: typeof data.currentFocus === 'string' && data.currentFocus.trim()
			? data.currentFocus.trim().slice(0, 120)
			: '（観察対象を特定できませんでした）',
		observation: typeof data.observation === 'string' && data.observation.trim()
			? data.observation.trim().slice(0, 800)
			: 'ユーザー入力を受け取りましたが、観察内容を生成できませんでした。',
		...(conflict ? { conflict } : {}),
		...(memoryReference ? { memoryReference } : {}),
		actionCandidate,
		...(emotionalLabel ? { emotionalState: { label: emotionalLabel, intensity: clamp01(emotionalStateData.intensity) } } : {}),
		status,
		cost: {
			provider: 'gemini',
			model,
			inputChars,
			outputChars,
			latencyMs,
			inputTokens: usage.inputTokens,
			outputTokens: usage.outputTokens,
			totalTokens: usage.totalTokens,
			estimated: true,
		},
		timestamp: new Date().toISOString(),
	};
}

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}

	const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
	const userMessage = typeof body.userMessage === 'string' ? body.userMessage.trim().slice(0, 3000) : '';
	if (!characterId) return json({ message: 'characterId is required' }, { status: 400 });
	if (!userMessage) return json({ message: 'userMessage is required' }, { status: 400 });

	const input: ThoughtObservationRequest = {
		characterId,
		characterName: typeof body.characterName === 'string' ? body.characterName.trim().slice(0, 80) : undefined,
		userMessage,
		recentMessages: Array.isArray(body.recentMessages)
			? body.recentMessages
				.map((message) => asRecord(message))
				.filter((message) => ['user', 'assistant', 'system'].includes(String(message.role)) && typeof message.text === 'string')
				.map((message) => ({ role: message.role as 'user' | 'assistant' | 'system', text: (message.text as string).slice(0, 500) }))
				.slice(-8)
			: [],
		relevantMemories: Array.isArray(body.relevantMemories)
			? body.relevantMemories.map(normalizeMemoryHint).filter((hint): hint is ThoughtObservationMemoryHint => Boolean(hint)).slice(0, 5)
			: [],
		emotion: typeof body.emotion === 'string' ? body.emotion.slice(0, 120) : undefined,
	};

	const apiKey = await getProviderKey('gemini');
	if (!apiKey) return json({ message: 'Gemini API key is not configured' }, { status: 503 });

	const prompt = JSON.stringify(input);
	const modelConfig = await getGeminiTextModelConfig();
	const startedAt = Date.now();
	try {
		const response = await fetch(
			geminiGenerateContentUrl(modelConfig.model, apiKey),
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
					contents: [{ role: 'user', parts: [{ text: prompt }] }],
					generationConfig: {
						temperature: 0.2,
						// gemini-3.5-flash は thinking トークンも maxOutputTokens に含まれるため余裕を持たせる。
						maxOutputTokens: 4096,
						responseMimeType: 'application/json',
						responseSchema: THOUGHT_OBSERVATION_SCHEMA,
					},
				}),
			},
		);
		if (!response.ok) {
			const errorText = await response.text().catch(() => `HTTP ${response.status}`);
			throw new Error(`Thought Observation HTTP ${response.status}: ${errorText.slice(0, 240)}`);
		}
		const data = await response.json();
		const latencyMs = Date.now() - startedAt;
		const { parsed, raw } = geminiParseJsonResponse(data, {
			label: 'Thought Observation',
			logTag: '[THOUGHT_OBSERVATION_RAW]',
			context: { model: modelConfig.model },
		});
		const usage = geminiUsageFromResponse(data);
		const result = normalizeObservation(parsed, SYSTEM_PROMPT.length + prompt.length, raw.length, modelConfig.model, latencyMs, usage);
		console.log('[ThoughtObservation]', {
			characterId,
			currentFocus: result.currentFocus,
			status: result.status,
			conflict: result.conflict ?? '',
			memoryReference: result.memoryReference ?? '',
			actionCandidate: result.actionCandidate,
		});
		return json(result);
	} catch (error) {
		const message = geminiFetchErrorMessage(error);
		console.warn('[THOUGHT_OBSERVATION_ERROR]', {
			message,
			model: modelConfig.model,
			modelSource: modelConfig.source,
			latencyMs: Date.now() - startedAt,
		});
		return json({ message, model: modelConfig.model, modelSource: modelConfig.source }, { status: 502 });
	}
};
