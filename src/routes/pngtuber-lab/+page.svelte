<script lang="ts">
  import { onDestroy } from 'svelte';
  import PNGTuberStage from '$lib/components/pngtuber/PNGTuberStage.svelte';
  import { characters, muryi } from '$lib/data/pngtuber/characters';
  import { characterStore } from '$lib/stores/characterStore.svelte';
  import type { PNGTuberCharacter } from '$lib/types/pngtuber';
  import type { MotionClip, MotionFrame, MouthShape } from '$lib/types/motion';

  // ─── キャラ / 手動操作 State ──────────────────────
  let selectedId = $state<string>(characterStore.current ? 'imported' : 'muryi');
  let speaking   = $state<boolean>(false);
  let mouthLevel = $state<number>(0.5);

  function makeImportedCharacter(dataUrl: string, name: string): PNGTuberCharacter {
    return {
      id: 'imported',
      name: name || 'Imported',
      assets: {
        base:  dataUrl,
        mouth: { close: dataUrl, mid: dataUrl, open: dataUrl },
        eyes:  { open: dataUrl, closed: dataUrl },
      },
      layout: { mouthX: 0, mouthY: 0, eyeX: 0, eyeY: 0 },
      motion: { swayScale: 1.0, blinkHoldMs: 120, breathingScale: 1.008 },
    };
  }

  const importedCharacter = $derived<PNGTuberCharacter | null>(
    characterStore.current
      ? makeImportedCharacter(characterStore.current.imageDataUrl, characterStore.current.name)
      : null
  );

  // imported が消えたら fallback へ
  $effect(() => {
    if (selectedId === 'imported' && !importedCharacter) selectedId = 'muryi';
  });

  const character = $derived<PNGTuberCharacter>(
    selectedId === 'imported' && importedCharacter
      ? importedCharacter
      : (characters[selectedId] as PNGTuberCharacter | undefined) ?? muryi
  );
  const characterEntries = Object.entries(characters) as [string, PNGTuberCharacter][];

  // ─── Motion State ─────────────────────────────────
  let clip:              MotionClip | null = $state(null);
  let clipFileName       = $state<string>('');
  let motionTime         = $state<number>(0);
  let isPlaying          = $state<boolean>(false);
  let blink              = $state<0 | 1>(0);
  let headX              = $state<number>(0);
  let headY              = $state<number>(0);
  let loadError          = $state<string>('');
  // JSON再生時はフレームのmouthShapeを直接stateにセット（reactive chain依存を排除）
  let motionMouthShape   = $state<MouthShape | undefined>(undefined);

  const motionProgress = $derived(
    clip && clip.meta.duration > 0
      ? (motionTime / clip.meta.duration) * 100
      : 0
  );

  // ─── JSON パース ──────────────────────────────────
  function isMotionClip(v: unknown): v is MotionClip {
    if (typeof v !== 'object' || v === null) return false;
    const obj = v as Record<string, unknown>;
    const meta = obj['meta'];
    if (typeof meta !== 'object' || meta === null) return false;
    const m = meta as Record<string, unknown>;
    if (typeof m['fps']      !== 'number') return false;
    if (typeof m['duration'] !== 'number') return false;
    if (typeof m['source']   !== 'string') return false;
    if (!Array.isArray(obj['frames']))     return false;
    return true;
  }

  async function onJsonChange(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    input.value = '';
    loadError = '';
    try {
      const text     = await file.text();
      const raw: unknown = JSON.parse(text);
      if (!isMotionClip(raw)) throw new Error('MotionClip 形式ではありません');
      stopPlayback();
      clip         = raw;
      clipFileName = file.name;
      motionTime   = 0;
      if (raw.meta.characterImage) {
        characterStore.set(raw.meta.characterImage, raw.meta.characterName ?? raw.meta.source);
        selectedId = 'imported';
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'JSON 読み込みエラー';
      clip = null;
    }
  }

  // ─── フレーム検索 (二分探索) ─────────────────────
  function findFrame(frames: MotionFrame[], t: number): MotionFrame | null {
    if (frames.length === 0) return null;
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (frames[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return frames[lo];
  }

  // ─── 再生エンジン ─────────────────────────────────
  let rafId:       number | null = null;
  let playStartMs: number        = 0;
  let playStartT:  number        = 0;

  function applyFrame(frame: MotionFrame): void {
    mouthLevel        = frame.mouth;
    speaking          = frame.mouth > 0.1;
    motionMouthShape  = frame.mouthShape;   // JSONの計算済み値を直接セット
    blink             = frame.blink;
    headX             = frame.headX;
    headY             = frame.headY;
  }

  function tick(): void {
    if (!clip || !isPlaying) return;
    const elapsed  = (performance.now() - playStartMs) / 1000;
    const nextTime = playStartT + elapsed;

    if (nextTime >= clip.meta.duration) {
      motionTime = clip.meta.duration;
      const last = findFrame(clip.frames, motionTime);
      if (last) applyFrame(last);
      stopPlayback();
      return;
    }

    motionTime = nextTime;
    const frame = findFrame(clip.frames, motionTime);
    if (frame) applyFrame(frame);
    rafId = requestAnimationFrame(tick);
  }

  function startPlayback(): void {
    if (!clip) return;
    // 末尾に達していたら先頭から
    if (motionTime >= clip.meta.duration) motionTime = 0;
    playStartMs = performance.now();
    playStartT  = motionTime;
    isPlaying   = true;
    rafId = requestAnimationFrame(tick);
  }

  function stopPlayback(): void {
    isPlaying        = false;
    motionMouthShape = undefined;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function seekTo(ratio: number): void {
    if (!clip) return;
    const t = Math.max(0, Math.min(1, ratio)) * clip.meta.duration;
    motionTime  = t;
    // 再生中なら基準時刻をリセット
    if (isPlaying) {
      playStartMs = performance.now();
      playStartT  = t;
    }
    const frame = findFrame(clip.frames, t);
    if (frame) applyFrame(frame);
  }

  function onSeekClick(e: MouseEvent): void {
    const bar  = e.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / rect.width);
  }

  onDestroy(stopPlayback);

  // ─── 時刻フォーマット ─────────────────────────────
  function fmtTime(t: number): string {
    if (!isFinite(t)) return '00:00.0';
    const m  = Math.floor(t / 60);
    const s  = Math.floor(t % 60);
    const ds = Math.floor((t % 1) * 10);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${ds}`;
  }
</script>

<svelte:head>
  <title>PNGTuber Lab</title>
</svelte:head>

<!-- 非表示 file input -->
<input id="json-input" type="file" accept=".json" onchange={onJsonChange} style="display:none" />

<div class="page">

  <!-- ══ Header ══ -->
  <header class="header">
    <span class="icon">◈</span>
    <h1>PNGTuber Lab</h1>
    <span class="tag">PREVIEW</span>
  </header>

  <!-- ══ Main ══ -->
  <div class="main">

    <!-- ── Stage ── -->
    <div class="stage-wrap">
      <PNGTuberStage
        {character}
        {speaking}
        {mouthLevel}
        mouthShape={motionMouthShape}
        {blink}
        {headX}
        {headY}
      />
    </div>

    <!-- ── Controls ── -->
    <aside class="controls">

      <!-- ▸▸ Motion JSON ── -->
      <section class="sec">
        <p class="label">Motion JSON</p>

        <button class="btn-load" onclick={() => document.getElementById('json-input')?.click()}>
          <span>⬆</span> Load .json
        </button>

        {#if loadError}
          <p class="err">{loadError}</p>
        {/if}

        {#if clip}
          <p class="clip-name" title={clipFileName}>{clipFileName}</p>

          <!-- Play / Stop -->
          <div class="play-row">
            <button
              class="play-btn"
              class:active={isPlaying}
              onclick={isPlaying ? stopPlayback : startPlayback}
            >
              {isPlaying ? '■ Stop' : '▶ Play'}
            </button>
            <span class="timecode">
              {fmtTime(motionTime)} / {fmtTime(clip.meta.duration)}
            </span>
          </div>

          <!-- シークバー -->
          <div
            class="seek-bar"
            role="slider"
            tabindex="0"
            aria-valuemin={0}
            aria-valuemax={clip.meta.duration}
            aria-valuenow={motionTime}
            onclick={onSeekClick}
            onkeydown={() => {}}
          >
            <div class="seek-fill" style="width:{motionProgress}%"></div>
            <div class="seek-knob" style="left:{motionProgress}%"></div>
          </div>

          <!-- クリップ情報 -->
          <div class="clip-info">
            <span>fps</span><b>{clip.meta.fps}</b>
            <span>frames</span><b>{clip.frames.length}</b>
            <span>dur</span><b>{clip.meta.duration.toFixed(2)}s</b>
          </div>

          <!-- 現フレーム値 -->
          <div class="frame-vals">
            <span class="fv">mouth <b>{mouthLevel.toFixed(2)}</b></span>
            <span class="fv">blink <b>{blink}</b></span>
            <span class="fv">headX <b>{headX.toFixed(2)}</b></span>
            <span class="fv">headY <b>{headY.toFixed(2)}</b></span>
          </div>
        {:else}
          <p class="hint">JSON を読み込むと自動再生可能になります</p>
        {/if}
      </section>

      <div class="hr"></div>

      <!-- キャラ選択 -->
      <section class="sec">
        <p class="label">Character</p>
        {#if importedCharacter}
          <div class="imported-badge">
            <img src={importedCharacter.assets.base} alt="char" class="imported-thumb">
            <span class="imported-name">{importedCharacter.name}</span>
            <button class="imported-clear" onclick={() => { characterStore.clear(); selectedId = 'muryi'; }} title="Remove">✕</button>
          </div>
        {/if}
        <div class="select-wrap">
          <select class="sel" bind:value={selectedId}>
            {#if importedCharacter}
              <option value="imported">★ {importedCharacter.name}</option>
            {/if}
            {#each characterEntries as [id, ch]}
              <option value={id}>{ch.name}</option>
            {/each}
          </select>
          <span class="sel-arrow">▾</span>
        </div>
        <p class="hint">id: {character.id}</p>
      </section>

      <div class="hr"></div>

      <!-- Speaking トグル -->
      <section class="sec">
        <p class="label">Speaking</p>
        <button
          class="toggle-btn"
          class:on={speaking}
          onclick={() => { speaking = !speaking; }}
        >
          <span class="dot"></span>
          {speaking ? 'ON  — 発話中' : 'OFF — 待機中'}
        </button>
      </section>

      <div class="hr"></div>

      <!-- Mouth Level スライダー -->
      <section class="sec">
        <p class="label">
          Mouth Level
          <span class="badge">{mouthLevel.toFixed(2)}</span>
        </p>
        <input
          class="slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          bind:value={mouthLevel}
        />
        <div class="slider-ends">
          <span>Close</span>
          <span>Open</span>
        </div>
        <p class="hint mouth-hint">
          {mouthLevel < 0.25 ? '■ close' : mouthLevel < 0.6 ? '■ mid' : '■ open'}
        </p>
      </section>

      <div class="hr"></div>

      <!-- Info -->
      <section class="sec">
        <p class="label">Info</p>
        <div class="info-row"><span>swayScale</span>   <b>{character.motion.swayScale}</b></div>
        <div class="info-row"><span>blinkHoldMs</span> <b>{character.motion.blinkHoldMs}</b></div>
        <div class="info-row"><span>breathScale</span> <b>{character.motion.breathingScale}</b></div>
      </section>

    </aside>
  </div>
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background: #05070b;
    color: #d8e2f0;
    font-family: 'Segoe UI', 'Hiragino Sans', system-ui, sans-serif;
    overflow-x: hidden;
  }

  .page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(1000px 500px at 60% -10%, rgba(99, 102, 241, 0.1), transparent 55%),
      radial-gradient(700px 400px at -5% 100%, rgba(56, 189, 248, 0.06), transparent 55%),
      #05070b;
  }

  /* ══ Header ══ */
  .header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 22px 32px 18px;
    border-bottom: 1px solid rgba(99, 102, 241, 0.2);
  }
  .icon {
    font-size: 22px;
    color: #818cf8;
    text-shadow: 0 0 12px rgba(99, 102, 241, 0.7);
  }
  .header h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #e2eaf8;
  }
  .tag {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: #818cf8;
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 4px;
    padding: 2px 8px;
  }

  /* ══ Main ══ */
  .main {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 300px;
  }

  .stage-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    border-right: 1px solid rgba(99, 102, 241, 0.15);
    background:
      repeating-linear-gradient(
        0deg,
        rgba(99, 102, 241, 0.02) 0px, rgba(99, 102, 241, 0.02) 1px,
        transparent 1px, transparent 40px
      ),
      repeating-linear-gradient(
        90deg,
        rgba(99, 102, 241, 0.02) 0px, rgba(99, 102, 241, 0.02) 1px,
        transparent 1px, transparent 40px
      );
  }

  /* ── Controls ── */
  .controls {
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .sec       { margin-bottom: 4px; }
  .hr        {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.25), transparent);
    margin: 16px 0 20px;
  }

  .label {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #5b6b8a;
  }

  .hint {
    font-size: 11px;
    color: #3d4f6a;
    margin: 8px 0 0;
    letter-spacing: 0.04em;
  }

  .badge {
    display: inline-block;
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border-radius: 4px;
    padding: 1px 8px;
    font-size: 12px;
    margin-left: 6px;
    font-variant-numeric: tabular-nums;
  }

  /* ── Motion JSON ── */
  .btn-load {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 11px 14px;
    background: rgba(14, 18, 30, 0.8);
    border: 1px solid rgba(99, 102, 241, 0.35);
    border-radius: 8px;
    color: #94a3c0;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    margin-bottom: 10px;
  }
  .btn-load:hover {
    border-color: #818cf8;
    color: #c4c9f8;
  }

  .err {
    font-size: 11px;
    color: #f87171;
    margin: 0 0 8px;
    padding: 6px 10px;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 6px;
  }

  .clip-name {
    font-size: 11px;
    color: #818cf8;
    margin: 0 0 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'Consolas', monospace;
  }

  .play-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .play-btn {
    flex-shrink: 0;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    border: 1px solid rgba(99, 102, 241, 0.4);
    background: rgba(14, 18, 30, 0.8);
    color: #818cf8;
    transition: all 0.15s;
  }
  .play-btn:hover     { background: rgba(99, 102, 241, 0.15); }
  .play-btn.active    {
    background: rgba(99, 102, 241, 0.18);
    border-color: #818cf8;
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.3);
  }

  .timecode {
    font-size: 11px;
    color: #6b7c9a;
    font-family: 'Consolas', monospace;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* シークバー */
  .seek-bar {
    position: relative;
    height: 6px;
    background: rgba(30, 41, 59, 0.8);
    border-radius: 3px;
    cursor: pointer;
    margin-bottom: 10px;
    overflow: visible;
  }
  .seek-fill {
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #818cf8);
    border-radius: 3px;
    box-shadow: 0 0 6px rgba(99, 102, 241, 0.5);
    transition: width 0.05s linear;
  }
  .seek-knob {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #c7d3f8;
    box-shadow: 0 0 8px rgba(99, 102, 241, 0.8);
    transform: translate(-50%, -50%);
    transition: left 0.05s linear;
    pointer-events: none;
  }

  .clip-info {
    display: grid;
    grid-template-columns: auto auto auto auto auto auto;
    gap: 4px 8px;
    font-size: 11px;
    margin-bottom: 8px;
    align-items: center;
  }
  .clip-info span { color: #4a5875; }
  .clip-info b    {
    color: #818cf8;
    font-variant-numeric: tabular-nums;
    font-family: 'Consolas', monospace;
  }

  .frame-vals {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .fv {
    font-size: 10px;
    color: #4a5875;
    background: rgba(99, 102, 241, 0.06);
    border: 1px solid rgba(99, 102, 241, 0.15);
    border-radius: 4px;
    padding: 2px 6px;
    font-family: 'Consolas', monospace;
  }
  .fv b { color: #818cf8; }

  /* ── Imported character badge ── */
  .imported-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    padding: 6px 10px;
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 8px;
  }
  .imported-thumb {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid rgba(99, 102, 241, 0.25);
    flex-shrink: 0;
  }
  .imported-name {
    flex: 1;
    font-size: 11px;
    color: #818cf8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .imported-clear {
    background: none;
    border: none;
    color: #4a5875;
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
    flex-shrink: 0;
    border-radius: 3px;
    transition: color 0.15s;
  }
  .imported-clear:hover { color: #f87171; }

  /* ── Select ── */
  .select-wrap { position: relative; }
  .sel {
    width: 100%;
    padding: 11px 36px 11px 14px;
    background: rgba(14, 18, 30, 0.8);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 8px;
    color: #c7d3e8;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    appearance: none;
    outline: none;
    transition: border-color 0.15s;
  }
  .sel:hover, .sel:focus { border-color: #818cf8; }
  .sel-arrow {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #818cf8;
    pointer-events: none;
    font-size: 12px;
  }

  /* ── Toggle ── */
  .toggle-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 13px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    border: 1px solid rgba(99, 102, 241, 0.25);
    background: rgba(14, 18, 30, 0.7);
    color: #5b6b8a;
    transition: all 0.15s;
  }
  .toggle-btn.on {
    border-color: rgba(99, 102, 241, 0.6);
    background: rgba(99, 102, 241, 0.12);
    color: #818cf8;
    box-shadow: 0 0 18px rgba(99, 102, 241, 0.2);
  }
  .toggle-btn .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #3d4f6a;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .toggle-btn.on .dot {
    background: #818cf8;
    box-shadow: 0 0 8px #818cf8;
    animation: blink-dot 1s infinite;
  }
  @keyframes blink-dot {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  /* ── Slider ── */
  .slider {
    width: 100%;
    accent-color: #818cf8;
    height: 6px;
    cursor: pointer;
  }
  .slider-ends {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #3d4f6a;
    margin-top: 6px;
  }
  .mouth-hint { color: #818cf8; font-weight: 600; }

  /* ── Info rows ── */
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 7px 0;
    border-bottom: 1px dashed rgba(99, 102, 241, 0.1);
    font-size: 12px;
  }
  .info-row:last-child { border-bottom: none; }
  .info-row span { color: #5b6b8a; }
  .info-row b {
    color: #94a3c0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-family: 'Consolas', monospace;
  }
</style>
