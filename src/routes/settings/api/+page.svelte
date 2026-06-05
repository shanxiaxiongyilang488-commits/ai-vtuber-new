<script lang="ts">
  import { onMount } from 'svelte';
  import { PROVIDER_MODELS, DEFAULT_MODELS } from '$lib/config/models';

  // 笏笏 Types 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  type ConnectionStatus = 'not_tested' | 'connected' | 'failed' | 'quota' | 'invalid_key' | 'testing';
  type ServerStatus = 'OK' | 'Missing API Key' | 'Unauthorized' | 'Quota' | 'Error';
  type ChatProvider = 'openai' | 'gemini' | 'lmstudio';
  type ImageProvider = 'openai' | 'gemini' | 'ideogram';
  type MediaProvider = 'openai' | 'fal' | 'ideogram';

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

  // 笏笏 State 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
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
    model: 'qwen/qwen3-4b',
    baseUrl: 'http://localhost:1234',
    status: 'not_tested',
  });

  let falKey = $state('');
  let falStatus = $state<ConnectionStatus>('not_tested');
  let ideogram = $state<ApiSection>({
    key: '',
    model: 'ideogram-v3',
    status: 'not_tested',
  });
  let elevenlabs = $state<ApiSection>({
    key: '',
    model: '',
    status: 'not_tested',
  });

  let saveFlash = $state<Record<string, boolean>>({});
  let chatProvider = $state<ChatProvider>('gemini');
  let imageProvider = $state<ImageProvider>('openai');
  let mediaProvider = $state<MediaProvider>('fal');
  let mediaModel = $state('fal-ai/nano-banana');

  const MEDIA_MODELS = [
    { id: 'gpt-image-2', label: 'OpenAI GPT Image 2', provider: 'openai' },
    { id: 'fal-ai/nano-banana-pro', label: 'Nano Banana Pro', provider: 'fal' },
    { id: 'fal-ai/nano-banana', label: 'Nano Banana', provider: 'fal' },
    { id: 'fal-ai/nano-banana-2', label: 'Nano Banana 2', provider: 'fal' },
    { id: 'ideogram-v3', label: 'Ideogram', provider: 'ideogram' },
    { id: 'fal-ai/flux-pro/kontext', label: 'Flux Kontext', provider: 'fal' },
    { id: 'fal-ai/flux-pro/v1.1', label: 'Flux Pro', provider: 'fal' },
  ] as const;

  function mediaProviderForModel(model: string): MediaProvider {
    return MEDIA_MODELS.find((item) => item.id === model)?.provider ?? mediaProvider;
  }

  function chatModelForProvider(provider: ChatProvider): string {
    if (provider === 'openai') return openai.model;
    if (provider === 'lmstudio') return local.model;
    return gemini.model;
  }

  function imageModelForProvider(provider: ImageProvider): string {
    if (provider === 'gemini') return 'nano-banana';
    if (provider === 'ideogram') return 'ideogram-v3';
    return 'gpt-image-2';
  }

  // 笏笏 LocalStorage helpers 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  function settingsPayload() {
    return {
      chatProvider,
      imageProvider,
      mediaProvider: mediaProviderForModel(mediaModel),
      chatConfig: {
        provider: chatProvider,
        model: chatModelForProvider(chatProvider),
      },
      imageConfig: {
        provider: imageProvider,
        model: imageModelForProvider(imageProvider),
      },
      mediaConfig: {
        provider: mediaProviderForModel(mediaModel),
        model: mediaModel,
      },
      openai: { key: openai.key, model: openai.model },
      gemini: { key: gemini.key, model: gemini.model },
      anthropic: { key: claude.key, model: claude.model },
      fal: { key: falKey },
      ideogram: { key: ideogram.key },
      elevenlabs: { key: elevenlabs.key },
      local: { baseUrl: local.baseUrl ?? '', model: local.model },
      image: { provider: imageProvider, model: imageModelForProvider(imageProvider) },
    };
  }

  async function saveSettings() {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsPayload()),
    });
    if (!res.ok) throw new Error('settings save failed');
  }

  async function load() {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const data = await res.json();
    const loadedChatProvider = data.chatConfig?.provider ?? data.chatProvider;
    const loadedImageProvider = data.imageConfig?.provider ?? data.imageProvider ?? data.image?.provider;
    const loadedMediaProvider = data.mediaConfig?.provider ?? data.mediaProvider;
    chatProvider = loadedChatProvider === 'openai' || loadedChatProvider === 'gemini' || loadedChatProvider === 'lmstudio'
      ? loadedChatProvider
      : 'gemini';
    imageProvider = loadedImageProvider === 'openai' || loadedImageProvider === 'gemini' || loadedImageProvider === 'ideogram'
      ? loadedImageProvider
      : 'openai';
    mediaProvider = loadedMediaProvider === 'openai' || loadedMediaProvider === 'fal' || loadedMediaProvider === 'ideogram' ? loadedMediaProvider : 'fal';
    mediaModel = data.mediaConfig?.model || data.mediaModel || 'fal-ai/nano-banana';
    mediaProvider = mediaProviderForModel(mediaModel);

    openai.key = data.openai?.key ?? '';
    openai.model = chatProvider === 'openai'
      ? (data.chatConfig?.model || data.openai?.model || DEFAULT_MODELS.openai)
      : (data.openai?.model || DEFAULT_MODELS.openai);
    {
      const apiKey = openai.key;
      console.log('[OPENAI KEY PREFIX]', apiKey?.slice(0,12));
    }

    claude.key = data.anthropic?.key ?? '';
    claude.model = data.anthropic?.model || DEFAULT_MODELS.claude;

    gemini.key = data.gemini?.key ?? '';
    gemini.model = chatProvider === 'gemini'
      ? (data.chatConfig?.model || data.gemini?.model || DEFAULT_MODELS.gemini)
      : (data.gemini?.model || DEFAULT_MODELS.gemini);

    local.baseUrl = data.local?.baseUrl || 'http://localhost:1234';
    local.model = chatProvider === 'lmstudio'
      ? (data.chatConfig?.model || data.local?.model || 'qwen/qwen3-4b')
      : (data.local?.model || 'qwen/qwen3-4b');

    falKey = data.fal?.key ?? '';
    ideogram.key = data.ideogram?.key ?? '';
    elevenlabs.key = data.elevenlabs?.key ?? '';
  }

  async function saveProviders() {
    await saveSettings();
    flashSave('providers');
  }

  async function saveOpenai() {
    await saveSettings();
    {
      const apiKey = openai.key;
      console.log('[OPENAI KEY PREFIX]', apiKey?.slice(0,12));
    }
    flashSave('openai');
  }

  async function saveClaude() {
    await saveSettings();
    flashSave('claude');
  }

  async function saveGemini() {
    await saveSettings();
    flashSave('gemini');
  }

  async function saveLocal() {
    await saveSettings();
    flashSave('local');
  }

  async function saveFal() {
    await saveSettings();
    flashSave('fal');
  }

  async function saveIdeogram() {
    await saveSettings();
    flashSave('ideogram');
  }

  async function saveElevenLabs() {
    await saveSettings();
    flashSave('elevenlabs');
  }

  function flashSave(id: string) {
    saveFlash[id] = true;
    setTimeout(() => { saveFlash[id] = false; }, 1800);
  }

  // 笏笏 Connection tests 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
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

  async function testElevenLabs() {
    elevenlabs.status = 'testing';
    try {
      const res = await fetch('/api/check-api-status');
      if (!res.ok) throw new Error();
      const data: Record<string, ServerStatus> = await res.json();
      elevenlabs.status = mapStatus(data.elevenlabs);
    } catch {
      elevenlabs.status = 'failed';
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

  // 笏笏 Lifecycle 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  onMount(() => { void load(); });
</script>

<!-- 笏笏 Snippets 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 -->
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

<!-- 笏笏 Markup 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 -->
<div class="page">
  <!-- Header -->
  <header class="header">
    <div class="header-inner">
      <a href="/lab" class="back-link">竊・Back</a>
      <div>
        <p class="header-label">CONTROL PANEL</p>
        <h1 class="header-title">API Settings</h1>
      </div>
    </div>
  </header>

  <main class="main">
    <section class="card">
      <div class="card-header">
        <div class="provider-badge local-badge">Providers</div>
      </div>

      <div class="fields">
        <label class="field">
          <span class="field-label">Chat Provider</span>
          <select class="input select-input" bind:value={chatProvider}>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
            <option value="lmstudio">LM Studio</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Media Provider</span>
          <select class="input select-input" bind:value={mediaProvider}>
            <option value="openai">OpenAI</option>
            <option value="fal">FAL</option>
            <option value="ideogram">Ideogram</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Media Model</span>
          <select class="input select-input" bind:value={mediaModel}>
            {#each MEDIA_MODELS as model}
              <option value={model.id}>{model.label}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-save" onclick={saveProviders}>
          {saveFlash['providers'] ? 'Saved' : 'Save'}
        </button>
      </div>
    </section>

    <!-- 笏笏 OpenAI 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 -->
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
          {saveFlash['openai'] ? 'Saved' : 'Save'}
        </button>
        <button
          class="btn btn-test"
          onclick={testOpenai}
          disabled={openai.status === 'testing'}
        >
          {openai.status === 'testing' ? 'Testing窶ｦ' : 'Test Connection'}
        </button>
      </div>
    </section>

    <!-- 笏笏 Claude 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 -->
    <section class="card">
      <div class="card-header">
        <div class="provider-badge claude-badge">Claude</div>
        {@render statusBadge(claude.status)}
      </div>
      <p class="card-note dev-note">笞 髢狗匱閠・ｰら畑 窶・騾壼ｸｸ蛻ｩ逕ｨ縺ｯ Gemini / OpenAI 繧呈耳螂ｨ</p>

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
          {saveFlash['claude'] ? 'Saved' : 'Save'}
        </button>
        <button
          class="btn btn-test"
          onclick={testClaude}
          disabled={claude.status === 'testing'}
        >
          {claude.status === 'testing' ? 'Testing窶ｦ' : 'Test Connection'}
        </button>
      </div>
    </section>

    <!-- 笏笏 Gemini 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 -->
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
          {saveFlash['gemini'] ? 'Saved' : 'Save'}
        </button>
        <button
          class="btn btn-test"
          onclick={testGemini}
          disabled={gemini.status === 'testing'}
        >
          {gemini.status === 'testing' ? 'Testing窶ｦ' : 'Test Connection'}
        </button>
      </div>
    </section>

    <!-- 笏笏 FAL 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 -->
    <section class="card">
      <div class="card-header">
        <div class="provider-badge fal-badge">FAL</div>
        {@render statusBadge(falStatus)}
      </div>
      <p class="card-note">Experimental only. Media models include OpenAI GPT Image 2, Nano Banana Pro, and Ideogram.</p>

      <div class="fields" style="grid-template-columns: 1fr;">
        <label class="field">
          <span class="field-label">API Key</span>
          <input
            type="password"
            class="input"
            placeholder="fal-..."
            bind:value={falKey}
          />
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-save" onclick={saveFal}>
          {saveFlash['fal'] ? 'Saved' : 'Save'}
        </button>
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div class="provider-badge ideogram-badge">Ideogram</div>
        {@render statusBadge(ideogram.status)}
      </div>

      <div class="fields" style="grid-template-columns: 1fr;">
        <label class="field">
          <span class="field-label">API Key</span>
          <input
            type="password"
            class="input"
            placeholder="ideogram..."
            bind:value={ideogram.key}
          />
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-save" onclick={saveIdeogram}>
          {saveFlash['ideogram'] ? 'Saved' : 'Save'}
        </button>
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div class="provider-badge elevenlabs-badge">ElevenLabs</div>
        {@render statusBadge(elevenlabs.status)}
      </div>

      <div class="fields" style="grid-template-columns: 1fr;">
        <label class="field">
          <span class="field-label">API Key</span>
          <input
            type="password"
            class="input"
            placeholder="xi-..."
            bind:value={elevenlabs.key}
          />
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-save" onclick={saveElevenLabs}>
          {saveFlash['elevenlabs'] ? 'Saved' : 'Save'}
        </button>
        <button
          class="btn btn-test"
          onclick={testElevenLabs}
          disabled={elevenlabs.status === 'testing'}
        >
          {elevenlabs.status === 'testing' ? 'Testing窶ｦ' : 'Test Connection'}
        </button>
      </div>
    </section>

    <!-- 笏笏 Local AI 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 -->
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
            placeholder="qwen/qwen3-4b"
            bind:value={local.model}
          />
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-save" onclick={saveLocal}>
          {saveFlash['local'] ? 'Saved' : 'Save'}
        </button>
        <button
          class="btn btn-test"
          onclick={testLocal}
          disabled={local.status === 'testing'}
        >
          {local.status === 'testing' ? 'Testing窶ｦ' : 'Test Connection'}
        </button>
      </div>
    </section>
  </main>
</div>

<!-- 笏笏 Styles 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 -->
<style>
  /* 笏笏 Layout 笏笏 */
  .page {
    min-height: 100vh;
    background: var(--bg, #0f1117);
    color: var(--text, #e2e8f0);
    font-family: 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif;
  }

  /* 笏笏 Header 笏笏 */
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

  /* 笏笏 Main 笏笏 */
  .main {
    max-width: 860px;
    margin: 0 auto;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* 笏笏 Card 笏笏 */
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
  .dev-note { color: #f59e0b; }

  /* 笏笏 Provider badges 笏笏 */
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
  .fal-badge    { background: rgba(168,85,247,0.15);  color: #c084fc; border: 1px solid rgba(168,85,247,0.3); }
  .ideogram-badge { background: rgba(236,72,153,0.15); color: #f472b6; border: 1px solid rgba(236,72,153,0.3); }
  .elevenlabs-badge { background: rgba(14,165,233,0.15); color: #38bdf8; border: 1px solid rgba(14,165,233,0.3); }
  .local-badge  { background: rgba(34,197,94,0.15);   color: #4ade80; border: 1px solid rgba(34,197,94,0.3);  }

  /* 笏笏 Status badges 笏笏 */
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

  /* 笏笏 Dot pulse animation 笏笏 */
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

  /* 笏笏 Fields 笏笏 */
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

  /* 笏笏 Action buttons 笏笏 */
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
