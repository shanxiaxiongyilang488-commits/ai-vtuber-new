import { json, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getProviderKey } from '$lib/server/settings';
import {
	geminiFetchErrorMessage,
	geminiGenerateContentUrl,
	geminiParseJsonResponse,
	getGeminiTextModelConfig,
} from '$lib/server/geminiText';
import { normalizeVoiceProfile } from '$lib/server/voiceProfile';
import { getVoiceDesignProvider } from '$lib/server/voiceProviders/registry';
import { countPreviewChars, persistVoiceDesignAudio } from '$lib/server/voiceDesignAudio';
import { guardVoiceDesignGeneration } from '$lib/server/voiceDesignGuard';
import { estimateVoiceDesignCost } from '$lib/voiceDesignCost';
import { recordVoiceUsage } from '$lib/server/voiceUsage';
import type { CharacterVoiceCandidate, VoiceCandidatesResponse } from '$lib/voiceDesign';

/**
 * Voice Profile → 3方向のVoice Design Prompt → クラウドTTSで候補音声生成。
 * 候補はランダム変化ではなく、方向性 (A: 自然 / B: 世界観強調 / C: 親しみやすさ) を固定する。
 */

const DEFAULT_TEST_PHRASE = 'こんにちは、私の声を聞いてください。今日はとてもいい天気ですね。';
const MAX_CANDIDATES = 3;

const CANDIDATE_DIRECTIONS = [
	{ slot: 'A', direction: '画像から最も自然に推定される声' },
	{ slot: 'B', direction: 'キャラクター性・世界観・機械的要素を少し強調した声' },
	{ slot: 'C', direction: '親しみやすさ・感情表現・会話キャラクターとしての魅力を強調した声' },
];

const PROMPT_BUILDER_SCHEMA = {
	type: 'OBJECT',
	properties: {
		candidates: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					slot: { type: 'STRING' },
					designPrompt: { type: 'STRING' },
					reason: { type: 'STRING' },
				},
				required: ['slot', 'designPrompt', 'reason'],
			},
		},
	},
	required: ['candidates'],
};

