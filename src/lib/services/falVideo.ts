import { error } from '@sveltejs/kit';
import { getProviderKey } from '$lib/server/settings';
export type FalVideoMode = 'i2v' | 't2v' | 'r2v' | 'edit';
export type VideoGenerationIntentMode = 'draft' | 'production';

type FalQueueResponse = { request_id?: string; status_url?: string; response_url?: string };
type FalVideoResult = { video?: { url?: string }; videos?: Array<{ url?: string }>; output?: { video?: { url?: string } }; url?: string };

function providerForFalModel(falModel: string): 'grok' | 'kling' | 'vidu' | 'seedance' | 'sora' | 'gemini-omni-flash' | 'unknown' {
  if (falModel.startsWith('xai/grok-')) return 'grok';
  if (falModel.startsWith('fal-ai/kling-video/')) return 'kling';
  if (falModel.startsWith('fal-ai/vidu/')) return 'vidu';
  if (falModel.startsWith('bytedance/seedance-2.0/')) return 'seedance';
  if (falModel.startsWith('fal-ai/sora-2/')) return 'sora';
  if (falModel.startsWith('google/gemini-omni-flash')) return 'gemini-omni-flash';
  return 'unknown';
}

function timeoutMsForProvider(provider: ReturnType<typeof providerForFalModel>, mode: FalVideoMode): number {
  if (provider === 'grok') return 90_000;
  if (provider === 'seedance' && mode === 'r2v') return 600_000;
  if (provider === 'sora') return 600_000;
  if (provider === 'gemini-omni-flash') return 600_000;
  if (provider === 'kling' || provider === 'vidu') return 300_000;
  return 300_000;
}

function videoUrlFrom(result: FalVideoResult): string {
  return result.video?.url ?? result.videos?.[0]?.url ?? result.output?.video?.url ?? result.url ?? '';
}

function nearestSoraDuration(duration: number): 4 | 8 | 12 | 16 | 20 {
  const allowed = [4, 8, 12, 16, 20] as const;
  return allowed.reduce((nearest, candidate) =>
    Math.abs(candidate - duration) < Math.abs(nearest - duration) ? candidate : nearest,
  );
}

function requestBody(falModel: string, mode: FalVideoMode, imageField: 'image_url' | 'start_image_url' | 'image_urls' | undefined, imageUrl: string, imageUrls: string[], videoUrl: string, prompt: string, duration: number): Record<string, unknown> {
  if (falModel.startsWith('google/gemini-omni-flash/')) {
    return {
      prompt,
      ...(mode === 'edit' ? { video_url: videoUrl } : { aspect_ratio: '16:9', duration }),
      ...(mode === 'i2v' ? { image_url: imageUrl } : {}),
      ...(mode === 'r2v' ? { image_urls: imageUrls } : {}),
    };
  }
  if (falModel.startsWith('fal-ai/sora-2/')) {
    return {
      prompt,
      duration: nearestSoraDuration(duration),
      model: 'sora-2',
      delete_video: true,
      ...(mode === 'i2v' ? { resolution: 'auto', aspect_ratio: 'auto', image_url: imageUrl } : { resolution: '720p', aspect_ratio: '16:9' }),
    };
  }
  return {
    prompt,
    duration: String(duration),
    ...(mode === 'i2v' ? { [imageField ?? 'image_url']: imageUrl } : {}),
    ...(mode === 'r2v' ? { image_urls: imageUrls } : {}),
  };
}

