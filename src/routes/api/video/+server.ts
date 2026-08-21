import { json, error } from '@sveltejs/kit';
import { VIDEO_MODELS } from '$lib/config/videoModels';
import { generateVideo, type FalVideoMode } from '$lib/services/falVideo';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json() as { engine?: unknown; modelId?: unknown; videoMode?: unknown; imageUrl?: unknown; imageUrls?: unknown; videoUrl?: unknown; prompt?: unknown; duration?: unknown };
  const engine = typeof body.engine === 'string' ? body.engine.trim().toLowerCase() : '';
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  const modelId = typeof body.modelId === 'string' && body.modelId.trim()
    ? body.modelId.trim()
    : engine === 'sora'
      ? (imageUrl ? 'sora-2-i2v' : 'sora-2-t2v')
      : '';
  const model = VIDEO_MODELS.find((candidate) => candidate.id === modelId);
  if (!model) throw error(400, `Video generation failed.\nmodelId:${modelId || '(missing)'}\nfalModel:(unresolved)`);
  if (!model.enabled) throw error(400, `Video generation failed.\nmodelId:${model.id}\nfalModel:${model.falModel || '(unconfigured)'}\nThis model is preparing.`);
  const requestedVideoMode = body.videoMode === 'draft' || body.videoMode === 'production' ? body.videoMode : undefined;
  const videoMode = model.videoMode === 'draft' || model.id === 'seedance-2-mini-reference'
    ? 'draft'
    : (requestedVideoMode ?? model.videoMode ?? 'production');
  const mode = model.mode;
  if (mode === 'i2v' && !imageUrl) throw error(400, `Video generation failed.\nmodelId:${model.id}\nfalModel:${model.falModel}\nimageUrl is required for i2v.`);
  const imageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim())
    : [];
  if (mode === 'r2v' && imageUrls.length === 0) throw error(400, `Video generation failed.\nprovider:${model.provider}\nmodelId:${model.id}\nfalModel:${model.falModel}\nmode:${mode}\nimageCount:0\nimageUrls are required for r2v.`);
  if (mode === 'r2v' && !['seedance', 'gemini-omni-flash'].includes(model.provider)) throw error(400, `Video generation failed.\nprovider:${model.provider}\nmodelId:${model.id}\nfalModel:${model.falModel}\nmode:${mode}\nimageCount:${imageUrls.length}\nr2v is not configured for this provider.`);
  if (mode === 'edit' && !videoUrl) throw error(400, `Video generation failed.\nmodelId:${model.id}\nfalModel:${model.falModel}\nvideoUrl is required for edit.`);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) throw error(400, `Video generation failed.\nmodelId:${model.id}\nfalModel:${model.falModel}\nprompt is required.`);
  const requestedDuration = typeof body.duration === 'number' ? body.duration : 5;
  const isSeedanceMini = model.id === 'seedance-2-mini-reference';
  const safeDuration = isSeedanceMini
    ? Math.min(15, Math.max(1, Math.round(requestedDuration)))
    : requestedDuration;
  const isGeminiOmniFlash = model.falModel.includes('gemini-omni-flash');
  const duration = isGeminiOmniFlash
    ? Math.min(10, Math.max(3, requestedDuration))
    : safeDuration;
  const minDuration = model.provider === 'gemini-omni-flash' && mode !== 'edit' ? 3 : 1;
  const maxDuration = model.provider === 'sora' ? 20 : model.provider === 'gemini-omni-flash' ? 10 : 15;
  if (mode !== 'edit' && (!Number.isInteger(duration) || duration < minDuration || duration > maxDuration)) throw error(400, `Video generation failed.\nmodelId:${model.id}\nfalModel:${model.falModel}\nduration must be an integer from ${minDuration} to ${maxDuration}.`);

  if (isSeedanceMini) {
    console.log('[SEEDANCE_MINI_PAYLOAD]', {
      duration: requestedDuration,
      safeDuration,
      imageCount: imageUrls.length,
      modelId: model.id,
    });
  }

  const requestPayload = { modelId: model.id, videoMode, imageUrl, imageUrls, videoUrl, prompt, duration };
  console.log('[VIDEO_API_REQUEST]', { selectedVideoModel: model.id, referenceImageCount: mode === 'r2v' ? imageUrls.length : Number(Boolean(imageUrl)), falModelId: model.falModel, requestedDuration, duration, durationClamped: duration !== requestedDuration, motionPromptLength: prompt.length, requestPayload });
  const result = await generateVideo({ modelId: model.id, provider: model.provider, falModel: model.falModel, mode: mode as FalVideoMode, videoMode, imageField: model.imageField, imageUrl, imageUrls, videoUrl, prompt, duration });
  console.log('[VIDEO_API_RESPONSE]', { selectedVideoModel: model.id, falModelId: result.model, requestId: result.requestId, videoUrl: result.url });
  return json({ url: result.url, requestId: result.requestId, queueResponse: result.queueResponse, source: 'fal', modelId: model.id, provider: model.provider, mode, videoMode, model: result.model });
};
