<script lang="ts">
  type ExtractedFrame = { name: string; second: number; url: string };
  type ExtractResult = {
    videoId: string;
    metadata: { fileName: string; duration: number; fps: number; resolution: string; intervalSeconds: number; frameCount: number; maxFrames: number };
    frames: ExtractedFrame[];
  };
  type FrameCandidate = { frame: string; reason: string };
  type ScanResult = {
    videoId: string;
    provider: 'GPT-5.5' | 'Gemini';
    model: string;
    frameCount: number;
    faceFrames: FrameCandidate[];
    fullBodyFrames: FrameCandidate[];
    earFrames: FrameCandidate[];
    tailFrames: FrameCandidate[];
    features: string[];
    visualMemoryCandidate: Record<string, unknown>;
  };

  let selectedFile = $state<File | null>(null);
  let extraction = $state<ExtractResult | null>(null);
  let scan = $state<ScanResult | null>(null);
  let provider = $state<'GPT-5.5' | 'Gemini'>('GPT-5.5');
  let extracting = $state(false);
  let scanning = $state(false);
  let errorMessage = $state('');

  function selectMp4(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    selectedFile = input.files?.[0] ?? null;
    extraction = null;
    scan = null;
    errorMessage = '';
  }

  async function extractFrames(): Promise<void> {
    if (!selectedFile || extracting) return;
    extracting = true;
    errorMessage = '';
    extraction = null;
    scan = null;
    try {
      const form = new FormData();
      form.set('video', selectedFile);
      const response = await fetch('/api/video-analysis', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? 'フレーム抽出に失敗しました。');
      extraction = data as ExtractResult;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      extracting = false;
    }
  }

  async function scanCharacter(): Promise<void> {
    if (!extraction || scanning) return;
    scanning = true;
    errorMessage = '';
    scan = null;
    try {
      const response = await fetch('/api/character-scanner/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoId: extraction.videoId, provider }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message ?? 'Character Scanner解析に失敗しました。');
      scan = data as ScanResult;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      scanning = false;
    }
  }

  function frameUrl(name: string): string {
    return extraction?.frames.find((frame) => frame.name === name)?.url ?? '';
  }

  const outputGroups = $derived(scan ? [
    { title: '顔フレーム', items: scan.faceFrames },
    { title: '全身フレーム', items: scan.fullBodyFrames },
    { title: '耳フレーム', items: scan.earFrames },
    { title: '尻尾フレーム', items: scan.tailFrames },
  ] : []);
</script>

<svelte:head><title>Character Scanner | AI Vtuber</title></svelte:head>

<main class="page-shell">
  <aside class="sidebar">
    <a class="brand" href="/">AI VTUBER</a>
    <nav>
      <a href="/chat">チャット</a>
      <a class="active" href="/video-analysis">Character Scanner</a>
      <a href="/character-memory">Character Memory</a>
      <a href="/lab">AI Personality Lab</a>
    </nav>
    <p>MP4から1秒ごとに参照フレームを抽出し、キャラクター資料へ変換します。</p>
  </aside>

  <section class="content">
    <header>
      <span>CHARACTER SCANNER</span>
      <h1>動画からキャラクター資料を抽出</h1>
      <p>動画評価や感想は生成しません。顔・全身・耳・尻尾とVisual Memory候補だけを抽出します。</p>
    </header>

    <section class="card upload-card">
      <label class="dropzone">
        <input type="file" accept="video/mp4,.mp4" onchange={selectMp4} />
        <strong>{selectedFile ? selectedFile.name : 'MP4を選択'}</strong>
        <span>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : '1秒間隔・最大20フレーム'}</span>
      </label>
      <button class="primary" onclick={extractFrames} disabled={!selectedFile || extracting || scanning}>
        {extracting ? 'FFmpegで抽出中…' : 'フレームを抽出'}
      </button>
      {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
    </section>

    {#if extraction}
      <section class="card">
        <div class="section-head">
          <div><span>EXTRACTED FRAMES</span><h2>1秒ごとのサムネイル</h2></div>
          <strong>{extraction.frames.length} / 20</strong>
        </div>
        <div class="stats">
          <span>{extraction.metadata.duration}s</span>
          <span>{extraction.metadata.resolution}</span>
          <span>{extraction.metadata.fps} fps</span>
          <span>interval {extraction.metadata.intervalSeconds}s</span>
        </div>
        <div class="frames">
          {#each extraction.frames as frame (frame.name)}
            <figure><img src={frame.url} alt={`${frame.second}秒のフレーム`} /><figcaption>{frame.second}s · {frame.name}</figcaption></figure>
          {/each}
        </div>
        <div class="scanner-controls">
          <label><span>解析AI</span><select bind:value={provider}><option value="GPT-5.5">GPT-5.5</option><option value="Gemini">Gemini</option></select></label>
          <button class="primary" onclick={scanCharacter} disabled={scanning}>{scanning ? `${provider}で解析中…` : `${provider}へ送信`}</button>
        </div>
      </section>
    {/if}

    {#if scan}
      <section class="card result-card">
        <div class="section-head">
          <div><span>SCAN RESULT</span><h2>キャラクター資料</h2></div>
          <strong>{scan.provider} · {scan.model}</strong>
        </div>
        <div class="output-groups">
          {#each outputGroups as group (group.title)}
            <section class="output-group">
              <h3>{group.title}</h3>
              {#if group.items.length > 0}
                <div class="candidate-grid">
                  {#each group.items as item (item.frame)}
                    <article>
                      {#if frameUrl(item.frame)}<img src={frameUrl(item.frame)} alt={`${group.title} ${item.frame}`} />{/if}
                      <strong>{item.frame}</strong>
                      <p>{item.reason || '参照候補'}</p>
                    </article>
                  {/each}
                </div>
              {:else}<p class="empty">該当フレームなし</p>{/if}
            </section>
          {/each}
        </div>
        <section class="features"><h3>特徴一覧</h3>{#if scan.features.length}<ul>{#each scan.features as feature}<li>{feature}</li>{/each}</ul>{:else}<p class="empty">特徴なし</p>{/if}</section>
        <details open><summary>Visual Memory候補 JSON</summary><pre>{JSON.stringify(scan.visualMemoryCandidate, null, 2)}</pre></details>
      </section>
    {/if}
  </section>
</main>

<style>
  :global(body) { margin: 0; background: #070b14; color: #e8f3ff; font-family: Inter, system-ui, sans-serif; }
  .page-shell { min-height: 100vh; display: flex; }
  .sidebar { width: 230px; padding: 28px 18px; box-sizing: border-box; border-right: 1px solid #20324d; background: #0b1220; }
  .brand { display: block; margin-bottom: 30px; color: #67e8f9; font-weight: 900; letter-spacing: .1em; text-decoration: none; }
  nav { display: grid; gap: 7px; } nav a { padding: 10px; border-radius: 8px; color: #94a3b8; text-decoration: none; } nav a.active, nav a:hover { color: #fff; background: #12304a; }
  .sidebar p { margin-top: 30px; color: #64748b; font-size: 12px; line-height: 1.7; }
  .content { width: min(100%, 1180px); padding: 48px; box-sizing: border-box; }
  header > span, .section-head span { color: #22d3ee; font-size: 11px; font-weight: 800; letter-spacing: .18em; }
  h1 { margin: 8px 0; font-size: clamp(26px, 4vw, 38px); } header p { color: #94a3b8; }
  .card { margin-top: 22px; padding: 22px; border: 1px solid #223854; border-radius: 14px; background: #0e1727; box-shadow: 0 16px 40px rgba(0,0,0,.2); }
  .dropzone { min-height: 125px; display: grid; place-content: center; gap: 8px; border: 1px dashed #477092; border-radius: 10px; text-align: center; cursor: pointer; } .dropzone input { display: none; } .dropzone span { color: #7f91aa; font-size: 13px; }
  button, select { border: 1px solid #31506f; border-radius: 8px; padding: 10px 14px; color: #e2e8f0; background: #0a1220; font: inherit; } button { cursor: pointer; font-weight: 800; } button.primary { margin-top: 14px; border: 0; color: #041218; background: #22d3ee; } button:disabled { opacity: .5; cursor: wait; }
  .error { color: #fda4af; }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 15px; } .section-head h2 { margin: 4px 0 0; } .section-head > strong { color: #a5f3fc; font-size: 12px; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; } .stats span { padding: 6px 9px; border-radius: 6px; color: #cbd5e1; background: #17253a; font-size: 12px; }
  .frames { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 16px; } figure { margin: 0; overflow: hidden; border: 1px solid #243951; border-radius: 8px; background: #070b12; } figure img { display: block; width: 100%; aspect-ratio: 16/9; object-fit: cover; } figcaption { padding: 7px; color: #94a3b8; font-size: 10px; }
  .scanner-controls { display: flex; align-items: end; justify-content: flex-end; gap: 10px; margin-top: 18px; } .scanner-controls label { display: grid; gap: 5px; } .scanner-controls label span { color: #94a3b8; font-size: 11px; } .scanner-controls .primary { margin: 0; }
  .output-groups { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; margin-top: 18px; } .output-group { padding: 14px; border: 1px solid #243951; border-radius: 10px; background: #0a1321; } h3 { margin: 0 0 10px; color: #a5f3fc; font-size: 14px; }
  .candidate-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px,1fr)); gap: 8px; } .candidate-grid article { min-width: 0; overflow: hidden; border: 1px solid #273a51; border-radius: 7px; background: #070c15; } .candidate-grid img { display: block; width: 100%; aspect-ratio: 16/9; object-fit: cover; } .candidate-grid strong, .candidate-grid p { display: block; margin: 0; padding: 6px 8px; font-size: 10px; } .candidate-grid p { padding-top: 0; color: #94a3b8; line-height: 1.4; }
  .features { margin-top: 14px; padding: 14px; border: 1px solid #243951; border-radius: 10px; } .features ul { columns: 2; margin: 0; padding-left: 20px; color: #cbd5e1; line-height: 1.7; }
  .empty { margin: 0; color: #64748b; font-size: 12px; } details { margin-top: 16px; } summary { cursor: pointer; color: #67e8f9; font-weight: 800; } pre { max-height: 520px; overflow: auto; padding: 14px; border-radius: 8px; color: #cbd5e1; background: #050910; white-space: pre-wrap; }
  @media (max-width: 760px) { .sidebar { display: none; } .content { padding: 24px 16px; } .output-groups { grid-template-columns: 1fr; } .scanner-controls { align-items: stretch; flex-direction: column; } .features ul { columns: 1; } }
</style>
