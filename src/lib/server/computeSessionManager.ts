import { randomUUID } from 'node:crypto';
import { cancelRunpodJob, getRunpodHealth, getRunpodJob, type RunpodJobResponse } from '$lib/server/runpodClient';
import { submitRunpodVoiceWarmup } from '$lib/server/runpodVoice';
import type { ApiSettings } from '$lib/server/settings';

export type ComputeSessionAction = 'start' | 'status' | 'keepalive' | 'stop';

export type VoiceSessionSnapshot = {
  sessionId: string;
  capability: 'voice';
  target: 'runpod';
  state: 'waiting-gpu' | 'starting' | 'ready' | 'cooling-down';
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  nextKeepaliveSeconds: number;
  message: string;
  jobId?: string;
  delayTime?: number;
  executionTime?: number;
};

type VoiceSessionRecord = VoiceSessionSnapshot & {
  lastWarmAt: number;
  lastHealthAt: number;
  workerInitializing: boolean;
};
type WarmResult = { jobId?: string; status?: string; delayTime?: number; executionTime?: number };

function hasUsableWorker(health: unknown): boolean {
  if (!health || typeof health !== 'object') return false;
  const workers = (health as { workers?: unknown }).workers;
  if (!workers || typeof workers !== 'object') return false;
  const counts = workers as Record<string, unknown>;
  return ['ready', 'idle', 'running'].some((key) => Number(counts[key] ?? 0) > 0);
}

export type VoiceSessionPolicy = {
  idleSeconds: number;
  keepaliveSeconds: number;
  maxActiveSessions: number;
};

function keepaliveSeconds(settings: ApiSettings): number {
  return Math.max(10, Math.min(
    settings.runpod.voiceWarmIntervalSeconds,
    Math.floor(settings.runpod.sessionIdleSeconds * 0.75),
  ));
}

export function computeSessionPolicy(settings: ApiSettings): VoiceSessionPolicy {
  return {
    idleSeconds: settings.runpod.sessionIdleSeconds,
    keepaliveSeconds: keepaliveSeconds(settings),
    maxActiveSessions: settings.runpod.maxActiveSessions,
  };
}

export function computeCapabilities(settings: ApiSettings) {
  return {
    voice: {
      configured: Boolean(settings.runpod.apiKey.trim() && settings.runpod.voiceEndpointId.trim()),
      selected: settings.voice.ttsBackend === 'runpod',
    },
  };
}

export class ComputeSessionManager {
  constructor(private readonly sessions: Map<string, VoiceSessionRecord>) {}

  list(settings: ApiSettings): VoiceSessionSnapshot[] {
    this.prune();
    return [...this.sessions.values()].map((record) => this.publicSnapshot(record, settings));
  }

