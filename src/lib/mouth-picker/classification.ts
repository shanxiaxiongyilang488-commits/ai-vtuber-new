/*
 * MediaPipe Face Landmarker の blendshape スコアから目・口の6状態を推定する純粋ロジック。
 * ブラウザ依存(MediaPipe本体)は autoClassifier.ts 側に分離してある。
 */
import { faceStateIdOf } from '../types/mouth-picker.ts';
import type { EyeState, FaceStateId, MouthOpenState } from '../types/mouth-picker.ts';

/** まぶた(eyeBlink平均)がこの値以上なら目閉じ。アニメ顔は実写より低く出やすいため控えめ。 */
export const EYE_BLINK_THRESHOLD = 0.4;
/** jawOpen がこの値以上で口全開。 */
export const MOUTH_OPEN_THRESHOLD = 0.35;
/** jawOpen がこの値以上で口半開き。 */
export const MOUTH_HALF_THRESHOLD = 0.1;

export interface AutoFrameResult {
  faceDetected: boolean;
  /** mediapipe: eyeBlinkLeft/Right の平均。region: 1 - 目領域の正規化暗部率。 */
  blink: number;
  /** mediapipe: jawOpen スコア。region: 口領域の正規化暗部率。 */
  jawOpen: number;
  eyes: EyeState;
  mouth: MouthOpenState;
  eyesConfidence: number;
  mouthConfidence: number;
  /** 総合信頼度(弱い方の軸に合わせる) 0..1 */
  confidence: number;
  /** 解析エンジン。mediapipe=Face Landmarker / region=領域輝度解析(アニメ顔フォールバック) */
  method?: 'mediapipe' | 'region';
}

export const NO_FACE_RESULT: AutoFrameResult = {
  faceDetected: false,
  blink: 0,
  jawOpen: 0,
  eyes: 'eyes_open',
  mouth: 'mouth_closed',
  eyesConfidence: 0,
  mouthConfidence: 0,
  confidence: 0,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function classifyBlendshapes(scores: Record<string, number>): AutoFrameResult {
  const blink = ((scores['eyeBlinkLeft'] ?? 0) + (scores['eyeBlinkRight'] ?? 0)) / 2;
  const jawOpen = scores['jawOpen'] ?? 0;

  const eyes: EyeState = blink >= EYE_BLINK_THRESHOLD ? 'eyes_closed' : 'eyes_open';
  const mouth: MouthOpenState =
    jawOpen >= MOUTH_OPEN_THRESHOLD ? 'mouth_open' : jawOpen >= MOUTH_HALF_THRESHOLD ? 'mouth_half' : 'mouth_closed';

  // 信頼度 = 判定境界からの相対距離(境界ちょうど=0、離れるほど1へ)。
  const eyesConfidence = clamp01(Math.abs(blink - EYE_BLINK_THRESHOLD) / EYE_BLINK_THRESHOLD);
  const nearestMouthBoundary = Math.min(Math.abs(jawOpen - MOUTH_HALF_THRESHOLD), Math.abs(jawOpen - MOUTH_OPEN_THRESHOLD));
  const mouthConfidence = clamp01(nearestMouthBoundary / MOUTH_HALF_THRESHOLD);

  return {
    faceDetected: true,
    blink,
    jawOpen,
    eyes,
    mouth,
    eyesConfidence,
    mouthConfidence,
    confidence: Math.min(eyesConfidence, mouthConfidence),
    method: 'mediapipe',
  };
}

/* ── 領域輝度解析(アニメ顔フォールバック) ─────────────────
 * MediaPipeがアニメ顔を検出できない場合に使う。目・口それぞれの領域の
 * 「暗い画素の割合」(瞳・まつげ・口内の露出量)を全フレームで測り、
 * 系列のp5..p95で正規化して適応的に判定する。カメラ固定動画が前提。
 */

/** 目: 正規化暗部率がこの値未満なら目閉じ(瞳が隠れて暗部が減る)。 */
export const REGION_EYE_CLOSED_THRESHOLD = 0.45;
/** 口: 正規化暗部率の3分割境界(口内が見えるほど暗部が増える)。 */
export const REGION_MOUTH_HALF_THRESHOLD = 0.33;
export const REGION_MOUTH_OPEN_THRESHOLD = 0.66;
/** 系列の変動幅がこれ未満なら「動きなし」とみなし低信頼で単一状態に倒す。 */
export const REGION_FLAT_SPAN = 0.02;
const REGION_FLAT_CONFIDENCE = 0.25;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index];
}

