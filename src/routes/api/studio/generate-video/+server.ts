import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProviderKey } from '$lib/server/settings';

// ── Model registry ────────────────────────────────────────────────────────────
// Add new video models here; everything else adapts automatically.
const VIDEO_MODEL_CONFIG = {
  seedance: {
    // TODO: Update to the confirmed FAL endpoint once Seedance is publicly listed.
    // Check: https://fal.run/fal-ai/bytedance
    endpoint:    'https://fal.run/fal-ai/bytedance/seedance-1-0-lite-t2v',
    resultPath:  ['video', 'url'] as string[],
    buildBody:   (prompt: string, duration: number, aspectRatio: string, resolution: string) => ({
      prompt,
      duration,
      aspect_ratio:  aspectRatio,
      resolution,
    }),
  },
} as const;

type VideoModelId = keyof typeof VIDEO_MODEL_CONFIG;

interface VideoRequest {
  prompt:      string;
  model?:      VideoModelId;
  duration?:   number;
  aspectRatio?: string;
  resolution?:  string;
}

function getNestedValue(obj: unknown, path: string[]): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj;
  for (const key of path) { if (cur == null) return undefined; cur = cur[key]; }
  return typeof cur === 'string' ? cur : undefined;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: VideoRequest;
  try { body = await request.json(); }
  catch { throw error(400, 'Invalid JSON'); }

  const {
    prompt,
    model      = 'seedance',
    duration   = 5,
    aspectRatio = '16:9',
    resolution  = '720p',
  } = body;

  if (!prompt?.trim()) throw error(400, 'prompt is required');
  if (!(model in VIDEO_MODEL_CONFIG)) throw error(400, `Unknown video model: ${model}`);
  const falKey = await getProviderKey('fal');
  if (!falKey) throw error(500, 'FAL API key が未設定');

  const cfg = VIDEO_MODEL_CONFIG[model as VideoModelId];
  console.log(`[studio/generate-video] model=${model} duration=${duration} aspect=${aspectRatio}`);

  const falRes = await fetch(cfg.endpoint, {
    method:  'POST',
    headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(cfg.buildBody(prompt.trim(), duration, aspectRatio, resolution)),
    // Video generation can take 60-120 s; rely on platform timeout (e.g. Vercel 300 s).
  });

  if (!falRes.ok) {
    const msg = await falRes.text().catch(() => `HTTP ${falRes.status}`);
    console.error(`[studio/generate-video] ${model} error:`, msg.slice(0, 300));
    throw error(falRes.status >= 500 ? 500 : 400, `${model} API error: ${msg.slice(0, 200)}`);
  }

  const falData = await falRes.json();
  const videoUrl = getNestedValue(falData, cfg.resultPath);
  if (!videoUrl) throw error(500, `No video URL in response from ${model}`);

  console.log(`[studio/generate-video] ${model} ok → ${videoUrl.slice(0, 80)}`);
  return json({ url: videoUrl, model });
};
