import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateFalVideo, resolveFalMediaModel } from '$lib/server/mediaProviders/fal';

interface VideoRequest {
  prompt: string;
  model?: string;
  duration?: number;
  audio?: boolean;
  referenceImage?: string;
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
  if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(body.referenceImage ?? '')) {
    throw error(400, 'referenceImage is required for Kling image-to-video');
  }
  const referenceImage = body.referenceImage as string;
  const duration = body.duration ?? 5;
  if (!Number.isInteger(duration) || duration < 3 || duration > 15) {
    throw error(400, 'duration must be an integer from 3 to 15 seconds');
  }

  const mediaProvider = 'fal';

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
  });

  return json({ url: result.url, model: result.model });
};
