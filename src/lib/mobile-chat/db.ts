import type {
	MobileChatMessage,
	MobileChatSettings,
	MobileLongTermMemory
} from '$lib/mobile-chat/types';
import { defaultMobileChatSettings } from '$lib/mobile-chat/types';

const DB_NAME = 'ai-vtuber-mobile-chat';
const DB_VERSION = 1;
const MESSAGE_STORE = 'messages';
const MEMORY_STORE = 'longTermMemories';
const SETTINGS_KEY = 'ai-vtuber-mobile-chat-settings';
const SHORT_TERM_LIMIT = 50;

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

export async function getMobileMessages(): Promise<MobileChatMessage[]> {
	const db = await openDb();

	return new Promise((resolve, reject) => {
		const transaction = db.transaction(MESSAGE_STORE, 'readonly');
		const request = transaction.objectStore(MESSAGE_STORE).index('createdAt').getAll();

		request.onsuccess = () => resolve(request.result as MobileChatMessage[]);
		request.onerror = () => reject(request.error);
	});
}

export async function saveMobileMessage(message: MobileChatMessage): Promise<void> {
	await withStore(MESSAGE_STORE, 'readwrite', (store) => store.put(message));
}

export async function clearMobileMessages(): Promise<void> {
	await withStore(MESSAGE_STORE, 'readwrite', (store) => store.clear());
}

export function getShortTermMessages(messages: MobileChatMessage[]): MobileChatMessage[] {
	return messages.slice(-SHORT_TERM_LIMIT);
}

export function getShortTermLimit(): number {
	return SHORT_TERM_LIMIT;
}

export async function getMobileLongTermMemories(): Promise<MobileLongTermMemory[]> {
	const db = await openDb();

	return new Promise((resolve, reject) => {
		const transaction = db.transaction(MEMORY_STORE, 'readonly');
		const request = transaction.objectStore(MEMORY_STORE).index('updatedAt').getAll();

		request.onsuccess = () => resolve((request.result as MobileLongTermMemory[]).reverse());
		request.onerror = () => reject(request.error);
	});
}

export async function saveMobileLongTermMemory(memory: MobileLongTermMemory): Promise<void> {
	await withStore(MEMORY_STORE, 'readwrite', (store) => store.put(memory));
}

export async function deleteMobileLongTermMemory(id: string): Promise<void> {
	await withStore(MEMORY_STORE, 'readwrite', (store) => store.delete(id));
}

export function loadMobileChatSettings(): MobileChatSettings {
	const raw = localStorage.getItem(SETTINGS_KEY);
	if (!raw) return getDefaultSettingsWithLocalHost();

	try {
		return {
			...getDefaultSettingsWithLocalHost(),
			...(JSON.parse(raw) as Partial<MobileChatSettings>)
		};
	} catch {
		return getDefaultSettingsWithLocalHost();
	}
}

export function saveMobileChatSettings(settings: MobileChatSettings): void {
	localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getDefaultSettingsWithLocalHost(): MobileChatSettings {
	const host = globalThis.location?.hostname || 'localhost';

	return {
		...defaultMobileChatSettings,
		voicevoxEndpoint: `http://${host}:50021`,
		irodoriEndpoint: `http://${host}:50110`
	};
}
