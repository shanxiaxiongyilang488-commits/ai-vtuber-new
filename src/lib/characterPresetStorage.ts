export type CharacterPreset = {
  id: string;
  name: string;
  mediaIds: string[];
  /** Legacy v1 data. New presets store mediaIds only. */
  imageUrls?: string[];
  createdAt: string;
};

const STORAGE_KEY = 'character-image-presets:v1';

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function getCharacterPresets(): CharacterPreset[] {
  if (!canUseStorage()) return [];
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.filter((preset): preset is CharacterPreset => (
      Boolean(preset)
      && typeof preset === 'object'
      && typeof (preset as CharacterPreset).id === 'string'
      && typeof (preset as CharacterPreset).name === 'string'
      && (Array.isArray((preset as CharacterPreset).mediaIds) || Array.isArray((preset as CharacterPreset).imageUrls))
    )).map((preset) => ({
      ...preset,
      mediaIds: Array.isArray(preset.mediaIds) ? preset.mediaIds : (preset.imageUrls ?? []),
    }));
  } catch {
    return [];
  }
}

function persist(presets: CharacterPreset[]): void {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function saveCharacterPreset(name: string, mediaIds: string[]): CharacterPreset {
  const preset: CharacterPreset = {
    id: `character-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    mediaIds: [...new Set(mediaIds)].slice(0, 9),
    createdAt: new Date().toISOString(),
  };
  persist([...getCharacterPresets(), preset]);
  return preset;
}

export function deleteCharacterPreset(id: string): void {
  persist(getCharacterPresets().filter((preset) => preset.id !== id));
}
