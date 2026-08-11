import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeRegionSeries,
  analyzeTemporalSeries,
  classifyBlendshapes,
  EYE_BLINK_THRESHOLD,
  eyeStateStrength,
  MOUTH_HALF_THRESHOLD,
  MOUTH_OPEN_THRESHOLD,
  mouthStateStrength,
  normalizeScoreSeries,
  normalizeSeries,
  parseStoredAutoResults,
  pickCandidates,
  stabilityScoreOf,
  TEMPORAL_CANDIDATE_LIMIT,
  type AutoFrameResult,
  type StabilityInput,
} from './classification.ts';
import { parseStoredFrameTags, toLegacyTagMap, faceStateIdOf } from '../types/mouth-picker.ts';

test('blendshape classification maps eye blink and jaw open to the six-state axes', () => {
  const closedEyes = classifyBlendshapes({ eyeBlinkLeft: 0.8, eyeBlinkRight: 0.7, jawOpen: 0.02 });
  assert.equal(closedEyes.eyes, 'eyes_closed');
  assert.equal(closedEyes.mouth, 'mouth_closed');
  assert.equal(closedEyes.faceDetected, true);

  const halfOpen = classifyBlendshapes({ eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05, jawOpen: 0.2 });
  assert.equal(halfOpen.eyes, 'eyes_open');
  assert.equal(halfOpen.mouth, 'mouth_half');

  const fullOpen = classifyBlendshapes({ jawOpen: 0.6 });
  assert.equal(fullOpen.mouth, 'mouth_open');
});

test('confidence is zero at a decision boundary and grows away from it', () => {
  const atBoundary = classifyBlendshapes({ eyeBlinkLeft: EYE_BLINK_THRESHOLD, eyeBlinkRight: EYE_BLINK_THRESHOLD, jawOpen: MOUTH_HALF_THRESHOLD });
  assert.equal(atBoundary.eyesConfidence, 0);
  assert.equal(atBoundary.mouthConfidence, 0);
  assert.equal(atBoundary.confidence, 0);

  const clear = classifyBlendshapes({ eyeBlinkLeft: 0, eyeBlinkRight: 0, jawOpen: (MOUTH_HALF_THRESHOLD + MOUTH_OPEN_THRESHOLD) / 2 });
  assert.ok(clear.eyesConfidence > 0.9);
  assert.ok(clear.mouthConfidence > 0);
  assert.equal(clear.confidence, Math.min(clear.eyesConfidence, clear.mouthConfidence));
});

test('candidates are bucketed per state, sorted by confidence, and limited', () => {
  const make = (blink: number, jaw: number): AutoFrameResult => classifyBlendshapes({ eyeBlinkLeft: blink, eyeBlinkRight: blink, jawOpen: jaw });
  const results: Record<string, AutoFrameResult> = {
    'f1.png': make(0, 0.01),
    'f2.png': make(0, 0.03),
    'f3.png': make(0, 0.05),
    'f4.png': make(0, 0.02),
    'noface.png': { ...make(0, 0), faceDetected: false },
  };
  const candidates = pickCandidates(results, 3);
  const closed = candidates.eyes_open__mouth_closed ?? [];
  assert.equal(closed.length, 3);
  // 信頼度降順(境界0.1から遠い=jawが小さいほど上位)
  assert.equal(closed[0].filename, 'f1.png');
  assert.ok(closed.every((entry) => entry.filename !== 'noface.png'));
});

test('stored auto results are revalidated through the current thresholds', () => {
  const original = classifyBlendshapes({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9, jawOpen: 0.5 });
  const restored = parseStoredAutoResults({ 'a.png': original, 'broken.png': { blink: 'x' }, 'noface.png': { faceDetected: false, blink: 0, jawOpen: 0 } });
  assert.equal(restored['a.png'].eyes, 'eyes_closed');
  assert.equal(restored['a.png'].mouth, 'mouth_open');
  assert.equal(restored['broken.png'], undefined);
  assert.equal(restored['noface.png'].faceDetected, false);
});

