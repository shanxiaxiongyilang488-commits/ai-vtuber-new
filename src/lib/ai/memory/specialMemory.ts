const STORAGE_KEY = 'lab-special-memory';
const MAX_ENTRIES = 10;

export type SpecialMemoryType = 'praised' | 'fought' | 'reconciled';

export type SpecialMemoryEntry = {
  type: SpecialMemoryType;
  summary: string;
  timestamp: string;
};

function load(): SpecialMemoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SpecialMemoryEntry[]) : [];
  } catch {
    return [];
  }
}

function save(entries: SpecialMemoryEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-Math.floor(MAX_ENTRIES / 2))));
    } catch { /* fail silently */ }
  }
}

export function addSpecialMemory(type: SpecialMemoryType, summary: string): void {
  const entries = load();
  entries.push({ type, summary, timestamp: new Date().toISOString() });
  save(entries.slice(-MAX_ENTRIES));
}

export function getSpecialMemoryHint(bond: number): string {
  if (bond < 40) return '';
  const entries = load();
  if (entries.length === 0) return '';
  const prob = bond >= 65 ? 0.5 : 0.25;
  if (Math.random() > prob) return '';
  const entry = entries[Math.floor(Math.random() * entries.length)];
  return entry.summary;
}
