import type { CharacterVoiceConfig } from '$lib/server/characterRegistry';
import {
  checkRunpodVoicePod,
  getRunpodPodStatus,
  scheduleRunpodPodStop,
  startRunpodPod,
  type RunpodVoicePodConfig,
} from '$lib/server/runpodPod';
import { synthesizeRunpodPodSpeech, synthesizeRunpodSpeech } from '$lib/server/runpodVoice';
import type { VoiceSynthesisResult } from '$lib/server/voiceBridge';
import type { RunpodSettings } from '$lib/server/settings';

export type RoutedRunpodVoiceResult = VoiceSynthesisResult & {
  backend: 'runpod-pod' | 'runpod-serverless';
  podStartRequested?: boolean;
};

function podConfig(settings: RunpodSettings): RunpodVoicePodConfig {
  return {
    apiKey: settings.apiKey,
    podId: settings.voicePodId,
    baseUrl: settings.voicePodUrl,
    token: settings.voicePodToken,
    idleMinutes: settings.voicePodIdleMinutes,
  };
}

async function requestPodStartIfNeeded(config: RunpodVoicePodConfig): Promise<boolean> {
  try {
    const status = await getRunpodPodStatus(config);
    if (status.desiredStatus === 'RUNNING') return false;
    await startRunpodPod(config);
    console.info('[runpod-voice] requested Pod start; using Serverless for this utterance');
    return true;
  } catch (error) {
    console.warn('[runpod-voice] unable to inspect/start preferred Pod:', error);
    return false;
  }
}

export async function synthesizePreferredRunpodSpeech(
  settings: RunpodSettings,
  characterId: string,
  voice: CharacterVoiceConfig,
  text: string,
  runtimeEnv: Record<string, string | undefined> = process.env,
  designVariant = '',
  deliveryOverride = false,
): Promise<RoutedRunpodVoiceResult> {
  let podStartRequested = false;
  if (settings.voicePodEnabled && settings.voicePodId.trim()) {
    const config = podConfig(settings);
    const health = await checkRunpodVoicePod(config);
    if (health.ready) {
      try {
        const result = await synthesizeRunpodPodSpeech(
          { podId: config.podId, baseUrl: health.baseUrl, token: config.token },
          characterId,
          voice,
          text,
          runtimeEnv,
          designVariant,
          settings.voiceModel,
          deliveryOverride,
        );
        scheduleRunpodPodStop(config);
        return { ...result, backend: 'runpod-pod' };
      } catch (error) {
        console.warn('[runpod-voice] preferred Pod synthesis failed; falling back to Serverless:', error);
      }
    } else {
      podStartRequested = await requestPodStartIfNeeded(config);
      // A start request can succeed even when this utterance falls back to Serverless.
      // Always arm the idle stop so that an unused GPU is not left running.
      scheduleRunpodPodStop(config);
    }
  }

  if (!settings.apiKey.trim() || !settings.voiceEndpointId.trim()) {
    const hint = podStartRequested
      ? 'The Voice Pod is starting, but no Serverless Voice Endpoint is configured for the first request.'
      : 'RunPod Serverless Voice Endpoint is not configured and the preferred Voice Pod is unavailable.';
    throw new Error(hint);
  }
  const result = await synthesizeRunpodSpeech(
    { apiKey: settings.apiKey, endpointId: settings.voiceEndpointId },
    characterId,
    voice,
    text,
    runtimeEnv,
    designVariant,
    settings.voiceModel,
    deliveryOverride,
  );
  return { ...result, backend: 'runpod-serverless', ...(podStartRequested ? { podStartRequested } : {}) };
}
