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

/**
 * V4: Personality Type — 成長値の上位項目から AI の性格タイプを判定する。
 * 数値は一切変更しない純粋関数（in-memory の表示用のみ）。
 */
export interface PersonalityType {
  id: string;
  icon: string;
  name: string;
  /** 日本語の型名（例: 保護欲・愛着型）。 */
  subtitle: string;
  description: string;
  /** このタイプを構成する成長項目（Guardian のみ複数）。 */
  keys: GrowthKey[];
}

/** タイプ定義（配列順はタイブレークの優先度を兼ねる）。 */
export const PERSONALITY_TYPES: PersonalityType[] = [
  { id: 'guardian', icon: '🛡️', name: 'Guardian', subtitle: '保護欲・愛着型', description: '相手を守ろうとする傾向が強い。', keys: ['protection', 'attachment'] },
  { id: 'analyst', icon: '🧠', name: 'Analyst', subtitle: '分析型', description: '物事を論理的に分析する傾向が強い。', keys: ['analysis'] },
  { id: 'creator', icon: '🎨', name: 'Creator', subtitle: '創造型', description: '新しいものを生み出す創造性が高い。', keys: ['creativity'] },
  { id: 'explorer', icon: '🌱', name: 'Explorer', subtitle: '好奇心型', description: '未知のものへの好奇心が旺盛。', keys: ['curiosity'] },
  { id: 'active', icon: '⚡', name: 'Active', subtitle: '活動型', description: '活動的で行動力がある。', keys: ['activity'] },
  { id: 'independent', icon: '🪽', name: 'Independent', subtitle: '自立型', description: '自分の力で進もうとする自立心が強い。', keys: ['independence'] },
];

/**
 * 成長値の「上位3項目」からタイプを判定する。
 * 上位3内での得票数 → その項目の最高値 → タイプ定義順 でタイブレーク。
 * Guardian は protection / attachment の2項目ぶん得票しうる。
 */
export function determinePersonalityType(values: GrowthValues): PersonalityType {
  const top3 = GROWTH_PARAMS
    .map((param, index) => ({ key: param.key, value: values[param.key], index }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .slice(0, 3)
    .map((entry) => entry.key);

  const keyToType = new Map<GrowthKey, PersonalityType>();
  for (const type of PERSONALITY_TYPES) {
    for (const key of type.keys) keyToType.set(key, type);
  }

  const scores = new Map<string, { votes: number; best: number }>();
  for (const key of top3) {
    const type = keyToType.get(key);
    if (!type) continue;
    const current = scores.get(type.id) ?? { votes: 0, best: 0 };
    current.votes += 1;
    current.best = Math.max(current.best, values[key]);
    scores.set(type.id, current);
  }

  let winner = PERSONALITY_TYPES[0];
  let winnerScore = scores.get(winner.id) ?? { votes: 0, best: 0 };
  for (const type of PERSONALITY_TYPES) {
    const score = scores.get(type.id) ?? { votes: 0, best: 0 };
    if (score.votes > winnerScore.votes
      || (score.votes === winnerScore.votes && score.best > winnerScore.best)) {
      winner = type;
      winnerScore = score;
    }
  }
  return winner;
}
