import { error } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import { recordImageGenerationUsage } from '$lib/server/mediaUsage';
import { normalizeImages, type GeneratedImage, type ImageGenerationInput, type ImageSize } from '$lib/server/imageProviders/types';

const DEFAULT_FAL_IMAGE_MODEL = 'fal-ai/nano-banana';
const DEFAULT_FAL_VIDEO_MODEL = 'fal-ai/kling-video/v3/pro/image-to-video';

export const FAL_MEDIA_MODELS = [
  { id: 'google/nano-banana-2-lite', label: 'NanoBanana 2 Lite', kind: 'image' },
  { id: 'fal-ai/nano-banana', label: 'Nano Banana', kind: 'image' },
  { id: 'fal-ai/nano-banana-pro', label: 'Nano Banana Pro', kind: 'image' },
  { id: 'fal-ai/nano-banana-2', label: 'Nano Banana 2', kind: 'image' },
  { id: 'fal-ai/flux-pro/kontext', label: 'Flux Kontext', kind: 'image' },
  { id: 'fal-ai/flux-pro/v1.1', label: 'Flux Pro', kind: 'image' },
  { id: 'fal-ai/bytedance/seedream/v5/lite/text-to-image', label: 'Seedream 5 Lite', kind: 'image' },
  { id: 'fal-ai/bytedance/seedream/v5/lite/edit', label: 'Seedream 5 Lite Edit', kind: 'image' },
  { id: 'fal-ai/kling-video/v3/pro/image-to-video', label: 'Kling 3.0 Pro', kind: 'video' },
  { id: 'fal-ai/sora-2/text-to-video', label: 'Sora 2 Text to Video', kind: 'video' },
  { id: 'fal-ai/sora-2/image-to-video', label: 'Sora 2 Image to Video', kind: 'video' },
] as const;

const FAL_MODEL_MAP: Record<string, string> = {
  'nanobanana-2-lite': 'google/nano-banana-2-lite',
  'nano-banana-2-lite': 'google/nano-banana-2-lite',
  'NanoBanana 2 Lite': 'google/nano-banana-2-lite',
  'Nano Banana 2 Lite': 'google/nano-banana-2-lite',
  'google/nano-banana-2-lite': 'google/nano-banana-2-lite',
  'google/nano-banana-lite/edit': 'google/nano-banana-lite/edit',
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
  'openai/gpt-image-2/edit': 'openai/gpt-image-2/edit',
  'fal-ai/gpt-image-2/edit': 'openai/gpt-image-2/edit',
  'seedream-5-lite': 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
  'Seedream 5 Lite': 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
  'fal-ai/bytedance/seedream/v5/lite/text-to-image': 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
  'seedream-5-lite-edit': 'fal-ai/bytedance/seedream/v5/lite/edit',
  'Seedream 5 Lite Edit': 'fal-ai/bytedance/seedream/v5/lite/edit',
  'fal-ai/bytedance/seedream/v5/lite/edit': 'fal-ai/bytedance/seedream/v5/lite/edit',
  kling: DEFAULT_FAL_VIDEO_MODEL,
  'kling-3-pro': DEFAULT_FAL_VIDEO_MODEL,
  'fal-ai/kling-video/v3/pro/image-to-video': DEFAULT_FAL_VIDEO_MODEL,
  sora: 'fal-ai/sora-2/text-to-video',
  'sora-2': 'fal-ai/sora-2/text-to-video',
  'fal-ai/sora-2/text-to-video': 'fal-ai/sora-2/text-to-video',
  'fal-ai/sora-2/image-to-video': 'fal-ai/sora-2/image-to-video',
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
  'fal-ai/bytedance/seedream/v5/lite/text-to-image': 0.035,
  'fal-ai/bytedance/seedream/v5/lite/edit': 0.035,
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
  'fal-ai/sora-2/text-to-video': {
    endpoint: 'fal-ai/sora-2/text-to-video',
    resultPath: ['video', 'url'] as string[],
    buildBody: (prompt: string, duration: number) => ({
      prompt,
      duration: nearestSoraDuration(duration),
      resolution: '720p',
      aspect_ratio: '16:9',
      model: 'sora-2',
      delete_video: true,
    }),
  },
  'fal-ai/sora-2/image-to-video': {
    endpoint: 'fal-ai/sora-2/image-to-video',
    resultPath: ['video', 'url'] as string[],
    buildBody: (prompt: string, duration: number, _audio: boolean, referenceImage: string) => ({
      prompt,
      duration: nearestSoraDuration(duration),
      resolution: 'auto',
      aspect_ratio: 'auto',
      model: 'sora-2',
      delete_video: true,
      image_url: referenceImage,
    }),
  },
} as const;

