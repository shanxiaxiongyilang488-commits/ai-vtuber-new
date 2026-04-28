import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const VALID_SIZES = ['1024x1024', '1792x1024', '1024x1792'] as const;
type ImageSize = typeof VALID_SIZES[number];

const FAL_SIZE_MAP: Record<ImageSize, string> = {
  '1024x1024': 'square_hd',
  '1792x1024': 'landscape_16_9',
  '1024x1792': 'portrait_16_9',
};

interface GenerateRequest {
  prompt: string;
  size?:  ImageSize;
  model?: 'fast' | 'gptimage2' | 'fal';
}

export const POST: RequestHandler = async ({ request }) => {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const { prompt, size = '1024x1024', model = 'fast' } = body;

  if (!prompt?.trim()) throw error(400, 'prompt is required');
  if (!VALID_SIZES.includes(size)) throw error(400, `size must be one of: ${VALID_SIZES.join(', ')}`);

  // ── FAL (Flux Schnell) ────────────────────────────────────────────────────
  if (model === 'fal') {
    if (!env.FAL_KEY) throw error(500, 'FAL_KEY が未設定');
    console.log(`[studio/generate] model=fal/flux-schnell prompt="${prompt.slice(0, 60)}..." size=${size}`);

    const falRes = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt:               prompt.trim(),
        image_size:           FAL_SIZE_MAP[size],
        num_inference_steps:  4,
        num_images:           1,
      }),
    });
    if (!falRes.ok) {
      const msg = await falRes.text().catch(() => `HTTP ${falRes.status}`);
      console.error('[studio/generate] fal error:', msg.slice(0, 300));
      throw error(falRes.status >= 500 ? 500 : 400, `FAL API error: ${msg.slice(0, 200)}`);
    }
    const falData = await falRes.json();
    const imageUrl: string = falData?.images?.[0]?.url;
    if (!imageUrl) throw error(500, 'No image URL returned from FAL');

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw error(500, 'Failed to fetch FAL image');
    const imgBuf = await imgRes.arrayBuffer();
    const b64    = Buffer.from(imgBuf).toString('base64');
    const mime   = imgRes.headers.get('content-type') ?? 'image/jpeg';
    console.log(`[studio/generate] fal ok (b64 ${b64.length} chars)`);
    return json({ url: `data:${mime};base64,${b64}`, revisedPrompt: null });
  }

  // ── OpenAI (DALL-E 3 / GPT Image 1) ──────────────────────────────────────
  if (!env.OPENAI_API_KEY) throw error(500, 'OPENAI_API_KEY が未設定');

  const useGptImage2 = model === 'gptimage2';
  const modelName    = useGptImage2 ? 'gpt-image-1' : 'dall-e-3';
  console.log(`[studio/generate] model=${modelName} prompt="${prompt.slice(0, 60)}..." size=${size}`);

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  let result;
  try {
    if (useGptImage2) {
      result = await client.images.generate({
        model:   'gpt-image-1',
        prompt:  prompt.trim(),
        n:       1,
        size,
        quality: 'auto',
      });
    } else {
      result = await client.images.generate({
        model:           'dall-e-3',
        prompt:          prompt.trim(),
        n:               1,
        size,
        response_format: 'b64_json',
        quality:         'standard',
      });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[studio/generate] openai error:', msg);
    if (msg.includes('content_policy')) throw error(400, 'コンテンツポリシー違反: プロンプトを修正してください。');
    if (msg.includes('billing') || msg.includes('quota')) throw error(429, 'OpenAI クォータ超過。しばらく待ってから再試行してください。');
    throw error(500, `OpenAI API error: ${msg}`);
  }

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw error(500, 'No image data returned from OpenAI');

  const revisedPrompt = useGptImage2 ? null : (result.data?.[0]?.revised_prompt ?? null);
  console.log(`[studio/generate] ok (b64 ${b64.length} chars)`);

  return json({
    url: `data:image/png;base64,${b64}`,
    revisedPrompt,
  });
};