export async function generateVideo({
  modelId,
  provider,
  falModel,
  mode,
  videoMode = 'production',
  imageField,
  imageUrl,
  imageUrls = [],
  videoUrl,
  prompt,
  duration,
}: {
  modelId: string;
  provider: string;
  falModel: string;
  mode: FalVideoMode;
  videoMode?: VideoGenerationIntentMode;
  imageField?: 'image_url' | 'start_image_url' | 'image_urls';
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  prompt: string;
  duration: number;
}): Promise<{ url: string; model: string; requestId: string; queueResponse: FalQueueResponse }> {
  const falKey = await getProviderKey('fal');
  if (!falKey) throw error(500, 'FAL API key is not configured');

  const imageCount = mode === 'r2v' ? imageUrls.length : imageUrl ? 1 : 0;
  const failureContext = `provider:${provider}\nmodelId:${modelId}\nfalModel:${falModel}\nmode:${mode}\nvideoMode:${videoMode}\nimageCount:${imageCount}`;
  if (mode === 'i2v' && !imageUrl) throw error(400, `Video generation failed.\n${failureContext}\nimageUrl is required for i2v.`);
  if (mode === 'r2v' && imageUrls.length < 1) throw error(400, `Video generation failed.\n${failureContext}\nimageUrls must contain at least 1 image for r2v.`);
  if (mode === 'edit' && !videoUrl) throw error(400, `Video generation failed.\n${failureContext}\nvideoUrl is required for edit.`);
  if (mode === 'r2v' && !['bytedance/seedance-2.0/reference-to-video', 'bytedance/seedance-2.0/mini/reference-to-video', 'google/gemini-omni-flash/reference-to-video'].includes(falModel)) throw error(400, `Video generation failed.\n${failureContext}\nr2v requires a supported Reference to Video FAL model.`);
  const model = falModel;
  const timeoutProvider = providerForFalModel(model);
  const normalizedDuration = model.includes('gemini-omni-flash')
    ? Math.min(10, Math.max(3, duration))
    : duration;
  const requestPayload = requestBody(model, mode, imageField, imageUrl ?? '', imageUrls, videoUrl ?? '', prompt, normalizedDuration);
  console.log('[FAL_VIDEO_REQUEST]', { falModelId: model, requestedDuration: duration, duration: normalizedDuration, durationClamped: normalizedDuration !== duration, requestPayload });
  if (model.includes('gemini-omni-flash')) {
    console.log('[GEMINI_OMNI_FLASH_FAL_PAYLOAD]', {
      modelId: model,
      duration: mode === 'edit' ? undefined : normalizedDuration,
      image_urls: mode === 'r2v' ? imageUrls : undefined,
      prompt,
    });
  }
  const response = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestPayload),
  });
  const responseBody = await response.text();
  if (!response.ok) {
    console.error('[FAL_VIDEO_SUBSCRIBE_ERROR]', { modelId, falModel: model, status: response.status, body: responseBody });
    throw error(response.status, `Video generation failed.\n${failureContext}\nHTTP: ${response.status}\nBody:\n${responseBody}`);
  }

  const queued = JSON.parse(responseBody) as FalQueueResponse;
  if (!queued.request_id || !queued.status_url || !queued.response_url) {
    throw error(502, `Video generation failed.\n${failureContext}\nInvalid FAL queue response.`);
  }
  console.log('[FAL_VIDEO_QUEUE_CREATED]', {
    falModelId: model,
    requestId: queued.request_id,
    queueResponse: queued,
  });
  console.log('[FAL_VIDEO_SUBSCRIBED]', { modelId, falModel: model, videoMode, requestId: queued.request_id });

  const startedAt = Date.now();
  const timeoutMs = timeoutMsForProvider(timeoutProvider, mode);
  const deadline = startedAt + timeoutMs;
  let lastStatusBody = '';
  const isSeedanceMini = model === 'bytedance/seedance-2.0/mini/reference-to-video';
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (isSeedanceMini) {
      console.log('[SEEDANCE_FETCH_DEBUG]', {
        requestId: queued.request_id,
        statusUrl: queued.status_url,
        responseUrl: queued.response_url,
        modelId,
      });
    }
    let statusResponse: Response;
    try {
      statusResponse = await fetch(queued.status_url, { headers: { Authorization: `Key ${falKey}` } });
    } catch (caught) {
      const fetchError = caught instanceof Error ? caught : new Error(String(caught));
      if (isSeedanceMini) {
        console.error('[SEEDANCE_FETCH_ERROR]', {
          phase: 'status',
          requestId: queued.request_id,
          statusUrl: queued.status_url,
          responseUrl: queued.response_url,
          modelId,
          cause: fetchError.cause,
          stack: fetchError.stack,
          message: fetchError.message,
        });
      }
      throw caught;
    }
    const statusBody = await statusResponse.text();
    lastStatusBody = statusBody;
    if (!statusResponse.ok) {
      throw error(statusResponse.status, `Video generation failed.\n${failureContext}\nHTTP: ${statusResponse.status}\nBody:\n${statusBody}`);
    }
    const status = JSON.parse(statusBody) as { status?: string; error?: unknown };
    if (status.status === 'FAILED') {
      throw error(500, `Video generation failed.\n${failureContext}\nBody:\n${JSON.stringify(status.error ?? status)}`);
    }
    if (status.status !== 'COMPLETED') continue;

    if (isSeedanceMini) {
      console.log('[SEEDANCE_FETCH_DEBUG]', {
        requestId: queued.request_id,
        statusUrl: queued.status_url,
        responseUrl: queued.response_url,
        modelId,
      });
    }
    let resultResponse: Response;
    try {
      resultResponse = await fetch(queued.response_url, { headers: { Authorization: `Key ${falKey}` } });
    } catch (caught) {
      const fetchError = caught instanceof Error ? caught : new Error(String(caught));
      if (isSeedanceMini) {
        console.error('[SEEDANCE_FETCH_ERROR]', {
          phase: 'response',
          requestId: queued.request_id,
          statusUrl: queued.status_url,
          responseUrl: queued.response_url,
          modelId,
          cause: fetchError.cause,
          stack: fetchError.stack,
          message: fetchError.message,
        });
      }
      throw caught;
    }
    const resultBody = await resultResponse.text();
    if (!resultResponse.ok) {
      throw error(resultResponse.status, `Video generation failed.\n${failureContext}\nHTTP: ${resultResponse.status}\nBody:\n${resultBody}`);
    }
    const url = videoUrlFrom(JSON.parse(resultBody) as FalVideoResult);
    if (!url) throw error(502, `Video generation failed.\n${failureContext}\nNo video URL in FAL response.`);
    console.log('[FAL_VIDEO_COMPLETED]', {
      falModelId: model,
      requestId: queued.request_id,
      queueResponse: queued,
      videoUrl: url,
    });
    return { url, model, requestId: queued.request_id, queueResponse: queued };
  }

  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  throw error(504, `Video generation failed.\n${failureContext}\nelapsed:${elapsedSeconds}s\ntimeout:${Math.round(timeoutMs / 1000)}s\nlastStatus:\n${lastStatusBody || '(no status response)'}\nFAL job timed out.`);
}
