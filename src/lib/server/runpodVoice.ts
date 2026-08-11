import type { CharacterVoiceConfig } from '$lib/server/characterRegistry';
import { stableCharacterVoiceSeed } from '$lib/server/characterVoiceDefaults';
import type { VoiceSynthesisResult } from '$lib/server/voiceBridge';
import { resolveVoiceBridgeVdcRoot } from '$lib/server/voiceBridgeProcess';
import { findOutputString, runRunpodInteractive, submitRunpodJob, type RunpodJobResponse } from '$lib/server/runpodClient';
import { resolveRunpodVoicePodUrl } from '$lib/server/runpodPod';
import { concatenateWavAudio } from '$lib/server/wavAudio';
import { splitSpeechText } from '$lib/speechText';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_REFERENCE_AUDIO_BYTES = 12 * 1024 * 1024;

type VoiceJobRunner = (
  credentials: { apiKey: string; endpointId: string },
  input: Record<string, unknown>,
) => Promise<RunpodJobResponse>;

const EXACT_SPEECH_DIRECTION = [
  'EXACT TEXT SPEECH — HIGHEST PRIORITY.',
  'Read only the supplied text exactly once as natural Japanese speech.',
  'Begin directly with its first spoken character and stop directly after its final spoken character.',
  'Use one clean, dry voice and add no sound or vocalization outside the supplied text.',
].join(' ');

export function buildSafeRunpodDesignCaption(caption: string | undefined): string {
  const voiceDesign = caption?.trim()
    || 'A clear, warm, natural Japanese character voice recorded dry and close.';
  return `${EXACT_SPEECH_DIRECTION}\n\nVOICE DESIGN: ${voiceDesign}`;
}

function safeVoiceName(value: string): string {
  const name = value.trim();
  if (!name || name === '.' || name === '..' || /[\\/:*?"<>|]/.test(name)) {
    throw new Error('RunPod clone voice has an invalid saved voice name.');
  }
  return name;
}

async function loadSavedVoiceReference(
  voice: CharacterVoiceConfig,
  runtimeEnv: Record<string, string | undefined>,
): Promise<{ referenceAudioBase64: string; referenceText?: string } | null> {
  if (voice.mode !== 'clone') return null;
  const vdcRoot = resolveVoiceBridgeVdcRoot(runtimeEnv);
  if (!vdcRoot) {
    throw new Error('RunPod clone voice requires the local Voice-Design-Cloner folder (VDC_ROOT).');
  }
  const voiceName = safeVoiceName(voice.model);
  const voiceRoot = path.join(vdcRoot, 'output', 'voice_design');
  const wav = await readFile(path.join(voiceRoot, `${voiceName}.wav`));
  if (!wav.length) throw new Error(`Saved base voice is empty: ${voiceName}`);
  if (wav.byteLength > MAX_REFERENCE_AUDIO_BYTES) {
    throw new Error(`Saved base voice exceeds ${MAX_REFERENCE_AUDIO_BYTES / 1024 / 1024} MB: ${voiceName}`);
  }
  let referenceText = '';
  try {
    referenceText = (await readFile(path.join(voiceRoot, `${voiceName}.txt`), 'utf8')).trim();
  } catch {
    // Irodori v4 can clone from the reference WAV alone.
  }
  return {
    referenceAudioBase64: wav.toString('base64'),
    ...(referenceText ? { referenceText } : {}),
  };
}

function numberFromOutput(output: unknown, keys: readonly string[]): number {
  if (!output || typeof output !== 'object') return 0;
  const record = output as Record<string, unknown>;
  for (const key of keys) {
    const parsed = Number(record[key]);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') {
      const nested = numberFromOutput(value, keys);
      if (nested) return nested;
    }
  }
  return 0;
}

function decodeAudioBase64(value: string): Uint8Array {
  const normalized = value.includes(',') && /^data:audio\//i.test(value)
    ? value.slice(value.indexOf(',') + 1)
    : value;
  const audio = Buffer.from(normalized, 'base64');
  if (!audio.length) throw new Error('RunPod voice worker returned empty base64 audio.');
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new Error('RunPod voice audio exceeded 100 MB.');
  return new Uint8Array(audio);
}

