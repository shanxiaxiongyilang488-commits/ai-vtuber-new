import { json, type RequestHandler } from '@sveltejs/kit';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SHIRO_OFFICIAL_REFERENCE_PACK } from '$lib/config/characterReferenceImages';
import { runCharacterAi } from '$lib/server/characterAiRouter';
import type { StoryCard, StoryCardCut, StoryCardReference, StoryCardReferenceKind } from '$lib/storycard/storycard';
import { normalizeCharacterVisualMemory } from '$lib/types/characterVisualMemory';
import type { CharacterVisualMemory } from '$lib/types/characterVisualMemory';
import { getMemoryCharacter } from '$lib/server/characterMemory';

const STORYCARD_DIR = path.join(process.cwd(), 'data', 'storycards');
const DEFAULT_STORYCARD_DURATION = 15;
const MIN_FIXED_15_CUTS = 5;

const STORYCARD_SCHEMA = {
	type: 'OBJECT',
	properties: {
		title: { type: 'STRING' },
		duration: { type: 'NUMBER' },
		cuts: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					id: { type: 'STRING' },
					start: { type: 'STRING' },
					end: { type: 'STRING' },
					duration: { type: 'NUMBER' },
					title: { type: 'STRING' },
					description: { type: 'STRING' },
					camera: { type: 'STRING' },
					motion: { type: 'STRING' },
					dialogue: { type: 'STRING' },
					requiredUnits: { type: 'ARRAY', items: { type: 'STRING' } },
				},
				required: ['id', 'start', 'end', 'duration', 'title', 'description', 'camera', 'motion', 'dialogue', 'requiredUnits'],
			},
		},
	},
	required: ['title', 'duration', 'cuts'],
};

const SYSTEM_PROMPT = [
	'You are a storyboard editor. Create an image-storyboard StoryCard, not a proposal document.',
	'Output exactly one JSON object containing only title, duration, and cuts.',
	'Do not output an overview, synopsis, theme, goal, worldbuilding, commentary, dialogue script, Markdown, or prose outside cuts.',
	'cuts is the primary output and must describe the visible storyboard progression.',
	'Every scene must contain exactly: id, start, end, duration, title, description, camera, motion, dialogue, requiredUnits.',
	'Use SCENE01, SCENE02, SCENE03... as scene ids.',
	'Use start and end as timecodes such as 0:00 and 0:04.',
	'description must be a concise visible shot description including action and framing.',
	'requiredUnits must list every character, equipment unit, prop, or registered reference required in that cut.',
	'For a 15-second short, create exactly five sequential scenes unless the user explicitly requests a different scene count.',
	'Derive all five scenes from the supplied character references and animation sheet in reading order.',
	'camera must state shot size, viewpoint, and camera movement.',
	'motion must state the concrete character or object movement visible in the scene.',
	'dialogue must contain the spoken line visible or intended for that scene; use an empty string only when the source clearly has no dialogue.',
	'When the user requests entering a state, show the transition into that state as an action; for example, a request to sit in a chair must show sitting down rather than beginning already seated.',
	'Use literal, concise functional cut titles based on the requested action. Use the task name for the main action, include the checked object in a confirmation title such as モニター確認, and title the concluding cut 終了. Avoid decorative or dramatic title wording.',
	'For UI title consistency, title the act of sitting down exactly 着席, and title checking a terminal display exactly モニター確認.',
	'Treat negative requirements as hard constraints. A forbidden action, view, framing, or event must not appear in any cut, including as setup or transition.',
	'JSON ONLY: Return exactly one valid JSON object matching the schema.',
	'Do not use Markdown, code fences, comments, preambles, or any text outside the JSON object.',
	'Use duration in seconds. cuts must be ordered production cuts.',
	'When the user specifies 15 seconds as fixed, duration must be 15 and cuts must contain at least four items.',
	'Never classify a StoryCard as conversation animation. This endpoint only creates video StoryCards.',
].join('\n');

type StoryCardRequestMessage = {
	role: 'user' | 'assistant' | 'system';
	text: string;
	timestamp?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value.trim() : fallback;
}

function numericValue(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function shortText(value: unknown, fallback = '', limit = 80): string {
	const text = stringValue(value, fallback).replace(/\s+/g, ' ').trim();
	return text.length > limit ? text.slice(0, limit) : text;
}

function normalizeMessage(value: unknown): StoryCardRequestMessage | null {
	const data = asRecord(value);
	const role = data.role === 'assistant' || data.role === 'system' ? data.role : data.role === 'user' ? 'user' : null;
	const text = stringValue(data.text || data.content);
	if (!role || !text) return null;
	return {
		role,
		text: text.slice(0, 3000),
		timestamp: stringValue(data.timestamp) || undefined,
	};
}

function normalizeImages(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			if (typeof item === 'string') return item.trim();
			const data = asRecord(item);
			return stringValue(data.dataUrl || data.url || data.imageUrl || data.src);
		})
		.filter(Boolean)
		.slice(0, 10);
}

