import type { LongTermMemory, MemoryScope, MemorySource } from './types';

const SHARED_STORAGE_KEY = 'memory-core:shared';
const CHARACTER_STORAGE_PREFIX = 'memory-core:character:';

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function normalizeMemory(memory: LongTermMemory): LongTermMemory {
  return {
    ...memory,
    tags: Array.isArray(memory.tags) ? memory.tags.filter(Boolean) : [],
    importance: Math.min(5, Math.max(1, Number(memory.importance) || 1)),
    timestamp: memory.timestamp || new Date().toISOString(),
  };
}

function loadFromKey(key: string): LongTermMemory[] {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LongTermMemory[];
    return Array.isArray(parsed) ? parsed.map(normalizeMemory) : [];
  } catch {
    return [];
  }
}

function saveToKey(key: string, memories: LongTermMemory[]): void {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(key, JSON.stringify(memories.map(normalizeMemory)));
}

export function createLongTermMemory(input: {
  scope: MemoryScope;
  title: string;
  content: string;
  tags?: string[];
  importance?: number;
  characterId?: string;
  source?: MemorySource;
}): LongTermMemory {
  const now = new Date().toISOString();
  return normalizeMemory({
    id: crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    scope: input.scope,
    title: input.title.trim(),
    content: input.content.trim(),
    tags: input.tags ?? [],
    importance: input.importance ?? 3,
    timestamp: now,
    characterId: input.scope === 'character' ? input.characterId : undefined,
    source: input.source ?? 'manual',
  });
}

export function loadSharedMemories(): LongTermMemory[] {
  return loadFromKey(SHARED_STORAGE_KEY).filter((memory) => memory.scope === 'shared');
}

export function saveSharedMemories(memories: LongTermMemory[]): void {
  saveToKey(SHARED_STORAGE_KEY, memories.map((memory) => ({ ...memory, scope: 'shared', characterId: undefined })));
}

export function loadCharacterMemories(characterId: string): LongTermMemory[] {
  return loadFromKey(`${CHARACTER_STORAGE_PREFIX}${characterId}`)
    .filter((memory) => memory.scope === 'character' && memory.characterId === characterId);
}

export function saveCharacterMemories(characterId: string, memories: LongTermMemory[]): void {
  saveToKey(
    `${CHARACTER_STORAGE_PREFIX}${characterId}`,
    memories.map((memory) => ({ ...memory, scope: 'character', characterId }))
  );
}

export function upsertLongTermMemory(memory: LongTermMemory): LongTermMemory[] {
  const normalized = normalizeMemory({ ...memory, updatedAt: new Date().toISOString() });
  const existing = normalized.scope === 'shared'
    ? loadSharedMemories()
    : loadCharacterMemories(normalized.characterId ?? 'default');
  const next = [
    normalized,
    ...existing.filter((entry) => entry.id !== normalized.id),
  ];

  if (normalized.scope === 'shared') saveSharedMemories(next);
  else saveCharacterMemories(normalized.characterId ?? 'default', next);

  return next;
}
