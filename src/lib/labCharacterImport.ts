export const LAB_IMPORTED_CHARACTERS_KEY = 'lab-imported-characters';

export type MemorycoreLabCharacterExport = {
  version?: number;
  source?: string;
  exportedAt?: string;
  id?: string;
  name?: string;
  icon?: string;
  profile?: { role?: string; description?: string; memory?: unknown };
  referenceImages?: string[];
  growth?: unknown;
  settings?: unknown;
  videoReferenceImages?: string[];
};

export type ImportedLabCharacter = {
  id: string;
  file: string;
  name: string;
  mode: string;
  group: 'my';
  importedSnapshot: MemorycoreLabCharacterExport;
};

// The sole registration path for a MEMORYCORE character. It only writes LAB's
// independent roster; no system character or active selection is touched.
export function importCharacterFromMemorycore(payload: MemorycoreLabCharacterExport): ImportedLabCharacter | null {
  if (typeof localStorage === 'undefined' || !payload.id || !payload.name) return null;
  const importedId = `my:${payload.id}`;
  let roster: ImportedLabCharacter[] = [];
  try {
    const stored = JSON.parse(localStorage.getItem(LAB_IMPORTED_CHARACTERS_KEY) ?? '[]') as unknown;
    roster = Array.isArray(stored)
      ? stored.filter((entry): entry is ImportedLabCharacter => Boolean(
          entry && typeof entry === 'object'
          && (entry as ImportedLabCharacter).group === 'my'
          && typeof (entry as ImportedLabCharacter).id === 'string'
          && typeof (entry as ImportedLabCharacter).name === 'string',
        ))
      : [];
  } catch { /* Invalid LAB roster is replaced with a fresh roster. */ }
  const existing = roster.find((entry) => entry.id === importedId);
  if (existing) return existing;
  const added: ImportedLabCharacter = {
    id: importedId,
    file: payload.icon || '/avatars/default.png',
    name: payload.name,
    mode: payload.profile?.role || 'IMPORTED CHARACTER',
    group: 'my',
    importedSnapshot: structuredClone(payload),
  };
  roster.push(added);
  localStorage.setItem(LAB_IMPORTED_CHARACTERS_KEY, JSON.stringify(roster));
  return added;
}
