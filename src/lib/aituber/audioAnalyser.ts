import type { AudioAnalyserOptions } from './types.ts';
import { getVoiceOutputEffectPreset, type VoiceOutputEffectMode } from './voiceOutputEffect.ts';

export type MouthLevelListener = (level: number) => void;

export interface AudioAnalyserEnvironment {
  isAvailable(): boolean;
  createContext(): AudioContext;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
}

const browserEnvironment: AudioAnalyserEnvironment = {
  isAvailable: () => typeof window !== 'undefined' && typeof AudioContext !== 'undefined',
  createContext: () => new AudioContext(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

const DEFAULTS: Required<AudioAnalyserOptions> = {
  fftSize: 1024,
  smoothing: 0.68,
  noiseFloor: 0.015,
  gain: 5.5,
};

/**
 * 再生中のHTMLAudioElementをWeb Audio APIへ接続し、時間領域RMSを0..1で通知する。
 * AudioContextはattach()がブラウザで呼ばれるまで生成しない。
 */
export class AudioLevelAnalyser {
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private effectNodes: AudioNode[] = [];
  private samples: Uint8Array<ArrayBuffer> | null = null;
  private frameId: number | null = null;
  private level = 0;
  private attachedAudio: HTMLAudioElement | null = null;
  private readonly options: Required<AudioAnalyserOptions>;
  private readonly onLevel: MouthLevelListener;
  private readonly environment: AudioAnalyserEnvironment;

  constructor(
    onLevel: MouthLevelListener,
    options: AudioAnalyserOptions = {},
    environment: AudioAnalyserEnvironment = browserEnvironment,
  ) {
    this.onLevel = onLevel;
    this.options = { ...DEFAULTS, ...options };
    this.environment = environment;
  }

  /**
   * Create and resume Web Audio while a real user gesture is still active.
   * Voice synthesis finishes asynchronously, too late for browsers that only
   * allow AudioContext.resume() from the original click/keydown handler.
   */
  async unlock(): Promise<boolean> {
    if (!this.environment.isAvailable()) return false;
    try {
      this.context ??= this.environment.createContext();
      if (this.context.state === 'closed') return false;
      if (this.context.state !== 'running') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  attach(audio: HTMLAudioElement, effectMode: VoiceOutputEffectMode = 'off'): boolean {
    if (!this.environment.isAvailable()) return false;
    this.detach();
    try {
      this.context ??= this.environment.createContext();
      const analyser = this.context.createAnalyser();
      analyser.fftSize = this.options.fftSize;
      analyser.smoothingTimeConstant = this.options.smoothing;
      const source = this.context.createMediaElementSource(audio);
      const effect = getVoiceOutputEffectPreset(effectMode);
      if (effect.mode === 'off') {
        source.connect(analyser);
      } else {
        // 原音を主体にし、帯域を絞ったごく短い反射音だけを並列で混ぜる。
        // 白色ノイズやフィードバックは使わないため、原音にない雑音は生成しない。
        const dry = this.context.createGain();
        dry.gain.value = effect.dryGain;
        const bandpass = this.context.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = effect.bandpassHz;
        bandpass.Q.value = effect.bandpassQ;
        const delay = this.context.createDelay(0.05);
        delay.delayTime.value = effect.delaySeconds;
        const wet = this.context.createGain();
        wet.gain.value = effect.wetGain;

        source.connect(dry);
        dry.connect(analyser);
        source.connect(bandpass);
        bandpass.connect(delay);
        delay.connect(wet);
        wet.connect(analyser);
        this.effectNodes = [dry, bandpass, delay, wet];
      }
      analyser.connect(this.context.destination);
      this.source = source;
      this.analyser = analyser;
      this.samples = new Uint8Array(analyser.fftSize);
      this.attachedAudio = audio;
      audio.addEventListener('play', this.handlePlay);
      audio.addEventListener('pause', this.handleStop);
      audio.addEventListener('ended', this.handleStop);
      audio.addEventListener('error', this.handleStop);
      return true;
    } catch (error) {
      console.warn('[AITUBER_AUDIO_ANALYSER_ATTACH_FAILED]', error instanceof Error ? error.message : String(error));
      this.detach();
      return false;
    }
  }

  detach(): void {
    this.stopLoop();
    if (this.attachedAudio) {
      this.attachedAudio.removeEventListener('play', this.handlePlay);
      this.attachedAudio.removeEventListener('pause', this.handleStop);
      this.attachedAudio.removeEventListener('ended', this.handleStop);
      this.attachedAudio.removeEventListener('error', this.handleStop);
    }
    this.source?.disconnect();
    for (const node of this.effectNodes) node.disconnect();
    this.analyser?.disconnect();
    this.source = null;
    this.effectNodes = [];
    this.analyser = null;
    this.samples = null;
    this.attachedAudio = null;
    this.level = 0;
    this.onLevel(0);
  }

  async dispose(): Promise<void> {
    this.detach();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);
  }

  private readonly handlePlay = (): void => {
    void this.context?.resume().catch(() => undefined);
    this.startLoop();
  };

  private readonly handleStop = (): void => {
    this.stopLoop();
    this.level = 0;
    this.onLevel(0);
  };

  private startLoop(): void {
    if (this.frameId !== null || !this.environment.isAvailable()) return;
    const update = () => {
      if (!this.analyser || !this.samples) return;
      this.analyser.getByteTimeDomainData(this.samples);
      let sumSquares = 0;
      for (const sample of this.samples) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / this.samples.length);
      const raw = Math.max(0, rms - this.options.noiseFloor) * this.options.gain;
      const target = Math.max(0, Math.min(1, raw));
      this.level = this.level * this.options.smoothing + target * (1 - this.options.smoothing);
      this.onLevel(this.level < 0.01 ? 0 : this.level);
      this.frameId = this.environment.requestFrame(update);
    };
    this.frameId = this.environment.requestFrame(update);
  }

  private stopLoop(): void {
    if (this.frameId !== null) this.environment.cancelFrame(this.frameId);
    this.frameId = null;
  }
}
