import { findOutputString } from '$lib/server/runpodClient';
import {
  checkRunpodH3Pod,
  getRunpodPodStatus,
  resolveRunpodH3PodUrl,
  scheduleRunpodPodStop,
  startRunpodPod,
  type RunpodVoicePodConfig,
} from '$lib/server/runpodPod';
import type { ImageSize } from '$lib/server/imageProviders/types';
import type { RunpodSettings } from '$lib/server/settings';

function podConfig(settings: RunpodSettings): RunpodVoicePodConfig {
  return {
    apiKey: settings.apiKey,
    podId: settings.voicePodId,
    token: settings.voicePodToken,
    idleMinutes: settings.voicePodIdleMinutes,
  };
}

async function waitForPod(config: RunpodVoicePodConfig, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  do {
    if ((await checkRunpodH3Pod(config)).ready) return;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  } while (Date.now() < deadline);
  throw new Error('Anima Pod bridge did not become ready within 3 minutes.');
}

export async function generateRunpodAnimaImage(
  settings: RunpodSettings,
  input: { prompt: string; size: ImageSize; negative?: string; seed?: number },
): Promise<{ url: string; promptId?: string }> {
  if (!settings.voicePodEnabled || !settings.voicePodId.trim() || !settings.voicePodToken.trim()) {
    throw new Error('Anima requires the shared RunPod Pod. Enable the Pod and save its Pod ID and token in API Settings.');
  }
  const config = podConfig(settings);
  try {
    let health = await checkRunpodH3Pod(config);
    if (!health.ready) {
      const status = await getRunpodPodStatus(config);
      if (status.desiredStatus !== 'RUNNING') await startRunpodPod(config);
      await waitForPod(config, 3 * 60_000);
      health = await checkRunpodH3Pod(config);
    }
    if (!health.ready) throw new Error('Anima Pod bridge is unavailable.');
    const response = await fetch(`${resolveRunpodH3PodUrl(config.podId)}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.token?.trim() ?? ''}`,
      },
      body: JSON.stringify({
        input: {
          task: 'image.generate',
          model: 'Anima-Base-v1.0',
          prompt: input.prompt,
          size: input.size,
          ...(input.negative ? { negative: input.negative } : {}),
          ...(typeof input.seed === 'number' ? { seed: input.seed } : {}),
        },
      }),
      signal: AbortSignal.timeout(35 * 60_000),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim();
      throw new Error(`RunPod Anima HTTP ${response.status}${detail ? `: ${detail.slice(0, 1200)}` : ''}`);
    }
    const body = await response.json() as { output?: unknown };
    const imageBase64 = findOutputString(body.output, ['image_base64', 'imageBase64']);
    const mimeType = findOutputString(body.output, ['mime_type', 'mimeType']) || 'image/png';
    if (!imageBase64) throw new Error('RunPod Anima completed without an image.');
    const promptId = findOutputString(body.output, ['prompt_id', 'promptId']);
    scheduleRunpodPodStop(config);
    return {
      url: `data:${mimeType};base64,${imageBase64}`,
      ...(promptId ? { promptId } : {}),
    };
  } catch (error) {
    scheduleRunpodPodStop(config);
    throw error;
  }
}
