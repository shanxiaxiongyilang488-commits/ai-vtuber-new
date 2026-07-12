/*
 * settings.json の itemLayers(PNGアイテム)を正規化する。
 * スロット・既定値・クランプ範囲は公式実装に合わせる:
 * https://github.com/rotejin/PuruPuruPNGTuber (Apache-2.0, Copyright 2026 masa)
 */

/** 描画順に並んだスロット。アバター本体レイヤーはfaceBack/faceFront等の間に挟まる。 */
export const ITEM_LAYER_SLOTS = [
  'stageBack',
  'characterBack',
  'faceBack',
  'faceFront',
  'frontHairFront',
  'stageFront',
] as const;

export type PuruPuruItemSlot = (typeof ITEM_LAYER_SLOTS)[number];

export interface PuruPuruItemLayerDef {
  /** ZIP内の画像パス(items/...)。 */
  file: string;
  name: string;
  slot: PuruPuruItemSlot;
  /** キャンバス中心からのオフセット(px)。 */
  x: number;
  y: number;
  /** 拡大率(%)。 */
  scale: number;
  /** 回転(度)。 */
  rotation: number;
  /** 不透明度(%)。 */
  opacity: number;
}

const ITEM_LAYER_LIMITS = {
  x: { min: -3000, max: 3000 },
  y: { min: -3000, max: 3000 },
  scale: { min: 10, max: 500 },
  rotation: { min: -180, max: 180 },
  opacity: { min: 10, max: 100 },
} as const;

const ITEM_LAYER_DEFAULTS = { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100 } as const;

const DEFAULT_SLOT: PuruPuruItemSlot = 'frontHairFront';

function normalizeItemNumber(value: unknown, fallback: number, limit: { min: number; max: number }): number {
  const number = Number(value);
  return Math.round(Math.max(limit.min, Math.min(limit.max, Number.isFinite(number) ? number : fallback)));
}

/**
 * 非表示レイヤーと画像ファイル参照のないレイヤーは描画対象外なので落とす。
 * 不正なスロットは公式と同じくfrontHairFrontへフォールバックする。
 */
export function normalizeItemLayers(settings: { itemLayers?: unknown } | null | undefined): PuruPuruItemLayerDef[] {
  const raw = settings?.itemLayers;
  if (!Array.isArray(raw)) return [];
  const layers: PuruPuruItemLayerDef[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.file !== 'string' || !record.file) continue;
    if (record.visible === false) continue;
    layers.push({
      file: record.file,
      name: typeof record.name === 'string' ? record.name : record.file,
      slot: (ITEM_LAYER_SLOTS as readonly string[]).includes(String(record.slot)) ? record.slot as PuruPuruItemSlot : DEFAULT_SLOT,
      x: normalizeItemNumber(record.x, ITEM_LAYER_DEFAULTS.x, ITEM_LAYER_LIMITS.x),
      y: normalizeItemNumber(record.y, ITEM_LAYER_DEFAULTS.y, ITEM_LAYER_LIMITS.y),
      scale: normalizeItemNumber(record.scale, ITEM_LAYER_DEFAULTS.scale, ITEM_LAYER_LIMITS.scale),
      rotation: normalizeItemNumber(record.rotation, ITEM_LAYER_DEFAULTS.rotation, ITEM_LAYER_LIMITS.rotation),
      opacity: normalizeItemNumber(record.opacity, ITEM_LAYER_DEFAULTS.opacity, ITEM_LAYER_LIMITS.opacity),
    });
  }
  return layers;
}
