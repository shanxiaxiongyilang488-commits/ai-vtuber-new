import type { AudioLike } from './speechQueue.ts';
import type { AvatarStatePort } from './types.ts';
import { AudioLevelAnalyser } from './audioAnalyser.ts';
import { mapExistingEmotion } from './emotionMapper.ts';
import type { VoiceOutputEffectMode } from './voiceOutputEffect.ts';

/** 既存の音声再生イベントをAvatarStateへ渡すだけのPhase 1 Bridge。 */
export class AITuberBridge {
  private readonly analyser: AudioLevelAnalyser;
  private readonly avatar: AvatarStatePort;
  private currentAudio: HTMLAudioElement | null = null;

  constructor(avatar: AvatarStatePort) {
    this.avatar = avatar;
    this.analyser = new AudioLevelAnalyser((level) => this.avatar.setMouthLevel(level));
  }

  unlockAudio(): void {
    void this.analyser.unlock();
  }

  createAudio(url: string, effectMode: VoiceOutputEffectMode = 'off'): AudioLike {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      throw new Error('Audio playback is only available in the browser');
    }
    const audio = new Audio(url);
    this.releaseAudio();
    this.currentAudio = audio;
    audio.addEventListener('play', this.handleAudioPlay);
    audio.addEventListener('pause', this.handleAudioStop);
    audio.addEventListener('ended', this.handleAudioStop);
    audio.addEventListener('error', this.handleAudioStop);
    this.analyser.attach(audio, effectMode);
    return audio;
  }

  speechStarted(existingEmotion?: unknown): void {
    this.avatar.setEmotion(mapExistingEmotion(existingEmotion));
    this.avatar.setThinking(false);
  }

  speechFinished(): void {
    this.releaseAudio();
  }

  speechFailed(): void {
    this.releaseAudio();
  }

  setThinking(thinking: boolean): void {
    this.avatar.setThinking(thinking);
  }

  setExistingEmotion(existingEmotion: unknown): void {
    this.avatar.setEmotion(mapExistingEmotion(existingEmotion));
  }

  async dispose(): Promise<void> {
    this.detachAudioLifecycle();
    await this.analyser.dispose();
    this.avatar.reset();
  }

  private readonly handleAudioPlay = (): void => {
    this.avatar.setSpeaking(true);
  };

  private readonly handleAudioStop = (): void => {
    this.releaseAudio();
  };

  private releaseAudio(): void {
    this.avatar.setSpeaking(false);
    this.analyser.detach();
    this.detachAudioLifecycle();
  }

  private detachAudioLifecycle(): void {
    if (!this.currentAudio) return;
    this.currentAudio.removeEventListener('play', this.handleAudioPlay);
    this.currentAudio.removeEventListener('pause', this.handleAudioStop);
    this.currentAudio.removeEventListener('ended', this.handleAudioStop);
    this.currentAudio.removeEventListener('error', this.handleAudioStop);
    this.currentAudio = null;
  }
}
