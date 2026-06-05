import { json } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { resolveIrodoriRoot, resolveVoiceModel } from '$lib/server/irodoriModels';
import type { RequestHandler } from './$types';

type VoiceDesignerRequest = {
  characterName?: string;
  text?: string;
  caption?: string;
  model?: string;
  seed?: string | number;
  seconds?: string | number;
  steps?: string | number;
  memo?: string;
};

type VoiceLibraryEntry = {
  id: string;
  characterName: string;
  text: string;
  caption: string;
  seed: string | null;
  seconds: number;
  steps: number;
  fileName: string;
  audioUrl: string;
  createdAt: string;
  memo: string;
  checkpoint: string;
  generationTimeMs: number;
  modelReloaded: boolean;
};

function sanitizeText(value: string): string {
  return value.replace(/[\uD800-\uDFFF]/g, '\uFFFD').trim();
}

function safeFileName(value: string): string {
  const cleaned = sanitizeText(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  return cleaned || 'voice_design';
}

function parseRequiredNumber(value: string | number | undefined, field: string): number {
  const raw = typeof value === 'number' ? String(value) : sanitizeText(value ?? '');
  if (!raw) throw new Error(`${field} is required`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field} must be greater than 0`);
  return parsed;
}

function countSpeechCharacters(value: string): number {
  return Array.from(value.replace(/\s+/g, '')).length;
}

function estimateSecondsFromText(text: string): number {
  const characterCount = countSpeechCharacters(text);
  return Math.max(1, Math.ceil(characterCount / 15));
}

function resolveVoiceDesignSeconds(value: string | number | undefined, text: string): number {
  const estimatedSeconds = estimateSecondsFromText(text);
  const raw = typeof value === 'number' ? String(value) : sanitizeText(value ?? '');
  if (!raw || raw.toLowerCase() === 'auto') return estimatedSeconds;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('seconds must be greater than 0');

  return Math.max(parsed, estimatedSeconds);
}

function parsePositiveInteger(value: string | number | undefined, field: string): number {
  const parsed = parseRequiredNumber(value, field);
  if (!Number.isInteger(parsed)) throw new Error(`${field} must be an integer`);
  return parsed;
}

function parseOptionalInteger(value: string | number | undefined, field: string): string | null {
  const raw = typeof value === 'number' ? String(Math.trunc(value)) : sanitizeText(value ?? '');
  if (!raw) return null;
  if (!/^-?\d+$/.test(raw)) throw new Error(`${field} must be an integer`);
  return raw;
}

function resolveIrodoriPython(irodoriRoot: string): string {
  const venvPython = path.join(irodoriRoot, '.venv', 'Scripts', 'python.exe');
  if (!existsSync(venvPython)) {
    throw new Error(`Irodori python not found: ${venvPython}`);
  }
  return venvPython;
}

function voiceLibraryPaths(root: string) {
  const outputDir = path.join(root, 'static', 'voice_library');
  return {
    outputDir,
    indexPath: path.join(outputDir, 'index.json'),
  };
}

async function readVoiceLibrary(indexPath: string): Promise<VoiceLibraryEntry[]> {
  try {
    const raw = await readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as VoiceLibraryEntry[]) : [];
  } catch {
    return [];
  }
}

async function registerVoiceLibraryEntry(indexPath: string, entry: VoiceLibraryEntry) {
  const current = await readVoiceLibrary(indexPath);
  const next = [entry, ...current].slice(0, 300);
  await writeFile(indexPath, JSON.stringify(next, null, 2), 'utf8');
}

function runVoiceDesign(root: string, irodoriRoot: string, inputPath: string, outputPath: string): Promise<void> {
  const pythonExe = resolveIrodoriPython(irodoriRoot);
  const scriptPath = path.join(root, 'python', 'irodori_voice_design.py');

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExe, [scriptPath, inputPath, outputPath], {
      cwd: irodoriRoot,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8:replace',
        PYTHONUTF8: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    const outputs: string[] = [];
    const errors: string[] = [];

    child.stdout.on('data', (chunk: string) => outputs.push(chunk));
    child.stderr.on('data', (chunk: string) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stderr = errors.join('').trim();
      const stdout = outputs.join('').trim();
      reject(new Error(stderr || stdout || `Irodori VoiceDesign exited with code ${code}`));
    });
  });
}

function inferModelReloaded(current: VoiceLibraryEntry[], checkpoint: string): boolean {
  const latest = current[0];
  return !latest || latest.checkpoint !== checkpoint;
}

export const GET: RequestHandler = async () => {
  const paths = voiceLibraryPaths(process.cwd());
  const items = await readVoiceLibrary(paths.indexPath);
  return json({ items }, { headers: { 'Cache-Control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request }) => {
  let body: VoiceDesignerRequest;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let steps: number;
  let seed: string | null;
  const characterName = sanitizeText(body.characterName ?? '');
  const text = sanitizeText(body.text ?? '');
  const caption = sanitizeText(body.caption ?? '');
  const memo = sanitizeText(body.memo ?? '');

  if (!characterName) return json({ error: 'characterName is required' }, { status: 400 });
  if (!text) return json({ error: 'text is required' }, { status: 400 });
  if (!caption) return json({ error: 'caption is required' }, { status: 400 });

  let seconds: number;

  try {
    seconds = resolveVoiceDesignSeconds(body.seconds, text);
    steps = parsePositiveInteger(body.steps, 'steps');
    seed = parseOptionalInteger(body.seed, 'seed');
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'invalid parameters' }, { status: 400 });
  }

  const { env } = await import('$env/dynamic/private');
  const root = process.cwd();
  const irodoriRoot = resolveIrodoriRoot(env);
  const irodoriDesignUrl = env.IRODORI_DESIGN_URL || 'http://127.0.0.1:7861';
  let checkpoint: string;

  try {
    checkpoint = resolveVoiceModel(env, 'kizuna-voice-designer', body.model);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'invalid model' }, { status: 400 });
  }
  const paths = voiceLibraryPaths(root);
  const tmpDir = path.join(root, '.tmp', 'voice-designer');
  const requestId = randomUUID();
  const inputPath = path.join(tmpDir, `${requestId}.json`);
  const fileName = `${safeFileName(characterName)}_${requestId}.wav`;
  const outputPath = path.join(paths.outputDir, fileName);

  try {
    await mkdir(tmpDir, { recursive: true });
    await mkdir(paths.outputDir, { recursive: true });
    await writeFile(
      inputPath,
      JSON.stringify(
        {
          irodoriRoot,
          irodoriDesignUrl,
          checkpoint,
          characterName,
          text,
          caption,
          seed,
          seconds,
          steps,
        },
        null,
        2,
      ),
      'utf8',
    );

    const existingEntries = await readVoiceLibrary(paths.indexPath);
    const modelReloaded = inferModelReloaded(existingEntries, checkpoint);
    const startedAt = Date.now();
    await runVoiceDesign(root, irodoriRoot, inputPath, outputPath);
    const generationTimeMs = Date.now() - startedAt;

    const outputStat = await stat(outputPath);
    if (outputStat.size === 0) throw new Error('empty wav output');

    const entry: VoiceLibraryEntry = {
      id: requestId,
      characterName,
      text,
      caption,
      seed,
      seconds,
      steps,
      fileName,
      audioUrl: `/voice_library/${fileName}`,
      createdAt: new Date().toISOString(),
      memo,
      checkpoint,
      generationTimeMs,
      modelReloaded,
    };
    await registerVoiceLibraryEntry(paths.indexPath, entry);

    return json(
      {
        audioUrl: entry.audioUrl,
        fileName,
        libraryEntry: entry,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[api/voice/designer] failed:', e);
    return json(
      {
        error: 'voice designer generation failed',
        detail: e instanceof Error ? e.message : 'unknown error',
      },
      { status: 502 },
    );
  } finally {
    await unlink(inputPath).catch(() => {});
  }
};
