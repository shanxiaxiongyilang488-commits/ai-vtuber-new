import { error } from '@sveltejs/kit';
import { generateOpenAIImage } from '$lib/server/imageProviders/openai';
import { generateIdeogramImage } from '$lib/server/imageProviders/ideogram';
import { generateFalImage } from './fal';
import { recordImageGenerationUsage } from '$lib/server/mediaUsage';
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
    aliases: ['openai/GPT Image 2', 'openai/GPT Image 2 Edit'],
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
  if (!raw) return AVAILABLE_MEDIA_MODELS[0];
  return AVAILABLE_MEDIA_MODELS.find((item) =>
    normalize(item.id) === raw ||
    normalize(item.apiModel) === raw ||
    (item.aliases ?? []).some((alias) => normalize(alias) === raw),
  ) ?? AVAILABLE_MEDIA_MODELS[0];
}

export async function generateMediaImage(input: ImageGenerationInput & {
  requestedModel?: string;
}): Promise<{ images: GeneratedImage[]; model: MediaModelInfo }> {
  const model = resolveMediaModel(input.requestedModel ?? input.model);
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
