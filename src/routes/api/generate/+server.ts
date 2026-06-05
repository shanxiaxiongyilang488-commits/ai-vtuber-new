import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCharacterReferenceDataUrl } from '$lib/server/characterRegistry';
import { readSettings } from '$lib/server/settings';
import { generateMediaImage, logAvailableMediaModels, resolveMediaModel } from '$lib/server/mediaProviders/registry';
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

function normalizeSelectedModel(body: GenerateRequest): string {
  const raw = (body.selectedModel || body.model || '').replace(/\s+edit$/i, '').trim();
  if (raw) return raw;
  return 'fal-ai/nano-banana';
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
  const requestModel = (body.model || body.selectedModel || '').replace(/\s+edit$/i, '').trim();
  logAvailableMediaModels();
  const mediaModel = resolveMediaModel(requestModel || settings.mediaConfig.model || normalizeSelectedModel(body));
  const mediaProvider = mediaModel.provider;

  console.log('[api/generate] received provider/model', {
    provider: body.provider ?? null,
    model: body.model ?? null,
    selectedModel: body.selectedModel ?? null,
  });
  console.log('[api/generate] settings mediaConfig', settings.mediaConfig);
  console.log('[api/generate] media priority', requestModel ? 'request.model' : 'settings.mediaConfig');
  console.log('[MEDIA_PROVIDER]', mediaProvider);
  console.log('[MEDIA_MODEL]', mediaModel.id);
  console.log('[REQUEST IMAGE PROVIDER]', body.provider ?? '(none)');
  console.log('[REQUEST IMAGE MODEL]', body.model ?? body.selectedModel ?? '(none)');

  const requestRefImages = (
    body.refImages?.filter((img): img is string => typeof img === 'string' && img.startsWith('data:')) ??
    (body.refImage?.startsWith('data:') ? [body.refImage] : [])
  );
  const refImages = addRegistryReferenceImages(prompt, requestRefImages);
  const editMode = Boolean(body.editMode);

  console.log('[api/generate]', {
    mediaProvider,
    mediaModel: mediaModel.id,
    size,
    editMode,
    refImages: refImages.length,
    registryRefs: Math.max(0, refImages.length - requestRefImages.length),
    promptLength: prompt.length,
  });

  const result = await generateMediaImage({
    prompt,
    size,
    model: mediaModel.apiModel,
    requestedModel: mediaModel.id,
    refImages,
    editMode,
  });
  const images: GeneratedImage[] = result.images;

  return json({ images });
};