type JsonParseDiagnostics = {
	stage: string;
	position: number | null;
	line: number | null;
	column: number | null;
	excerpt: string;
	exception: string;
};

class StoryCardJsonParseError extends Error {
	diagnostics: JsonParseDiagnostics;

	constructor(diagnostics: JsonParseDiagnostics) {
		super('StoryCard response did not contain a valid JSON object');
		this.name = 'StoryCardJsonParseError';
		this.diagnostics = diagnostics;
	}
}

function jsonParseDiagnostics(input: string, error: unknown, stage: string): JsonParseDiagnostics {
	const exception = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
	const positionMatch = /(?:at position|position)\s+(\d+)/iu.exec(exception);
	const lineColumnMatch = /line\s+(\d+)\s+column\s+(\d+)/iu.exec(exception);
	const position = positionMatch
		? Number(positionMatch[1])
		: /unexpected end/iu.test(exception)
			? input.length
			: null;
	let line = lineColumnMatch ? Number(lineColumnMatch[1]) : null;
	let column = lineColumnMatch ? Number(lineColumnMatch[2]) : null;
	if (position !== null && (!line || !column)) {
		const before = input.slice(0, position);
		line = before.split('\n').length;
		column = position - before.lastIndexOf('\n');
	}
	const excerptCenter = position ?? Math.min(input.length, 120);
	const excerptStart = Math.max(0, excerptCenter - 80);
	const excerptEnd = Math.min(input.length, excerptCenter + 80);
	return {
		stage,
		position,
		line,
		column,
		excerpt: input.slice(excerptStart, excerptEnd),
		exception,
	};
}

function extractJson(text: string): unknown {
	const trimmed = text.trim();
	let latestFailure: JsonParseDiagnostics | null = null;
	const tryParse = (candidate: string, stage: string): { success: true; value: unknown } | { success: false } => {
		console.log('[STORYCARD_JSON_PARSE_INPUT]', { stage, value: candidate });
		try {
			return { success: true, value: JSON.parse(candidate) };
		} catch (error) {
			console.error('[STORYCARD_JSON_PARSE_ERROR]', {
				stage,
				value: candidate,
				error,
				errorMessage: error instanceof Error ? error.message : String(error),
			});
			latestFailure = jsonParseDiagnostics(candidate, error, stage);
			return { success: false };
		}
	};

	const direct = tryParse(trimmed, 'full-response');
	if (direct.success) return direct.value;

	const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)];
	for (const [index, match] of fenced.entries()) {
		const result = tryParse(match[1].trim(), `markdown-fence-${index + 1}`);
		if (result.success) return result.value;
	}

	const candidates = [
		...fenced.map((match) => match[1]),
		trimmed,
	];
	for (const candidate of candidates) {
		let start = -1;
		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let index = 0; index < candidate.length; index += 1) {
			const character = candidate[index];
			if (inString) {
				if (escaped) escaped = false;
				else if (character === '\\') escaped = true;
				else if (character === '"') inString = false;
				continue;
			}
			if (character === '"') {
				inString = true;
				continue;
			}
			if (character === '{') {
				if (depth === 0) start = index;
				depth += 1;
			} else if (character === '}' && depth > 0) {
				depth -= 1;
				if (depth === 0 && start >= 0) {
					const result = tryParse(candidate.slice(start, index + 1), 'balanced-object');
					if (result.success) return result.value;
					start = -1;
				}
			}
		}
	}
	throw new StoryCardJsonParseError(latestFailure ?? {
		stage: 'object-extraction',
		position: null,
		line: null,
		column: null,
		excerpt: trimmed.slice(0, 160),
		exception: 'No JSON object was found in the GPT-5.5 response.',
	});
}

function safeFilePart(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48) || 'storycard';
}

