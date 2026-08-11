import type { CharacterVoiceConfig } from '$lib/server/characterRegistry';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * Voice Bridge (python/voice_bridge/server.py) クライアント。
 * 既存の irodoriGradio.ts (Gradio SSE 直叩き) とは独立した新経路。
 */

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8791';
const SPEECH_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

function formatBridgeErrorBody(body: Buffer): string {
  if (!body.length) return '';
  const raw = body.toString('utf8');
  let detail = raw;
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    if (typeof parsed.detail === 'string') detail = parsed.detail;
  } catch {
    // Keep non-JSON error bodies intact.
  }
  const limit = 4_000;
  return detail.length > limit ? `...${detail.slice(-limit)}` : detail;
}

export type VoiceSynthesisResult = {
  audio: Uint8Array;
  duration: number;
};

/** Keep v4 VoiceDesign auditions bounded while a candidate is still being tuned. */
export function estimateDesignDurationSeconds(text: string): number {
  const compact = Array.from(text.normalize('NFKC')).filter((char) => !/\s/u.test(char));
  const punctuation = compact.filter((char) => /[、。！？!?…,.]/u.test(char)).length;
  const spoken = compact.length - punctuation;
  // Leave enough room for clean articulation; the Python tail gate removes
  // surplus output after a terminal pause without forcing rushed synthesis.
  const estimated = 0.65 + spoken / 5.7 + punctuation * 0.15;
  return Math.round(Math.min(12, Math.max(2.5, estimated)) * 10) / 10;
}

export function resolveVoiceBridgeUrl(env: Record<string, string | undefined>): string {
  return (env.VOICE_BRIDGE_URL?.trim() || DEFAULT_BRIDGE_URL).replace(/\/+$/, '');
}

// 同時生成数 1 のキュー。先行ジョブの成否に関わらず投入順に直列実行する。
let queueTail: Promise<unknown> = Promise.resolve();

export function enqueueVoiceJob<T>(job: () => Promise<T>): Promise<T> {
  const next = queueTail.then(job, job);
  queueTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function synthesizeSpeech(
  baseUrl: string,
  voice: CharacterVoiceConfig,
  text: string,
): Promise<VoiceSynthesisResult> {
  const target = new URL('/speak', `${baseUrl}/`);
  const payload = Buffer.from(JSON.stringify({
    text,
    mode: voice.mode,
    model: voice.model,
    caption: voice.caption ?? null,
    speed: voice.speed ?? 1,
    pitch_shift_semitones: voice.pitchShiftSemitones ?? 0,
    ...(voice.mode === 'design' ? { seconds: estimateDesignDurationSeconds(text) } : {}),
  }), 'utf8');

  return new Promise<VoiceSynthesisResult>((resolveResult, rejectResult) => {
    const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = transport(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': String(payload.byteLength),
        Connection: 'close',
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      res.on('data', (chunk: Buffer | Uint8Array) => {
        const buffer = Buffer.from(chunk);
        totalBytes += buffer.byteLength;
        if (totalBytes > MAX_AUDIO_BYTES) {
          req.destroy(new Error('Voice Bridge audio response exceeded 100 MB'));
          return;
        }
        chunks.push(buffer);
      });
      res.once('error', rejectResult);
      res.once('end', () => {
        const body = Buffer.concat(chunks);
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          const detail = formatBridgeErrorBody(body);
          rejectResult(new Error(`Voice Bridge HTTP ${status}${detail ? `: ${detail}` : ''}`));
          return;
        }
        const durationHeader = Array.isArray(res.headers['x-duration'])
          ? res.headers['x-duration'][0]
          : res.headers['x-duration'];
        const duration = Number(durationHeader ?? '0');
        resolveResult({
          audio: new Uint8Array(body),
          duration: Number.isFinite(duration) ? duration : 0,
        });
      });
    });

    req.setTimeout(SPEECH_REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('Voice Bridge synthesis timed out after 30 minutes'));
    });
    req.once('error', (error) => {
      rejectResult(new Error(`Voice Bridge is not reachable at ${baseUrl} (${error.message})`));
    });
    req.end(payload);
  });
}
