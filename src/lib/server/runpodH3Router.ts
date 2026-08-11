import type { RunpodSettings } from '$lib/server/settings';
import {
  checkRunpodH3Pod,
  getRunpodPodStatus,
  scheduleRunpodPodStop,
  startRunpodPod,
  type RunpodVoicePodConfig,
} from '$lib/server/runpodPod';
import {
  generateRunpodH3,
  generateRunpodPodH3,
  type RunpodH3Input,
} from '$lib/server/runpodH3';

export type RoutedRunpodH3Result = {
  url: string;
  requestId?: string;
  output: unknown;
  backend: 'runpod-pod' | 'runpod-serverless';
};

function podConfig(settings: RunpodSettings): RunpodVoicePodConfig {
  return {
    apiKey: settings.apiKey,
    podId: settings.voicePodId,
    token: settings.voicePodToken,
    idleMinutes: settings.voicePodIdleMinutes,
  };
}

async function waitForH3Pod(config: RunpodVoicePodConfig, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  do {
    const health = await checkRunpodH3Pod(config);
    if (health.ready) return health.baseUrl;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  } while (Date.now() < deadline);
  throw new Error('MiniMax H3 Pod bridge did not become ready within 3 minutes.');
}

export async function generatePreferredRunpodH3(
  settings: RunpodSettings,
  input: RunpodH3Input,
  requestUrl: URL,
  eventFetch: typeof fetch,
): Promise<RoutedRunpodH3Result> {
  let podFailure: unknown;
  if (settings.voicePodEnabled && settings.voicePodId.trim() && settings.voicePodToken.trim()) {
    const config = podConfig(settings);
    try {
      let health = await checkRunpodH3Pod(config);
      if (!health.ready) {
        const status = await getRunpodPodStatus(config);
        if (status.desiredStatus !== 'RUNNING') await startRunpodPod(config);
        await waitForH3Pod(config, 3 * 60_000);
        health = await checkRunpodH3Pod(config);
      }
      if (!health.ready) throw new Error('MiniMax H3 Pod bridge is unavailable.');
      const result = await generateRunpodPodH3(
        { podId: config.podId, token: config.token ?? '' },
        input,
        requestUrl,
        eventFetch,
      );
      scheduleRunpodPodStop(config);
      return {
        url: result.url,
        requestId: result.promptId,
        output: result.output,
        backend: 'runpod-pod',
      };
    } catch (error) {
      podFailure = error;
      scheduleRunpodPodStop(config);
      console.warn('[runpod-h3] preferred Pod failed; trying Serverless:', error);
    }
  }

  if (!settings.apiKey.trim() || !settings.videoEndpointId.trim()) {
    const detail = podFailure instanceof Error ? ` Pod error: ${podFailure.message}` : '';
    throw new Error(`Neither the MiniMax H3 Pod nor the Serverless fallback is available.${detail}`);
  }
  const result = await generateRunpodH3(
    { apiKey: settings.apiKey, endpointId: settings.videoEndpointId },
    input,
    requestUrl,
    eventFetch,
  );
  return {
    url: result.url,
    requestId: result.jobId,
    output: result.output,
    backend: 'runpod-serverless',
  };
}