/** 系列をp5..p95で0..1へ正規化する。変動がほぼ無い場合は flat=true。 */
export function normalizeSeries(values: number[]): { normalized: number[]; flat: boolean } {
  const sorted = [...values].sort((a, b) => a - b);
  const low = percentile(sorted, 0.05);
  const high = percentile(sorted, 0.95);
  const span = high - low;
  if (span < REGION_FLAT_SPAN) return { normalized: values.map(() => 0.5), flat: true };
  return { normalized: values.map((value) => clamp01((value - low) / span)), flat: false };
}

/**
 * 目・口領域の暗部率系列から全フレームの6状態を推定する。入力は同じ長さであること。
 * eyeBrightRatios(瞳ハイライトの明部率)があれば補助信号として併用する:
 * 目を閉じるとハイライトが消えるため、暗部率が使えないキャラでも瞬きを拾える。
 */
export function analyzeRegionSeries(
  eyeDarkRatios: number[],
  mouthDarkRatios: number[],
  eyeBrightRatios?: number[],
): AutoFrameResult[] {
  const eye = normalizeSeries(eyeDarkRatios);
  const mouthSeries = normalizeSeries(mouthDarkRatios);
  const bright =
    eyeBrightRatios && eyeBrightRatios.length === eyeDarkRatios.length ? normalizeSeries(eyeBrightRatios) : null;
  // 変動している信号だけを平均して「目の開き具合」とする(暗部率・明部率とも開き=高)。
  const eyeSignals: number[][] = [];
  if (!eye.flat) eyeSignals.push(eye.normalized);
  if (bright && !bright.flat) eyeSignals.push(bright.normalized);
  const eyesFlat = eyeSignals.length === 0;
  return eyeDarkRatios.map((_, index) => {
    const eyeValue = eyesFlat
      ? 0.5
      : eyeSignals.reduce((sum, series) => sum + series[index], 0) / eyeSignals.length;
    const mouthValue = mouthSeries.normalized[index];

    const eyes: EyeState = eyesFlat ? 'eyes_open' : eyeValue < REGION_EYE_CLOSED_THRESHOLD ? 'eyes_closed' : 'eyes_open';
    const eyesConfidence = eyesFlat
      ? REGION_FLAT_CONFIDENCE
      : clamp01(Math.abs(eyeValue - REGION_EYE_CLOSED_THRESHOLD) / REGION_EYE_CLOSED_THRESHOLD);

    const mouth: MouthOpenState = mouthSeries.flat
      ? 'mouth_closed'
      : mouthValue >= REGION_MOUTH_OPEN_THRESHOLD
        ? 'mouth_open'
        : mouthValue >= REGION_MOUTH_HALF_THRESHOLD
          ? 'mouth_half'
          : 'mouth_closed';
    const nearestBoundary = Math.min(
      Math.abs(mouthValue - REGION_MOUTH_HALF_THRESHOLD),
      Math.abs(mouthValue - REGION_MOUTH_OPEN_THRESHOLD),
    );
    const mouthConfidence = mouthSeries.flat ? REGION_FLAT_CONFIDENCE : clamp01(nearestBoundary / REGION_MOUTH_HALF_THRESHOLD);

    return {
      faceDetected: true,
      blink: 1 - eyeValue,
      jawOpen: mouthValue,
      eyes,
      mouth,
      eyesConfidence,
      mouthConfidence,
      confidence: Math.min(eyesConfidence, mouthConfidence),
      method: 'region' as const,
    };
  });
}

export interface StateCandidate {
  filename: string;
  result: AutoFrameResult;
}

