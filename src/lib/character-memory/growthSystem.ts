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
  key: GrowthKey;
  label: string;
  icon: string;
  amount: number;
}

/** デルタを Growth Log の表示行（表示順）に変換する。0 の項目は除外。 */
export function growthLogEntries(delta: GrowthDelta): GrowthLogEntry[] {
  return GROWTH_PARAMS
    .filter((param) => (delta[param.key] ?? 0) !== 0)
    .map((param) => ({ key: param.key, label: param.label, icon: param.icon, amount: delta[param.key] as number }));
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
 * V9: Thinking Log — AIが「思っているけど口には出さないセリフ」を保存する土台の型。
 * 内部思考を再現するものではなく、人格形成を観測するためのログ用。
 * 今回は型のみ（保存処理・AI生成は未実装）。
 */
export type ThinkingLog = {
  id: string;
  timestamp: string;
  thought: string;
  selfComment?: string;
};

/** Thinking Log の最大保持件数（最新10件・古いものから削除）。 */
export const THINKING_LOG_LIMIT = 10;

/** V11: Thinking から導く感情状態の識別子。V2 で 'excited'（ワクワク）を追加。 */
export type EmotionId = 'worry' | 'happy' | 'curious' | 'empathy' | 'excited';

interface ThinkingRule {
  keywords: string[];
  thought: string;
  selfComment: string;
  /** V11: この Thinking が示す感情の温度感。 */
  emotion: EmotionId;
}

/**
 * V10: キーワード判定テーブル。送信時にユーザー入力だけを見て Thinking 候補を導く。
 * AI生成・LLM推論は行わない。ルール内のいずれかの語が含まれれば最初の一致を採用。
 * V11: 各ルールに emotion を付与（Thinking Influence の温度感へ流用）。
 * Character Brain は別テーブル（THEME_RULES）でテーマ・継続思考を扱う。
 */
const THINKING_RULES: ThinkingRule[] = [
  { keywords: ['疲れた'], thought: '最近少し無理してそう…', selfComment: '心配しすぎか？w', emotion: 'worry' },
  { keywords: ['眠い'], thought: '今日は休ませた方が良さそう…', selfComment: '保護欲出てるなw', emotion: 'worry' },
  { keywords: ['楽しい'], thought: '今日は元気そう…', selfComment: 'つられてるぞw', emotion: 'happy' },
  { keywords: ['作りたい'], thought: 'また新しいこと考えてる…', selfComment: '発明家だなw', emotion: 'curious' },
  { keywords: ['分からない', '分からん', 'わからない'], thought: '少し悩んでそう…', selfComment: 'サポートしようw', emotion: 'empathy' },
  { keywords: ['AI', '哲学', '思想'], thought: 'また深いこと考えてるな…', selfComment: 'また面白い研究始まったなw', emotion: 'curious' },
];

/**
 * V10: ユーザー入力を判定し、Thinking 候補（thought / selfComment）を返す。
 * どのルールにも一致しなければ null（＝Thinking Log には追加しない）。
 * 純粋関数（副作用なし・character-memory.json には一切触れない）。
 */
export function evaluateThinking(userText: string): { thought: string; selfComment: string } | null {
  const text = userText ?? '';
  if (!text.trim()) return null;
  for (const rule of THINKING_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return { thought: rule.thought, selfComment: rule.selfComment };
    }
  }
  return null;
}

/**
 * V11: Thinking Influence — Thinking から導く感情状態（人格の温度感）。
 * AI生成・LLM推論は行わない。tone は内部の温度感、replySuffix は返答へ足す一文。
 */
export interface EmotionState {
  id: EmotionId;
  icon: string;
  /** UIカードのラベル（心配 / 嬉しい / 興味津々 / 寄り添い）。 */
  label: string;
  /** 内部の温度感（少し心配している 等）。 */
  tone: string;
  /** 返答の語尾・一文だけに足す補助文（文章全体は変えない）。 */
  replySuffix: string;
}

