import type { PuruPuruItemSlot } from './itemLayers';
import type { PuruPuruAssetKey, PuruPuruItemLayer, PuruPuruModel } from './types';
import {
  extractRendererSettings,
  frameLerpFactor,
  mouthResponse,
  mouthStateForTarget,
  mouthTargetForLevel,
  nextBlinkDelayMs,
  randomBlinkStep,
  type BlinkStep,
  type MouthResponse,
  type MouthState,
  type PuruPuruRendererSettings,
} from './rendererSettings';

type BlinkPhase = 'idle' | 'closing' | 'closed' | 'opening';

const MOUTH_IMAGE_SUFFIX = ['MouthClosed', 'MouthHalf', 'MouthOpen'] as const;

export class PuruPuruRenderer {
  private frame = 0;
  private startedAt = performance.now();
  private lastFrameAt = this.startedAt;
  private blinkPhase: BlinkPhase = 'idle';
  private blinkPhaseStartedAt = 0;
  private blinkStep: BlinkStep = randomBlinkStep();
  private blinkClosed = false;
  private nextBlinkAt: number;
  private voicePeak = 0;
  private mouthState: MouthState = 0;
  private mouthBlendFrom: MouthState = 0;
  private mouthBlendStartedAt = 0;
  private smoothedMouth = 0;
  private hairAngle = 0;
  private hairVelocity = 0;
  private readonly settings: PuruPuruRendererSettings;
  private readonly response: MouthResponse;
  private readonly itemsBySlot = new Map<PuruPuruItemSlot, PuruPuruItemLayer[]>();

  constructor(private readonly canvas: HTMLCanvasElement, private readonly model: PuruPuruModel) {
    canvas.width = model.width;
    canvas.height = model.height;
    this.settings = extractRendererSettings(model.settings);
    this.response = mouthResponse(this.settings);
    this.nextBlinkAt = this.startedAt + nextBlinkDelayMs();
    for (const item of model.items) {
      const slot = this.itemsBySlot.get(item.slot) ?? [];
      slot.push(item);
      this.itemsBySlot.set(item.slot, slot);
    }
  }

  start(getMouthLevel: () => number, getSpeaking: () => boolean): void {
    const render = (now: number) => {
      const delta = Math.min(0.1, Math.max(0, (now - this.lastFrameAt) / 1000));
      this.lastFrameAt = now;
      const rawLevel = getSpeaking() ? Math.max(0, Math.min(1, getMouthLevel())) * this.response.voiceGain : 0;
      this.updateMouth(rawLevel, now, delta);
      this.updateHair();
      this.updateBlink(now);
      this.draw(now);
      this.frame = requestAnimationFrame(render);
    };
    this.frame = requestAnimationFrame(render);
  }

  stop(): void { cancelAnimationFrame(this.frame); }

  private updateMouth(rawLevel: number, now: number, delta: number): void {
    const factor60 = rawLevel > this.voicePeak ? this.response.attackFactor60 : this.response.releaseFactor60;
    const k = frameLerpFactor(factor60, delta);
    this.voicePeak = Math.max(0, Math.min(1, this.voicePeak + (rawLevel - this.voicePeak) * k));
    const next = mouthStateForTarget(mouthTargetForLevel(this.voicePeak, this.response));
    if (next !== this.mouthState) {
      this.mouthBlendFrom = this.mouthState;
      this.mouthBlendStartedAt = now;
      this.mouthState = next;
    }
  }

  private updateHair(): void {
    const springScale = this.settings.hairSpring / 40;
    const impulseScale = this.settings.pyokoStrength / 15;
    const target = mouthTargetForLevel(this.voicePeak, this.response);
    this.smoothedMouth += (target - this.smoothedMouth) * 0.32;
    const impulse = (target - this.smoothedMouth) * 0.025 * impulseScale;
    this.hairVelocity = (this.hairVelocity + impulse - this.hairAngle * 0.018 * springScale) * 0.9;
    this.hairAngle += this.hairVelocity;
  }

