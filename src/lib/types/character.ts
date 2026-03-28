export type AIEngine = 'dummy' | 'openai' | 'gemini' | 'ollama' | 'lmstudio';
export type VoiceEngine = 'none' | 'piper' | 'elevenlabs' | 'voicevox';

export interface Character {
  id: 'char1' | 'char2';
  name: string;
  prompt: string;
  aiEngine: AIEngine;
  voiceEngine: VoiceEngine;
  color: string;
  avatarEmoji: string;
  ollamaModel: string; // Ollama使用時のモデル名（例: qwen:0.5b）
}

export const OLLAMA_MODEL_PRESETS: { value: string; label: string }[] = [
  { value: 'qwen:0.5b', label: 'Qwen 0.5B（最軽量）' },
  { value: 'gemma:2b', label: 'Gemma 2B' },
  { value: 'llama3.2:1b', label: 'Llama 3.2 1B' },
  { value: 'phi3:mini', label: 'Phi-3 Mini' },
];

export const AI_ENGINE_OPTIONS: { value: AIEngine; label: string }[] = [
  { value: 'dummy', label: 'ダミー（テスト用）' },
  { value: 'openai', label: 'OpenAI (GPT-4)' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'ollama', label: 'Ollama (ローカル)' },
  { value: 'lmstudio', label: 'LM Studio（ローカル）' },
];


export const VOICE_ENGINE_OPTIONS: { value: VoiceEngine; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'voicevox', label: 'VoiceVox' },
  { value: 'piper', label: 'Piper' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
];
