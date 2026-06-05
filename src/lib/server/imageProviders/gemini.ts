import { error } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
import { dataUrlToInlineData, normalizeImages, type GeneratedImage, type ImageGenerationInput } from './types';

const GEMINI_API_VERSION = 'v1beta';

export type GeminiImageModelInfo = {
  id: string;
  label: string;
  apiModel: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
};

type GeminiModelProfile = {
  id: string;
  label: string;
  apiModel: string;
  aliases: string[];
  generationConfig(input: ImageGenerationInput): Record<string, unknown> | undefined;
};

const GEMINI_IMAGE_MODEL_PROFILES: GeminiModelProfile[] = [
  {
    id: 'nano-banana',
    label: 'Nano Banana',
    apiModel: 'gemini-2.5-flash-image',
    aliases: ['Nano Banana', 'gemini-2.5-flash-image', 'gemini/gemini-2.5-flash-image'],
    generationConfig: () => undefined,
  },
  {
    id: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    apiModel: 'gemini-3-pro-image-preview',
    aliases: ['Nano Banana Pro', 'gemini-3-pro-image-preview', 'gemini/gemini-3-pro-image-preview', 'gemini-3-pro-image'],
    generationConfig: () => undefined,
  },
  {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    apiModel: 'gemini-3.1-flash-image',
    aliases: ['Nano Banana 2', 'nanobanana2', 'gemini-3.1-flash-image', 'gemini/gemini-3.1-flash-image'],
    generationConfig: () => undefined,
  },
];

