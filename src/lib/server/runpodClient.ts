export type RunpodJobStatus =
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'CANCELLED'
  | string;

export type RunpodJobResponse = {
  id?: string;
  status?: RunpodJobStatus;
  output?: unknown;
  error?: unknown;
  delayTime?: number;
  executionTime?: number;
};

type RunpodCredentials = {
  apiKey: string;
  endpointId: string;
};

const RUNPOD_API_ROOT = 'https://api.runpod.ai/v2';

function validateCredentials(credentials: RunpodCredentials): void {
  if (!credentials.apiKey.trim()) throw new Error('RunPod API key is not configured.');
  if (!credentials.endpointId.trim()) throw new Error('RunPod endpoint ID is not configured.');
  if (!/^[A-Za-z0-9_-]+$/.test(credentials.endpointId.trim())) {
    throw new Error('RunPod endpoint ID contains invalid characters.');
  }
}

function endpointUrl(credentials: RunpodCredentials, operation: string): string {
  validateCredentials(credentials);
  return `${RUNPOD_API_ROOT}/${encodeURIComponent(credentials.endpointId.trim())}/${operation}`;
}

export function authorizationValue(apiKey: string): string {
  const normalized = apiKey.trim().replace(/^Bearer\s+/i, '');
  return `Bearer ${normalized}`;
}

async function runpodFetch(
  credentials: RunpodCredentials,
  operation: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<RunpodJobResponse> {
  const response = await fetch(endpointUrl(credentials, operation), {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: authorizationValue(credentials.apiKey),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  const raw = await response.text();
  let data: RunpodJobResponse = {};
  try {
    data = raw ? JSON.parse(raw) as RunpodJobResponse : {};
  } catch {
    if (!response.ok) throw new Error(`RunPod HTTP ${response.status}: ${raw.slice(0, 1000)}`);
    throw new Error('RunPod returned an invalid JSON response.');
  }
  if (!response.ok) {
    const detail = typeof data.error === 'string' ? data.error : raw;
    throw new Error(`RunPod HTTP ${response.status}${detail ? `: ${detail.slice(0, 2000)}` : ''}`);
  }
  return data;
}

function terminalError(job: RunpodJobResponse): Error {
  const detail = typeof job.error === 'string'
    ? job.error
    : job.error
      ? JSON.stringify(job.error)
      : 'The worker did not return an error message.';
  return new Error(`RunPod job ${job.status ?? 'FAILED'}${job.id ? ` (${job.id})` : ''}: ${detail}`);
}

export async function getRunpodHealth(credentials: RunpodCredentials): Promise<unknown> {
  return runpodFetch(credentials, 'health', { method: 'GET' });
}

export async function getRunpodJob(
  credentials: RunpodCredentials,
  jobId: string,
): Promise<RunpodJobResponse> {
  return runpodFetch(credentials, `status/${encodeURIComponent(jobId)}`, { method: 'GET' });
}

/** Submit a queue-based job without holding the HTTP request open while RunPod finds a GPU. */
export async function submitRunpodJob(
  credentials: RunpodCredentials,
  input: Record<string, unknown>,
): Promise<RunpodJobResponse> {
  return runpodFetch(credentials, 'run', {
    method: 'POST',
    body: JSON.stringify({ input }),
  });
}

/** Best-effort cancellation used when the app closes a pending warm-up session. */
export async function cancelRunpodJob(
  credentials: RunpodCredentials,
  jobId: string,
): Promise<RunpodJobResponse> {
  return runpodFetch(credentials, `cancel/${encodeURIComponent(jobId)}`, { method: 'POST' });
}

export async function waitForRunpodJob(
  credentials: RunpodCredentials,
  initial: RunpodJobResponse,
  options: { timeoutMs: number; pollIntervalMs?: number },
): Promise<RunpodJobResponse> {
  if (initial.status === 'COMPLETED') return initial;
  if (['FAILED', 'TIMED_OUT', 'CANCELLED'].includes(initial.status ?? '')) throw terminalError(initial);
  if (!initial.id) throw new Error('RunPod did not return a job ID.');

  const startedAt = Date.now();
  const pollIntervalMs = Math.min(15_000, Math.max(250, options.pollIntervalMs ?? 1_000));
  while (Date.now() - startedAt < options.timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const job = await getRunpodJob(credentials, initial.id);
    if (job.status === 'COMPLETED') return job;
    if (['FAILED', 'TIMED_OUT', 'CANCELLED'].includes(job.status ?? '')) throw terminalError(job);
  }
  throw new Error(`RunPod job ${initial.id} did not finish within ${Math.round(options.timeoutMs / 1000)} seconds.`);
}

/**
 * Reliable interactive path built on RunPod's asynchronous queue.
 *
 * `/runsync` holds a single HTTP connection while a GPU is being provisioned.
 * During low capacity that connection can time out before the worker starts,
 * even though the job itself is still valid. Submitting through `/run` and
 * polling `/status` keeps the chat request attached to the real job instead.
 */
export async function runRunpodInteractive(
  credentials: RunpodCredentials,
  input: Record<string, unknown>,
  timeoutMs = 10 * 60_000,
): Promise<RunpodJobResponse> {
  const initial = await submitRunpodJob(credentials, input);
  return waitForRunpodJob(credentials, initial, { timeoutMs, pollIntervalMs: 500 });
}

export function findOutputString(output: unknown, keys: readonly string[]): string {
  if (typeof output === 'string') return output;
  if (!output || typeof output !== 'object') return '';
  const record = output as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findOutputString(item, keys);
        if (found) return found;
      }
    } else if (value && typeof value === 'object') {
      const found = findOutputString(value, keys);
      if (found) return found;
    }
  }
  return '';
}
