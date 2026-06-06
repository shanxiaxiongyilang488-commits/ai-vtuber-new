import fs from 'node:fs/promises';
import path from 'node:path';

export type ApiSettings = {
  chatProvider: ChatProvider;
  imageProvider: ImageProvider;
  mediaProvider: MediaProvider;
  chatConfig: ChatConfig;
  imageConfig: ImageConfig;
  mediaConfig: MediaConfig;
  openai: { key: string; model: string };
  gemini: { key: string; model: string };
  anthropic: { key: string; model: string };
  fal: { key: string };
  ideogram: { key: string };
  elevenlabs: { key: string };
  irodori: {
    url: string;
    voiceProfiles: Record<string, IrodoriVoiceProfile>;
  };
  voice: VoiceBackendSettings;
  local: { baseUrl: string; model: string };
  image: {
    provider: ImageProvider;
    model: string;
    size: string;
  };
};

export type ChatProvider = 'openai' | 'gemini' | 'lmstudio';
export type ImageProvider = 'openai' | 'gemini' | 'ideogram';
export type MediaProvider = 'openai' | 'fal' | 'ideogram';
export type ChatConfig = {
  provider: ChatProvider;
  model: string;
};
export type ImageConfig = {
  provider: ImageProvider;
  model: string;
};
export type MediaConfig = {
  provider: MediaProvider;
  model: string;
};
export type VoiceBackend = 'local' | 'colab';

export type VoiceBackendSettings = {
  backend: VoiceBackend;
  localUrl: string;
  colabUrl: string;
};

export type IrodoriVoiceProfile = {
  characterName: string;
  caption: string;
  voice: string;
  ttsModel: string;
  designerModel: string;
  updatedAt: string;
};

export type ProviderKeyName = 'openai' | 'gemini' | 'anthropic' | 'fal' | 'elevenlabs' | 'ideogram';

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'settings.json');
const SETTINGS_TEMPLATE_PATH = path.join(process.cwd(), 'data', 'settings.template.json');

