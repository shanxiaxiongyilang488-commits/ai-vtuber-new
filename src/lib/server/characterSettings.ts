import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Per-character AI engine assignment for the CHARACTER LIBRARY "Personality Engine".
 *
 * Phase 2 scope: persistence only. The stored provider is a reserved selection
 * (no AI routing / API wiring yet). "AUTO" is a placeholder for a future router.
 */
export interface CharacterSetting {
  provider: string;
}

export type CharacterSettingsMap = Record<string, CharacterSetting>;

/** Allowed provider identifiers. Values are stored verbatim in character_settings.json. */
export const AI_PROVIDERS = ['AUTO', 'GPT-5.5', 'Grok', 'Gemini', 'Claude', 'Local LLM'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

const DEFAULT_PROVIDER: AiProvider = 'AUTO';
const SETTINGS_FILE = resolve(process.cwd(), 'data', 'character_settings.json');

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function isValidProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && (AI_PROVIDERS as readonly string[]).includes(value);
}

export function getCharacterSettings(): CharacterSettingsMap {
  if (!existsSync(SETTINGS_FILE)) return {};
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: CharacterSettingsMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const provider = (value as Partial<CharacterSetting>).provider;
      result[normalizeId(id)] = { provider: isValidProvider(provider) ? provider : DEFAULT_PROVIDER };
    }
    return result;
  } catch {
    return {};
  }
}

export function getCharacterSetting(id: string): CharacterSetting {
  return getCharacterSettings()[normalizeId(id)] ?? { provider: DEFAULT_PROVIDER };
}

export function saveCharacterSetting(id: string, provider: string): CharacterSetting {
  const normalizedId = normalizeId(id);
  if (!normalizedId) throw new Error('character id is required');
  if (!isValidProvider(provider)) throw new Error('unknown AI provider');
  const settings = getCharacterSettings();
  const setting: CharacterSetting = { provider };
  settings[normalizedId] = setting;
  writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
  return setting;
}
