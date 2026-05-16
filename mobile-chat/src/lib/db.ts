import type { ChatMessage, LongTermMemory } from './chat/types';

const DB_NAME = 'risea-mobile-chat';
const DB_VERSION = 1;
const MESSAGE_STORE = 'messages';
const MEMORY_STORE = 'longTermMemories';

type StoreName = typeof MESSAGE_STORE | typeof MEMORY_STORE;

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;

			if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
				const messages = db.createObjectStore(MESSAGE_STORE, { keyPath: 'id' });
				messages.createIndex('createdAt', 'createdAt');
			}

			if (!db.objectStoreNames.contains(MEMORY_STORE)) {
				const memories = db.createObjectStore(MEMORY_STORE, { keyPath: 'id' });
				memories.createIndex('updatedAt', 'updatedAt');
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

	return dbPromise;
}

function withStore<T>(
	storeName: StoreName,
	mode: IDBTransactionMode,
	callback: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
	return openDb().then(
		(db) =>
			new Promise((resolve, reject) => {
				const transaction = db.transaction(storeName, mode);
				const store = transaction.objectStore(storeName);
				const request = callback(store);
				let result: T | undefined;

				if (request) {
					request.onsuccess = () => {
						result = request.result;
					};
					request.onerror = () => reject(request.error);
				}

				transaction.oncomplete = () => resolve(result);
				transaction.onerror = () => reject(transaction.error);
				transaction.onabort = () => reject(transaction.error);
			})
	);
}

export async function getMessages(): Promise<ChatMessage[]> {
	const db = await openDb();

	return new Promise((resolve, reject) => {
		const transaction = db.transaction(MESSAGE_STORE, 'readonly');
		const index = transaction.objectStore(MESSAGE_STORE).index('createdAt');
		const request = index.getAll();

		request.onsuccess = () => resolve(request.result as ChatMessage[]);
		request.onerror = () => reject(request.error);
	});
}

export async function saveMessage(message: ChatMessage): Promise<void> {
	await withStore(MESSAGE_STORE, 'readwrite', (store) => store.put(message));
}

export async function clearMessages(): Promise<void> {
	await withStore(MESSAGE_STORE, 'readwrite', (store) => store.clear());
}

export async function getLongTermMemories(): Promise<LongTermMemory[]> {
	const db = await openDb();

	return new Promise((resolve, reject) => {
		const transaction = db.transaction(MEMORY_STORE, 'readonly');
		const index = transaction.objectStore(MEMORY_STORE).index('updatedAt');
		const request = index.getAll();

		request.onsuccess = () => resolve((request.result as LongTermMemory[]).reverse());
		request.onerror = () => reject(request.error);
	});
}

export async function saveLongTermMemory(memory: LongTermMemory): Promise<void> {
	await withStore(MEMORY_STORE, 'readwrite', (store) => store.put(memory));
}

export async function deleteLongTermMemory(id: string): Promise<void> {
	await withStore(MEMORY_STORE, 'readwrite', (store) => store.delete(id));
}

export function createId(prefix: string): string {
	return `${prefix}-${createSafeUuid()}`;
}

function createSafeUuid(): string {
	if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
		return globalThis.crypto.randomUUID();
	}

	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).slice(2, 12);
	return `${timestamp}-${random}`;
}
