import { json, error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RequestHandler } from './$types';
import type { VideoPackage } from '../../../../core/videoPackageCore';
import { toEngineVideoRequest, type VideoEngine } from '$lib/videoPackageAdapter';
import { generateFalVideo } from '$lib/server/mediaProviders/fal';

type GenerateBody = { engine?: VideoEngine; model?: string; videoPackage?: VideoPackage };

async function localReferenceToDataUrl(referenceImage: string): Promise<string> {
  if (!referenceImage.startsWith('/assets/characters/')) return referenceImage;
  const fileName = referenceImage.split('/').at(-1);
  if (!fileName || !/^[a-z0-9_-]+\.png$/i.test(fileName)) throw error(400, 'Invalid default reference image');
  const file = await readFile(join(process.cwd(), 'static', 'assets', 'characters', fileName));
  return `data:image/png;base64,${file.toString('base64')}`;
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null) as GenerateBody | null;
  const engine = body?.engine;
  const videoPackage = body?.videoPackage;
  if (!engine || !['happy-oyster', 'fal', 'vidu', 'sora'].includes(engine)) throw error(400, 'A supported video engine is required');
  if (!videoPackage?.title || !Array.isArray(videoPackage.scenes) || videoPackage.scenes.length === 0) throw error(400, 'A complete Video Package is required');

  const engineRequest = toEngineVideoRequest(videoPackage, engine);
  if (body?.model?.trim()) {
    engineRequest.model = body.model.trim();
    if (engineRequest.model === 'fal-ai/kling-video/v3/pro/image-to-video') engineRequest.task = 'image-to-video';
  }
  engineRequest.referenceImage = await localReferenceToDataUrl(engineRequest.referenceImage);
  // FAL is connected today. Vidu has a FAL adapter model; HappyOyster remains an export-ready adapter
  // until its API endpoint and credentials are configured.
  if (engine === 'happy-oyster') {
    return json({ status: 'export-ready', engine, engineRequest, message: 'HappyOyster API is not configured. The converted storyboard is ready for its connector.' });
  }
  const result = await generateFalVideo({
    prompt: engineRequest.prompt,
    model: engineRequest.model,
    duration: engineRequest.duration,
    audio: false,
    referenceImage: engineRequest.referenceImage,
    task: engineRequest.task,
  });
  return json({ status: 'completed', engine, url: result.url, model: result.model, engineRequest });
};
