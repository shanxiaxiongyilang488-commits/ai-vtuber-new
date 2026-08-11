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
  grok: { apiKey: string; baseUrl: string; model: string; enabled: boolean };
  gemini: { key: string; model: string };
  anthropic: { key: string; model: string };
  fal: { key: string };
  minimax: { key: string };
  runpod: RunpodSettings;
  ideogram: { key: string };
  elevenlabs: { key: string };
  irodori: {
    url: string;
    voiceProfiles: Record<string, IrodoriVoiceProfile>;
  };
  voice: VoiceBackendSettings;
  video: VideoBackendSettings;
  local: { baseUrl: string; model: string };
  image: {
    provider: ImageProvider;
    model: string;
    size: string;
  };
};

export type ChatProvider = 'openai' | 'grok' | 'gemini' | 'claude' | 'lmstudio';
export type ImageProvider = 'openai' | 'gemini' | 'ideogram';
export type MediaProvider = 'openai' | 'fal' | 'ideogram' | 'runpod';
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
export type VoiceTtsBackend = 'local' | 'runpod';
export type VideoBackend = 'fal' | 'local' | 'runpod';

export type VoiceBackendSettings = {
  backend: VoiceBackend;
  /** Execution target for TTS synthesis only. This never changes the chat/LLM provider. */
  ttsBackend: VoiceTtsBackend;
  localUrl: string;
  colabUrl: string;
};

export type VideoBackendSettings = {
  backend: VideoBackend;
  localUrl: string;
};

export type RunpodSettings = {
  apiKey: string;
  voiceEndpointId: string;
  /** Separate endpoint running the local MiniMax H3 video worker. */
  videoEndpointId: string;
  /** Hugging Face checkpoint used by the RunPod Irodori worker. */
  voiceModel: string;
  /** App-side voice lease lifetime. RunPod endpoint Idle Timeout remains the final shutdown control. */
  sessionIdleSeconds: number;
  /** Cost guard for simultaneous app-managed voice leases. */
  maxActiveSessions: number;
  /** The browser renews a warm voice session at this interval. */
  voiceWarmIntervalSeconds: number;
  /** Prefer a directly-addressable Pod and retain Serverless as fallback. */
  voicePodEnabled: boolean;
  /** RunPod Pod ID hosting the Irodori HTTP sidecar. */
  voicePodId: string;
  /** Optional explicit proxy URL. Defaults to https://<podId>-8791.proxy.runpod.net. */
  voicePodUrl: string;
  /** Shared bearer token protecting the public RunPod proxy URL. */
  voicePodToken: string;
  /** Stop the shared Pod after this many idle minutes. Zero disables auto-stop. */
  voicePodIdleMinutes: number;
};

export const DEFAULT_RUNPOD_VOICE_MODEL = 'Aratako/Irodori-TTS-v4-Small';

export type IrodoriVoiceProfile = {
  characterName: string;
  caption: string;
  voice: string;
  ttsModel: string;
  designerModel: string;
  updatedAt: string;
};

export type ProviderKeyName = 'openai' | 'grok' | 'gemini' | 'anthropic' | 'fal' | 'minimax' | 'runpod' | 'elevenlabs' | 'ideogram';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'settings.json');
const SETTINGS_TEMPLATE_PATH = path.join(process.cwd(), 'data', 'settings.template.json');

