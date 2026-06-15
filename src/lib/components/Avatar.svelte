<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { createVolumeAnalyzer, type VolumeAnalyzer } from '$lib/utils/audioAnalyzer';

  let {
    name = 'Avatar',
    faceSrc = '/vtuber/face.png',
    mouthCloseSrc = '/vtuber/mouth_close.png',
    mouthMidSrc = '/vtuber/mouth_mid.png',
    mouthOpenSrc = '/vtuber/mouth_open.png',
    audioSrc = '',
    autoPlayOnSourceChange = true,
    controls = false,
    loop = false,
    preload = 'auto',
    width = 320,
    mouthWidth = 88,
    mouthBottom = 46,
    mouthLeft = 50,
    mouthRotation = 0,
    midThreshold = 0.08,
    openThreshold = 0.16,
    idleMouth = 'close',
  }: {
    name?: string;
    faceSrc?: string;
    mouthCloseSrc?: string;
    mouthMidSrc?: string;
    mouthOpenSrc?: string;
    audioSrc?: string;
    autoPlayOnSourceChange?: boolean;
    controls?: boolean;
    loop?: boolean;
    preload?: 'none' | 'metadata' | 'auto';
    width?: number;
    mouthWidth?: number;
    mouthBottom?: number;
    mouthLeft?: number;
    mouthRotation?: number;
    midThreshold?: number;
    openThreshold?: number;
    idleMouth?: string;
  } = $props();

  const dispatch = createEventDispatcher<{
    play: { src: string };
    ended: { src: string };
    error: { message: string; src: string };
    statechange: { mouth: 'close' | 'mid' | 'open'; volume: number };
  }>();

  let audioEl: HTMLAudioElement;
  let analyzer: VolumeAnalyzer | null = null;
  let initializedSrc = '';
  let volume = 0;
  let mouthState: 'close' | 'mid' | 'open' = idleMouth as 'close' | 'mid' | 'open';

  $effect(() => {
    if (audioSrc && autoPlayOnSourceChange && audioSrc !== initializedSrc && audioEl) {
      initializedSrc = audioSrc;
      void playAudio(audioSrc);
    }
    if (!audioSrc) {
      mouthState = idleMouth as 'close' | 'mid' | 'open';
      volume = 0;
    }
  });

  function resolveMouthState(nextVolume: number): 'close' | 'mid' | 'open' {
    if (nextVolume >= openThreshold) return 'open';
    if (nextVolume >= midThreshold) return 'mid';
    return 'close';
  }

  async function ensureAnalyzer() {
    if (analyzer || !audioEl) return;

    analyzer = createVolumeAnalyzer(audioEl, {
      onVolume: (nextVolume) => {
        volume = nextVolume;
        mouthState = resolveMouthState(nextVolume);
        dispatch('statechange', { mouth: mouthState, volume });
      }
    });
  }

  async function playAudio(src = audioSrc) {
    if (!audioEl || !src) return;

    try {
      if (audioEl.src !== new URL(src, window.location.origin).href) {
        audioEl.src = src;
      }

      await ensureAnalyzer();
      await analyzer?.start();
      await audioEl.play();
      dispatch('play', { src });
    } catch (error) {
      const message = error instanceof Error ? error.message : '音声再生に失敗しました。';
      dispatch('error', { message, src });
      mouthState = idleMouth as 'close' | 'mid' | 'open';
    }
  }

  function pauseAudio() {
    if (!audioEl) return;
    audioEl.pause();
    analyzer?.stop();
    mouthState = idleMouth as 'close' | 'mid' | 'open';
  }

  function handleEnded() {
    analyzer?.stop();
    mouthState = idleMouth as 'close' | 'mid' | 'open';
    dispatch('ended', { src: audioSrc });
  }

  onDestroy(() => {
    analyzer?.destroy();
  });
</script>

<div class="avatar-shell" style={`--avatar-width:${width}px; --mouth-width:${mouthWidth}px; --mouth-bottom:${mouthBottom}px; --mouth-left:${mouthLeft}%; --mouth-rotate:${mouthRotation}deg;`}>
  <div class="avatar-stage" aria-label={name}>
    <img class="face" src={faceSrc} alt={`${name} face`} draggable="false" />

    {#if mouthState === 'close'}
      <img class="mouth" src={mouthCloseSrc} alt={`${name} mouth closed`} draggable="false" />
    {:else if mouthState === 'mid'}
      <img class="mouth" src={mouthMidSrc} alt={`${name} mouth mid`} draggable="false" />
    {:else}
      <img class="mouth" src={mouthOpenSrc} alt={`${name} mouth open`} draggable="false" />
    {/if}
  </div>

  <div class="meta-row">
    <div class="name">{name}</div>
    <div class="meter"><span style={`width:${Math.min(100, volume * 100)}%`} /></div>
  </div>

  <audio
    bind:this={audioEl}
    {controls}
    {loop}
    {preload}
    crossorigin="anonymous"
    on:play={() => analyzer?.start()}
    on:pause={pauseAudio}
    on:ended={handleEnded}
  />
</div>

<style>
  .avatar-shell {
    width: var(--avatar-width);
    display: grid;
    gap: 0.75rem;
  }

  .avatar-stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
  }

  .face,
  .mouth {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    user-select: none;
    pointer-events: none;
  }

  .mouth {
    inset: auto;
    left: var(--mouth-left);
    bottom: var(--mouth-bottom);
    width: var(--mouth-width);
    height: auto;
    transform: translateX(-50%) rotate(var(--mouth-rotate));
    transform-origin: center;
    filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.18));
  }

  .meta-row {
    display: grid;
    gap: 0.5rem;
  }

  .name {
    font-size: 0.95rem;
    font-weight: 700;
  }

  .meter {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .meter > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #60a5fa, #a78bfa);
    transition: width 80ms linear;
  }
</style>