/** 6状態ごとに信頼度上位の候補フレームを返す(auto仮選択とPhase 3の候補UIで共用)。 */
export function pickCandidates(
  results: Record<string, AutoFrameResult>,
  limit = 3,
): Partial<Record<FaceStateId, StateCandidate[]>> {
  const buckets: Partial<Record<FaceStateId, StateCandidate[]>> = {};
  for (const [filename, result] of Object.entries(results)) {
    if (!result.faceDetected) continue;
    const id = faceStateIdOf(result);
    (buckets[id] ??= []).push({ filename, result });
  }
  for (const id of Object.keys(buckets) as FaceStateId[]) {
    buckets[id] = buckets[id]!.sort((a, b) => b.result.confidence - a.result.confidence).slice(0, limit);
  }
  return buckets;
}

/* ── 時間的解析(Phase 2) ─────────────────────────────
 * 1フレーム独立判定の弱点(一瞬しか出ない「目閉じ+口開き」等の取り逃し)を補う。
 * 全フレームのスコア系列から6状態それぞれの「状態強度」系列を作り、
 * 強度が数フレーム持続する区間(イベント)のピークを候補として返す。
 * 入力はフレーム名の時系列順(frame_%04d.png のソート順)であること。
 */

/** 目スコア正規化の最小スパン。実際の変動がこれ未満なら増幅せず「瞬きなし」に倒す。 */
export const EYE_SCORE_MIN_SPAN = 0.3;
/** 口スコア正規化の最小スパン。 */
export const MOUTH_SCORE_MIN_SPAN = 0.25;
/** 状態強度の平滑化半径(前後Nフレームの移動平均)。単発ノイズをイベントから除く。 */
export const TEMPORAL_SMOOTH_RADIUS = 1;
/** イベントと認める最小持続フレーム数(30fps: 2フレーム≒67ms)。 */
export const TEMPORAL_MIN_EVENT_FRAMES = 2;
/** 候補と認める状態強度の下限。 */
export const TEMPORAL_STRENGTH_MIN = 0.5;
/** 状態ごとの候補数上限。 */
export const TEMPORAL_CANDIDATE_LIMIT = 3;

/** 目閉じ判定が立ち上がるスコア境界(これ以上で徐々に「閉じ」扱い)。 */
export const EYE_CLOSED_RAMP: readonly [number, number] = [0.45, 0.75];
/** 目開き判定の境界(1-scoreに適用)。 */
export const EYE_OPEN_RAMP: readonly [number, number] = [0.45, 0.75];
/** 口閉じ: score≤0.2で完全一致、0.45で不一致。 */
export const MOUTH_CLOSED_RAMP: readonly [number, number] = [0.55, 0.8];
/** 口半開き: 0.5をピークとする三角メンバーシップの立ち上がり境界。 */
export const MOUTH_HALF_RAMP: readonly [number, number] = [0.25, 0.5];
/** 口全開: score0.55から立ち上がり0.8で完全一致(=口開度80%以上)。 */
export const MOUTH_OPEN_RAMP: readonly [number, number] = [0.55, 0.8];

/** スコア済みフレーム(時系列順)。 */
export interface ScoredFrame {
  filename: string;
  index: number;
  faceDetected: boolean;
  /** 0=完全に開いている / 1=完全に閉じている(系列内で適応正規化済み) */
  eyeCloseScore: number;
  /** 0=口閉じ / 1=最大開口(系列内で適応正規化済み) */
  mouthOpenScore: number;
}

export interface TemporalCandidate {
  filename: string;
  index: number;
  /** その状態としての強度=信頼度 0..1 */
  strength: number;
  eyeCloseScore: number;
  mouthOpenScore: number;
  /** 顔位置安定性 0..1(1=基準フレームと一致)。安定性データがある場合のみ。 */
  stabilityScore?: number;
}

/* ── 顔位置安定性(改善6) ──
 * PuruPuruは6枚の画像を切り替えるため、候補間の位置ズレが大きいと
 * 表情遷移のたびにキャラが跳ねる。基準フレームとの差をスコア化し、
 * 候補ランキングで減点する(状態強度そのものは変えない)。 */

