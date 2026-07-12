import type { VoiceAdapter, VoiceAudioSource } from '../types.ts';

export class ExistingVoiceBridgeAdapter implements VoiceAdapter {
  async synthesize(characterId: string, text: string, signal?: AbortSignal): Promise<VoiceAudioSource> {
    const response = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({ characterId, text }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success || !data?.audioUrl) {
      throw new Error(data?.message ?? `Voice generation failed: HTTP ${response.status}`);
    }
    return { url: String(data.audioUrl) };
  }
}

