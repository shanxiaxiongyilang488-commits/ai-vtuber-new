import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chatOpenAI, OPENAI_DEFAULT_MODEL } from '$lib/providers/openai';
import { parseAiJson } from '$lib/server/aiJson';
import { readSettings } from '$lib/server/settings';

type ImageCategory = 'character_reference' | 'world_setting' | 'background';
type ImageClassification = { index: number; category: ImageCategory; reason: string };

function parseAnimationAnalysis(text: string, imageCount: number): { classifications: ImageClassification[]; motionPrompt: string } {
  const parsed = parseAiJson(text, {
    label: 'Animation Chat analysis',
    logTag: '[ANIMATION_CHAT_RAW]',
    context: { provider: 'openai' },
  }) as { classifications?: unknown; motionPrompt?: unknown };
  if (!Array.isArray(parsed.classifications) || typeof parsed.motionPrompt !== 'string' || !parsed.motionPrompt.trim()) {
    throw new Error('Animation analysis returned an invalid JSON response.');
  }
  const classifications = parsed.classifications
    .filter((item): item is ImageClassification => (
      Boolean(item) && typeof item === 'object'
      && Number.isInteger((item as ImageClassification).index)
      && ['character_reference', 'world_setting', 'background'].includes((item as ImageClassification).category)
      && typeof (item as ImageClassification).reason === 'string'
    ));
  const indexes = new Set(classifications.map((item) => item.index));
  if (indexes.size !== imageCount || [...indexes].some((index) => index < 0 || index >= imageCount)) {
    throw new Error('Animation analysis must classify every uploaded image exactly once.');
  }
  return { classifications, motionPrompt: parsed.motionPrompt.trim() };
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json() as { instruction?: unknown; motionPrompt?: unknown; images?: unknown };
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  const suppliedMotionPrompt = typeof body.motionPrompt === 'string' ? body.motionPrompt.trim() : '';
  const imageUrls = Array.isArray(body.images)
    ? body.images.filter((value): value is string => typeof value === 'string' && value.startsWith('data:image/')).slice(0, 9)
    : [];
  if (!instruction) throw error(400, 'Animation instruction is required.');
  if (imageUrls.length === 0) throw error(400, 'Upload at least one image.');

  const settings = await readSettings();
  if (!settings.openai.key) throw error(500, 'OpenAI API key is required for AI Animation Chat image analysis.');

  const analysisText = await chatOpenAI({
    apiKey: settings.openai.key,
    model: settings.openai.model || OPENAI_DEFAULT_MODEL,
    images: imageUrls.map((dataUrl, index) => ({ dataUrl, name: `animation_reference_${index + 1}` })),
    // 推論系モデルではreasoningトークンもmax_tokensに含まれ得るため余裕を持たせる。
    maxTokens: 4096,
    systemPrompt: [
      'You are the AI Animation Chat visual director.',
      'Inspect every supplied image and classify each strictly from visible content.',
      'Generate a concise English Motion Prompt for a 5-second animation that follows the user instruction and preserves character identity.',
      'Return JSON only. No markdown.',
      'Schema: {"classifications":[{"index":0,"category":"character_reference|world_setting|background","reason":"short visible reason"}],"motionPrompt":"..."}',
    ].join('\n'),
    userMessage: `User animation instruction:\n${instruction}\n\n${suppliedMotionPrompt ? `Manual Motion Prompt (use this as the highest-priority movement direction):\n${suppliedMotionPrompt}` : 'Create the Motion Prompt from the instruction and images.'}`,
  });

  const analysis = parseAnimationAnalysis(analysisText, imageUrls.length);
  console.log('[AI_ANIMATION_CHAT_ANALYZED]', {
    imageCount: imageUrls.length,
    classificationCount: analysis.classifications.length,
    manualMotionPrompt: Boolean(suppliedMotionPrompt),
  });
  return json({
    classifications: analysis.classifications,
    motionPrompt: suppliedMotionPrompt || analysis.motionPrompt,
  });
};
