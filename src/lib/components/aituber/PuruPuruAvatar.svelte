<script lang="ts">
  import { onMount } from 'svelte';
  import type { AvatarEmotion } from '$lib/aituber/types';
  import { getPuruPuruModel, loadPuruPuruPackage, PuruPuruRenderer, savePuruPuruModel } from '$lib/purupuru';

  interface Props {
    src: string;
    alt: string;
    speaking?: boolean;
    mouthLevel?: number;
    emotion?: AvatarEmotion;
    thinking?: boolean;
    modelKey?: string;
    onRendererChange?: (renderer: 'css-fallback' | 'purupuru-runtime') => void;
  }

  let { src, alt, speaking = false, mouthLevel = 0, emotion = 'neutral', thinking = false, modelKey = 'default', onRendererChange }: Props = $props();
  const level = $derived(Math.max(0, Math.min(1, Number.isFinite(mouthLevel) ? mouthLevel : 0)));
  const emotionSymbol = $derived({ neutral: '•', happy: '✦', sad: '●', angry: '!', surprised: '◆' }[emotion]);
  let canvas: HTMLCanvasElement;
  let renderer: PuruPuruRenderer | null = null;
  let disposeModel: (() => void) | null = null;
  let runtimeActive = $state(false);
  let modelName = $state('');
  let loadError = $state('');

  async function activateModel(blob: Blob, name: string) {
    renderer?.stop();
    disposeModel?.();
    renderer = null;
    disposeModel = null;
    runtimeActive = false;
    loadError = '';
    try {
      const model = await loadPuruPuruPackage(blob, name);
      disposeModel = model.dispose;
      renderer = new PuruPuruRenderer(canvas, model);
      renderer.start(() => level, () => speaking);
      modelName = name;
      runtimeActive = true;
      onRendererChange?.('purupuru-runtime');
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'モデルを読み込めませんでした。';
      onRendererChange?.('css-fallback');
    }
  }

  async function selectModel(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await activateModel(file, file.name);
    if (runtimeActive) await savePuruPuruModel(modelKey, file);
    input.value = '';
  }

  async function fetchBundledModel(): Promise<{ blob: Blob; name: string } | null> {
    for (const name of [`${modelKey}.purupuru`, 'default.purupuru']) {
      try {
        const response = await fetch(`/purupuru/${encodeURIComponent(name)}`);
        if (!response.ok) continue;
        const blob = await response.blob();
        const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
        if (head[0] === 0x50 && head[1] === 0x4b) return { blob, name };
      } catch {
        // 静的モデル未配置・オフラインはCSSフォールバックで続行する。
      }
    }
    return null;
  }

  onMount(() => {
    let disposed = false;
    onRendererChange?.('css-fallback');
    void (async () => {
      try {
        const stored = await getPuruPuruModel(modelKey);
        if (disposed) return;
        if (stored) {
          await activateModel(stored.blob, stored.name);
          return;
        }
        const bundled = await fetchBundledModel();
        if (!disposed && bundled) await activateModel(bundled.blob, bundled.name);
      } catch (error) {
        loadError = error instanceof Error ? error.message : '保存モデルを読み込めませんでした。';
      }
    })();
    return () => {
      disposed = true;
      renderer?.stop();
      disposeModel?.();
    };
  });
</script>