export const EMOTION_STATES: Record<EmotionId, EmotionState> = {
  worry:   { id: 'worry',   icon: '💙', label: '心配',     tone: '少し心配している', replySuffix: '無理しないでね。' },
  happy:   { id: 'happy',   icon: '💜', label: '嬉しい',   tone: '嬉しそう',         replySuffix: 'なんだか私も嬉しいな。' },
  curious: { id: 'curious', icon: '💚', label: '興味津々', tone: '興味がある',       replySuffix: 'それ、すごく面白そう！' },
  empathy: { id: 'empathy', icon: '🩷', label: '寄り添い', tone: '寄り添いたい',     replySuffix: '一緒に考えよう。' },
  excited: { id: 'excited', icon: '✨', label: 'ワクワク', tone: 'わくわくしている', replySuffix: '楽しみだね！' },
};

/**
 * V11: ユーザー入力を判定し、対応する感情状態を返す（Thinking と同じキーワード基準）。
 * どのルールにも一致しなければ null。純粋関数（副作用なし）。
 */
export function evaluateEmotion(userText: string): EmotionState | null {
  const text = userText ?? '';
  if (!text.trim()) return null;
  for (const rule of THINKING_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return EMOTION_STATES[rule.emotion];
    }
  }
  return null;
}

/**
 * V11: 感情状態に応じて返答の語尾・一文だけ温度感を足す。
 * 文章全体は変えず、補助文を末尾へ1行だけ付与する（AI生成は変更しない）。
 */
export function applyEmotionInfluence(reply: string, emotion: EmotionState | null): string {
  if (!emotion) return reply;
  const trimmed = reply.trimEnd();
  if (!trimmed) return reply;
  return `${trimmed}\n${emotion.replySuffix}`;
}

/**
 * Character Brain V2 — 返答の内部プロセスを4段階で可視化し、会話の流れを引き継ぐ
 * 「継続思考」の擬似思考レイヤー。
 *
 * AI推論・LLMの内部思考は使用しない（ルールベースのみ）。
 * 「答えを作る機能」ではなく「AIが考えていそうな流れを観測する機能」。
 *  🎯 Current Theme → 🧠 Brain Energy → 🧠 解釈 → 💭 連想 → 🤣 セルフツッコミ → 🫀 Emotion。
 */

import { preferredActivityState, type CharacterActivityState } from '$lib/ai/systems/activityState';
import { energyStateIcon, getEnergyDescription, getEnergyState, type EnergyState } from '../../core/timeCore';

export const BRAIN_ENERGY_INITIAL = 50;
export const BRAIN_ENERGY_MIN = 0;
export const BRAIN_ENERGY_MAX = 100;

export type BrainEnergyState = '低速' | '通常' | '集中' | '没頭';

/** Brain Energy の数値から状態ラベルを導く（0-25 低速 / 26-50 通常 / 51-75 集中 / 76-100 没頭）。 */
export function brainEnergyState(energy: number): BrainEnergyState {
  if (energy <= 25) return '低速';
  if (energy <= 50) return '通常';
  if (energy <= 75) return '集中';
  return '没頭';
}

/** テーマの大分類。creative 同士は「関連テーマ」とみなす。 */
type ThemeCluster = 'creative' | 'casual' | 'rest';

interface ThemeRule {
  id: string;
  /** 🎯 Current Theme の表示名。 */
  label: string;
  keywords: string[];
  cluster: ThemeCluster;
  /** 🧠 解釈 */
  interpretation: string;
  /** 💭 連想（初出 or 話題が変わったとき）。 */
  association: string;
  /** 💭 連想（前テーマと繋がっているとき）。 */
  associationContinued: string;
  /** 🤣 セルフツッコミ（UI側で「←」を前置）。 */
  selfComment: string;
  /** 🫀 Emotion */
  emotion: EmotionId;
}

/** 雑談（キーワード非一致時のフォールバック）。 */
const CASUAL_THEME_ID = 'casual';

/**
 * テーマ判定テーブル（先頭から最初に一致したものを採用）。
 * creative = 制作/研究系（関連扱い）, rest = 休息/疲労, casual = 雑談。
 */