test('region series analysis finds blinks and mouth opening from dark-ratio dips and peaks', () => {
  // 目: 通常0.30前後、瞬きで0.10へ低下(瞳が隠れる)。口: 通常0.05、半開き0.15、全開0.25。
  const eyeDark   = [0.30, 0.31, 0.10, 0.30, 0.29, 0.30, 0.31, 0.30];
  const mouthDark = [0.05, 0.05, 0.05, 0.15, 0.25, 0.24, 0.05, 0.06];
  const results = analyzeRegionSeries(eyeDark, mouthDark);

  assert.equal(results.length, 8);
  assert.equal(results[2].eyes, 'eyes_closed');
  assert.equal(results[0].eyes, 'eyes_open');
  assert.equal(results[0].mouth, 'mouth_closed');
  assert.equal(results[3].mouth, 'mouth_half');
  assert.equal(results[4].mouth, 'mouth_open');
  assert.ok(results.every((result) => result.method === 'region' && result.faceDetected));
  assert.ok(results[4].confidence > 0);
});

test('flat region series degrade to low-confidence single states instead of noise', () => {
  const flat = analyzeRegionSeries([0.2, 0.2, 0.2], [0.1, 0.1, 0.1]);
  assert.ok(flat.every((result) => result.eyes === 'eyes_open' && result.mouth === 'mouth_closed'));
  assert.ok(flat.every((result) => result.confidence <= 0.25));
  assert.equal(normalizeSeries([0.5, 0.5, 0.5]).flat, true);
  assert.equal(normalizeSeries([0, 1, 0.5]).flat, false);
});

test('stored region results are trusted as-is instead of re-thresholded', () => {
  const [regionResult] = analyzeRegionSeries([0.3, 0.1], [0.05, 0.25]);
  const restored = parseStoredAutoResults({ 'r.png': regionResult });
  assert.equal(restored['r.png'].method, 'region');
  assert.equal(restored['r.png'].eyes, regionResult.eyes);
  assert.equal(restored['r.png'].mouth, regionResult.mouth);
  assert.equal(restored['r.png'].confidence, regionResult.confidence);
});

/* ── 時間的解析(Phase 2) ───────────────────────────── */

/** 生スコアだけを持つ最小のAutoFrameResultを作る(時間解析はblink/jawOpenのみ参照)。 */
function rawFrame(blink: number, jawOpen: number): AutoFrameResult {
  return {
    faceDetected: true,
    blink,
    jawOpen,
    eyes: 'eyes_open',
    mouth: 'mouth_closed',
    eyesConfidence: 0,
    mouthConfidence: 0,
    confidence: 0,
  };
}

/** (blink, jawOpen)ペア列から時系列の results/filenames を作る。 */
function buildSeries(pairs: [number, number][]): { filenames: string[]; results: Record<string, AutoFrameResult> } {
  const filenames = pairs.map((_, index) => `f${String(index).padStart(2, '0')}.png`);
  const results: Record<string, AutoFrameResult> = {};
  pairs.forEach(([blink, jaw], index) => {
    results[filenames[index]] = rawFrame(blink, jaw);
  });
  return { filenames, results };
}

test('state strength memberships map scores to the six-state axes', () => {
  assert.equal(eyeStateStrength(0.9, 'eyes_closed'), 1);
  assert.equal(eyeStateStrength(0.1, 'eyes_closed'), 0);
  assert.equal(eyeStateStrength(0.1, 'eyes_open'), 1);
  assert.equal(mouthStateStrength(0.9, 'mouth_open'), 1);
  assert.equal(mouthStateStrength(0.5, 'mouth_open'), 0);
  assert.equal(mouthStateStrength(0.5, 'mouth_half'), 1);
  assert.equal(mouthStateStrength(0.05, 'mouth_closed'), 1);
  assert.equal(mouthStateStrength(0.9, 'mouth_closed'), 0);
});

test('score normalization catches rare events without amplifying flat noise', () => {
  // 300フレーム中3フレームだけの瞬き: p95には埋もれるが最大値アンカーでスコア1に届く。
  const rare = [...Array(297).fill(0.05), 0.85, 0.9, 0.85];
  const rareScores = normalizeScoreSeries(rare, 0.3);
  assert.equal(rareScores[298], 1);
  assert.ok(rareScores[0] < 0.05);

  // 変動が最小スパン未満のノイズ系列は増幅しない(=存在しない瞬きを作らない)。
  const flat = [0.05, 0.07, 0.05, 0.06, 0.05];
  assert.ok(normalizeScoreSeries(flat, 0.3).every((score) => score < 0.1));

  // 顔未検出(NaN)はスコア0。正規化は検出済みフレームのみで行う。
  assert.deepEqual(normalizeScoreSeries([Number.NaN, 0.1, 0.9], 0.3), [0, 0, 1]);
});

