import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateFalVideo, resolveFalMediaModel } from '$lib/server/mediaProviders/fal';
import { estimateVideoCostUsd } from '$lib/videoCost';
import { recordVideoUsage } from '$lib/server/videoUsage';

interface VideoRequest {
  prompt: string;
  model?: string;
  duration?: number;
  audio?: boolean;
  referenceImage?: string;
  task?: string;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: VideoRequest;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const prompt = body.prompt?.trim();
  if (!prompt) throw error(400, 'prompt is required');
  const task = body.task?.trim().toLowerCase() || 'image-to-video';
  const requiresReference = /image|reference/.test(task);
  if (requiresReference && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(body.referenceImage ?? '')) {
    throw error(400, `referenceImage is required for ${task}`);
  }
  const referenceImage = body.referenceImage ?? '';
  const duration = body.duration ?? 5;
  if (!Number.isInteger(duration) || duration < 3 || duration > 15) {
    throw error(400, 'duration must be an integer from 3 to 15 seconds');
  }

  const mediaProvider = 'fal';
  console.log('[VIDEO_GENERATION_PROVIDER]', mediaProvider);

  const requestModel = body.model?.trim();
  const mediaModel = resolveFalMediaModel(
    requestModel || 'fal-ai/kling-video/v3/pro/image-to-video',
    'fal-ai/kling-video/v3/pro/image-to-video',
  );
  console.log('[MEDIA_PROVIDER]', mediaProvider);
  console.log('[MEDIA_MODEL]', mediaModel);

  const result = await generateFalVideo({
    prompt,
    model: mediaModel,
    duration,
    audio: body.audio === true,
    referenceImage,
    task,
  });
  const estimatedCostUsd = estimateVideoCostUsd({ falModel: mediaModel }, duration);
  const usage = await recordVideoUsage(estimatedCostUsd);

  return json({ url: result.url, model: result.model, estimatedCostUsd, usage });
};
