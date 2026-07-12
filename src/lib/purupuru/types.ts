import type { PuruPuruItemLayerDef } from './itemLayers';

export const PURUPURU_ASSET_KEYS = [
  'backHair',
  'frontHair',
  'eyesOpenMouthClosed',
  'eyesOpenMouthHalf',
  'eyesOpenMouthOpen',
  'eyesClosedMouthClosed',
  'eyesClosedMouthHalf',
  'eyesClosedMouthOpen',
] as const;

export type PuruPuruAssetKey = (typeof PURUPURU_ASSET_KEYS)[number];

export interface PuruPuruManifest {
  format: 'purupuru-avatar-package';
  formatVersion: number;
  settings?: string;
  avatar?: Partial<Record<PuruPuruAssetKey, string>>;
}

export interface PuruPuruSettings {
  app?: string;
  type?: string;
  version?: number;
  avatarImageSize?: { width: number; height: number };
  state?: Record<string, unknown>;
  itemLayers?: unknown;
  [key: string]: unknown;
}

export interface PuruPuruItemLayer extends PuruPuruItemLayerDef {
  image: HTMLImageElement;
}

export interface PuruPuruModel {
  name: string;
  manifest: PuruPuruManifest;
  settings: PuruPuruSettings;
  width: number;
  height: number;
  images: Record<PuruPuruAssetKey, HTMLImageElement>;
  items: PuruPuruItemLayer[];
  dispose(): void;
}
