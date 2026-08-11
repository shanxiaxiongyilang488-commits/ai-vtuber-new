import { json } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getCharacter, updateCharacterVoice, type CharacterVoiceConfig } from '$lib/server/characterRegistry';
import { resolveVoiceBridgeUrl } from '$lib/server/voiceBridge';
import { resolveVoiceBridgeVdcRoot } from '$lib/server/voiceBridgeProcess';
import type { RequestHandler } from './$types';

/**
 * キャラクターへの voice 設定反映 (VOICE LAB の「採用」)。
 * PUT body:
 *   voice: CharacterVoiceConfig — profile.json に書き込む設定
 *   keptVoice?: { sourceAudioUrl, text, name } — design 候補を clone 用の
 *     kept voice として VDC (output/voice_design/<name>.wav + .txt) に登録する。
 *     登録後は voice.model=<name> / mode=clone で bridge から高速合成できる。
 */

type KeptVoiceRequest = {
  sourceAudioUrl?: string;
  text?: string;
  name?: string;
};

type VoiceUpdateRequest = {
  voice?: Partial<CharacterVoiceConfig> | null;
  keptVoice?: KeptVoiceRequest;
};

function safeKeptVoiceName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function parseVoiceConfig(input: Partial<CharacterVoiceConfig>): CharacterVoiceConfig {
  const engine = String(input.engine ?? 'irodori').trim() || 'irodori';
  const mode = input.mode;
  if (mode !== 'lora' && mode !== 'clone' && mode !== 'design') {
    throw new Error('voice.mode must be lora / clone / design');
  }
  const model = String(input.model ?? '').trim();
  if ((mode === 'lora' || mode === 'clone') && !model) {
    throw new Error(`voice.model is required for ${mode} mode`);
  }
  const caption = String(input.caption ?? '').trim();
  if (mode === 'design' && !caption) {
    throw new Error('voice.caption is required for design mode');
  }
  const speed = typeof input.speed === 'number' && Number.isFinite(input.speed) ? input.speed : undefined;

  return {
    engine,
    mode,
    model,
    ...(caption ? { caption } : {}),
    ...(speed !== undefined ? { speed } : {}),
    ...(typeof input.autoSpeak === 'boolean' ? { autoSpeak: input.autoSpeak } : {}),
  };
}

async function resolveVdcRoot(env: Record<string, string | undefined>): Promise<string | null> {
  // Adopting an already-generated WAV is only a local file copy. Resolve the
  // configured/default VDC workspace directly so adoption still works after
  // the managed Voice Bridge has shut down to release memory.
  const localRoot = resolveVoiceBridgeVdcRoot(env);
  if (localRoot) return localRoot;

  try {
    const bridgeUrl = resolveVoiceBridgeUrl(env);
    const res = await fetch(`${bridgeUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const health = (await res.json()) as { vdc_root?: string };
    const fromHealth = health.vdc_root?.trim();
    if (fromHealth && existsSync(fromHealth)) return fromHealth;
  } catch {
    // bridge 停止中は kept voice 登録不可
  }
  return null;
}

function resolveLocalVoiceSource(characterId: string, sourceAudioUrl: string): string {
  const cleanUrl = sourceAudioUrl.split('?')[0];
  if (cleanUrl.startsWith('/voice_library/')) {
    let fileName = path.basename(cleanUrl);
    try {
      fileName = decodeURIComponent(fileName);
    } catch {
      throw new Error('keptVoice.sourceAudioUrl is invalid');
    }
    if (!fileName.toLowerCase().endsWith('.wav')) throw new Error('kept voice source must be a wav file');
    return path.join(process.cwd(), 'static', 'voice_library', fileName);
  }

  const parts = cleanUrl.split('/').filter(Boolean);
  if (parts.length === 3 && parts[0] === 'voice-output') {
    let sourceCharacterId = '';
    let fileName = '';
    try {
      sourceCharacterId = decodeURIComponent(parts[1]);
      fileName = decodeURIComponent(parts[2]);
    } catch {
      throw new Error('keptVoice.sourceAudioUrl is invalid');
    }
    if (sourceCharacterId !== characterId || path.basename(fileName) !== fileName || !fileName.toLowerCase().endsWith('.wav')) {
      throw new Error('keptVoice.sourceAudioUrl must belong to the selected character');
    }
    const outputRoot = path.resolve(process.cwd(), 'static', 'voice-output', characterId);
    const resolved = path.resolve(outputRoot, fileName);
    if (!resolved.startsWith(`${outputRoot}${path.sep}`)) throw new Error('keptVoice.sourceAudioUrl is outside the voice output directory');
    return resolved;
  }

  throw new Error('keptVoice.sourceAudioUrl must be a local voice candidate path');
}

async function registerKeptVoice(input: KeptVoiceRequest, characterId: string): Promise<string> {
  const sourceAudioUrl = input.sourceAudioUrl?.trim() ?? '';
  const text = input.text?.trim() ?? '';
  const name = safeKeptVoiceName(input.name?.trim() ?? '');

  if (!name) throw new Error('keptVoice.name is required');
  if (!text) throw new Error('keptVoice.text is required');
  const sourceWav = resolveLocalVoiceSource(characterId, sourceAudioUrl);
  if (!existsSync(sourceWav)) throw new Error(`source wav not found: ${path.basename(sourceWav)}`);

  const { env } = await import('$env/dynamic/private');
  const vdcRoot = await resolveVdcRoot(env);
  if (!vdcRoot) {
    throw new Error('Voice-Design-Cloner root not found (set VDC_ROOT or start the voice bridge)');
  }

  const keptDir = path.join(vdcRoot, 'output', 'voice_design');
  await mkdir(keptDir, { recursive: true });
  await copyFile(sourceWav, path.join(keptDir, `${name}.wav`));
  await writeFile(path.join(keptDir, `${name}.txt`), text, 'utf8');
  return name;
}

export const GET: RequestHandler = async ({ params }) => {
  const id = params.id;
  if (!id) return json({ message: 'character id is required' }, { status: 400 });

  const character = getCharacter(id);
  if (!character) return json({ message: 'character not found' }, { status: 404 });

  return json(
    { voice: character.voice ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const id = params.id;
  if (!id) return json({ message: 'character id is required' }, { status: 400 });

  let body: VoiceUpdateRequest;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // voice: null は設定解除
    if (body.voice === null) {
      const character = updateCharacterVoice(id, null);
      return json({ character });
    }
    if (!body.voice || typeof body.voice !== 'object') {
      return json({ message: 'voice is required' }, { status: 400 });
    }

    const voice = parseVoiceConfig(body.voice);
    if (body.keptVoice) {
      voice.model = await registerKeptVoice(body.keptVoice, id);
      voice.mode = 'clone';
    }

    const character = updateCharacterVoice(id, voice);
    return json({ character }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'voice update failed';
    return json({ message }, { status: message === 'character not found' ? 404 : 400 });
  }
};
