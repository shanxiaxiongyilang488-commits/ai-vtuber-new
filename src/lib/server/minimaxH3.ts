import { readSettings } from '$lib/server/settings';
import {
  buildMiniMaxH3Payload,
  type BuildMiniMaxH3PayloadInput,
  type MiniMaxH3Payload,
} from '$lib/server/minimaxH3Payload';

const MINIMAX_API_BASE = 'https://api.minimax.io';

type MiniMaxBaseResponse = {
  status_code?: number;
  status_msg?: string;
};

type MiniMaxH3TaskResponse = {
  task_id?: string;
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | string;
  content?: { url?: string };
  base_resp?: MiniMaxBaseResponse;
  error?: { message?: string };
};

export type MiniMaxH3Task = {
  taskId: string;
  status: string;
  url?: string;
  raw: MiniMaxH3TaskResponse;
};

async function apiKey(): Promise<string> {
  const settings = await readSettings();
  const key = settings.minimax.key.trim() || process.env.MINIMAX_API_KEY?.trim() || '';
  if (!key) throw new Error('MiniMax API key is not configured. Open API Settings and save it first.');
  return key;
}

function assertMiniMaxSuccess(response: MiniMaxH3TaskResponse, fallback: string): void {
  const code = response.base_resp?.status_code;
  if (typeof code === 'number' && code !== 0) {
    throw new Error(response.base_resp?.status_msg || fallback);
  }
  if (response.error?.message) throw new Error(response.error.message);
}

async function miniMaxFetch(path: string, init?: RequestInit): Promise<MiniMaxH3TaskResponse> {
  const key = await apiKey();
  const response = await fetch(`${MINIMAX_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  let payload: MiniMaxH3TaskResponse = {};
  try {
    payload = text ? JSON.parse(text) as MiniMaxH3TaskResponse : {};
  } catch {
    throw new Error(`MiniMax API returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(payload.base_resp?.status_msg || payload.error?.message || `MiniMax API failed (HTTP ${response.status}).`);
  }
  assertMiniMaxSuccess(payload, `MiniMax API failed (HTTP ${response.status}).`);
  return payload;
}

export async function createMiniMaxH3Task(input: BuildMiniMaxH3PayloadInput): Promise<MiniMaxH3Task> {
  const requestPayload: MiniMaxH3Payload = buildMiniMaxH3Payload(input);
  const payload = await miniMaxFetch('/v2/video_generation', {
    method: 'POST',
    body: JSON.stringify(requestPayload),
  });
  const taskId = payload.task_id?.trim();
  if (!taskId) throw new Error('MiniMax H3 did not return a task ID.');
  return { taskId, status: payload.status ?? 'queued', raw: payload };
}

export async function queryMiniMaxH3Task(taskId: string): Promise<MiniMaxH3Task> {
  const cleanTaskId = taskId.trim();
  if (!cleanTaskId) throw new Error('MiniMax H3 task ID is required.');
  const payload = await miniMaxFetch(`/v2/query/video_generation/${encodeURIComponent(cleanTaskId)}`);
  return {
    taskId: payload.task_id?.trim() || cleanTaskId,
    status: payload.status ?? 'unknown',
    url: payload.content?.url,
    raw: payload,
  };
}

export async function cancelMiniMaxH3Task(taskId: string): Promise<MiniMaxH3Task> {
  const cleanTaskId = taskId.trim();
  if (!cleanTaskId) throw new Error('MiniMax H3 task ID is required.');
  const payload = await miniMaxFetch(`/v2/video_generation/${encodeURIComponent(cleanTaskId)}`, { method: 'DELETE' });
  return {
    taskId: payload.task_id?.trim() || cleanTaskId,
    status: payload.status ?? 'cancelled',
    raw: payload,
  };
}

export async function waitForMiniMaxH3Task(
  taskId: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<MiniMaxH3Task> {
  const timeoutMs = options.timeoutMs ?? 20 * 60 * 1000;
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const task = await queryMiniMaxH3Task(taskId);
    if (task.status === 'succeeded') {
      if (!task.url) throw new Error('MiniMax H3 completed without a video URL.');
      return task;
    }
    if (task.status === 'failed' || task.status === 'cancelled') {
      throw new Error(`MiniMax H3 task ${task.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error('MiniMax H3 generation timed out after 20 minutes. The task may still be running.');
}

export async function generateMiniMaxH3(input: BuildMiniMaxH3PayloadInput): Promise<MiniMaxH3Task> {
  const submitted = await createMiniMaxH3Task(input);
  return waitForMiniMaxH3Task(submitted.taskId);
}

export async function testMiniMaxH3Connection(): Promise<void> {
  await miniMaxFetch('/v2/query/video_generation?page_num=1&page_size=1&model=MiniMax-H3');
}
