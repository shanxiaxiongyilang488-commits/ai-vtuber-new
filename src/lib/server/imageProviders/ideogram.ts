import { error } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import { normalizeImages, type GeneratedImage, type ImageGenerationInput, type ImageSize } from './types';

const IDEOGRAM_IMAGE_MODEL = 'ideogram-v3';

function sizeToAspectRatio(size: ImageSize): string {
  if (size === '1792x1024' || size === '1536x1024') return '16x9';
  if (size === '1024x1792' || size === '1024x1536') return '9x16';
  return '1x1';
}

function resolveIdeogramModel(model?: string): string {
  if (!model || model === 'ideogram' || model === 'Ideogram') return IDEOGRAM_IMAGE_MODEL;
  return model.replace(/^ideogram\//, '').trim();
}

export async function generateIdeogramImage(input: ImageGenerationInput): Promise<GeneratedImage[]> {
  const apiKey = await getProviderKey('ideogram');
  if (!apiKey) throw error(500, 'Ideogram API key is not configured');

  const model = resolveIdeogramModel(input.model);
  const endpoint = `https://api.ideogram.ai/v1/${model}/generate`;
  const body = {
    prompt: input.prompt,
    rendering_speed: 'DEFAULT',
    aspect_ratio: sizeToAspectRatio(input.size),
    num_images: 1,
    magic_prompt_option: 'AUTO',
  };

  console.log('[IDEOGRAM IMAGE SETTINGS]', { model, aspectRatio: body.aspect_ratio });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => `HTTP ${res.status}`);
    console.error('[api/generate] ideogram error:', message.slice(0, 300));
    throw error(res.status >= 500 ? 500 : 400, `Ideogram API error: ${message.slice(0, 200)}`);
  }

  const data = await res.json();
  const rawImages = data?.data ?? data?.images ?? [];
  const normalized = normalizeImages(rawImages);
  if (normalized.length === 0) throw error(500, 'No image URL returned from Ideogram');
  return normalized;
}
