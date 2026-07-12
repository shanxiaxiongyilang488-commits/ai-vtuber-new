import type { AvatarEmotion, AvatarStateSnapshot } from './types.ts';

function clampMouthLevel(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export class AvatarState {
  speaking = $state(false);
  mouthLevel = $state(0);
  emotion = $state<AvatarEmotion>('neutral');
  thinking = $state(false);

  setSpeaking(speaking: boolean): void {
    this.speaking = speaking;
    if (!speaking) this.mouthLevel = 0;
  }

  setMouthLevel(mouthLevel: number): void {
    this.mouthLevel = this.speaking ? clampMouthLevel(mouthLevel) : 0;
  }

  setEmotion(emotion: AvatarEmotion): void {
    this.emotion = emotion;
  }

  setThinking(thinking: boolean): void {
    this.thinking = thinking;
  }

  reset(): void {
    this.speaking = false;
    this.mouthLevel = 0;
    this.emotion = 'neutral';
    this.thinking = false;
  }

  snapshot(): AvatarStateSnapshot {
    return {
      speaking: this.speaking,
      mouthLevel: this.mouthLevel,
      emotion: this.emotion,
      thinking: this.thinking,
    };
  }
}

/** Componentごとに生成し、SSRリクエスト間で状態を共有しない。 */
export function createAvatarState(): AvatarState {
  return new AvatarState();
}