async function downloadAudio(url: string): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('RunPod voice worker returned an unsupported audio URL.');
  }
  const response = await fetch(parsed, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5 * 60_000),
  });
  if (!response.ok) throw new Error(`RunPod audio download failed: HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') ?? '0');
  if (length > MAX_AUDIO_BYTES) throw new Error('RunPod voice audio exceeded 100 MB.');
  const audio = new Uint8Array(await response.arrayBuffer());
  if (!audio.length) throw new Error('RunPod voice worker returned empty audio.');
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new Error('RunPod voice audio exceeded 100 MB.');
  return audio;
}

export async function synthesizeRunpodSpeech(
  credentials: { apiKey: string; endpointId: string },
  characterId: string,
  voice: CharacterVoiceConfig,
  text: string,
  runtimeEnv: Record<string, string | undefined> = process.env,
  designVariant = '',
  modelCheckpoint = '',
  deliveryOverride = false,
  runVoiceJob: VoiceJobRunner = runRunpodInteractive,
): Promise<VoiceSynthesisResult> {
  if (voice.mode === 'lora') {
    throw new Error('RunPod voice does not yet support local LoRA adapters. Use a saved clone voice or design mode.');
  }
  const savedReference = await loadSavedVoiceReference(voice, runtimeEnv);
  // Irodori's worker deliberately caps a single generation at 30 seconds.
  // Generate model-safe sentence groups and join their WAV data so a long chat
  // remains one replayable message and is never silently cut off.
  // 60 Japanese code points leaves comfortable room below the worker's
  // 30-second cap even for slower, expressive delivery.
  const chunks = splitSpeechText(text, 60);
  const designSeed = voice.mode === 'design'
    ? stableCharacterVoiceSeed(characterId, `${voice.model}\0${voice.caption ?? ''}\0${designVariant}`)
    : undefined;
  const requestCaption = voice.mode === 'design'
    ? buildSafeRunpodDesignCaption(voice.caption)
    : voice.caption ?? null;
  const results: VoiceSynthesisResult[] = [];
  let continuationReference = savedReference;
  for (const [chunkIndex, chunk] of chunks.entries()) {
    // Design mode can reinterpret the speaker for every independent request.
    // Lock all later chunks to the first generated chunk so one long message
    // keeps a single speaker identity from beginning to end.
    const continueAsClone = voice.mode === 'design' && chunkIndex > 0 && Boolean(continuationReference);
    const job = await runVoiceJob(credentials, {
      task: 'voice.speak',
      engine: 'irodori-v4',
      ...(modelCheckpoint ? { modelCheckpoint } : {}),
      ...(deliveryOverride ? { deliveryOverride: true } : {}),
      characterId,
      text: chunk,
      voice: {
        mode: continueAsClone ? 'clone' : voice.mode,
        model: voice.model,
        caption: requestCaption,
        speed: voice.speed ?? 1,
        pitchShiftSemitones: voice.pitchShiftSemitones ?? 0,
      },
      ...(designSeed !== undefined ? { seed: designSeed } : {}),
      ...(continuationReference ?? {}),
    });
    const audioBase64 = findOutputString(job.output, ['audio_base64', 'audioBase64']);
    const audioUrl = findOutputString(job.output, ['audio_url', 'audioUrl', 'url']);
    const audio = audioBase64 ? decodeAudioBase64(audioBase64) : audioUrl ? await downloadAudio(audioUrl) : null;
    if (!audio) throw new Error(`RunPod voice job ${job.id ?? '(unknown)'} completed without audio.`);
    if (voice.mode === 'design' && chunkIndex === 0 && audio.byteLength <= MAX_REFERENCE_AUDIO_BYTES) {
      continuationReference = {
        referenceAudioBase64: Buffer.from(audio).toString('base64'),
        referenceText: chunk,
      };
    }
    results.push({
      audio,
      duration: numberFromOutput(job.output, ['duration', 'duration_seconds', 'durationSeconds']),
    });
  }
  const audio = concatenateWavAudio(results.map((result) => result.audio));
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new Error('Combined RunPod voice audio exceeded 100 MB.');
  return {
    audio,
    duration: results.reduce((sum, result) => sum + result.duration, 0),
  };
}

export async function synthesizeRunpodPodSpeech(
  pod: { podId: string; baseUrl?: string; token?: string },
  characterId: string,
  voice: CharacterVoiceConfig,
  text: string,
  runtimeEnv: Record<string, string | undefined> = process.env,
  designVariant = '',
  modelCheckpoint = '',
  deliveryOverride = false,
): Promise<VoiceSynthesisResult> {
  const baseUrl = resolveRunpodVoicePodUrl(pod.podId, pod.baseUrl);
  const runVoiceJob: VoiceJobRunner = async (_credentials, input) => {
    const response = await fetch(`${baseUrl}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(pod.token?.trim() ? { authorization: `Bearer ${pod.token.trim()}` } : {}),
      },
      body: JSON.stringify({ input }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10 * 60_000),
    });
    const raw = await response.text();
    let data: RunpodJobResponse = {};
    try {
      data = raw ? JSON.parse(raw) as RunpodJobResponse : {};
    } catch {
      throw new Error(`RunPod Voice Pod returned invalid JSON (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      const detail = typeof data.error === 'string'
        ? data.error
        : (data as Record<string, unknown>).detail;
      throw new Error(`RunPod Voice Pod HTTP ${response.status}${detail ? `: ${String(detail).slice(0, 2000)}` : ''}`);
    }
    return data;
  };
  return synthesizeRunpodSpeech(
    { apiKey: 'pod-direct', endpointId: 'pod-direct' },
    characterId,
    voice,
    text,
    runtimeEnv,
    designVariant,
    modelCheckpoint,
    deliveryOverride,
    runVoiceJob,
  );
}

export async function submitRunpodVoiceWarmup(
  credentials: { apiKey: string; endpointId: string },
  sessionId: string,
  modelCheckpoint = '',
): Promise<{ jobId?: string; status?: string; delayTime?: number; executionTime?: number }> {
  const job = await submitRunpodJob(credentials, {
    task: 'voice.warmup',
    engine: 'irodori-v4',
    sessionId,
    ...(modelCheckpoint ? { modelCheckpoint } : {}),
  });
  return { jobId: job.id, status: job.status, delayTime: job.delayTime, executionTime: job.executionTime };
}
