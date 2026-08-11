/**
 * 共通モデル定義
 * ここを修正すると全画面に反映される
 */

export type AIProvider = 'openai' | 'grok' | 'gemini' | 'claude' | 'ollama' | 'lmstudio' | 'colab-ollama' | 'onair';

export const PROVIDER_OPTIONS: readonly { value: Exclude<AIProvider, 'onair'>; label: string }[] = [
  { value: 'openai',   label: 'OpenAI' },
  { value: 'grok',     label: 'Grok' },
  { value: 'gemini',   label: 'Gemini' },
  { value: 'claude',   label: 'Claude（開発者専用）' },
  { value: 'ollama',   label: 'Ollama' },
  { value: 'colab-ollama', label: 'Colab Ollama' },
  { value: 'lmstudio', label: 'LM Studio' },
];

export const PROVIDER_MODELS: Record<AIProvider, readonly string[]> = {
  openai:   [
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.6-sol',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5',
    'gpt-5-mini',
    'gpt-4.1',
    'gpt-4o-mini',
  ],
  grok:     ['grok-4.5', 'grok-4'],
  gemini:   ['gemini-3.5-flash'],
  claude:   ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'],
  ollama:   ['gemma3:4b', 'gemma3:1b', 'qwen2.5:3b', 'llama3.2:3b'],
  'colab-ollama': [],
  lmstudio: ['qwen/qwen3-4b'],
  onair:    [],
};

export const MODEL_LABELS: Readonly<Record<string, string>> = {
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-5.6-luna': 'GPT-5.6 Luna',
  'gpt-5.6-sol': 'GPT-5.6 Sol',
};

export function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai:   'gpt-5.5',
  grok:     'grok-4.5',
  gemini:   'gemini-3.5-flash',
  claude:   'claude-haiku-4-5-20251001',
  ollama:   'qwen2.5:3b',
  'colab-ollama': '',
  lmstudio: 'qwen/qwen3-4b',
  onair:    '',
};
