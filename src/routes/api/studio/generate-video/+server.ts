import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readSettings } from '$lib/server/settings';
import { generateFalVideo, resolveFalMediaModel } from '$lib/server/mediaProviders/fal';

interface VideoRequest {
  prompt: string;
  model?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
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

  const settings = await readSettings();
  const mediaProvider = settings.mediaConfig.provider;
  if (mediaProvider !== 'fal') throw error(400, `Unknown media provider: ${mediaProvider}`);

  const requestModel = body.model?.trim();
  const mediaModel = resolveFalMediaModel(requestModel || settings.mediaConfig.model || 'seedance', 'seedance');
  console.log('[MEDIA_PROVIDER]', mediaProvider);
  console.log('[MEDIA_MODEL]', mediaModel);

  const result = await generateFalVideo({
    prompt,
    model: mediaModel,
    duration: body.duration ?? 5,
    aspectRatio: body.aspectRatio ?? '16:9',
    resolution: body.resolution ?? '720p',
  });

  return json({ url: result.url, model: result.model });
};
