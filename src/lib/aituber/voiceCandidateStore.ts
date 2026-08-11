export interface StoredVoiceCandidate {
  messageId: string;
  audioUrl: string;
  createdAt: number;
}

export interface VoiceCandidateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const MAX_STORED_CANDIDATES = 80;

function storageKey(characterId: string): string {
  return `ai-vtuber:voice-candidates:${characterId}`;
}

function isCandidate(value: unknown): value is StoredVoiceCandidate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredVoiceCandidate>;
  return typeof candidate.messageId === 'string'
    && candidate.messageId.length > 0
    && typeof candidate.audioUrl === 'string'
    && candidate.audioUrl.startsWith('/voice-output/')
    && typeof candidate.createdAt === 'number'
    && Number.isFinite(candidate.createdAt);
}

export function loadVoiceCandidates(
  characterId: string,
  storage: VoiceCandidateStorage,
): StoredVoiceCandidate[] {
  if (!characterId) return [];
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(characterId)) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCandidate).slice(-MAX_STORED_CANDIDATES);
  } catch {
    return [];
  }
}

export function replaceVoiceCandidates(
  characterId: string,
  candidates: StoredVoiceCandidate[],
  storage: VoiceCandidateStorage,
): void {
  if (!characterId) return;
  const unique = candidates
    .filter(isCandidate)
    .filter((candidate, index, all) => all.findLastIndex((item) => item.messageId === candidate.messageId) === index)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_STORED_CANDIDATES);
  try {
    storage.setItem(storageKey(characterId), JSON.stringify(unique));
  } catch {
    // Private browsing or a full storage quota must not break voice playback.
  }
}

export function saveVoiceCandidate(
  characterId: string,
  messageId: string,
  audioUrl: string,
  storage: VoiceCandidateStorage,
  createdAt = Date.now(),
): void {
  replaceVoiceCandidates(characterId, [
    ...loadVoiceCandidates(characterId, storage),
    { messageId, audioUrl, createdAt },
  ], storage);
}
