import type { LocalLlmSettings } from './chat/types';

const SETTINGS_KEY = 'risea-mobile-chat-settings';

export const defaultLocalLlmSettings: LocalLlmSettings = {
	enabled: false,
	endpoint: 'http://localhost:11434',
	model: 'llama3.1',
	temperature: 0.7
};

export function loadLocalLlmSettings(): LocalLlmSettings {
	const raw = localStorage.getItem(SETTINGS_KEY);
	if (!raw) return defaultLocalLlmSettings;

	try {
		return {
			...defaultLocalLlmSettings,
			...(JSON.parse(raw) as Partial<LocalLlmSettings>)
		};
	} catch {
		return defaultLocalLlmSettings;
	}
}

export function saveLocalLlmSettings(settings: LocalLlmSettings): void {
	localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