export const DEFAULT_SETTINGS: ApiSettings = {
  chatProvider: 'gemini',
  imageProvider: 'openai',
  mediaProvider: 'fal',
  chatConfig: { provider: 'gemini', model: 'gemini-2.5-flash' },
  imageConfig: { provider: 'openai', model: 'gpt-image-2' },
  mediaConfig: { provider: 'fal', model: 'fal-ai/nano-banana' },
  openai: { key: '', model: 'gpt-4o-mini' },
  gemini: { key: '', model: 'gemini-2.5-flash' },
  anthropic: { key: '', model: 'claude-3-5-haiku-latest' },
  fal: { key: '' },
  ideogram: { key: '' },
  elevenlabs: { key: '' },
  irodori: { url: '', voiceProfiles: {} },
  voice: {
    backend: 'local',
    localUrl: 'http://127.0.0.1:7860',
    colabUrl: '',
  },
  local: { baseUrl: 'http://localhost:1234', model: 'qwen/qwen3-4b' },
  image: {
    provider: 'openai',
    model: 'gpt-image-2',
    size: '1024x1024',
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function normalizeIrodoriVoiceProfile(key: string, value: unknown): IrodoriVoiceProfile | null {
  const data = asRecord(value);
  const characterName = stringValue(firstString(data.characterName, data.name), key).trim();
  const caption = stringValue(data.caption).trim();
  if (!characterName || !caption) return null;

  return {
    characterName,
    caption,
    voice: stringValue(data.voice).trim(),
    ttsModel: stringValue(data.ttsModel).trim(),
    designerModel: stringValue(data.designerModel).trim(),
    updatedAt: stringValue(data.updatedAt, new Date().toISOString()),
  };
}

function normalizeIrodoriVoiceProfiles(value: unknown): Record<string, IrodoriVoiceProfile> {
  const profiles = asRecord(value);
  const normalized: Record<string, IrodoriVoiceProfile> = {};

  for (const [key, profileValue] of Object.entries(profiles)) {
    const profile = normalizeIrodoriVoiceProfile(key, profileValue);
    if (profile) normalized[profile.characterName] = profile;
  }

  return normalized;
}

function normalizeImageSize(value: unknown): string {
  const size = typeof value === 'string' ? value : '';
  if (
    size !== '1024x1024' &&
    size !== '1024x1536' &&
    size !== '1536x1024'
  ) {
    return '1024x1024';
  }
  return size;
}

function normalizeChatProvider(value: unknown): ChatProvider {
  const provider = stringValue(value).trim().toLowerCase();
  if (provider === 'openai' || provider === 'gemini' || provider === 'lmstudio') return provider;
  return DEFAULT_SETTINGS.chatProvider;
}

function normalizeImageProvider(value: unknown): ImageProvider {
  const provider = stringValue(value).trim().toLowerCase();
  if (provider === 'openai' || provider === 'gemini' || provider === 'ideogram') return provider;
  return DEFAULT_SETTINGS.imageProvider;
}

function normalizeMediaProvider(value: unknown): MediaProvider {
  const provider = stringValue(value).trim().toLowerCase();
  if (provider === 'fal' || provider === 'fal-ai') return 'fal';
  if (provider === 'openai' || provider === 'ideogram') return provider;
  return DEFAULT_SETTINGS.mediaProvider;
}

function defaultImageModelForProvider(provider: ImageProvider): string {
  if (provider === 'gemini') return 'nano-banana';
  if (provider === 'ideogram') return 'ideogram-v3';
  return 'gpt-image-2';
}

function defaultMediaModelForProvider(provider: MediaProvider): string {
  if (provider === 'fal') return 'fal-ai/nano-banana';
  if (provider === 'openai') return 'gpt-image-2';
  if (provider === 'ideogram') return 'ideogram-v3';
  return DEFAULT_SETTINGS.mediaConfig.model;
}

function defaultChatModelForProvider(provider: ChatProvider, data: Record<string, unknown>): string {
  const openai = asRecord(data.openai);
  const gemini = asRecord(data.gemini);
  const local = asRecord(data.local);
  if (provider === 'openai') return stringValue(openai.model, DEFAULT_SETTINGS.openai.model);
  if (provider === 'lmstudio') return stringValue(local.model, DEFAULT_SETTINGS.local.model);
  return stringValue(gemini.model, DEFAULT_SETTINGS.gemini.model);
}

function normalizeVoiceBackend(value: unknown, legacyIrodoriUrl = ''): VoiceBackendSettings {
  const data = asRecord(value);
  const rawBackend = stringValue(data.backend).trim().toLowerCase();
  const legacyLooksLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(legacyIrodoriUrl);
  const backend: VoiceBackend = rawBackend === 'colab'
    ? 'colab'
    : (rawBackend === 'local' || !legacyIrodoriUrl || legacyLooksLocal ? 'local' : 'colab');
  const localUrl = stringValue(
    firstString(data.localUrl, data.local_url),
    legacyLooksLocal ? legacyIrodoriUrl : DEFAULT_SETTINGS.voice.localUrl,
  ).trim();
  const colabUrl = stringValue(
    firstString(data.colabUrl, data.colab_url),
    legacyLooksLocal ? '' : legacyIrodoriUrl,
  ).trim();

  return {
    backend,
    localUrl: localUrl || DEFAULT_SETTINGS.voice.localUrl,
    colabUrl,
  };
}

export function normalizeSettings(value: unknown): ApiSettings {
  const data = asRecord(value);
  const openai = asRecord(data.openai);
  const gemini = asRecord(data.gemini);
  const anthropic = asRecord(data.anthropic);
  const fal = asRecord(data.fal);
  const ideogram = asRecord(data.ideogram);
  const elevenlabs = asRecord(data.elevenlabs);
  const irodori = asRecord(data.irodori);
  const voice = asRecord(data.voice);
  const local = asRecord(data.local);
  const image = asRecord(data.image);
  const chatConfigData = asRecord(data.chatConfig);
  const imageConfigData = asRecord(data.imageConfig);
  const mediaConfigData = asRecord(data.mediaConfig);
  const legacyIrodoriUrl = stringValue(firstString(irodori.url, data.irodoriUrl, data.irodori_url, data.irodoriTtsUrl));
  const voiceSettings = normalizeVoiceBackend(voice, legacyIrodoriUrl);

  const chatProvider = normalizeChatProvider(firstString(chatConfigData.provider, data.chatProvider, data.chat_provider));
  const imageProvider = normalizeImageProvider(firstString(imageConfigData.provider, data.imageProvider, data.image_provider, image.provider));
  const mediaProvider = normalizeMediaProvider(firstString(mediaConfigData.provider, data.mediaProvider, data.media_provider));
  const chatModel = stringValue(
    firstString(chatConfigData.model, data.chatModel, data.chat_model),
    defaultChatModelForProvider(chatProvider, data),
  );
  const imageModel = stringValue(
    firstString(imageConfigData.model, image.model, data.imageModel, data.image_model),
    defaultImageModelForProvider(imageProvider),
  );
  const mediaModel = stringValue(
    firstString(mediaConfigData.model, data.mediaModel, data.media_model),
    defaultMediaModelForProvider(mediaProvider),
  );

  return {
    chatProvider,
    imageProvider,
    mediaProvider,
    chatConfig: {
      provider: chatProvider,
      model: chatModel,
    },
    imageConfig: {
      provider: imageProvider,
      model: imageModel,
    },
    mediaConfig: {
      provider: mediaProvider,
      model: mediaModel,
    },
    openai: {
      key: stringValue(firstString(openai.key, data.openaiKey, data.openai_api_key, data.api_openai_key)),
      model: stringValue(firstString(openai.model, data.openaiModel, data.openai_model, data.api_openai_model), DEFAULT_SETTINGS.openai.model),
    },
    gemini: {
      key: stringValue(firstString(gemini.key, data.geminiKey, data.gemini_api_key, data.api_gemini_key)),
      model: stringValue(firstString(gemini.model, data.geminiModel, data.gemini_model, data.api_gemini_model), DEFAULT_SETTINGS.gemini.model),
    },
    anthropic: {
      key: stringValue(firstString(anthropic.key, data.anthropicKey, data.anthropic_api_key, data.claudeKey, data.claude_api_key, data.api_claude_key)),
      model: stringValue(firstString(anthropic.model, data.anthropicModel, data.anthropic_model, data.claudeModel, data.claude_model, data.api_claude_model), DEFAULT_SETTINGS.anthropic.model),
    },
    fal: {
      key: stringValue(firstString(fal.key, data.falKey, data.fal_key, data.api_fal_key)),
    },
    ideogram: {
      key: stringValue(firstString(ideogram.key, data.ideogramKey, data.ideogram_key, data.api_ideogram_key)),
    },
    elevenlabs: {
      key: stringValue(firstString(elevenlabs.key, data.elevenlabsKey, data.elevenLabsKey, data.elevenlabs_api_key, data.elevenlabsApiKey)),
    },
    irodori: {
      url: legacyIrodoriUrl || (voiceSettings.backend === 'colab' ? voiceSettings.colabUrl : voiceSettings.localUrl),
      voiceProfiles: normalizeIrodoriVoiceProfiles(irodori.voiceProfiles ?? data.irodoriVoiceProfiles),
    },
    voice: voiceSettings,
    local: {
      baseUrl: stringValue(firstString(local.baseUrl, data.localBaseUrl, data.local_base_url, data.api_local_url), DEFAULT_SETTINGS.local.baseUrl),
      model: stringValue(firstString(local.model, data.localModel, data.local_model, data.api_local_model), DEFAULT_SETTINGS.local.model),
    },
    image: {
      provider: imageProvider,
      model: imageModel,
      size: normalizeImageSize(firstString(image.size, data.imageSize, data.image_size)),
    },
  };
}

export async function readSettings(): Promise<ApiSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf-8');
    return normalizeSettings(JSON.parse(raw));
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code !== 'ENOENT') {
      console.warn('[SETTINGS] using defaults:', error);
      return DEFAULT_SETTINGS;
    }

    try {
      const template = await fs.readFile(SETTINGS_TEMPLATE_PATH, 'utf-8');
      const settings = normalizeSettings(JSON.parse(template));
      await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
      await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, {
        encoding: 'utf-8',
        flag: 'wx',
      }).catch((writeError: NodeJS.ErrnoException) => {
        if (writeError.code !== 'EEXIST') throw writeError;
      });
      return settings;
    } catch (templateError) {
      console.warn('[SETTINGS] using defaults:', templateError);
      return DEFAULT_SETTINGS;
    }
  }
}

