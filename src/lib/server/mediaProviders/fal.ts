import { error } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import { recordImageGenerationUsage } from '$lib/server/mediaUsage';
import { normalizeImages, type GeneratedImage, type ImageGenerationInput, type ImageSize } from '$lib/server/imageProviders/types';

const DEFAULT_FAL_IMAGE_MODEL = 'fal-ai/nano-banana';
const DEFAULT_FAL_VIDEO_MODEL = 'fal-ai/kling-video/v3/pro/image-to-video';

export const FAL_MEDIA_MODELS = [
  { id: 'fal-ai/nano-banana', label: 'Nano Banana', kind: 'image' },
  { id: 'fal-ai/nano-banana-pro', label: 'Nano Banana Pro', kind: 'image' },
  { id: 'fal-ai/nano-banana-2', label: 'Nano Banana 2', kind: 'image' },
  { id: 'fal-ai/flux-pro/kontext', label: 'Flux Kontext', kind: 'image' },
  { id: 'fal-ai/flux-pro/v1.1', label: 'Flux Pro', kind: 'image' },
  { id: 'fal-ai/kling-video/v3/pro/image-to-video', label: 'Kling 3.0 Pro', kind: 'video' },
] as const;

const FAL_MODEL_MAP: Record<string, string> = {
  'nano-banana': 'fal-ai/nano-banana',
  'Nano Banana': 'fal-ai/nano-banana',
  'fal-ai/nano-banana': 'fal-ai/nano-banana',
  FAL: DEFAULT_FAL_IMAGE_MODEL,
  fal: DEFAULT_FAL_IMAGE_MODEL,
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
  kling: DEFAULT_FAL_VIDEO_MODEL,
  'kling-3-pro': DEFAULT_FAL_VIDEO_MODEL,
  'fal-ai/kling-video/v3/pro/image-to-video': DEFAULT_FAL_VIDEO_MODEL,
};

const IMAGE_COST_ESTIMATES_USD: Record<string, number> = {
  'fal-ai/nano-banana-pro': 0.15,
  'fal-ai/nano-banana-pro/edit': 0.15,
  'fal-ai/nano-banana': 0.039,
  'fal-ai/nano-banana/edit': 0.039,
  'fal-ai/nano-banana-2': 0.15,
  'fal-ai/nano-banana-2/edit': 0.15,
  'fal-ai/flux-pro/kontext': 0.05,
  'fal-ai/flux-pro/kontext/text-to-image': 0.05,
  'fal-ai/flux-pro/v1.1': 0.04,
};

const VIDEO_MODEL_CONFIG = {
  'fal-ai/kling-video/v3/pro/image-to-video': {
    endpoint: 'fal-ai/kling-video/v3/pro/image-to-video',
    resultPath: ['video', 'url'] as string[],
    buildBody: (prompt: string, duration: number, audio: boolean, referenceImage: string) => ({
      prompt,
      duration: String(duration),
      generate_audio: audio,
      start_image_url: referenceImage,
    }),
  },
} as const;

export function resolveFalMediaModel(selectedModel?: string, fallback = DEFAULT_FAL_IMAGE_MODEL): string {
  return FAL_MODEL_MAP[selectedModel ?? ''] ?? selectedModel ?? fallback;
}

function estimateFalImageCost(model: string, endpointModel: string): number {
  return IMAGE_COST_ESTIMATES_USD[endpointModel] ?? IMAGE_COST_ESTIMATES_USD[model] ?? 0;
}

function sizeToAspectRatio(size: ImageSize): string {
  if (size === '1792x1024') return '16:9';
  if (size === '1024x1792') return '9:16';
  if (size === '1536x1024') return '3:2';
  if (size === '1024x1536') return '2:3';
  return '1:1';
}

function sizeToFluxImageSize(size: ImageSize): string {
  if (size === '1792x1024' || size === '1536x1024') return 'landscape_16_9';
  if (size === '1024x1792' || size === '1024x1536') return 'portrait_16_9';
  return 'square_hd';
}