const PROMPT_BUILDER_SYSTEM = [
	'You are a voice design prompt writer for a cloud voice-design TTS (MiniMax Voice Design).',
	'Input: a character voice profile JSON and a list of candidate directions.',
	'For each direction, write one English voice description prompt (max 500 chars) that a TTS voice designer can use directly.',
	'Describe: apparent age, pitch range, texture, brightness, softness, breathiness, articulation clarity, speaking rate, emotional expressiveness, and any mechanical/android precision, based on the profile.',
	'All candidates must keep the same basic voice identity (age, pitch range, core texture) from the profile; only shift emphasis according to each direction. Never produce random unrelated variations.',
	'reason is one short Japanese sentence, safe to show to end users, explaining what was emphasized for that candidate. Never include hidden reasoning or chain of thought.',
	'Return exactly one JSON object matching the schema. No markdown.',
].join('\n');

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}

	const profile = normalizeVoiceProfile(body.profile);
	if (!profile.analysis_reason && !profile.identity.texture) {
		return json({ message: 'profile is required (run analyze-character first)' }, { status: 400 });
	}
	const testPhrase = (typeof body.testPhrase === 'string' && body.testPhrase.trim()
		? body.testPhrase.trim()
		: DEFAULT_TEST_PHRASE).slice(0, 500);
	const count = Math.min(
		MAX_CANDIDATES,
		Math.max(1, typeof body.count === 'number' && Number.isFinite(body.count) ? Math.floor(body.count) : MAX_CANDIDATES),
	);
	const directions = CANDIDATE_DIRECTIONS.slice(0, count);

	const apiKey = await getProviderKey('gemini');
	if (!apiKey) return json({ message: 'Gemini API key is not configured' }, { status: 503 });
	const provider = await getVoiceDesignProvider(typeof body.provider === 'string' ? body.provider : undefined);
	const connection = await provider.testConnection();
	if (!connection.ok) return json({ message: connection.message }, { status: 503 });

	// 🛡 生成前ガード: 無効化スイッチ + 予算上限。ブロック時はGemini含め一切課金しない。
	const guard = await guardVoiceDesignGeneration(provider.getPricing(), countPreviewChars(testPhrase), directions.length);
	if (!guard.allowed) {
		console.warn('[VOICE_DESIGN_BLOCKED]', { reason: guard.message, estimate: guard.estimate, budget: guard.budget });
		return json({ message: guard.message, estimate: guard.estimate, budget: guard.budget, enabled: guard.enabled }, { status: guard.status });
	}

	const startedAt = Date.now();
	try {
		// 1) Voice Profile → 方向別 Voice Design Prompt (LLMによる意味変換)。
		const modelConfig = await getGeminiTextModelConfig();
		const builderResponse = await fetch(geminiGenerateContentUrl(modelConfig.model, apiKey), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				system_instruction: { parts: [{ text: PROMPT_BUILDER_SYSTEM }] },
				contents: [{ role: 'user', parts: [{ text: JSON.stringify({ profile, directions }) }] }],
				generationConfig: {
					temperature: 0.4,
					maxOutputTokens: 4096,
					responseMimeType: 'application/json',
					responseSchema: PROMPT_BUILDER_SCHEMA,
				},
			}),
		});
		if (!builderResponse.ok) {
			const errorText = await builderResponse.text().catch(() => `HTTP ${builderResponse.status}`);
			throw new Error(`Prompt builder HTTP ${builderResponse.status}: ${errorText.slice(0, 240)}`);
		}
		const builderData = await builderResponse.json();
		const { parsed } = geminiParseJsonResponse(builderData, {
			label: 'Voice Prompt Builder',
			logTag: '[VOICE_PROMPT_BUILDER_RAW]',
			context: { model: modelConfig.model },
		});
		const rawCandidates = Array.isArray(asRecord(parsed).candidates) ? asRecord(parsed).candidates as unknown[] : [];
		const prompts = directions.map((direction, index) => {
			const raw = asRecord(rawCandidates.find((item) => asRecord(item).slot === direction.slot) ?? rawCandidates[index]);
			const designPrompt = typeof raw.designPrompt === 'string' ? raw.designPrompt.trim().slice(0, 2000) : '';
			if (!designPrompt) throw new Error(`Voice design prompt missing for slot ${direction.slot}`);
			return {
				...direction,
				designPrompt,
				reason: typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 200) : '',
			};
		});

		// 2) クラウドTTSで各候補を生成 (並列)。
		const generated = await Promise.all(prompts.map(async (prompt) => {
			const result = await provider.generateVoice({ designPrompt: prompt.designPrompt, previewText: testPhrase });
			const audioUrl = await persistVoiceDesignAudio(result.audioUrl);
			const candidate: CharacterVoiceCandidate = {
				id: randomUUID(),
				slot: prompt.slot,
				direction: prompt.direction,
				designPrompt: prompt.designPrompt,
				reason: prompt.reason,
				audioUrl,
				...(result.voiceId ? { voiceId: result.voiceId } : {}),
				provider: provider.getProviderName(),
				model: provider.getModelId(),
				previewText: testPhrase,
				createdAt: new Date().toISOString(),
			};
			return candidate;
		}));

		// 3) コスト記録 (単価はadapterのpricingから取得。voice作成固定費を必ず含める)。
		const costEstimate = estimateVoiceDesignCost(provider.getPricing(), countPreviewChars(testPhrase), generated.length);
		const previewChars = costEstimate.previewChars;
		const estimatedCostUsd = costEstimate.totalUsd;
		const usage = await recordVoiceUsage({
			provider: provider.getProviderName(),
			model: provider.getModelId(),
			candidates: generated.length,
			previewChars,
			estimatedCostUsd,
		});

		console.log('[VOICE_CANDIDATES]', {
			count: generated.length,
			slots: generated.map((item) => item.slot),
			previewChars,
			estimatedCostUsd,
			latencyMs: Date.now() - startedAt,
		});
		const response: VoiceCandidatesResponse = {
			candidates: generated,
			estimatedCostUsd,
			usage,
			timestamp: new Date().toISOString(),
		};
		return json(response);
	} catch (error) {
		const message = geminiFetchErrorMessage(error);
		console.warn('[VOICE_CANDIDATES_ERROR]', { message, latencyMs: Date.now() - startedAt });
		return json({ message }, { status: 502 });
	}
};