  async update(
    request: { action: ComputeSessionAction; sessionId?: string },
    settings: ApiSettings,
  ): Promise<VoiceSessionSnapshot> {
    this.prune();
    const sessionId = request.sessionId?.trim().slice(0, 100) || randomUUID();
    const existing = this.sessions.get(sessionId);
    const policy = computeSessionPolicy(settings);
    const now = Date.now();

    if (request.action === 'stop') {
      if (existing?.jobId && existing.state !== 'ready') {
        await cancelRunpodJob({
          apiKey: settings.runpod.apiKey,
          endpointId: settings.runpod.voiceEndpointId,
        }, existing.jobId).catch(() => undefined);
      }
      this.sessions.delete(sessionId);
      return {
        sessionId,
        capability: 'voice',
        target: 'runpod',
        state: 'cooling-down',
        createdAt: existing?.createdAt ?? now,
        lastActiveAt: now,
        expiresAt: now,
        nextKeepaliveSeconds: policy.keepaliveSeconds,
        message: 'Keepaliveを停止しました。RunPodはIdle Timeout後に自動終了します。',
      };
    }

    this.assertConfigured(settings);
    if (request.action === 'status' && existing) {
      existing.lastActiveAt = now;
      existing.expiresAt = now + policy.idleSeconds * 1_000;
      return this.refresh(existing, settings);
    }
    if (!existing && this.sessions.size >= policy.maxActiveSessions) {
      throw new Error(`RunPod voice session limit reached (${policy.maxActiveSessions}).`);
    }

    const record: VoiceSessionRecord = existing ?? {
      sessionId,
      capability: 'voice',
      target: 'runpod',
      state: 'waiting-gpu',
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + policy.idleSeconds * 1_000,
      nextKeepaliveSeconds: policy.keepaliveSeconds,
      message: 'RunPodへ起動要求を送信しています…',
      lastWarmAt: 0,
      lastHealthAt: 0,
      workerInitializing: false,
    };
    record.lastActiveAt = now;
    record.expiresAt = now + policy.idleSeconds * 1_000;
    record.nextKeepaliveSeconds = policy.keepaliveSeconds;

    if (existing && (record.state === 'waiting-gpu' || record.state === 'starting')) {
      this.sessions.set(sessionId, record);
      return record.jobId ? this.refresh(record, settings) : this.publicSnapshot(record, settings);
    }

    // Avoid submitting duplicate warm jobs when UI events arrive close together.
    if (record.lastWarmAt && now - record.lastWarmAt < policy.keepaliveSeconds * 700) {
      record.state = 'ready';
      record.message = 'RunPod Voice Workerは準備済みです。';
      this.sessions.set(sessionId, record);
      return this.publicSnapshot(record, settings);
    }

    this.sessions.set(sessionId, record);
    try {
      const health = await getRunpodHealth({
        apiKey: settings.runpod.apiKey,
        endpointId: settings.runpod.voiceEndpointId,
      }).catch(() => null);
      if (hasUsableWorker(health)) {
        record.state = 'ready';
        record.lastWarmAt = now;
        record.message = 'RunPod Voice Workerへ再接続しました。';
        return this.publicSnapshot(record, settings);
      }
      record.state = 'waiting-gpu';
      record.message = 'RunPodへ起動要求を送信しています…';
      const result: WarmResult = await submitRunpodVoiceWarmup({
        apiKey: settings.runpod.apiKey,
        endpointId: settings.runpod.voiceEndpointId,
      }, sessionId, settings.runpod.voiceModel);
      Object.assign(record, result);
      if (!record.jobId) throw new Error('RunPod did not return a warm-up job ID.');
      return this.applyJob(record, { id: record.jobId, status: result.status }, settings);
    } catch (error) {
      this.sessions.delete(sessionId);
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  private async refresh(record: VoiceSessionRecord, settings: ApiSettings): Promise<VoiceSessionSnapshot> {
    if (record.state === 'ready' || !record.jobId) return this.publicSnapshot(record, settings);
    try {
      const job = await getRunpodJob({
        apiKey: settings.runpod.apiKey,
        endpointId: settings.runpod.voiceEndpointId,
      }, record.jobId);
      if (job.status === 'IN_QUEUE' && Date.now() - record.lastHealthAt >= 10_000) {
        record.lastHealthAt = Date.now();
        const health = await getRunpodHealth({
          apiKey: settings.runpod.apiKey,
          endpointId: settings.runpod.voiceEndpointId,
        }).catch(() => undefined);
        const workers = health && typeof health === 'object'
          ? (health as { workers?: { initializing?: unknown } }).workers
          : undefined;
        record.workerInitializing = Number(workers?.initializing ?? 0) > 0;
      }
      return this.applyJob(record, job, settings);
    } catch (error) {
      this.sessions.delete(record.sessionId);
      throw error;
    }
  }

  private applyJob(
    record: VoiceSessionRecord,
    job: RunpodJobResponse,
    settings: ApiSettings,
  ): VoiceSessionSnapshot {
    const now = Date.now();
    const status = job.status ?? 'IN_QUEUE';
    record.delayTime = job.delayTime ?? record.delayTime;
    record.executionTime = job.executionTime ?? record.executionTime;

    if (status === 'COMPLETED') {
      record.workerInitializing = false;
      const policy = computeSessionPolicy(settings);
      record.state = 'ready';
      record.lastWarmAt = now;
      record.lastActiveAt = now;
      record.expiresAt = now + policy.idleSeconds * 1_000;
      record.message = '音声準備完了。会話の音声を自動再生できます。';
      return this.publicSnapshot(record, settings);
    }
    if (status === 'IN_PROGRESS') {
      record.workerInitializing = false;
      record.state = 'starting';
      record.message = 'GPUを確保しました。Irodoriを読み込んでいます…';
      return this.publicSnapshot(record, settings);
    }
    if (status === 'IN_QUEUE') {
      if (record.workerInitializing) {
        record.state = 'starting';
        record.message = 'GPUを確保しました。コンテナとIrodoriを起動しています…';
        return this.publicSnapshot(record, settings);
      }
      record.state = 'waiting-gpu';
      const waitedSeconds = Math.max(0, Math.floor((now - record.createdAt) / 1_000));
      const minutes = Math.floor(waitedSeconds / 60);
      const seconds = waitedSeconds % 60;
      record.message = `GPUの空きを待っています（${minutes}:${String(seconds).padStart(2, '0')}）`;
      return this.publicSnapshot(record, settings);
    }

    const detail = typeof job.error === 'string' ? `: ${job.error}` : '';
    this.sessions.delete(record.sessionId);
    throw new Error(`RunPod warm-up ${status}${detail}`);
  }

  private assertConfigured(settings: ApiSettings): void {
    if (!settings.runpod.apiKey.trim() || !settings.runpod.voiceEndpointId.trim()) {
      throw new Error('RunPod voice endpoint is not configured.');
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(sessionId);
    }
  }

  private publicSnapshot(record: VoiceSessionRecord, settings: ApiSettings): VoiceSessionSnapshot {
    const {
      lastWarmAt: _lastWarmAt,
      lastHealthAt: _lastHealthAt,
      workerInitializing: _workerInitializing,
      ...snapshot
    } = record;
    return { ...snapshot, nextKeepaliveSeconds: computeSessionPolicy(settings).keepaliveSeconds };
  }
}

// Vite reloads server modules while developing. Keep only the session records
// on globalThis so a reload can use the new class code without orphaning an
// already queued RunPod job and submitting a duplicate.
const computeSessionGlobal = globalThis as typeof globalThis & {
  __aiVtuberRunpodVoiceSessions?: Map<string, VoiceSessionRecord>;
};
computeSessionGlobal.__aiVtuberRunpodVoiceSessions ??= new Map<string, VoiceSessionRecord>();

export const computeSessionManager = new ComputeSessionManager(
  computeSessionGlobal.__aiVtuberRunpodVoiceSessions,
);
