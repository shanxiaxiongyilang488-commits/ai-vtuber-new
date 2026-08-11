import { json } from '@sveltejs/kit';
import { createMiniMaxH3Task } from '$lib/server/minimaxH3';
import type { MiniMaxH3Mode, MiniMaxH3Ratio, MiniMaxH3Resolution } from '$lib/server/minimaxH3Payload';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json() as Record<string, unknown>;
    const task = await createMiniMaxH3Task({
      prompt: typeof body.prompt === 'string' ? body.prompt : '',
      mode: (body.mode === 'i2v' || body.mode === 'r2v' ? body.mode : 't2v') as MiniMaxH3Mode,
      duration: typeof body.duration === 'number' ? body.duration : 5,
      resolution: (body.resolution === '2K' ? '2K' : '768P') as MiniMaxH3Resolution,
      ratio: (typeof body.ratio === 'string' ? body.ratio : '16:9') as MiniMaxH3Ratio,
      imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
      imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.filter((value): value is string => typeof value === 'string') : undefined,
    });
    return json(task, { status: 202 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'MiniMax H3 task submission failed.';
    return json({ ok: false, message }, { status: 400 });
  }
};