function normalizeModelName(model?: string): string {
  return (model || '').replace(/^models\//, '').replace(/^gemini\//, '').trim();
}

function resolveGeminiProfile(model?: string): GeminiModelProfile {
  const normalized = normalizeModelName(model);
  if (!normalized) return GEMINI_IMAGE_MODEL_PROFILES[0];
  return GEMINI_IMAGE_MODEL_PROFILES.find((profile) =>
    profile.id === normalized ||
    profile.apiModel === normalized ||
    profile.aliases.some((alias) => normalizeModelName(alias) === normalized),
  ) ?? {
    id: normalized,
    label: normalized,
    apiModel: normalized,
    aliases: [],
    generationConfig: () => undefined,
  };
}

async function listGeminiModels(apiKey: string): Promise<{
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models?key=${apiKey}`);
  const body = await res.text();
  if (!res.ok) {
    const caught = new Error(`Gemini ListModels API error: ${body}`) as Error & { response?: unknown; status?: number };
    caught.response = body;
    caught.status = res.status;
    throw caught;
  }

  const data = JSON.parse(body) as {
    models?: {
      name?: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }[];
  };
  return data.models ?? [];
}

function toAvailableGeminiImageModels(models: Awaited<ReturnType<typeof listGeminiModels>>): GeminiImageModelInfo[] {
  const modelNames = new Set(models.map((model) => normalizeModelName(model.name)));
  const knownModels = GEMINI_IMAGE_MODEL_PROFILES
    .filter((profile) => modelNames.has(profile.apiModel))
    .map((profile) => {
      const listedModel = models.find((model) => normalizeModelName(model.name) === profile.apiModel);
      return {
        id: profile.id,
        label: profile.label,
        apiModel: profile.apiModel,
        displayName: listedModel?.displayName,
        supportedGenerationMethods: listedModel?.supportedGenerationMethods,
      };
    });
  const knownApiModels = new Set(knownModels.map((model) => model.apiModel));
  const discoveredModels: GeminiImageModelInfo[] = [];
  for (const model of models) {
    const apiModel = normalizeModelName(model.name);
    const searchable = `${apiModel} ${model.displayName ?? ''}`.toLowerCase();
    const supportsGenerateContent = (model.supportedGenerationMethods ?? []).includes('generateContent');
    if (!apiModel || knownApiModels.has(apiModel) || !supportsGenerateContent || !searchable.includes('image')) continue;
    discoveredModels.push({
      id: apiModel,
      label: model.displayName || apiModel,
      apiModel,
      displayName: model.displayName,
      supportedGenerationMethods: model.supportedGenerationMethods,
    });
  }
  return [...knownModels, ...discoveredModels];
}

export async function getAvailableGeminiImageModels(apiKey?: string): Promise<GeminiImageModelInfo[]> {
  const key = apiKey ?? await getProviderKey('gemini');
  if (!key) {
    console.log('[AVAILABLE_GEMINI_MODELS]', []);
    return [];
  }

  try {
    const models = await listGeminiModels(key);
    const available = toAvailableGeminiImageModels(models);
    console.log('[AVAILABLE_GEMINI_MODELS]', available);
    return available;
  } catch (caughtError) {
    const caught = caughtError instanceof Error
      ? caughtError as Error & { response?: unknown }
      : new Error(String(caughtError)) as Error & { response?: unknown };
    console.error('[GEMINI_LIST_MODELS_ERROR]', caught.response ?? caught.message);
    console.log('[AVAILABLE_GEMINI_MODELS]', []);
    return [];
  }
}

async function logGeminiAvailableModels(apiKey: string): Promise<GeminiImageModelInfo[]> {
  try {
    const rawModels = await listGeminiModels(apiKey);
    const models = rawModels.map((model) => ({
      name: model.name,
      displayName: model.displayName,
      supportedGenerationMethods: model.supportedGenerationMethods,
    }));
    console.log('[GEMINI_LIST_MODELS]', models);
    const available = toAvailableGeminiImageModels(rawModels);
    console.log('[AVAILABLE_GEMINI_MODELS]', available);
    return available;
  } catch (caughtError) {
    const caught = caughtError instanceof Error
      ? caughtError as Error & { response?: unknown }
      : new Error(String(caughtError)) as Error & { response?: unknown };
    console.error('[GEMINI_LIST_MODELS_ERROR]', caught.response ?? caught.message);
    console.log('[AVAILABLE_GEMINI_MODELS]', []);
    return [];
  }
}

function buildGeminiGenerateBody(profile: GeminiModelProfile, input: ImageGenerationInput): Record<string, unknown> {
  const parts: any[] = [{ text: input.prompt }];
  for (const ref of input.refImages) {
    if (!ref.startsWith('data:')) continue;
    parts.push({ inlineData: dataUrlToInlineData(ref) });
  }

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
  };
  const generationConfig = profile.generationConfig(input);
  if (generationConfig && Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }
  return body;
}

export async function generateGeminiImage(input: ImageGenerationInput): Promise<GeneratedImage[]> {
  const requestedModel = input.model?.trim() || 'nano-banana';
  const profile = resolveGeminiProfile(requestedModel);
  const model = profile.apiModel;
  console.log('[IMAGE_PROVIDER]', 'gemini');
  console.log('[IMAGE_MODEL]', requestedModel);

  const apiKey = await getProviderKey('gemini');
  if (!apiKey) {
    const caught = new Error('Gemini API key is not configured') as Error & { response?: unknown };
    console.error('[IMAGE_ERROR]');
    console.error('error.message', caught.message);
    console.error('error.response', caught.response);
    throw error(500, caught.message);
  }

  const availableModels = await logGeminiAvailableModels(apiKey);
  if (!availableModels.some((available) => available.apiModel === model)) {
    const caught = new Error(`Gemini image model is not available: ${model}`) as Error & { response?: unknown; status?: number };
    caught.response = availableModels;
    caught.status = 400;
    console.error('[IMAGE_ERROR]');
    console.error('error.message', caught.message);
    console.error('error.response', caught.response);
    throw error(400, caught.message);
  }

  const url = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${model}:generateContent?key=${apiKey}`;
  const requestBody = buildGeminiGenerateBody(profile, input);

  console.log('[GEMINI IMAGE SETTINGS]', {
    model,
    profile: profile.id,
    refImages: input.refImages.length,
    hasGenerationConfig: Boolean(requestBody.generationConfig),
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => `HTTP ${res.status}`);
      const caught = new Error(`Gemini image API error: ${body}`) as Error & { response?: unknown; status?: number };
      caught.response = body;
      caught.status = res.status;
      throw caught;
    }

    const data = await res.json();
    const responseParts = data?.candidates?.[0]?.content?.parts ?? [];
    const images = responseParts
      .map((part: any) => {
        const inlineData = part?.inlineData ?? part?.inline_data;
        const b64 = inlineData?.data;
        const mime = inlineData?.mimeType ?? inlineData?.mime_type ?? 'image/png';
        return typeof b64 === 'string' && b64 ? { url: `data:${mime};base64,${b64}` } : { url: '' };
      });

    const normalized = normalizeImages(images);
    if (normalized.length === 0) throw new Error('No image data returned from Gemini');
    console.log('[IMAGE_SUCCESS]');
    return normalized;
  } catch (caughtError) {
    const caught = caughtError instanceof Error
      ? caughtError as Error & { response?: unknown; status?: number }
      : new Error(String(caughtError)) as Error & { response?: unknown; status?: number };
    const status = typeof caught.status === 'number' && caught.status < 500 ? 400 : 500;
    console.error('[IMAGE_ERROR]');
    console.error('error.message', caught.message);
    console.error('error.response', caught.response);
    throw error(status, caught.message);
  }
}
