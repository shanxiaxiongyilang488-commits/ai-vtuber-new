export const COMPUTE_CAPABILITIES = ['voice', 'reflection-deep', 'video'] as const;
export type ComputeCapability = (typeof COMPUTE_CAPABILITIES)[number];

export const COMPUTE_TARGET_PREFERENCES = ['local', 'runpod-auto', 'runpod-force'] as const;
export type ComputeTargetPreference = (typeof COMPUTE_TARGET_PREFERENCES)[number];
export type ComputeTarget = 'local' | 'runpod';

export type ComputeSessionState =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'busy'
  | 'cooling-down'
  | 'error';

export type ComputeSessionSnapshot = {
  sessionId: string;
  capability: ComputeCapability;
  target: ComputeTarget;
  state: ComputeSessionState;
  simulated: boolean;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  nextKeepaliveSeconds: number;
  message: string;
  jobId?: string;
  delayTime?: number;
  executionTime?: number;
};

export function isComputeCapability(value: unknown): value is ComputeCapability {
  return typeof value === 'string' && (COMPUTE_CAPABILITIES as readonly string[]).includes(value);
}

export function isComputeTargetPreference(value: unknown): value is ComputeTargetPreference {
  return typeof value === 'string' && (COMPUTE_TARGET_PREFERENCES as readonly string[]).includes(value);
}
