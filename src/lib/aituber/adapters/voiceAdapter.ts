import type { VoiceAdapter, VoiceAudioSource } from '../types.ts';

export class ExistingVoiceBridgeAdapter implements VoiceAdapter {
  constructor(private readonly beforeSynthesize?: (signal?: AbortSignal) => Promise<void>) {}

  async synthesize(
    characterId: string,
    text: string,
    signal?: AbortSignal,
    voiceCaption?: string,
    voiceSpeed?: number,
    preserveBaseVoice?: boolean,
    voicePitchShiftSemitones?: number,
  ): Promise<VoiceAudioSource> {
    await this.beforeSynthesize?.(signal);
    if (signal?.aborted) throw new DOMException('Voice generation was cancelled.', 'AbortError');
    const response = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({
        characterId,
        text,
        ...(voiceCaption ? { voiceCaption } : {}),
        ...(voiceSpeed !== undefined ? { voiceSpeed } : {}),
        ...(voicePitchShiftSemitones !== undefined ? { voicePitchShiftSemitones } : {}),
        ...(preserveBaseVoice ? { preserveBaseVoice: true } : {}),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success || !data?.audioUrl) {
      throw new Error(data?.message ?? `Voice generation failed: HTTP ${response.status}`);
    }
    const backend = data.backend === 'runpod-pod' || data.backend === 'runpod-serverless'
      ? data.backend
      : undefined;
    return { url: String(data.audioUrl), ...(backend ? { backend } : {}) };
  }
}
