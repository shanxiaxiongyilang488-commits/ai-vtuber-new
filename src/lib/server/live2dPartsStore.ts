import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInitialLive2DParts, type Live2DPartsData, type Live2DPartState } from '$lib/live2dParts';

const CHARACTER_ASSET_ROOT = resolve(process.cwd(), 'data', 'project', 'character-assets');
const PARTS_FILE = 'parts.json';
const PART_ASSETS_DIR = 'parts';

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function assertValidId(id: string): void {
  if (!/^[a-z0-9_-]+$/.test(id)) {
    throw new Error('character id must contain only a-z, 0-9, underscore, or hyphen');
  }
}

function live2dDir(id: string): string {
  const normalized = normalizeId(id);
  assertValidId(normalized);
  const dir = resolve(CHARACTER_ASSET_ROOT, normalized, 'live2d');
  if (!dir.startsWith(CHARACTER_ASSET_ROOT)) {
    throw new Error('invalid live2d directory');
  }
  return dir;
}

function partsPath(id: string): string {
  return join(live2dDir(id), PARTS_FILE);
}

function partAssetsDir(id: string): string {
  return join(live2dDir(id), PART_ASSETS_DIR);
}

function safePartFileName(value: string): string {
  const safe = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${safe || 'part'}.png`;
}

function dataUrlToPngBuffer(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/i);
  if (!match) throw new Error('asset image must be a PNG data URL');
  return Buffer.from(match[1], 'base64');
}

function normalizePartState(value: unknown): Live2DPartState {
  if (!value || typeof value !== 'object') return { detected: false };
  const record = value as Record<string, unknown>;
  const bbox = record.bbox && typeof record.bbox === 'object'
    ? record.bbox as Record<string, unknown>
    : null;
  const hasValidBbox = bbox
    && typeof bbox.x === 'number'
    && typeof bbox.y === 'number'
    && typeof bbox.w === 'number'
    && typeof bbox.h === 'number'
    && bbox.w > 0
    && bbox.h > 0;
  const status: Live2DPartState['status'] = record.status === 'ready' || record.status === 'candidate' || record.status === 'missing'
    ? record.status
    : undefined;
  return {
    detected: Boolean(record.detected),
    ...(status ? { status } : {}),
    ...(hasValidBbox ? { bbox: { x: bbox.x as number, y: bbox.y as number, w: bbox.w as number, h: bbox.h as number } } : {}),
    ...(typeof record.assetPath === 'string' && record.assetPath.trim() ? { assetPath: record.assetPath.trim() } : {}),
    ...(typeof record.note === 'string' ? { note: record.note } : {}),
  };
}

function normalizePartsData(id: string, value: unknown): Live2DPartsData {
  const fallback = createInitialLive2DParts(id);
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Partial<Live2DPartsData>;
  const parts = record.parts ?? fallback.parts;
  const accessories = parts.accessories;
  const accessoryItemStates = accessories?.itemStates && typeof accessories.itemStates === 'object'
    ? Object.fromEntries(
      Object.entries(accessories.itemStates)
        .filter(([key]) => key.trim())
        .map(([key, state]) => [key, normalizePartState(state)]),
    )
    : undefined;
  return {
    character: { id: normalizeId(id) },
    ...(record.sourceImage ? { sourceImage: record.sourceImage } : {}),
    analyzedAt: typeof record.analyzedAt === 'string' ? record.analyzedAt : fallback.analyzedAt,
    parts: {
      face: normalizePartState(parts.face),
      hair: {
        front: normalizePartState(parts.hair?.front),
        side: normalizePartState(parts.hair?.side),
        back: normalizePartState(parts.hair?.back),
      },
      eyes: {
        left: normalizePartState(parts.eyes?.left),
        right: normalizePartState(parts.eyes?.right),
      },
      mouth: {
        closed: normalizePartState(parts.mouth?.closed),
        open: normalizePartState(parts.mouth?.open),
      },
      eyebrows: {
        left: normalizePartState(parts.eyebrows?.left),
        right: normalizePartState(parts.eyebrows?.right),
      },
      body: normalizePartState(parts.body),
      accessories: {
        detected: Boolean(accessories?.detected),
        items: Array.isArray(accessories?.items)
          ? accessories.items.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
          : [],
        ...(accessoryItemStates ? { itemStates: accessoryItemStates } : {}),
      },
    },
  };
}

export function getLive2DParts(id: string): Live2DPartsData | null {
  const file = partsPath(id);
  if (!existsSync(file)) return null;
  return normalizePartsData(id, JSON.parse(readFileSync(file, 'utf-8')));
}

export function analyzeLive2DParts(
  id: string,
  sourceImage?: Live2DPartsData['sourceImage'],
): Live2DPartsData {
  const parts = createInitialLive2DParts(normalizeId(id));
  if (sourceImage) parts.sourceImage = sourceImage;
  return saveLive2DParts(id, parts);
}

export function saveLive2DParts(id: string, parts: Live2DPartsData): Live2DPartsData {
  const normalized = normalizePartsData(id, parts);
  mkdirSync(live2dDir(id), { recursive: true });
  writeFileSync(partsPath(id), JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}

export function saveLive2DPartAssets(
  id: string,
  crops: Array<{ fileName: string; dataUrl: string }>,
): Record<string, string> {
  mkdirSync(partAssetsDir(id), { recursive: true });
  const saved: Record<string, string> = {};
  for (const crop of crops) {
    const fileName = safePartFileName(crop.fileName);
    writeFileSync(join(partAssetsDir(id), fileName), dataUrlToPngBuffer(crop.dataUrl));
    saved[crop.fileName] = `data/project/character-assets/${normalizeId(id)}/live2d/${PART_ASSETS_DIR}/${fileName}`;
  }
  return saved;
}