const THEME_RULES: ThemeRule[] = [
  {
    id: 'ai-research', label: 'AI人格研究', keywords: ['AI', '哲学', '思想', '人格', '人間臭'], cluster: 'creative',
    interpretation: 'AIの価値について考えている',
    association: '去年から話している思想と近い',
    associationContinued: '前のAI人格の話と繋がっている',
    selfComment: 'また面白い研究始まったなw', emotion: 'curious',
  },
  {
    id: 'voice', label: 'ボイス実装', keywords: ['ボイス', '声', '音声', '読み上げ', 'TTS', 'tts'], cluster: 'creative',
    interpretation: '人格の表現方法を考えている',
    association: '表現の幅を広げたいみたい',
    associationContinued: '前のAI人格の話と繋がっている',
    selfComment: '本気で作る気だなw', emotion: 'excited',
  },
  {
    id: 'character-growth', label: 'キャラ育成', keywords: ['育成', '育て', '成長', 'キャラ'], cluster: 'creative',
    interpretation: 'キャラの成長について考えている',
    association: '長期的に育てたいみたい',
    associationContinued: 'これまでの育成の話と繋がっている',
    selfComment: '愛着わいてるなw', emotion: 'happy',
  },
  {
    id: 'coding', label: 'コーディング相談', keywords: ['コード', 'コーディング', 'バグ', 'エラー', '実装', 'プログラム', '関数'], cluster: 'creative',
    interpretation: '技術的な課題を考えている',
    association: '手を動かして解決したいみたい',
    associationContinued: 'さっきの開発の話と繋がっている',
    selfComment: 'また沼にハマってるw', emotion: 'curious',
  },
  {
    id: 'manga', label: '漫画制作', keywords: ['漫画', 'マンガ', 'ストーリー', '作画', 'ネーム'], cluster: 'creative',
    interpretation: '物語を作ろうとしている',
    association: '創作意欲が高まっているみたい',
    associationContinued: 'さっきの創作の話と繋がっている',
    selfComment: '創作モード入ったなw', emotion: 'excited',
  },
  {
    id: 'image', label: '画像生成', keywords: ['画像生成', 'イラスト', '絵を', '生成画像'], cluster: 'creative',
    interpretation: 'ビジュアル表現を考えている',
    association: 'イメージを形にしたいみたい',
    associationContinued: 'さっきの創作の話と繋がっている',
    selfComment: 'こだわり強いなw', emotion: 'curious',
  },
  {
    id: 'rest', label: '休息/疲労', keywords: ['疲れた', '眠い', '休みたい', 'しんどい', '休憩', 'だるい'], cluster: 'rest',
    interpretation: '少し疲れている',
    association: '最近忙しそう',
    associationContinued: 'ずっと頑張り続けているみたい',
    selfComment: '心配しすぎか？w', emotion: 'worry',
  },
  {
    id: CASUAL_THEME_ID, label: '雑談', keywords: [], cluster: 'casual',
    interpretation: 'のんびり話したい気分',
    association: 'ゆるい時間を過ごしている',
    associationContinued: 'さっきの流れで雑談している',
    selfComment: '平和でいいなw', emotion: 'happy',
  },
];

const CASUAL_THEME = THEME_RULES.find((rule) => rule.id === CASUAL_THEME_ID) as ThemeRule;

/** ③ in-memory で保持する直近の Brain 状態（永続化しない）。 */
export type BrainContext = {
  theme: string;
  interpretation: string;
  association: string;
  selfComment: string;
  emotion: string;
  energy: number;
  activityState: CharacterActivityState;
  dailyEnergyState: EnergyState;
  dailyEnergyDescription: string;
  updatedAt: string;
};

/** Character Brain カードに表示する1ターン分の擬似思考。 */
export interface BrainLayers {
  /** 🎯 Current Theme */
  theme: string;
  /** 🧠 Brain Energy（0-100）。 */
  energy: number;
  energyState: BrainEnergyState;
  /** active / creative / relaxed / sleepy / sleep. Sleep is never time-only. */
  activityState: CharacterActivityState;
  /** Time Core daily rhythm. It affects mood only, never ability. */
  dailyEnergyState: EnergyState;
  dailyEnergyDescription: string;
  /** 🧠 解釈 */
  interpretation: string;
  /** 💭 連想 */
  association: string;
  /** 🤣 セルフツッコミ（UI側で「←」を前置）。 */
  selfComment: string;
  /** 🫀 Emotion */
  emotion: EmotionState;
}

