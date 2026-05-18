import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type EvolutionKey =
  | 'openness'
  | 'warmth'
  | 'curiosity'
  | 'initiative'
  | 'playfulness'
  | 'stability';

export type PersonalityEvolutionState = Record<EvolutionKey, number> & {
  lastDelta: Record<EvolutionKey, number>;
  updatedAt: string;
};

export type EvolutionSignal = {
  emotion?: string;
  trust_delta?: number;
  affection_delta?: number;
  learned?: string[];
  note?: string;
};

const PERSONALITY_DIR = join(process.cwd(), 'data', 'personality');
const RISEA_FILE = 'risea.json';
const KEYS: EvolutionKey[] = ['openness', 'warmth', 'curiosity', 'initiative', 'playfulness', 'stability'];

function emptyDelta(): Record<EvolutionKey, number> {
  return {
    openness: 0,
    warmth: 0,
    curiosity: 0,
    initiative: 0,
    playfulness: 0,
    stability: 0,
  };
}

function defaultState(): PersonalityEvolutionState {
  return {
    openness: 50,
    warmth: 50,
    curiosity: 50,
    initiative: 50,
    playfulness: 50,
    stability: 70,
    lastDelta: emptyDelta(),
    updatedAt: new Date().toISOString(),
  };
}

function ensurePersonalityDir(): void {
  if (!existsSync(PERSONALITY_DIR)) {
    mkdirSync(PERSONALITY_DIR, { recursive: true });
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeState(value: Partial<PersonalityEvolutionState> | null | undefined): PersonalityEvolutionState {
  const base = defaultState();
  const lastDelta = emptyDelta();
  for (const key of KEYS) {
    base[key] = clamp(Number(value?.[key]) || base[key]);
    lastDelta[key] = Number(value?.lastDelta?.[key]) || 0;
  }
  return {
    ...base,
    lastDelta,
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : base.updatedAt,
  };
}

export function loadRiseaEvolution(): PersonalityEvolutionState {
  ensurePersonalityDir();
  const filePath = join(PERSONALITY_DIR, RISEA_FILE);
  if (!existsSync(filePath)) return defaultState();
  try {
    return normalizeState(JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<PersonalityEvolutionState>);
  } catch {
    return defaultState();
  }
}

function saveRiseaEvolution(state: PersonalityEvolutionState): void {
  ensurePersonalityDir();
  writeFileSync(join(PERSONALITY_DIR, RISEA_FILE), JSON.stringify(state, null, 2), 'utf-8');
}

function add(delta: Record<EvolutionKey, number>, key: EvolutionKey, value: number): void {
  delta[key] = Math.max(-2, Math.min(2, delta[key] + value));
}

export function applyEvolutionRules(signal: EvolutionSignal): PersonalityEvolutionState {
  const current = loadRiseaEvolution();
  const delta = emptyDelta();
  const emotion = signal.emotion?.toLowerCase() ?? 'neutral';
  const trustDelta = Number(signal.trust_delta) || 0;
  const affectionDelta = Number(signal.affection_delta) || 0;

  if ((signal.learned?.length ?? 0) > 0) {
    add(delta, 'openness', 1);
    add(delta, 'curiosity', 1);
  }

  if (trustDelta > 0) {
    add(delta, 'initiative', 1);
    add(delta, 'stability', 1);
  } else if (trustDelta < 0) {
    add(delta, 'stability', -1);
  }

  if (affectionDelta > 0) {
    add(delta, 'warmth', 1);
    add(delta, 'playfulness', 1);
  } else if (affectionDelta < 0) {
    add(delta, 'warmth', -1);
  }

  if (/joy|happy|smile|love|embarrassment/u.test(emotion)) {
    add(delta, 'warmth', 1);
    add(delta, 'playfulness', 1);
  } else if (/anger|sad|fear|disgust/u.test(emotion)) {
    add(delta, 'stability', -1);
  }

  if (/関連記憶なし|no retrieved memory/iu.test(signal.note ?? '')) {
    add(delta, 'curiosity', 1);
  }

  const next: PersonalityEvolutionState = {
    ...current,
    lastDelta: delta,
    updatedAt: new Date().toISOString(),
  };

  for (const key of KEYS) {
    next[key] = clamp(current[key] + delta[key]);
  }

  saveRiseaEvolution(next);
  return next;
}
