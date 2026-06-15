import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

export interface RefLibraryItem {
  id: string;
  name: string;
  fileName: string;
  createdAt: string;
}

export interface SaveRefInput {
  name?: string;
  imageDataUrl: string;
}

interface RefLibraryIndex {
  schemaVersion: number;
  items: RefLibraryItem[];
}

const PROJECT_ROOT = resolve(process.cwd(), 'data', 'project');
const REF_LIBRARY_ROOT = join(PROJECT_ROOT, 'ref-library');
const INDEX_FILE = join(REF_LIBRARY_ROOT, 'index.json');
const SCHEMA_VERSION = 1;

function ensureRoot(): void {
  mkdirSync(REF_LIBRARY_ROOT, { recursive: true });
}

function imagePath(fileName: string): string {
  const dir = resolve(REF_LIBRARY_ROOT, fileName);
  if (!dir.startsWith(`${REF_LIBRARY_ROOT}`)) {
    throw new Error('invalid ref-library path');
  }
  return dir;
}

function readIndex(): RefLibraryIndex {
  ensureRoot();
  if (!existsSync(INDEX_FILE)) {
    return { schemaVersion: SCHEMA_VERSION, items: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(INDEX_FILE, 'utf-8')) as Partial<RefLibraryIndex>;
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      schemaVersion: SCHEMA_VERSION,
      items: items.flatMap((entry): RefLibraryItem[] => {
        if (!entry || typeof entry !== 'object') return [];
        const value = entry as Partial<RefLibraryItem>;
        if (typeof value.id !== 'string' || typeof value.fileName !== 'string') return [];
        return [{
          id: value.id,
          name: typeof value.name === 'string' ? value.name : value.id,
          fileName: value.fileName,
          createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
        }];
      }),
    };
  } catch {
    return { schemaVersion: SCHEMA_VERSION, items: [] };
  }
}

function writeIndex(index: RefLibraryIndex): void {
  ensureRoot();
  writeFileSync(INDEX_FILE, JSON.stringify({ ...index, schemaVersion: SCHEMA_VERSION }, null, 2), 'utf-8');
}

function generateId(): string {
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) throw new Error('image must be a data URL');
  return Buffer.from(match[1], 'base64');
}

function pngBufferToDataUrl(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

export function listRefs(): RefLibraryItem[] {
  return readIndex().items
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getRef(id: string): RefLibraryItem | null {
  return readIndex().items.find((item) => item.id === id) ?? null;
}

export function getRefImageDataUrl(id: string): string | null {
  const item = getRef(id);
  if (!item) return null;
  const file = imagePath(item.fileName);
  if (!existsSync(file)) return null;
  return pngBufferToDataUrl(readFileSync(file));
}

export function saveRef(input: SaveRefInput): RefLibraryItem {
  const id = generateId();
  const fileName = `${id}.png`;
  const buffer = dataUrlToBuffer(input.imageDataUrl);
  writeFileSync(imagePath(fileName), buffer);
  const item: RefLibraryItem = {
    id,
    name: input.name?.trim() || id,
    fileName,
    createdAt: new Date().toISOString(),
  };
  const index = readIndex();
  index.items.push(item);
  writeIndex(index);
  return item;
}

export function renameRef(id: string, name: string): RefLibraryItem {
  const index = readIndex();
  const item = index.items.find((entry) => entry.id === id);
  if (!item) throw new Error('ref not found');
  item.name = name.trim() || item.id;
  writeIndex(index);
  return item;
}

export function deleteRef(id: string): boolean {
  const index = readIndex();
  const item = index.items.find((entry) => entry.id === id);
  if (!item) return false;
  rmSync(imagePath(item.fileName), { force: true });
  index.items = index.items.filter((entry) => entry.id !== id);
  writeIndex(index);
  return true;
}