export async function writeSettings(settings: unknown): Promise<ApiSettings> {
  const current = await readSettings();
  const incomingData = asRecord(settings);
  const incomingIrodori = asRecord(incomingData.irodori);
  const hasIrodoriUrl = typeof incomingIrodori.url === 'string'
    || typeof incomingData.irodoriUrl === 'string'
    || typeof incomingData.irodori_url === 'string'
    || typeof incomingData.irodoriTtsUrl === 'string';
  const hasIrodoriVoiceProfiles = typeof incomingIrodori.voiceProfiles === 'object'
    || typeof incomingData.irodoriVoiceProfiles === 'object';
  const hasVoiceSettings = typeof incomingData.voice === 'object';
  const incomingChatConfig = asRecord(incomingData.chatConfig);
  const incomingImageConfig = asRecord(incomingData.imageConfig);
  const incomingMediaConfig = asRecord(incomingData.mediaConfig);
  const hasChatProvider = typeof incomingData.chatProvider === 'string'
    || typeof incomingData.chat_provider === 'string'
    || typeof incomingChatConfig.provider === 'string';
  const hasChatModel = typeof incomingData.chatModel === 'string'
    || typeof incomingData.chat_model === 'string'
    || typeof incomingChatConfig.model === 'string';
  const hasImageProvider = typeof incomingData.imageProvider === 'string'
    || typeof incomingData.image_provider === 'string'
    || typeof asRecord(incomingData.image).provider === 'string'
    || typeof incomingImageConfig.provider === 'string';
  const hasImageModel = typeof asRecord(incomingData.image).model === 'string'
    || typeof incomingData.imageModel === 'string'
    || typeof incomingData.image_model === 'string'
    || typeof incomingImageConfig.model === 'string';
  const hasMediaProvider = typeof incomingData.mediaProvider === 'string'
    || typeof incomingData.media_provider === 'string'
    || typeof incomingMediaConfig.provider === 'string';
  const hasMediaModel = typeof incomingData.mediaModel === 'string'
    || typeof incomingData.media_model === 'string'
    || typeof incomingMediaConfig.model === 'string';
  const incoming = normalizeSettings(settings);
  const nextChatProvider = hasChatProvider ? incoming.chatConfig.provider : current.chatConfig.provider;
  const nextImageProvider = hasImageProvider ? incoming.imageConfig.provider : current.imageConfig.provider;
  const nextMediaProvider = hasMediaProvider ? incoming.mediaConfig.provider : current.mediaConfig.provider;
  const activeIrodoriUrl = incoming.voice.backend === 'colab' ? incoming.voice.colabUrl : incoming.voice.localUrl;
  const normalized: ApiSettings = {
    chatProvider: nextChatProvider,
    imageProvider: nextImageProvider,
    mediaProvider: nextMediaProvider,
    chatConfig: {
      provider: nextChatProvider,
      model: hasChatModel
        ? incoming.chatConfig.model
        : (hasChatProvider ? defaultChatModelForProvider(nextChatProvider, incoming as unknown as Record<string, unknown>) : current.chatConfig.model),
    },
    imageConfig: {
      provider: nextImageProvider,
      model: hasImageModel
        ? incoming.imageConfig.model
        : (hasImageProvider ? defaultImageModelForProvider(nextImageProvider) : current.imageConfig.model),
    },
    mediaConfig: {
      provider: nextMediaProvider,
      model: hasMediaModel
        ? incoming.mediaConfig.model
        : (hasMediaProvider ? defaultMediaModelForProvider(nextMediaProvider) : current.mediaConfig.model),
    },
    openai: {
      key: incoming.openai.key || current.openai.key,
      model: incoming.openai.model || current.openai.model,
    },
    gemini: {
      key: incoming.gemini.key || current.gemini.key,
      model: incoming.gemini.model || current.gemini.model,
    },
    anthropic: {
      key: incoming.anthropic.key || current.anthropic.key,
      model: incoming.anthropic.model || current.anthropic.model,
    },
    fal: {
      key: incoming.fal.key || current.fal.key,
    },
    ideogram: {
      key: incoming.ideogram.key || current.ideogram.key,
    },
    elevenlabs: {
      key: incoming.elevenlabs.key || current.elevenlabs.key,
    },
    irodori: {
      url: hasVoiceSettings ? activeIrodoriUrl : (hasIrodoriUrl ? incoming.irodori.url : current.irodori.url),
      voiceProfiles: hasIrodoriVoiceProfiles ? incoming.irodori.voiceProfiles : current.irodori.voiceProfiles,
    },
    voice: hasVoiceSettings ? incoming.voice : current.voice,
    local: {
      baseUrl: incoming.local.baseUrl || current.local.baseUrl,
      model: incoming.local.model || current.local.model,
    },
    image: {
      provider: nextImageProvider,
      model: hasImageModel
        ? incoming.imageConfig.model
        : (hasImageProvider ? defaultImageModelForProvider(nextImageProvider) : current.imageConfig.model),
      size: normalizeImageSize(incoming.image.size || current.image.size),
    },
  };
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
  return normalized;
}

export function resolveVoiceBackendUrl(settings: ApiSettings): string {
  const voiceUrl = settings.voice.backend === 'colab'
    ? settings.voice.colabUrl
    : settings.voice.localUrl;
  return (voiceUrl || settings.irodori.url).trim().replace(/\/+$/, '');
}

export async function getProviderKey(provider: ProviderKeyName): Promise<string> {
  const settings = await readSettings();
  const key = settings[provider].key;
  const label = provider === 'anthropic' ? 'ANTHROPIC' : provider.toUpperCase();
  console.log(`[${label} KEY SOURCE] settings.json`);
  return key;
}
