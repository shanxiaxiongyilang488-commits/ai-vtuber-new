import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  emptyCharacterVisualMemory,
  hasCharacterVisualMemory,
  normalizeCharacterVisualMemory,
  shiroVisualMemoryPreset,
  type CharacterVisualMemory,
} from '$lib/types/characterVisualMemory';

type VisualMemoryRecord = { characterId: string; visualMemory: CharacterVisualMemory; updatedAt: string };
type VisualMemoryStore = { version: 1; characters: Record<string, VisualMemoryRecord> };

const STORE_FILE = resolve(process.cwd(), 'data', 'visual-memory.json');
const SEEDED_CHARACTERS: Record<string, string> = { shiro: 'シロ', mike: 'ミケ', 'n-02': 'N-02' };

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function readStore(): VisualMemoryStore {
  if (!existsSync(STORE_FILE)) return { version: 1, characters: {} };
  try {
    const value = JSON.parse(readFileSync(STORE_FILE, 'utf-8')) as Partial<VisualMemoryStore>;
    const characters: Record<string, VisualMemoryRecord> = {};
    for (const [rawId, rawRecord] of Object.entries(value.characters ?? {})) {
      const id = normalizeId(rawId);
      if (!id || !rawRecord || typeof rawRecord !== 'object') continue;
      const record = rawRecord as Partial<VisualMemoryRecord>;
      characters[id] = {
        characterId: id,
        visualMemory: normalizeCharacterVisualMemory(record.visualMemory),
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
      };
    }
    return { version: 1, characters };
  } catch {
    return { version: 1, characters: {} };
  }
}

function writeStore(store: VisualMemoryStore): void {
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  const temporary = `${STORE_FILE}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, 'utf-8');
  renameSync(temporary, STORE_FILE);
}

function seedVisualMemory(id: string, fallback?: unknown): CharacterVisualMemory {
  const migrated = normalizeCharacterVisualMemory(fallback);
  const base = hasCharacterVisualMemory(migrated)
    ? migrated
    : id === 'shiro' ? shiroVisualMemoryPreset() : emptyCharacterVisualMemory();
  base.characterName ||= SEEDED_CHARACTERS[id] ?? id;
  if (id in SEEDED_CHARACTERS && base.referenceImages.length === 0) {
    base.referenceImages = [{
      id: `${id}-identity-reference`,
      url: `/api/characters/${encodeURIComponent(id)}/reference?raw=1`,
      title: `${base.characterName} identity reference`,
      fileName: `${id}-reference.png`,
      createdAt: new Date().toISOString(),
      tags: ['identity', 'character-reference'],
      importantFeatures: [...base.criticalFeatures],
      category: 'Reference',
      official: true,
      critical: true,
    }];
  }
  return normalizeCharacterVisualMemory(base);
}

export function getVisualMemoryRecord(characterId: string, fallback?: unknown): VisualMemoryRecord {
  const id = normalizeId(characterId);
  const store = readStore();
  let changed = false;
  for (const seededId of Object.keys(SEEDED_CHARACTERS)) {
    if (store.characters[seededId]) continue;
    store.characters[seededId] = {
      characterId: seededId,
      visualMemory: seedVisualMemory(seededId, seededId === id ? fallback : undefined),
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  }
  const existing = store.characters[id];
  if (existing) {
    if (changed) writeStore(store);
    return existing;
  }
  const record: VisualMemoryRecord = {
    characterId: id,
    visualMemory: seedVisualMemory(id, fallback),
    updatedAt: new Date().toISOString(),
  };
  store.characters[id] = record;
  writeStore(store);
  return record;
}

export function saveVisualMemoryRecord(characterId: string, value: unknown): VisualMemoryRecord {
  const id = normalizeId(characterId);
  const store = readStore();
  const record: VisualMemoryRecord = {
    characterId: id,
    visualMemory: normalizeCharacterVisualMemory(value),
    updatedAt: new Date().toISOString(),
  };
  store.characters[id] = record;
  writeStore(store);
  return record;
}
