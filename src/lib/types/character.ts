// =======================================
// AIエンジン
// =======================================
export type AIEngine =
  | 'dummy'
  | 'openai'
  | 'gemini'
  | 'ollama'
  | 'lmstudio';

export const AI_ENGINE_OPTIONS = [
  { value: 'dummy', label: 'Dummy' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'lmstudio', label: 'LM Studio' },
] as const;

// =======================================
// 音声エンジン
// =======================================
export type VoiceEngine =
  | 'none'
  | 'piper'
  | 'irodori-tts'
  | 'colab-tts'
  | 'elevenlabs'
  | 'voicevox';

export const IRODORI_TTS_VOICE_OPTIONS = [
  'none',
  'sample',
  'irodori-tts-500m-v3',
  'kokoro-82m',
  'openvoice-v2',
] as const;

export const COLAB_TTS_VOICE_OPTIONS = IRODORI_TTS_VOICE_OPTIONS;

export const VOICE_ENGINE_OPTIONS = [
  { value: 'irodori-tts', label: 'Irodori TTS (Recommended)' },
  { value: 'none', label: 'None' },
  { value: 'voicevox', label: 'VOICEVOX' },
  { value: 'colab-tts', label: 'Colab TTS' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'piper', label: 'Piper Plus (Advanced / manual setup)' },
] as const;

export const OLLAMA_MODEL_PRESETS = [
  { value: 'qwen:0.5b', label: 'qwen:0.5b' },
  { value: 'llama3', label: 'llama3' },
  { value: 'mistral', label: 'mistral' },
] as const;

// =======================================
// キャラクター型
// =======================================
export interface Character {
  id: 'char1' | 'char2';
  name: string;

  // 👇 追加（今回のコア）
  firstPerson?: string;
  secondPerson?: string;
  catchPhrase?: string;

  // 👇 既存
  systemPrompt?: string;
  prompt?: string;

  aiEngine: AIEngine;

  voiceEngine: VoiceEngine;
  voice?: string;
  voiceId?: string;
  speakerId?: number;

  // 👇 エラー対策（今出てるやつ）
  avatarEmoji?: string;
  color?: string;

  // 👇 将来用（あってもOK）
  ollamaModel?: string;

  // 追加系
  avatar?: string;
  personality?: string;
}



  
