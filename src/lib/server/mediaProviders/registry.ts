import { error } from '@sveltejs/kit';
import { generateOpenAIImage } from '$lib/server/imageProviders/openai';
import { generateRunpodAnimaImage } from '$lib/server/runpodAnima';
import { readSettings } from '$lib/server/settings';
import { recordImageGenerationUsage } from '$lib/server/mediaUsage';
import {
  AVAILABLE_IMAGE_MODELS as CONFIG_AVAILABLE_IMAGE_MODELS,
  AVAILABLE_MEDIA_MODELS as CONFIG_AVAILABLE_MEDIA_MODELS,
} from '$lib/config/mediaModels';
import type { GeneratedImage, ImageGenerationInput } from '$lib/server/imageProviders/types';

export type MediaProviderName = 'openai' | 'fal' | 'ideogram' | 'runpod';
export type MediaModelInfo = {
  id: string;
  label: string;
  provider: MediaProviderName;
  apiModel: string;
  endpoint?: string;
  kind: 'image' | 'video';
  edit?: boolean;
  estimatedCost: number | null;
  aliases?: string[];
};

export const AVAILABLE_MEDIA_MODELS: MediaModelInfo[] = [
  {
    id: 'gpt-image-2',
    label: 'OpenAI GPT Image 2',
    provider: 'openai',
    apiModel: 'gpt-image-2',
    kind: 'image',
    estimatedCost: null,
    aliases: [
      'GPT Image',
      'openai/GPT Image 2',
      'openai/GPT Image 2 Edit',
      'openai/gpt-image-2',
      'openai/gpt-image-2/edit',
      'fal:openai/gpt-image-2',
      'fal:openai/gpt-image-2/edit',
      'FAL GPT Image 2',
      'FAL GPT Image 2 Edit',
    ],
  },
  {
    id: 'comfyui/anima',
    label: 'Anima (ComfyUI Pod)',
    provider: 'runpod',
    apiModel: 'Anima-Base-v1.0',
    kind: 'image',
    estimatedCost: null,
    aliases: ['Anima', 'Anima Base', 'Anima Base v1.0', 'runpod/anima'],
  },
  {
    id: 'nanobanana-2-lite',
    label: 'NanoBanana 2 Lite',
    provider: 'fal',
    apiModel: 'google/nano-banana-2-lite',
    kind: 'image',
    estimatedCost: null,
    aliases: ['nano-banana-2-lite', 'NanoBanana 2 Lite', 'Nano Banana 2 Lite', 'google/nano-banana-2-lite'],
  },
  {
    id: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    provider: 'fal',
    apiModel: 'fal-ai/nano-banana-pro',
    kind: 'image',
    estimatedCost: 0.15,
    aliases: ['Nano Banana Pro', 'fal-ai/nano-banana-pro'],
  },
  {
    id: 'nano-banana',
    label: 'Nano Banana',
    provider: 'fal',
    apiModel: 'fal-ai/nano-banana',
    kind: 'image',
    estimatedCost: 0.039,
    aliases: ['Nano Banana', 'fal-ai/nano-banana'],
  },
  {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    provider: 'fal',
    apiModel: 'fal-ai/nano-banana-2',
    kind: 'image',
    estimatedCost: 0.15,
    aliases: ['Nano Banana 2', 'nanobanana2', 'fal-ai/nano-banana-2'],
  },
  {
    id: 'ideogram-v3',
    label: 'Ideogram',
    provider: 'ideogram',
    apiModel: 'ideogram-v3',
    kind: 'image',
    estimatedCost: null,
    aliases: ['ideogram', 'ideogram-v3'],
  },
  {
    id: 'flux-kontext',
    label: 'Flux Kontext',
    provider: 'fal',
    apiModel: 'fal-ai/flux-pro/kontext',
    kind: 'image',
    estimatedCost: 0.05,
    aliases: ['Flux Kontext', 'fal-ai/flux-pro/kontext'],
  },
  {
    id: 'flux-pro',
    label: 'Flux Pro',
    provider: 'fal',
    apiModel: 'fal-ai/flux-pro/v1.1',
    kind: 'image',
    estimatedCost: 0.04,
    aliases: ['Flux Pro', 'fal-ai/flux-pro/v1.1'],
  },
];

