/**
 * Growth System V2 — Character Memory のみで使用する成長パラメータのロジック。
 *
 * - 送信ボタン押下時に「ユーザーの文章だけ」を見てキーワード一致で加算する。
 * - AIの返答では変化させない。
 * - emotion / 表情 / 画像生成 / Memory保存 とは無関係（UI内の一時的な数値のみ）。
 *
 * このモジュールは純粋なロジック（副作用なし）で、character-memory.json には一切触れない。
 */

export type GrowthKey =
  | 'attachment'
  | 'analysis'
  | 'creativity'
  | 'activity'
  | 'curiosity'
  | 'protection'
  | 'independence';

export interface GrowthParam {
  key: GrowthKey;
  label: string;
  icon: string;
}

/** 表示順を兼ねた7項目の定義（V3: 育成ゲーム感のため絵文字アイコン付き）。 */
export const GROWTH_PARAMS: GrowthParam[] = [
  { key: 'attachment', label: '愛着', icon: '🩷' },
  { key: 'analysis', label: '分析', icon: '🧠' },
  { key: 'creativity', label: '創造性', icon: '🎨' },
  { key: 'activity', label: '活動性', icon: '⚡' },
  { key: 'curiosity', label: '好奇心', icon: '🌱' },
  { key: 'protection', label: '保護欲', icon: '🛡️' },
  { key: 'independence', label: '自立性', icon: '🪽' },
];

export const GROWTH_MIN = 0;
export const GROWTH_MAX = 100;
export const GROWTH_INITIAL = 50;

export type GrowthValues = Record<GrowthKey, number>;
export type GrowthDelta = Partial<Record<GrowthKey, number>>;

interface GrowthRule {
  keywords: string[];
  deltas: GrowthDelta;
}

/** V2: キーワード一致ルール。ルール内のいずれかの語が含まれれば1回だけ加算する。 */
const GROWTH_RULES: GrowthRule[] = [
  { keywords: ['疲れた', '眠い', '休みたい'], deltas: { protection: 3, attachment: 1 } },
  { keywords: ['漫画', 'アイデア', '作ろう'], deltas: { creativity: 2, activity: 1 } },
  { keywords: ['シロ', '妹', '家族'], deltas: { attachment: 2, protection: 2 } },
  { keywords: ['なぜ', '分析', '調べる'], deltas: { analysis: 2 } },
  { keywords: ['面白い', '興味', '知りたい'], deltas: { curiosity: 2 } },
  { keywords: ['一人で', '自分で', '任せて'], deltas: { independence: 2 } },
];

/** 7項目すべてを初期値で生成する。 */
export function initialGrowthValues(): GrowthValues {
  return GROWTH_PARAMS.reduce((acc, param) => {
    acc[param.key] = GROWTH_INITIAL;
    return acc;
  }, {} as GrowthValues);
}

/** 0〜100 にクランプする。 */
export function clampGrowth(value: number): number {
  return Math.min(GROWTH_MAX, Math.max(GROWTH_MIN, value));
}

/** ユーザーの文章を評価し、加算する各項目の合計デルタを返す。 */
export function evaluateGrowth(userText: string): GrowthDelta {
  const text = userText ?? '';
  const delta: GrowthDelta = {};
  if (!text.trim()) return delta;
  for (const rule of GROWTH_RULES) {
    if (!rule.keywords.some((keyword) => text.includes(keyword))) continue;
    for (const [key, amount] of Object.entries(rule.deltas)) {
      const growthKey = key as GrowthKey;
      delta[growthKey] = (delta[growthKey] ?? 0) + (amount ?? 0);
    }
  }
  return delta;
}

export interface GrowthLogEntry {
  label: string;
  icon: string;
  amount: number;
}

/** デルタを Growth Log の表示行（表示順）に変換する。0 の項目は除外。 */
export function growthLogEntries(delta: GrowthDelta): GrowthLogEntry[] {
  return GROWTH_PARAMS
    .filter((param) => (delta[param.key] ?? 0) !== 0)
    .map((param) => ({ label: param.label, icon: param.icon, amount: delta[param.key] as number }));
}

/** Growth History（in-memory のみ。永続化しない）の1件。 */
export interface GrowthHistoryEntry {
  id: string;
  time: string;
  message: string;
  changes: GrowthLogEntry[];
}

/** 履歴の最大保持件数（最新5件）。 */
export const GROWTH_HISTORY_LIMIT = 5;

/** 履歴カードに載せるユーザー発言の短縮表示。 */
export function growthMessageSnippet(text: string, max = 24): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
