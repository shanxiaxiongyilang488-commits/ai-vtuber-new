import { json } from '@sveltejs/kit';
import {
  computeCapabilities,
  computeSessionManager,
  computeSessionPolicy,
  type ComputeSessionAction,
} from '$lib/server/computeSessionManager';
import { readSettings } from '$lib/server/settings';
import type { RequestHandler } from './$types';

/** Optional voice-only warm lease used by the chat UI before TTS playback. */
export const GET: RequestHandler = async () => {
  const settings = await readSettings();
  const policy = computeSessionPolicy(settings);
  const capability = computeCapabilities(settings).voice;
  return json({
    configured: capability.configured,
    selected: capability.selected,
    warmIntervalSeconds: policy.keepaliveSeconds,
    idleSeconds: policy.idleSeconds,
    sessions: computeSessionManager.list(settings).filter((session) => session.capability === 'voice'),
    note: 'RunPod Serverless starts on the first warm request and scales down after its endpoint Idle Timeout.',
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({})) as { action?: unknown; sessionId?: unknown };
  const action: ComputeSessionAction = body.action === 'status' || body.action === 'keepalive' || body.action === 'stop'
    ? body.action
    : 'start';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;
  const settings = await readSettings();

  if (action !== 'stop' && settings.voice.ttsBackend !== 'runpod') {
    return json({ ok: false, action, state: 'disabled', message: 'Voice backend is not set to RunPod.' }, { status: 409 });
  }

  try {
    const session = await computeSessionManager.update({
      action,
      sessionId,
    }, settings);
    return json({
      ok: true,
      action,
      ...session,
      state: session.state === 'ready' ? 'warm' : session.state,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, action, state: 'error', message }, { status: /not configured/i.test(message) ? 400 : 502 });
  }
};
