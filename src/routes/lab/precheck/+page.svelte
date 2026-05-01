<script lang="ts">
  import { buildFixPrompts, createDefaultCheckState, hasAnyCheck } from '$lib/precheckEngine';
  import type { CheckState, PromptResult } from '$lib/precheckEngine';

  // ── State ────────────────────────────────────────────────────
  let basePrompt   = $state('');
  let imageUrl     = $state('');
  let previewSrc   = $state<string | null>(null);
  let generating   = $state(false);
  let errorMsg     = $state('');
  let resultImg    = $state<string | null>(null);
  let showPrompts  = $state(false);

  let checks = $state<CheckState>(createDefaultCheckState());

  // ── Derived: 修正プロンプト ───────────────────────────────────
  let fixResult = $derived<PromptResult>(buildFixPrompts(checks));

  let finalPositive = $derived(
    [basePrompt.trim(), fixResult.positive].filter(Boolean).join(', ')
  );

  let hasChecks = $derived(hasAnyCheck(checks));

  // ── チェックボックス定義 ─────────────────────────────────────
  const CHECK_ITEMS: { key: keyof CheckState; label: string; icon: string; desc: string }[] = [
    {
      key:   'hand_role',
      label: '手の役割ミス',
      icon:  '🤚',
      desc:  '手のポーズが不自然・役割と一致しない',
    },
    {
      key:   'extra_fingers',
      label: '指ミス',
      icon:  '👆',
      desc:  '指の本数が多い・少ない・融合している',
    },
    {
      key:   'face_distortion',
      label: '顔崩れ',
      icon:  '😵',
      desc:  '顔の比率・目・口が歪んでいる',
    },
    {
      key:   'outfit_noise',
      label: '衣装柄化',
      icon:  '👗',
      desc:  '衣装テクスチャがノイズ・文字化けしている',
    },
    {
      key:   'prism_issue',
      label: 'プリズム暴走',
      icon:  '🌈',
      desc:  '色収差・虹色アーティファクトが発生している',
    },
  ];

  // ── 画像URLプレビュー ─────────────────────────────────────────
  function applyImageUrl() {
    const trimmed = imageUrl.trim();
    if (!trimmed) {
      previewSrc = null;
      return;
    }
    previewSrc = trimmed;
  }

  // ── 再生成 ────────────────────────────────────────────────────
  async function generate() {
    if (!finalPositive.trim()) {
      errorMsg = 'ベースプロンプトを入力してください';
      return;
    }

    generating = true;
    errorMsg   = '';
    resultImg  = null;

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          prompt:   finalPositive,
          negative: fixResult.negative,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = await res.json() as { image?: string };
      if (!data.image) throw new Error('レスポンスに image フィールドがありません');

      resultImg = data.image;
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      generating = false;
    }
  }

  // ── 全チェックをリセット ─────────────────────────────────────
  function resetChecks() {
    checks = createDefaultCheckState();
  }
</script>

