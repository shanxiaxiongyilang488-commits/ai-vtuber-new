export type MediaProviderName = 'openai' | 'fal' | 'ideogram';

export type MediaModelInfo = {
  id: string;
  label: string;
  provider: MediaProviderName;
  apiModel: string;
  endpoint?: string;
  kind: 'image' | 'video';
  edit: boolean;
  estimatedCost: number | null;
  aliases?: string[];
  source?: 'builtin' | 'fal-api';
  hidden?: boolean;
  enabled?: boolean;
};

export const BUILTIN_MEDIA_MODELS: MediaModelInfo[] = [
  {
    id: 'nanobanana-2-lite',
    label: 'NanoBanana 2 Lite',
    provider: 'fal',
    apiModel: 'google/nano-banana-2-lite',
    kind: 'image',
    edit: false,
    estimatedCost: null,
    aliases: ['nano-banana-2-lite', 'NanoBanana 2 Lite', 'Nano Banana 2 Lite', 'google/nano-banana-2-lite'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/nano-banana-2',
    label: 'Nano Banana 2',
    provider: 'fal',
    apiModel: 'fal-ai/nano-banana-2',
    kind: 'image',
    edit: false,
    estimatedCost: 0.08,
    aliases: ['nano-banana-2', 'nanobanana2', 'Nano Banana 2'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/nano-banana-2/edit',
    label: 'Nano Banana 2 Edit',
    provider: 'fal',
    apiModel: 'fal-ai/nano-banana-2/edit',
    kind: 'image',
    edit: true,
    estimatedCost: 0.15,
    aliases: ['nano-banana-2-edit', 'Nano Banana 2 Edit'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/nano-banana-pro',
    label: 'Nano Banana Pro',
    provider: 'fal',
    apiModel: 'fal-ai/nano-banana-pro',
    kind: 'image',
    edit: false,
    estimatedCost: 0.15,
    aliases: ['nano-banana-pro', 'Nano Banana Pro'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/nano-banana-pro/edit',
    label: 'Nano Banana Pro Edit',
    provider: 'fal',
    apiModel: 'fal-ai/nano-banana-pro/edit',
    kind: 'image',
    edit: true,
    estimatedCost: 0.15,
    aliases: ['nano-banana-pro-edit', 'Nano Banana Pro Edit'],
    source: 'builtin',
  },
  {
    id: 'fal:openai/gpt-image-2',
    label: 'GPT Image 2',
    provider: 'fal',
    apiModel: 'openai/gpt-image-2',
    kind: 'image',
    edit: false,
    estimatedCost: null,
    aliases: ['FAL GPT Image 2', 'openai/gpt-image-2'],
    source: 'builtin',
  },
  {
    id: 'fal:openai/gpt-image-2/edit',
    label: 'GPT Image 2 Edit',
    provider: 'fal',
    apiModel: 'openai/gpt-image-2/edit',
    kind: 'image',
    edit: true,
    estimatedCost: null,
    aliases: ['FAL GPT Image 2 Edit', 'openai/gpt-image-2/edit'],
    source: 'builtin',
  },
  // Seedream 5 系は fal-ai/bytedance/seedream/v5/{tier}/{task} の階層で増える。
  // Pro を追加する場合は tier 部分を pro にした同形のエントリを足すだけでよい。
  {
    id: 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
    label: 'Seedream 5 Lite',
    provider: 'fal',
    apiModel: 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
    kind: 'image',
    edit: false,
    estimatedCost: 0.035,
    aliases: ['seedream-5-lite', 'Seedream 5 Lite', 'seedream-v5-lite'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/bytedance/seedream/v5/lite/edit',
    label: 'Seedream 5 Lite Edit',
    provider: 'fal',
    apiModel: 'fal-ai/bytedance/seedream/v5/lite/edit',
    kind: 'image',
    edit: true,
    estimatedCost: 0.035,
    aliases: ['seedream-5-lite-edit', 'Seedream 5 Lite Edit'],
    source: 'builtin',
  },
  {
    id: 'openai/gpt-image-2',
    label: 'GPT Image 2',
    provider: 'openai',
    apiModel: 'gpt-image-2',
    kind: 'image',
    edit: false,
    estimatedCost: null,
    aliases: ['gpt-image-2', 'OpenAI GPT Image 2', 'openai/GPT Image 2'],
    source: 'builtin',
  },
  {
    id: 'openai/gpt-image-2/edit',
    label: 'GPT Image 2 Edit',
    provider: 'openai',
    apiModel: 'gpt-image-2',
    kind: 'image',
    edit: true,
    estimatedCost: null,
    aliases: ['gpt-image-2-edit', 'OpenAI GPT Image 2 Edit', 'openai/GPT Image 2 Edit'],
    source: 'builtin',
  },
  {
    id: 'ideogram-v3',
    label: 'Ideogram V3',
    provider: 'ideogram',
    apiModel: 'ideogram-v3',
    kind: 'image',
    edit: false,
    estimatedCost: null,
    aliases: ['Ideogram', 'Ideogram Text to Image'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/ideogram/v3',
    label: 'Ideogram V3',
    provider: 'fal',
    apiModel: 'fal-ai/ideogram/v3',
    kind: 'image',
    edit: false,
    estimatedCost: null,
    aliases: ['ideogram-v3', 'Ideogram V3', 'Ideogram Text to Image', 'ideogram'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/ideogram/character',
    label: 'Ideogram Character',
    provider: 'fal',
    apiModel: 'fal-ai/ideogram/character',
    kind: 'image',
    edit: true,
    estimatedCost: null,
    aliases: ['Ideogram Character', 'ideogram-character'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/ideogram/character/edit',
    label: 'Ideogram Character Edit',
    provider: 'fal',
    apiModel: 'fal-ai/ideogram/character/edit',
    kind: 'image',
    edit: true,
    estimatedCost: null,
    aliases: ['Ideogram Character Edit', 'ideogram-character-edit'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/flux-pro/v1.1',
    label: 'Flux Pro',
    provider: 'fal',
    apiModel: 'fal-ai/flux-pro/v1.1',
    kind: 'image',
    edit: false,
    estimatedCost: 0.04,
    aliases: ['flux-pro', 'Flux Pro'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/recraft/v3/text-to-image',
    label: 'Recraft',
    provider: 'fal',
    apiModel: 'fal-ai/recraft/v3/text-to-image',
    kind: 'image',
    edit: false,
    estimatedCost: null,
    aliases: ['recraft', 'Recraft', 'fal-ai/recraft-v3'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/imagen4/preview',
    label: 'Imagen',
    provider: 'fal',
    apiModel: 'fal-ai/imagen4/preview',
    kind: 'image',
    edit: false,
    estimatedCost: null,
    aliases: ['imagen', 'Imagen'],
    source: 'builtin',
  },
  {
    id: 'fal-ai/nano-banana',
    label: 'Nano Banana',
    provider: 'fal',
    apiModel: 'fal-ai/nano-banana',
    kind: 'image',
    edit: false,
    estimatedCost: 0.039,
    aliases: ['nano-banana', 'Nano Banana'],
    source: 'builtin',
    hidden: true,
  },
];

export const AVAILABLE_MEDIA_MODELS = BUILTIN_MEDIA_MODELS.map((model): MediaModelInfo => ({
  ...model,
  endpoint: model.apiModel,
}));

export const AVAILABLE_IMAGE_MODELS = AVAILABLE_MEDIA_MODELS.filter((model) =>
  model.kind === 'image' && !model.hidden && model.enabled !== false
);

export const OPENAI_IMAGE_MODELS = AVAILABLE_IMAGE_MODELS.filter((model) =>
  model.provider === 'openai'
);

export const mediaModelsByProvider: Record<MediaProviderName, MediaModelInfo[]> = {
  openai: OPENAI_IMAGE_MODELS,
  fal: AVAILABLE_IMAGE_MODELS.filter((model) => model.provider === 'fal'),
  ideogram: AVAILABLE_IMAGE_MODELS.filter((model) => model.provider === 'ideogram'),
};

export const MEDIA_PROVIDER_LABELS: Record<MediaProviderName, string> = {
  openai: 'OpenAI',
  fal: 'FAL',
  ideogram: 'Ideogram',
};

export const AVAILABLE_MEDIA_PROVIDERS = (Object.keys(mediaModelsByProvider) as MediaProviderName[])
  .filter((provider) => mediaModelsByProvider[provider].length > 0);

export type MediaProviderOption = {
  id: MediaProviderName;
  label: string;
};

export const AVAILABLE_MEDIA_PROVIDER_OPTIONS: MediaProviderOption[] = AVAILABLE_MEDIA_PROVIDERS.map((provider) => ({
  id: provider,
  label: MEDIA_PROVIDER_LABELS[provider] ?? provider,
}));

export function normalizeMediaModelKey(value?: string): string {
  return (value || '').trim().toLowerCase();
}

export function resolveMediaModelInfo(model?: string): MediaModelInfo {
  const raw = normalizeMediaModelKey(model);
  const fallback = AVAILABLE_IMAGE_MODELS[0] ?? AVAILABLE_MEDIA_MODELS[0];
  if (!raw) {
    console.log('[mediaModels] resolveMediaModelInfo fallback', {
      input: model ?? null,
      raw,
      reason: 'empty_model',
      existsInAvailableImageModels: false,
      existsInAvailableMediaModels: false,
      availableImageModelIds: AVAILABLE_IMAGE_MODELS.map((item) => item.id),
      resolvedFallback: fallback?.id ?? null,
    });
    return fallback;
  }

  const availableImageMatch = AVAILABLE_IMAGE_MODELS.find((item) =>
    normalizeMediaModelKey(item.id) === raw ||
    normalizeMediaModelKey(item.apiModel) === raw ||
    (item.aliases ?? []).some((alias) => normalizeMediaModelKey(alias) === raw),
  );
  const availableMediaMatch = AVAILABLE_MEDIA_MODELS.find((item) =>
    normalizeMediaModelKey(item.id) === raw ||
    normalizeMediaModelKey(item.apiModel) === raw ||
    (item.aliases ?? []).some((alias) => normalizeMediaModelKey(alias) === raw),
  );

  if (availableMediaMatch) return availableMediaMatch;

  console.log('[mediaModels] resolveMediaModelInfo fallback', {
    input: model ?? null,
    raw,
    reason: 'model_not_found',
    existsInAvailableImageModels: Boolean(availableImageMatch),
    existsInAvailableMediaModels: Boolean(availableMediaMatch),
    availableImageModelIds: AVAILABLE_IMAGE_MODELS.map((item) => item.id),
    availableMediaModelIds: AVAILABLE_MEDIA_MODELS.map((item) => item.id),
    resolvedFallback: fallback?.id ?? null,
  });
  return fallback;
}

export function mediaModelsForProvider(provider: MediaProviderName, kind: MediaModelInfo['kind'] = 'image'): MediaModelInfo[] {
  if (kind === 'image') return mediaModelsByProvider[provider] ?? [];
  return AVAILABLE_MEDIA_MODELS.filter((model) =>
    model.provider === provider &&
    model.kind === kind &&
    !model.hidden &&
    model.enabled !== false
  );
}

export function mediaProviderForModel(model?: string): MediaProviderName {
  return resolveMediaModelInfo(model).provider;
}

export function normalizeMediaModelId(model?: string): string {
  if (!model?.trim()) {
    return (AVAILABLE_IMAGE_MODELS[0] ?? AVAILABLE_MEDIA_MODELS[0]).id;
  }
  return resolveMediaModelInfo(model).id;
}
