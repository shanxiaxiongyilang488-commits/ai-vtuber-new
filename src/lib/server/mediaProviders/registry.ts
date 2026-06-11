import { error } from '@sveltejs/kit';
import { generateOpenAIImage } from '$lib/server/imageProviders/openai';
import { generateIdeogramImage } from '$lib/server/imageProviders/ideogram';
import { generateFalImage } from './fal';
import { recordImageGenerationUsage } from '$lib/server/mediaUsage';
import {
  AVAILABLE_IMAGE_MODELS as CONFIG_AVAILABLE_IMAGE_MODELS,
  AVAILABLE_MEDIA_MODELS as CONFIG_AVAILABLE_MEDIA_MODELS,
} from '$lib/config/mediaModels';
import type { GeneratedImage, ImageGenerationInput } from '$lib/server/imageProviders/types';

export type MediaProviderName = 'openai' | 'fal' | 'ideogram';
export type MediaModelInfo = {
  id: string;
  label: string;
  provider: MediaProviderName;
  apiModel: string;
  kind: 'image' | 'video';
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
      'openai/GPT Image 2',
      'openai/GPT Image 2 Edit',
      'openai/gpt-image-2',
      'openai/gpt-image-2/edit',
    ],
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

  if (serverMatch) {
    console.log('[mediaProviders/registry] resolveMediaModel resolved', {
      reason: 'server_registry_match',
      input: model ?? null,
      raw,
      resolved: {
        id: serverMatch.id,
        provider: serverMatch.provider,
        apiModel: serverMatch.apiModel,
      },
    });
    return serverMatch;
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

export async function generateMediaImage(input: ImageGenerationInput & {
  requestedModel?: string;
}): Promise<{ images: GeneratedImage[]; model: MediaModelInfo }> {
  const resolveInput = input.requestedModel ?? input.model;
  console.log('[mediaProviders/registry] generateMediaImage resolve source', {
    inputModel: input.model ?? null,
    requestedModel: input.requestedModel ?? null,
    resolveInput,
  });
  const model = resolveMediaModel(resolveInput);
  console.log('[mediaProviders/registry] generateMediaImage resolved final', {
    requestProvider: null,
    requestModel: resolveInput ?? null,
    resolvedProvider: model.provider,
    resolvedModel: model.apiModel,
    resolvedModelId: model.id,
  });
  console.log('[MEDIA_PROVIDER]', model.provider);
  console.log('[MEDIA_MODEL]', model.id);

  if (model.provider === 'fal') {
    return {
      images: await generateFalImage({ ...input, model: model.apiModel }),
      model,
    };
  }

  const providerInput = { ...input, model: model.apiModel };
  const images = model.provider === 'openai'
    ? await generateOpenAIImage(providerInput)
    : model.provider === 'ideogram'
      ? await generateIdeogramImage(providerInput)
      : (() => { throw error(400, `Unsupported media provider: ${model.provider}`); })();

  await recordImageGenerationUsage({
    provider: model.provider,
    model: model.id,
    estimatedCost: model.estimatedCost,
  });
  return { images, model };
}
