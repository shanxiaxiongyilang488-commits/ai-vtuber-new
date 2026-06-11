import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCharacterReferenceDataUrl } from '$lib/server/characterRegistry';
import { readSettings } from '$lib/server/settings';
import { generateMediaImage, logAvailableMediaModels, resolveMediaModel } from '$lib/server/mediaProviders/registry';
import type { GeneratedImage, ImageSize } from '$lib/server/imageProviders/types';

const VALID_SIZES = ['1024x1024', '1024x1536', '1536x1024', '1792x1024', '1024x1792'] as const;

interface GenerateRequest {
  userInput?: string;
  routerResult?: {
    intent?: string;
    action?: string;
    subtype?: string;
    confidence?: number;
    reason?: string;
    source?: string;
  } | null;
  prompt: string;
  negative?: string;
  size?: ImageSize;
  provider?: string;
  model?: string;
  selectedModel?: string;
  editMode?: boolean;
  generationMode?: string;
  renderMode?: 'manga' | 'illustration';
  speechBubble?: boolean;
  refImage?: string;
  refImages?: string[];
}

function normalizeSelectedModel(body: GenerateRequest): string {
  const raw = (body.selectedModel || body.model || '').replace(/\s+edit$/i, '').trim();
  if (raw) return raw;
  return 'fal-ai/nano-banana';
}

function characterIdsFromPrompt(prompt: string): string[] {
  const explicit = Array.from(prompt.matchAll(/\bcharacter:([a-z0-9_-]+)\b/gi))
    .map((match) => match[1].toLowerCase());
  const registryNames = Array.from(prompt.matchAll(/\bN-\d{2}\b/gi))
    .map((match) => match[0].toLowerCase());
  return Array.from(new Set([...explicit, ...registryNames]));
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

  const rawPrompt = body.prompt?.trim();
  const size = body.size ?? '1024x1024';
  if (!rawPrompt) throw error(400, 'prompt is required');
  if (!VALID_SIZES.includes(size)) throw error(400, `size must be one of: ${VALID_SIZES.join(', ')}`);
  const renderMode = body.renderMode === 'illustration' ? 'illustration' : 'manga';
  const prompt = renderMode === 'illustration'
    ? `${rawPrompt}\nILLUSTRATION MODE: speech_bubble=false. Do not draw speech bubbles or dialogue text.`
    : `${rawPrompt}\nMANGA MODE: speech_bubble=true. If dialogue exists in the prompt, draw every dialogue line in a clear readable manga speech bubble. Never omit a speech bubble for existing dialogue.`;

  const settings = await readSettings();
  const requestModel = (body.model || body.selectedModel || '').replace(/\s+edit$/i, '').trim();
  const normalizedFallbackModel = normalizeSelectedModel(body);
  const resolveCandidate = requestModel || settings.mediaConfig.model || normalizedFallbackModel;
  logAvailableMediaModels();
  console.log('[api/generate] media model resolve candidates', {
    bodyProvider: body.provider ?? null,
    bodyModel: body.model ?? null,
    bodySelectedModel: body.selectedModel ?? null,
    requestModel,
    settingsMediaProvider: settings.mediaConfig.provider,
    settingsMediaModel: settings.mediaConfig.model,
    normalizedFallbackModel,
    resolveCandidate,
    selectedSource: requestModel
      ? 'requestModel'
      : settings.mediaConfig.model
        ? 'settings.mediaConfig.model'
        : 'normalizeSelectedModel',
  });
  const mediaModel = resolveMediaModel(resolveCandidate);
  const mediaProvider = mediaModel.provider;
  console.log('[PROVIDER RESOLUTION]');
  console.log('requestProvider:', body.provider ?? null);
  console.log('resolvedProvider:', mediaProvider);
  console.log('[api/generate] mediaProvider/mediaModel assignment', {
    assignedFrom: 'resolveMediaModel(resolveCandidate)',
    resolveCandidate,
    mediaProvider,
    mediaModelId: mediaModel.id,
    mediaModelApiModel: mediaModel.apiModel,
  });

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
  console.log({
    requestProvider: body.provider ?? null,
    requestModel: body.model ?? body.selectedModel ?? null,
    resolvedProvider: mediaProvider,
    resolvedModel: mediaModel.apiModel,
  });
  console.log('[IMAGE_GENERATION_ROUTE_AUDIT]', {
    USER_INPUT: body.userInput ?? '',
    ROUTER_RESULT: body.routerResult ?? null,
    FINAL_PROMPT: prompt,
  });
  console.log('[USER_INPUT]', body.userInput ?? '');
  console.log('[ROUTER_RESULT]', body.routerResult ?? null);
  console.log('[FINAL_PROMPT]', prompt);
  if (body.routerResult?.action === 'create_character_materials') {
    console.log(
      '[PROMPT_TEMPLATE][create_character_materials]',
      '{{user_input_with_self_reference_resolved}}\n{{character:<current_character_id> when self-reference is detected}}',
    );
    console.log('[ACTUAL_IMAGE_PROMPT][create_character_materials]', prompt);
  }

  const result = await generateMediaImage({
    prompt,
    size,
    model: mediaModel.apiModel,
    requestedModel: mediaModel.id,
    refImages,
    editMode,
  });
  const images: GeneratedImage[] = result.images;

  return json({
    images,
    requestProvider: body.provider ?? null,
    resolvedProvider: mediaProvider,
    resolvedModel: mediaModel.apiModel,
  });
};
