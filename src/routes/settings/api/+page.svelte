<script lang="ts">
  import { onMount } from 'svelte';
  import { PROVIDER_MODELS, DEFAULT_MODELS, modelLabel } from '$lib/config/models';
  import {
    AVAILABLE_IMAGE_MODELS,
    AVAILABLE_MEDIA_PROVIDER_OPTIONS,
    mediaModelsByProvider,
    mediaProviderForModel as resolveMediaProviderForModel,
    normalizeMediaModelId,
    type MediaProviderName,
  } from '$lib/config/mediaModels';

  // ── Types ────────────────────────────────────────
  type ConnectionStatus = 'not_tested' | 'connected' | 'failed' | 'quota' | 'invalid_key' | 'testing';
  type ServerStatus = 'OK' | 'Missing API Key' | 'Unauthorized' | 'Quota' | 'Error';
  type ChatProvider = 'openai' | 'grok' | 'gemini' | 'claude' | 'lmstudio';
  type ImageProvider = 'openai' | 'gemini' | 'ideogram';
  type MediaProvider = MediaProviderName;
  type VoiceBackend = 'local' | 'colab';
  type VoiceTtsBackend = 'local' | 'runpod';
  type VideoBackend = 'fal' | 'local' | 'runpod';
  const DEFAULT_RUNPOD_VOICE_MODEL = 'Aratako/Irodori-TTS-v4-Small';
  const RUNPOD_VOICE_MODELS = [
    { id: DEFAULT_RUNPOD_VOICE_MODEL, label: 'v4-Small Full · BF16（推奨・高品質）' },
    { id: 'Aratako/Irodori-TTS-v4-Small-Quantized/int8-weight-only', label: 'v4-Small INT8 · 省VRAM' },
  ] as const;

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

  // ── State ────────────────────────────────────────
  let openai = $state<ApiSection>({
    key: '',
    model: DEFAULT_MODELS.openai,
    status: 'not_tested',
  });

  let grok = $state<ApiSection>({
    key: '',
    model: DEFAULT_MODELS.grok,
    baseUrl: 'https://api.x.ai/v1',
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
  let minimaxKey = $state('');
  let minimaxStatus = $state<ConnectionStatus>('not_tested');
  let runpodKey = $state('');
  let runpodVoiceEndpointId = $state('');
  let runpodVideoEndpointId = $state('');
  let runpodVoiceModel = $state(DEFAULT_RUNPOD_VOICE_MODEL);
  let runpodSessionIdleSeconds = $state(90);
  let runpodMaxActiveSessions = $state(1);
  let runpodWarmIntervalSeconds = $state(45);
  let runpodVoicePodEnabled = $state(false);
  let runpodVoicePodId = $state('');
  let runpodVoicePodUrl = $state('');
  let runpodVoicePodToken = $state('');
  let runpodVoicePodIdleMinutes = $state(30);
  let runpodVoicePodStatus = $state<ConnectionStatus>('not_tested');
  let runpodVoicePodMessage = $state('');
  let runpodVoiceStatus = $state<ConnectionStatus>('not_tested');
  let runpodVoiceMessage = $state('');
  let runpodVoiceAudioUrl = $state('');
  let runpodVoiceResolvedBackend = $state<'runpod-pod' | 'runpod-serverless' | null>(null);
  let runpodVideoStatus = $state<ConnectionStatus>('not_tested');
  let runpodVideoMessage = $state('');
  let voiceBackend = $state<VoiceBackend>('local');
  let voiceTtsBackend = $state<VoiceTtsBackend>('local');
  let voiceLocalUrl = $state('http://127.0.0.1:7860');
  let voiceColabUrl = $state('');
  let videoBackend = $state<VideoBackend>('fal');
  let localVideoUrl = $state('http://127.0.0.1:8793');
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
  let chatProvider = $state<ChatProvider>('openai');
  let imageProvider = $state<ImageProvider>('openai');
  let mediaProvider = $state<MediaProvider>('fal');
  let mediaModel = $state(AVAILABLE_IMAGE_MODELS[0]?.id ?? 'fal-ai/nano-banana-2');
  let mediaProviderModels = $derived(mediaModelsByProvider[mediaProvider] ?? []);

  function mediaProviderForModel(model: string): MediaProvider {
    return resolveMediaProviderForModel(model);
  }

  function normalizeMediaSelection(rawModel: string | null | undefined): string {
    const normalized = normalizeMediaModelId(rawModel ?? undefined);
    return AVAILABLE_IMAGE_MODELS.some((model) => model.id === normalized)
      ? normalized
      : (AVAILABLE_IMAGE_MODELS[0]?.id ?? 'fal-ai/nano-banana-2');
  }

  function ensureMediaModelForProvider(provider: MediaProvider) {
    const available = mediaModelsByProvider[provider] ?? [];
    if (!available.some((model) => model.id === mediaModel) && available[0]) {
      mediaModel = available[0].id;
    }
  }

  function chatModelForProvider(provider: ChatProvider): string {
    if (provider === 'openai') return openai.model;
    if (provider === 'grok') return grok.model;
    if (provider === 'claude') return claude.model;
    if (provider === 'lmstudio') return local.model;
    return gemini.model;
  }

  function imageModelForProvider(provider: ImageProvider): string {
    if (provider === 'gemini') return 'nano-banana';
    if (provider === 'ideogram') return 'ideogram-v3';
    return 'gpt-image-2';
  }

  // ── LocalStorage helpers ────────────────────────────────────────
  function settingsPayload() {
    return {
      chatProvider,
      imageProvider,
      mediaProvider: mediaProviderForModel(mediaModel),
      imageGenerationProvider: mediaProviderForModel(mediaModel),
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
      imageGenerationConfig: {
        provider: mediaProviderForModel(mediaModel),
        model: mediaModel,
      },
      videoGenerationConfig: {
        provider: videoBackend,
      },
      openai: { key: openai.key, model: openai.model },
      grok: { apiKey: grok.key, baseUrl: grok.baseUrl ?? 'https://api.x.ai/v1', model: grok.model, enabled: Boolean(grok.key.trim()) },
      gemini: { key: gemini.key, model: gemini.model },
      anthropic: { key: claude.key, model: claude.model },
      fal: { key: falKey },
      minimax: { key: minimaxKey },
      runpod: {
        apiKey: runpodKey,
        voiceEndpointId: runpodVoiceEndpointId,
        videoEndpointId: runpodVideoEndpointId,
        voiceModel: runpodVoiceModel,
        sessionIdleSeconds: runpodSessionIdleSeconds,
        maxActiveSessions: runpodMaxActiveSessions,
        voiceWarmIntervalSeconds: runpodWarmIntervalSeconds,
        voicePodEnabled: runpodVoicePodEnabled,
        voicePodId: runpodVoicePodId,
        voicePodUrl: runpodVoicePodUrl,
        voicePodToken: runpodVoicePodToken,
        voicePodIdleMinutes: runpodVoicePodIdleMinutes,
      },
      voice: { backend: voiceBackend, ttsBackend: voiceTtsBackend, localUrl: voiceLocalUrl, colabUrl: voiceColabUrl },
      video: { backend: videoBackend, localUrl: localVideoUrl },
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
    const loadedMediaProvider = data.imageGenerationConfig?.provider ?? data.imageGenerationProvider ?? data.mediaConfig?.provider ?? data.mediaProvider;
    chatProvider = loadedChatProvider === 'openai' || loadedChatProvider === 'grok' || loadedChatProvider === 'gemini' || loadedChatProvider === 'claude' || loadedChatProvider === 'lmstudio'
      ? loadedChatProvider
      : 'openai';
    imageProvider = loadedImageProvider === 'openai' || loadedImageProvider === 'gemini' || loadedImageProvider === 'ideogram'
      ? loadedImageProvider
      : 'openai';
    mediaProvider = loadedMediaProvider === 'openai' || loadedMediaProvider === 'fal' || loadedMediaProvider === 'ideogram' ? loadedMediaProvider : 'fal';
    mediaModel = normalizeMediaSelection(data.imageGenerationConfig?.model || data.mediaConfig?.model || data.mediaModel);
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

    grok.key = data.grok?.apiKey ?? data.grok?.key ?? '';
    grok.baseUrl = data.grok?.baseUrl || 'https://api.x.ai/v1';
    grok.model = chatProvider === 'grok'
      ? (data.chatConfig?.model || data.grok?.model || DEFAULT_MODELS.grok)
      : (data.grok?.model || DEFAULT_MODELS.grok);

    gemini.key = data.gemini?.key ?? '';
    gemini.model = chatProvider === 'gemini'
      ? (data.chatConfig?.model || data.gemini?.model || DEFAULT_MODELS.gemini)
      : (data.gemini?.model || DEFAULT_MODELS.gemini);

    local.baseUrl = data.local?.baseUrl || 'http://localhost:1234';
    local.model = chatProvider === 'lmstudio'
      ? (data.chatConfig?.model || data.local?.model || 'qwen/qwen3-4b')
      : (data.local?.model || 'qwen/qwen3-4b');

    falKey = data.fal?.key ?? '';
    minimaxKey = data.minimax?.key ?? '';
    runpodKey = data.runpod?.apiKey ?? data.runpod?.key ?? '';
    runpodVoiceEndpointId = data.runpod?.voiceEndpointId ?? '';
    runpodVideoEndpointId = data.runpod?.videoEndpointId ?? '';
    runpodVoiceModel = data.runpod?.voiceModel || DEFAULT_RUNPOD_VOICE_MODEL;
    runpodSessionIdleSeconds = Number(data.runpod?.sessionIdleSeconds) || 90;
    runpodMaxActiveSessions = Number(data.runpod?.maxActiveSessions) || 1;
    runpodWarmIntervalSeconds = Number(data.runpod?.voiceWarmIntervalSeconds) || 45;
    runpodVoicePodEnabled = data.runpod?.voicePodEnabled === true;
    runpodVoicePodId = data.runpod?.voicePodId ?? '';
    runpodVoicePodUrl = data.runpod?.voicePodUrl ?? '';
    runpodVoicePodToken = data.runpod?.voicePodToken ?? '';
    runpodVoicePodIdleMinutes = Number(data.runpod?.voicePodIdleMinutes ?? 30);
    voiceBackend = data.voice?.backend === 'colab' ? 'colab' : 'local';
    voiceTtsBackend = data.voice?.ttsBackend === 'runpod' || data.voice?.chatBackend === 'runpod' || data.voice?.backend === 'runpod' ? 'runpod' : 'local';
    voiceLocalUrl = data.voice?.localUrl || 'http://127.0.0.1:7860';
    voiceColabUrl = data.voice?.colabUrl || '';
    videoBackend = data.video?.backend === 'local' || data.video?.backend === 'runpod' ? data.video.backend : 'fal';
    localVideoUrl = data.video?.localUrl || 'http://127.0.0.1:8793';
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

  async function saveGrok() {
    await saveSettings();
    flashSave('grok');
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

  async function saveMinimax() {
    await saveSettings();
    flashSave('minimax');
  }

  async function testMinimax() {
    minimaxStatus = 'testing';
    try {
      await saveSettings();
      const response = await fetch('/api/minimax/h3/health', { cache: 'no-store' });
      minimaxStatus = response.ok ? 'connected' : 'failed';
    } catch {
      minimaxStatus = 'failed';
    }
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

  // ── Connection tests ────────────────────────────────────────
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

  async function saveRunpod() {
    voiceTtsBackend = 'runpod';
    await saveSettings();
    flashSave('runpod');
  }

  async function saveRouting() {
    await saveSettings();
    flashSave('routing');
  }

  async function testRunpodVoice() {
    runpodVoiceStatus = 'testing';
    runpodVoiceResolvedBackend = null;
    runpodVoiceMessage = 'RunPodでテスト音声を生成しています。初回は少し時間がかかります。';
    try {
      voiceTtsBackend = 'runpod';
      await saveSettings();
      const response = await fetch('/api/runpod/voice-test', {
        method: 'POST',
        cache: 'no-store',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Voice test failed: HTTP ${response.status}`);
      }
      const audioBlob = await response.blob();
      if (!audioBlob.size) throw new Error('RunPodから空の音声が返されました。');
      if (runpodVoiceAudioUrl) URL.revokeObjectURL(runpodVoiceAudioUrl);
      runpodVoiceAudioUrl = URL.createObjectURL(audioBlob);
      runpodVoiceStatus = 'connected';
      const backend = response.headers.get('x-voice-backend');
      runpodVoiceResolvedBackend = backend === 'runpod-pod' || backend === 'runpod-serverless' ? backend : null;
      runpodVoiceMessage = `${backend === 'runpod-pod' ? 'Pod' : 'Serverless'}でテスト音声を生成しました。再生を開始します。`;
      try {
        await new Audio(runpodVoiceAudioUrl).play();
        runpodVoiceMessage = 'RunPodのテスト音声を再生しています。';
      } catch {
        runpodVoiceMessage = '生成は成功しました。下の再生ボタンを押してください。';
      }
    } catch (error) {
      runpodVoiceStatus = 'failed';
      runpodVoiceMessage = error instanceof Error ? error.message : 'RunPod音声テストに失敗しました。';
    }
  }

  async function manageRunpodVoicePod(action: 'start' | 'stop' | 'check') {
    runpodVoicePodStatus = 'testing';
    runpodVoicePodMessage = action === 'start'
      ? 'Voice Podの起動を要求しています。Irodoriが利用可能になるまで数分かかる場合があります。'
      : action === 'stop'
        ? 'Voice Podを停止しています。'
        : 'Voice PodとIrodori HTTPサービスを確認しています。';
    try {
      await saveSettings();
      const response = await fetch('/api/runpod/voice-pod', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `Voice Pod operation failed: HTTP ${response.status}`);
      runpodVoicePodStatus = 'connected';
      if (action === 'start') {
        runpodVoicePodMessage = 'Voice Podの起動要求を送りました。1〜3分後に「Pod: Check」を押してください。';
      } else if (action === 'stop') {
        runpodVoicePodMessage = 'Voice Podの停止要求を送りました。GPU料金は停止後に止まります。';
      } else {
        const desired = data.pod?.desiredStatus || 'UNKNOWN';
        const voiceReady = data.voice?.ready === true;
        const h3Ready = data.h3?.ready === true;
        runpodVoicePodMessage = (voiceReady || h3Ready)
          ? `共有Pod: ${desired} / 音声 ${voiceReady ? 'Pod直結OK' : '準備中'} / H3 ${h3Ready ? 'Pod直結OK' : '準備中'}`
          : `Pod状態: ${desired}。IrodoriとH3ブリッジはまだ準備中です。`;
        runpodVoicePodStatus = voiceReady || h3Ready ? 'connected' : 'failed';
      }
    } catch (error) {
      runpodVoicePodStatus = 'failed';
      runpodVoicePodMessage = error instanceof Error ? error.message : 'Voice Pod操作に失敗しました。';
    }
  }

  async function testRunpodVideo() {
    runpodVideoStatus = 'testing';
    runpodVideoMessage = 'MiniMax H3 Endpointの接続状態を確認しています（GPUは起動しません）。';
    try {
      videoBackend = 'runpod';
      await saveSettings();
      const response = await fetch('/api/runpod/health?target=h3', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `H3 connection check failed: HTTP ${response.status}`);
      runpodVideoStatus = 'connected';
      const workers = data.health?.workers ?? {};
      const activeWorkers = Number(workers.ready ?? 0)
        + Number(workers.idle ?? 0)
        + Number(workers.running ?? 0)
        + Number(workers.initializing ?? 0);
      runpodVideoMessage = activeWorkers > 0
        ? 'MiniMax H3 Endpointへ接続できました。Workerも稼働中です。'
        : 'MiniMax H3 Endpointへ接続できました。Workerは停止中です（確認ジョブは投入していません）。';
    } catch (error) {
      runpodVideoStatus = 'failed';
      runpodVideoMessage = error instanceof Error ? error.message : 'RunPod H3 Workerの確認に失敗しました。';
    }
  }

  async function prepareRunpodVideo() {
    if (!confirm('H3モデル一式をNetwork Volumeへダウンロードします。RunPod GPU料金が発生し、初回は長時間かかる場合があります。続けますか？')) return;
    runpodVideoStatus = 'testing';
    runpodVideoMessage = 'MiniMax H3モデルをNetwork Volumeへ準備しています。画面を閉じずにお待ちください。';
    try {
      videoBackend = 'runpod';
      await saveSettings();
      const response = await fetch('/api/runpod/video-prepare', { method: 'POST', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `H3 preparation failed: HTTP ${response.status}`);
      runpodVideoStatus = 'connected';
      runpodVideoMessage = 'MiniMax H3モデルの準備が完了しました。';
    } catch (error) {
      runpodVideoStatus = 'failed';
      runpodVideoMessage = error instanceof Error ? error.message : 'MiniMax H3モデルの準備に失敗しました。';
    }
  }

  async function testGrok() {
    grok.status = 'testing';
    try {
      const res = await fetch('/api/check-api-status');
      if (!res.ok) throw new Error();
      const data: Record<string, ServerStatus> = await res.json();
      grok.status = mapStatus(data.grok ?? 'Error');
    } catch {
      grok.status = 'failed';
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

  // ── Lifecycle ────────────────────────────────────────
  onMount(() => { void load(); });
</script>

<!-- ── Snippets ── -->
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

<!-- ── Markup ── -->
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
    <section class="card">
      <div class="card-header">
        <div class="provider-badge local-badge">Providers</div>
      </div>

      <div class="fields">
        <label class="field">
          <span class="field-label">Chat Provider</span>
          <select class="input select-input" bind:value={chatProvider}>
            <option value="openai">OpenAI</option>
            <option value="grok">Grok</option>
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
            <option value="lmstudio">LM Studio</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Image Generation Provider</span>
          <select
            class="input select-input"
            bind:value={mediaProvider}
            onchange={() => ensureMediaModelForProvider(mediaProvider)}
          >
            {#each AVAILABLE_MEDIA_PROVIDER_OPTIONS as provider}
              <option value={provider.id}>{provider.label}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Image Generation Model</span>
          <select class="input select-input" bind:value={mediaModel}>
            {#each mediaProviderModels as model}
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

    <!-- ── OpenAI ── -->
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
              <option value={m}>{modelLabel(m)}</option>
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
          {openai.status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div class="provider-badge grok-badge">GROK</div>
        {@render statusBadge(grok.status)}
      </div>

      <div class="fields fields-local">
        <label class="field">
          <span class="field-label">API Key</span>
          <input
            type="password"
            class="input"
            placeholder="xai-..."
            bind:value={grok.key}
          />
        </label>
        <label class="field">
          <span class="field-label">Base URL</span>
          <input
            type="text"
            class="input"
            placeholder="https://api.x.ai/v1"
            bind:value={grok.baseUrl}
          />
        </label>
        <label class="field">
          <span class="field-label">Model</span>
          <select class="input select-input" bind:value={grok.model}>
            {#each PROVIDER_MODELS.grok as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-save" onclick={saveGrok}>
          {saveFlash['grok'] ? 'Saved' : 'Save'}
        </button>
        <button
          class="btn btn-test"
          onclick={testGrok}
          disabled={grok.status === 'testing'}
        >
          {grok.status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </section>

    <section class="card video-provider-card">
      <div class="card-header">
        <div>
          <p class="header-label">LOCAL / CLOUD EXECUTION</p>
          <h2 class="video-title">Voice &amp; Video Routing</h2>
        </div>
        <div class="provider-badge local-badge">ROUTER</div>
      </div>
      <p class="card-note">チャットAIは変更せず、TTSはIrodori Endpoint、動画はMiniMax H3 Endpointへ個別に接続します。</p>
      <div class="fields">
        <label class="field">
          <span class="field-label">Video Backend</span>
          <select class="input select-input" bind:value={videoBackend}>
            <option value="runpod">RunPod MiniMax H3（推奨）</option>
            <option value="local">Local HunyuanVideo 1.5</option>
            <option value="fal">FAL (従来)</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">TTS Generation Backend</span>
          <select class="input select-input" bind:value={voiceTtsBackend}>
            <option value="local">Local Irodori</option>
            <option value="runpod">RunPod Irodori</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Local Video Worker URL</span>
          <input class="input" bind:value={localVideoUrl} placeholder="http://127.0.0.1:8793" />
        </label>
        <label class="field">
          <span class="field-label">Local Voice Bridge URL</span>
          <input class="input" bind:value={voiceLocalUrl} placeholder="http://127.0.0.1:7860" />
        </label>
        <label class="field">
          <span class="field-label">Colab Voice Bridge URL</span>
          <input class="input" bind:value={voiceColabUrl} placeholder="https://...gradio.live" />
        </label>
      </div>
      <div class="actions">
        <button class="btn btn-save" onclick={saveRouting}>{saveFlash['routing'] ? 'Saved' : 'Save Routing'}</button>
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <p class="header-label">GPU ON DEMAND</p>
          <h2 class="video-title">RunPod Voice &amp; Video</h2>
        </div>
        <div class="provider-badge fal-badge">RUNPOD</div>
      </div>
      <p class="card-note">4090共有PodのIrodori TTSを優先し、停止中は既存Serverlessへ退避します。MiniMax H3とは同じPodを時間差で利用できます。会話AI・reflection・Deep reasoningは変更しません。</p>
      <div class="fields">
        <label class="field">
          <span class="field-label">API Key</span>
          <input type="password" class="input" bind:value={runpodKey} placeholder="RunPod API key" />
        </label>
        <label class="field wide pod-toggle-field">
          <span class="field-label">Shared Pod Priority</span>
          <span class="pod-toggle">
            <input type="checkbox" bind:checked={runpodVoicePodEnabled} />
            音声とH3は4090 Podを優先し、利用不可のときだけ既存Serverlessへ退避する
          </span>
        </label>
        <label class="field">
          <span class="field-label">Voice / H3 Shared Pod ID</span>
          <input class="input" bind:value={runpodVoicePodId} placeholder="RunPodのPod ID" />
        </label>
        <label class="field">
          <span class="field-label">Voice Pod URL</span>
          <input class="input" bind:value={runpodVoicePodUrl} placeholder="https://POD_ID-8791.proxy.runpod.net" />
          <small>空欄ならPod IDから8791番ポートのURLを自動生成します。</small>
        </label>
        <label class="field">
          <span class="field-label">Voice / H3 Shared Pod Token</span>
          <input type="password" class="input" bind:value={runpodVoicePodToken} placeholder="Pod側のtokenファイルの値" />
          <small>公開Proxyの不正利用を防ぐ共有トークンです。</small>
        </label>
        <label class="field">
          <span class="field-label">Pod Idle Auto-stop (minutes)</span>
          <input type="number" min="0" max="240" class="input" bind:value={runpodVoicePodIdleMinutes} />
          <small>0で無効。H3のキュー実行中は停止を延期します。</small>
        </label>
        <label class="field">
          <span class="field-label">Voice Endpoint ID</span>
          <input class="input" bind:value={runpodVoiceEndpointId} placeholder="xxxxxxxxxxxx" />
        </label>
        <label class="field">
          <span class="field-label">MiniMax H3 Video Endpoint ID</span>
          <input class="input" bind:value={runpodVideoEndpointId} placeholder="xxxxxxxxxxxx" />
          <small>音声Endpointとは別に、ai-vtuber-runpod-videoイメージから作成します。</small>
        </label>
        <label class="field wide">
          <span class="field-label">Irodori Voice Model</span>
          <input
            class="input"
            list="runpod-voice-model-options"
            bind:value={runpodVoiceModel}
            placeholder={DEFAULT_RUNPOD_VOICE_MODEL}
          />
          <datalist id="runpod-voice-model-options">
            {#each RUNPOD_VOICE_MODELS as model}
              <option value={model.id}>{model.label}</option>
            {/each}
          </datalist>
          <small>候補から選ぶか、互換性のあるHugging Face checkpointを org/repo[/subfolder] 形式で入力できます。変更後の初回生成ではモデル再読込が入ります。</small>
        </label>
        <label class="field">
          <span class="field-label">Voice Keepalive Interval (seconds)</span>
          <input type="number" min="10" max="300" class="input" bind:value={runpodWarmIntervalSeconds} />
        </label>
        <label class="field">
          <span class="field-label">App Session Auto-stop (seconds)</span>
          <input type="number" min="30" max="3600" class="input" bind:value={runpodSessionIdleSeconds} />
        </label>
        <label class="field">
          <span class="field-label">Max Active RunPod Sessions</span>
          <input type="number" min="1" max="4" class="input" bind:value={runpodMaxActiveSessions} />
        </label>
      </div>
      <div class="actions">
        <button class="btn btn-save" onclick={saveRunpod}>{saveFlash['runpod'] ? 'Saved' : 'Save RunPod'}</button>
        <button class="btn btn-test" onclick={() => manageRunpodVoicePod('start')} disabled={runpodVoicePodStatus === 'testing'}>
          Pod: Start
        </button>
        <button class="btn btn-test" onclick={() => manageRunpodVoicePod('check')} disabled={runpodVoicePodStatus === 'testing'}>
          Pod: Check
        </button>
        <button class="btn btn-test" onclick={() => manageRunpodVoicePod('stop')} disabled={runpodVoicePodStatus === 'testing'}>
          Pod: Stop
        </button>
        <button class="btn btn-test" onclick={testRunpodVoice} disabled={runpodVoiceStatus === 'testing'}>
          Voice: {runpodVoiceStatus === 'testing' ? 'Generating…' : 'Generate & Play Test'}
        </button>
        <button class="btn btn-test" onclick={prepareRunpodVideo} disabled={runpodVideoStatus === 'testing'}>
          H3: {runpodVideoStatus === 'testing' ? 'Preparing…' : 'Download Models'}
        </button>
        <button class="btn btn-test" onclick={testRunpodVideo} disabled={runpodVideoStatus === 'testing'}>
          H3: {runpodVideoStatus === 'testing' ? 'Checking…' : 'Check Worker'}
        </button>
      </div>
      {#if runpodVoicePodMessage}
        <p class="runpod-test-message" class:failed={runpodVoicePodStatus === 'failed'}>{runpodVoicePodMessage}</p>
      {/if}
      {#if runpodVoiceMessage}
        <p class="runpod-test-message" class:failed={runpodVoiceStatus === 'failed'}>{runpodVoiceMessage}</p>
      {/if}
      {#if runpodVoiceResolvedBackend}
        <p class="runpod-route-result" class:pod={runpodVoiceResolvedBackend === 'runpod-pod'}>
          実際の生成先: {runpodVoiceResolvedBackend === 'runpod-pod' ? 'Pod直結' : 'Serverless退避'}
        </p>
      {/if}
      {#if runpodVoiceAudioUrl}
        <audio
          class="runpod-test-audio"
          src={runpodVoiceAudioUrl}
          controls
          preload="auto"
        ></audio>
      {/if}
      {#if runpodVideoMessage}
        <p class="runpod-test-message" class:failed={runpodVideoStatus === 'failed'}>{runpodVideoMessage}</p>
      {/if}
    </section>

    <!-- ── Claude ── -->
    <section class="card">
      <div class="card-header">
        <div class="provider-badge claude-badge">Claude</div>
        {@render statusBadge(claude.status)}
      </div>
      <p class="card-note dev-note">⚠ 開発者専用 — 通常利用は Gemini / OpenAI を推奨</p>

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
          {claude.status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </section>

    <!-- ── Gemini ── -->
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
          {gemini.status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </section>

    <!-- ── FAL ── -->
    <section class="card">
      <div class="card-header">
        <div class="provider-badge fal-badge">FAL</div>
        {@render statusBadge(falStatus)}
      </div>
      <p class="card-note">FAL powers video generation and optional non-OpenAI image models.</p>

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

    <!-- ── Optional MiniMax cloud API fallback ── -->
    <section class="card video-generation-card">
      <div class="card-header">
        <div class="provider-badge minimax-badge">MiniMax Cloud API（任意）</div>
        {@render statusBadge(minimaxStatus)}
      </div>
      <p class="card-note">
        任意のクラウドAPI予備経路です。標準のMiniMax H3生成は上のRunPod Video Endpointを使用するため、通常は未設定で構いません。
      </p>

      <div class="fields" style="grid-template-columns: 1fr;">
        <label class="field">
          <span class="field-label">MiniMax API Key</span>
          <input
            type="password"
            class="input"
            placeholder="MiniMax API key"
            bind:value={minimaxKey}
          />
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-save" onclick={saveMinimax}>
          {saveFlash['minimax'] ? 'Saved' : 'Save'}
        </button>
        <button
          class="btn btn-test"
          onclick={testMinimax}
          disabled={minimaxStatus === 'testing' || !minimaxKey.trim()}
        >
          {minimaxStatus === 'testing' ? 'Testing…' : 'Test Connection（無料）'}
        </button>
      </div>
    </section>

    <section class="card video-generation-card">
      <div class="card-header">
        <div>
          <p class="header-label">VIDEO GENERATION</p>
          <h2 class="video-title">Kling 3.0 Pro</h2>
        </div>
        <div class="provider-badge fal-badge">FAL</div>
      </div>

      <div class="fields">
        <label class="field">
          <span class="field-label">Provider</span>
          <input class="input" value="FAL" readonly />
        </label>
        <label class="field">
          <span class="field-label">Model</span>
          <input class="input" value="Kling 3.0 Pro" readonly />
        </label>
        <label class="field">
          <span class="field-label">Mode</span>
          <input class="input" value="Image to Video" readonly />
        </label>
      </div>

      <p class="card-note">
        Prompt, Duration, Audio, and Reference Image are configured in Studio's VIDEO GENERATION tab.
      </p>
      <div class="actions">
        <a class="btn btn-save video-open-link" href="/project">Open VIDEO GENERATION</a>
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
          {elevenlabs.status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </section>

    <!-- ── Local AI ── -->
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
          {local.status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </section>
  </main>
</div>

<!-- ── Styles ── -->
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
  .dev-note { color: #f59e0b; }

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
  .grok-badge { background: rgba(226,232,240,0.12); color: #e2e8f0; border: 1px solid rgba(226,232,240,0.26); }
  .claude-badge { background: rgba(205,127,50,0.15);  color: #d97706; border: 1px solid rgba(205,127,50,0.3); }
  .gemini-badge { background: rgba(99,102,241,0.15);  color: #818cf8; border: 1px solid rgba(99,102,241,0.3); }
  .fal-badge    { background: rgba(168,85,247,0.15);  color: #c084fc; border: 1px solid rgba(168,85,247,0.3); }
  .minimax-badge { background: rgba(6,182,212,0.15); color: #67e8f9; border: 1px solid rgba(6,182,212,0.35); }
  .ideogram-badge { background: rgba(236,72,153,0.15); color: #f472b6; border: 1px solid rgba(236,72,153,0.3); }
  .elevenlabs-badge { background: rgba(14,165,233,0.15); color: #38bdf8; border: 1px solid rgba(14,165,233,0.3); }
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

  .field.wide { grid-column: 1 / -1; }
  .field small { color: #64748b; font-size: 0.7rem; line-height: 1.45; }

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
  .runpod-test-message { margin: 0.85rem 0 0; color: #86efac; font-size: 0.82rem; }
  .runpod-test-message.failed { color: #fca5a5; }
  .runpod-route-result {
    display: inline-flex;
    margin: 0.6rem 0 0;
    padding: 0.3rem 0.65rem;
    border: 1px solid rgba(251, 191, 36, 0.5);
    border-radius: 999px;
    background: rgba(120, 53, 15, 0.24);
    color: #fde68a;
    font-size: 0.78rem;
    font-weight: 800;
  }
  .runpod-route-result.pod {
    border-color: rgba(74, 222, 128, 0.5);
    background: rgba(6, 78, 59, 0.26);
    color: #a7f3d0;
  }
  .runpod-test-audio { display: block; width: min(100%, 520px); margin-top: 0.75rem; }
  .pod-toggle-field { gap: 0.6rem; }
  .pod-toggle { display: flex; align-items: center; gap: 0.7rem; color: #cbd5e1; font-size: 0.88rem; }
  .pod-toggle input { width: 1.1rem; height: 1.1rem; accent-color: #6366f1; }

  .video-generation-card {
    border-color: rgba(168,85,247,0.45);
    box-shadow: 0 0 24px rgba(168,85,247,0.08);
  }

  .video-title {
    margin: 0.2rem 0 0;
    color: #d8c4ff;
    font-size: 1.05rem;
  }

  .video-open-link {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
</style>
