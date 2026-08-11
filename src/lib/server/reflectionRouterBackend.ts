import { decideReflection } from '$lib/ai/reflection-router/reflectionRouter';
import {
  isReflectionMode,
  type ReflectionDecision,
  type ReflectionRouterInput,
  type ReflectionUiState,
} from '$lib/ai/reflection-router/types';

export type ReflectionRouterEnvironment = Record<string, string | undefined>;

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function normalizeRemoteDecision(value: unknown, fallback: ReflectionDecision): ReflectionDecision | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ReflectionDecision>;
  if (!isReflectionMode(candidate.mode)) return null;
  const labels: Record<ReflectionUiState, string> = {
    responding: 'すぐ答えます',
    remembering: '思い出しています',
    weighing: '迷っています',
    'deep-thinking': '深く考えています',
  };
  const state: ReflectionUiState = candidate.uiState === 'remembering'
    || candidate.uiState === 'weighing'
    || candidate.uiState === 'deep-thinking'
    || candidate.uiState === 'responding'
      ? candidate.uiState
      : fallback.uiState;
  return {
    mode: candidate.mode,
    uiState: state,
    uiLabel: labels[state],
    memoryBudget: {
      shortTermMessages: clampInteger(candidate.memoryBudget?.shortTermMessages, fallback.memoryBudget.shortTermMessages, 1, 30),
      retrievedMemories: clampInteger(candidate.memoryBudget?.retrievedMemories, fallback.memoryBudget.retrievedMemories, 0, 10),
    },
    maxTokens: clampInteger(candidate.maxTokens, fallback.maxTokens, 512, 4096),
    ...(typeof candidate.filler === 'string' && candidate.filler.trim()
      ? { filler: candidate.filler.trim().slice(0, 60) }
      : fallback.filler ? { filler: fallback.filler } : {}),
    backend: 'remote',
  };
}

/**
 * Uses the local deterministic router today. Setting REFLECTION_ROUTER_URL later
 * moves only the routing decision to RunPod/a local LLM without changing CHAT.
 */
export async function routeReflection(
  input: ReflectionRouterInput,
  environment: ReflectionRouterEnvironment,
): Promise<ReflectionDecision> {
  const fallback = decideReflection(input);
  const endpoint = environment.REFLECTION_ROUTER_URL?.trim();
  if (!endpoint) return fallback;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(environment.REFLECTION_ROUTER_TOKEN
          ? { authorization: `Bearer ${environment.REFLECTION_ROUTER_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return fallback;
    return normalizeRemoteDecision(await response.json(), fallback) ?? fallback;
  } catch {
    return fallback;
  }
}