/** 中心ズレの減点係数(画面対角の10%ズレで-0.3)。 */
export const STABILITY_CENTER_WEIGHT = 3;
/** 面積変化(サイズ・回転の代理)の減点係数。 */
export const STABILITY_AREA_WEIGHT = 2;
/** 前フレーム差(ブレ・動き量)の減点係数。 */
export const STABILITY_MOTION_WEIGHT = 1.5;
/** ランキングに安定性を効かせる最大割合(強度の30%まで減点)。 */
export const STABILITY_RANK_WEIGHT = 0.3;

/** 安定性測定値(regionAnalyzer.FrameStability と同形)。 */
export interface StabilityInput {
  centerShift: number;
  areaShift: number;
  motion: number;
}

/** 安定性測定値を 0..1(1=完全に安定)へ変換する。 */
export function stabilityScoreOf(stability: StabilityInput): number {
  return clamp01(
    1 -
      (stability.centerShift * STABILITY_CENTER_WEIGHT +
        stability.areaShift * STABILITY_AREA_WEIGHT +
        stability.motion * STABILITY_MOTION_WEIGHT),
  );
}

export interface TemporalStateVerdict {
  /** 強度降順、最大 TEMPORAL_CANDIDATE_LIMIT 件。空なら missingReason に理由。 */
  candidates: TemporalCandidate[];
  missingReason?: string;
}

export interface TemporalAnalysis {
  frames: ScoredFrame[];
  states: Record<FaceStateId, TemporalStateVerdict>;
}

function rampUp(value: number, zeroAt: number, oneAt: number): number {
  if (oneAt <= zeroAt) return value >= oneAt ? 1 : 0;
  return clamp01((value - zeroAt) / (oneAt - zeroAt));
}

/** 目スコアが状態にどれだけ一致するか 0..1。 */
export function eyeStateStrength(eyeCloseScore: number, state: EyeState): number {
  return state === 'eyes_closed'
    ? rampUp(eyeCloseScore, EYE_CLOSED_RAMP[0], EYE_CLOSED_RAMP[1])
    : rampUp(1 - eyeCloseScore, EYE_OPEN_RAMP[0], EYE_OPEN_RAMP[1]);
}

/** 口スコアが状態にどれだけ一致するか 0..1。 */
export function mouthStateStrength(mouthOpenScore: number, state: MouthOpenState): number {
  if (state === 'mouth_closed') return rampUp(1 - mouthOpenScore, MOUTH_CLOSED_RAMP[0], MOUTH_CLOSED_RAMP[1]);
  if (state === 'mouth_open') return rampUp(mouthOpenScore, MOUTH_OPEN_RAMP[0], MOUTH_OPEN_RAMP[1]);
  return Math.min(
    rampUp(mouthOpenScore, MOUTH_HALF_RAMP[0], MOUTH_HALF_RAMP[1]),
    rampUp(1 - mouthOpenScore, MOUTH_HALF_RAMP[0], MOUTH_HALF_RAMP[1]),
  );
}

/**
 * 系列を p5..最大値 で0..1へ正規化する。スパンが minSpan 未満の場合は
 * minSpan で割ることで、変動のない系列のノイズを増幅しない(希少イベントは
 * p95に埋もれず最大値が拾うため、瞬きが数フレームしか無くてもスコア1に届く)。
 */
export function normalizeScoreSeries(values: number[], minSpan: number): number[] {
  const detected = values.filter((value) => Number.isFinite(value));
  if (detected.length === 0) return values.map(() => 0);
  const sorted = [...detected].sort((a, b) => a - b);
  const low = percentile(sorted, 0.05);
  const high = sorted[sorted.length - 1];
  const span = Math.max(high - low, minSpan);
  return values.map((value) => (Number.isFinite(value) ? clamp01((value - low) / span) : 0));
}

function smoothSeries(values: number[], radius: number): number[] {
  if (radius <= 0) return [...values];
  return values.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const at = index + offset;
      if (at < 0 || at >= values.length) continue;
      sum += values[at];
      count += 1;
    }
    return count === 0 ? 0 : sum / count;
  });
}

