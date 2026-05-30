const DB_NAME = 'ai-vtuber-lab-chat';
const DB_VERSION = 1;
const HISTORY_STORE = 'chatHistory';
const HISTORY_ID = 'default';

export type LabChatHistoryMessage = {
  role: string;
  text: string;
  time: string;
  avatar?: string;
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

    return [{
      role: candidate.role,
      text: candidate.text,
      time: candidate.time,
      ...(typeof candidate.avatar === 'string' ? { avatar: candidate.avatar } : {}),
      ...(typeof candidate.imageUrl === 'string' ? { imageUrl: candidate.imageUrl } : {}),
      ...(typeof candidate.imagePrompt === 'string' ? { imagePrompt: candidate.imagePrompt } : {}),
      ...(candidate.isGreeting === true ? { isGreeting: true } : {}),
    }];
  });
}

export async function loadLabChatHistory(): Promise<LabChatHistoryMessage[]> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE, 'readonly');
    const request = transaction.objectStore(HISTORY_STORE).get(HISTORY_ID);

    request.onsuccess = () => {
      resolve(normalizeMessages(request.result));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveLabChatHistory(messages: LabChatHistoryMessage[]): Promise<void> {
  const db = await openDb();
  const history = normalizeMessages(messages);

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
