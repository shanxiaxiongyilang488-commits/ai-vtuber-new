import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

export type BrainStatus = 'Healthy' | 'Warning' | 'Corrupted';

export type BrainBackupInfo = {
  filename: string;
  createdAt: string;
  size: number;
};

export type BrainHealth = {
  brain: string;
  records: number;
  currentFile: string;
  backupCount: number;
  lastBackup: BrainBackupInfo | null;
  status: BrainStatus;
  message?: string;
};

const DATA_ROOT = resolve(process.cwd(), 'data');
const BACKUP_DIR = resolve(DATA_ROOT, 'backup');
const DEFAULT_BRAIN_FILE = resolve(DATA_ROOT, 'character-memory.json');
const TEST_BRAIN_FILE = resolve(DATA_ROOT, 'character-memory-test.json');

function insideDataRoot(file: string): boolean {
  return file === DATA_ROOT || file.startsWith(`${DATA_ROOT}\\`) || file.startsWith(`${DATA_ROOT}/`);
}

export function resolveCharacterBrainFile(): string {
  const configured = process.env.CHARACTER_MEMORY_STORE_FILE?.trim();
  if (!configured) return DEFAULT_BRAIN_FILE;

  const candidate = /^[a-z]:[\\/]/i.test(configured) || configured.includes('/') || configured.includes('\\')
    ? resolve(process.cwd(), configured)
    : resolve(DATA_ROOT, configured);

  if (!insideDataRoot(candidate)) {
    throw new Error('CHARACTER_MEMORY_STORE_FILE must resolve inside the data directory');
  }
  return candidate;
}

export function testBrainFile(): string {
  return TEST_BRAIN_FILE;
}

function timestampForFile(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function validateBrainObject(value: unknown): { ok: true; records: number } | { ok: false; message: string } {
  if (!value || typeof value !== 'object') return { ok: false, message: 'Brain JSON root must be an object' };
  const root = value as { version?: unknown; characters?: unknown };
  if (root.version !== 1) return { ok: false, message: 'Brain version must be 1' };
  if (!root.characters || typeof root.characters !== 'object' || Array.isArray(root.characters)) {
    return { ok: false, message: 'Brain characters must be an object' };
  }

  let records = 0;
  for (const [id, raw] of Object.entries(root.characters as Record<string, unknown>)) {
    if (!id.trim()) return { ok: false, message: 'Brain character id is empty' };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, message: `Brain character ${id} must be an object` };
    }
    const character = raw as { id?: unknown; reviewMemory?: unknown; memoryV2?: unknown; messages?: unknown };
    if (typeof character.id !== 'string' || !character.id.trim()) {
      return { ok: false, message: `Brain character ${id} is missing id` };
    }
    records += 1;
    if (Array.isArray(character.reviewMemory)) records += character.reviewMemory.length;
    if (character.memoryV2 && typeof character.memoryV2 === 'object') {
      const memoryV2 = character.memoryV2 as { longTermMemory?: unknown; shortTermMemory?: unknown };
      if (Array.isArray(memoryV2.longTermMemory)) records += memoryV2.longTermMemory.length;
      if (Array.isArray(memoryV2.shortTermMemory)) records += memoryV2.shortTermMemory.length;
    }
    if (Array.isArray(character.messages)) records += character.messages.length;
  }
  return { ok: true, records };
}

export function validateBrainJsonText(text: string): { ok: true; records: number } | { ok: false; message: string } {
  try {
    return validateBrainObject(JSON.parse(text));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export function listBrainBackups(): BrainBackupInfo[] {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((filename) => /^\d{8}-\d{6}(?:-\d+)?-character-memory\.json$/u.test(filename))
    .map((filename) => {
      const file = join(BACKUP_DIR, filename);
      const stat = statSync(file);
      return { filename, createdAt: stat.mtime.toISOString(), size: stat.size };
    })
    .sort((a, b) => b.filename.localeCompare(a.filename));
}

function backupCurrentBrain(file: string): BrainBackupInfo | null {
  if (!existsSync(file)) return null;
  mkdirSync(BACKUP_DIR, { recursive: true });
  let filename = `${timestampForFile()}-character-memory.json`;
  let target = join(BACKUP_DIR, filename);
  let suffix = 1;
  while (existsSync(target)) {
    filename = `${timestampForFile()}-${suffix}-character-memory.json`;
    target = join(BACKUP_DIR, filename);
    suffix += 1;
  }
  copyFileSync(file, target);
  const stat = statSync(target);
  return { filename, createdAt: stat.mtime.toISOString(), size: stat.size };
}

export function writeBrainTransaction(file: string, store: unknown): void {
  if (!insideDataRoot(resolve(file))) throw new Error('Brain file must be inside the data directory');
  const payload = `${JSON.stringify(store, null, 2)}\n`;
  const validation = validateBrainJsonText(payload);
  if (!validation.ok) throw new Error(`Brain validation failed before write: ${validation.message}`);

  mkdirSync(dirname(file), { recursive: true });
  backupCurrentBrain(file);

  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempFile, payload, 'utf-8');
    const writtenValidation = validateBrainJsonText(readFileSync(tempFile, 'utf-8'));
    if (!writtenValidation.ok) throw new Error(`Brain validation failed after temp write: ${writtenValidation.message}`);
    renameSync(tempFile, file);
  } catch (error) {
    if (existsSync(tempFile)) unlinkSync(tempFile);
    throw error;
  }
}

export function readBrainHealth(file = resolveCharacterBrainFile()): BrainHealth {
  const backups = listBrainBackups();
  const currentFile = relative(process.cwd(), file) || basename(file);
  if (!existsSync(file)) {
    return {
      brain: basename(file),
      records: 0,
      currentFile,
      backupCount: backups.length,
      lastBackup: backups[0] ?? null,
      status: 'Warning',
      message: 'Brain file is missing',
    };
  }
  const text = readFileSync(file, 'utf-8');
  const validation = validateBrainJsonText(text);
  return {
    brain: basename(file),
    records: validation.ok ? validation.records : 0,
    currentFile,
    backupCount: backups.length,
    lastBackup: backups[0] ?? null,
    status: validation.ok ? 'Healthy' : 'Corrupted',
    ...(validation.ok ? {} : { message: validation.message }),
  };
}

export function restoreBrainFromBackup(filename: string, file = resolveCharacterBrainFile()): BrainHealth {
  if (!/^\d{8}-\d{6}(?:-\d+)?-character-memory\.json$/u.test(filename)) {
    throw new Error('invalid backup filename');
  }
  const backupFile = resolve(BACKUP_DIR, filename);
  if (!insideDataRoot(backupFile) || dirname(backupFile) !== BACKUP_DIR || !existsSync(backupFile)) {
    throw new Error('backup not found');
  }
  const backupText = readFileSync(backupFile, 'utf-8');
  const validation = validateBrainJsonText(backupText);
  if (!validation.ok) throw new Error(`backup is corrupted: ${validation.message}`);

  mkdirSync(dirname(file), { recursive: true });
  backupCurrentBrain(file);

  const tempFile = `${file}.${process.pid}.${Date.now()}.restore.tmp`;
  try {
    writeFileSync(tempFile, backupText.endsWith('\n') ? backupText : `${backupText}\n`, 'utf-8');
    const writtenValidation = validateBrainJsonText(readFileSync(tempFile, 'utf-8'));
    if (!writtenValidation.ok) throw new Error(`restored brain validation failed: ${writtenValidation.message}`);
    renameSync(tempFile, file);
  } catch (error) {
    if (existsSync(tempFile)) unlinkSync(tempFile);
    throw error;
  }
  return readBrainHealth(file);
}