const EYE_STATE_JA: Record<EyeState, string> = { eyes_open: '目開き', eyes_closed: '目閉じ' };
const MOUTH_MISSING_JA: Record<MouthOpenState, string> = {
  mouth_closed: '口閉じ(口開度20%以下)のフレームがありません',
  mouth_half: '口半開き(口開度50%前後)のフレームがありません',
  mouth_open: '口開度80%以上のフレームがありません',
};

/** 全フレームのスコアと6状態それぞれの候補(または候補なしの理由)を返す。 */
export function analyzeTemporalSeries(
  filenames: string[],
  results: Record<string, AutoFrameResult>,
  stability?: Record<string, StabilityInput>,
): TemporalAnalysis {
  const entries = filenames.map((filename) => results[filename]);
  const eyeRaw = entries.map((entry) => (entry?.faceDetected ? entry.blink : Number.NaN));
  const mouthRaw = entries.map((entry) => (entry?.faceDetected ? entry.jawOpen : Number.NaN));
  const eyeScores = normalizeScoreSeries(eyeRaw, EYE_SCORE_MIN_SPAN);
  const mouthScores = normalizeScoreSeries(mouthRaw, MOUTH_SCORE_MIN_SPAN);

  const frames: ScoredFrame[] = filenames.map((filename, index) => ({
    filename,
    index,
    faceDetected: entries[index]?.faceDetected === true,
    eyeCloseScore: eyeScores[index],
    mouthOpenScore: mouthScores[index],
  }));

  const stabilityScores = filenames.map((filename) => {
    const entry = stability?.[filename];
    return entry ? stabilityScoreOf(entry) : undefined;
  });

  const states = {} as Record<FaceStateId, TemporalStateVerdict>;
  for (const eyes of ['eyes_open', 'eyes_closed'] as EyeState[]) {
    for (const mouth of ['mouth_closed', 'mouth_half', 'mouth_open'] as MouthOpenState[]) {
      const stateId = faceStateIdOf({ eyes, mouth });
      states[stateId] = analyzeState(frames, eyes, mouth, stabilityScores);
    }
  }
  return { frames, states };
}

function analyzeState(
  frames: ScoredFrame[],
  eyes: EyeState,
  mouth: MouthOpenState,
  stabilityScores: (number | undefined)[],
): TemporalStateVerdict {
  const strengths = frames.map((frame) =>
    frame.faceDetected
      ? Math.min(eyeStateStrength(frame.eyeCloseScore, eyes), mouthStateStrength(frame.mouthOpenScore, mouth))
      : 0,
  );
  const smoothed = smoothSeries(strengths, TEMPORAL_SMOOTH_RADIUS);

  // 平滑化強度が下限を超え続ける区間をイベントとして拾う。
  const eventFrames: number[] = [];
  let runStart = -1;
  for (let index = 0; index <= smoothed.length; index += 1) {
    const active = index < smoothed.length && smoothed[index] >= TEMPORAL_STRENGTH_MIN;
    if (active && runStart < 0) runStart = index;
    if (!active && runStart >= 0) {
      if (index - runStart >= TEMPORAL_MIN_EVENT_FRAMES) {
        for (let at = runStart; at < index; at += 1) eventFrames.push(at);
      }
      runStart = -1;
    }
  }

  // 順位付けは強度から安定性ペナルティ(位置ズレ・ブレ)を引いた値で行う。
  const rankScore = (index: number): number => {
    const stability = stabilityScores[index];
    return stability === undefined ? strengths[index] : strengths[index] * (1 - STABILITY_RANK_WEIGHT * (1 - stability));
  };
  const candidates = eventFrames
    .filter((index) => strengths[index] >= TEMPORAL_STRENGTH_MIN)
    .sort((a, b) => rankScore(b) - rankScore(a))
    .slice(0, TEMPORAL_CANDIDATE_LIMIT)
    .map((index) => ({
      filename: frames[index].filename,
      index,
      strength: strengths[index],
      eyeCloseScore: frames[index].eyeCloseScore,
      mouthOpenScore: frames[index].mouthOpenScore,
      ...(stabilityScores[index] !== undefined ? { stabilityScore: stabilityScores[index] } : {}),
    }));

  if (candidates.length > 0) return { candidates };
  return { candidates: [], missingReason: missingReasonFor(frames, strengths, eyes, mouth) };
}

