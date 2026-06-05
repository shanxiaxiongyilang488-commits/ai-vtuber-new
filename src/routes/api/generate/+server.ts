import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCharacterReferenceDataUrl } from '$lib/server/characterRegistry';
import { readSettings, type ImageProvider } from '$lib/server/settings';
import { generateGeminiImage } from '$lib/server/imageProviders/gemini';
import { generateIdeogramImage } from '$lib/server/imageProviders/ideogram';
import { generateOpenAIImage } from '$lib/server/imageProviders/openai';
import type { GeneratedImage, ImageSize } from '$lib/server/imageProviders/types';

const VALID_SIZES = ['1024x1024', '1024x1536', '1536x1024', '1792x1024', '1024x1792'] as const;

interface GenerateRequest {
  prompt: string;
  negative?: string;
  size?: ImageSize;
  provider?: string;
  model?: string;
  selectedModel?: string;
  editMode?: boolean;
  generationMode?: string;
  refImage?: string;
  refImages?: string[];
}

function normalizeSelectedModel(body: GenerateRequest, provider: ImageProvider): string {
  const raw = (body.selectedModel || body.model || '').replace(/\s+edit$/i, '').trim();
  if (raw) return raw;
  if (provider === 'gemini') return 'nano-banana';
  if (provider === 'ideogram') return 'ideogram-v3';
  return 'gpt-image-2';
}

function normalizeRequestProvider(value: unknown): ImageProvider | null {
  const provider = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (provider === 'openai' || provider === 'gemini' || provider === 'ideogram') return provider;
  return null;
}

function characterIdsFromPrompt(prompt: string): string[] {
  return Array.from(new Set(
    Array.from(prompt.matchAll(/\bcharacter:([a-z0-9_-]+)\b/gi))
      .map((match) => match[1].toLowerCase()),
  ));
}

function addRegistryReferenceImages(prompt: string, refImages: string[]): string[] {
  const registryRefs = characterIdsFromPrompt(prompt)
    .map((id) => {
      try {
        const ref = getCharacterReferenceDataUrl(id);
        if (ref) console.log('[api/generate] character reference found:', id);
        return ref;
      } catch (err) {
        console.warn('[api/generate] character reference lookup failed:', id, err);
        return null;
      }
    })
    .filter((ref): ref is string => Boolean(ref));

  if (registryRefs.length === 0) return refImages;
  return Array.from(new Set([...registryRefs, ...refImages]));
}

async function generateWithProvider(provider: ImageProvider, input: {
  prompt: string;
  size: ImageSize;
  model: string;
  refImages: string[];
  editMode: boolean;
}): Promise<GeneratedImage[]> {
  if (provider === 'openai') return generateOpenAIImage(input);
  if (provider === 'gemini') return generateGeminiImage(input);
  if (provider === 'ideogram') return generateIdeogramImage(input);
  throw error(400, `Unknown image provider: ${provider}`);
}

export const POST: RequestHandler = async ({ request }) => {
  console.log('[IMAGE GENERATE ENTRY]');

  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch (caughtError) {
    console.error('[STUDIO ERROR]', caughtError);
    throw error(400, 'Invalid JSON');
  }

  const prompt = body.prompt?.trim();
  const size = body.size ?? '1024x1024';
  if (!prompt) throw error(400, 'prompt is required');
  if (!VALID_SIZES.includes(size)) throw error(400, `size must be one of: ${VALID_SIZES.join(', ')}`);

  const settings = await readSettings();
  const requestProvider = normalizeRequestProvider(body.provider);
  const provider = requestProvider ?? settings.imageConfig.provider;
  const requestModel = (body.model || body.selectedModel || '').replace(/\s+edit$/i, '').trim();
  const imageModel = requestModel || settings.imageConfig.model || settings.image.model || normalizeSelectedModel(body, provider);

  console.log('[api/generate] received provider/model', {
    provider: body.provider ?? null,
    model: body.model ?? null,
    selectedModel: body.selectedModel ?? null,
  });
  console.log('[api/generate] settings imageConfig', settings.imageConfig);
  console.log('[api/generate] provider/model priority', requestProvider ? 'request' : 'settings.imageConfig');
  console.log('[IMAGE_PROVIDER]', provider);
  console.log('[IMAGE_MODEL]', imageModel);
  console.log('[REQUEST IMAGE PROVIDER]', body.provider ?? '(none)');
  console.log('[REQUEST IMAGE MODEL]', body.model ?? body.selectedModel ?? '(none)');

  const requestRefImages = (
    body.refImages?.filter((img): img is string => typeof img === 'string' && img.startsWith('data:')) ??
    (body.refImage?.startsWith('data:') ? [body.refImage] : [])
  );
  const refImages = addRegistryReferenceImages(prompt, requestRefImages);
  const editMode = Boolean(body.editMode);

  console.log('[api/generate]', {
    provider,
    model: imageModel,
    size,
    editMode,
    refImages: refImages.length,
    registryRefs: Math.max(0, refImages.length - requestRefImages.length),
    promptLength: prompt.length,
  });

  const images = await generateWithProvider(provider, {
    prompt,
    size,
    model: imageModel,
    refImages,
    editMode,
  });

  return json({ images });
};
