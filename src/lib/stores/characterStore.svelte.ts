export interface SharedCharacter {
  imageDataUrl: string;
  name: string;
}

function loadStored(): SharedCharacter | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem('mv_character');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj['imageDataUrl'] !== 'string' || typeof obj['name'] !== 'string') return null;
    return { imageDataUrl: obj['imageDataUrl'], name: obj['name'] };
  } catch {
    return null;
  }
}

let _shared = $state<SharedCharacter | null>(loadStored());

export const characterStore = {
  get current(): SharedCharacter | null { return _shared; },

  set(imageDataUrl: string, name: string): void {
    _shared = { imageDataUrl, name };
    try { localStorage.setItem('mv_character', JSON.stringify(_shared)); } catch {}
  },

  clear(): void {
    _shared = null;
    try { localStorage.removeItem('mv_character'); } catch {}
  },
};
