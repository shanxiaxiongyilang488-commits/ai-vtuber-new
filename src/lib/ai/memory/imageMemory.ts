const DB_NAME = 'ai-vtuber-image-memory';
const DB_VERSION = 1;
const IMAGE_STORE = 'images';

export type ImageMemoryEntry = {
  id: string;
  imageUrl: string;
  imagePrompt: string;
  provider: string;
  model: string;
  createdAt: string;
};

export type SaveImageMemoryInput = {
  imageUrl: string;
  imagePrompt: string;
  provider: string;
  model: string;
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

      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        const store = db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('provider', 'provider');
        store.createIndex('model', 'model');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function createId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `image-${globalThis.crypto.randomUUID()}`;
  }

  return `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function saveImageMemory(input: SaveImageMemoryInput): Promise<ImageMemoryEntry> {
  const entry: ImageMemoryEntry = {
    id: createId(),
    imageUrl: input.imageUrl,
    imagePrompt: input.imagePrompt,
    provider: input.provider,
    model: input.model,
    createdAt: new Date().toISOString(),
  };

  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE, 'readwrite');
    const request = transaction.objectStore(IMAGE_STORE).put(entry);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  return entry;
}
