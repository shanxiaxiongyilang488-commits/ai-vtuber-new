<script lang="ts">
  import { MOUTH_LABELS } from '$lib/types/mouth-picker';
  import type { TagMap, FramesResponse, ExportResponse } from '$lib/types/mouth-picker';
  import type { MouthShape } from '$lib/types/motion';

  let videoFile = $state<File | null>(null);
  let isExtracting = $state(false);
  let extractError = $state('');
  let frames = $state<string[]>([]);
  let currentIndex = $state(0);
  let tags = $state<TagMap>({});
  let isExporting = $state(false);
  let exportPaths = $state<{ shape: string; path: string }[]>([]);

  const currentFrame = $derived(frames[currentIndex] ?? null);
  const currentTag = $derived(currentFrame ? (tags[currentFrame] ?? null) : null);
  const tagCounts = $derived({
    open:  Object.values(tags).filter((v) => v === 'open').length,
    mid:   Object.values(tags).filter((v) => v === 'mid').length,
    close: Object.values(tags).filter((v) => v === 'close').length,
  });
  const taggedEntries = $derived(Object.entries(tags));

  async function extract() {
    if (!videoFile) return;
    isExtracting = true;
    extractError = '';
    frames = [];
    tags = {};
    exportPaths = [];

    try {
      const fd = new FormData();
      fd.append('file', videoFile);
      const res = await fetch('/api/export-frames', { method: 'POST', body: fd });
      const result = await res.json();
      if (!result.ok) throw new Error(result.error ?? 'ffmpeg failed');

      const frRes = await fetch('/api/mouth-picker/frames');
      const frData: FramesResponse = await frRes.json();
      frames = frData.files ?? [];
      currentIndex = 0;
    } catch (e) {
      extractError = String(e);
    } finally {
      isExtracting = false;
    }
  }

  function tagCurrent(shape: MouthShape) {
    if (!currentFrame) return;
    tags = { ...tags, [currentFrame]: shape };
  }

  function untag(filename: string) {
    const next = { ...tags };
    delete next[filename];
    tags = next;
  }

  function downloadFrame(filename: string, shape: MouthShape) {
    const nameMap: Record<MouthShape, string> = {
      open:  'mouth_open',
      mid:   'mouth_mid',
      close: 'mouth_close',
    };
    const a = document.createElement('a');
    a.href = `/frames/${filename}`;
    a.download = `${nameMap[shape]}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function exportToStatic() {
    if (taggedEntries.length === 0) return;
    isExporting = true;
    exportPaths = [];
    try {
      const res = await fetch('/api/mouth-picker/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      const data: ExportResponse = await res.json();
      if (!data.ok || !data.manifest) throw new Error(data.error ?? 'export failed');
      exportPaths = Object.entries(data.manifest).map(([shape, p]) => ({ shape, path: p }));
    } catch (e) {
      extractError = String(e);
    } finally {
      isExporting = false;
    }
  }

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    videoFile = input.files?.[0] ?? null;
    frames = [];
    tags = {};
    extractError = '';
    exportPaths = [];
  }

  function prev() { if (currentIndex > 0) currentIndex -= 1; }
  function next() { if (currentIndex < frames.length - 1) currentIndex += 1; }

  function handleKey(e: KeyboardEvent) {
    if (frames.length === 0) return;
    const tag = e.target as HTMLElement;
    if (tag.tagName === 'INPUT') return;
    switch (e.key) {
      case 'o': case 'O': tagCurrent('open'); break;
      case 'h': case 'H': tagCurrent('mid'); break;
      case 'c': case 'C': tagCurrent('close'); break;
      case 'ArrowRight': next(); break;
      case 'ArrowLeft':  prev(); break;
    }
  }
</script>

<svelte:window onkeydown={handleKey} />

<div class="page">
  <header class="header">
    <h1>MOUTH PICKER <span class="sub">口パク素材ピッカー</span></h1>
    <a href="/" class="back">← HOME</a>
  </header>

  <!-- ── Step 1: Upload ── -->
  <section class="card">
    <h2><span class="step">01</span> 動画を選択してフレーム抽出</h2>
    <p class="hint">推奨: 10秒以内のMP4 &nbsp;|&nbsp; 30fps で抽出されます &nbsp;|&nbsp; FFmpeg が必要</p>
    <div class="upload-row">
      <label class="file-label">
        <input type="file" accept=".mp4,.webm" onchange={onFileChange} class="file-input" />
        {videoFile ? videoFile.name : 'ファイルを選択'}
      </label>
      <button class="btn btn-primary" onclick={extract} disabled={!videoFile || isExtracting}>
        {isExtracting ? '抽出中...' : 'フレーム抽出'}
      </button>
    </div>
    {#if extractError}
      <p class="error">⚠ {extractError}</p>
    {/if}
    {#if frames.length > 0}
      <p class="ok">✓ {frames.length} フレームを抽出しました</p>
    {/if}
  </section>

  <!-- ── Step 2: Browse & Tag ── -->
  {#if frames.length > 0}
    <section class="card">
      <h2><span class="step">02</span> タグ付け &nbsp;<span class="hint-inline">キー: O=open &nbsp;H=half &nbsp;C=close &nbsp;←→=移動</span></h2>

      <div class="viewer">
        {#if currentFrame}
          <img class="frame-img" src="/frames/{currentFrame}" alt="frame {currentIndex + 1}" />
          {#if currentTag}
            <span class="tag-badge shape-{currentTag}">
              {currentTag === 'mid' ? 'HALF' : currentTag.toUpperCase()}
            </span>
          {/if}
        {/if}
      </div>

      <div class="seek-row">
        <button class="btn btn-nav" onclick={prev} disabled={currentIndex === 0}>◀</button>
        <input
          class="slider"
          type="range"
          min="0"
          max={frames.length - 1}
          bind:value={currentIndex}
        />
        <button class="btn btn-nav" onclick={next} disabled={currentIndex === frames.length - 1}>▶</button>
        <span class="frame-count">{currentIndex + 1} / {frames.length}</span>
      </div>

      <div class="tag-buttons">
        {#each MOUTH_LABELS as { label, shape }}
          <button
            class="tag-btn shape-{shape}"
            class:active={currentTag === shape}
            onclick={() => tagCurrent(shape)}
          >
            {label}
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ── Step 3: Export ── -->
  {#if taggedEntries.length > 0}
    <section class="card">
      <h2><span class="step">03</span> ダウンロード &amp; エクスポート</h2>

      <div class="counts">
        <span class="count shape-open">open: {tagCounts.open}</span>
        <span class="count shape-mid">half: {tagCounts.mid}</span>
        <span class="count shape-close">close: {tagCounts.close}</span>
      </div>

      <div class="export-actions">
        <button class="btn btn-export" onclick={exportToStatic} disabled={isExporting}>
          {isExporting ? 'エクスポート中...' : '✦ /static/ にエクスポート'}
        </button>
      </div>

      {#if exportPaths.length > 0}
        <div class="manifest">
          <p class="ok">✓ エクスポート完了 — 以下のパスに保存されました:</p>
          {#each exportPaths as { shape, path }}
            <div class="manifest-row">
              <span class="badge shape-{shape}">{shape === 'mid' ? 'half' : shape}</span>
              <code>{path}</code>
            </div>
          {/each}
        </div>
      {/if}

      <table class="export-table">
        <thead>
          <tr>
            <th>フレーム</th>
            <th>タグ</th>
            <th>DL</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each taggedEntries as [filename, shape]}
            <tr>
              <td class="filename">{filename}</td>
              <td><span class="badge shape-{shape}">{shape === 'mid' ? 'half' : shape}</span></td>
              <td>
                <button class="btn btn-dl" onclick={() => downloadFrame(filename, shape)}>
                  ↓
                </button>
              </td>
              <td>
                <button class="btn btn-remove" onclick={() => untag(filename)}>×</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>

<style>
  .page {
    min-height: 100vh;
    background: #0a0a0f;
    color: #e0e0f0;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  h1 {
    font-family: 'Orbitron', monospace;
    font-size: 1.5rem;
    color: #22d3ee;
    margin: 0;
    letter-spacing: 0.1em;
  }

  .sub {
    font-size: 0.85rem;
    color: #88aabb;
    margin-left: 0.75rem;
    font-family: sans-serif;
  }

  .back {
    color: #88aabb;
    text-decoration: none;
    font-size: 0.9rem;
  }
  .back:hover { color: #22d3ee; }

  .card {
    background: #111118;
    border: 1px solid #1e2a3a;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  h2 {
    font-family: 'Orbitron', monospace;
    font-size: 0.95rem;
    color: #a0c0d0;
    margin: 0 0 1rem 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .step {
    background: #22d3ee22;
    border: 1px solid #22d3ee66;
    color: #22d3ee;
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
  }

  .hint {
    color: #667788;
    font-size: 0.82rem;
    margin: -0.5rem 0 1rem 0;
  }

  .hint-inline {
    color: #556677;
    font-size: 0.75rem;
    font-family: monospace;
    font-weight: normal;
  }

  /* Upload */
  .upload-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .file-label {
    cursor: pointer;
    background: #1a2030;
    border: 1px solid #334455;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    color: #aabbcc;
    flex: 1;
    min-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-input {
    display: none;
  }

  /* Buttons */
  .btn {
    cursor: pointer;
    border: none;
    border-radius: 4px;
    padding: 0.5rem 1.25rem;
    font-family: 'Orbitron', monospace;
    font-size: 0.8rem;
    transition: opacity 0.15s;
  }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-primary {
    background: #22d3ee;
    color: #0a0a0f;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }

  .btn-nav {
    background: #1a2030;
    color: #aabbcc;
    border: 1px solid #334455;
    padding: 0.4rem 0.75rem;
  }
  .btn-nav:hover:not(:disabled) { border-color: #22d3ee; color: #22d3ee; }

  .btn-export {
    background: #a855f7;
    color: #fff;
    font-size: 0.85rem;
  }
  .btn-export:hover:not(:disabled) { opacity: 0.85; }

  .btn-dl {
    background: #1a2030;
    color: #22d3ee;
    border: 1px solid #22d3ee44;
    padding: 0.25rem 0.6rem;
    font-family: monospace;
    font-size: 0.9rem;
  }
  .btn-dl:hover { border-color: #22d3ee; }

  .btn-remove {
    background: transparent;
    color: #556677;
    border: 1px solid #334455;
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
  }
  .btn-remove:hover { color: #ff6677; border-color: #ff6677; }

  /* Viewer */
  .viewer {
    position: relative;
    display: inline-block;
    max-width: 100%;
    margin-bottom: 1rem;
    background: #000;
    border: 1px solid #1e2a3a;
    border-radius: 4px;
  }

  .frame-img {
    display: block;
    max-width: 100%;
    max-height: 400px;
    object-fit: contain;
  }

  .tag-badge {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-family: 'Orbitron', monospace;
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: 3px;
  }

  /* Seek */
  .seek-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .slider {
    flex: 1;
    accent-color: #22d3ee;
  }

  .frame-count {
    font-family: monospace;
    font-size: 0.85rem;
    color: #667788;
    white-space: nowrap;
  }

  /* Tag buttons */
  .tag-buttons {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .tag-btn {
    cursor: pointer;
    font-family: 'Orbitron', monospace;
    font-size: 0.85rem;
    padding: 0.6rem 1.5rem;
    border-radius: 4px;
    border: 2px solid transparent;
    transition: all 0.1s;
  }

  /* Counts */
  .counts {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 1rem;
    font-family: monospace;
    font-size: 1rem;
  }

  .export-actions {
    margin-bottom: 1rem;
  }

  /* Manifest */
  .manifest {
    background: #0d1520;
    border: 1px solid #1e3a2a;
    border-radius: 4px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
  }

  .manifest-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.4rem;
  }

  .manifest-row code {
    color: #88ccaa;
    font-size: 0.85rem;
  }

  /* Table */
  .export-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    margin-top: 0.5rem;
  }

  .export-table th {
    text-align: left;
    color: #556677;
    font-weight: normal;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid #1e2a3a;
    font-size: 0.8rem;
  }

  .export-table td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid #111820;
    vertical-align: middle;
  }

  .filename {
    font-family: monospace;
    font-size: 0.82rem;
    color: #778899;
  }

  /* Shape color system */
  .shape-open  { --c: #22d3ee; }
  .shape-mid   { --c: #f59e0b; }
  .shape-close { --c: #a855f7; }

  .tag-badge.shape-open,
  .badge.shape-open {
    background: #22d3ee22;
    border: 1px solid #22d3ee66;
    color: #22d3ee;
  }
  .tag-badge.shape-mid,
  .badge.shape-mid {
    background: #f59e0b22;
    border: 1px solid #f59e0b66;
    color: #f59e0b;
  }
  .tag-badge.shape-close,
  .badge.shape-close {
    background: #a855f722;
    border: 1px solid #a855f766;
    color: #a855f7;
  }

  .tag-btn.shape-open {
    background: #22d3ee11;
    color: #22d3ee;
    border-color: #22d3ee44;
  }
  .tag-btn.shape-open:hover,
  .tag-btn.shape-open.active {
    background: #22d3ee33;
    border-color: #22d3ee;
  }

  .tag-btn.shape-mid {
    background: #f59e0b11;
    color: #f59e0b;
    border-color: #f59e0b44;
  }
  .tag-btn.shape-mid:hover,
  .tag-btn.shape-mid.active {
    background: #f59e0b33;
    border-color: #f59e0b;
  }

  .tag-btn.shape-close {
    background: #a855f711;
    color: #a855f7;
    border-color: #a855f744;
  }
  .tag-btn.shape-close:hover,
  .tag-btn.shape-close.active {
    background: #a855f733;
    border-color: #a855f7;
  }

  .count.shape-open  { color: #22d3ee; }
  .count.shape-mid   { color: #f59e0b; }
  .count.shape-close { color: #a855f7; }

  .badge {
    font-family: 'Orbitron', monospace;
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
  }

  .error { color: #ff6677; font-size: 0.88rem; margin-top: 0.5rem; }
  .ok    { color: #44cc88; font-size: 0.88rem; margin-top: 0.5rem; }
</style>