function storyCardId(): string {
	return `storycard-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function requestText(conversation: StoryCardRequestMessage[], analysis: unknown): string {
	return [
		...conversation.map((message) => message.text),
		typeof analysis === 'string' ? analysis : '',
	].join('\n');
}

function hasFixed15SecondInstruction(sourceText: string): boolean {
	if (/(?:15\s*秒|15\s*(?:seconds?|s)).{0,16}(?:禁止|不可|使わない|not allowed)/iu.test(sourceText)) return false;
	return /(?:15\s*秒|15\s*(?:seconds?|s))(?:\s*(?:固定|厳守|必須))?/iu.test(sourceText);
}

function timecode(seconds: number): string {
	const safe = Math.max(0, Math.round(seconds));
	return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function visualMemoryContext(memory: CharacterVisualMemory): string {
	const appearance = [
		memory.characterName,
		memory.appearance.hair,
		memory.appearance.face,
		memory.appearance.eyes,
		memory.appearance.body,
		memory.appearance.outfit,
		memory.appearance.armor,
		...memory.appearance.colorPalette,
	].filter(Boolean);
	const equipment = [memory.equipment.headUnit, memory.equipment.earUnit, memory.equipment.tailUnit, memory.equipment.connectionPort, ...memory.equipment.mechanicalParts, ...memory.equipment.accessories].filter(Boolean);
	const motion = [memory.motion.walking, memory.motion.tailMotion, memory.motion.earMotion].filter(Boolean);
	const section = (title: string, items: string[]) => items.length > 0
		? `${title}:\n${items.map((item) => `- ${item}`).join('\n')}`
		: '';
	return [
		'VISUAL MEMORY — AUTHORITATIVE CHARACTER CONTINUITY CONTEXT',
		'Always apply this context even when the user does not repeat these details.',
		section('criticalFeatures', memory.criticalFeatures),
		section('appearance', appearance),
		section('equipment', equipment),
		section('motion', motion),
		section('rules.mustKeep', memory.rules.mustKeep),
		section('rules.avoid', memory.rules.avoid),
		section('references', memory.references),
		section('referenceImages', memory.referenceImages.map((reference) => `${reference.official ? '[OFFICIAL] ' : ''}${reference.category}: ${reference.fileName} (${reference.url})${reference.tags.length ? ` tags=${reference.tags.join(',')}` : ''}`)),
		'Official Reference images are the highest-priority visual authority. Prefer them over attachments and other registered references whenever visual details conflict.',
		'Every equipment unit and mustKeep item must be represented in requiredUnits for each cut containing the character.',
		'Never violate rules.avoid.',
	].filter(Boolean).join('\n\n');
}

function equipmentUnitId(value: string): string {
	return value.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/u)?.[0] ?? value.trim();
}

function applyVisualMemory(card: StoryCard, memory: CharacterVisualMemory): StoryCard {
	const continuityUnits = [...new Set([
		...memory.criticalFeatures,
		equipmentUnitId(memory.equipment.headUnit),
		equipmentUnitId(memory.equipment.earUnit),
		equipmentUnitId(memory.equipment.tailUnit),
		equipmentUnitId(memory.equipment.connectionPort),
		...memory.equipment.mechanicalParts,
		...memory.rules.mustKeep,
	].map((item) => item.trim()).filter(Boolean))];
	if (continuityUnits.length === 0) return card;
	return {
		...card,
		cuts: card.cuts.map((cut) => ({
			...cut,
			requiredUnits: [...new Set([...(cut.requiredUnits ?? cut.characters ?? []), ...continuityUnits])],
			characters: [...new Set([...(cut.characters ?? cut.requiredUnits ?? []), ...continuityUnits])],
		})),
	};
}

function enforceStoryCardRequest(card: StoryCard, sourceText: string): StoryCard {
	const fixed15 = card.duration === 15 || hasFixed15SecondInstruction(sourceText);
	const normalizedType: StoryCard['type'] = 'video_storycard';
	if (!fixed15) return { ...card, type: normalizedType };

	const sourceCuts = card.cuts.length > 0 ? card.cuts : [{
		id: 'cut-1',
		order: 1,
		title: 'シーン',
		summary: card.summary || card.title,
	}];
	const cutCount = Math.max(MIN_FIXED_15_CUTS, sourceCuts.length);
	const expandedCuts = Array.from({ length: cutCount }, (_, index) => {
		const sourceIndex = Math.min(sourceCuts.length - 1, Math.floor(index * sourceCuts.length / cutCount));
		const source = sourceCuts[sourceIndex];
		return {
			...source,
			id: cutCount === sourceCuts.length ? source.id : `${source.id}-part-${index + 1}`,
			order: index + 1,
		};
	});
	let cursor = 0;
	let cuts = expandedCuts.map((cut, index) => {
		const end = Math.round((index + 1) * 15 / cutCount);
		const duration = end - cursor;
		const normalized = {
			...cut,
			id: `SCENE${String(index + 1).padStart(2, '0')}`,
			start: timecode(cursor),
			end: timecode(end),
			description: cut.description || cut.summary,
			requiredUnits: cut.requiredUnits ?? cut.characters ?? [],
			time: `${timecode(cursor)}-${timecode(end)}`,
			duration,
		};
		cursor = end;
		return normalized;
	});
	const requiresFullBodyWalk = /全身/u.test(sourceText) && /歩|歩行/u.test(sourceText);
	const requiresSideWalk = /横歩|横.{0,12}(?:歩|歩行)|左から右/u.test(sourceText);
	const requiresRearView = /後ろ姿|背面/u.test(sourceText);
	const requiresTailCheck = /TAIL[_ -]?UNIT[_ -]?0?2.{0,16}(?:確認|見せ|可視)|(?:確認|見せ|可視).{0,16}TAIL[_ -]?UNIT[_ -]?0?2/iu.test(sourceText);
	if (cuts.length >= 4 && requiresFullBodyWalk && requiresSideWalk && requiresRearView && requiresTailCheck) {
		const requiredTitles = ['全身歩行', '横歩き', '後ろ姿', 'TAIL_UNIT_02確認'];
		cuts = cuts.map((cut, index) => index < requiredTitles.length ? { ...cut, title: requiredTitles[index] } : cut);
	}
	const conversationType = /conversation[\s_-]*animation|会話アニメ(?:ーション)?/giu;
	const sanitizeConversationType = (value: string, fallback: string) => {
		const sanitized = value.replace(conversationType, '').replace(/\s{2,}/g, ' ').trim();
		return sanitized || fallback;
	};
	return {
		...card,
		type: normalizedType,
		title: sanitizeConversationType(card.title, '15秒動画StoryCard'),
		summary: sanitizeConversationType(card.summary, '15秒動画StoryCard'),
		duration: 15,
		theme: sanitizeConversationType(card.theme, 'ショートアニメ'),
		style: sanitizeConversationType(card.style, ''),
		cuts,
	};
}

function fallbackStoryCard(conversation: StoryCardRequestMessage[], analysis: unknown, defaultCharacterName = '添付資料のキャラクター'): StoryCard {
	const now = new Date().toISOString();
	const sourceText = requestText(conversation, analysis);
	const characterName = /Character:\s*([^\r\n]+)/iu.exec(sourceText)?.[1]?.trim() || defaultCharacterName;
	const requestedDuration = Number(/(\d{1,3})\s*(?:秒|s(?:ec(?:onds?)?)?)/iu.exec(sourceText)?.[1] || 15);
	const duration = Number.isFinite(requestedDuration) ? Math.max(4, Math.min(120, requestedDuration)) : 15;
	const boundaries = duration === 15
		? [0, 3, 6, 9, 12, 15]
		: [0, Math.round(duration * 0.2), Math.round(duration * 0.4), Math.round(duration * 0.6), Math.round(duration * 0.8), duration];
	const cutDefinitions = [
		{ title: '全身歩行', description: '全身が画面に入る構図で歩く。', requiredUnits: [characterName] },
		{ title: '横歩き', description: '横から全身を捉え、歩行を見せる。', requiredUnits: [characterName] },
		{ title: '後ろ姿', description: '背後から全身の歩行を捉える。', requiredUnits: [characterName] },
		{ title: 'TAIL_UNIT_02確認', description: 'TAIL_UNIT_02が見える構図で動きを確認する。', requiredUnits: [characterName, 'TAIL_UNIT_02'] },
		{ title: 'Conclusion', description: 'Settle the character motion and camera to conclude the sequence.', requiredUnits: [characterName] },
	];
	const cuts: StoryCardCut[] = cutDefinitions.map((definition, index) => ({
		id: `SCENE${String(index + 1).padStart(2, '0')}`,
		order: index + 1,
		start: timecode(boundaries[index]),
		end: timecode(boundaries[index + 1]),
		time: `${timecode(boundaries[index])}-${timecode(boundaries[index + 1])}`,
		title: definition.title,
		description: definition.description,
		requiredUnits: definition.requiredUnits,
		summary: definition.description,
		characters: definition.requiredUnits,
		action: definition.description,
		motion: definition.description,
		camera: '',
		duration: boundaries[index + 1] - boundaries[index],
		references: [],
	}));
	return {
		id: storyCardId(),
		type: 'video_storycard',
		title: `${characterName} ${duration}秒ショートアニメ`,
		summary: `${characterName}の${duration}秒ショートアニメ`,
		theme: 'ショートアニメ',
		goal: '',
		characters: [{ name: characterName }],
		references: [],
		location: '',
		style: '',
		emotion: '',
		duration,
		cuts,
		createdAt: now,
		updatedAt: now,
	};
}

function normalizeReference(value: unknown, index: number): StoryCardReference {
	const data = asRecord(value);
	const rawKind = stringValue(data.kind, 'other');
	const kinds: StoryCardReferenceKind[] = ['image', 'video', 'audio', 'text', 'memory', 'character', 'other'];
	return {
		id: stringValue(data.id) || `reference-${index + 1}`,
		kind: kinds.includes(rawKind as StoryCardReferenceKind) ? rawKind as StoryCardReferenceKind : 'other',
		title: stringValue(data.title) || undefined,
		url: stringValue(data.url) || undefined,
		summary: stringValue(data.summary) || undefined,
		tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean).slice(0, 12) : [],
	};
}

function timecodeSeconds(value: string): number | null {
	const match = /^(?:(\d+):)?(\d{1,2})(?:\.(\d+))?$/u.exec(value.trim());
	if (!match) return null;
	const minutes = match[1] ? Number(match[1]) : 0;
	const seconds = Number(match[2]);
	const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
	return minutes * 60 + seconds + fraction;
}

function normalizeCut(value: unknown, index: number): StoryCardCut {
	const data = asRecord(value);
	const legacyTime = stringValue(data.time);
	const [legacyStart = '', legacyEnd = ''] = legacyTime.split(/\s*(?:-|〜|~|→)\s*/u, 2);
	const start = shortText(data.start, legacyStart, 16) || '0:00';
	const end = shortText(data.end, legacyEnd, 16) || start;
	const requiredUnits = Array.isArray(data.requiredUnits)
		? data.requiredUnits.filter((item): item is string => typeof item === 'string').map((item) => shortText(item, '', 48)).filter(Boolean).slice(0, 16)
		: Array.isArray(data.characters)
			? data.characters.filter((item): item is string => typeof item === 'string').map((item) => shortText(item, '', 48)).filter(Boolean).slice(0, 16)
			: [];
	const description = shortText(data.description || data.summary || data.action || data.visual, `Cut ${index + 1}`, 180);
	const action = shortText(data.action || data.description || data.visual || data.summary, description, 180);
	const emotion = shortText(data.emotion, '', 32);
	const camera = shortText(data.camera, '', 40);
	const parsedStart = timecodeSeconds(start);
	const parsedEnd = timecodeSeconds(end);
	const inferredDuration = parsedStart !== null && parsedEnd !== null && parsedEnd >= parsedStart ? parsedEnd - parsedStart : 0;
	return {
		id: stringValue(data.id) || `SCENE${String(index + 1).padStart(2, '0')}`,
		order: numericValue(data.order, index + 1),
		start,
		end,
		description,
		requiredUnits,
		time: `${start}-${end}`,
		title: shortText(data.title, '', 28) || undefined,
		summary: description,
		visual: shortText(data.visual, '', 48) || undefined,
		characters: requiredUnits,
		action: action || undefined,
		motion: shortText(data.motion || data.action, action, 180) || undefined,
		dialogue: shortText(data.dialogue, '', 180),
		camera: camera || undefined,
		emotion: emotion || undefined,
		duration: numericValue(data.duration) || inferredDuration || undefined,
		references: Array.isArray(data.references) ? data.references.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [],
	};
}

function normalizeStoryCard(value: unknown): StoryCard {
	const data = asRecord(value);
	const now = new Date().toISOString();
	const title = stringValue(data.title, 'Untitled StoryCard');
	const cuts = Array.isArray(data.cuts) ? data.cuts.map(normalizeCut) : [];
	if (cuts.length === 0) {
		throw new Error('StoryCard must contain structured scenes; summary-only responses are not accepted');
	}
	return {
		id: stringValue(data.id) || storyCardId(),
		type: 'video_storycard',
		isFallback: typeof data.isFallback === 'boolean' ? data.isFallback : undefined,
		sourceModel: stringValue(data.sourceModel) || undefined,
		parseSuccess: typeof data.parseSuccess === 'boolean' ? data.parseSuccess : undefined,
		title,
		summary: shortText(data.summary, title, 90),
		theme: shortText(data.theme, '', 48),
		goal: '',
		characters: Array.isArray(data.characters)
			? data.characters.map((item) => {
				const character = asRecord(item);
				return {
					id: stringValue(character.id) || undefined,
					name: stringValue(character.name || item, 'Character'),
					role: stringValue(character.role) || undefined,
					description: stringValue(character.description) || undefined,
				};
			}).filter((character) => character.name)
			: [],
		references: Array.isArray(data.references) ? data.references.map(normalizeReference) : [],
		location: '',
		style: '',
		emotion: '',
		duration: Math.max(0, numericValue(data.duration, DEFAULT_STORYCARD_DURATION)),
		cuts,
		createdAt: stringValue(data.createdAt) || now,
		updatedAt: stringValue(data.updatedAt) || now,
	};
}

function storyboardJson(card: StoryCard) {
	return {
		title: card.title,
		duration: card.duration,
		cuts: card.cuts.map((cut, index) => ({
			id: cut.id || `SCENE${String(index + 1).padStart(2, '0')}`,
			start: cut.start || cut.time?.split(/\s*(?:-|〜|~|→)\s*/u, 2)[0] || '0:00',
			end: cut.end || cut.time?.split(/\s*(?:-|〜|~|→)\s*/u, 2)[1] || '0:00',
			title: cut.title || `Cut ${index + 1}`,
			description: cut.description || cut.summary,
			duration: cut.duration ?? 0,
			camera: cut.camera ?? '',
			motion: cut.motion ?? cut.action ?? cut.description ?? cut.summary,
			dialogue: cut.dialogue ?? '',
			requiredUnits: cut.requiredUnits ?? cut.characters ?? [],
		})),
	};
}

export const POST: RequestHandler = async ({ request }) => {
	console.log('[API_STORYCARD_ENTER]');
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch (error) {
		console.error('[API_STORYCARD_EXCEPTION]', error, error instanceof Error ? error.stack : undefined);
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}

	let sourceModel = 'unknown';
	const startedAt = Date.now();
	try {
		console.log('[API_STORYCARD_START]');
	const conversation = Array.isArray(body.conversation)
		? body.conversation.map(normalizeMessage).filter((message): message is StoryCardRequestMessage => Boolean(message)).slice(-40)
		: [];
	const images = normalizeImages(body.images);
	const characterId = stringValue(body.characterId);
	const requestedCharacterName = stringValue(body.characterName);
	const attachmentPriorityMode = body.attachmentPriorityMode === true;
	const preferAttachedReferences = body.preferAttachedReferences === true || attachmentPriorityMode;
	const characterMemory = body.characterMemory ?? null;
	const attachmentCount = typeof body.attachmentCount === 'number' && Number.isFinite(body.attachmentCount)
		? Math.max(0, Math.floor(body.attachmentCount))
		: 0;
	const attachmentSummary = body.attachmentSummary ?? null;
	let visualMemory = normalizeCharacterVisualMemory(attachmentPriorityMode ? undefined : body.visualMemory);
	let selectedCharacterName = requestedCharacterName;
	if (characterId && !attachmentPriorityMode) {
		try {
			const memoryCharacter = getMemoryCharacter(characterId);
			selectedCharacterName = memoryCharacter.name;
			visualMemory = memoryCharacter.visualMemory;
		} catch (error) {
			console.warn('[VISUAL_MEMORY_LOAD_FAILED]', {
				characterId,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	const visualContext = attachmentPriorityMode ? '' : visualMemoryContext(visualMemory);
	console.log('[VISUAL_MEMORY_LOADED]', {
		characterId,
		attachmentPriorityMode,
		visualMemoryPassedToStoryCard: !attachmentPriorityMode,
		visualMemorySize: attachmentPriorityMode ? 0 : JSON.stringify(visualMemory).length,
		mustKeepCount: attachmentPriorityMode ? 0 : visualMemory.rules.mustKeep.length,
	});
	const analysis = typeof body.analysis === 'string' ? body.analysis.trim().slice(0, 6000) : body.analysis ?? null;
	const sourceRequestText = requestText(conversation, analysis);
	const requestReferences = Array.isArray(body.references)
		? body.references.flatMap((value): Array<{ id: string; title: string; url: string; source: string }> => {
			if (!value || typeof value !== 'object') return [];
			const item = value as Record<string, unknown>;
			const id = typeof item.id === 'string' ? item.id.trim() : '';
			const url = typeof item.url === 'string' ? item.url.trim() : '';
			if (!id || !url || url.startsWith('data:')) return [];
			return [{
				id: id.slice(0, 160),
				title: typeof item.title === 'string' ? item.title.trim().slice(0, 160) : id.slice(0, 160),
				url: url.slice(0, 2000),
				source: typeof item.source === 'string' ? item.source.trim().slice(0, 80) : 'registered',
			}];
		}).slice(0, 10)
		: [];
	const effectiveRequestReferences = attachmentPriorityMode
		? requestReferences.filter((reference) => reference.source === 'attachment')
		: requestReferences;
	const visualMemoryReferences = visualMemory.referenceImages.map((reference) => ({
		id: reference.id,
		title: `${reference.category} / ${reference.fileName}`,
		url: reference.url,
		source: reference.official ? 'official-visual-memory' : 'visual-memory',
	}));
	const visualMemoryOfficialReferences = visualMemoryReferences.filter((reference) => reference.source === 'official-visual-memory');
	const visualMemoryStandardReferences = visualMemoryReferences.filter((reference) => reference.source === 'visual-memory');
	const presetOfficialReferences = characterId.toLowerCase() === 'shiro'
		? SHIRO_OFFICIAL_REFERENCE_PACK.map((reference, index) => ({
			id: `shiro-official-${reference.role}`,
			title: `SHIRO OFFICIAL REF ${String(index + 1).padStart(2, '0')} ${reference.role.toUpperCase()}`,
			url: reference.image,
			source: 'official-pack',
		}))
		: [];
	const registeredReferences = [
		...(preferAttachedReferences ? effectiveRequestReferences : visualMemoryOfficialReferences),
		...(preferAttachedReferences ? [] : presetOfficialReferences),
		...(preferAttachedReferences ? [] : visualMemoryStandardReferences),
		...(preferAttachedReferences ? [] : effectiveRequestReferences),
	]
		.filter((reference, index, all) => all.findIndex((candidate) => candidate.id === reference.id || candidate.url === reference.url) === index)
		.slice(0, 10);
	console.log('[STORYCARD_CHARACTER_CONTEXT]', {
		characterId: characterId || null,
		characterName: selectedCharacterName || null,
		storyCardCharacter: preferAttachedReferences ? 'attached-reference-character' : selectedCharacterName || null,
		selectedCharacter: { id: characterId || null, name: selectedCharacterName || null },
		preferAttachedReferences,
		requestReferenceIds: effectiveRequestReferences.map((reference) => reference.id),
	});
	const storyCardInput = {
		characterName: selectedCharacterName || requestedCharacterName || null,
		characterMemory,
		visualMemory: attachmentPriorityMode ? null : visualMemory,
		attachmentCount,
		attachmentSummary,
	};
	console.log('[storyCardInput]', storyCardInput);
	console.log('[STORYCARD_ATTACHMENT_PRIORITY_MODE]', {
		attachmentPriorityMode,
		visualMemoryPassedToStoryCard: !attachmentPriorityMode,
	});

	if (conversation.length === 0 && !analysis && images.length === 0) {
		return json({ message: 'conversation, images, or analysis is required' }, { status: 400 });
	}

	const prompt = JSON.stringify({
		conversation,
		analysis,
		characterMemory,
		attachmentPriorityMode,
		attachmentCount,
		attachmentSummary,
		visualMemory: attachmentPriorityMode ? undefined : preferAttachedReferences ? {
			instruction: 'The selected chat character is voice/persona context only. The attachments define the visual protagonist.',
			data: null,
		} : {
			instruction: 'Treat this Visual Memory as authoritative character continuity context. Apply it even when the user did not repeat its details.',
			data: visualMemory,
		},
		registeredReferences,
		referencePriorityPolicy: preferAttachedReferences
			? 'Attachments are authoritative and exclusively define the visual protagonist.'
			: 'Entries with source=official-visual-memory are authoritative and must be used before official-pack, visual-memory, attachments, or other registered references.',
		imageCount: images.length,
		imageAnalysisPolicy: 'Images are analyzed separately by Gemini. Use only supplied textual analysis and reference metadata.',
	});
		console.log('[API_STORYCARD_MODEL_CALL]');
		const configured = await runCharacterAi({
			characterId,
			role: 'storyCard',
			systemPrompt: `${SYSTEM_PROMPT}\n\n${attachmentPriorityMode ? 'ATTACHMENT PRIORITY MODE: Attached character references and animation sheets exclusively define the visual protagonist. Character Visual Memory is intentionally unavailable and must not be inferred or substituted.' : preferAttachedReferences ? 'Attached character references and animation sheets define the visual protagonist. Do not substitute the selected chat character or its preset appearance.' : visualContext}\n\nThe response must conform to this JSON schema: ${JSON.stringify(STORYCARD_SCHEMA)}`,
			userMessage: prompt,
			maxTokens: 8192,
		});
		sourceModel = configured.model;
		const raw = configured.text.trim();
		console.log('[STORYCARD_RAW_RESPONSE_BEFORE_PARSE]', raw);
		console.log('[API_STORYCARD_RESPONSE]', { provider: configured.provider, model: sourceModel, responseLength: raw.length });
		console.log('[STORYCARD_MODEL_RESPONSE_FULL]', raw);
		let fallbackReason = '';
		let failureDetails: {
			code: 'MODEL_RESPONSE_EMPTY' | 'JSON_PARSE_ERROR';
			label: 'Model Response Empty' | 'JSON Parse Error';
			message: string;
			parse: JsonParseDiagnostics | null;
		} | null = null;
		let parsedResponse: unknown;
		let generatedCard: StoryCard | null = null;
		try {
			if (!raw.trim()) {
				failureDetails = {
					code: 'MODEL_RESPONSE_EMPTY',
					label: 'Model Response Empty',
					message: 'GPT-5.5 returned an empty StoryCard response.',
					parse: null,
				};
				throw new Error(failureDetails.message);
			}
			parsedResponse = extractJson(raw);
		} catch (parseError) {
			if (!failureDetails) {
				const diagnostics = parseError instanceof StoryCardJsonParseError
					? parseError.diagnostics
					: jsonParseDiagnostics(raw, parseError, 'normalize-response');
				failureDetails = {
					code: 'JSON_PARSE_ERROR',
					label: 'JSON Parse Error',
					message: diagnostics.exception,
					parse: diagnostics,
				};
			}
			fallbackReason = failureDetails.message;
			generatedCard = fallbackStoryCard(
				conversation,
				analysis,
				preferAttachedReferences ? '添付資料のキャラクター' : selectedCharacterName || 'キャラクター',
			);
			console.warn('[STORYCARD_PARSE_FAILURE]', {
				modelRawResponse: raw,
				parseFailureLocation: failureDetails.parse ? {
					stage: failureDetails.parse.stage,
					position: failureDetails.parse.position,
					line: failureDetails.parse.line,
					column: failureDetails.parse.column,
					excerpt: failureDetails.parse.excerpt,
				} : null,
				jsonParseException: failureDetails.parse?.exception ?? failureDetails.message,
				fallbackTriggered: true,
				sourceModel,
				responseLength: raw.length,
			});
		}
		if (!generatedCard) generatedCard = normalizeStoryCard(parsedResponse);
		generatedCard = enforceStoryCardRequest(generatedCard, sourceRequestText);
		if (!preferAttachedReferences) generatedCard = applyVisualMemory(generatedCard, visualMemory);
		console.log('[STORYCARD_JSON_PARSED]', {
			parseSuccess: !fallbackReason,
			storyCardId: generatedCard.id,
			duration: generatedCard.duration,
			cutCount: generatedCard.cuts.length,
			type: generatedCard.type,
		});
		console.log('[STORYCARD_REQUEST_CONSTRAINTS]', {
			fixed15: hasFixed15SecondInstruction(sourceRequestText),
			duration: generatedCard.duration,
			cutCount: generatedCard.cuts.length,
			type: generatedCard.type,
		});
		const parseSuccess = !fallbackReason;
		const isFallback = !parseSuccess;
		console.log('[STORYCARD_GENERATION_SOURCE]', {
			isFallback,
			sourceModel,
			parseSuccess,
			responseLength: raw.length,
		});
		const selectedReferenceIds = new Set([
			...generatedCard.references.map((reference) => reference.id),
			...generatedCard.cuts.flatMap((cut) => cut.references ?? []),
		]);
		const selectedReferenceUrls = new Set(generatedCard.references.map((reference) => reference.url).filter(Boolean));
		const resolvedReferences = registeredReferences.filter((reference) => (
			reference.source === 'official-visual-memory'
			|| reference.source === 'official-pack'
			|| reference.source === 'character-preset'
			|| reference.source === 'character-registry'
			|| reference.source === 'attachment'
			|| selectedReferenceIds.has(reference.id)
			|| selectedReferenceUrls.has(reference.url)
		)).map((reference) => ({
			id: reference.id,
			kind: 'image' as const,
			title: reference.title,
			url: reference.url,
			tags: [reference.source, selectedReferenceIds.has(reference.id) ? 'selected' : 'registered'],
		}));
		const resolvedIds = new Set(resolvedReferences.map((reference) => reference.id));
		const card: StoryCard = {
			...generatedCard,
			isFallback,
			sourceModel,
			parseSuccess,
			...(failureDetails ? {
				generationError: {
					stage: 'storycard_json_parse' as const,
					message: '',
					rawResponse: raw.slice(0, 7000),
					rawResponseLength: raw.length,
					rawResponseTruncated: raw.length > 7000,
					motionPromptGenerationStarted: false,
					preservedMotionPrompt: false,
				},
			} : {}),
			references: [
				...resolvedReferences,
				...generatedCard.references.filter((reference) => !resolvedIds.has(reference.id)),
			].slice(0, 10),
		};
		console.log('[CURRENT_STORYCARD_JSON]', JSON.stringify(card, null, 2));
		await mkdir(STORYCARD_DIR, { recursive: true });
		const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeFilePart(card.title)}.json`;
		const filePath = path.join(STORYCARD_DIR, fileName);
		const savedStoryboard = storyboardJson(card);
		await writeFile(filePath, `${JSON.stringify(savedStoryboard, null, 2)}\n`, 'utf-8');

		const latencyMs = Date.now() - startedAt;
		console.log('[STORYCARD_CREATED]', {
			id: card.id,
			title: card.title,
			fileName,
			model: sourceModel,
			latencyMs,
			inputChars: SYSTEM_PROMPT.length + prompt.length,
			outputChars: raw.length,
			imageMetadataCount: images.length,
		});

		return json({
			storyCard: card,
			storyboard: savedStoryboard,
			fallback: isFallback,
			isFallback,
			sourceModel,
			parseSuccess,
			warning: fallbackReason ? 'StoryCard生成に失敗しました。フォールバックStoryCardを生成しました。' : undefined,
			failure: failureDetails,
			rawResponse: isFallback ? raw : undefined,
			fileName,
			savedTo: `data/storycards/${fileName}`,
			model: sourceModel,
			latencyMs,
			usage: { inputChars: SYSTEM_PROMPT.length + prompt.length, outputChars: raw.length, estimated: true },
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error('[API_STORYCARD_EXCEPTION]', error, error instanceof Error ? error.stack : undefined);
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[STORYCARD_ERROR]', {
			message,
			model: sourceModel,
			latencyMs: Date.now() - startedAt,
		});
		return json({ message, model: sourceModel }, { status: 502 });
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}

	try {
		const normalizedCard = normalizeStoryCard(body.storyCard ?? body);
		const saveInstruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 4000) : '';
		const card = normalizedCard.duration === 15
			? enforceStoryCardRequest(normalizedCard, saveInstruction || '15秒固定')
			: normalizedCard;
		const savedCard: StoryCard = {
			...card,
			updatedAt: new Date().toISOString(),
		};
		await mkdir(STORYCARD_DIR, { recursive: true });
		const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeFilePart(savedCard.title)}.json`;
		const filePath = path.join(STORYCARD_DIR, fileName);
		const savedStoryboard = storyboardJson(savedCard);
		await writeFile(filePath, `${JSON.stringify(savedStoryboard, null, 2)}\n`, 'utf-8');
		console.log('[STORYCARD_JSON_SAVED]', {
			id: savedCard.id,
			title: savedCard.title,
			fileName,
			cuts: savedCard.cuts.length,
			duration: savedCard.duration,
			type: savedCard.type,
		});
		return json({
			ok: true,
			storyCard: savedCard,
			storyboard: savedStoryboard,
			fileName,
			savedTo: `data/storycards/${fileName}`,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return json({ message }, { status: 400 });
	}
};
