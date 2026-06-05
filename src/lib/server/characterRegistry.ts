import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface CharacterProfile {
  id: string;
  name: string;
  description: string;
}

export interface CharacterRegistryEntry extends CharacterProfile {
  hasReference: boolean;
  hasSheet: boolean;
  directory: string;
}

export interface RegisterCharacterInput {
  id: string;
  name: string;
  description?: string;
  referenceImageDataUrl?: string;
  sheetImageDataUrl?: string;
}

const CHARACTER_ROOT = resolve(process.cwd(), 'data', 'characters');
const PROFILE_FILE = 'profile.json';
const REFERENCE_FILE = 'reference.png';
const SHEET_FILE = 'sheet.png';

function ensureRoot(): void {
  mkdirSync(CHARACTER_ROOT, { recursive: true });
}

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function assertValidId(id: string): void {
  if (!/^[a-z0-9_-]+$/.test(id)) {
    throw new Error('character id must contain only a-z, 0-9, underscore, or hyphen');
  }
}

function characterDir(id: string): string {
  const normalized = normalizeId(id);
  assertValidId(normalized);
  const dir = resolve(CHARACTER_ROOT, normalized);
  if (!dir.startsWith(`${CHARACTER_ROOT}`)) {
    throw new Error('invalid character directory');
  }
  return dir;
}

function profilePath(id: string): string {
  return join(characterDir(id), PROFILE_FILE);
}

function imagePath(id: string, fileName: typeof REFERENCE_FILE | typeof SHEET_FILE): string {
  return join(characterDir(id), fileName);
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) throw new Error('image must be a data URL');
  return Buffer.from(match[1], 'base64');
}

function pngBufferToDataUrl(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function readProfile(id: string): CharacterProfile | null {
  const file = profilePath(id);
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<CharacterProfile>;
  const normalizedId = normalizeId(String(parsed.id ?? id));
  return {
    id: normalizedId,
    name: String(parsed.name ?? normalizedId),
    description: String(parsed.description ?? ''),
  };
}

function toEntry(profile: CharacterProfile): CharacterRegistryEntry {
  return {
    ...profile,
    hasReference: existsSync(imagePath(profile.id, REFERENCE_FILE)),
    hasSheet: existsSync(imagePath(profile.id, SHEET_FILE)),
    directory: `data/characters/${profile.id}`,
  };
}

export function registerCharacter(input: RegisterCharacterInput): CharacterRegistryEntry {
  ensureRoot();
  const id = normalizeId(input.id);
  assertValidId(id);
  const dir = characterDir(id);
  mkdirSync(dir, { recursive: true });

  const profile: CharacterProfile = {
    id,
    name: input.name.trim() || id,
    description: input.description?.trim() ?? '',
  };

  writeFileSync(profilePath(id), JSON.stringify(profile, null, 2), 'utf-8');
  if (input.referenceImageDataUrl) {
    writeFileSync(imagePath(id, REFERENCE_FILE), dataUrlToBuffer(input.referenceImageDataUrl));
  }
  if (input.sheetImageDataUrl) {
    writeFileSync(imagePath(id, SHEET_FILE), dataUrlToBuffer(input.sheetImageDataUrl));
  }

  return toEntry(profile);
}

export function saveCharacterReferenceImage(id: string, imageDataUrl: string): CharacterRegistryEntry {
  const character = getCharacter(id);
  if (!character) throw new Error('character not found');
  writeFileSync(imagePath(character.id, REFERENCE_FILE), dataUrlToBuffer(imageDataUrl));
  return toEntry(character);
}

export function getCharacterReferenceDataUrl(id: string): string | null {
  const character = getCharacter(id);
  if (!character?.hasReference) return null;
  return pngBufferToDataUrl(readFileSync(imagePath(character.id, REFERENCE_FILE)));
}

export function listCharacters(): CharacterRegistryEntry[] {
  ensureRoot();
  return readdirSync(CHARACTER_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readProfile(entry.name))
    .filter((profile): profile is CharacterProfile => Boolean(profile))
    .map(toEntry)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getCharacter(id: string): CharacterRegistryEntry | null {
  const profile = readProfile(id);
  return profile ? toEntry(profile) : null;
}

export function searchCharacters(query: string): CharacterRegistryEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return listCharacters();
  return listCharacters().filter((character) => {
    const haystack = `${character.id} ${character.name} ${character.description}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export function deleteCharacter(id: string): boolean {
  const dir = characterDir(id);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

export function characterAssetPath(id: string, asset: 'reference' | 'sheet'): string {
  return imagePath(id, asset === 'reference' ? REFERENCE_FILE : SHEET_FILE);
}