test('temporal analysis finds a brief eyes-closed + mouth-open event and ranks its peak first', () => {
  const pairs: [number, number][] = [];
  for (let i = 0; i < 5; i += 1) pairs.push([0.05, 0.05]);   // 0-4 基準(目開き口閉じ)
  pairs.push([0.05, 0.6], [0.05, 0.6], [0.05, 0.55]);        // 5-7 発話(目開き口全開)
  pairs.push([0.05, 0.05], [0.05, 0.05]);                    // 8-9
  pairs.push([0.7, 0.05], [0.9, 0.05], [0.7, 0.05]);         // 10-12 瞬き(目閉じ口閉じ)
  for (let i = 0; i < 7; i += 1) pairs.push([0.05, 0.05]);   // 13-19
  pairs.push([0.65, 0.5], [0.9, 0.58], [0.6, 0.48]);         // 20-22 希少: 目閉じ+口全開(ピーク=21)
  for (let i = 0; i < 7; i += 1) pairs.push([0.05, 0.05]);   // 23-29
  const { filenames, results } = buildSeries(pairs);

  const analysis = analyzeTemporalSeries(filenames, results);

  const rare = analysis.states.eyes_closed__mouth_open;
  assert.equal(rare.candidates.length, 3);
  assert.equal(rare.candidates[0].filename, 'f21.png');
  assert.deepEqual(new Set(rare.candidates.map((c) => c.filename)), new Set(['f20.png', 'f21.png', 'f22.png']));
  assert.ok(rare.candidates[0].strength >= rare.candidates[1].strength);
  assert.ok(rare.candidates[1].strength >= rare.candidates[2].strength);
  assert.ok(rare.candidates.every((c) => c.strength >= 0.5));

  // 他状態も取れている+候補数上限。
  assert.ok(analysis.states.eyes_open__mouth_open.candidates[0]?.index >= 5);
  assert.ok(analysis.states.eyes_open__mouth_open.candidates[0]?.index <= 7);
  assert.ok(analysis.states.eyes_closed__mouth_closed.candidates.length > 0);
  assert.equal(analysis.states.eyes_open__mouth_closed.candidates.length, TEMPORAL_CANDIDATE_LIMIT);

  // 目閉じ+口半開きは存在しない → 候補なし+理由。
  const missingHalf = analysis.states.eyes_closed__mouth_half;
  assert.equal(missingHalf.candidates.length, 0);
  assert.ok(missingHalf.missingReason?.includes('口半開き'));

  // フレームスコアも公開される(Phase 3 UI用)。
  assert.equal(analysis.frames.length, 30);
  assert.ok(analysis.frames[21].eyeCloseScore > 0.9);
  assert.ok(analysis.frames[0].mouthOpenScore < 0.1);
});

test('a state present in only a single frame is rejected as noise with a persistence reason', () => {
  const pairs: [number, number][] = Array.from({ length: 12 }, () => [0.05, 0.05]);
  pairs[3] = [0.05, 0.6];  // 口の可動域を作る発話フレーム(単発でない基準用)
  pairs[4] = [0.05, 0.6];
  pairs[5] = [0.05, 0.55];
  pairs[8] = [0.9, 0.58];  // 目閉じ+口全開が1フレームだけ
  const { filenames, results } = buildSeries(pairs);

  const verdict = analyzeTemporalSeries(filenames, results).states.eyes_closed__mouth_open;
  assert.equal(verdict.candidates.length, 0);
  assert.ok(verdict.missingReason?.includes('持続'));
});

test('missing mouth openness while eyes are closed produces an explanatory reason', () => {
  const pairs: [number, number][] = Array.from({ length: 15 }, () => [0.05, 0.05]);
  pairs[3] = [0.05, 0.6];                                   // 発話(目開き)で口の可動域はある
  pairs[4] = [0.05, 0.6];
  pairs[9] = [0.8, 0.05];                                    // 瞬き中は常に口閉じ
  pairs[10] = [0.9, 0.05];
  pairs[11] = [0.8, 0.05];
  const { filenames, results } = buildSeries(pairs);

  const verdict = analyzeTemporalSeries(filenames, results).states.eyes_closed__mouth_open;
  assert.equal(verdict.candidates.length, 0);
  assert.ok(verdict.missingReason?.includes('目閉じ'));
  assert.ok(verdict.missingReason?.includes('口開度80%'));
});

