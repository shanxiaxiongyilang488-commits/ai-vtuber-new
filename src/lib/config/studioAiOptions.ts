/**
 * AI Studio Engine のロールAI・動画AI選択肢。
 * 開始画面（PersonalityEngineModal）と チャット後の Advanced Studio Settings
 * （character-memory サイドバー）で同じリストを共有する。
 */

export const ROLE_AI_OPTIONS = ['INHERIT', 'GPT-5.5', 'Grok', 'Gemini', 'Claude', 'Local LLM'] as const;

export type VideoAiSelectOption = { id: string; label: string; help: string };

export const VIDEO_AI_SELECT_OPTIONS: VideoAiSelectOption[] = [
  { id: 'Gemini Omni Flash Reference', label: 'Gemini Omni Flash Reference', help: '添付画像またはmediaStore画像をStoryCardなしで直接動画化します。' },
  { id: 'Gemini Omni Flash Image', label: 'Gemini Omni Flash Image', help: '1枚の画像をStoryCardなしで直接動画化します。' },
  { id: 'Gemini Omni Flash Edit', label: 'Gemini Omni Flash Edit', help: '既存動画を自然言語の指示で編集します。' },
  { id: 'Seedance2 Mini', label: 'Seedance2 Mini 🧪', help: '低コスト実験用。StoryCard確認、アニメシート解釈確認、MotionPrompt検証に使用します。videoMode=draft。' },
  { id: 'Seedance2', label: 'Seedance2', help: '本番動画生成用。videoMode=production。' },
  { id: 'Sora 2', label: 'Sora2', help: 'Sora 2 video generation。text-to-video / first-frame video向け。' },
  { id: 'Kling 1.6', label: 'Kling 1.6', help: 'Kling 1.6 video generation。' },
  { id: 'Kling Elements', label: 'Kling Elements', help: '複数要素・参照素材を使う動画生成向け。' },
];
