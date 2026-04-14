<script lang="ts">
  import { onMount } from 'svelte';
  import { PROVIDER_MODELS, DEFAULT_MODELS } from '$lib/config/models';

  // ── Types ──────────────────────────────────────────────────────────────────
  type ConnectionStatus = 'not_tested' | 'connected' | 'failed' | 'quota' | 'invalid_key' | 'testing';
  type ServerStatus = 'OK' | 'Missing API Key' | 'Unauthorized' | 'Quota' | 'Error';

  function mapStatus(s: ServerStatus): Exclude<ConnectionStatus, 'not_tested' | 'testing'> {
    if (s === 'OK') return 'connected';
    if (s === 'Quota') return 'quota';
    if (s === 'Unauthorized' || s === 'Missing API Key') return 'invalid_key';
    return 'failed';
  }

  interface ApiSection {
    key: string;
    model: string;
    baseUrl?: string;
    status: ConnectionStatus;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let openai = $state<ApiSection>({
    key: '',
    model: DEFAULT_MODELS.openai,
    status: 'not_tested',
  });

  let claude = $state<ApiSection>({
    key: '',
    model: DEFAULT_MODELS.claude,
    status: 'not_tested',
  });

  let gemini = $state<ApiSection>({
    key: '',
    model: DEFAULT_MODELS.gemini,
    status: 'not_tested',
  });

  let local = $state<ApiSection>({
    key: '',
    model: 'local-model',
    baseUrl: 'http://localhost:1234',
    status: 'not_tested',
  });

  let saveFlash = $state<Record<string, boolean>>({});

  // ── LocalStorage helpers ───────────────────────────────────────────────────
  function load() {
    const g = (k: string) => localStorage.getItem(k) ?? '';

    openai.key   = g('api_openai_key');
    openai.model = g('api_openai_model') || DEFAULT_MODELS.openai;

    claude.key   = g('api_claude_key');
    claude.model = g('api_claude_model') || DEFAULT_MODELS.claude;

    gemini.key   = g('api_gemini_key');
    gemini.model = g('api_gemini_model') || DEFAULT_MODELS.gemini;

    local.baseUrl = g('api_local_url') || 'http://localhost:1234';
    local.model   = g('api_local_model') || 'local-model';
  }

  function saveOpenai() {
    localStorage.setItem('api_openai_key',   openai.key);
    localStorage.setItem('api_openai_model', openai.model);
    flashSave('openai');
  }

  function saveClaude() {
    localStorage.setItem('api_claude_key',   claude.key);
    localStorage.setItem('api_claude_model', claude.model);
    flashSave('claude');
  }

  function saveGemini() {
    localStorage.setItem('api_gemini_key',   gemini.key);
    localStorage.setItem('api_gemini_model', gemini.model);
    flashSave('gemini');
  }

  function saveLocal() {
    localStorage.setItem('api_local_url',   local.baseUrl ?? '');
    localStorage.setItem('api_local_model', local.model);
    flashSave('local');
  }

  function flashSave(id: string) {
    saveFlash[id] = true;
    setTimeout(() => { saveFlash[id] = false; }, 1800);
  }

  // ── Connection tests ───────────────────────────────────────────────────────
  async function testOpenai() {
    openai.status = 'testing';
    try {
      const res = await fetch('/api/check-api-status');
      if (!res.ok) throw new Error();
      const data: Record<string, ServerStatus> = await res.json();
      openai.status = mapStatus(data.openai);
    } catch {
      openai.status = 'failed';
    }
  }

  async function testClaude() {
    claude.status = 'testing';
    try {
      const res = await fetch('/api/check-api-status');
      if (!res.ok) throw new Error();
      const data: Record<string, ServerStatus> = await res.json();
      claude.status = mapStatus(data.claude);
    } catch {
      claude.status = 'failed';
    }
  }

  async function testGemini() {
    gemini.status = 'testing';
    try {
      const res = await fetch('/api/check-api-status');
      if (!res.ok) throw new Error();
      const data: Record<string, ServerStatus> = await res.json();
      gemini.status = mapStatus(data.gemini);
    } catch {
      gemini.status = 'failed';
    }
  }

  async function testLocal() {
    local.status = 'testing';
    const url = (local.baseUrl ?? '').trim();
    if (!url) { local.status = 'failed'; return; }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      local.status = res.ok || res.status < 500 ? 'connected' : 'failed';
    } catch {
      local.status = 'failed';
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(load);
</script>

<!-- ── Snippets ───────────────────────────────────────────────────────────── -->
{#snippet statusBadge(status: ConnectionStatus)}
  {#if status === 'not_tested'}
    <span class="status not-tested">Not Tested</span>
  {:else if status === 'testing'}
    <span class="status testing">
      <span class="dot-pulse"></span> Testing
    </span>
  {:else if status === 'connected'}
    <span class="status connected">Connected</span>
  {:else if status === 'quota'}
    <span class="status quota">Quota</span>
  {:else if status === 'invalid_key'}
    <span class="status invalid-key">Invalid Key</span>
  {:else}
    <span class="status failed">Failed</span>
  {/if}
{/snippet}

<!-- ── Markup ────────────────────────────────────────────────────────────── -->
<div class="page">
  <!-- Header -->
  <header class="header">
    <div class="header-inner">
      <a href="/lab" class="back-link">← Back</a>
      <div>
        <p class="header-label">CONTROL PANEL</p>
        <h1 class="header-title">API Settings</h1>
      </div>
    </div>
  </header>

  <main class="main">
    <!-- ── OpenAI ─────────────────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-header">
        <div class="provider-badge openai-badge">OpenAI</div>
        {@render statusBadge(openai.status)}
      </div>

      <div class="fields">
        <label class="field">
          <span class="field-label">API Key</span>
          <input
            type="password"
            class="input"
            placeholder="sk-..."
            bind:value={openai.key}
          />
        </label>
        <label class="field">
          <span class="field-label">Model</span>
          <select class="input select-input" bind:value={openai.model}>
            {#each PROVIDER_MODELS.openai as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-save" onclick={saveOpenai}>
          {saveFlash['openai'] ? 'Saved ✓' : 'Save'}
        </button>
        <button
          class="btn btn-test"
          onclick={testOpenai}
          disabled={openai.status === 'testing'}
        >
          {openai.status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </section>

    <!-- ── Claude ─────────────────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-header">
        <div class="provider-badge claude-badge">Claude</div>
        {@render statusBadge(claude.status)}
      </div>

      <div class="fields">
        <label class="field">
          <span class="field-label">API Key</span>
          <input
            type="password"
            class="input"
            placeholder="sk-ant-..."
            bind:value={claude.key}
          />
        </label>
        <label class="field">
          <span class="field-label">Model</span>
          <select class="input select-input" bind:value={claude.model}>
            {#each PROVIDER_MODELS.claude as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-save" onclick={saveClaude}>
          {saveFlash['claude'] ? 'Saved ✓' : 'Save'}
        </button>
        <button
          class="btn btn-test"
          onclick={testClaude}
          disabled={claude.status === 'testing'}
        >
          {claude.status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </section>

    <!-- ── Gemini ─────────────────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-header">
        <div class="provider-badge gemini-badge">Gemini</div>
        {@render statusBadge(gemini.status)}
      </div>

      <div class="fields">
        <label class="field">
          <span class="field-label">API Key</span>
          <input
            type="password"
            class="input"
            placeholder="AIza..."
            bind:value={gemini.key}
          />
        </label>
        <label class="field">
          <span class="field-label">Model</span>
          <select class="input select-input" bind:value={gemini.model}>
            {#each PROVIDER_MODELS.gemini as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-save" onclick={saveGemini}>
          {saveFlash['gemini'] ? 'Saved ✓' : 'Save'}
        </button>
        <button
          class="btn btn-test"
          onclick={testGemini}
          disabled={gemini.status === 'testing'}
        >
          {gemini.status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </section>

    <!-- ── Local AI ───────────────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-header">
        <div class="provider-badge local-badge">Local AI</div>
        {@render statusBadge(local.status)}
      </div>
      <p class="card-note">LM Studio / Ollama compatible endpoint</p>

      <div class="fields fields-local">
        <label class="field field-full">
          <span class="field-label">Base URL</span>
          <input
            type="text"
            class="input"
            placeholder="http://localhost:1234"
            bind:value={local.baseUrl}
          />
        </label>
        <label class="field">
          <span class="field-label">Model</span>
          <input
            type="text"
            class="input"
            placeholder="local-model"
            bind:value={local.model}
          />
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-save" onclick={saveLocal}>
          {saveFlash['local'] ? 'Saved ✓' : 'Save'}
        </button>
        <button
          class="btn btn-test"
          onclick={testLocal}
          disabled={local.status === 'testing'}
        >
          {local.status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </section>
  </main>
</div>

<!-- ── Styles ─────────────────────────────────────────────────────────────── -->
<style>
  /* ── Layout ── */
  .page {
    min-height: 100vh;
    background: var(--bg, #0f1117);
    color: var(--text, #e2e8f0);
    font-family: 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif;
  }

  /* ── Header ── */
  .header {
    background: linear-gradient(135deg, #0f1117 0%, #1a1d27 100%);
    border-bottom: 1px solid #2a2d3e;
    padding: 1.25rem 2rem;
    position: sticky;
    top: 0;
    z-index: 10;
    backdrop-filter: blur(8px);
  }

  .header-inner {
    max-width: 860px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .back-link {
    color: #64748b;
    text-decoration: none;
    font-size: 0.85rem;
    letter-spacing: 0.04em;
    transition: color 0.2s;
    white-space: nowrap;
  }
  .back-link:hover { color: #6366f1; }

  .header-label {
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    color: #6366f1;
    text-transform: uppercase;
    margin-bottom: 0.15rem;
  }

  .header-title {
    font-size: 1.5rem;
    font-weight: 700;
    background: linear-gradient(90deg, #e2e8f0 0%, #6366f1 120%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 0;
  }

  /* ── Main ── */
  .main {
    max-width: 860px;
    margin: 0 auto;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ── Card ── */
  .card {
    background: #1a1d27;
    border: 1px solid #2a2d3e;
    border-radius: 12px;
    padding: 1.5rem 1.75rem;
    transition: border-color 0.2s;
  }
  .card:hover { border-color: #3a3d5e; }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.25rem;
  }

  .card-note {
    font-size: 0.78rem;
    color: #64748b;
    margin-top: -0.75rem;
    margin-bottom: 1.25rem;
  }

  /* ── Provider badges ── */
  .provider-badge {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.3rem 0.75rem;
    border-radius: 6px;
  }

  .openai-badge { background: rgba(16,163,127,0.15); color: #10a37f; border: 1px solid rgba(16,163,127,0.3); }
  .claude-badge { background: rgba(205,127,50,0.15);  color: #d97706; border: 1px solid rgba(205,127,50,0.3); }
  .gemini-badge { background: rgba(99,102,241,0.15);  color: #818cf8; border: 1px solid rgba(99,102,241,0.3); }
  .local-badge  { background: rgba(34,197,94,0.15);   color: #4ade80; border: 1px solid rgba(34,197,94,0.3);  }

  /* ── Status badges ── */
  .status {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    padding: 0.25rem 0.65rem;
    border-radius: 20px;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .not-tested  { background: rgba(100,116,139,0.15); color: #64748b; border: 1px solid rgba(100,116,139,0.3); }
  .connected   { background: rgba(34,197,94,0.15);   color: #4ade80; border: 1px solid rgba(34,197,94,0.3);   }
  .failed      { background: rgba(239,68,68,0.15);   color: #f87171; border: 1px solid rgba(239,68,68,0.3);   }
  .testing     { background: rgba(99,102,241,0.15);  color: #818cf8; border: 1px solid rgba(99,102,241,0.3);  }
  .quota       { background: rgba(234,179,8,0.15);   color: #facc15; border: 1px solid rgba(234,179,8,0.3);   }
  .invalid-key { background: rgba(251,146,60,0.15);  color: #fb923c; border: 1px solid rgba(251,146,60,0.3);  }

  /* ── Dot pulse animation ── */
  .dot-pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #818cf8;
    animation: pulse 1s ease-in-out infinite;
    display: inline-block;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.4; transform: scale(0.7); }
  }

  /* ── Fields ── */
  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .fields-local {
    grid-template-columns: 2fr 1fr;
  }

  @media (max-width: 560px) {
    .fields,
    .fields-local { grid-template-columns: 1fr; }
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .field-label {
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: #64748b;
    text-transform: uppercase;
  }

  .input {
    background: #0f1117;
    border: 1px solid #2a2d3e;
    border-radius: 8px;
    color: #e2e8f0;
    padding: 0.55rem 0.85rem;
    font-size: 0.88rem;
    transition: border-color 0.2s, box-shadow 0.2s;
    width: 100%;
    box-sizing: border-box;
  }
  .input::placeholder { color: #3a3d5e; }
  .select-input { appearance: none; cursor: pointer; }
  .select-input option { background: #1a1d27; color: #e2e8f0; }
  .input:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
  }

  /* ── Action buttons ── */
  .actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .btn {
    padding: 0.5rem 1.2rem;
    border-radius: 8px;
    font-size: 0.83rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    border: none;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.1s, box-shadow 0.2s;
  }
  .btn:active { transform: scale(0.97); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .btn-save {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: #fff;
    box-shadow: 0 2px 8px rgba(99,102,241,0.3);
  }
  .btn-save:hover:not(:disabled) { opacity: 0.9; box-shadow: 0 4px 14px rgba(99,102,241,0.45); }

  .btn-test {
    background: transparent;
    color: #64748b;
    border: 1px solid #2a2d3e;
  }
  .btn-test:hover:not(:disabled) { border-color: #6366f1; color: #818cf8; }
</style>