export function resolveFalMediaModel(selectedModel?: string, fallback = DEFAULT_FAL_IMAGE_MODEL): string {
  return FAL_MODEL_MAP[selectedModel ?? ''] ?? selectedModel ?? fallback;
}

function nearestSoraDuration(duration: number): 4 | 8 | 12 | 16 | 20 {
  const allowed = [4, 8, 12, 16, 20] as const;
  return allowed.reduce((nearest, candidate) =>
    Math.abs(candidate - duration) < Math.abs(nearest - duration) ? candidate : nearest,
  );
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

function sizeToSeedreamImageSize(size: ImageSize): string {
  if (size === '1792x1024') return 'landscape_16_9';
  if (size === '1536x1024') return 'landscape_4_3';
  if (size === '1024x1792') return 'portrait_16_9';
  if (size === '1024x1536') return 'portrait_4_3';
  return 'square_hd';
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

function imageRefDigest(value: string): string {
  let hash = 0;
  const step = Math.max(1, Math.floor(value.length / 64));
  for (let i = 0; i < value.length; i += step) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) >>> 0;
  }
  return `${value.length}:${hash.toString(16)}`;
}

function imageRefMeta(value: string, index: number, source = 'unknown') {
  return {
    index,
    source,
    kind: value.startsWith('data:') ? 'data-url' : (value.startsWith('http') ? 'url' : 'unknown'),
    mime: value.match(/^data:([^;]+);/)?.[1] ?? null,
    length: value.length,
    approxKB: Math.round(value.length / 1024),
    digest: imageRefDigest(value),
  };
}

function imageFieldMeta(value: unknown, source: string) {
  if (typeof value === 'string') return imageRefMeta(value, 0, source);
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      typeof item === 'string' ? imageRefMeta(item, index, source) : { index, source, kind: typeof item },
    );
  }
  return value ?? null;
}

function sanitizeFalBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    image_urls: imageFieldMeta(body.image_urls, 'falBody.image_urls'),
    image_url: imageFieldMeta(body.image_url, 'falBody.image_url'),
    image: imageFieldMeta(body.image, 'falBody.image'),
    reference_image_urls: imageFieldMeta(body.reference_image_urls, 'falBody.reference_image_urls'),
    files: Array.isArray(body.files) ? `[${body.files.length} files]` : body.files ?? null,
  };
}