/** 候補ゼロの理由: どの軸で条件を満たせなかったかを特定して説明する。 */
function missingReasonFor(
  frames: ScoredFrame[],
  strengths: number[],
  eyes: EyeState,
  mouth: MouthOpenState,
): string {
  const detected = frames.filter((frame) => frame.faceDetected);
  if (detected.length === 0) return '顔を検出できたフレームがありません。';

  const eyeLabel = EYE_STATE_JA[eyes];
  const maxEye = Math.max(...detected.map((frame) => eyeStateStrength(frame.eyeCloseScore, eyes)));
  if (maxEye < TEMPORAL_STRENGTH_MIN) return `${eyeLabel}状態のフレームが検出できませんでした。`;

  const withEye = detected.filter((frame) => eyeStateStrength(frame.eyeCloseScore, eyes) >= TEMPORAL_STRENGTH_MIN);
  const maxMouth = Math.max(...withEye.map((frame) => mouthStateStrength(frame.mouthOpenScore, mouth)));
  if (maxMouth < TEMPORAL_STRENGTH_MIN) {
    return `${eyeLabel}状態は検出しましたが、${MOUTH_MISSING_JA[mouth]}。`;
  }
  const maxStrength = Math.max(...strengths);
  if (maxStrength >= TEMPORAL_STRENGTH_MIN) {
    return `条件を満たす瞬間はありますが、${TEMPORAL_MIN_EVENT_FRAMES}フレーム以上持続せずノイズと区別できません。`;
  }
  return `${eyeLabel}と${mouthLabelShortJa(mouth)}が同時に成立するフレームがありません。`;
}

function mouthLabelShortJa(mouth: MouthOpenState): string {
  return mouth === 'mouth_open' ? '口全開' : mouth === 'mouth_half' ? '口半開き' : '口閉じ';
}

/** localStorage 保存データの読込(壊れたエントリは捨てる)。 */
export function parseStoredAutoResults(raw: unknown): Record<string, AutoFrameResult> {
  if (!raw || typeof raw !== 'object') return {};
  const results: Record<string, AutoFrameResult> = {};
  for (const [filename, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Partial<AutoFrameResult>;
    if (typeof entry.blink !== 'number' || typeof entry.jawOpen !== 'number') continue;
    if (entry.faceDetected !== true) {
      results[filename] = { ...NO_FACE_RESULT };
      continue;
    }
    if (entry.method === 'region') {
      // 領域解析は系列全体の正規化に依存するため、保存済みの判定をそのまま信用する。
      const eyes = entry.eyes === 'eyes_closed' ? 'eyes_closed' : 'eyes_open';
      const mouth = entry.mouth === 'mouth_open' || entry.mouth === 'mouth_half' || entry.mouth === 'mouth_closed' ? entry.mouth : 'mouth_closed';
      results[filename] = {
        faceDetected: true,
        blink: entry.blink,
        jawOpen: entry.jawOpen,
        eyes,
        mouth,
        eyesConfidence: typeof entry.eyesConfidence === 'number' ? entry.eyesConfidence : 0,
        mouthConfidence: typeof entry.mouthConfidence === 'number' ? entry.mouthConfidence : 0,
        confidence: typeof entry.confidence === 'number' ? entry.confidence : 0,
        method: 'region',
      };
      continue;
    }
    // MediaPipe結果は閾値変更に追従できるよう、保存スコアから判定を再計算する。
    results[filename] = classifyBlendshapes({
      eyeBlinkLeft: entry.blink,
      eyeBlinkRight: entry.blink,
      jawOpen: entry.jawOpen,
    });
  }
  return results;
}
