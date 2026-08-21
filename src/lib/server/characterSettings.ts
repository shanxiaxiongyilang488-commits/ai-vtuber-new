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
  aiProfile: CharacterAiProfile;
}

export interface CharacterAiProfile {
  /** Shared legacy/default AI. Role settings inherit this when unset. */
  brainAI: AiProvider;
  conversationAI: RoleAiProvider;
  storyCardAI: RoleAiProvider;
  motionPromptAI: RoleAiProvider;
  characterAnalysisAI: RoleAiProvider;
  intentRouterAI: RoleAiProvider;
  imageAI: ImageAiProvider;
  videoAI: VideoAiProvider;
  voiceAI: VoiceAiProvider;
  memoryEnabled: boolean;
}

export type CharacterSettingsMap = Record<string, CharacterSetting>;

/** Allowed provider identifiers. Values are stored verbatim in character_settings.json. */
export const AI_PROVIDERS = ['AUTO', 'GPT-5.5', 'Grok', 'Gemini', 'Claude', 'Local LLM'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
export type RoleAiProvider = AiProvider | 'INHERIT';
export type CharacterAiRole = 'conversation' | 'storyCard' | 'motionPrompt' | 'characterAnalysis' | 'intentRouter';
export const IMAGE_AI_PROVIDERS = ['GPT Image', 'NanoBanana 2 Lite', 'NanoBanana 2', 'NanoBanana Pro', 'NanoBanana', 'Flux Kontext', 'Seedream'] as const;
export type ImageAiProvider = (typeof IMAGE_AI_PROVIDERS)[number];
export const VIDEO_AI_PROVIDERS = ['Seedance2 Mini', 'Seedance2', 'Sora 2', 'Kling 1.6', 'Kling Elements', 'Kling O1 Reference', 'Kling 1.6 Elements', 'Gemini Omni Flash Reference', 'Gemini Omni Flash Image', 'Gemini Omni Flash Edit'] as const;
export type VideoAiProvider = (typeof VIDEO_AI_PROVIDERS)[number];
export const VOICE_AI_PROVIDERS = ['Irodori', 'Irodori Lite', 'Qwen-TTS', 'Local Voice'] as const;
export type VoiceAiProvider = (typeof VOICE_AI_PROVIDERS)[number];

const DEFAULT_PROVIDER: AiProvider = 'AUTO';
const DEFAULT_PROFILE: CharacterAiProfile = {
  brainAI: 'AUTO', conversationAI: 'INHERIT', storyCardAI: 'INHERIT', motionPromptAI: 'INHERIT',
  characterAnalysisAI: 'INHERIT', intentRouterAI: 'INHERIT', imageAI: 'GPT Image', videoAI: 'Seedance2', voiceAI: 'Irodori', memoryEnabled: true,
};
const SETTINGS_FILE = resolve(process.cwd(), 'data', 'character_settings.json');

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function isValidProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && (AI_PROVIDERS as readonly string[]).includes(value);
}
function normalizeRoleProvider(value: unknown): RoleAiProvider {
  return value === 'INHERIT' || isValidProvider(value) ? value : 'INHERIT';
}
function isValidImageAi(value: unknown): value is ImageAiProvider { return typeof value === 'string' && (IMAGE_AI_PROVIDERS as readonly string[]).includes(value); }
function isValidVideoAi(value: unknown): value is VideoAiProvider { return typeof value === 'string' && (VIDEO_AI_PROVIDERS as readonly string[]).includes(value); }
function isValidVoiceAi(value: unknown): value is VoiceAiProvider { return typeof value === 'string' && (VOICE_AI_PROVIDERS as readonly string[]).includes(value); }
function normalizeProfile(value: unknown, legacyProvider: unknown): CharacterAiProfile {
  const profile = (value ?? {}) as Partial<CharacterAiProfile>;
  const legacyConversation = (profile as Partial<CharacterAiProfile> & { conversationAI?: unknown }).conversationAI;
  const brainAI = isValidProvider(profile.brainAI)
    ? profile.brainAI
    : (isValidProvider(legacyProvider) ? legacyProvider : (isValidProvider(legacyConversation) ? legacyConversation : DEFAULT_PROFILE.brainAI));
  const hasExplicitBrain = isValidProvider(profile.brainAI);
  return {
    brainAI,
    conversationAI: hasExplicitBrain ? normalizeRoleProvider(profile.conversationAI) : 'INHERIT',
    storyCardAI: normalizeRoleProvider(profile.storyCardAI),
    motionPromptAI: normalizeRoleProvider(profile.motionPromptAI),
    characterAnalysisAI: normalizeRoleProvider(profile.characterAnalysisAI),
    intentRouterAI: normalizeRoleProvider(profile.intentRouterAI),
    imageAI: isValidImageAi(profile.imageAI) ? profile.imageAI : DEFAULT_PROFILE.imageAI,
    videoAI: isValidVideoAi(profile.videoAI) ? profile.videoAI : DEFAULT_PROFILE.videoAI,
    voiceAI: isValidVoiceAi(profile.voiceAI) ? profile.voiceAI : DEFAULT_PROFILE.voiceAI,
    memoryEnabled: typeof profile.memoryEnabled === 'boolean' ? profile.memoryEnabled : DEFAULT_PROFILE.memoryEnabled,
  };
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
      const aiProfile = normalizeProfile((value as Partial<CharacterSetting>).aiProfile, provider);
      result[normalizeId(id)] = { provider: aiProfile.brainAI, aiProfile };
    }
    return result;
  } catch {
    return {};
  }
}

export function getCharacterSetting(id: string): CharacterSetting {
  return getCharacterSettings()[normalizeId(id)] ?? { provider: DEFAULT_PROVIDER, aiProfile: DEFAULT_PROFILE };
}

export function saveCharacterSetting(id: string, provider: string, aiProfile?: unknown): CharacterSetting {
  const normalizedId = normalizeId(id);
  if (!normalizedId) throw new Error('character id is required');
  if (!isValidProvider(provider)) throw new Error('unknown AI provider');
  const settings = getCharacterSettings();
  const profile = normalizeProfile(aiProfile, provider);
  const setting: CharacterSetting = { provider: profile.brainAI, aiProfile: profile };
  settings[normalizedId] = setting;
  writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
  return setting;
}

export function resolveCharacterAiProvider(id: string | undefined, role: CharacterAiRole): AiProvider {
  const profile = id ? getCharacterSetting(id).aiProfile : DEFAULT_PROFILE;
  const selected = role === 'conversation' ? profile.conversationAI
    : role === 'storyCard' ? profile.storyCardAI
    : role === 'motionPrompt' ? profile.motionPromptAI
    : role === 'characterAnalysis' ? profile.characterAnalysisAI
    : profile.intentRouterAI;
  return selected === 'INHERIT' || selected === 'AUTO' ? profile.brainAI : selected;
}
