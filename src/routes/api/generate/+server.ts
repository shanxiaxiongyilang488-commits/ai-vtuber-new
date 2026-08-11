import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readSettings } from '$lib/server/settings';
import { generateMediaImage, logAvailableMediaModels, resolveMediaModel } from '$lib/server/mediaProviders/registry';
import type { GeneratedImage, ImageSize } from '$lib/server/imageProviders/types';

const VALID_SIZES = ['1024x1024', '1024x1536', '1536x1024', '1792x1024', '1024x1792'] as const;

interface GenerateRequest {
  requestId?: string;
  flowId?: string;
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
  selectedModel?: string;
  editMode?: boolean;
  renderMode?: 'manga' | 'illustration';
  speechBubble?: boolean;
  refImage?: string;
  refImages?: string[];
}

function normalizeSelectedModel(body: GenerateRequest): string {
  const raw = (body.selectedModel || '').replace(/\s+edit$/i, '').trim();
  if (raw) return raw;
  return 'openai/gpt-image-2';
}

function imageRefDigest(value: string): string {
  let hash = 0;
  const step = Math.max(1, Math.floor(value.length / 64));
  for (let i = 0; i < value.length; i += step) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) >>> 0;
  }
  return `${value.length}:${hash.toString(16)}`;
}

function imageRefMeta(value: unknown, index: number, source = 'unknown') {
  const text = typeof value === 'string' ? value.trim() : '';
  return {
    index,
    source,
    accepted: /^(?:data:|https?:\/\/)/.test(text),
    kind: text.startsWith('data:') ? 'data-url' : (text.startsWith('http') ? 'url' : (text ? 'unknown' : 'empty')),
    mime: text.match(/^data:([^;]+);/)?.[1] ?? null,
    length: text.length,
    approxKB: Math.round(text.length / 1024),
    digest: text ? imageRefDigest(text) : '',
  };
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
  const flowId = body.requestId?.trim() || body.flowId?.trim() || `server-${Date.now()}`;
  console.log('[EDIT FLOW][API ENTRY]', {
    flowId,
    selectedModel: body.selectedModel ?? null,
    requestRefImages: body.refImages?.length ?? 0,
  });
  const size = body.size ?? '1024x1024';
  if (!rawPrompt) throw error(400, 'prompt is required');
  if (!VALID_SIZES.includes(size)) throw error(400, `size must be one of: ${VALID_SIZES.join(', ')}`);
  const renderMode = body.renderMode === 'illustration' ? 'illustration' : 'manga';
  const prompt = renderMode === 'illustration'
    ? `${rawPrompt}\nILLUSTRATION MODE: speech_bubble=false. Do not draw speech bubbles or dialogue text.`
    : `${rawPrompt}\nMANGA MODE: speech_bubble=true. If dialogue exists in the prompt, draw every dialogue line in a clear readable manga speech bubble. Never omit a speech bubble for existing dialogue.`;

  const settings = await readSettings();
  const requestModel = (body.selectedModel || '').replace(/\s+edit$/i, '').trim();
  const normalizedFallbackModel = normalizeSelectedModel(body);
  const resolveCandidate = requestModel || settings.mediaConfig.model || normalizedFallbackModel;
  logAvailableMediaModels();
  console.log('[api/generate] media model resolve candidates', {
    bodySelectedModel: body.selectedModel ?? null,
    requestModel,
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
  console.log('[api/generate] mediaProvider/mediaModel assignment', {
    assignedFrom: 'resolveMediaModel(resolveCandidate)',
    resolveCandidate,
    mediaProvider,
    mediaModelId: mediaModel.id,
    mediaModelApiModel: mediaModel.apiModel,
  });

  console.log('[api/generate] received selectedModel', body.selectedModel ?? null);
  console.log('[api/generate] settings mediaConfig', settings.mediaConfig);
  console.log('[api/generate] media priority', requestModel ? 'request.model' : 'settings.mediaConfig');
  console.log('[MEDIA_PROVIDER]', mediaProvider);
  console.log('[MEDIA_MODEL]', mediaModel.id);
  console.log('[REQUEST IMAGE MODEL]', body.selectedModel ?? '(none)');

  const receivedRefImages = Array.isArray(body.refImages)
    ? body.refImages
    : (typeof body.refImage === 'string' ? [body.refImage] : []);
  console.log('[IMAGE_REFS_RECEIVED]', {
    flowId,
    refs: receivedRefImages.map((ref, index) => imageRefMeta(ref, index, 'request')),
  });
  const requestRefImages = receivedRefImages
    .filter((img): img is string =>
      typeof img === 'string' && /^(?:data:|https?:\/\/)/.test(img.trim()),
    )
    .map((img) => img.trim());
  console.log('[REFERENCE_IMAGES]', {
    requestId: flowId,
    count: requestRefImages.length,
    received: receivedRefImages.length,
    dropped: receivedRefImages.length - requestRefImages.length,
  });
  const refImages = requestRefImages;
  const payload = { images: refImages };
  console.log('[API_GENERATE_PAYLOAD_IMAGES_LENGTH]', {
    'payload.images.length': payload.images.length,
    refImagesLength: refImages.length,
  });
  console.log('[IMAGE_REFS_FINAL_BEFORE_GENERATE]', {
    flowId,
    refs: refImages.map((ref, index) => imageRefMeta(ref, index, 'api/generate.final')),
  });
  if ((mediaModel.edit || body.editMode) && refImages.length === 0) {
    console.error('[EDIT FLOW][STOP BEFORE generateMediaImage]', {
      flowId,
      stage: 'reference_validation',
      reason: 'edit_model_requires_reference',
      selectedModel: body.selectedModel ?? mediaModel.id,
    });
    throw error(400, 'The selected Edit model requires a reference image');
  }
  const editMode = Boolean(mediaModel.edit) || Boolean(body.editMode) || refImages.length > 0;

  console.log('[REF IMAGES PIPELINE api/generate]', {
    requestRefImages: requestRefImages.length,
    finalRefImages: refImages.length,
    editMode,
    model: mediaModel.apiModel,
  });
  console.log('=== FINAL COMIC PROMPT ===', prompt);
  console.log('=== IMAGE MODEL ===', mediaModel.endpoint ?? mediaModel.apiModel);
  console.log('=== IMAGE REFS ===', refImages.map((ref, index) => imageRefMeta(ref, index, 'api/generate')));
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
    requestModel: body.selectedModel ?? null,
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

  const selectedModel = body.selectedModel?.trim() || requestModel || mediaModel.id;
  const resolvedTask = editMode ? 'image-to-image' : 'text-to-image';
  console.log('[BEFORE generateMediaImage]', {
    flowId,
    selectedModel,
    resolvedModel: mediaModel.apiModel,
    provider: mediaProvider,
    resolvedTask,
  });

  console.log('[EDIT FLOW][generateMediaImage CALL]', {
    flowId,
    selectedModel,
    resolvedModel: mediaModel.endpoint ?? mediaModel.apiModel,
    provider: mediaProvider,
    refImages: refImages.length,
  });
  console.log('[IMAGE_REFS_TO_GENERATE_MEDIA_IMAGE]', {
    flowId,
    refs: refImages.map((ref, index) => imageRefMeta(ref, index, 'generateMediaImage.refImages')),
  });
  const result = await generateMediaImage({
    prompt,
    size,
    selectedModelId: selectedModel,
    flowId,
    refImages,
    editMode,
  });
  const images: GeneratedImage[] = result.images;

  console.log('[EDIT FLOW][generateMediaImage RETURN]', {
    flowId,
    selectedModel,
    images: result.images.length,
    resolvedModel: result.model.endpoint ?? result.model.apiModel,
  });
  return json({
    images,
    resolvedModel: result.model.endpoint ?? result.model.apiModel,
    provider: result.model.provider,
    costLog: result.costLog ?? null,
  });
};
