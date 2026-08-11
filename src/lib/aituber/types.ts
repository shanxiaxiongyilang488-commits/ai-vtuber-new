export type CharacterRuntimeState =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'generating_image'
  | 'generating_video'
  | 'generating_voice'
  | 'error';

export type AvatarEmotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised';

export interface AvatarStateSnapshot {
  speaking: boolean;
  mouthLevel: number;
  emotion: AvatarEmotion;
  thinking: boolean;
}

export type AvatarRendererKind = 'css-fallback' | 'purupuru-runtime';

/** 表示ランタイムからAvatarState実装を切り離すための最小境界。 */
export interface AvatarStatePort {
  setSpeaking(speaking: boolean): void;
  setMouthLevel(mouthLevel: number): void;
  setEmotion(emotion: AvatarEmotion): void;
  setThinking(thinking: boolean): void;
  reset(): void;
}

export interface AudioAnalyserOptions {
  fftSize?: number;
  smoothing?: number;
  noiseFloor?: number;
  gain?: number;
}

export type ConversationOrigin = 'user_reply' | 'proactive';

export type AITuberEventType =
  | 'user_message'
  | 'assistant_reply'
  | 'proactive_candidate'
  | 'proactive_message'
  | 'proactive_skipped'
  | 'speech_queued'
  | 'speech_started'
  | 'speech_finished'
  | 'speech_failed'
  | 'comment_received'
  | 'comment_delivered'
  | 'comment_dropped'
  | 'runtime_state_changed';

export interface ProactiveSettings {
  enabled: boolean;
  idleDelayMs: number;
  cooldownMs: number;
  maxPerHour: number;
  speakWhenHidden: boolean;
  autoPlayVoice: boolean;
}

export interface CharacterRuntimeSnapshot {
  characterId: string;
  state: CharacterRuntimeState;
  lastUserActivityAt: number;
  lastProactiveAt: number | null;
  proactiveTimestamps: number[];
  awaitingUserAfterProactive: boolean;
}

export interface AITuberEvent {
  id: string;
  type: AITuberEventType;
  characterId: string;
  timestamp: string;
  origin?: ConversationOrigin;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SpeechRequest {
  id: string;
  characterId: string;
  messageId: string;
  text: string;
  /** VoiceLab caption override for this message only. */
  voiceCaption?: string;
  /** Original user direction, retained for diagnostics and accessible UI. */
  voiceInstruction?: string;
  /** One-shot playback speed; does not mutate the saved character voice. */
  voiceSpeed?: number;
  /** One-shot post-generation pitch shift in semitones. */
  voicePitchShiftSemitones?: number;
  /** Keep the saved clone/LoRA identity and vary only delivery. */
  preserveBaseVoice?: boolean;
  origin: ConversationOrigin;
  createdAt: number;
}

export interface VoiceAudioSource {
  url: string;
  /** Actual RunPod route used for this synthesis, when available. */
  backend?: 'runpod-pod' | 'runpod-serverless';
  revoke?: () => void;
}

export interface VoiceAdapter {
  synthesize(
    characterId: string,
    text: string,
    signal?: AbortSignal,
    voiceCaption?: string,
    voiceSpeed?: number,
    preserveBaseVoice?: boolean,
    voicePitchShiftSemitones?: number,
  ): Promise<VoiceAudioSource>;
}

export interface ProactiveChatContext {
  characterId: string;
  characterName: string;
  persona: string;
  recentConversation: Array<{ role: 'user' | 'assistant'; text: string }>;
  longTermMemorySummary: string;
  recentWorkSummary?: string;
  idleMs: number;
  now: Date;
  provider?: 'openai' | 'gemini';
  model?: string;
}

export interface ChatAdapter {
  generateProactive(context: ProactiveChatContext, signal?: AbortSignal): Promise<{ text: string; actualModel?: string }>;
}

export interface MemoryAdapter {
  getLongTermSummary(characterId: string): Promise<string>;
}
