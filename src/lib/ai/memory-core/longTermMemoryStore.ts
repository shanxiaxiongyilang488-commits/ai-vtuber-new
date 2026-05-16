import type { LongTermMemory, MemoryScope, MemorySource } from './types';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SHARED_STORAGE_KEY = 'memory-core:shared';
const CHARACTER_STORAGE_PREFIX = 'memory-core:character:';
const MEMORY_DIR = join(process.cwd(), 'data', 'memory');
const SHARED_MEMORY_FILE = 'shared.json';

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
}

function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function readMemoryFile(fileName: string): LongTermMemory[] {
  try {
    const filePath = join(MEMORY_DIR, fileName);
    if (!existsSync(filePath)) return [];
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as LongTermMemory[];
    return Array.isArray(parsed) ? parsed.map(normalizeMemory) : [];
  } catch {
    return [];
  }
}

function writeMemoryFile(fileName: string, memories: LongTermMemory[]): void {
  ensureMemoryDir();
  writeFileSync(join(MEMORY_DIR, fileName), JSON.stringify(memories.map(normalizeMemory), null, 2), 'utf-8');
}

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
  const fileMemories = readMemoryFile(SHARED_MEMORY_FILE).filter((memory) => memory.scope === 'shared');
  if (fileMemories.length > 0 || !canUseLocalStorage()) return fileMemories;
  return loadFromKey(SHARED_STORAGE_KEY).filter((memory) => memory.scope === 'shared');
}

export function saveSharedMemories(memories: LongTermMemory[]): void {
  console.log('[memory-core] saveSharedMemories called:', { incomingCount: memories.length });

  const existing = readMemoryFile(SHARED_MEMORY_FILE).filter((memory) => memory.scope === 'shared');
  const normalized = memories.map((memory) => ({ ...memory, scope: 'shared' as const, characterId: undefined }));
  const next = normalized.length > 0
    ? [
        ...normalized,
        ...existing.filter((entry) => !normalized.some((memory) => memory.id === entry.id)),
      ]
    : existing;

  writeMemoryFile(SHARED_MEMORY_FILE, next);
  saveToKey(SHARED_STORAGE_KEY, next);

  console.log('[memory-core] shared.json saved:', { count: loadSharedMemories().length });
}

export function loadCharacterMemories(characterId: string): LongTermMemory[] {
  const safeCharacterId = safeFilePart(characterId);
  const fileMemories = readMemoryFile(`character-${safeCharacterId}.json`)
    .filter((memory) => memory.scope === 'character' && memory.characterId === characterId);
  if (fileMemories.length > 0 || !canUseLocalStorage()) return fileMemories;

  return loadFromKey(`${CHARACTER_STORAGE_PREFIX}${characterId}`)
    .filter((memory) => memory.scope === 'character' && memory.characterId === characterId);
}

export function saveCharacterMemories(characterId: string, memories: LongTermMemory[]): void {
  const safeCharacterId = safeFilePart(characterId);
  const normalized = memories.map((memory) => ({ ...memory, scope: 'character' as const, characterId }));
  writeMemoryFile(`character-${safeCharacterId}.json`, normalized);
  saveToKey(
    `${CHARACTER_STORAGE_PREFIX}${characterId}`,
    normalized
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
