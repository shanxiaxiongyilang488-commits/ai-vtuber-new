import type { CharacterVoiceConfig } from '$lib/server/characterRegistry';

/**
 * Voice Bridge (python/voice_bridge/server.py) クライアント。
 * 既存の irodoriGradio.ts (Gradio SSE 直叩き) とは独立した新経路。
 */

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8791';

export type VoiceSynthesisResult = {
  audio: Uint8Array;
  duration: number;
};

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
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        mode: voice.mode,
        model: voice.model,
        caption: voice.caption ?? null,
        speed: voice.speed ?? 1,
      }),
    });
  } catch (e) {
    throw new Error(
      `Voice Bridge is not reachable at ${baseUrl} (${e instanceof Error ? e.message : String(e)})`,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Voice Bridge HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  const duration = Number(res.headers.get('x-duration') ?? '0');
  return {
    audio: new Uint8Array(await res.arrayBuffer()),
    duration: Number.isFinite(duration) ? duration : 0,
  };
}
