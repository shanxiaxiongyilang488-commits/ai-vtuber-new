// ============================================================
// precheckEngine.ts
// チェック状態から修正プロンプト（positive / negative）を生成する
// ============================================================

import { NEGATIVE_DICT } from './negativeDict';

// ── 入力型 ────────────────────────────────────────────────────
export interface CheckState {
  hand_role:       boolean; // 手の役割ミス（不自然なポーズ）
  extra_fingers:   boolean; // 指の本数ミス
  face_distortion: boolean; // 顔の崩れ
  outfit_noise:    boolean; // 衣装の柄化・テクスチャ崩れ
  prism_issue:     boolean; // プリズム暴走（色収差・光学アーティファクト）
}

// ── 出力型 ────────────────────────────────────────────────────
export interface PromptResult {
  positive: string;
  negative: string;
  summary:  string[]; // 人間可読な修正内容の一覧
}

// ── 修正定義テーブル ──────────────────────────────────────────
const FIX_RULES: {
  key:      keyof CheckState;
  label:    string;
  positive: string;
  negative: () => string;
}[] = [
  {
    key:      'hand_role',
    label:    '手の役割を自然に修正',
    positive: 'natural hand gesture, hands resting naturally, relaxed fingers, clearly defined hand pose',
    negative: () => NEGATIVE_DICT.hand_fix,
  },
  {
    key:      'extra_fingers',
    label:    '指の本数を正確に修正',
    positive: 'five fingers, anatomically correct hands, perfect finger count, well-defined fingertips',
    negative: () => NEGATIVE_DICT.hand_fix,
  },
  {
    key:      'face_distortion',
    label:    '顔の構造を正確に修正',
    positive: 'symmetrical face, detailed facial features, perfect facial proportions, high quality face, clear eyes, well-defined lips',
    negative: () => 'asymmetrical face, deformed face, disfigured, bad proportions, cross-eyed, extra eyes, missing eyes',
  },
  {
    key:      'outfit_noise',
    label:    '衣装テクスチャをクリーンに修正',
    positive: 'clean fabric texture, smooth outfit details, solid color clothing, crisp fabric edges, accurate pattern',
    negative: () => NEGATIVE_DICT.outfit_fix,
  },
  {
    key:      'prism_issue',
    label:    'プリズム・色収差を抑制',
    positive: 'clean crisp colors, no lens artifacts, sharp color edges, accurate color reproduction, no chromatic noise',
    negative: () => NEGATIVE_DICT.prism_fix,
  },
];

// ── メインエンジン関数 ────────────────────────────────────────
export function buildFixPrompts(state: CheckState): PromptResult {
  const positives: string[] = [];
  const negatives: string[] = [NEGATIVE_DICT.base];
  const summary:   string[] = [];

  for (const rule of FIX_RULES) {
    if (!state[rule.key]) continue;

    positives.push(rule.positive);
    summary.push(rule.label);

    const neg = rule.negative();
    if (!negatives.includes(neg)) {
      negatives.push(neg);
    }
  }

  return {
    positive: positives.join(', '),
    negative: negatives.join(', '),
    summary,
  };
}

// ── チェック状態の初期値 ──────────────────────────────────────
export function createDefaultCheckState(): CheckState {
  return {
    hand_role:       false,
    extra_fingers:   false,
    face_distortion: false,
    outfit_noise:    false,
    prism_issue:     false,
  };
}

// ── いずれかがチェックされているか判定 ───────────────────────
export function hasAnyCheck(state: CheckState): boolean {
  return Object.values(state).some(Boolean);
}