<!-- ============================================================ -->
<!-- Page -->
<!-- ============================================================ -->
<div class="page">

  <!-- Header -->
  <header class="header">
    <div class="header-badge">PRE-CHECK</div>
    <h1 class="header-title">アップ前チェック<span class="accent">＆</span>修正生成</h1>
    <p class="header-sub">問題箇所をチェックして修正プロンプトを自動生成</p>
  </header>

  <!-- Main grid -->
  <div class="layout">

    <!-- ── Left: Input panel ─────────────────────────────────── -->
    <section class="panel">
      <h2 class="panel-title">
        <span class="panel-icon">✏️</span> ベースプロンプト
      </h2>
      <textarea
        class="textarea"
        bind:value={basePrompt}
        placeholder="例: short silver bob hair, glowing cyan eyes, white cyberpunk uniform, 1girl, masterpiece"
        rows={4}
      ></textarea>

      <!-- Image URL -->
      <h2 class="panel-title mt">
        <span class="panel-icon">🖼️</span> 参照画像URL（任意）
      </h2>
      <div class="url-row">
        <input
          class="input"
          type="text"
          bind:value={imageUrl}
          placeholder="https://example.com/image.png"
        />
        <button class="btn-sm" onclick={applyImageUrl}>表示</button>
      </div>

      {#if previewSrc}
        <div class="preview-box">
          <img
            class="preview-img"
            src={previewSrc}
            alt="参照画像"
            onerror={() => { previewSrc = null; errorMsg = '画像の読み込みに失敗しました'; }}
          />
          <div class="preview-label">参照画像</div>
        </div>
      {/if}
    </section>

    <!-- ── Right: Check panel ────────────────────────────────── -->
    <section class="panel">
      <div class="check-header">
        <h2 class="panel-title">
          <span class="panel-icon">🔍</span> 問題チェック
        </h2>
        {#if hasChecks}
          <button class="reset-btn" onclick={resetChecks}>リセット</button>
        {/if}
      </div>

      <div class="checks">
        {#each CHECK_ITEMS as item}
          <label class="check-item" class:active={checks[item.key]}>
            <input
              class="check-input"
              type="checkbox"
              bind:checked={checks[item.key]}
            />
            <span class="check-icon">{item.icon}</span>
            <span class="check-body">
              <span class="check-label">{item.label}</span>
              <span class="check-desc">{item.desc}</span>
            </span>
            <span class="check-mark" class:visible={checks[item.key]}>✓</span>
          </label>
        {/each}
      </div>

      <!-- Summary badges -->
      {#if fixResult.summary.length > 0}
        <div class="badges">
          {#each fixResult.summary as item}
            <span class="badge">{item}</span>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <!-- ── Prompt preview ──────────────────────────────────────── -->
  <section class="panel prompts-panel">
    <button
      class="toggle-btn"
      onclick={() => showPrompts = !showPrompts}
    >
      <span class="panel-icon">📋</span>
      修正プロンプト {showPrompts ? '▲' : '▼'}
    </button>

    {#if showPrompts}
      <div class="prompt-grid">
        <div class="prompt-block">
          <div class="prompt-label positive">POSITIVE</div>
          <div class="prompt-text">
            {finalPositive || '（ベースプロンプトを入力してください）'}
          </div>
          {#if finalPositive}
            <button
              class="copy-btn"
              onclick={() => navigator.clipboard.writeText(finalPositive)}
            >コピー</button>
          {/if}
        </div>
        <div class="prompt-block">
          <div class="prompt-label negative">NEGATIVE</div>
          <div class="prompt-text">
            {fixResult.negative}
          </div>
          <button
            class="copy-btn"
            onclick={() => navigator.clipboard.writeText(fixResult.negative)}
          >コピー</button>
        </div>
      </div>
    {/if}
  </section>

  <!-- ── Generate button ─────────────────────────────────────── -->
  <div class="generate-area">
    <button
      class="generate-btn"
      onclick={generate}
      disabled={generating}
    >
      {#if generating}
        <span class="spinner"></span>
        生成中...
      {:else}
        <span>⚡</span>
        修正再生成
      {/if}
    </button>

    {#if !hasChecks && !basePrompt.trim()}
      <p class="hint">プロンプトを入力し、問題をチェックしてから生成してください</p>
    {/if}
  </div>

  <!-- ── Error ───────────────────────────────────────────────── -->
  {#if errorMsg}
    <div class="error-box">
      <span class="error-icon">⚠️</span>
      <span>{errorMsg}</span>
    </div>
  {/if}

  <!-- ── Result image ────────────────────────────────────────── -->
  {#if resultImg}
    <section class="panel result-panel">
      <h2 class="panel-title">
        <span class="panel-icon">✨</span> 生成結果
      </h2>
      <div class="result-img-wrap">
        <img class="result-img" src={resultImg} alt="生成結果" />
      </div>
      <a class="download-btn" href={resultImg} download="precheck_result.png" target="_blank">
        ⬇️ ダウンロード
      </a>
    </section>
  {/if}

</div>

<!-- ============================================================ -->
<!-- Styles -->
<!-- ============================================================ -->
<style>
  /* ── Root variables ── */
  :global(body) {
    margin: 0;
    background: #0a0a0f;
    color: #e0e0f0;
    font-family: 'Courier New', Courier, monospace;
  }

  /* ── Page ── */
  .page {
    max-width: 900px;
    margin: 0 auto;
    padding: 24px 16px 80px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Header ── */
  .header {
    text-align: center;
    padding: 32px 16px 20px;
    border-bottom: 1px solid #1e1e3a;
  }
  .header-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 3px;
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.08);
    border: 1px solid rgba(0, 229, 255, 0.3);
    padding: 3px 14px;
    border-radius: 20px;
    margin-bottom: 12px;
  }
  .header-title {
    font-size: clamp(20px, 5vw, 28px);
    font-weight: 700;
    margin: 0 0 8px;
    color: #f0f0ff;
    letter-spacing: 1px;
  }
  .accent {
    color: #00e5ff;
  }
  .header-sub {
    font-size: 13px;
    color: #7070a0;
    margin: 0;
  }

  /* ── Layout grid ── */
  .layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 640px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }

  /* ── Panel ── */
  .panel {
    background: #0f0f1e;
    border: 1px solid #1e1e3a;
    border-radius: 12px;
    padding: 20px;
  }
  .panel-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #9090c0;
    margin: 0 0 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    text-transform: uppercase;
  }
  .panel-icon {
    font-size: 15px;
  }
  .mt {
    margin-top: 20px;
  }

  /* ── Textarea & Input ── */
  .textarea,
  .input {
    width: 100%;
    background: #080812;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    color: #e0e0f0;
    font-family: inherit;
    font-size: 13px;
    padding: 10px 12px;
    box-sizing: border-box;
    resize: vertical;
    outline: none;
    transition: border-color 0.2s;
  }
  .textarea:focus,
  .input:focus {
    border-color: #00e5ff;
  }

  /* ── URL row ── */
  .url-row {
    display: flex;
    gap: 8px;
  }
  .url-row .input {
    flex: 1;
  }
  .btn-sm {
    background: #1a1a3a;
    border: 1px solid #3a3a6a;
    color: #c0c0e0;
    border-radius: 8px;
    padding: 0 14px;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.2s, border-color 0.2s;
  }
  .btn-sm:hover {
    background: #252550;
    border-color: #00e5ff;
  }

  /* ── Image preview ── */
  .preview-box {
    margin-top: 12px;
    position: relative;
  }
  .preview-img {
    width: 100%;
    border-radius: 8px;
    border: 1px solid #2a2a4a;
    display: block;
    max-height: 240px;
    object-fit: contain;
    background: #050510;
  }
  .preview-label {
    position: absolute;
    top: 8px;
    left: 8px;
    font-size: 10px;
    color: #9090c0;
    background: rgba(8, 8, 18, 0.8);
    padding: 2px 8px;
    border-radius: 4px;
  }

  /* ── Check header ── */
  .check-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .check-header .panel-title {
    margin-bottom: 0;
  }
  .reset-btn {
    font-size: 11px;
    color: #7070a0;
    background: none;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    padding: 3px 10px;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.2s, border-color 0.2s;
  }
  .reset-btn:hover {
    color: #c0c0e0;
    border-color: #5050a0;
  }

  /* ── Check items ── */
  .checks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .check-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: #080812;
    border: 1px solid #1e1e3a;
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    user-select: none;
  }
  .check-item:hover {
    border-color: #3a3a6a;
    background: #0d0d20;
  }
  .check-item.active {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.05);
  }
  .check-input {
    display: none;
  }
  .check-icon {
    font-size: 18px;
    flex-shrink: 0;
  }
  .check-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .check-label {
    font-size: 13px;
    font-weight: 700;
    color: #d0d0f0;
  }
  .check-desc {
    font-size: 11px;
    color: #6060a0;
    line-height: 1.4;
  }
  .check-mark {
    font-size: 14px;
    color: #00e5ff;
    opacity: 0;
    transition: opacity 0.15s;
    flex-shrink: 0;
  }
  .check-mark.visible {
    opacity: 1;
  }

  /* ── Summary badges ── */
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 14px;
  }
  .badge {
    font-size: 10px;
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 20px;
    padding: 3px 10px;
    letter-spacing: 0.5px;
  }

  /* ── Prompt panel ── */
  .prompts-panel {
    padding: 14px 20px;
  }
  .toggle-btn {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: #9090c0;
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    transition: color 0.2s;
  }
  .toggle-btn:hover {
    color: #c0c0e0;
  }
  .prompt-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 14px;
  }
  @media (max-width: 640px) {
    .prompt-grid {
      grid-template-columns: 1fr;
    }
  }
  .prompt-block {
    background: #080812;
    border: 1px solid #1e1e3a;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .prompt-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    border-radius: 4px;
    padding: 2px 8px;
    display: inline-block;
    width: fit-content;
  }
  .prompt-label.positive {
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.2);
  }
  .prompt-label.negative {
    color: #ff4d6d;
    background: rgba(255, 77, 109, 0.1);
    border: 1px solid rgba(255, 77, 109, 0.2);
  }
  .prompt-text {
    font-size: 11px;
    color: #8080b0;
    line-height: 1.7;
    word-break: break-all;
    flex: 1;
  }
  .copy-btn {
    align-self: flex-end;
    font-size: 11px;
    color: #5050a0;
    background: none;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    padding: 3px 10px;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.2s, border-color 0.2s;
  }
  .copy-btn:hover {
    color: #c0c0e0;
    border-color: #5050a0;
  }

  /* ── Generate area ── */
  .generate-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .generate-btn {
    width: 100%;
    max-width: 400px;
    padding: 18px 24px;
    background: linear-gradient(135deg, #003a4d, #001a2e);
    border: 1px solid #00e5ff;
    border-radius: 12px;
    color: #00e5ff;
    font-family: inherit;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 2px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.12);
  }
  .generate-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #004d66, #00243f);
    box-shadow: 0 0 28px rgba(0, 229, 255, 0.28);
    transform: translateY(-1px);
  }
  .generate-btn:active:not(:disabled) {
    transform: translateY(0);
  }
  .generate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .hint {
    font-size: 12px;
    color: #4a4a80;
    margin: 0;
    text-align: center;
  }

  /* ── Spinner ── */
  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(0, 229, 255, 0.25);
    border-top-color: #00e5ff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Error box ── */
  .error-box {
    background: rgba(255, 77, 109, 0.08);
    border: 1px solid rgba(255, 77, 109, 0.3);
    border-radius: 8px;
    padding: 12px 16px;
    color: #ff8fa0;
    font-size: 13px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .error-icon {
    flex-shrink: 0;
  }

  /* ── Result panel ── */
  .result-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .result-img-wrap {
    width: 100%;
    background: #050510;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #1e1e3a;
  }
  .result-img {
    width: 100%;
    display: block;
    object-fit: contain;
    max-height: 520px;
  }
  .download-btn {
    display: inline-block;
    align-self: flex-end;
    font-size: 12px;
    color: #9090c0;
    background: #0f0f1e;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    padding: 8px 16px;
    text-decoration: none;
    font-family: inherit;
    transition: color 0.2s, border-color 0.2s;
  }
  .download-btn:hover {
    color: #00e5ff;
    border-color: #00e5ff;
  }
</style>
