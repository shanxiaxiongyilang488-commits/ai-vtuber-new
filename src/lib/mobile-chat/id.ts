export function createMobileChatId(prefix: string): string {
	return `${prefix}-${createSafeUuid()}`;
}

function createSafeUuid(): string {
	if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
		return globalThis.crypto.randomUUID();
	}

	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
