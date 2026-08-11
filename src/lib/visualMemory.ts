export type VisualMemoryEntry = {
  id: string; imageId: string; characterId: string; characterName: string;
  title: string; summary: string; tags: string[]; source: 'generated' | 'uploaded'; createdAt: string;
};
const KEY = 'visual-memory-metadata';
export function saveVisualMemory(input: Omit<VisualMemoryEntry, 'id' | 'createdAt'>): VisualMemoryEntry {
  const entry: VisualMemoryEntry = { ...input, id: `visual-memory-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString() };
  if (typeof localStorage !== 'undefined') {
    const current = loadVisualMemories();
    localStorage.setItem(KEY, JSON.stringify([entry, ...current].slice(0, 40)));
  }
  return entry;
}
export function loadVisualMemories(characterId = ''): VisualMemoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const values = JSON.parse(localStorage.getItem(KEY) ?? '[]') as VisualMemoryEntry[];
    return values.filter((value) => value && typeof value.imageId === 'string' && (!characterId || value.characterId === characterId));
  } catch { return []; }
}
export function searchVisualMemories(query: string, characterId = ''): VisualMemoryEntry[] {
  const q = query.toLowerCase();
  return loadVisualMemories(characterId).filter((entry) => `${entry.title} ${entry.summary} ${entry.tags.join(' ')}`.toLowerCase().includes(q));
}
