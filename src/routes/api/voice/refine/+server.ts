import { json, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getProviderKey } from '$lib/server/settings';
import {
	geminiFetchErrorMessage,
	geminiGenerateContentUrl,
	geminiParseJsonResponse,
	getGeminiTextModelConfig,
} from '$lib/server/geminiText';
import { VOICE_PROFILE_SCHEMA, normalizeVoiceProfile, normalizeVoiceThought } from '$lib/server/voiceProfile';
import { getVoiceDesignProvider } from '$lib/server/voiceProviders/registry';
import { countPreviewChars, persistVoiceDesignAudio } from '$lib/server/voiceDesignAudio';
import { guardVoiceDesignGeneration } from '$lib/server/voiceDesignGuard';
import { estimateVoiceDesignCost } from '$lib/voiceDesignCost';
import { recordVoiceUsage } from '$lib/server/voiceUsage';
import type { CharacterVoiceCandidate, VoiceRefineResponse } from '$lib/voiceDesign';

/**
 * 選択した候補 + ユーザー修正指示 → Voice Profile更新 → 新プロンプト → 1音声再生成。
 * 例: 「もう少し落ち着いた声」「少し高く」「機械感を弱く」
 */

const REFINE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		...VOICE_PROFILE_SCHEMA.properties,
		designPrompt: { type: 'STRING' },
		reason: { type: 'STRING' },
	},
	required: [...VOICE_PROFILE_SCHEMA.required, 'designPrompt', 'reason'],
};

const REFINE_SYSTEM = [
	'You are Character Voice Design v1 refinement step.',
	'Input: current voice profile JSON, the selected candidate design prompt, and a Japanese user instruction (e.g. calmer, slightly higher, less mechanical, older).',
	'Apply the instruction as a minimal semantic adjustment: update only the profile fields the instruction affects, keeping the rest of the voice identity stable.',
	'All numeric fields must be between 0.0 and 1.0.',
	'Also produce designPrompt: one English voice description prompt (max 500 chars) for a cloud voice-design TTS, reflecting the UPDATED profile while keeping the same basic voice identity.',
	'reason is one short Japanese sentence, safe to show to end users, explaining what changed.',
	'voiceThought is 1-3 short user-safe Japanese sentences about the adjustment. Never include hidden reasoning or chain of thought.',
	'analysis_reason should be updated to reflect the refined judgement.',
	'Return exactly one JSON object matching the schema. No markdown.',
].join('\n');

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}

	const profile = normalizeVoiceProfile(body.profile);
	const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 500) : '';
	if (!instruction) return json({ message: 'instruction is required' }, { status: 400 });
	const selected = body.selectedCandidate && typeof body.selectedCandidate === 'object'
		? body.selectedCandidate as Partial<CharacterVoiceCandidate>
		: null;
	const baseDesignPrompt = typeof selected?.designPrompt === 'string' ? selected.designPrompt.slice(0, 2000) : '';
	const slot = typeof selected?.slot === 'string' && selected.slot ? selected.slot : 'A';
	const testPhrase = (typeof body.testPhrase === 'string' && body.testPhrase.trim()
		? body.testPhrase.trim()
		: typeof selected?.previewText === 'string' && selected.previewText.trim()
			? selected.previewText.trim()
			: 'こんにちは、私の声を聞いてください。今日はとてもいい天気ですね。').slice(0, 500);

	const apiKey = await getProviderKey('gemini');
	if (!apiKey) return json({ message: 'Gemini API key is not configured' }, { status: 503 });
	const provider = await getVoiceDesignProvider(typeof body.provider === 'string' ? body.provider : undefined);
	const connection = await provider.testConnection();
	if (!connection.ok) return json({ message: connection.message }, { status: 503 });

	// 🛡 生成前ガード: 再設計も新しいvoiceを1作成するため固定費を含めて判定する。
	const guard = await guardVoiceDesignGeneration(provider.getPricing(), countPreviewChars(testPhrase), 1);
	if (!guard.allowed) {
		console.warn('[VOICE_DESIGN_BLOCKED]', { reason: guard.message, estimate: guard.estimate, budget: guard.budget });
		return json({ message: guard.message, estimate: guard.estimate, budget: guard.budget, enabled: guard.enabled }, { status: guard.status });
	}

	const startedAt = Date.now();
	try {
		const modelConfig = await getGeminiTextModelConfig();
		const response = await fetch(geminiGenerateContentUrl(modelConfig.model, apiKey), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				system_instruction: { parts: [{ text: REFINE_SYSTEM }] },
				contents: [{
					role: 'user',
					parts: [{ text: JSON.stringify({ profile, selectedDesignPrompt: baseDesignPrompt, instruction }) }],
				}],
				generationConfig: {
					temperature: 0.3,
					maxOutputTokens: 4096,
					responseMimeType: 'application/json',
					responseSchema: REFINE_SCHEMA,
				},
			}),
		});
		if (!response.ok) {
			const errorText = await response.text().catch(() => `HTTP ${response.status}`);
			throw new Error(`Voice Refine HTTP ${response.status}: ${errorText.slice(0, 240)}`);
		}
		const data = await response.json();
		const { parsed } = geminiParseJsonResponse(data, {
			label: 'Voice Refine',
			logTag: '[VOICE_REFINE_RAW]',
			context: { model: modelConfig.model },
		});
		const parsedRecord = parsed as Record<string, unknown>;
		const updatedProfile = normalizeVoiceProfile(parsed);
		const designPrompt = typeof parsedRecord?.designPrompt === 'string' ? parsedRecord.designPrompt.trim().slice(0, 2000) : '';
		if (!designPrompt) throw new Error('Refine did not return a design prompt');
		const reason = typeof parsedRecord?.reason === 'string' ? parsedRecord.reason.trim().slice(0, 200) : '';
		const voiceThought = normalizeVoiceThought(parsedRecord?.voiceThought);

		const generation = await provider.generateVoice({ designPrompt, previewText: testPhrase });
		const audioUrl = await persistVoiceDesignAudio(generation.audioUrl);

		// 再設計は voice 1作成 = 固定費 perVoiceCreationUsd を必ず加算する。
		const costEstimate = estimateVoiceDesignCost(provider.getPricing(), countPreviewChars(testPhrase), 1);
		const previewChars = costEstimate.previewChars;
		const estimatedCostUsd = costEstimate.totalUsd;
		const usage = await recordVoiceUsage({
			provider: provider.getProviderName(),
			model: provider.getModelId(),
			candidates: 1,
			previewChars,
			estimatedCostUsd,
		});

		const candidate: CharacterVoiceCandidate = {
			id: randomUUID(),
			slot,
			direction: `再設計 (${instruction.slice(0, 40)})`,
			designPrompt,
			reason,
			audioUrl,
			...(generation.voiceId ? { voiceId: generation.voiceId } : {}),
			provider: provider.getProviderName(),
			model: provider.getModelId(),
			previewText: testPhrase,
			createdAt: new Date().toISOString(),
		};
		console.log('[VOICE_REFINE]', { instruction, slot, reason, estimatedCostUsd, latencyMs: Date.now() - startedAt });
		const result: VoiceRefineResponse = {
			profile: updatedProfile,
			candidate,
			voiceThought,
			estimatedCostUsd,
			usage,
			timestamp: new Date().toISOString(),
		};
		return json(result);
	} catch (error) {
		const message = geminiFetchErrorMessage(error);
		console.warn('[VOICE_REFINE_ERROR]', { message, latencyMs: Date.now() - startedAt });
		return json({ message }, { status: 502 });
	}
};