function normalize(value?: string): string {
  return (value || '').trim().toLowerCase();
}

function mediaModelMatches(item: { id: string; apiModel: string; aliases?: string[] }, raw: string): boolean {
  return normalize(item.id) === raw ||
    normalize(item.apiModel) === raw ||
    (item.aliases ?? []).some((alias) => normalize(alias) === raw);
}

export function logAvailableMediaModels(): void {
  console.log('[AVAILABLE_MEDIA_MODELS]', AVAILABLE_MEDIA_MODELS.map((model) => ({
    id: model.id,
    label: model.label,
    provider: model.provider,
    apiModel: model.apiModel,
    kind: model.kind,
    estimatedCost: model.estimatedCost,
  })));
}

export function resolveMediaModel(model?: string): MediaModelInfo {
  const raw = normalize(model);
  const fallback = AVAILABLE_MEDIA_MODELS[0];
  const serverMatch = raw ? AVAILABLE_MEDIA_MODELS.find((item) => mediaModelMatches(item, raw)) : undefined;
  const configImageMatch = raw ? CONFIG_AVAILABLE_IMAGE_MODELS.find((item) => mediaModelMatches(item, raw)) : undefined;
  const configMediaMatch = raw ? CONFIG_AVAILABLE_MEDIA_MODELS.find((item) => mediaModelMatches(item, raw)) : undefined;

  console.log('[mediaProviders/registry] resolveMediaModel input', {
    input: model ?? null,
    raw,
    serverMatch: serverMatch ? {
      id: serverMatch.id,
      provider: serverMatch.provider,
      apiModel: serverMatch.apiModel,
    } : null,
    existsInConfigAvailableImageModels: Boolean(configImageMatch),
    configImageMatch: configImageMatch ? {
      id: configImageMatch.id,
      provider: configImageMatch.provider,
      apiModel: configImageMatch.apiModel,
    } : null,
    existsInConfigAvailableMediaModels: Boolean(configMediaMatch),
    configMediaMatch: configMediaMatch ? {
      id: configMediaMatch.id,
      provider: configMediaMatch.provider,
      apiModel: configMediaMatch.apiModel,
    } : null,
  });

  if (!raw) {
    console.log('[mediaProviders/registry] resolveMediaModel fallback', {
      reason: 'empty_model',
      input: model ?? null,
      fallback: {
        id: fallback.id,
        provider: fallback.provider,
        apiModel: fallback.apiModel,
      },
      serverAvailableModelIds: AVAILABLE_MEDIA_MODELS.map((item) => item.id),
      configAvailableImageModelIds: CONFIG_AVAILABLE_IMAGE_MODELS.map((item) => item.id),
    });
    return fallback;
  }

  if (configMediaMatch) {
    const resolved: MediaModelInfo = {
      id: configMediaMatch.id,
      label: configMediaMatch.label,
      provider: configMediaMatch.provider,
      apiModel: configMediaMatch.apiModel,
      endpoint: configMediaMatch.endpoint ?? configMediaMatch.apiModel,
      kind: configMediaMatch.kind,
      edit: configMediaMatch.edit,
      estimatedCost: configMediaMatch.estimatedCost,
      aliases: configMediaMatch.aliases,
    };
    console.log('[mediaProviders/registry] resolveMediaModel resolved', {
      reason: 'model_config_match',
      input: model ?? null,
      resolved: {
        id: resolved.id,
        provider: resolved.provider,
        endpoint: resolved.endpoint,
      },
    });
    return resolved;
  }

  if (serverMatch) {
    const resolved = { ...serverMatch, endpoint: serverMatch.apiModel };
    console.log('[mediaProviders/registry] resolveMediaModel resolved', {
      reason: 'server_registry_match',
      input: model ?? null,
      raw,
      resolved: {
        id: resolved.id,
        provider: resolved.provider,
        endpoint: resolved.endpoint,
      },
    });
    return resolved;
  }

  console.log('[mediaProviders/registry] resolveMediaModel fallback', {
    reason: 'server_registry_model_not_found',
    input: model ?? null,
    raw,
    existsInServerAvailableMediaModels: false,
    existsInConfigAvailableImageModels: Boolean(configImageMatch),
    existsInConfigAvailableMediaModels: Boolean(configMediaMatch),
    fallback: {
      id: fallback.id,
      provider: fallback.provider,
      apiModel: fallback.apiModel,
    },
    serverAvailableModelIds: AVAILABLE_MEDIA_MODELS.map((item) => item.id),
    configAvailableImageModelIds: CONFIG_AVAILABLE_IMAGE_MODELS.map((item) => item.id),
    configAvailableMediaModelIds: CONFIG_AVAILABLE_MEDIA_MODELS.map((item) => item.id),
  });
  return fallback;
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

export async function generateMediaImage(
  input: Omit<ImageGenerationInput, 'model'> & { selectedModelId: string; flowId?: string },
): Promise<{
  images: GeneratedImage[];
  model: MediaModelInfo;
  costLog?: {
    provider: string;
    model: string;
    estimatedCostUsd: number | null;
    cumulativeGenerations: number;
    estimatedCostTotalUsd: number;
  };
}> {
  const { selectedModelId, flowId, ...generationInput } = input;
  const model = resolveMediaModel(selectedModelId);
  console.log('[EDIT FLOW][generateMediaImage ENTER]', {
    flowId: flowId ?? null,
    selectedModel: selectedModelId,
    provider: model.provider,
    endpoint: model.endpoint ?? model.apiModel,
    refImages: generationInput.refImages.length,
  });
  console.log('[mediaProviders/registry] generateMediaImage resolved final', {
    selectedModel: selectedModelId,
    resolvedProvider: model.provider,
    resolvedModel: model.endpoint ?? model.apiModel,
    resolvedModelId: model.id,
  });
  console.log('[MEDIA_PROVIDER]', model.provider);
  console.log('[MEDIA_MODEL]', model.id);
  console.log('[REF IMAGES PIPELINE mediaProviders/registry]', {
    received: input.refImages.length,
    provider: model.provider,
    model: model.apiModel,
    editMode: input.editMode,
  });
  console.log('[IMAGE_REFS_MEDIA_PROVIDER_INPUT]', {
    flowId: flowId ?? null,
    provider: model.provider,
    model: model.endpoint ?? model.apiModel,
    refs: generationInput.refImages.map((ref, index) => imageRefMeta(ref, index, 'mediaProviders/registry')),
  });

  let images: GeneratedImage[];
  if (model.provider === 'runpod') {
    if (generationInput.editMode || generationInput.refImages.length > 0) {
      console.warn('[RunPod Anima] Reference images are ignored because Anima Base currently runs text-to-image only.');
    }
    const settings = await readSettings();
    const generated = await generateRunpodAnimaImage(settings.runpod, {
      prompt: generationInput.prompt,
      size: generationInput.size,
    });
    images = [{ url: generated.url }];
  } else if (model.provider === 'openai') {
    const providerInput = { ...generationInput, model: model.endpoint ?? model.apiModel };
    images = await generateOpenAIImage(providerInput);
  } else {
    throw error(410, `Image provider ${model.provider} is disabled. Use OpenAI Images API or RunPod Anima.`);
  }

  const usage = await recordImageGenerationUsage({
    provider: model.provider,
    model: model.id,
    estimatedCost: model.estimatedCost,
  });
  return {
    images,
    model,
    costLog: {
      provider: model.provider,
      model: model.id,
      estimatedCostUsd: model.estimatedCost,
      cumulativeGenerations: usage.imageGenerationCount,
      estimatedCostTotalUsd: usage.estimatedImageCostTotal,
    },
  };
}
