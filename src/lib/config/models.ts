/**
 * 共通モデル定義
 * ここを修正すると全画面に反映される
 */

export type AIProvider = 'openai' | 'gemini' | 'claude' | 'ollama' | 'lmstudio' | 'colab-ollama' | 'onair';

export const PROVIDER_OPTIONS: readonly { value: Exclude<AIProvider, 'onair'>; label: string }[] = [
  { value: 'openai',   label: 'OpenAI' },
  { value: 'gemini',   label: 'Gemini' },
  { value: 'claude',   label: 'Claude（開発者専用）' },
  { value: 'ollama',   label: 'Ollama' },
  { value: 'colab-ollama', label: 'Colab Ollama' },
  { value: 'lmstudio', label: 'LM Studio' },
];

export const PROVIDER_MODELS: Record<AIProvider, readonly string[]> = {
  openai:   ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'o3-mini'],
  gemini:   ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-3-pro-preview'],
  claude:   ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'],
  ollama:   ['qwen2.5:3b', 'llama3.2:3b'],
  'colab-ollama': [],
  lmstudio: ['local-model'],
  onair:    [],
};

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai:   'gpt-4o-mini',
  gemini:   'gemini-2.5-flash',
  claude:   'claude-haiku-4-5-20251001',
  ollama:   'qwen2.5:3b',
  'colab-ollama': '',
  lmstudio: 'local-model',
  onair:    '',
};