export const DEFAULT_SETTINGS: ApiSettings = {
  chatProvider: 'openai',
  imageProvider: 'openai',
  mediaProvider: 'openai',
  chatConfig: { provider: 'openai', model: 'gpt-5.5' },
  imageConfig: { provider: 'openai', model: 'gpt-image-2' },
  mediaConfig: { provider: 'openai', model: 'openai/gpt-image-2' },
  openai: { key: '', model: 'gpt-5.5' },
  grok: { apiKey: '', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.5', enabled: false },
  gemini: { key: '', model: DEFAULT_GEMINI_MODEL },
  anthropic: { key: '', model: 'claude-3-5-haiku-latest' },
  fal: { key: '' },
  minimax: { key: '' },
  runpod: {
    apiKey: '',
    voiceEndpointId: '',
    videoEndpointId: '',
    voiceModel: DEFAULT_RUNPOD_VOICE_MODEL,
    sessionIdleSeconds: 90,
    maxActiveSessions: 1,
    voiceWarmIntervalSeconds: 45,
    voicePodEnabled: false,
    voicePodId: '',
    voicePodUrl: '',
    voicePodToken: '',
    voicePodIdleMinutes: 30,
  },
  ideogram: { key: '' },
  elevenlabs: { key: '' },
  irodori: { url: '', voiceProfiles: {} },
  voice: {
    backend: 'local',
    ttsBackend: 'local',
    localUrl: 'http://127.0.0.1:7860',
    colabUrl: '',
  },
  video: {
    backend: 'fal',
    localUrl: 'http://127.0.0.1:8793',
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
  if (provider === 'openai' || provider === 'grok' || provider === 'gemini' || provider === 'claude' || provider === 'lmstudio') return provider;
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
  if (provider === 'openai' || provider === 'ideogram' || provider === 'runpod') return provider;
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
  if (provider === 'runpod') return 'comfyui/anima';
  return DEFAULT_SETTINGS.mediaConfig.model;
}

function defaultChatModelForProvider(provider: ChatProvider, data: Record<string, unknown>): string {
  const openai = asRecord(data.openai);
  const grok = asRecord(data.grok);
  const gemini = asRecord(data.gemini);
  const local = asRecord(data.local);
  if (provider === 'openai') return stringValue(openai.model, DEFAULT_SETTINGS.openai.model);
  if (provider === 'grok') return stringValue(grok.model, DEFAULT_SETTINGS.grok.model);
  if (provider === 'claude') return stringValue(asRecord(data.anthropic).model, DEFAULT_SETTINGS.anthropic.model);
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
    // Accept the temporary chatBackend key as a migration alias. It selected only
    // the TTS execution path; no chat provider is read from this setting.
    ttsBackend: rawBackend === 'runpod'
      || stringValue(firstString(data.ttsBackend, data.tts_backend, data.chatBackend, data.chat_backend)).trim().toLowerCase() === 'runpod'
      ? 'runpod'
      : 'local',
    localUrl: localUrl || DEFAULT_SETTINGS.voice.localUrl,
    colabUrl,
  };
}

function normalizeVideoBackend(value: unknown): VideoBackendSettings {
  const data = asRecord(value);
  const rawBackend = stringValue(data.backend).trim().toLowerCase();
  const backend: VideoBackend = rawBackend === 'local' || rawBackend === 'runpod' ? rawBackend : 'fal';
  return {
    backend,
    localUrl: stringValue(firstString(data.localUrl, data.local_url), DEFAULT_SETTINGS.video.localUrl).trim()
      || DEFAULT_SETTINGS.video.localUrl,
  };
}

function normalizeWarmInterval(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.runpod.voiceWarmIntervalSeconds;
  return Math.min(300, Math.max(10, Math.round(parsed)));
}

function normalizeSessionIdleSeconds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.runpod.sessionIdleSeconds;
  return Math.min(3600, Math.max(30, Math.round(parsed)));
}

function normalizeMaxActiveSessions(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.runpod.maxActiveSessions;
  return Math.min(4, Math.max(1, Math.round(parsed)));
}

function normalizeVoicePodIdleMinutes(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.runpod.voicePodIdleMinutes;
  if (parsed <= 0) return 0;
  return Math.min(240, Math.max(5, Math.round(parsed)));
}

function normalizeRunpodVoiceModel(value: unknown): string {
  const model = stringValue(value).trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/.test(model)
    ? model
    : DEFAULT_RUNPOD_VOICE_MODEL;
}