function getNestedValue(obj: unknown, path: string[]): string | undefined {
  let cur: any = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export async function generateFalImage(input: ImageGenerationInput): Promise<GeneratedImage[]> {
  const falKey = await getProviderKey('fal');
  if (!falKey) throw error(500, 'FAL API key is not configured');

  const falModel = resolveFalMediaModel(input.model);
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
  console.log('[FAL REQUEST]');
  console.log('url:', endpoint);
  console.log('model:', falModel);
  console.log('[MEDIA_PROVIDER]', 'fal');
  console.log('[MEDIA_MODEL]', falModel);
  console.log('[FAL_MEDIA_IMAGE]', { falModel, endpointModel, refImages: input.refImages.length });

  const falRes = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(falBody),
  });

  if (!falRes.ok) {
    const msg = await falRes.text().catch(() => `HTTP ${falRes.status}`);
    console.error('[FAL_MEDIA_ERROR]', msg);
    console.log('[FAL_FALLBACK]', { attempted: false, target: null });
    throw error(falRes.status >= 500 ? 500 : 400, `FAL API error: ${msg.slice(0, 300)}`);
  }

  const falData = await falRes.json();
  const images = normalizeImages(falData?.images ?? []);
  if (images.length === 0) throw error(500, 'No image URL returned from FAL');
  await recordImageGenerationUsage({
    provider: 'fal',
    model: falModel,
    estimatedCost: estimateFalImageCost(falModel, endpointModel),
  });
  return images;
}

export async function generateFalVideo(input: {
  prompt: string;
  model?: string;
  duration: number;
  audio: boolean;
  referenceImage: string;
}): Promise<{ url: string; model: string }> {
  const falKey = await getProviderKey('fal');
  if (!falKey) throw error(500, 'FAL API key is not configured');

  const model = resolveFalMediaModel(input.model, DEFAULT_FAL_VIDEO_MODEL);
  if (!(model in VIDEO_MODEL_CONFIG)) throw error(400, `Unknown FAL video model: ${model}`);
  const cfg = VIDEO_MODEL_CONFIG[model as keyof typeof VIDEO_MODEL_CONFIG];

  console.log('[MEDIA_PROVIDER]', 'fal');
  console.log('[MEDIA_MODEL]', model);
  console.log('[FAL_MEDIA_VIDEO]', {
    model,
    mode: 'image-to-video',
    duration: input.duration,
    audio: input.audio,
    referenceImage: Boolean(input.referenceImage),
  });

  const falBody = cfg.buildBody(
    input.prompt.trim(),
    input.duration,
    input.audio,
    input.referenceImage,
  );
  console.log('[FAL_VIDEO_PAYLOAD]', {
    ...falBody,
    start_image_url: `${input.referenceImage.slice(0, 32)}...`,
  });

  const falRes = await fetch(`https://queue.fal.run/${cfg.endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(falBody),
  });

  if (!falRes.ok) {
    const msg = await falRes.text().catch(() => `HTTP ${falRes.status}`);
    console.error('[FAL_MEDIA_ERROR]', msg);
    throw error(falRes.status >= 500 ? 500 : 400, `${model} API error: ${msg.slice(0, 300)}`);
  }

  const queued = await falRes.json() as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };
  if (!queued.request_id || !queued.status_url || !queued.response_url) {
    throw error(500, `Invalid queue response from ${model}`);
  }

  const deadline = Date.now() + 10 * 60 * 1000;
  let completed = false;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const statusRes = await fetch(queued.status_url, {
      headers: { Authorization: `Key ${falKey}` },
    });
    if (!statusRes.ok) {
      const msg = await statusRes.text().catch(() => `HTTP ${statusRes.status}`);
      throw error(500, `${model} status error: ${msg.slice(0, 300)}`);
    }
    const statusData = await statusRes.json() as { status?: string; error?: unknown };
    console.log('[FAL_VIDEO_STATUS]', {
      model,
      requestId: queued.request_id,
      status: statusData.status ?? 'unknown',
    });
    if (statusData.status === 'COMPLETED') {
      completed = true;
      break;
    }
    if (statusData.status === 'FAILED') {
      throw error(500, `${model} generation failed: ${JSON.stringify(statusData.error ?? statusData)}`);
    }
  }
  if (!completed) throw error(504, `${model} generation timed out`);

  const resultRes = await fetch(queued.response_url, {
    headers: { Authorization: `Key ${falKey}` },
  });
  if (!resultRes.ok) {
    const msg = await resultRes.text().catch(() => `HTTP ${resultRes.status}`);
    throw error(500, `${model} result error: ${msg.slice(0, 300)}`);
  }
  const falData = await resultRes.json();
  const videoUrl = getNestedValue(falData, cfg.resultPath);
  if (!videoUrl) throw error(500, `No video URL in response from ${model}`);
  return { url: videoUrl, model };
}