export async function generateFalImage(input: ImageGenerationInput): Promise<GeneratedImage[]> {
  const falKey = await getProviderKey('fal');
  if (!falKey) throw error(500, 'FAL API key is not configured');

  const requestId = input.requestId ?? null;
  const falModel = resolveFalMediaModel(input.model);
  const hasRefs = input.refImages.length > 0;
  console.log('[FAL_INPUT_IMAGES]', {
    requestId,
    count: input.refImages.length,
  });
  const isNanoBananaLite = falModel === 'google/nano-banana-2-lite'
    || falModel === 'google/nano-banana-lite/edit';
  const isNanoBananaEdit = /^fal-ai\/nano-banana(?:-pro|-2)?\/edit$/.test(falModel)
    || falModel === 'google/nano-banana-lite/edit';
  const nanoBananaBaseModel = isNanoBananaLite
    ? 'google/nano-banana-2-lite'
    : falModel.replace(/\/edit$/, '');
  const isNanoBanana = isNanoBananaLite
    || /^fal-ai\/nano-banana(?:-pro|-2)?$/.test(nanoBananaBaseModel);
  const isFluxKontext = falModel === 'fal-ai/flux-pro/kontext';
  const isGptImage2 = falModel === 'openai/gpt-image-2';
  const isGptImage2Edit = falModel === 'openai/gpt-image-2/edit' || (isGptImage2 && hasRefs);
  // Seedream は fal-ai/bytedance/seedream/v5/{lite|pro}/{text-to-image|edit} の階層。
  // tier 非依存で判定しておくことで、Pro 追加時はモデル定義の追加だけで済む。
  const isSeedream = /^fal-ai\/bytedance\/seedream\/v\d+\/[^/]+\/(?:text-to-image|edit)$/.test(falModel);
  const isSeedreamEdit = isSeedream && (falModel.endsWith('/edit') || input.editMode || hasRefs);
  const seedreamBaseModel = isSeedream ? falModel.replace(/\/(?:text-to-image|edit)$/, '') : '';
  const isIdeogramV3Remix = falModel === 'fal-ai/ideogram/v3' && hasRefs;
  const isIdeogramCharacter = falModel === 'fal-ai/ideogram/character';
  const isIdeogramCharacterEdit = falModel === 'fal-ai/ideogram/character/edit';
  if (isGptImage2Edit && !hasRefs) {
    console.error('[FAL GPT IMAGE 2 EDIT MISSING image_urls]', {
      requestId,
      refImages: input.refImages.length,
      model: falModel,
      editMode: input.editMode,
    });
    throw error(400, 'GPT Image 2 Edit requires at least one reference image in image_urls');
  }
  if (isNanoBananaEdit && !hasRefs) {
    throw error(400, 'Nano Banana Edit requires at least one reference image in image_urls');
  }
  if (isSeedreamEdit && !hasRefs) {
    throw error(400, 'Seedream Edit requires at least one reference image in image_urls');
  }
  const endpointModel = isNanoBanana && (isNanoBananaEdit || input.editMode || hasRefs)
    ? isNanoBananaLite
      ? 'google/nano-banana-lite/edit'
      : `${nanoBananaBaseModel}/edit`
    : isGptImage2Edit
      ? 'openai/gpt-image-2/edit'
    : isSeedream
      ? `${seedreamBaseModel}/${isSeedreamEdit ? 'edit' : 'text-to-image'}`
    : isIdeogramV3Remix
      ? 'fal-ai/ideogram/v3/remix'
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
    if (nanoBananaBaseModel === 'fal-ai/nano-banana-pro' || nanoBananaBaseModel === 'fal-ai/nano-banana-2') {
      falBody.resolution = '1K';
    }
  } else if (isFluxKontext) {
    falBody.guidance_scale = 3.5;
    falBody.safety_tolerance = '2';
    falBody.enhance_prompt = false;
    falBody.aspect_ratio = sizeToAspectRatio(input.size);
    if (hasRefs) falBody.image_url = input.refImages[0];
  } else if (isGptImage2Edit) {
    falBody.image_urls = input.refImages;
    falBody.image_size = 'auto';
    falBody.quality = 'high';
  } else if (isSeedream) {
    // Seedream の入力スキーマに output_format は無いため送らない（image_size 既定は auto_2K）。
    delete falBody.output_format;
    if (isSeedreamEdit) {
      falBody.image_urls = input.refImages;
    } else {
      falBody.image_size = sizeToSeedreamImageSize(input.size);
    }
  } else if (isIdeogramV3Remix) {
    falBody.image_url = input.refImages[0];
  } else if (isIdeogramCharacter) {
    falBody.reference_image_urls = input.refImages;
  } else if (isIdeogramCharacterEdit) {
    falBody.image_url = input.refImages[0];
    falBody.reference_image_urls = input.refImages;
  } else {
    falBody.image_size = sizeToFluxImageSize(input.size);
    falBody.num_inference_steps = 30;
    falBody.guidance_scale = 7.5;
  }

  const endpoint = `https://fal.run/${endpointModel}`;
  const imageUrlCount = Array.isArray(falBody.image_urls)
    ? falBody.image_urls.length
    : falBody.image_url
      ? 1
      : Array.isArray(falBody.reference_image_urls)
        ? falBody.reference_image_urls.length
        : 0;
  console.log('[FAL_IMAGE_URLS]', {
    requestId,
    count: imageUrlCount,
  });
  console.log('[FAL_REQUEST_MODEL]', {
    requestId,
    model: endpointModel,
  });
  console.log('[FAL_REQUEST]', {
    requestId,
    url: endpoint,
    model: falModel,
    endpointModel,
    editMode: input.editMode,
    refImages: input.refImages.length,
    bodyKeys: Object.keys(falBody),
    imageUrls: Array.isArray(falBody.image_urls) ? falBody.image_urls.length : 0,
    imageUrl: Boolean(falBody.image_url),
    referenceImageUrls: Array.isArray(falBody.reference_image_urls)
      ? falBody.reference_image_urls.length
      : 0,
  });
  console.log('[MEDIA_PROVIDER]', 'fal');
  console.log('[MEDIA_MODEL]', falModel);
  console.log('[FAL_MEDIA_IMAGE]', {
    requestId,
    falModel,
    endpointModel,
    refImages: input.refImages.length,
  });
  console.log('[REF IMAGES PIPELINE mediaProviders/fal]', {
    received: input.refImages.length,
    convertedToImageUrls: Array.isArray(falBody.image_urls) ? falBody.image_urls.length : 0,
    endpointModel,
  });
  if (isGptImage2Edit) {
    const gptImage2Payload = {
      images: Array.isArray(falBody.image_urls) ? falBody.image_urls : [],
    };
    console.log('[FAL_GPT_IMAGE_2_PAYLOAD_IMAGES_LENGTH]', {
      'payload.images.length': gptImage2Payload.images.length,
      image_urls_length: Array.isArray(falBody.image_urls) ? falBody.image_urls.length : 0,
      inputRefImagesLength: input.refImages.length,
    });
    console.log('[GPT-IMAGE-2 EDIT INPUT]', {
      provider: 'fal',
      endpointModel,
      prompt: input.prompt,
      imageUrls: input.refImages.map((ref, index) => imageRefMeta(ref, index, 'fal.gpt-image-2.edit.image_urls')),
      image_size: falBody.image_size,
      quality: falBody.quality,
    });
    console.log('[FAL GPT IMAGE 2 EDIT PAYLOAD FIELDS]', JSON.stringify({
      image_urls: imageFieldMeta(falBody.image_urls, 'falBody.image_urls'),
      image_url: imageFieldMeta(falBody.image_url, 'falBody.image_url'),
      image: imageFieldMeta(falBody.image, 'falBody.image'),
      files: Array.isArray(falBody.files) ? `[${falBody.files.length} files]` : falBody.files ?? null,
    }, null, 2));
    console.log('[FAL GPT IMAGE 2 EDIT PAYLOAD]', JSON.stringify(sanitizeFalBody(falBody), null, 2));
  }

  // 実際に FAL へ送信される JSON（エンドポイント＋ボディ全文）。
  console.log('[FAL_REQUEST_JSON]', JSON.stringify({ endpoint, body: sanitizeFalBody(falBody) }, null, 2));

  const falRes = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(falBody),
  });

  if (!falRes.ok) {
    const msg = await falRes.text().catch(() => `HTTP ${falRes.status}`);
    console.error('[FAL_RESULT]', {
      requestId,
      ok: false,
      status: falRes.status,
      model: falModel,
      endpointModel,
      error: msg.slice(0, 500),
    });
    console.error('[FAL_MEDIA_ERROR]', msg);
    console.log('[FAL_FALLBACK]', { attempted: false, target: null });
    throw error(falRes.status >= 500 ? 500 : 400, `FAL API error: ${msg.slice(0, 300)}`);
  }

  const falData = await falRes.json();
  const images = normalizeImages(falData?.images ?? []);
  console.log('[FAL_RESULT]', {
    requestId,
    ok: true,
    status: falRes.status,
    model: falModel,
    endpointModel,
    responseKeys: Object.keys(falData ?? {}),
    images: images.length,
  });
  if (images.length === 0) {
    console.error('[FAL_RESULT]', {
      requestId,
      ok: false,
      status: falRes.status,
      model: falModel,
      endpointModel,
      reason: 'no_image_url',
      responseKeys: Object.keys(falData ?? {}),
    });
    throw error(500, 'No image URL returned from FAL');
  }
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
  task?: string;
}): Promise<{ url: string; model: string }> {
  const falKey = await getProviderKey('fal');
  if (!falKey) throw error(500, 'FAL API key is not configured');

  const model = resolveFalMediaModel(input.model, DEFAULT_FAL_VIDEO_MODEL);
  const knownConfig = VIDEO_MODEL_CONFIG[model as keyof typeof VIDEO_MODEL_CONFIG];
  const task = input.task?.toLowerCase() || 'image-to-video';

  console.log('[MEDIA_PROVIDER]', 'fal');
  console.log('[MEDIA_MODEL]', model);
  console.log('[FAL_MEDIA_VIDEO]', {
    model,
    mode: 'image-to-video',
    duration: input.duration,
    audio: input.audio,
    referenceImage: Boolean(input.referenceImage),
  });

  const falBody: Record<string, unknown> = knownConfig
    ? knownConfig.buildBody(input.prompt.trim(), input.duration, input.audio, input.referenceImage)
    : {
        prompt: input.prompt.trim(),
        duration: String(input.duration),
        generate_audio: input.audio,
      };
  if (!knownConfig && input.referenceImage) {
    if (/reference-to-video/.test(task)) falBody.image_urls = [input.referenceImage];
    else falBody.image_url = input.referenceImage;
  }
  console.log('[FAL_VIDEO_PAYLOAD]', {
    ...falBody,
    start_image_url: `${input.referenceImage.slice(0, 32)}...`,
  });

  const falRes = await fetch(`https://queue.fal.run/${knownConfig?.endpoint ?? model}`, {
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
  const videoUrl = getNestedValue(falData, ['video', 'url'])
    ?? (knownConfig ? getNestedValue(falData, knownConfig.resultPath) : undefined)
    ?? getNestedValue(falData, ['videos', '0', 'url'])
    ?? getNestedValue(falData, ['output', 'video', 'url'])
    ?? getNestedValue(falData, ['url']);
  if (!videoUrl) {
    console.error('[VIDEO_COMPLETED_MISSING_URL]', { model, requestId: queued.request_id, result: falData });
    throw error(500, `No video URL in completed response from ${model}`);
  }
  console.log('VIDEO_COMPLETED', { model, requestId: queued.request_id, result: { video: { url: videoUrl } } });
  return { url: videoUrl, model };
}
