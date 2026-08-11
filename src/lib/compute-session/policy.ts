import type { ComputeTarget, ComputeTargetPreference } from './types.ts';

export function resolveComputeTarget(
  preference: ComputeTargetPreference,
  runpodConfigured: boolean,
): ComputeTarget {
  if (preference === 'local') return 'local';
  if (runpodConfigured) return 'runpod';
  if (preference === 'runpod-force') throw new Error('RunPod endpoint is not configured.');
  return 'local';
}

export function computeKeepaliveSeconds(warmIntervalSeconds: number, idleSeconds: number): number {
  return Math.max(10, Math.min(warmIntervalSeconds, Math.floor(idleSeconds / 2)));
}
