import type { ProactiveSettings } from './types.ts';

export const PROACTIVE_SETTINGS_KEY = 'ai-vtuber:proactive-settings:v1';
export const DEFAULT_PROACTIVE_SETTINGS: ProactiveSettings = {
  enabled: true,
  idleDelayMs: 5 * 60_000,
  cooldownMs: 10 * 60_000,
  maxPerHour: 3,
  speakWhenHidden: false,
  autoPlayVoice: true,
};

type SettingsRecord = Record<string, Partial<ProactiveSettings>>;

function clampSettings(value?: Partial<ProactiveSettings>): ProactiveSettings {
  return {
    enabled: value?.enabled ?? DEFAULT_PROACTIVE_SETTINGS.enabled,
    idleDelayMs: Math.max(30_000, Number(value?.idleDelayMs) || DEFAULT_PROACTIVE_SETTINGS.idleDelayMs),
    cooldownMs: Math.max(60_000, Number(value?.cooldownMs) || DEFAULT_PROACTIVE_SETTINGS.cooldownMs),
    maxPerHour: Math.max(1, Math.min(12, Number(value?.maxPerHour) || DEFAULT_PROACTIVE_SETTINGS.maxPerHour)),
    speakWhenHidden: value?.speakWhenHidden ?? DEFAULT_PROACTIVE_SETTINGS.speakWhenHidden,
    autoPlayVoice: value?.autoPlayVoice ?? DEFAULT_PROACTIVE_SETTINGS.autoPlayVoice,
  };
}

export function loadProactiveSettings(characterId: string): ProactiveSettings {
  if (typeof localStorage === 'undefined' || !characterId) return { ...DEFAULT_PROACTIVE_SETTINGS };
  try {
    const records = JSON.parse(localStorage.getItem(PROACTIVE_SETTINGS_KEY) ?? '{}') as SettingsRecord;
    return clampSettings(records[characterId]);
  } catch {
    return { ...DEFAULT_PROACTIVE_SETTINGS };
  }
}

export function hasStoredProactiveSettings(characterId: string): boolean {
  if (typeof localStorage === 'undefined' || !characterId) return false;
  try {
    const records = JSON.parse(localStorage.getItem(PROACTIVE_SETTINGS_KEY) ?? '{}') as SettingsRecord;
    return Object.prototype.hasOwnProperty.call(records, characterId);
  } catch {
    return false;
  }
}

export function saveProactiveSettings(characterId: string, settings: ProactiveSettings): void {
  if (typeof localStorage === 'undefined' || !characterId) return;
  try {
    const records = JSON.parse(localStorage.getItem(PROACTIVE_SETTINGS_KEY) ?? '{}') as SettingsRecord;
    records[characterId] = clampSettings(settings);
    localStorage.setItem(PROACTIVE_SETTINGS_KEY, JSON.stringify(records));
  } catch {
    // Settings persistence must not interrupt chat.
  }
}
