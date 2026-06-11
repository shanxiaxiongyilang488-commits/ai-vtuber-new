import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface CharacterProfile {
  id: string;
  name: string;
  role: string;
  description: string;
  image: string;
  characterBible?: CharacterBible;
}

export interface CharacterBible {
  unitId: string;
  characters: CharacterBibleCharacter[];
}

export interface CharacterBibleCharacter {
  id: string;
  hairColor: string;
  ears: string;
  tail: string;
  appearance: string;
}

export interface CharacterRegistryEntry extends CharacterProfile {
  hasReference: boolean;
  hasSheet: boolean;
  directory: string;
}

export interface RegisterCharacterInput {
  id: string;
  name: string;
  role?: string;
  description?: string;
  referenceImageDataUrl?: string;
  sheetImageDataUrl?: string;
}

export interface UpdateCharacterInput {
  name?: string;
  role?: string;
  description?: string;
  characterBible?: CharacterBible;
}

export interface CharacterChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export interface CharacterMemory {
  personality: string[];
  speechStyle: string[];
  likes: string[];
  dislikes: string[];
  updatedAt: string;
}

const CHARACTER_ROOT = resolve(process.cwd(), 'data', 'characters');
const PROFILE_FILE = 'profile.json';
const REFERENCE_FILE = 'reference.png';
const SHEET_FILE = 'sheet.png';
const CHAT_FILE = 'chat.json';
const MEMORY_FILE = 'memory.json';

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

function referenceAssetPath(id: string): string {
  return `data/characters/${normalizeId(id)}/${REFERENCE_FILE}`;
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
    role: String(parsed.role ?? ''),
    description: String(parsed.description ?? ''),
    image: String(
      parsed.image
      ?? (existsSync(imagePath(normalizedId, REFERENCE_FILE)) ? referenceAssetPath(normalizedId) : ''),
    ),
    ...(parsed.characterBible ? { characterBible: parsed.characterBible } : {}),
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
    role: input.role?.trim() ?? '',
    description: input.description?.trim() ?? '',
    image: input.referenceImageDataUrl ? referenceAssetPath(id) : '',
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
  const next: CharacterProfile = {
    id: character.id,
    name: character.name,
    role: character.role,
    description: character.description,
    image: referenceAssetPath(character.id),
    ...(character.characterBible ? { characterBible: character.characterBible } : {}),
  };
  writeFileSync(profilePath(character.id), JSON.stringify(next, null, 2), 'utf-8');
  return toEntry(next);
}

export function updateCharacter(id: string, input: UpdateCharacterInput): CharacterRegistryEntry {
  const profile = readProfile(id);
  if (!profile) throw new Error('character not found');
  const next: CharacterProfile = {
    ...profile,
    ...(typeof input.name === 'string' ? { name: input.name.trim() || profile.name } : {}),
    ...(typeof input.role === 'string' ? { role: input.role.trim() } : {}),
    ...(typeof input.description === 'string' ? { description: input.description.trim() } : {}),
    ...(input.characterBible ? { characterBible: input.characterBible } : {}),
  };
  writeFileSync(profilePath(profile.id), JSON.stringify(next, null, 2), 'utf-8');
  return toEntry(next);
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

function chatPath(id: string): string {
  return join(characterDir(id), CHAT_FILE);
}

function memoryPath(id: string): string {
  return join(characterDir(id), MEMORY_FILE);
}

export function getCharacterChat(id: string): CharacterChatMessage[] {
  if (!getCharacter(id)) throw new Error('character not found');
  const file = chatPath(id);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): CharacterChatMessage[] => {
      if (!entry || typeof entry !== 'object') return [];
      const value = entry as Partial<CharacterChatMessage>;
      if (
        typeof value.id !== 'string'
        || (value.role !== 'user' && value.role !== 'assistant')
        || typeof value.text !== 'string'
        || typeof value.createdAt !== 'string'
      ) return [];
      return [{
        id: value.id,
        role: value.role,
        text: value.text,
        createdAt: value.createdAt,
      }];
    });
  } catch {
    return [];
  }
}

export function appendCharacterChat(
  id: string,
  input: Pick<CharacterChatMessage, 'role' | 'text'>,
): CharacterChatMessage[] {
  const messages = getCharacterChat(id);
  const message: CharacterChatMessage = {
    id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: input.role,
    text: input.text.trim(),
    createdAt: new Date().toISOString(),
  };
  const next = [...messages, message].slice(-200);
  writeFileSync(chatPath(id), JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

export function clearCharacterChat(id: string): void {
  if (!getCharacter(id)) throw new Error('character not found');
  writeFileSync(chatPath(id), '[]', 'utf-8');
}

function normalizeMemoryList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(String).map((item) => item.trim()).filter(Boolean)));
}

export function getCharacterMemory(id: string): CharacterMemory {
  if (!getCharacter(id)) throw new Error('character not found');
  const file = memoryPath(id);
  if (!existsSync(file)) {
    return { personality: [], speechStyle: [], likes: [], dislikes: [], updatedAt: '' };
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<CharacterMemory>;
    return {
      personality: normalizeMemoryList(parsed.personality),
      speechStyle: normalizeMemoryList(parsed.speechStyle),
      likes: normalizeMemoryList(parsed.likes),
      dislikes: normalizeMemoryList(parsed.dislikes),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return { personality: [], speechStyle: [], likes: [], dislikes: [], updatedAt: '' };
  }
}

export function saveCharacterMemory(
  id: string,
  input: Omit<CharacterMemory, 'updatedAt'>,
): CharacterMemory {
  if (!getCharacter(id)) throw new Error('character not found');
  const memory: CharacterMemory = {
    personality: normalizeMemoryList(input.personality),
    speechStyle: normalizeMemoryList(input.speechStyle),
    likes: normalizeMemoryList(input.likes),
    dislikes: normalizeMemoryList(input.dislikes),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(memoryPath(id), JSON.stringify(memory, null, 2), 'utf-8');
  return memory;
}