<div class="purupuru-avatar" class:speaking class:thinking data-renderer={runtimeActive ? 'purupuru-runtime' : 'css-fallback'} data-emotion={emotion} style={`--mouth-level:${level};--talk-speed:${Math.max(105, 230 - level * 100)}ms`} role="img" aria-label={`${alt}: ${speaking ? 'speaking' : thinking ? 'thinking' : emotion}`}>
  <div class="aura" aria-hidden="true"></div>
  <canvas bind:this={canvas} class:visible={runtimeActive} aria-hidden="true"></canvas>
  {#if !runtimeActive}
    <div class="float-layer"><div class="deform-layer"><img {src} alt="" draggable="false" /></div></div>
    <div class="mouth-meter" class:active={speaking} aria-hidden="true"><i></i><i></i><i></i></div>
  {/if}
  <span class="emotion-mark" aria-hidden="true">{emotionSymbol}</span>
  <label class="model-picker" title={modelName || 'PuruPuruモデルを読み込む'}>
    <span>{runtimeActive ? 'P' : '+'}</span>
    <input type="file" accept=".purupuru,application/vnd.purupuru.avatar+zip" onchange={selectModel} />
  </label>
  {#if loadError}<span class="model-error" title={loadError}>!</span>{/if}
</div>

<style>
  .purupuru-avatar { --emotion-color:34,211,238; position:relative; width:100%; height:100%; isolation:isolate; overflow:hidden; border-radius:inherit; background:#020617; }
  .purupuru-avatar[data-emotion='happy'] { --emotion-color:250,204,21; }
  .purupuru-avatar[data-emotion='sad'] { --emotion-color:96,165,250; }
  .purupuru-avatar[data-emotion='angry'] { --emotion-color:248,113,113; }
  .purupuru-avatar[data-emotion='surprised'] { --emotion-color:192,132,252; }
  canvas { position:absolute; inset:0; display:none; width:100%; height:100%; object-fit:contain; }
  canvas.visible { display:block; }
  .aura { position:absolute; inset:-20%; z-index:-1; opacity:.24; background:radial-gradient(circle,rgba(var(--emotion-color),.75),transparent 66%); transition:opacity .25s ease; }
  .speaking .aura { opacity:calc(.28 + var(--mouth-level) * .5); }
  .thinking .aura { animation:thinking-aura 1.25s ease-in-out infinite; }
  .float-layer,.deform-layer { width:100%; height:100%; transform-origin:center 82%; }
  .float-layer { animation:idle-purupuru 3.6s ease-in-out infinite; }
  .speaking .float-layer { animation:speaking-purupuru var(--talk-speed) ease-in-out infinite alternate; }
  .thinking .float-layer { animation:thinking-purupuru 1.8s ease-in-out infinite; }
  .deform-layer { transform:translateY(calc(var(--mouth-level) * -1.5px)) scaleX(calc(1 + var(--mouth-level) * .018)) scaleY(calc(1 - var(--mouth-level) * .012)); transition:transform 45ms linear; }
  img { display:block; width:100%; height:100%; object-fit:cover; user-select:none; }
  .emotion-mark { position:absolute; top:4px; right:5px; display:grid; place-items:center; width:14px; height:14px; border:1px solid rgba(var(--emotion-color),.55); border-radius:999px; background:rgba(2,6,23,.72); color:rgb(var(--emotion-color)); font:800 9px/1 ui-monospace,monospace; }
  .mouth-meter { position:absolute; left:50%; bottom:4px; display:flex; align-items:end; justify-content:center; gap:2px; width:24px; height:8px; padding:2px 3px; border-radius:999px; opacity:0; background:rgba(2,6,23,.68); transform:translateX(-50%); }
  .mouth-meter.active { opacity:.9; }
  .mouth-meter i { width:3px; min-height:1px; height:calc(1px + var(--mouth-level) * 5px); border-radius:999px; background:rgb(var(--emotion-color)); }
  .mouth-meter i:nth-child(2) { height:calc(2px + var(--mouth-level) * 6px); }
  .model-picker { position:absolute; left:5px; bottom:5px; z-index:3; display:grid; place-items:center; width:18px; height:18px; border:1px solid rgba(255,255,255,.32); border-radius:999px; color:#cffafe; background:rgba(2,6,23,.72); cursor:pointer; font:700 10px/1 ui-monospace,monospace; opacity:.72; }
  .model-picker:hover { opacity:1; }
  .model-picker input { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
  .model-error { position:absolute; left:27px; bottom:7px; z-index:3; color:#fca5a5; font:800 11px/1 ui-monospace,monospace; }
  @keyframes idle-purupuru { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-1px) rotate(.2deg)} }
  @keyframes speaking-purupuru { from{transform:rotate(-.35deg)} to{transform:translateY(calc(-1px - var(--mouth-level) * 1.5px)) rotate(.35deg)} }
  @keyframes thinking-purupuru { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px) rotate(-.5deg)} }
  @keyframes thinking-aura { 0%,100%{opacity:.18;transform:scale(.92)} 50%{opacity:.5;transform:scale(1.04)} }
  @media (prefers-reduced-motion:reduce) { .float-layer,.speaking .float-layer,.thinking .float-layer,.thinking .aura{animation:none} }
</style>
