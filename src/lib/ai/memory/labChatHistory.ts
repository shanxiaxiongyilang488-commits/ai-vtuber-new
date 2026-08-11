const DB_NAME = 'ai-vtuber-lab-chat';
const DB_VERSION = 1;
const HISTORY_STORE = 'chatHistory';
const HISTORY_ID = 'default';
export const MAX_HISTORY = 8;
export const MAX_MESSAGE_LENGTH = 500;
export const BLOCK_BASE64 = true;
export const BLOCK_DEBUG_LOG = true;

function isUnsafeHistoryText(text: string): boolean {
  return /data\//iu.test(text) || /(?:^|\n)\s*(?:\[?debug|console\.|video_debug|fal_video_status)/iu.test(text);
}

export type LabChatHistoryMessage = {
  role: string;
  text: string;
  time: string;
  /** ISO 8601 creation timestamp used by the chat UI. */
  timestamp?: string;
  createdAt?: string;
  avatar?: string;
  speakerName?: string;
  internalDiscussion?: Array<{
    speaker: 'ミュリィ' | 'リセア' | 'シエル' | 'メノア' | 'ピオナ' | '司会';
    text: string;
  }>;
  imageUrl?: string;
  imagePrompt?: string;
  isGreeting?: true;
};

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        db.createObjectStore(HISTORY_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function normalizeMessages(value: unknown): LabChatHistoryMessage[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((message): LabChatHistoryMessage[] => {
    if (!message || typeof message !== 'object') return [];
    const candidate = message as Partial<LabChatHistoryMessage>;
    if (!(typeof candidate.role === 'string'
      && typeof candidate.text === 'string'
      && typeof candidate.time === 'string')) {
      return [];
    }
    if (isUnsafeHistoryText(candidate.text)) return [];

    // Legacy entries only had a short display time. Assign a one-time ISO value
    // when they are next saved so every persisted message has a timestamp.
    const timestamp = typeof candidate.timestamp === 'string'
      ? candidate.timestamp
      : typeof candidate.createdAt === 'string'
        ? candidate.createdAt
        : new Date().toISOString();
    return [{
      role: candidate.role,
      text: candidate.text.slice(0, MAX_MESSAGE_LENGTH),
      time: candidate.time,
      timestamp,
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : timestamp,
      ...(typeof candidate.avatar === 'string' && !/data\//iu.test(candidate.avatar) ? { avatar: candidate.avatar } : {}),
      ...(typeof candidate.speakerName === 'string' ? { speakerName: candidate.speakerName } : {}),
      ...(Array.isArray(candidate.internalDiscussion) && false ? {
        internalDiscussion: candidate.internalDiscussion?.flatMap((entry) =>
          entry
          && (
            entry.speaker === 'ミュリィ'
            || entry.speaker === 'リセア'
            || entry.speaker === 'シエル'
            || entry.speaker === 'メノア'
            || entry.speaker === 'ピオナ'
            || entry.speaker === '司会'
          )
          && typeof entry.text === 'string'
          && entry.text.trim()
            ? [{ speaker: entry.speaker, text: entry.text.trim() }]
            : []
        ) ?? [],
      } : {}),
      ...(typeof candidate.imageUrl === 'string' && !/data\//iu.test(candidate.imageUrl) ? { imageUrl: candidate.imageUrl } : {}),
      ...(candidate.isGreeting === true ? { isGreeting: true } : {}),
    }];
  }).slice(-MAX_HISTORY);
}

export async function loadLabChatHistory(): Promise<LabChatHistoryMessage[]> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE, 'readonly');
    const request = transaction.objectStore(HISTORY_STORE).get(HISTORY_ID);

    request.onsuccess = () => {
      const messages = normalizeMessages(request.result);
      const latest = messages.at(-1);
      if (latest) {
        console.log('[MESSAGE_LENGTH_STAGE]', 'load_saved');
        console.log('[MESSAGE_LENGTH]', latest.text.length, latest.text.length);
      }
      resolve(messages);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveLabChatHistory(messages: LabChatHistoryMessage[]): Promise<void> {
  const db = await openDb();
  const history = normalizeMessages(messages);
  const rawLatest = messages.at(-1)?.text ?? '';
  const savedLatest = history.at(-1)?.text ?? '';
  console.log('[MESSAGE_LENGTH_STAGE]', 'save');
  console.log('[MESSAGE_LENGTH]', rawLatest.length, savedLatest.length);

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE, 'readwrite');
    const request = transaction.objectStore(HISTORY_STORE).put(history, HISTORY_ID);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function clearLabChatHistory(): Promise<void> {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE, 'readwrite');
    const request = transaction.objectStore(HISTORY_STORE).delete(HISTORY_ID);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function migrateLabChatHistoryFromLocalStorage(rawHistory: string | null): Promise<LabChatHistoryMessage[]> {
  if (!rawHistory) return [];

  try {
    const messages = normalizeMessages(JSON.parse(rawHistory));
    if (messages.length > 0) await saveLabChatHistory(messages);
    return messages;
  } catch {
    return [];
  }
}
