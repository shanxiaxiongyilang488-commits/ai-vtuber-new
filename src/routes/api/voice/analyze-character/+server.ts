import { json, type RequestHandler } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import {
	geminiFetchErrorMessage,
	geminiGenerateContentUrl,
	geminiParseJsonResponse,
	geminiUsageFromResponse,
	getGeminiTextModelConfig,
} from '$lib/server/geminiText';
import { VOICE_PROFILE_SCHEMA, normalizeVoiceProfile, normalizeVoiceThought } from '$lib/server/voiceProfile';
import { readVoiceUsage, recordVoiceUsage } from '$lib/server/voiceUsage';
import type { VoiceAnalyzeResponse } from '$lib/voiceDesign';

/**
 * キャラクター画像 → Voice Profile (声の仮説) 生成。
 * Vision対応Gemini (既存 geminiText 経路) を使用。APIキーはサーバー側のみ。
 */

const SYSTEM_PROMPT = [
	'You are Character Voice Design v1, a voice director for anime and game characters.',
	'You receive one character image (and optionally a character name and setting text).',
	'Imagine this character actually speaking in scenes of an anime or game: casual dialogue, emotional moments, and everyday conversation.',
	'From that imagined performance, estimate a voice hypothesis: pitch, weight, transparency, brightness, softness, breathiness, consonant clarity, speaking rate, emotional range, artificial/mechanical precision, approachability, and composure.',
	'Do not simply classify age or gender from appearance, and do not over-assert from visual features alone. The profile is a hypothesis of a voice that would SUIT the character, not a fact.',
	'All numeric fields must be between 0.0 and 1.0.',
	'apparent_age / pitch / texture / speaking_style are short Japanese descriptions.',
	'analysis_reason is a short Japanese explanation of the overall judgement, safe to show to end users.',
	'voiceThought is 2-5 short Japanese sentences summarizing your judgement trade-offs, each safe to show to end users. Never include hidden reasoning or chain of thought. Example style: 「白髪と柔らかい表情から透明感を優先しました。」「機械的要素はありますが親しみやすさを損なわないよう人工感は弱めに設定しました。」',
	'Return exactly one JSON object. No markdown and no extra text.',
].join('\n');

// コスト推定用のトークン単価 (USD / 1M tokens)。コード固定を避け env で上書き可能。
function geminiPricing(env: Record<string, string | undefined>) {
	const input = Number(env.GEMINI_VISION_INPUT_USD_PER_MTOK ?? '');
	const output = Number(env.GEMINI_VISION_OUTPUT_USD_PER_MTOK ?? '');
	return {
		inputUsdPerMTok: Number.isFinite(input) && input > 0 ? input : 0.3,
		outputUsdPerMTok: Number.isFinite(output) && output > 0 ? output : 2.5,
	};
}

function parseDataUrl(value: string): { mimeType: string; base64: string } | null {
	const match = /^data:([^;,]+);base64,(.+)$/.exec(value);
	return match ? { mimeType: match[1], base64: match[2] } : null;
}

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}

	const imageDataUrl = typeof body.image === 'string' ? body.image.trim() : '';
	const image = parseDataUrl(imageDataUrl);
	if (!image) return json({ message: 'image (data URL) is required' }, { status: 400 });
	if (image.base64.length > 12_000_000) return json({ message: 'image is too large' }, { status: 400 });

	const characterName = typeof body.characterName === 'string' ? body.characterName.trim().slice(0, 80) : '';
	const characterSetting = typeof body.characterSetting === 'string' ? body.characterSetting.trim().slice(0, 2000) : '';

	const apiKey = await getProviderKey('gemini');
	if (!apiKey) return json({ message: 'Gemini API key is not configured' }, { status: 503 });

	const { env } = await import('$env/dynamic/private');
	const pricing = geminiPricing(env);
	const modelConfig = await getGeminiTextModelConfig();
	const userText = JSON.stringify({
		characterName: characterName || null,
		characterSetting: characterSetting || null,
		task: 'Analyze the attached character image and produce the voice profile JSON.',
	});
	const startedAt = Date.now();
	try {
		const response = await fetch(geminiGenerateContentUrl(modelConfig.model, apiKey), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
				contents: [{
					role: 'user',
					parts: [
						{ inline_data: { mime_type: image.mimeType, data: image.base64 } },
						{ text: userText },
					],
				}],
				generationConfig: {
					temperature: 0.3,
					maxOutputTokens: 4096,
					responseMimeType: 'application/json',
					responseSchema: VOICE_PROFILE_SCHEMA,
				},
			}),
		});
		if (!response.ok) {
			const errorText = await response.text().catch(() => `HTTP ${response.status}`);
			throw new Error(`Voice Analyze HTTP ${response.status}: ${errorText.slice(0, 240)}`);
		}
		const data = await response.json();
		const { parsed } = geminiParseJsonResponse(data, {
			label: 'Voice Analyze',
			logTag: '[VOICE_ANALYZE_RAW]',
			context: { model: modelConfig.model },
		});
		const usage = geminiUsageFromResponse(data);
		const estimatedCostUsd = Number((
			((usage.inputTokens ?? 0) / 1_000_000) * pricing.inputUsdPerMTok
			+ ((usage.outputTokens ?? 0) / 1_000_000) * pricing.outputUsdPerMTok
		).toFixed(6));
		const profile = normalizeVoiceProfile(parsed);
		const voiceThought = normalizeVoiceThought((parsed as Record<string, unknown>)?.voiceThought);
		const usageSummary = await recordVoiceUsage({
			provider: 'gemini',
			model: modelConfig.model,
			candidates: 0,
			previewChars: 0,
			estimatedCostUsd,
		});
		console.log('[VOICE_ANALYZE_PROFILE]', { characterName, profile, voiceThought, latencyMs: Date.now() - startedAt });
		const result: VoiceAnalyzeResponse = {
			profile,
			voiceThought,
			provider: 'gemini',
			model: modelConfig.model,
			estimatedCostUsd,
			usage: usageSummary,
			timestamp: new Date().toISOString(),
		};
		return json(result);
	} catch (error) {
		const message = geminiFetchErrorMessage(error);
		console.warn('[VOICE_ANALYZE_ERROR]', { message, model: modelConfig.model, latencyMs: Date.now() - startedAt });
		return json({ message }, { status: 502 });
	}
};

/** 接続テスト用: 現在のプロバイダ構成を返す (キーは返さない)。 */
export const GET: RequestHandler = async () => {
	const usage = await readVoiceUsage();
	return json({ usage, timestamp: new Date().toISOString() });
};
