/*
 * Runtime adapter for PuruPuru PNGTuber packages.
 * Package format and validation rules are based on
 * https://github.com/rotejin/PuruPuruPNGTuber (Apache-2.0, Copyright 2026 masa).
 */
import JSZip from 'jszip';
import { normalizeItemLayers } from './itemLayers';
import {
  PURUPURU_ASSET_KEYS,
  type PuruPuruAssetKey,
  type PuruPuruItemLayer,
  type PuruPuruManifest,
  type PuruPuruModel,
  type PuruPuruSettings,
} from './types';

const MAX_PACKAGE_BYTES = 80 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 120 * 1024 * 1024;
const MAX_ENTRIES = 256;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SETTINGS_BYTES = 8 * 1024 * 1024;

const DEFAULT_ASSETS: Record<PuruPuruAssetKey, string> = {
  backHair: 'avatar/back-hair.png',
  frontHair: 'avatar/front-hair.png',
  eyesOpenMouthClosed: 'avatar/eyes-open-mouth-closed.png',
  eyesOpenMouthHalf: 'avatar/eyes-open-mouth-half.png',
  eyesOpenMouthOpen: 'avatar/eyes-open-mouth-open.png',
  eyesClosedMouthClosed: 'avatar/eyes-closed-mouth-closed.png',
  eyesClosedMouthHalf: 'avatar/eyes-closed-mouth-half.png',
  eyesClosedMouthOpen: 'avatar/eyes-closed-mouth-open.png',
};

function safePath(value: unknown): string {
  const path = String(value ?? '').replaceAll('\\', '/');
  if (!path || path.startsWith('/') || path.includes('../') || path.includes('/..') || /^[a-z]:/i.test(path)) {
    throw new Error(`Unsafe path in .purupuru package: ${path || '(empty)'}`);
  }
  return path;
}

async function readJson<T>(zip: JSZip, path: string, maxBytes: number): Promise<T> {
  const entry = zip.file(safePath(path));
  if (!entry) throw new Error(`${path} is missing from the .purupuru package.`);
  const bytes = await entry.async('uint8array');
  if (bytes.byteLength > maxBytes) throw new Error(`${path} is too large.`);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function loadImage(blob: Blob, label: string, urls: string[]): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    urls.push(url);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not decode ${label}.`));
    image.src = url;
  });
}

export async function loadPuruPuruPackage(file: Blob, name = 'avatar.purupuru'): Promise<PuruPuruModel> {
  if (typeof window === 'undefined') throw new Error('.purupuru packages can only be loaded in the browser.');
  if (file.size > MAX_PACKAGE_BYTES) throw new Error('.purupuru package exceeds 80 MB.');

  const zip = await JSZip.loadAsync(file, { checkCRC32: true, createFolders: false });
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_ENTRIES) throw new Error('.purupuru package contains too many files.');
  for (const entry of entries) safePath(entry.name);

  const manifest = await readJson<PuruPuruManifest>(zip, 'manifest.json', MAX_MANIFEST_BYTES);
  if (manifest.format !== 'purupuru-avatar-package' || manifest.formatVersion !== 1) {
    throw new Error('Unsupported .purupuru package format.');
  }
  const settings = await readJson<PuruPuruSettings>(zip, manifest.settings ?? 'settings.json', MAX_SETTINGS_BYTES);

  const urls: string[] = [];
  const images = {} as Record<PuruPuruAssetKey, HTMLImageElement>;
  let unpackedBytes = 0;
  try {
    for (const key of PURUPURU_ASSET_KEYS) {
      const path = safePath(manifest.avatar?.[key] ?? DEFAULT_ASSETS[key]);
      const entry = zip.file(path);
      if (!entry) throw new Error(`Required avatar image is missing: ${path}`);
      const bytes = await entry.async('uint8array');
      unpackedBytes += bytes.byteLength;
      if (unpackedBytes > MAX_UNPACKED_BYTES) throw new Error('.purupuru package expands beyond 120 MB.');
      const pngBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      images[key] = await loadImage(new Blob([pngBuffer], { type: 'image/png' }), path, urls);
    }
    const width = images.eyesOpenMouthClosed.naturalWidth;
    const height = images.eyesOpenMouthClosed.naturalHeight;
    if (!width || !height) throw new Error('Avatar images have invalid dimensions.');
    for (const image of Object.values(images)) {
      if (image.naturalWidth !== width || image.naturalHeight !== height) {
        throw new Error('All avatar PNG files must have identical dimensions.');
      }
    }
    const items: PuruPuruItemLayer[] = [];
    for (const def of normalizeItemLayers(settings)) {
      const entry = zip.file(safePath(def.file));
      if (!entry) {
        console.warn('[PURUPURU_ITEM_MISSING]', def.file);
        continue;
      }
      const bytes = await entry.async('uint8array');
      unpackedBytes += bytes.byteLength;
      if (unpackedBytes > MAX_UNPACKED_BYTES) throw new Error('.purupuru package expands beyond 120 MB.');
      const pngBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      items.push({ ...def, image: await loadImage(new Blob([pngBuffer], { type: 'image/png' }), def.file, urls) });
    }
    return { name, manifest, settings, width, height, images, items, dispose: () => urls.forEach(URL.revokeObjectURL) };
  } catch (error) {
    urls.forEach(URL.revokeObjectURL);
    throw error;
  }
}
