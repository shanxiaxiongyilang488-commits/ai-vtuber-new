/*
 * .purupuru package writer for mouth-picker exports.
 * Produces packages readable by packageLoader.ts (format: purupuru-avatar-package v1).
 */
import JSZip from 'jszip';
import type { PuruPuruAssetKey } from './types';

/** 顔差分6状態(髪レイヤーを除くアバター画像)。 */
export const PURUPURU_FACE_KEYS = [
  'eyesOpenMouthClosed',
  'eyesOpenMouthHalf',
  'eyesOpenMouthOpen',
  'eyesClosedMouthClosed',
  'eyesClosedMouthHalf',
  'eyesClosedMouthOpen',
] as const;

export type PuruPuruFaceKey = (typeof PURUPURU_FACE_KEYS)[number];

const FACE_ASSET_PATHS: Record<PuruPuruAssetKey, string> = {
  backHair: 'avatar/back-hair.png',
  frontHair: 'avatar/front-hair.png',
  eyesOpenMouthClosed: 'avatar/eyes-open-mouth-closed.png',
  eyesOpenMouthHalf: 'avatar/eyes-open-mouth-half.png',
  eyesOpenMouthOpen: 'avatar/eyes-open-mouth-open.png',
  eyesClosedMouthClosed: 'avatar/eyes-closed-mouth-closed.png',
  eyesClosedMouthHalf: 'avatar/eyes-closed-mouth-half.png',
  eyesClosedMouthOpen: 'avatar/eyes-closed-mouth-open.png',
};

/**
 * 欠けた差分の代替キー(先に見つかったものを採用)。
 * 発話中の瞬きは一瞬で口形状の連続性の方が目立つため、口の一致を目の一致より優先する。
 */
const FACE_FALLBACKS: Record<PuruPuruFaceKey, PuruPuruFaceKey[]> = {
  eyesOpenMouthClosed: [],
  eyesOpenMouthHalf: ['eyesOpenMouthOpen', 'eyesOpenMouthClosed'],
  eyesOpenMouthOpen: ['eyesOpenMouthHalf', 'eyesOpenMouthClosed'],
  eyesClosedMouthClosed: ['eyesOpenMouthClosed'],
  eyesClosedMouthHalf: ['eyesOpenMouthHalf', 'eyesClosedMouthClosed', 'eyesOpenMouthOpen', 'eyesOpenMouthClosed'],
  eyesClosedMouthOpen: ['eyesOpenMouthOpen', 'eyesClosedMouthClosed', 'eyesOpenMouthHalf', 'eyesOpenMouthClosed'],
};

/**
 * 用意された差分から6状態それぞれの供給元キーを決める。
 * eyesOpenMouthClosed(基本立ち絵)だけは必須。
 */
export function resolveFaceSources(available: readonly PuruPuruFaceKey[]): Record<PuruPuruFaceKey, PuruPuruFaceKey> {
  const set = new Set(available);
  if (!set.has('eyesOpenMouthClosed')) {
    throw new Error('eyesOpenMouthClosed(目開き・口閉じ)の画像は必須です。');
  }
  const resolved = {} as Record<PuruPuruFaceKey, PuruPuruFaceKey>;
  for (const key of PURUPURU_FACE_KEYS) {
    resolved[key] = set.has(key) ? key : (FACE_FALLBACKS[key].find((candidate) => set.has(candidate)) ?? 'eyesOpenMouthClosed');
  }
  return resolved;
}

export function buildPackManifest(): Record<string, unknown> {
  return {
    format: 'purupuru-avatar-package',
    formatVersion: 1,
    app: 'ai-vtuber mouth-picker',
    createdAt: new Date().toISOString(),
    settings: 'settings.json',
    avatar: { ...FACE_ASSET_PATHS },
  };
}

export function buildPackSettings(width: number, height: number): Record<string, unknown> {
  return {
    app: 'ai-vtuber mouth-picker',
    version: 1,
    avatarImageSize: { width, height },
    state: {},
  };
}

async function decodeSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** loaderの寸法同一チェックを通すため、髪レイヤーは本体と同寸法の完全透明PNGで埋める。 */
async function transparentPng(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.clearRect(0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('透明PNGを生成できませんでした。'))), 'image/png');
  });
}

export interface PuruPuruPackInput {
  /** 6状態のうち用意できた差分。eyesOpenMouthClosed は必須。 */
  faces: Partial<Record<PuruPuruFaceKey, Blob>>;
  /** 髪レイヤー(任意)。省略時は透明PNGで埋める。 */
  backHair?: Blob;
  frontHair?: Blob;
}

/** 差分画像から packageLoader が読める .purupuru(ZIP)Blob を組み立てる。ブラウザ専用。 */
export async function packPuruPuruPackage(input: PuruPuruPackInput): Promise<Blob> {
  if (typeof window === 'undefined') throw new Error('.purupuru packages can only be built in the browser.');
  const availableKeys = PURUPURU_FACE_KEYS.filter((key) => input.faces[key]);
  const sources = resolveFaceSources(availableKeys);

  const base = input.faces.eyesOpenMouthClosed;
  if (!base) throw new Error('eyesOpenMouthClosed(目開き・口閉じ)の画像は必須です。');
  const { width, height } = await decodeSize(base);
  for (const key of availableKeys) {
    const size = await decodeSize(input.faces[key]!);
    if (size.width !== width || size.height !== height) {
      throw new Error(`画像の寸法が揃っていません: ${key} は ${size.width}x${size.height}(基準は ${width}x${height})`);
    }
  }
  for (const [hairKey, blob] of [['backHair', input.backHair], ['frontHair', input.frontHair]] as const) {
    if (!blob) continue;
    const size = await decodeSize(blob);
    if (size.width !== width || size.height !== height) {
      throw new Error(`画像の寸法が揃っていません: ${hairKey} は ${size.width}x${size.height}(基準は ${width}x${height})`);
    }
  }

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(buildPackManifest(), null, 2));
  zip.file('settings.json', JSON.stringify(buildPackSettings(width, height), null, 2));
  const hairFallback = await transparentPng(width, height);
  zip.file(FACE_ASSET_PATHS.backHair, input.backHair ?? hairFallback);
  zip.file(FACE_ASSET_PATHS.frontHair, input.frontHair ?? hairFallback);
  for (const key of PURUPURU_FACE_KEYS) {
    zip.file(FACE_ASSET_PATHS[key], input.faces[sources[key]]!);
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.purupuru.avatar+zip' });
}
