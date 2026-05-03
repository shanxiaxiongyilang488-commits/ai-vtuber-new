<script lang="ts">
  // ============================================================
  // Types
  // ============================================================
  type Panel = {
    id:       string;
    prompt:   string;
    dialogue: string;
    image?:   string;
    loading?: boolean;
    error?:   string;
  };

  // ============================================================
  // State（Svelte 5 Runes）
  // ============================================================
  let panels = $state<Panel[]>([
    { id: 'p1', prompt: '', dialogue: '' },
    { id: 'p2', prompt: '', dialogue: '' },
    { id: 'p3', prompt: '', dialogue: '' },
    { id: 'p4', prompt: '', dialogue: '' },
  ]);

  let selectedId   = $state<string | null>(null);
  let yamlText     = $state('');
  let generatingAll = $state(false);

  // ============================================================
  // 単体生成
  // ============================================================
  async function generatePanel(panel: Panel) {
    // $state は深いリアクティビティを持つためスプレッド不要
    panel.loading = true;
    panel.error   = undefined;

    try {
      const res = await fetch('/api/generate-image', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt: panel.prompt, dialogue: panel.dialogue }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`HTTP ${res.status}: ${msg}`);
      }

      const data = await res.json() as { image: string };
      panel.image = data.image;
    } catch (e) {
      panel.error = e instanceof Error ? e.message : '生成エラー';
    } finally {
      panel.loading = false;
    }
  }

  // ============================================================
  // 全コマ順次生成
  // ============================================================
  async function generateAll() {
    generatingAll = true;
    for (const p of panels) {
      await generatePanel(p);
    }
    generatingAll = false;
  }

  // ============================================================
  // YAML エクスポート（js-yaml 不使用：インライン実装）
  // panels → YAML 文字列
  // ============================================================
  function exportYAML() {
    const lines: string[] = ['panels:'];
    for (const p of panels) {
      const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      lines.push(`  - id: "${p.id}"`);
      lines.push(`    prompt: "${esc(p.prompt)}"`);
      lines.push(`    dialogue: "${esc(p.dialogue)}"`);
      if (p.image) lines.push(`    image: "${esc(p.image)}"`);
    }
    yamlText = lines.join('\n');
  }

  // ============================================================
  // YAML インポート（js-yaml 不使用：インライン実装）
  // YAML 文字列 → panels（本エディタが出力した形式のみ対応）
  // ============================================================
  function importYAML() {
    if (!yamlText.trim()) return;

    const result: Panel[] = [];
    let   current: Partial<Panel> | null = null;

    const unesc = (s: string) =>
      s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    const stripQuotes = (s: string) =>
      s.replace(/^"(.*)"$/, '$1');

    for (const raw of yamlText.split('\n')) {
      const t = raw.trim();

      if (t.startsWith('- id:')) {
        if (current?.id) result.push(current as Panel);
        current = {
          id:       unesc(stripQuotes(t.slice(5).trim())),
          prompt:   '',
          dialogue: '',
        };
      } else if (current && t.startsWith('prompt:')) {
        current.prompt   = unesc(stripQuotes(t.slice(7).trim()));
      } else if (current && t.startsWith('dialogue:')) {
        current.dialogue = unesc(stripQuotes(t.slice(9).trim()));
      } else if (current && t.startsWith('image:')) {
        current.image    = unesc(stripQuotes(t.slice(6).trim()));
      }
    }

    if (current?.id) result.push(current as Panel);
    if (result.length > 0) panels = result;
  }

  // ============================================================
  // ユーティリティ
  // ============================================================
  function selectPanel(id: string) {
    selectedId = selectedId === id ? null : id;
  }

  function panelLabel(index: number) {
    return `${index + 1}コマ目`;
  }
</script>

