import { json } from '@sveltejs/kit';
import { readSettings } from '$lib/server/settings';
import {
  cancelScheduledRunpodPodStop,
  checkRunpodVoicePod,
  getRunpodPodStatus,
  scheduleRunpodPodStop,
  startRunpodPod,
  stopRunpodPod,
} from '$lib/server/runpodPod';
import type { RequestHandler } from './$types';

function configFrom(settings: Awaited<ReturnType<typeof readSettings>>) {
  return {
    apiKey: settings.runpod.apiKey,
    podId: settings.runpod.voicePodId,
    baseUrl: settings.runpod.voicePodUrl,
    token: settings.runpod.voicePodToken,
    idleMinutes: settings.runpod.voicePodIdleMinutes,
  };
}

async function statusPayload(config: ReturnType<typeof configFrom>) {
  const [pod, voice] = await Promise.all([
    getRunpodPodStatus(config),
    checkRunpodVoicePod(config),
  ]);
  return {
    success: true,
    pod: {
      id: pod.id,
      name: pod.name,
      desiredStatus: pod.desiredStatus,
      lastStatusChange: pod.lastStatusChange,
      costPerHr: pod.costPerHr,
      gpu: pod.gpu?.displayName,
    },
    voice,
  };
}

export const GET: RequestHandler = async () => {
  try {
    const settings = await readSettings();
    return json(await statusPayload(configFrom(settings)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return json(
      { success: false, message: error instanceof Error ? error.message : 'Voice Pod check failed.' },
      { status: 502 },
    );
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({})) as { action?: unknown };
    const action = String(body.action ?? 'check');
    const settings = await readSettings();
    const config = configFrom(settings);
    if (action === 'start') {
      cancelScheduledRunpodPodStop();
      await startRunpodPod(config);
      scheduleRunpodPodStop(config);
      return json({ success: true, action, message: 'Voice Pod start requested.' });
    }
    if (action === 'stop') {
      cancelScheduledRunpodPodStop();
      await stopRunpodPod(config);
      return json({ success: true, action, message: 'Voice Pod stop requested.' });
    }
    if (action === 'check') {
      return json(await statusPayload(config), { headers: { 'Cache-Control': 'no-store' } });
    }
    return json({ success: false, message: 'Unsupported Voice Pod action.' }, { status: 400 });
  } catch (error) {
    return json(
      { success: false, message: error instanceof Error ? error.message : 'Voice Pod operation failed.' },
      { status: 502 },
    );
  }
};