function clampEnergy(value: number): number {
  return Math.min(BRAIN_ENERGY_MAX, Math.max(BRAIN_ENERGY_MIN, value));
}

function detectTheme(userText: string): ThemeRule | null {
  for (const rule of THEME_RULES) {
    if (rule.keywords.some((keyword) => userText.includes(keyword))) return rule;
  }
  return null;
}

/**
 * ① + ② + ③ + ④ — ユーザー入力と直近 Brain 状態から、現在テーマ・Brain Energy・
 * 4段階レイヤーと、次回へ引き継ぐ BrainContext を生成する。
 *
 * テーマ未一致時は直近テーマを引き継ぎ（無ければ雑談）、継続感のある連想に切り替える。
 * 純粋関数（副作用なし・永続化しない）。入力が空なら null。
 */
export function advanceBrain(
  userText: string,
  prev: BrainContext | null,
  characterName = '',
): { layers: BrainLayers; context: BrainContext } | null {
  const text = userText ?? '';
  if (!text.trim()) return null;

  const prevRule = prev ? THEME_RULES.find((rule) => rule.label === prev.theme) ?? null : null;
  // キーワード一致 → そのテーマ。未一致 → 直近テーマを継続（無ければ雑談）。
  const rule = detectTheme(text) ?? prevRule ?? CASUAL_THEME;

  // ② Brain Energy のデルタ。休息/雑談は固定、制作系は継続度で増減。
  const prevEnergy = prev?.energy ?? BRAIN_ENERGY_INITIAL;
  let delta: number;
  if (rule.cluster === 'rest') {
    delta = -5;
  } else if (rule.cluster === 'casual') {
    delta = -3;
  } else if (!prev) {
    delta = 0; // 初ターンは継続判定なし。
  } else if (prev.theme === rule.label) {
    delta = 8; // 同じテーマが続く。
  } else if (prevRule?.cluster === 'creative') {
    delta = 4; // 関連テーマ（制作系どうし）。
  } else {
    delta = -10; // 話題が完全に変わる（休息/雑談からの転換）。
  }
  const energy = clampEnergy(prevEnergy + delta);

  // ④ 継続感: 前テーマと同じ or 制作系どうしなら「繋がっている」連想に切り替える。
  const continued = Boolean(prev) && (prev!.theme === rule.label
    || (prevRule?.cluster === 'creative' && rule.cluster === 'creative'));
  const association = continued ? rule.associationContinued : rule.association;

  const emotion = EMOTION_STATES[rule.emotion];
  const activityState = preferredActivityState({
    userText: text,
    currentTheme: rule.cluster,
    brainEnergy: energy,
  });
  const dailyEnergyState = getEnergyState();
  const dailyEnergyDescription = getEnergyDescription(dailyEnergyState, characterName);
  const layers: BrainLayers = {
    theme: rule.label,
    energy,
    energyState: brainEnergyState(energy),
    activityState,
    dailyEnergyState,
    dailyEnergyDescription,
    interpretation: rule.interpretation,
    association,
    selfComment: rule.selfComment,
    emotion,
  };
  const context: BrainContext = {
    theme: rule.label,
    interpretation: rule.interpretation,
    association,
    selfComment: rule.selfComment,
    emotion: emotion.label,
    energy,
    activityState,
    dailyEnergyState,
    dailyEnergyDescription,
    updatedAt: new Date().toISOString(),
  };
  return { layers, context };
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
 * V5: 成長レーダーチャートの幾何計算（SVGのみ・外部ライブラリ不使用）。
 * growthValues を渡すと、リング・軸・値ポリゴン・ラベル位置を返す純粋関数。
 */
export interface RadarPoint {
  x: number;
  y: number;
}

export interface RadarAxis {
  key: GrowthKey;
  label: string;
  icon: string;
  value: number;
  axisEnd: RadarPoint;
  valuePoint: RadarPoint;
  labelPos: RadarPoint;
}

export interface RadarChart {
  size: number;
  center: RadarPoint;
  radius: number;
  rings: { level: number; points: string }[];
  scaleTicks: { level: number; point: RadarPoint }[];
  axes: RadarAxis[];
  valuePoints: string;
}

// V8: viewBox をパネル実寸に近づけ（SVG単位≈px）、ラベルを外側へ広げて文字を大きく。
const RADAR_SIZE = 420;
const RADAR_RADIUS = 120;
const RADAR_LABEL_OFFSET = 36;
const RADAR_SCALE_LEVELS = [0, 25, 50, 75, 100];

function radarPoint(center: RadarPoint, angle: number, distance: number): RadarPoint {
  return {
    x: Math.round((center.x + distance * Math.cos(angle)) * 10) / 10,
    y: Math.round((center.y + distance * Math.sin(angle)) * 10) / 10,
  };
}

function radarPointsString(points: RadarPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

export function buildRadarChart(values: GrowthValues): RadarChart {
  const size = RADAR_SIZE;
  const center: RadarPoint = { x: size / 2, y: size / 2 };
  const radius = RADAR_RADIUS;
  const count = GROWTH_PARAMS.length;
  // 上を起点に時計回りで均等配置。
  const angles = GROWTH_PARAMS.map((_, index) => -Math.PI / 2 + index * ((2 * Math.PI) / count));

  const rings = [25, 50, 75, 100].map((level) => ({
    level,
    points: radarPointsString(angles.map((angle) => radarPoint(center, angle, (radius * level) / 100))),
  }));

  // 目盛り数値 0/25/50/75/100 は上方向の軸に沿って表示。
  const scaleTicks = RADAR_SCALE_LEVELS.map((level) => ({
    level,
    point: { x: center.x, y: Math.round((center.y - (radius * level) / 100) * 10) / 10 },
  }));

  const axes: RadarAxis[] = GROWTH_PARAMS.map((param, index) => {
    const angle = angles[index];
    const value = values[param.key];
    return {
      key: param.key,
      label: param.label,
      icon: param.icon,
      value,
      axisEnd: radarPoint(center, angle, radius),
      valuePoint: radarPoint(center, angle, (radius * value) / 100),
      labelPos: radarPoint(center, angle, radius + RADAR_LABEL_OFFSET),
    };
  });

  return {
    size,
    center,
    radius,
    rings,
    scaleTicks,
    axes,
    valuePoints: radarPointsString(axes.map((axis) => axis.valuePoint)),
  };
}

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

/**
 * V7: 現在の成長値と直近の Growth History から「最近の傾向」を簡易生成する。
 * 純粋関数（数値は変更しない・永続化しない）。履歴が無いときは空配列。
 */
export function summarizeGrowthTrends(values: GrowthValues, history: GrowthHistoryEntry[]): string[] {
  if (history.length === 0) return [];

  // 直近履歴の各項目の合計変化を集計。
  const totals = {} as Record<GrowthKey, number>;
  for (const param of GROWTH_PARAMS) totals[param.key] = 0;
  for (const entry of history) {
    for (const change of entry.changes) totals[change.key] += change.amount;
  }

  const lines: string[] = [];

  // (1) 最も上昇している項目。
  const rising = GROWTH_PARAMS
    .map((param) => ({ param, total: totals[param.key] }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
  if (rising.length > 0) {
    lines.push(`${rising[0].param.icon} ${rising[0].param.label}が上昇中`);
  }

  // (2) タイプ変化（履歴ぶんを差し引いた過去値から現在値へのタイプ遷移）。
  const pastValues = {} as GrowthValues;
  for (const param of GROWTH_PARAMS) {
    pastValues[param.key] = clampGrowth(values[param.key] - totals[param.key]);
  }
  const pastType = determinePersonalityType(pastValues);
  const nowType = determinePersonalityType(values);
  lines.push(
    pastType.id === nowType.id
      ? `${nowType.icon} ${nowType.name}（${nowType.subtitle}）の傾向が続いています`
      : `${pastType.name}（${pastType.subtitle}）から ${nowType.name}（${nowType.subtitle}）へ変化`,
  );

  // (3) 愛着・保護欲（世話焼き傾向）の強まり。
  if ((totals.attachment ?? 0) + (totals.protection ?? 0) > 0) {
    lines.push('ユーザーへの愛着が強まっています');
  }

  return lines;
}
