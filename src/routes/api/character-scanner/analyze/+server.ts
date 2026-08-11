import { json, type RequestHandler } from '@sveltejs/kit';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chatGemini, GEMINI_DEFAULT_MODEL } from '$lib/providers/gemini';
import { chatOpenAI, OPENAI_ORCHESTRATION_MODEL } from '$lib/providers/openai';
import { parseAiJson } from '$lib/server/aiJson';
import { readSettings } from '$lib/server/settings';
import type { ChatImageInput } from '$lib/providers/types';

type ScannerProvider = 'GPT-5.5' | 'Gemini';
type FrameCandidate = { frame: string; reason: string };

const SAFE_ID = /^scanner_[a-zA-Z0-9-]+$/;
const SAFE_FRAME = /^frame_\d{3}\.jpg$/;
const SYSTEM_PROMPT = [
	'You are Character Scanner, a visual reference archivist.',
	'Analyze the supplied one-second interval video frames as views of the same character.',
	'Select useful reference frames, not attractive shots. Prefer clear, unobstructed evidence.',
	'Classify frame filenames into faceFrames, fullBodyFrames, earFrames, and tailFrames.',
	'Extract stable visible character features and a structured Visual Memory candidate.',
	'Do not evaluate video quality, motion quality, storytelling, acting, camera work, or give impressions/advice.',
	'Do not infer personality, biography, hidden construction, or audio content.',
	'Return JSON only. No markdown.',
	'Schema: {"faceFrames":[{"frame":"frame_001.jpg","reason":""}],"fullBodyFrames":[],"earFrames":[],"tailFrames":[],"features":[],"visualMemoryCandidate":{"characterName":"","criticalFeatures":[],"appearance":{"hair":"","face":"","eyes":"","body":"","outfit":"","armor":"","colorPalette":[]},"equipment":{"headUnit":"","earUnit":"","tailUnit":"","connectionPort":"","mechanicalParts":[],"accessories":[]},"rules":{"mustKeep":[],"avoid":[]}}}',
].join('\n');

function text(value: unknown, limit = 1200): string {
	return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function list(value: unknown, limit = 80): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((item) => text(item, 400)).filter(Boolean))].slice(0, limit);
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function frameCandidates(value: unknown, allowed: Set<string>): FrameCandidate[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item): FrameCandidate[] => {
		if (typeof item === 'string' && allowed.has(item)) return [{ frame: item, reason: '' }];
		const source = record(item);
		const frame = text(source.frame, 100);
		return allowed.has(frame) ? [{ frame, reason: text(source.reason, 500) }] : [];
	}).filter((item, index, all) => all.findIndex((candidate) => candidate.frame === item.frame) === index).slice(0, 20);
}

function normalizeResult(value: unknown, frameNames: string[]) {
	const data = record(value);
	const candidate = record(data.visualMemoryCandidate);
	const appearance = record(candidate.appearance);
	const equipment = record(candidate.equipment);
	const rules = record(candidate.rules);
	const allowed = new Set(frameNames);
	return {
		faceFrames: frameCandidates(data.faceFrames, allowed),
		fullBodyFrames: frameCandidates(data.fullBodyFrames, allowed),
		earFrames: frameCandidates(data.earFrames, allowed),
		tailFrames: frameCandidates(data.tailFrames, allowed),
		features: list(data.features),
		visualMemoryCandidate: {
			characterName: text(candidate.characterName, 200),
			criticalFeatures: list(candidate.criticalFeatures, 40),
			appearance: {
				hair: text(appearance.hair), face: text(appearance.face), eyes: text(appearance.eyes),
				body: text(appearance.body), outfit: text(appearance.outfit), armor: text(appearance.armor),
				colorPalette: list(appearance.colorPalette, 30),
			},
			equipment: {
				headUnit: text(equipment.headUnit), earUnit: text(equipment.earUnit), tailUnit: text(equipment.tailUnit),
				connectionPort: text(equipment.connectionPort), mechanicalParts: list(equipment.mechanicalParts, 50),
				accessories: list(equipment.accessories, 30),
			},
			rules: { mustKeep: list(rules.mustKeep, 50), avoid: list(rules.avoid, 50) },
		},
	};
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json() as Record<string, unknown>;
		const videoId = text(body.videoId, 200);
		const provider: ScannerProvider = body.provider === 'Gemini' ? 'Gemini' : 'GPT-5.5';
		if (!SAFE_ID.test(videoId)) return json({ message: 'Invalid Character Scanner videoId' }, { status: 400 });
		const frameDir = path.join(process.cwd(), 'data', 'video_frames', videoId);
		const frameNames = (await readdir(frameDir)).filter((name) => SAFE_FRAME.test(name)).sort().slice(0, 20);
		if (frameNames.length === 0) return json({ message: 'No extracted frames found' }, { status: 404 });
		const images: ChatImageInput[] = await Promise.all(frameNames.map(async (name) => ({
			dataUrl: `data:image/jpeg;base64,${(await readFile(path.join(frameDir, name))).toString('base64')}`,
			name,
		})));
		const settings = await readSettings();
		let raw = '';
		let model = '';
		if (provider === 'Gemini') {
			model = settings.gemini.model || GEMINI_DEFAULT_MODEL;
			// thinking/reasoningトークンもmaxTokensに含まれ得るため余裕を持たせる。
			raw = await chatGemini({ apiKey: settings.gemini.key, model, systemPrompt: SYSTEM_PROMPT, userMessage: JSON.stringify({ videoId, frameNames, intervalSeconds: 1 }), images, maxTokens: 4096 });
		} else {
			model = OPENAI_ORCHESTRATION_MODEL;
			raw = await chatOpenAI({ apiKey: settings.openai.key, model, systemPrompt: SYSTEM_PROMPT, userMessage: JSON.stringify({ videoId, frameNames, intervalSeconds: 1 }), images, maxTokens: 4096 });
		}
		const result = normalizeResult(parseAiJson(raw, {
			label: 'Character Scanner',
			logTag: '[CHARACTER_SCANNER_RAW]',
			context: { videoId, provider, model },
		}), frameNames);
		const output = { videoId, provider, model, frameCount: frameNames.length, ...result };
		const scanDir = path.join(process.cwd(), 'data', 'character_scanner', videoId);
		await writeFile(path.join(scanDir, 'visual-memory-candidate.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
		console.log('[CHARACTER_SCANNER_ANALYZED]', { videoId, provider, model, frameCount: frameNames.length, featureCount: result.features.length });
		return json(output);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[CHARACTER_SCANNER_ERROR]', error);
		return json({ message }, { status: 502 });
	}
};
