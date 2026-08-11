export const REFLECTION_MODES = ['fast', 'think', 'deep'] as const;
export type ReflectionMode = (typeof REFLECTION_MODES)[number];

export const REFLECTION_TENDENCIES = ['quick', 'balanced', 'reflective'] as const;
export type ReflectionTendency = (typeof REFLECTION_TENDENCIES)[number];

export type ReflectionUiState = 'responding' | 'remembering' | 'weighing' | 'deep-thinking';

export type ReflectionMemoryBudget = {
  shortTermMessages: number;
  retrievedMemories: number;
};

export type ReflectionRouterInput = {
  text: string;
  characterId?: string;
  tendency?: ReflectionTendency;
  memoryEnabled?: boolean;
  voiceLive?: boolean;
};

/** Public execution plan. It deliberately contains no chain-of-thought. */
export type ReflectionDecision = {
  mode: ReflectionMode;
  uiState: ReflectionUiState;
  uiLabel: string;
  memoryBudget: ReflectionMemoryBudget;
  maxTokens: number;
  filler?: string;
  backend: 'rules' | 'remote';
};

export function isReflectionMode(value: unknown): value is ReflectionMode {
  return typeof value === 'string' && (REFLECTION_MODES as readonly string[]).includes(value);
}

export function isReflectionTendency(value: unknown): value is ReflectionTendency {
  return typeof value === 'string' && (REFLECTION_TENDENCIES as readonly string[]).includes(value);
}
