import { json } from '@sveltejs/kit';
import { getRunpodHealth } from '$lib/server/runpodClient';
import { readSettings } from '$lib/server/settings';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const settings = await readSettings();
  const requestedTarget = url.searchParams.get('target')?.trim().toLowerCase();
  const target = requestedTarget === 'h3' || requestedTarget === 'video' ? 'video' : 'voice';
  const endpointId = target === 'video'
    ? settings.runpod.videoEndpointId
    : settings.runpod.voiceEndpointId;
  if (!settings.runpod.apiKey || !endpointId) {
    return json({ ok: false, target, message: `RunPod ${target} endpoint is not configured.` }, { status: 400 });
  }
  try {
    const health = await getRunpodHealth({ apiKey: settings.runpod.apiKey, endpointId });
    return json({ ok: true, target, endpointId, health });
  } catch (error) {
    return json({ ok: false, target, endpointId, message: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
};