test('frames without analysis results are treated as undetected gaps', () => {
  const { filenames, results } = buildSeries([[0.05, 0.05], [0.05, 0.05], [0.05, 0.05]]);
  filenames.splice(1, 0, 'missing.png');
  const analysis = analyzeTemporalSeries(filenames, results);
  assert.equal(analysis.frames[1].faceDetected, false);
  assert.equal(analysis.frames[1].eyeCloseScore, 0);
});

/* ── アニメ向け補正+安定性(Phase 4) ───────────────── */

test('eye highlight loss detects blinks when the dark-ratio signal is flat', () => {
  // 暗部率は動かない(まぶた線が薄いキャラ等)が、瞳ハイライトの明部率が瞬きで消える。
  const eyeDark   = [0.2, 0.2, 0.2, 0.2, 0.2, 0.2];
  const eyeBright = [0.06, 0.06, 0.005, 0.06, 0.06, 0.06];
  const mouthDark = [0.05, 0.05, 0.05, 0.15, 0.25, 0.05];
  const results = analyzeRegionSeries(eyeDark, mouthDark, eyeBright);
  assert.equal(results[2].eyes, 'eyes_closed');
  assert.equal(results[0].eyes, 'eyes_open');
  // 明部信号なしなら従来どおり flat 扱い(低信頼の目開き)。
  const withoutBright = analyzeRegionSeries(eyeDark, mouthDark);
  assert.equal(withoutBright[2].eyes, 'eyes_open');
  assert.ok(withoutBright[2].eyesConfidence <= 0.25);
});

test('stability score is 1 when aligned with the reference and drops with shift and motion', () => {
  assert.equal(stabilityScoreOf({ centerShift: 0, areaShift: 0, motion: 0 }), 1);
  const shifted = stabilityScoreOf({ centerShift: 0.1, areaShift: 0.05, motion: 0.02 });
  assert.ok(shifted < 0.7 && shifted > 0.4);
  assert.equal(stabilityScoreOf({ centerShift: 0.5, areaShift: 0.3, motion: 0.2 }), 0);
});

test('unstable frames are demoted in the candidate ranking', () => {
  const pairs: [number, number][] = Array.from({ length: 12 }, () => [0.05, 0.05]);
  pairs[5] = [0.9, 0.58];  // 状態強度は同点の2フレーム
  pairs[6] = [0.9, 0.58];
  const { filenames, results } = buildSeries(pairs);
  const stable: StabilityInput = { centerShift: 0, areaShift: 0, motion: 0 };
  const stability: Record<string, StabilityInput> = Object.fromEntries(filenames.map((name) => [name, stable]));
  stability['f05.png'] = { centerShift: 0.15, areaShift: 0.1, motion: 0.1 }; // 先勝ちのf05を不安定にする

  const verdict = analyzeTemporalSeries(filenames, results, stability).states.eyes_closed__mouth_open;
  assert.equal(verdict.candidates[0].filename, 'f06.png');
  assert.equal(verdict.candidates[0].stabilityScore, 1);
  assert.ok((verdict.candidates[1].stabilityScore ?? 1) < 1);
  // 表示用の信頼度(状態強度)自体は安定性で変わらない。
  assert.equal(verdict.candidates[0].strength, verdict.candidates[1].strength);

  // 安定性データなしでも従来どおり動く。
  const without = analyzeTemporalSeries(filenames, results).states.eyes_closed__mouth_open;
  assert.ok(without.candidates.length >= 2);
  assert.equal(without.candidates[0].stabilityScore, undefined);
});

test('legacy mouth-only tags convert to the two-axis model and back', () => {
  const parsed = parseStoredFrameTags({ 'a.png': 'open', 'b.png': 'mid', 'c.png': 'close', 'junk.png': 'nope' });
  assert.equal(parsed['a.png'].mouth, 'mouth_open');
  assert.equal(parsed['a.png'].eyes, 'eyes_open');
  assert.equal(parsed['a.png'].locked, true);
  assert.equal(parsed['junk.png'], undefined);
  assert.equal(faceStateIdOf(parsed['b.png']), 'eyes_open__mouth_half');

  const legacy = toLegacyTagMap(parsed);
  assert.deepEqual(legacy, { 'a.png': 'open', 'b.png': 'mid', 'c.png': 'close' });
});