  private updateBlink(now: number): void {
    if (!this.settings.autoBlink) {
      this.blinkPhase = 'idle';
      this.blinkClosed = false;
      return;
    }
    if (this.blinkPhase === 'idle') {
      this.blinkClosed = false;
      if (now < this.nextBlinkAt) return;
      this.blinkStep = randomBlinkStep();
      this.blinkPhase = 'closing';
      this.blinkPhaseStartedAt = now;
    }
    const elapsed = now - this.blinkPhaseStartedAt;
    if (this.blinkPhase === 'closing') {
      this.blinkClosed = elapsed >= this.blinkStep.closeMs * 0.45;
      if (elapsed >= this.blinkStep.closeMs) {
        this.blinkPhase = 'closed';
        this.blinkPhaseStartedAt = now;
        this.blinkClosed = true;
      }
      return;
    }
    if (this.blinkPhase === 'closed') {
      this.blinkClosed = true;
      if (elapsed >= this.blinkStep.holdMs) {
        this.blinkPhase = 'opening';
        this.blinkPhaseStartedAt = now;
      }
      return;
    }
    this.blinkClosed = elapsed < this.blinkStep.openMs * 0.42;
    if (elapsed >= this.blinkStep.openMs) {
      this.blinkPhase = 'idle';
      this.blinkClosed = false;
      this.nextBlinkAt = now + nextBlinkDelayMs();
    }
  }

  private mouthImage(state: MouthState): HTMLImageElement {
    const prefix = this.blinkClosed ? 'eyesClosed' : 'eyesOpen';
    return this.model.images[`${prefix}${MOUTH_IMAGE_SUFFIX[state]}` as PuruPuruAssetKey];
  }

  private draw(now: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width, height, images } = this.model;
    ctx.clearRect(0, 0, width, height);
    const breathScale = this.settings.breathStrength / 60;
    const idle = Math.sin((now - this.startedAt) / 900) * 0.0025 * breathScale;
    this.drawItems(ctx, 'stageBack');
    this.drawItems(ctx, 'characterBack');
    if (this.settings.hairVisible) this.drawLayer(ctx, images.backHair, width, height, idle + this.hairAngle, 0.99);
    this.drawItems(ctx, 'faceBack');
    const mix = this.response.crossfadeMs <= 0
      ? 1
      : Math.max(0, Math.min(1, (now - this.mouthBlendStartedAt) / this.response.crossfadeMs));
    if (mix >= 1 || this.mouthBlendFrom === this.mouthState) {
      ctx.drawImage(this.mouthImage(this.mouthState), 0, 0, width, height);
    } else {
      this.drawCrossfade(ctx, this.mouthImage(this.mouthBlendFrom), this.mouthImage(this.mouthState), mix, width, height);
    }
    this.drawItems(ctx, 'faceFront');
    if (this.settings.hairVisible) this.drawLayer(ctx, images.frontHair, width, height, idle - this.hairAngle * 0.72, 1);
    this.drawItems(ctx, 'frontHairFront');
    this.drawItems(ctx, 'stageFront');
  }

  private drawItems(ctx: CanvasRenderingContext2D, slot: PuruPuruItemSlot): void {
    const items = this.itemsBySlot.get(slot);
    if (!items) return;
    const { width, height } = this.model;
    for (const item of items) {
      ctx.save();
      ctx.globalAlpha = item.opacity / 100;
      ctx.translate(width / 2 + item.x, height / 2 + item.y);
      ctx.rotate((item.rotation * Math.PI) / 180);
      const scale = item.scale / 100;
      ctx.scale(scale, scale);
      ctx.drawImage(item.image, -item.image.naturalWidth / 2, -item.image.naturalHeight / 2);
      ctx.restore();
    }
  }

  private drawCrossfade(ctx: CanvasRenderingContext2D, from: HTMLImageElement, to: HTMLImageElement, mix: number, w: number, h: number): void {
    ctx.globalAlpha = 1 - mix;
    ctx.drawImage(from, 0, 0, w, h);
    ctx.globalAlpha = mix;
    ctx.drawImage(to, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  private drawLayer(ctx: CanvasRenderingContext2D, image: HTMLImageElement, w: number, h: number, angle: number, scale: number): void {
    ctx.save();
    ctx.translate(w / 2, h * 0.82);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.drawImage(image, -w / 2, -h * 0.82, w, h);
    ctx.restore();
  }
}
