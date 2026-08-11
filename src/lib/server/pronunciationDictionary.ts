import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * 発音辞書 — TTSが誤読する語を正しい読み(カタカナ等)へ置換してから合成する。
 * Irodori系モデルは日本語文中の英字を読めない(例: VOICE LAB→「ボイスランピ」)ため、
 * 主に英字語→カタカナの登録を想定。カタカナは正しく読まれることを実測確認済み。
 *
 * 辞書は data/voice-pronunciation.json。誤読を見つけたら1行足せば、
 * サーバー再起動なしで次の合成から反映される (mtime変更で再読込)。
 * 置換は表示用テキストには適用せず、合成に渡すテキストにだけ適用する。
 */

const DICTIONARY_PATH = path.join(process.cwd(), 'data', 'voice-pronunciation.json');

type Rule = { pattern: RegExp; reading: string };

let cachedRules: Rule[] = [];
let cachedMtimeMs = -1;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 辞書オブジェクトから置換ルールを組み立てる (テスト用に公開)。 */
export function compilePronunciationRules(dictionary: Record<string, string>): Rule[] {
  return Object.entries(dictionary)
    .filter(([surface, reading]) => surface.trim().length > 0 && typeof reading === 'string')
    // 長い語から置換して部分一致の誤爆を防ぐ (例: AITuber を AI より先に)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([surface, reading]) => {
      const escaped = escapeRegExp(surface);
      // 英字語は単語境界を付け、大文字小文字を無視する (「maintain」内の「ai」等への誤爆防止)
      const startsAscii = /^[A-Za-z0-9]/.test(surface);
      const endsAscii = /[A-Za-z0-9]$/.test(surface);
      const source = `${startsAscii ? '\\b' : ''}${escaped}${endsAscii ? '\\b' : ''}`;
      const flags = /[A-Za-z]/.test(surface) ? 'gi' : 'g';
      return { pattern: new RegExp(source, flags), reading };
    });
}

export function applyPronunciationRules(rules: Rule[], text: string): string {
  let result = text;
  for (const { pattern, reading } of rules) result = result.replace(pattern, reading);
  return result;
}

function loadRules(): Rule[] {
  try {
    const mtimeMs = statSync(DICTIONARY_PATH).mtimeMs;
    if (mtimeMs !== cachedMtimeMs) {
      const parsed = JSON.parse(readFileSync(DICTIONARY_PATH, 'utf8')) as Record<string, string>;
      cachedRules = compilePronunciationRules(parsed);
      cachedMtimeMs = mtimeMs;
    }
  } catch {
    // 辞書ファイルが無い/壊れている場合は置換なしで続行する
    cachedRules = [];
    cachedMtimeMs = -1;
  }
  return cachedRules;
}

/** 合成直前のテキストに発音辞書を適用する。 */
export function applyPronunciation(text: string): string {
  return applyPronunciationRules(loadRules(), text);
}
