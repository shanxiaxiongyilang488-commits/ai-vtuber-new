/**
 * Character Story Pack V4 — Comic Pipeline（漫画制作パイプラインの入口）。
 *
 * 会話 → ネタ出し → STORY YAML（StoryDraft）→ 漫画ネーム（ComicDraft / Prompt）
 * → 漫画生成APIの「呼び出し口」までを担う純粋ロジック。
 *
 * - 実際の画像生成API実行は行わない（プロンプト統合とプロバイダ選択まで）。
 * - LLM 推論・画像生成・動画生成・永続化はしない。character-memory.json には触れない。
 */

import {
  type StoryDoc,
  type StoryDraft,
  type StoryRef,
  type StoryScene,
} from './storySystem';

/** ④ 漫画生成プロバイダ（実行はしない・選択のみ）。 */
export type ComicProvider = 'AUTO' | 'GPT_IMAGE' | 'NANOBANANA' | 'IDEOGRAM' | 'SEEDREAM';

/** UI のプロバイダ選択肢（表示順）。 */
export const COMIC_PROVIDERS: ComicProvider[] = [
  'AUTO',
  'GPT_IMAGE',
  'NANOBANANA',
  'IDEOGRAM',
  'SEEDREAM',
];

/** ① 漫画ネーム（ドラフト）。 */
export type ComicDraft = {
  title: string;
  theme: string;
  pageCount: number;
  references: StoryRef[];
  scenes: StoryScene[];
  prompt: string;
  provider: ComicProvider;
};

/** ヘッダ（タイトル・テーマ・登場人物）を実名で生成する（汎用語は使わない）。 */
function comicHeader(title: string, theme: string, characters: string[]): string[] {
  const lines: string[] = [];
  if (title.trim()) lines.push(`TITLE: ${title.trim()}`);
  if (theme.trim()) lines.push(`THEME: ${theme.trim()}`);
  if (characters.length > 0) lines.push(`CHARACTERS: ${characters.join('、')}`);
  return lines;
}

/**
 * Comic Prompt V2: Story Card（StoryDoc）の内容を実際に PANEL 展開する。
 * - キャラクター名・各シーン・セリフ・コマごとの背景を必ず使用。
 * - 「主人公 / 相手役 / 状況説明 / 導入 / 展開」などの汎用語・テンプレ説明は出力しない。
 */
export function buildComicPromptFromDoc(doc: StoryDoc): string {
  const lines = comicHeader(doc.title, doc.theme, doc.characters);
  doc.scenes.forEach((scene, index) => {
    lines.push('');
    lines.push(`PANEL${index + 1}:`);
    lines.push(`背景: ${scene.visual.trim() || '（未設定）'}`);
    lines.push(`行動: ${scene.action.trim() || '（未設定）'}`);
    const dialogue = scene.dialogue.length > 0
      ? scene.dialogue
          .map((line) => (line.speaker.trim() ? `${line.speaker}「${line.text}」` : `「${line.text}」`))
          .join(' / ')
      : '（なし）';
    lines.push(`セリフ: ${dialogue}`);
  });
  return lines.join('\n');
}

/**
 * Comic Prompt V2: StoryDraft（ワークスペース内部モデル）からも同じ PANEL 展開を行う。
 * scenes の visual / action / dialogue を実展開し、汎用語・テンプレ説明は出力しない。
 */
export function buildComicPrompt(draft: StoryDraft): string {
  const lines = comicHeader(draft.title, draft.theme, draft.characters);
  draft.scenes.forEach((scene, index) => {
    lines.push('');
    lines.push(`PANEL${index + 1}:`);
    lines.push(`背景: ${scene.visual.trim() || '（未設定）'}`);
    lines.push(`行動: ${scene.action.trim() || '（未設定）'}`);
    lines.push(`セリフ: ${scene.dialogue.trim() || '（なし）'}`);
  });
  return lines.join('\n');
}

/**
 * ③ StoryDraft から ComicDraft を生成する。
 * pageCount はコマ数（最低でも dynamics.min_panels を満たす）から見積もる。
 */
export function generateComicDraft(
  draft: StoryDraft,
  refs: StoryRef[],
  provider: ComicProvider = 'AUTO',
): ComicDraft {
  const pageCount = Math.max(draft.dynamics.min_panels, draft.scenes.length);
  return {
    title: draft.title,
    theme: draft.theme,
    pageCount,
    references: refs,
    scenes: draft.scenes,
    prompt: buildComicPrompt(draft),
    provider,
  };
}

/**
 * ④ プロバイダ選択を解決する（実行はしない）。
 * AUTO は仮で GPT_IMAGE を返す。未知の値も GPT_IMAGE にフォールバック。
 */
export function routeComicProvider(provider: ComicProvider): Exclude<ComicProvider, 'AUTO'> {
  switch (provider) {
    case 'GPT_IMAGE':
    case 'NANOBANANA':
    case 'IDEOGRAM':
    case 'SEEDREAM':
      return provider;
    case 'AUTO':
    default:
      return 'GPT_IMAGE';
  }
}
