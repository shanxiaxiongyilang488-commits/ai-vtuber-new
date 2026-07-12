/*
 * settings.json (state) からレンダラーが使う調整値を取り出す。
 * 既定値・閾値・応答カーブは公式実装に合わせる:
 * https://github.com/rotejin/PuruPuruPNGTuber (Apache-2.0, Copyright 2026 masa)
 */

export interface PuruPuruRendererSettings {
  autoBlink: boolean;
  hairVisible: boolean;
  /** 髪バネの強さ(%)。公式既定40。 */
  hairSpring: number;
  /** 呼吸(アイドル)モーションの強さ(%)。公式既定60。 */
  breathStrength: number;
  /** 発話時の弾みの強さ(%)。公式既定15。 */
  pyokoStrength: number;
  /** マイク入力ゲイン(%)。公式既定220。 */
  micGain: number;
  /** 口が半開きになる音量閾値(%)。公式既定8。 */
  mouthHalf: number;
  /** 口が全開になる音量閾値(%)。公式既定22。 */
  mouthFull: number;
  /** 口を閉じる速さ(%)。公式既定18。 */
  mouthRelease: number;
  /** 口画像の切替クロスフェード時間(ms)。公式既定0=即時切替、上限160。 */
  mouthCrossfadeMs: number;
}

export const RENDERER_SETTING_DEFAULTS: PuruPuruRendererSettings = {
  autoBlink: true,
  hairVisible: true,
  hairSpring: 40,
  breathStrength: 60,
  pyokoStrength: 15,
  micGain: 220,
  mouthHalf: 8,
  mouthFull: 22,
  mouthRelease: 18,
  mouthCrossfadeMs: 0,
};

export const MOUTH_CROSSFADE_MAX_MS = 160;

type SettingsLike = { state?: Record<string, unknown> } | null | undefined;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readNumber(state: Record<string, unknown> | undefined, key: string, fallback: number, min: number, max: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function readBoolean(state: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = state?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function extractRendererSettings(settings: SettingsLike): PuruPuruRendererSettings {
  const state = settings?.state;
  const defaults = RENDERER_SETTING_DEFAULTS;
  return {
    autoBlink: readBoolean(state, 'autoBlink', defaults.autoBlink),
    hairVisible: readBoolean(state, 'hairVisible', defaults.hairVisible),
    hairSpring: readNumber(state, 'hairSpring', defaults.hairSpring, 0, 200),
    breathStrength: readNumber(state, 'breathStrength', defaults.breathStrength, 0, 200),
    pyokoStrength: readNumber(state, 'pyokoStrength', defaults.pyokoStrength, 0, 200),
    micGain: readNumber(state, 'micGain', defaults.micGain, 0, 1000),
    mouthHalf: readNumber(state, 'mouthHalf', defaults.mouthHalf, 1, 80),
    mouthFull: readNumber(state, 'mouthFull', defaults.mouthFull, 2, 100),
    mouthRelease: readNumber(state, 'mouthRelease', defaults.mouthRelease, 1, 100),
    mouthCrossfadeMs: readNumber(state, 'mouthCrossfadeMs', defaults.mouthCrossfadeMs, 0, MOUTH_CROSSFADE_MAX_MS),
  };
}

export interface MouthResponse {
  /** これ未満の音量では口を開かない。 */
  floor: number;
  /** floorから全開までの音量幅。 */
  range: number;
  /** 口を閉じる方向の毎秒60フレーム基準lerp係数。 */
  releaseFactor60: number;
  /** 開く方向の毎秒60フレーム基準lerp係数(公式固定値)。 */
  attackFactor60: number;
  /**
   * モデル作者のmicGain調整を公式既定(220)比で反映する係数。
   * 入力のmouthLevelは既にAnalyser側で正規化済みのため、絶対値ではなく比率だけ適用する。
   */
  voiceGain: number;
  crossfadeMs: number;
}

export function mouthResponse(settings: PuruPuruRendererSettings): MouthResponse {
  const half = Math.min(settings.mouthHalf, settings.mouthFull - 1) / 100;
  const full = Math.max(settings.mouthFull, settings.mouthHalf + 1) / 100;
  const floor = Math.max(0.004, half * 0.45);
  return {
    floor,
    range: Math.max(0.01, full - floor),
    releaseFactor60: clamp(settings.mouthRelease / 100, 0.04, 0.45),
    attackFactor60: 0.42,
    voiceGain: settings.micGain / RENDERER_SETTING_DEFAULTS.micGain,
    crossfadeMs: clamp(settings.mouthCrossfadeMs, 0, MOUTH_CROSSFADE_MAX_MS),
  };
}

export function mouthTargetForLevel(level: number, response: MouthResponse): number {
  return clamp((level - response.floor) / response.range, 0, 1);
}

/** 0=閉じ 1=半開き 2=全開。閾値は公式実装の0.22/0.78。 */
export type MouthState = 0 | 1 | 2;

export function mouthStateForTarget(target: number): MouthState {
  return target >= 0.78 ? 2 : target >= 0.22 ? 1 : 0;
}

/** 60fps基準のlerp係数を実フレーム時間に補正する(公式frameIndependentLerpFactor相当)。 */
export function frameLerpFactor(factor60: number, deltaSeconds: number): number {
  const clamped = clamp(factor60, 0, 1);
  return 1 - Math.pow(1 - clamped, Math.max(0, deltaSeconds) * 60);
}

/** 次の瞬きまでの待機時間(ms)。公式実装: 20%で850–1500ms、80%で1900–4600ms。 */
export function nextBlinkDelayMs(random: () => number = Math.random): number {
  return random() < 0.2 ? 850 + random() * 650 : 1900 + random() * 2700;
}

export interface BlinkStep {
  closeMs: number;
  holdMs: number;
  openMs: number;
}

/** 瞬き1回の閉じ・保持・開き時間(ms)。公式のnormal blinkStepと同じ範囲。 */
export function randomBlinkStep(random: () => number = Math.random): BlinkStep {
  return {
    closeMs: 62 + random() * 28,
    holdMs: 32 + random() * 34,
    openMs: 122 + random() * 56,
  };
}
