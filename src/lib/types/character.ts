// =======================================
// AIエンジン
// =======================================
export type AIEngine =
  | 'dummy'
  | 'openai'
  | 'gemini'
  | 'ollama'
  | 'lmstudio';

// =======================================
// 音声エンジン
// =======================================
export type VoiceEngine =
  | 'none'
  | 'piper'
  | 'elevenlabs'
  | 'voicevox';

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
  systemPrompt: string;

  aiEngine: AIEngine;

  voiceEngine: VoiceEngine;
  voiceId: string;
  speakerId: number;

  // 👇 エラー対策（今出てるやつ）
  avatarEmoji?: string;
  color?: string;

  // 👇 将来用（あってもOK）
  ollamaModel?: string;

  // 追加系
  avatar?: string;
  personality?: string;
}



  