import type { SpeechRequest, VoiceAdapter, VoiceAudioSource } from './types.ts';

export interface AudioLike {
  addEventListener(type: string, listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: () => void): void;
  play(): Promise<void>;
  pause(): void;
  currentTime: number;
}

export interface SpeechQueueEvents {
  queued?(request: SpeechRequest): void;
  resolved?(request: SpeechRequest, source: VoiceAudioSource): void;
  started?(request: SpeechRequest): void;
  finished?(request: SpeechRequest): void;
  failed?(request: SpeechRequest, error: unknown): void;
  idle?(): void;
}

export function speechPriority(request: Pick<SpeechRequest, 'origin'>): number {
  return request.origin === 'user_reply' ? 100 : 10;
}

export function orderSpeechRequests(requests: SpeechRequest[]): SpeechRequest[] {
  return [...requests].sort((a, b) => speechPriority(b) - speechPriority(a) || a.createdAt - b.createdAt);
}

export class SpeechQueue {
  private pending: SpeechRequest[] = [];
  private current: { request: SpeechRequest; audio?: AudioLike; source?: VoiceAudioSource; controller: AbortController } | null = null;
  private disposed = false;
  private readonly voice: VoiceAdapter;
  private readonly events: SpeechQueueEvents;
  private readonly createAudio: (url: string) => AudioLike;

  constructor(
    voice: VoiceAdapter,
    events: SpeechQueueEvents = {},
    createAudio: (url: string) => AudioLike = (url) => new Audio(url),
  ) {
    this.voice = voice;
    this.events = events;
    this.createAudio = createAudio;
  }

  enqueue(request: SpeechRequest): void {
    if (this.disposed || this.pending.some((item) => item.id === request.id) || this.current?.request.id === request.id) return;
    this.pending = orderSpeechRequests([...this.pending, request]);
    this.events.queued?.(request);
    void this.drain();
  }

  stop(): void {
    this.pending = [];
    this.stopCurrent();
  }

  private stopCurrent(): void {
    this.current?.controller.abort();
    this.current?.audio?.pause();
    if (this.current?.audio) this.current.audio.currentTime = 0;
  }

  skip(): void {
    this.stopCurrent();
  }

  clear(characterId?: string): void {
    this.pending = characterId ? this.pending.filter((item) => item.characterId !== characterId) : [];
    if (!characterId || this.current?.request.characterId === characterId) this.stopCurrent();
  }

  dispose(): void {
    this.disposed = true;
    this.pending = [];
    this.stopCurrent();
  }

  size(): number {
    return this.pending.length + (this.current ? 1 : 0);
  }

  private async drain(): Promise<void> {
    if (this.current || this.disposed) return;
    const request = this.pending.shift();
    if (!request) {
      this.events.idle?.();
      return;
    }
    const controller = new AbortController();
    this.current = { request, controller };
    try {
      const source = await this.voice.synthesize(
        request.characterId,
        request.text,
        controller.signal,
        request.voiceCaption,
        request.voiceSpeed,
        request.preserveBaseVoice,
        request.voicePitchShiftSemitones,
      );
      if (controller.signal.aborted) return;
      this.events.resolved?.(request, source);
      const audio = this.createAudio(source.url);
      this.current.source = source;
      this.current.audio = audio;
      this.events.started?.(request);
      await new Promise<void>((resolve, reject) => {
        const finish = () => { cleanup(); resolve(); };
        const fail = () => { cleanup(); reject(new Error('Audio playback failed')); };
        const abort = () => { cleanup(); resolve(); };
        const cleanup = () => {
          audio.removeEventListener('ended', finish);
          audio.removeEventListener('error', fail);
          controller.signal.removeEventListener('abort', abort);
        };
        audio.addEventListener('ended', finish, { once: true });
        audio.addEventListener('error', fail, { once: true });
        controller.signal.addEventListener('abort', abort, { once: true });
        audio.play().catch(fail);
      });
      if (!controller.signal.aborted) this.events.finished?.(request);
    } catch (error) {
      if (!controller.signal.aborted) this.events.failed?.(request, error);
    } finally {
      this.current?.source?.revoke?.();
      this.current = null;
      void this.drain();
    }
  }
}
