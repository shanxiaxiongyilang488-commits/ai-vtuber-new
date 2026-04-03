

// =========================
// AIエンジン
// =========================
export type AIEngine =
| 'dummy'
| 'openai'
| 'gemini'
| 'ollama'
| 'lmstudio';

// =========================
// 音声エンジン
// =========================
export type VoiceEngine =
| 'none'
| 'piper'
| 'elevenlabs'
| 'voicevox';

// =========================
// キャラクター型
// =========================
export interface Character {
id: 'char1' | 'char2';
name: string;



// 🔥 新 → これが本命
systemPrompt: string;

aiEngine: AIEngine;
voiceEngine: VoiceEngine;

color: string;
avatarEmoji: string;
avatar?: string;

// 音声系
voiceId: string;
speakerId: number;
}

// =========================
// Ollamaモデル一覧
// =========================
export const OLLAMA_MODEL_PRESETS: { value: string; label: string }[] = [
{ value: 'qwen:0.5b', label: 'Qwen 0.5B（最軽量）' },
{ value: 'gemma:2b', label: 'Gemma 2B' },
{ value: 'llama3.2:1b', label: 'Llama 3.2 1B' },
{ value: 'phi3:mini', label: 'Phi-3 Mini' },
];

// =========================
// AIエンジン選択
// =========================
export const AI_ENGINE_OPTIONS: { value: AIEngine; label: string }[] = [
{ value: 'dummy', label: 'ダミー（テスト用）' },
{ value: 'openai', label: 'OpenAI（GPT-4）' },
{ value: 'gemini', label: 'Google Gemini' },
{ value: 'ollama', label: 'Ollama（ローカル）' },
{ value: 'lmstudio', label: 'LM Studio（ローカル）' },
];

// =========================
// 音声エンジン選択
// =========================
export const VOICE_ENGINE_OPTIONS: { value: VoiceEngine; label: string }[] = [
{ value: 'none', label: 'なし' },
{ value: 'voicevox', label: 'VoiceVox' },
{ value: 'elevenlabs', label: 'ElevenLabs' },
{ value: 'piper', label: 'Piper' },
];
