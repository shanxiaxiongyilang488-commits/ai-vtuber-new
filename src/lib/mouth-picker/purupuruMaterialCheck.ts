export const PURUPURU_MATERIAL_SUFFIXES = [
  'eye_open_mouth_closed.png',
  'eye_open_mouth_half.png',
  'eye_open_mouth_open.png',
  'eye_closed_mouth_closed.png',
  'eye_closed_mouth_half.png',
  'eye_closed_mouth_open.png',
] as const;

export function purupuruMaterialBaseUrl(characterId: string): string {
  return `/purupuru/${encodeURIComponent(characterId)}`;
}

export function purupuruMaterialFiles(characterId: string): string[] {
  return PURUPURU_MATERIAL_SUFFIXES.map((suffix) => `${characterId}_${suffix}`);
}

export const SHIRO_PURUPURU_BASE_URL = purupuruMaterialBaseUrl('shiro');

export const SHIRO_PURUPURU_FILES = [
  'shiro_eye_open_mouth_closed.png',
  'shiro_eye_open_mouth_half.png',
  'shiro_eye_open_mouth_open.png',
  'shiro_eye_closed_mouth_closed.png',
  'shiro_eye_closed_mouth_half.png',
  'shiro_eye_closed_mouth_open.png',
] as const;

export type ShiroPuruPuruFilename = (typeof SHIRO_PURUPURU_FILES)[number];

export interface PuruPuruMaterialFileCheck {
  filename: string;
  exists: boolean;
  width: number | null;
  height: number | null;
  hasTransparency: boolean | null;
  error?: string;
}

export interface PuruPuruMaterialSummary {
  allPresent: boolean;
  presentCount: number;
  sizeMatch: boolean;
  allHaveTransparency: boolean;
  referenceSize: { width: number; height: number } | null;
}

export function summarizePuruPuruMaterials(
  files: readonly PuruPuruMaterialFileCheck[],
): PuruPuruMaterialSummary {
  const present = files.filter((file) => file.exists);
  const allPresent = files.length === PURUPURU_MATERIAL_SUFFIXES.length && present.length === PURUPURU_MATERIAL_SUFFIXES.length;
  const reference = present.find((file) => file.width !== null && file.height !== null);
  const referenceSize = reference && reference.width !== null && reference.height !== null
    ? { width: reference.width, height: reference.height }
    : null;
  const sizeMatch =
    allPresent &&
    referenceSize !== null &&
    files.every((file) => file.width === referenceSize.width && file.height === referenceSize.height);
  const allHaveTransparency = allPresent && files.every((file) => file.hasTransparency === true);

  return {
    allPresent,
    presentCount: present.length,
    sizeMatch,
    allHaveTransparency,
    referenceSize,
  };
}
