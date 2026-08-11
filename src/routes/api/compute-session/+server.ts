import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const disabled = () => json({
  ok: false,
  message: 'Generic RunPod compute sessions are disabled. Only /api/runpod/voice-session is available.',
}, { status: 410 });

export const GET: RequestHandler = disabled;
export const POST: RequestHandler = disabled;
