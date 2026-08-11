const RUNPOD_REST_BASE = 'https://rest.runpod.io/v1';
const DEFAULT_VOICE_PORT = 8791;

export type RunpodPodStatus = {
  id: string;
  name?: string;
  desiredStatus?: 'RUNNING' | 'EXITED' | 'TERMINATED' | string;
  lastStatusChange?: string;
  costPerHr?: number | string;
  gpu?: { displayName?: string };
};

export type RunpodVoicePodConfig = {
  apiKey: string;
  podId: string;
  baseUrl?: string;
  token?: string;
  idleMinutes?: number;
};

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function safePodId(value: string): string {
  const podId = required(value, 'RunPod Pod ID');
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(podId)) throw new Error('RunPod Pod ID is invalid.');
  return podId;
}

export function resolveRunpodVoicePodUrl(podId: string, configuredUrl = ''): string {
  const id = safePodId(podId);
  const raw = configuredUrl.trim() || `https://${id}-${DEFAULT_VOICE_PORT}.proxy.runpod.net`;
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('RunPod Voice Pod URL must use HTTPS.');
  const expectedSuffix = '.proxy.runpod.net';
  if (!url.hostname.endsWith(expectedSuffix)) {
    throw new Error('RunPod Voice Pod URL must be a RunPod proxy URL.');
  }
  if (!url.hostname.startsWith(`${id}-`)) {
    throw new Error('RunPod Voice Pod URL does not match the configured Pod ID.');
  }
  return url.toString().replace(/\/+$/, '');
}

async function restRequest(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const key = required(apiKey, 'RunPod API key').replace(/^Bearer\s+/i, '');
  const response = await fetch(`${RUNPOD_REST_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim();
    throw new Error(`RunPod Pod API HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ''}`);
  }
  return response;
}

export async function getRunpodPodStatus(config: RunpodVoicePodConfig): Promise<RunpodPodStatus> {
  const podId = safePodId(config.podId);
  const response = await restRequest(config.apiKey, `/pods/${encodeURIComponent(podId)}`);
  return response.json() as Promise<RunpodPodStatus>;
}

export async function startRunpodPod(config: RunpodVoicePodConfig): Promise<void> {
  const podId = safePodId(config.podId);
  await restRequest(config.apiKey, `/pods/${encodeURIComponent(podId)}/start`, { method: 'POST' });
}

export async function stopRunpodPod(config: RunpodVoicePodConfig): Promise<void> {
  const podId = safePodId(config.podId);
  await restRequest(config.apiKey, `/pods/${encodeURIComponent(podId)}/stop`, { method: 'POST' });
}

export async function checkRunpodVoicePod(config: RunpodVoicePodConfig): Promise<{
  ready: boolean;
  baseUrl: string;
  health?: Record<string, unknown>;
}> {
  const baseUrl = resolveRunpodVoicePodUrl(config.podId, config.baseUrl);
  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: config.token?.trim() ? { authorization: `Bearer ${config.token.trim()}` } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { ready: false, baseUrl };
    const health = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { ready: health.status === 'ok', baseUrl, health };
  } catch {
    return { ready: false, baseUrl };
  }
}

let stopTimer: ReturnType<typeof setTimeout> | null = null;
let latestStopConfig: RunpodVoicePodConfig | null = null;

async function comfyQueueIsBusy(podId: string): Promise<boolean> {
  try {
    const response = await fetch(`https://${safePodId(podId)}-8188.proxy.runpod.net/queue`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const data = await response.json() as { queue_running?: unknown[]; queue_pending?: unknown[] };
    return Boolean(data.queue_running?.length || data.queue_pending?.length);
  } catch {
    return false;
  }
}

export function scheduleRunpodPodStop(config: RunpodVoicePodConfig): void {
  const idleMinutes = Math.max(0, Number(config.idleMinutes) || 0);
  if (!idleMinutes) return;
  latestStopConfig = { ...config, idleMinutes };
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = setTimeout(async () => {
    const active = latestStopConfig;
    if (!active) return;
    try {
      if (await comfyQueueIsBusy(active.podId)) {
        scheduleRunpodPodStop({ ...active, idleMinutes: 5 });
        return;
      }
      await stopRunpodPod(active);
      latestStopConfig = null;
      stopTimer = null;
      console.info('[runpod-pod] stopped idle shared voice/video Pod');
    } catch (error) {
      console.warn('[runpod-pod] automatic stop failed:', error);
      scheduleRunpodPodStop({ ...active, idleMinutes: 5 });
    }
  }, idleMinutes * 60_000);
  stopTimer.unref?.();
}

export function cancelScheduledRunpodPodStop(): void {
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = null;
  latestStopConfig = null;
}
