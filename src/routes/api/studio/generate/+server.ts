import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const VALID_SIZES = ['1024x1024', '1792x1024', '1024x1792'] as const;
type ImageSize = typeof VALID_SIZES[number];

interface GenerateRequest {
  prompt:    string;
  size?:     ImageSize;
  model?:    'gpt-image-2' | 'fal-fast' | 'fal-pro';
  refImage?: string;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const { prompt, size = '1024x1024', model = 'gpt-image-2', refImage } = body;

  if (!prompt?.trim()) throw error(400, 'prompt is required');
  if (!VALID_SIZES.includes(size)) throw error(400, `size must be one of: ${VALID_SIZES.join(', ')}`);

  console.log(`[studio/generate] model=${model} refImage=${refImage ? `YES(${refImage.length}chars)` : 'NO'} size=${size}`);

  // ── GPT Image 2 (OpenAI images.edit / generate) ───────────────────────────
  if (model === 'gpt-image-2') {
    if (!env.OPENAI_API_KEY) throw error(500, 'OPENAI_API_KEY が未設定');
    console.log(`[studio/generate] gpt-image-2 prompt="${prompt.slice(0, 60)}..."`);

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    let result;
    try {
      if (refImage) {
        const base64 = refImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');
        const file   = new File([buffer], 'reference.png', { type: 'image/png' });
        result = await openai.images.edit({
          model:  'gpt-image-1',
          image:  file,
          prompt: prompt.trim(),
          n:      1,
          size,
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await (openai.images.generate as any)({
          model:  'gpt-image-2',
          prompt: prompt.trim(),
          n:      1,
          size,
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
    console.log(`[studio/generate] gpt-image-2 ok (b64 ${b64.length} chars)`);
    return json({ url: `data:image/png;base64,${b64}`, revisedPrompt: null });
  }

  // ── FAL ───────────────────────────────────────────────────────────────────
  if (!env.FAL_KEY) throw error(500, 'FAL_KEY が未設定');

  const FAL_SIZE_MAP: Record<ImageSize, string> = {
    '1024x1024': 'square_hd',
    '1792x1024': 'landscape_16_9',
    '1024x1792': 'portrait_16_9',
  };

  // ── fal-fast (flux/dev) ───────────────────────────────────────────────────
  if (model === 'fal-fast') {
    console.log(`[studio/generate] fal-fast/flux-dev prompt="${prompt.slice(0, 60)}..."`);

    const falBody: Record<string, unknown> = {
      prompt:               prompt.trim(),
      image_size:           FAL_SIZE_MAP[size],
      num_inference_steps:  28,
      num_images:           1,
    };
    if (refImage) falBody.image_url = refImage;

    const falRes = await fetch('https://fal.run/fal-ai/flux/dev', {
      method: 'POST',
      headers: { 'Authorization': `Key ${env.FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(falBody),
    });
    if (!falRes.ok) {
      const msg = await falRes.text().catch(() => `HTTP ${falRes.status}`);
      console.error('[studio/generate] fal-fast error:', msg.slice(0, 300));
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
    console.log(`[studio/generate] fal-fast ok (b64 ${b64.length} chars)`);
    return json({ url: `data:${mime};base64,${b64}`, revisedPrompt: null });
  }

  // ── fal-pro (flux-pro) ────────────────────────────────────────────────────
  if (model === 'fal-pro') {
    console.log(`[studio/generate] fal-pro/flux-pro prompt="${prompt.slice(0, 60)}..."`);

    const falRes = await fetch('https://fal.run/fal-ai/flux-pro', {
      method: 'POST',
      headers: { 'Authorization': `Key ${env.FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt:      prompt.trim(),
        image_size:  FAL_SIZE_MAP[size],
        num_images:  1,
        safety_tolerance: '2',
      }),
    });
    if (!falRes.ok) {
      const msg = await falRes.text().catch(() => `HTTP ${falRes.status}`);
      console.error('[studio/generate] fal-pro error:', msg.slice(0, 300));
      throw error(falRes.status >= 500 ? 500 : 400, `FAL Pro API error: ${msg.slice(0, 200)}`);
    }
    const falData = await falRes.json();
    const imageUrl: string = falData?.images?.[0]?.url;
    if (!imageUrl) throw error(500, 'No image URL returned from FAL Pro');

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw error(500, 'Failed to fetch FAL Pro image');
    const imgBuf = await imgRes.arrayBuffer();
    const b64    = Buffer.from(imgBuf).toString('base64');
    const mime   = imgRes.headers.get('content-type') ?? 'image/jpeg';
    console.log(`[studio/generate] fal-pro ok (b64 ${b64.length} chars)`);
    return json({ url: `data:${mime};base64,${b64}`, revisedPrompt: null });
  }

  throw error(400, `Unknown model: ${model}`);
};
