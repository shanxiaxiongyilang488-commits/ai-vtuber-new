import { json, error } from '@sveltejs/kit';
import { VIDEO_MODELS } from '$lib/config/videoModels';
import { generateVideo, type FalVideoMode } from '$lib/services/falVideo';
import { estimateVideoCostUsd } from '$lib/videoCost';
import { recordVideoUsage } from '$lib/server/videoUsage';
import { readSettings, type VideoBackend } from '$lib/server/settings';
import { generateLocalVideo } from '$lib/server/localVideoBridge';
import { generateMiniMaxH3 } from '$lib/server/minimaxH3';
import { generatePreferredRunpodH3 } from '$lib/server/runpodH3Router';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, fetch: eventFetch }) => {
  const body = await request.json() as { engine?: unknown; modelId?: unknown; videoMode?: unknown; imageUrl?: unknown; imageUrls?: unknown; videoUrl?: unknown; prompt?: unknown; duration?: unknown; executionBackend?: unknown };
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
  if (mode === 'r2v' && !['seedance', 'gemini-omni-flash', 'minimax', 'runpod-h3'].includes(model.provider)) throw error(400, `Video generation failed.\nprovider:${model.provider}\nmodelId:${model.id}\nfalModel:${model.falModel}\nmode:${mode}\nimageCount:${imageUrls.length}\nr2v is not configured for this provider.`);
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
  const minDuration = model.provider === 'minimax' || model.provider === 'runpod-h3' ? 1 : model.provider === 'gemini-omni-flash' && mode !== 'edit' ? 3 : 1;
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
  const settings = await readSettings();
  const requestedBackend = typeof body.executionBackend === 'string' ? body.executionBackend.trim().toLowerCase() : '';
  const executionBackend: VideoBackend = requestedBackend === 'fal' || requestedBackend === 'local' || requestedBackend === 'runpod'
    ? requestedBackend
    : settings.video.backend;
  console.log('[VIDEO_API_REQUEST]', { executionBackend, selectedVideoModel: model.id, referenceImageCount: mode === 'r2v' ? imageUrls.length : Number(Boolean(imageUrl)), falModelId: model.falModel, requestedDuration, duration, durationClamped: duration !== requestedDuration, motionPromptLength: prompt.length, requestPayload });

  if (model.provider === 'runpod-h3') {
    const hasPod = settings.runpod.voicePodEnabled
      && settings.runpod.voicePodId.trim()
      && settings.runpod.voicePodToken.trim();
    const hasServerless = settings.runpod.apiKey.trim() && settings.runpod.videoEndpointId.trim();
    if (!hasPod && !hasServerless) {
      throw error(400, 'Configure the shared RunPod Pod ID/token or the MiniMax H3 Serverless Endpoint ID in API Settings.');
    }
    const result = await generatePreferredRunpodH3(settings.runpod, {
      prompt,
      duration,
      mode: mode as 't2v' | 'i2v' | 'r2v',
      ...(imageUrl ? { imageUrl } : {}),
      ...(imageUrls.length ? { imageUrls } : {}),
    }, url, eventFetch);
    return json({
      url: result.url,
      requestId: result.requestId,
      source: 'runpod',
      backend: result.backend,
      provider: 'runpod-h3',
      modelId: model.id,
      mode,
      videoMode,
      model: 'MiniMax-H3',
      estimatedCostUsd: 0,
    });
  }

  if (model.provider === 'minimax') {
    const result = await generateMiniMaxH3({
      prompt,
      duration,
      mode: mode as 't2v' | 'i2v' | 'r2v',
      resolution: '768P',
      ratio: mode === 't2v' ? '16:9' : 'adaptive',
      ...(imageUrl ? { imageUrl } : {}),
      ...(imageUrls.length ? { imageUrls } : {}),
    });
    const estimatedCostUsd = estimateVideoCostUsd(model, duration);
    const usage = await recordVideoUsage(estimatedCostUsd);
    console.log('[MINIMAX_H3_VIDEO_RESPONSE]', { selectedVideoModel: model.id, taskId: result.taskId, videoUrl: result.url });
    return json({
      url: result.url,
      requestId: result.taskId,
      source: 'minimax',
      modelId: model.id,
      provider: 'minimax',
      mode,
      videoMode,
      model: 'MiniMax-H3',
      resolution: '768P',
      estimatedCostUsd,
      usage,
    });
  }

  if (executionBackend === 'local') {
    const result = await generateLocalVideo(settings.video.localUrl, {
      prompt,
      duration,
      mode,
      ...(imageUrl ? { imageUrl } : {}),
      ...(imageUrls.length ? { imageUrls } : {}),
      ...(videoUrl ? { videoUrl } : {}),
    });
    return json({
      url: result.url,
      source: 'local',
      provider: 'local-hunyuan',
      modelId: 'hunyuan-video-1.5',
      requestedModelId: model.id,
      mode,
      videoMode,
      estimatedCostUsd: 0,
    });
  }

  const result = await generateVideo({ modelId: model.id, provider: model.provider, falModel: model.falModel, mode: mode as FalVideoMode, videoMode, imageField: model.imageField, imageUrl, imageUrls, videoUrl, prompt, duration });
  const estimatedCostUsd = estimateVideoCostUsd(model, duration);
  const usage = await recordVideoUsage(estimatedCostUsd);
  console.log('[VIDEO_API_RESPONSE]', { selectedVideoModel: model.id, falModelId: result.model, requestId: result.requestId, videoUrl: result.url });
  return json({ url: result.url, requestId: result.requestId, queueResponse: result.queueResponse, source: 'fal', modelId: model.id, provider: model.provider, mode, videoMode, model: result.model, estimatedCostUsd, usage });
};