export function normalizeSettings(value: unknown): ApiSettings {
  const data = asRecord(value);
  const openai = asRecord(data.openai);
  const grok = asRecord(data.grok);
  const gemini = asRecord(data.gemini);
  const anthropic = asRecord(data.anthropic);
  const fal = asRecord(data.fal);
  const minimax = asRecord(data.minimax);
  const runpod = asRecord(data.runpod);
  const ideogram = asRecord(data.ideogram);
  const elevenlabs = asRecord(data.elevenlabs);
  const irodori = asRecord(data.irodori);
  const voice = asRecord(data.voice);
  const video = asRecord(data.video);
  const local = asRecord(data.local);
  const image = asRecord(data.image);
  const chatConfigData = asRecord(data.chatConfig);
  const imageConfigData = asRecord(data.imageConfig);
  const mediaConfigData = asRecord(data.mediaConfig);
  const imageGenerationConfigData = asRecord(data.imageGenerationConfig);
  const legacyIrodoriUrl = stringValue(firstString(irodori.url, data.irodoriUrl, data.irodori_url, data.irodoriTtsUrl));
  const voiceSettings = normalizeVoiceBackend(voice, legacyIrodoriUrl);

  const chatProvider = normalizeChatProvider(firstString(chatConfigData.provider, data.chatProvider, data.chat_provider));
  const imageProvider = normalizeImageProvider(firstString(imageConfigData.provider, data.imageProvider, data.image_provider, image.provider));
  const mediaProvider = normalizeMediaProvider(firstString(imageGenerationConfigData.provider, data.imageGenerationProvider, mediaConfigData.provider, data.mediaProvider, data.media_provider));
  const chatModel = stringValue(
    firstString(chatConfigData.model, data.chatModel, data.chat_model),
    defaultChatModelForProvider(chatProvider, data),
  );
  const imageModel = stringValue(
    firstString(imageConfigData.model, image.model, data.imageModel, data.image_model),
    defaultImageModelForProvider(imageProvider),
  );
  const mediaModel = stringValue(
    firstString(imageGenerationConfigData.model, mediaConfigData.model, data.mediaModel, data.media_model),
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
    grok: {
      apiKey: stringValue(firstString(grok.apiKey, grok.key, data.grokKey, data.grok_api_key, data.xaiKey, data.xai_api_key)),
      baseUrl: stringValue(firstString(grok.baseUrl, data.grokBaseUrl, data.grok_base_url, data.xaiBaseUrl, data.xai_base_url), DEFAULT_SETTINGS.grok.baseUrl),
      model: stringValue(firstString(grok.model, data.grokModel, data.grok_model, data.api_grok_model), DEFAULT_SETTINGS.grok.model),
      enabled: Boolean(grok.enabled) || Boolean(stringValue(firstString(grok.apiKey, grok.key, data.grokKey, data.grok_api_key, data.xaiKey, data.xai_api_key)).trim()),
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
    minimax: {
      key: stringValue(firstString(minimax.key, data.minimaxKey, data.minimax_key, data.api_minimax_key)),
    },
    runpod: {
      apiKey: stringValue(firstString(runpod.apiKey, runpod.key, data.runpodApiKey, data.runpod_api_key)),
      voiceEndpointId: stringValue(firstString(runpod.voiceEndpointId, runpod.voice_endpoint_id, data.runpodVoiceEndpointId)),
      videoEndpointId: stringValue(firstString(runpod.videoEndpointId, runpod.video_endpoint_id, data.runpodVideoEndpointId)),
      voiceModel: normalizeRunpodVoiceModel(firstString(runpod.voiceModel, runpod.voice_model, data.runpodVoiceModel)),
      sessionIdleSeconds: normalizeSessionIdleSeconds(runpod.sessionIdleSeconds ?? runpod.session_idle_seconds),
      maxActiveSessions: normalizeMaxActiveSessions(runpod.maxActiveSessions ?? runpod.max_active_sessions),
      voiceWarmIntervalSeconds: normalizeWarmInterval(runpod.voiceWarmIntervalSeconds ?? runpod.voice_warm_interval_seconds),
      voicePodEnabled: runpod.voicePodEnabled === true || runpod.voice_pod_enabled === true,
      voicePodId: stringValue(firstString(runpod.voicePodId, runpod.voice_pod_id, data.runpodVoicePodId)).trim(),
      voicePodUrl: stringValue(firstString(runpod.voicePodUrl, runpod.voice_pod_url, data.runpodVoicePodUrl)).trim(),
      voicePodToken: stringValue(firstString(runpod.voicePodToken, runpod.voice_pod_token, data.runpodVoicePodToken)).trim(),
      voicePodIdleMinutes: normalizeVoicePodIdleMinutes(runpod.voicePodIdleMinutes ?? runpod.voice_pod_idle_minutes),
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
    video: normalizeVideoBackend(video),
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
  const hasVideoSettings = typeof incomingData.video === 'object';
  const hasRunpodSettings = typeof incomingData.runpod === 'object';
  const incomingChatConfig = asRecord(incomingData.chatConfig);
  const incomingImageConfig = asRecord(incomingData.imageConfig);
  const incomingMediaConfig = asRecord(incomingData.mediaConfig);
  const incomingImageGenerationConfig = asRecord(incomingData.imageGenerationConfig);
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
    || typeof incomingData.imageGenerationProvider === 'string'
    || typeof incomingImageGenerationConfig.provider === 'string'
    || typeof incomingMediaConfig.provider === 'string';
  const hasMediaModel = typeof incomingData.mediaModel === 'string'
    || typeof incomingData.media_model === 'string'
    || typeof incomingImageGenerationConfig.model === 'string'
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
    grok: {
      apiKey: incoming.grok.apiKey || current.grok.apiKey,
      baseUrl: incoming.grok.baseUrl || current.grok.baseUrl || DEFAULT_SETTINGS.grok.baseUrl,
      model: incoming.grok.model || current.grok.model || DEFAULT_SETTINGS.grok.model,
      enabled: Boolean((incoming.grok.apiKey || current.grok.apiKey).trim()),
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
    minimax: {
      key: incoming.minimax.key || current.minimax.key,
    },
    runpod: hasRunpodSettings ? {
      apiKey: incoming.runpod.apiKey || current.runpod.apiKey,
      voiceEndpointId: incoming.runpod.voiceEndpointId,
      videoEndpointId: incoming.runpod.videoEndpointId,
      voiceModel: incoming.runpod.voiceModel,
      sessionIdleSeconds: incoming.runpod.sessionIdleSeconds,
      maxActiveSessions: incoming.runpod.maxActiveSessions,
      voiceWarmIntervalSeconds: incoming.runpod.voiceWarmIntervalSeconds,
      voicePodEnabled: incoming.runpod.voicePodEnabled,
      voicePodId: incoming.runpod.voicePodId,
      voicePodUrl: incoming.runpod.voicePodUrl,
      voicePodToken: incoming.runpod.voicePodToken || current.runpod.voicePodToken,
      voicePodIdleMinutes: incoming.runpod.voicePodIdleMinutes,
    } : current.runpod,
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
    video: hasVideoSettings ? incoming.video : current.video,
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
    : settings.voice.backend === 'local'
      ? settings.voice.localUrl
      : '';
  return (voiceUrl || settings.irodori.url).trim().replace(/\/+$/, '');
}

export async function getProviderKey(provider: ProviderKeyName): Promise<string> {
  const settings = await readSettings();
  const key = provider === 'grok'
    ? settings.grok.apiKey
    : provider === 'runpod'
      ? settings.runpod.apiKey
      : settings[provider].key;
  const label = provider === 'anthropic' ? 'ANTHROPIC' : provider.toUpperCase();
  console.log(`[${label} KEY SOURCE] settings.json`);
  return key;
}
