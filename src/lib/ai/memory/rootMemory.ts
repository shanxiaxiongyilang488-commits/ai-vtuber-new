const STORAGE_KEY = 'rootMemory-history';
const MAX_ENTRIES = 20;

export type MemoryEntry = {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
};

function load(): MemoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MemoryEntry[]) : [];
  } catch {
    return [];
  }
}

function save(entries: MemoryEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-Math.floor(MAX_ENTRIES / 2))));
    } catch { /* fail silently */ }
  }
}

export function addMemory(role: MemoryEntry['role'], text: string): void {
  const entries = load();
  entries.push({ role, text, timestamp: new Date().toISOString() });
  save(entries.slice(-MAX_ENTRIES));
}

export function getRecentMemoryText(): string {
  const entries = load();
  if (entries.length === 0) return '';
  const lines = entries.map(e => {
    const label = e.role === 'user' ? 'ユーザー' : 'アシスタント';
    const time = new Date(e.timestamp).toLocaleString('ja-JP');
    return `${label}（${time}）: ${e.text}`;
  });
  return `【過去の会話】\n${lines.join('\n')}`;
}

export function clearMemory(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getMemoryEntries(): MemoryEntry[] {
  return load();
}
