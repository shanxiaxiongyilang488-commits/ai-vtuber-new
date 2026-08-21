import { json, type RequestHandler } from '@sveltejs/kit';
import { chatGeminiWithMeta, GEMINI_DEFAULT_MODEL } from '$lib/providers/gemini';
import { parseAiJson } from '$lib/server/aiJson';
import { getMemoryCharacter } from '$lib/server/characterMemory';
import { getVisualMemoryRecord } from '$lib/server/visualMemoryStore';
import { readSettings } from '$lib/server/settings';
import type { ChatImageInput } from '$lib/providers/types';

/** overall score がこの値以上なら表示許可（PASS/FAIL ではなく score 方式）。 */
const VALIDATION_SCORE_THRESHOLD = 80;

function text(value: unknown, limit = 4000): string {
	return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

async function imageInput(source: string, requestUrl: URL): Promise<ChatImageInput> {
	if (source.startsWith('data:image/')) return { dataUrl: source, name: 'generated-image' };
	const imageUrl = new URL(source, requestUrl);
	const response = await fetch(imageUrl);
	if (!response.ok) throw new Error(`Generated image fetch failed: HTTP ${response.status}`);
	const mime = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
	if (!mime.startsWith('image/')) throw new Error('Generated image response is not an image');
	const buffer = Buffer.from(await response.arrayBuffer());
	if (buffer.length === 0 || buffer.length > 15 * 1024 * 1024) throw new Error('Generated image is empty or too large');
	return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, name: imageUrl.pathname.split('/').at(-1) || 'generated-image' };
}

export const POST: RequestHandler = async ({ request, url }) => {
	let raw = '';
	let finishReason: string | null = null;
	try {
		const body = await request.json() as Record<string, unknown>;
		const characterId = text(body.characterId, 200).toLowerCase();
		const source = text(body.image, 10000);
		if (!characterId || !source) return json({ message: 'characterId and image are required' }, { status: 400 });
		const character = getMemoryCharacter(characterId);
		const memory = getVisualMemoryRecord(characterId, character.visualMemory).visualMemory;
		const criticalFeatures = memory.criticalFeatures;
		if (criticalFeatures.length === 0) return json({ valid: true, score: 100, threshold: VALIDATION_SCORE_THRESHOLD, present: [], missing: [], model: null });

		const settings = await readSettings();
		const model = settings.gemini.model || GEMINI_DEFAULT_MODEL;
		const result = await chatGeminiWithMeta({
			apiKey: settings.gemini.key,
			model,
			systemPrompt: [
				'You are Visual Memory Image Validator.',
				'Inspect the generated image and verify every required critical feature from visible pixels only.',
				'A feature is present only when it is clearly visible and consistent with the supplied Visual Memory description.',
				'Do not assume hidden, cropped, ambiguous, or merely prompted features are present.',
				'Return JSON only: {"features":{"FEATURE_ID":true}} with one boolean per critical feature.',
				'Do not include evidence, explanations, markdown, or any text outside the single JSON object.',
			].join('\n'),
			userMessage: JSON.stringify({ criticalFeatures, visualMemory: memory }),
			images: [await imageInput(source, url)],
			// gemini-3.5-flash は thinking トークンも maxTokens(=maxOutputTokens) に含まれるため余裕を持たせる。
			maxTokens: 4096,
		});
		raw = result.text;
		finishReason = result.finishReason;
		if (finishReason === 'MAX_TOKENS') {
			throw new Error(`Visual Memory Validator response was truncated (MAX_TOKENS, ${raw.length} chars)`);
		}
		const parsed = parseAiJson(raw, {
			label: 'Visual Memory Validator',
			logTag: '[VISUAL_MEMORY_VALIDATOR_RAW]',
			context: { characterId, model, finishReason },
		}) as Record<string, unknown>;
		const features = parsed.features && typeof parsed.features === 'object' ? parsed.features as Record<string, unknown> : {};
		const evidence = parsed.evidence && typeof parsed.evidence === 'object' ? parsed.evidence as Record<string, unknown> : {};
		const present = criticalFeatures.filter((feature) => features[feature] === true);
		const missing = criticalFeatures.filter((feature) => features[feature] !== true);
		const score = Math.round((present.length / criticalFeatures.length) * 100);
		console.log('[VISUAL_MEMORY_IMAGE_VALIDATION]', { characterId, model, score, valid: score >= VALIDATION_SCORE_THRESHOLD, present, missing });
		return json({ valid: score >= VALIDATION_SCORE_THRESHOLD, score, threshold: VALIDATION_SCORE_THRESHOLD, present, missing, evidence, model, provider: 'gemini' });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[VISUAL_MEMORY_IMAGE_VALIDATION_ERROR]', {
			message,
			finishReason,
			rawLength: raw.length,
			rawHead: raw.slice(0, 500),
		});
		return json({ message }, { status: 502 });
	}
};
