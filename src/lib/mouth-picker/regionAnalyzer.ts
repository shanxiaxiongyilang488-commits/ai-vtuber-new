/*
 * 領域輝度解析のブラウザ側: フレーム画像から目・口領域の「暗い画素の割合」を測る。
 * 判定本体は classification.ts の analyzeRegionSeries(純粋関数)。
 */

/** 画像に対する正規化領域(中心+サイズ、すべて0..1)。 */
export interface NormRegion {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** クリック指定した中心点から目・口の既定サイズの領域を作る。 */
export function regionFromPoint(cx: number, cy: number, kind: 'eye' | 'mouth'): NormRegion {
  const size = kind === 'eye' ? { w: 0.34, h: 0.12 } : { w: 0.2, h: 0.12 };
  return { cx: Math.max(0, Math.min(1, cx)), cy: Math.max(0, Math.min(1, cy)), ...size };
}

/** 輝度がこの値(0..255)未満の画素を「暗部」として数える。 */
const DARK_LUMA_THRESHOLD = 90;
/** 輝度がこの値(0..255)以上の画素を「明部」(瞳ハイライト等)として数える。 */
const BRIGHT_LUMA_THRESHOLD = 200;
const ANALYSIS_WIDTH = 320;

/** 1領域の測定値。dark=暗部率(瞳・口内) / bright=明部率(瞳ハイライト)。 */
export interface RegionMeasure {
  dark: number;
  bright: number;
}

export class RegionDarkRatioAnalyzer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor() {
    if (typeof document === 'undefined') throw new Error('領域解析はブラウザでのみ実行できます。');
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas 2d context を取得できません。');
    this.ctx = ctx;
  }

  /** 1フレーム分: 指定領域それぞれの暗部率(0..1)を返す。 */
  measure(image: ImageBitmap, regions: NormRegion[]): number[] {
    return this.measureDetail(image, regions).map((entry) => entry.dark);
  }

  /** 1フレーム分: 指定領域それぞれの暗部率+明部率を返す(アニメ顔補正用)。 */
  measureDetail(image: ImageBitmap, regions: NormRegion[]): RegionMeasure[] {
    const scale = ANALYSIS_WIDTH / image.width;
    const width = ANALYSIS_WIDTH;
    const height = Math.max(1, Math.round(image.height * scale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.drawImage(image, 0, 0, width, height);
    return regions.map((region) => this.regionMeasure(region, width, height));
  }

  private regionMeasure(region: NormRegion, width: number, height: number): RegionMeasure {
    const x = Math.max(0, Math.round((region.cx - region.w / 2) * width));
    const y = Math.max(0, Math.round((region.cy - region.h / 2) * height));
    const w = Math.max(1, Math.min(width - x, Math.round(region.w * width)));
    const h = Math.max(1, Math.min(height - y, Math.round(region.h * height)));
    const data = this.ctx.getImageData(x, y, w, h).data;
    let dark = 0;
    let bright = 0;
    const pixels = w * h;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (luma < DARK_LUMA_THRESHOLD) dark += 1;
      else if (luma >= BRIGHT_LUMA_THRESHOLD) bright += 1;
    }
    return pixels === 0 ? { dark: 0, bright: 0 } : { dark: dark / pixels, bright: bright / pixels };
  }
}

/* ── 顔位置安定性(Phase 4) ─────────────────────────
 * PuruPuruは6枚を切り替えるため、候補間の位置ズレ・ブレが品質に直結する。
 * 縮小輝度サムネイルの暗部マスク(キャラクターシルエットの代理)から
 * 中心位置・面積の基準フレーム差と、前フレーム差(動き・ブレ量)を測る。
 * フレームは時系列順に measure() を呼ぶこと。基準=最初に測った1枚。
 */

/** 1フレームの安定性測定値(すべて0..1、小さいほど安定)。 */
export interface FrameStability {
  /** 基準フレームとの暗部マスク中心距離(画面対角比) */
  centerShift: number;
  /** 基準フレームとの暗部面積差(サイズ・回転変化の代理) */
  areaShift: number;
  /** 前フレームとの平均輝度差(ブレ・動き量) */
  motion: number;
}

const STABILITY_THUMB_WIDTH = 64;

export class FrameStabilityAnalyzer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private ref: { luma: Float32Array; cx: number; cy: number; area: number } | null = null;
  private prevLuma: Float32Array | null = null;

  constructor() {
    if (typeof document === 'undefined') throw new Error('安定性解析はブラウザでのみ実行できます。');
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas 2d context を取得できません。');
    this.ctx = ctx;
  }

  /** 解析セッション開始時に呼ぶ。次の measure() が基準フレームになる。 */
  reset(): void {
    this.ref = null;
    this.prevLuma = null;
  }

  measure(image: ImageBitmap): FrameStability {
    const width = STABILITY_THUMB_WIDTH;
    const height = Math.max(1, Math.round((image.height / image.width) * width));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.drawImage(image, 0, 0, width, height);
    const data = this.ctx.getImageData(0, 0, width, height).data;

    const luma = new Float32Array(width * height);
    let darkCount = 0;
    let sumX = 0;
    let sumY = 0;
    for (let index = 0; index < luma.length; index += 1) {
      const at = index * 4;
      const value = 0.2126 * data[at] + 0.7152 * data[at + 1] + 0.0722 * data[at + 2];
      luma[index] = value;
      if (value < DARK_LUMA_THRESHOLD) {
        darkCount += 1;
        sumX += index % width;
        sumY += Math.floor(index / width);
      }
    }
    const area = darkCount / luma.length;
    const cx = darkCount > 0 ? sumX / darkCount / width : 0.5;
    const cy = darkCount > 0 ? sumY / darkCount / height : 0.5;

    let motion = 0;
    if (this.prevLuma && this.prevLuma.length === luma.length) {
      let diff = 0;
      for (let index = 0; index < luma.length; index += 1) diff += Math.abs(luma[index] - this.prevLuma[index]);
      motion = diff / luma.length / 255;
    }
    this.prevLuma = luma;

    if (!this.ref) {
      this.ref = { luma, cx, cy, area };
      return { centerShift: 0, areaShift: 0, motion };
    }
    return {
      centerShift: Math.hypot(cx - this.ref.cx, cy - this.ref.cy) / Math.SQRT2,
      areaShift: Math.abs(area - this.ref.area),
      motion,
    };
  }
}
