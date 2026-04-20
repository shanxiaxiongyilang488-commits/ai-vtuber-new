<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // ─────────── State ───────────
  let videoFile = $state<File | null>(null);
  let videoURL  = $state<string>('');
  let videoName = $state<string>('');

  let imageFile = $state<File | null>(null);
  let imageURL  = $state<string>('');
  let imageName = $state<string>('');

  let videoEl    = $state<HTMLVideoElement | null>(null);
  let videoInput = $state<HTMLInputElement | null>(null);
  let imageInput = $state<HTMLInputElement | null>(null);

  let isPlaying   = $state<boolean>(false);
  let currentTime = $state<number>(0);
  let duration    = $state<number>(0);

  let fps         = $state<number>(30);
  let sensitivity = $state<number>(50);

  type LipRow = { time: number; mouth_open: number; mouth_mid: number; mouth_close: number };
  let mouthOpen  = $state<number>(0);
  let mouthMid   = $state<number>(0);
  let mouthClose = $state<number>(1);
  let csvLog     = $state<LipRow[]>([]);

  let ticker: ReturnType<typeof setInterval> | null = null;

  // ─────────── Derived ───────────
  const hasVideo = $derived(videoURL !== '');
  const hasImage = $derived(videoURL === '' && imageURL !== '');
  const progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);
  const csvReady = $derived(csvLog.length > 0);

  const fpsOptions = [24, 30, 60];

  // ─────────── Helpers ───────────
  function fmtTime(t: number): string {
    if (!isFinite(t)) return '00:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function clearVideo(): void {
    if (videoURL) URL.revokeObjectURL(videoURL);
    videoFile   = null;
    videoURL    = '';
    videoName   = '';
    currentTime = 0;
    duration    = 0;
    isPlaying   = false;
  }

  function clearImage(): void {
    if (imageURL) URL.revokeObjectURL(imageURL);
    imageFile = null;
    imageURL  = '';
    imageName = '';
  }

  function loadVideo(file: File): void {
    clearImage();
    clearVideo();
    videoFile = file;
    videoName = file.name;
    videoURL  = URL.createObjectURL(file);
    csvLog    = [];
  }

  function loadImage(file: File): void {
    clearVideo();
    clearImage();
    imageFile = file;
    imageName = file.name;
    imageURL  = URL.createObjectURL(file);
  }

  function onVideoChange(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) loadVideo(file);
    input.value = '';
  }

  function onImageChange(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) loadImage(file);
    input.value = '';
  }

  function togglePlay(): void {
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.muted = false;
      videoEl.volume = 1;
      void videoEl.play();
    } else {
      videoEl.pause();
    }
  }

  function onPlay(): void  { isPlaying = true; }
  function onPause(): void { isPlaying = false; }
  function onEnded(): void { isPlaying = false; }

  function onTimeUpdate(): void {
    if (videoEl) currentTime = videoEl.currentTime;
  }

  function onLoadedMetadata(): void {
    if (videoEl) duration = videoEl.duration;
  }

  function onSeekClick(e: MouseEvent): void {
    if (!videoEl || duration <= 0) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoEl.currentTime = ratio * duration;
  }

  function exportCSV(): void {
    if (csvLog.length === 0) return;
    const header = 'time,mouth_open,mouth_mid,mouth_close\n';
    const rows = csvLog
      .map((r) => `${r.time.toFixed(3)},${r.mouth_open},${r.mouth_mid},${r.mouth_close}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lipsync_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─────────── Lifecycle ───────────
  onMount(() => {
    ticker = setInterval(() => {
      if (!isPlaying) return;
      const amp = sensitivity / 100;
      const o = +(((Math.sin(currentTime * 3) + 1) / 2) * amp).toFixed(2);
      const c = +(1 - o).toFixed(2);
      const m = +(Math.min(o, c) * 0.6).toFixed(2);
      mouthOpen  = o;
      mouthMid   = m;
      mouthClose = c;
      csvLog = [
        ...csvLog,
        { time: +currentTime.toFixed(3), mouth_open: o, mouth_mid: m, mouth_close: c },
      ];
    }, 1000 / fps);
  });

  onDestroy(() => {
    if (ticker) clearInterval(ticker);
    if (videoURL) URL.revokeObjectURL(videoURL);
    if (imageURL) URL.revokeObjectURL(imageURL);
  });
</script>

<svelte:head>
  <title>Motion Viewer</title>
</svelte:head>

<input
  bind:this={videoInput}
  type="file"
  accept="video/mp4,video/webm"
  onchange={onVideoChange}
  style="display:none"
>

<input
  bind:this={imageInput}
  type="file"
  accept="image/png,image/jpeg,image/jpg"
  onchange={onImageChange}
  style="display:none"
>

<div class="page">

  <!-- ═══ LEFT PANEL ═══ -->
  <aside class="panel">
    <header class="panel-head">
      <span class="icon">◆</span>
      <h2>Control</h2>
    </header>

    <section class="sec">
      <p class="label">Media Input</p>
      <button class="btn primary" onclick={() => videoInput?.click()}>
        <span>▶</span> Load Video
      </button>
      <button class="btn secondary" onclick={() => imageInput?.click()}>
        <span>◈</span> Load Image
      </button>
      <p class="hint">mp4 / webm &nbsp;·&nbsp; png / jpg</p>
    </section>

    <div class="hr"></div>

    <section class="sec">
      <p class="label">Frame Rate</p>
      <div class="seg">
        {#each fpsOptions as f}
          <button
            class="seg-btn"
            class:on={fps === f}
            onclick={() => { fps = f; }}
          >{f}</button>
        {/each}
      </div>
    </section>

    <div class="hr"></div>

    <section class="sec">
      <p class="label">Sensitivity <span class="badge">{sensitivity}</span></p>
      <input class="slider" type="range" min="0" max="100" bind:value={sensitivity}>
      <div class="slider-ends">
        <span>Low</span>
        <span>High</span>
      </div>
    </section>

    <div class="hr"></div>

    <section class="sec">
      <p class="label">Export</p>
      <button
        class="btn accent"
        class:disabled-btn={!csvReady}
        disabled={!csvReady}
        onclick={exportCSV}
      >
        <span>⬇</span> Export CSV
        {#if csvReady}<span class="count">{csvLog.length}</span>{/if}
      </button>
      <p class="hint">再生中データを出力</p>
    </section>
  </aside>

  <!-- ═══ CENTER PANEL ═══ -->
  <main class="panel viewer">
    <header class="panel-head">
      <span class="icon">◉</span>
      <h2>Viewer</h2>
      {#if videoName || imageName}
        <span class="fname">{videoName || imageName}</span>
      {/if}
    </header>

    <div class="stage">
      {#if hasVideo}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={videoEl}
          src={videoURL}
          class="media"
          playsinline
          preload="auto"
          onplay={onPlay}
          onpause={onPause}
          onended={onEnded}
          ontimeupdate={onTimeUpdate}
          onloadedmetadata={onLoadedMetadata}
        ></video>
      {:else if hasImage}
        <img src={imageURL} alt={imageName} class="media">
      {:else}
        <div class="placeholder">
          <div class="ph-icon">◎</div>
          <p class="ph-title">No media loaded</p>
          <p class="ph-sub">Load video or image from the left panel</p>
        </div>
      {/if}
    </div>

    <div class="controls">
      <button
        class="play-btn"
        class:disabled-btn={!hasVideo}
        disabled={!hasVideo}
        onclick={togglePlay}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <span class="time">{fmtTime(currentTime)}</span>

      <div
        class="bar"
        role="slider"
        tabindex="0"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        onclick={onSeekClick}
        onkeydown={() => {}}
      >
        <div class="bar-fill" style="width:{progress}%"></div>
        <div class="bar-knob" style="left:{progress}%"></div>
      </div>

      <span class="time">{fmtTime(duration)}</span>
    </div>
  </main>

  <!-- ═══ RIGHT PANEL ═══ -->
  <aside class="panel">
    <header class="panel-head">
      <span class="icon">◈</span>
      <h2>Output</h2>
    </header>

    <section class="sec">
      <p class="label">Lip Sync</p>
      <div class="out-row">
        <span class="out-key">mouth_open</span>
        <span class="out-val">{mouthOpen.toFixed(2)}</span>
      </div>
      <div class="out-bar"><div class="out-fill" style="width:{mouthOpen * 100}%"></div></div>

      <div class="out-row">
        <span class="out-key">mouth_mid</span>
        <span class="out-val">{mouthMid.toFixed(2)}</span>
      </div>
      <div class="out-bar"><div class="out-fill" style="width:{mouthMid * 100}%"></div></div>

      <div class="out-row">
        <span class="out-key">mouth_close</span>
        <span class="out-val">{mouthClose.toFixed(2)}</span>
      </div>
      <div class="out-bar"><div class="out-fill" style="width:{mouthClose * 100}%"></div></div>
    </section>

    <div class="hr"></div>

    <section class="sec">
      <p class="label">Status</p>
      <div class="status" class:active={isPlaying}>
        <span class="dot"></span>
        {#if isPlaying}
          Analyzing
        {:else if hasVideo}
          Video ready
        {:else if hasImage}
          Image loaded
        {:else}
          Standby
        {/if}
      </div>
    </section>

    <div class="hr"></div>

    <section class="sec">
      <p class="label">Info</p>
      <div class="info-row"><span>FPS</span><b>{fps}</b></div>
      <div class="info-row"><span>Frames</span><b>{hasVideo && duration > 0 ? Math.floor(duration * fps) : '—'}</b></div>
      <div class="info-row"><span>Logged</span><b>{csvLog.length}</b></div>
    </section>
  </aside>
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
    display: grid;
    grid-template-columns: 310px 1fr 300px;
    gap: 18px;
    padding: 18px;
    min-height: 100vh;
    background:
      radial-gradient(1200px 600px at 80% -10%, rgba(56, 189, 248, 0.08), transparent 60%),
      radial-gradient(900px 500px at -10% 110%, rgba(99, 102, 241, 0.06), transparent 60%),
      #05070b;
  }

  /* ═══ Glass Panel ═══ */
  .panel {
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, rgba(18, 24, 38, 0.7), rgba(10, 14, 22, 0.7));
    border: 1px solid rgba(56, 189, 248, 0.15);
    border-radius: 14px;
    padding: 28px 24px;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow:
      0 0 40px rgba(56, 189, 248, 0.04),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  .panel.viewer {
    padding: 28px 32px;
  }

  .panel-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 26px;
    padding-bottom: 18px;
    border-bottom: 1px solid rgba(56, 189, 248, 0.12);
  }

  .panel-head h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #e2eaf8;
  }

  .icon {
    color: #38bdf8;
    font-size: 20px;
    text-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
  }

  .fname {
    margin-left: auto;
    font-size: 12px;
    color: #6b7c96;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ═══ Sections ═══ */
  .sec {
    margin-bottom: 20px;
  }

  .label {
    margin: 0 0 12px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #5b7091;
  }

  .hr {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.18), transparent);
    margin: 18px 0 22px;
  }

  .hint {
    font-size: 11px;
    color: #4a5875;
    margin: 10px 0 0;
    letter-spacing: 0.04em;
  }

  .badge {
    display: inline-block;
    background: rgba(56, 189, 248, 0.12);
    color: #38bdf8;
    border-radius: 4px;
    padding: 1px 8px;
    font-size: 12px;
    margin-left: 6px;
    font-variant-numeric: tabular-nums;
  }

  /* ═══ Buttons ═══ */
  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 13px 18px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s ease;
    margin-bottom: 10px;
  }

  .btn.primary {
    background: linear-gradient(135deg, #0ea5e9, #6366f1);
    color: #fff;
    border-color: rgba(56, 189, 248, 0.4);
    box-shadow: 0 0 20px rgba(56, 189, 248, 0.2);
  }
  .btn.primary:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
    box-shadow: 0 0 28px rgba(56, 189, 248, 0.35);
  }

  .btn.secondary {
    background: rgba(20, 30, 48, 0.6);
    color: #94a9cc;
    border-color: rgba(56, 189, 248, 0.2);
  }
  .btn.secondary:hover {
    border-color: #38bdf8;
    color: #38bdf8;
  }

  .btn.accent {
    background: rgba(22, 101, 52, 0.15);
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.3);
  }
  .btn.accent:hover:not(.disabled-btn) {
    background: rgba(22, 101, 52, 0.3);
    box-shadow: 0 0 20px rgba(74, 222, 128, 0.2);
  }

  .btn.disabled-btn,
  .btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    filter: none;
    transform: none;
    box-shadow: none;
  }

  .count {
    background: rgba(74, 222, 128, 0.2);
    color: #4ade80;
    border-radius: 10px;
    padding: 1px 8px;
    font-size: 11px;
    margin-left: 4px;
    font-variant-numeric: tabular-nums;
  }

  /* ═══ Segment ═══ */
  .seg {
    display: flex;
    gap: 8px;
  }
  .seg-btn {
    flex: 1;
    padding: 11px 0;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    background: rgba(17, 22, 32, 0.7);
    border: 1px solid rgba(56, 189, 248, 0.15);
    color: #6b7c96;
    transition: all 0.15s;
  }
  .seg-btn.on {
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(99, 102, 241, 0.25));
    border-color: #38bdf8;
    color: #38bdf8;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
  }
  .seg-btn:hover:not(.on) {
    border-color: rgba(56, 189, 248, 0.4);
    color: #94a9cc;
  }

  /* ═══ Slider ═══ */
  .slider {
    width: 100%;
    accent-color: #38bdf8;
    height: 6px;
    cursor: pointer;
  }
  .slider-ends {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #4a5875;
    margin-top: 6px;
  }

  /* ═══ Viewer Stage ═══ */
  .stage {
    flex: 1;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
    border: 1px solid rgba(56, 189, 248, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 420px;
    position: relative;
  }

  .media {
    max-width: 100%;
    max-height: 64vh;
    width: 100%;
    object-fit: contain;
    display: block;
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 60px;
    text-align: center;
  }
  .ph-icon {
    font-size: 72px;
    color: rgba(56, 189, 248, 0.3);
    text-shadow: 0 0 30px rgba(56, 189, 248, 0.3);
  }
  .ph-title {
    font-size: 22px;
    font-weight: 700;
    color: #6b7c96;
    margin: 0;
    letter-spacing: 0.05em;
  }
  .ph-sub {
    font-size: 13px;
    color: #4a5875;
    margin: 0;
  }

  /* ═══ Controls ═══ */
  .controls {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 18px;
    padding: 14px 18px;
    background: rgba(10, 14, 22, 0.6);
    border: 1px solid rgba(56, 189, 248, 0.12);
    border-radius: 10px;
  }

  .play-btn {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: linear-gradient(135deg, #0ea5e9, #6366f1);
    border: none;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s;
    box-shadow: 0 0 20px rgba(56, 189, 248, 0.3);
  }
  .play-btn:hover:not(.disabled-btn) {
    transform: scale(1.08);
  }
  .play-btn.disabled-btn {
    opacity: 0.3;
    cursor: not-allowed;
    box-shadow: none;
  }

  .time {
    font-size: 13px;
    color: #6b7c96;
    font-variant-numeric: tabular-nums;
    font-family: 'Consolas', monospace;
    white-space: nowrap;
    min-width: 48px;
  }

  .bar {
    flex: 1;
    height: 8px;
    background: rgba(30, 41, 59, 0.8);
    border-radius: 4px;
    cursor: pointer;
    position: relative;
    overflow: visible;
  }
  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #0ea5e9, #6366f1);
    border-radius: 4px;
    transition: width 0.1s linear;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.4);
  }
  .bar-knob {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.8);
    transform: translate(-50%, -50%);
    transition: left 0.1s linear;
  }

  /* ═══ Output ═══ */
  .out-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
  }
  .out-key {
    font-size: 12px;
    color: #6b7c96;
    font-family: 'Consolas', monospace;
    letter-spacing: 0.03em;
  }
  .out-val {
    font-size: 18px;
    font-weight: 700;
    color: #38bdf8;
    font-family: 'Consolas', monospace;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
  }
  .out-bar {
    height: 4px;
    background: rgba(30, 41, 59, 0.6);
    border-radius: 2px;
    margin-bottom: 14px;
    overflow: hidden;
  }
  .out-fill {
    height: 100%;
    background: linear-gradient(90deg, #0ea5e9, #38bdf8);
    border-radius: 2px;
    transition: width 0.1s linear;
    box-shadow: 0 0 6px rgba(56, 189, 248, 0.5);
  }

  /* ═══ Status ═══ */
  .status {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    background: rgba(30, 20, 10, 0.5);
    border: 1px solid rgba(202, 138, 4, 0.25);
    color: #ca8a04;
    letter-spacing: 0.04em;
  }
  .status.active {
    background: rgba(15, 30, 15, 0.6);
    border-color: rgba(74, 222, 128, 0.3);
    color: #4ade80;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ca8a04;
    flex-shrink: 0;
  }
  .status.active .dot {
    background: #4ade80;
    box-shadow: 0 0 8px #4ade80;
    animation: pulse 1s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.3; }
  }

  /* ═══ Info Rows ═══ */
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px dashed rgba(56, 189, 248, 0.08);
    font-size: 13px;
  }
  .info-row:last-child {
    border-bottom: none;
  }
  .info-row span {
    color: #6b7c96;
  }
  .info-row b {
    color: #94a9cc;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-family: 'Consolas', monospace;
  }
</style>
