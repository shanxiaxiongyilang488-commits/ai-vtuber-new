import type { CharacterVoiceConfig } from '$lib/server/characterRegistry';
import type { VoiceSynthesisResult } from '$lib/server/voiceBridge';

/**
 * Piper Bridge (python/piper_bridge — piper-plus inference.py) クライアント。
 * OpenAI互換の POST /v1/audio/speech を叩いてWAVを受け取る。
 */

const DEFAULT_PIPER_BRIDGE_URL = 'http://127.0.0.1:8792';

export function resolvePiperBridgeUrl(env: Record<string, string | undefined>): string {
  return (env.PIPER_BRIDGE_URL?.trim() || DEFAULT_PIPER_BRIDGE_URL).replace(/\/+$/, '');
}

/** PCM WAVのヘッダから再生秒数を求める。壊れたヘッダなら0を返す。 */
export function wavDurationSeconds(bytes: Uint8Array): number {
  if (bytes.byteLength < 44) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) return 0;
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= bytes.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 0x666d7420) byteRate = view.getUint32(offset + 16, true); // 'fmt '
    if (chunkId === 0x64617461) return byteRate > 0 ? chunkSize / byteRate : 0; // 'data'
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return 0;
}

export async function synthesizePiperSpeech(
  baseUrl: string,
  voice: CharacterVoiceConfig,
  text: string,
): Promise<VoiceSynthesisResult> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'piper-plus',
        input: text,
        voice: voice.model || 'default',
        response_format: 'wav',
        speed: voice.speed ?? 1,
        language: voice.language || 'ja',
        noise_scale: voice.noiseScale ?? 0.667,
        noise_w: voice.noiseW ?? 0.8,
      }),
    });
  } catch (e) {
    throw new Error(
      `Piper Bridge is not reachable at ${baseUrl} (${e instanceof Error ? e.message : String(e)})`,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Piper Bridge HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  const audio = new Uint8Array(await res.arrayBuffer());
  return { audio, duration: wavDurationSeconds(audio) };
}
