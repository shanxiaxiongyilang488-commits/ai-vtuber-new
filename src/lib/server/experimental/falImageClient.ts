import { error } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import { normalizeImages, type GeneratedImage, type ImageGenerationInput, type ImageSize } from '$lib/server/imageProviders/types';

const FAL_IMAGE_MODEL = 'fal-ai/nano-banana';

const FAL_MODEL_MAP: Record<string, string> = {
  'nano-banana': 'fal-ai/nano-banana',
  'Nano Banana': 'fal-ai/nano-banana',
  'fal-ai/nano-banana': 'fal-ai/nano-banana',
  FAL: FAL_IMAGE_MODEL,
  fal: FAL_IMAGE_MODEL,
  nanobanana2: 'fal-ai/nano-banana-2',
  'fal-ai/nano-banana-2': 'fal-ai/nano-banana-2',
  'nano-banana-pro': 'fal-ai/nano-banana-pro',
  'Nano Banana Pro': 'fal-ai/nano-banana-pro',
  'fal-ai/nano-banana-pro': 'fal-ai/nano-banana-pro',
  'nano-banana-2': 'fal-ai/nano-banana-2',
  'Nano Banana 2': 'fal-ai/nano-banana-2',
  'flux-kontext': 'fal-ai/flux-pro/kontext',
  'Flux Kontext': 'fal-ai/flux-pro/kontext',
  'fal-ai/flux-pro/kontext': 'fal-ai/flux-pro/kontext',
  'flux-pro': 'fal-ai/flux-pro/v1.1',
  'Flux Pro': 'fal-ai/flux-pro/v1.1',
  'fal-ai/flux-pro/v1.1': 'fal-ai/flux-pro/v1.1',
};

function resolveFalModel(selectedModel?: string): string {
  return FAL_MODEL_MAP[selectedModel ?? ''] ?? selectedModel ?? FAL_IMAGE_MODEL;
}

function sizeToAspectRatio(size: ImageSize): string {
  if (size === '1792x1024') return '16:9';
  if (size === '1024x1792') return '9:16';
  return '1:1';
}

function sizeToFluxImageSize(size: ImageSize): string {
  if (size === '1792x1024') return 'landscape_16_9';
  if (size === '1024x1792') return 'portrait_16_9';
  return 'square_hd';
}

export async function generateFalImageExperimental(input: ImageGenerationInput): Promise<GeneratedImage[]> {
  const falKey = await getProviderKey('fal');
  if (!falKey) throw error(500, 'FAL API key is not configured');

  const falModel = resolveFalModel(input.model);
  const hasRefs = input.refImages.length > 0;
  const isNanoBanana = /^fal-ai\/nano-banana(?:-pro|-2)?$/.test(falModel);
  const isFluxKontext = falModel === 'fal-ai/flux-pro/kontext';
  const endpointModel = isNanoBanana && (input.editMode || hasRefs)
    ? `${falModel}/edit`
    : isFluxKontext && !hasRefs
      ? 'fal-ai/flux-pro/kontext/text-to-image'
      : falModel;

  const falBody: Record<string, unknown> = {
    prompt: input.prompt,
    num_images: 1,
    output_format: 'png',
    sync_mode: false,
  };

  if (isNanoBanana) {
    falBody.aspect_ratio = hasRefs ? 'auto' : sizeToAspectRatio(input.size);
    falBody.safety_tolerance = '4';
    if (hasRefs) falBody.image_urls = input.refImages;
    if (falModel === 'fal-ai/nano-banana-pro' || falModel === 'fal-ai/nano-banana-2') {
      falBody.resolution = '1K';
    }
  } else if (isFluxKontext) {
    falBody.guidance_scale = 3.5;
    falBody.safety_tolerance = '2';
    falBody.enhance_prompt = false;
    falBody.aspect_ratio = sizeToAspectRatio(input.size);
    if (hasRefs) falBody.image_url = input.refImages[0];
  } else {
    falBody.image_size = sizeToFluxImageSize(input.size);
    falBody.num_inference_steps = 30;
    falBody.guidance_scale = 7.5;
  }

  const endpoint = `https://fal.run/${endpointModel}`;
  console.log('[FAL EXPERIMENTAL MODEL]', { falModel, endpointModel, endpoint });

  const falRes = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(falBody),
  });

  if (!falRes.ok) {
    const msg = await falRes.text().catch(() => `HTTP ${falRes.status}`);
    throw error(falRes.status >= 500 ? 500 : 400, `FAL API error: ${msg.slice(0, 200)}`);
  }

  const falData = await falRes.json();
  const images = normalizeImages(falData?.images ?? []);
  if (images.length === 0) throw error(500, 'No image URL returned from FAL');
  return images;
}