<!-- ============================================================ -->
<!-- Page -->
<!-- ============================================================ -->
<div class="page">

  <!-- ── Header ── -->
  <header class="header">
    <div class="header-inner">
      <h1 class="title">
        <span class="title-accent">AI 漫画</span> エディタ
      </h1>
      <div class="header-actions">
        <button
          class="btn btn-primary"
          onclick={generateAll}
          disabled={generatingAll}
        >
          {#if generatingAll}
            <span class="spinner"></span> 生成中...
          {:else}
            ⚡ 全コマ生成
          {/if}
        </button>
        <button class="btn btn-sub" onclick={exportYAML}>📤 YAML書き出し</button>
        <button class="btn btn-sub" onclick={importYAML} disabled={!yamlText.trim()}>📥 YAML読み込み</button>
      </div>
    </div>
    <div class="header-line"></div>
  </header>

  <!-- ── Panel Grid（2×2）── -->
  <section class="panel-grid">
    {#each panels as panel, i}
      {@const isSelected = selectedId === panel.id}

      <div
        class="panel"
        class:selected={isSelected}
        onclick={() => selectPanel(panel.id)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && selectPanel(panel.id)}
        aria-label={panelLabel(i)}
      >

        <!-- コマ番号バッジ -->
        <div class="panel-index">{panelLabel(i)}</div>

        <!-- 画像プレビュー -->
        <div class="panel-image-wrap">
          {#if panel.loading}
            <div class="panel-loading">
              <span class="spinner lg"></span>
              <span>生成中...</span>
            </div>
          {:else if panel.image}
            <img
              class="panel-img"
              src={panel.image}
              alt={`コマ${i + 1}`}
            />
          {:else}
            <div class="panel-empty">
              <span class="panel-empty-icon">🖼️</span>
              <span>未生成</span>
            </div>
          {/if}
        </div>

        <!-- エラー表示 -->
        {#if panel.error}
          <div class="panel-error">⚠️ {panel.error}</div>
        {/if}

        <!-- プロンプト入力 -->
        <label class="input-label">プロンプト</label>
        <textarea
          class="input-area"
          bind:value={panel.prompt}
          placeholder="例: cyberpunk girl, glowing eyes, night city"
          rows={2}
          onclick={(e) => e.stopPropagation()}
        ></textarea>

        <!-- セリフ入力 -->
        <label class="input-label">セリフ</label>
        <input
          class="input-line"
          type="text"
          bind:value={panel.dialogue}
          placeholder="例: 「ここから始まる…」"
          onclick={(e) => e.stopPropagation()}
        />

        <!-- 生成ボタン -->
        <div class="panel-actions" onclick={(e) => e.stopPropagation()}>
          <button
            class="btn btn-generate"
            onclick={() => generatePanel(panel)}
            disabled={panel.loading}
          >
            {panel.image ? '🔄 再生成' : '✨ 生成'}
          </button>
        </div>

      </div>
    {/each}
  </section>

  <!-- ── YAML エリア ── -->
  <section class="yaml-section">
    <div class="yaml-header">
      <span class="yaml-title">📄 YAML</span>
      <span class="yaml-hint">「YAML書き出し」で生成 → 編集後「YAML読み込み」でパネルに反映</span>
    </div>
    <textarea
      class="yaml-area"
      bind:value={yamlText}
      placeholder="panels:&#10;  - id: &quot;p1&quot;&#10;    prompt: &quot;&quot;&#10;    dialogue: &quot;&quot;"
      rows={12}
      spellcheck={false}
    ></textarea>
  </section>

</div>

<!-- ============================================================ -->
<!-- Styles -->
<!-- ============================================================ -->
<style>
  /* ── Global ── */
  :global(body) {
    margin: 0;
    background: #030712;
    color: #e2e8f0;
    font-family: 'Segoe UI', sans-serif;
  }

  /* ── Page ── */
  .page {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px 20px 80px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* ── Header ── */
  .header {
    flex-shrink: 0;
  }
  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding-bottom: 12px;
  }
  .title {
    font-size: clamp(18px, 3vw, 26px);
    font-weight: 800;
    letter-spacing: 0.06em;
    margin: 0;
    color: #e2e8f0;
  }
  .title-accent {
    background: linear-gradient(135deg, #22d3ee, #a855f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .header-line {
    height: 1px;
    background: linear-gradient(90deg,
      transparent, rgba(34,211,238,0.3) 30%, rgba(168,85,247,0.3) 70%, transparent
    );
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* ── Buttons ── */
  .btn {
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    border-radius: 8px;
    padding: 8px 16px;
    cursor: pointer;
    transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
    border: 1px solid transparent;
  }
  .btn:active:not(:disabled) { transform: translateY(1px); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-primary {
    background: linear-gradient(135deg, #0e4a5e, #1a1040);
    border-color: #22d3ee;
    color: #22d3ee;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-primary:hover:not(:disabled) {
    box-shadow: 0 0 16px rgba(34,211,238,0.3);
  }

  .btn-sub {
    background: #0f172a;
    border-color: #334155;
    color: #94a3b8;
  }
  .btn-sub:hover:not(:disabled) {
    border-color: #64748b;
    color: #e2e8f0;
  }

  .btn-generate {
    width: 100%;
    background: #0f172a;
    border-color: #a855f7;
    color: #c084fc;
    padding: 7px 12px;
    font-size: 12px;
  }
  .btn-generate:hover:not(:disabled) {
    background: rgba(168,85,247,0.1);
    box-shadow: 0 0 10px rgba(168,85,247,0.2);
  }

  /* ── Panel Grid（2×2）── */
  .panel-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  @media (max-width: 580px) {
    .panel-grid { grid-template-columns: 1fr; }
  }

  /* ── Panel ── */
  .panel {
    position: relative;
    background: #0d1117;
    border: 1px solid #1e293b;
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
    outline: none;
  }
  .panel:hover {
    border-color: #334155;
  }
  .panel.selected {
    border-color: #22d3ee;
    box-shadow: 0 0 16px rgba(34,211,238,0.15);
  }

  /* コマ番号バッジ */
  .panel-index {
    position: absolute;
    top: 10px;
    left: 12px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #475569;
    background: #0d1117;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid #1e293b;
  }

  /* 画像エリア */
  .panel-image-wrap {
    width: 100%;
    aspect-ratio: 1;
    background: #050810;
    border-radius: 8px;
    border: 1px solid #1e293b;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 6px;
  }

  /* 画像：見切れ防止 */
  .panel-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  /* ローディング */
  .panel-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: #475569;
    font-size: 12px;
  }

  /* 未生成 */
  .panel-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: #334155;
    font-size: 12px;
  }
  .panel-empty-icon { font-size: 28px; }

  /* エラー */
  .panel-error {
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.25);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    color: #f87171;
  }

  /* ── Inputs ── */
  .input-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #475569;
    text-transform: uppercase;
    margin-bottom: -4px;
  }

  .input-area,
  .input-line {
    width: 100%;
    background: #080c14;
    border: 1px solid #1e293b;
    border-radius: 6px;
    color: #e2e8f0;
    font-family: inherit;
    font-size: 12px;
    padding: 7px 10px;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.2s;
    resize: vertical;
  }
  .input-area:focus,
  .input-line:focus {
    border-color: #22d3ee;
  }
  .input-line { resize: none; }

  /* パネル内ボタンエリア */
  .panel-actions {
    margin-top: 2px;
  }

  /* ── Spinner ── */
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(34,211,238,0.2);
    border-top-color: #22d3ee;
    border-radius: 50%;
    animation: spin 0.65s linear infinite;
    flex-shrink: 0;
  }
  .spinner.lg {
    width: 22px;
    height: 22px;
    border-width: 3px;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── YAML Section ── */
  .yaml-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .yaml-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .yaml-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #9090c0;
    text-transform: uppercase;
  }
  .yaml-hint {
    font-size: 11px;
    color: #334155;
  }
  .yaml-area {
    width: 100%;
    background: #080c14;
    border: 1px solid #1e293b;
    border-radius: 8px;
    color: #7dd3fc;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    line-height: 1.7;
    padding: 12px 14px;
    box-sizing: border-box;
    outline: none;
    resize: vertical;
    transition: border-color 0.2s;
    tab-size: 2;
  }
  .yaml-area:focus {
    border-color: #22d3ee;
  }
</style>
