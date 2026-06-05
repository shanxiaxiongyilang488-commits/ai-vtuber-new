<script lang="ts">
  import { onMount, tick } from 'svelte';

  const focusAreas = [
    'Irodori-TTS',
    'Irodori VoiceDesign',
    '音声サンプル管理',
  ];

  const sampleSlots = [
    { label: 'TTS ENGINE', value: 'Irodori-TTS', tone: 'cyan' },
    { label: 'VOICE DESIGN', value: 'Caption control', tone: 'purple' },
    { label: 'SAMPLE LIBRARY', value: 'voice_library', tone: 'cyan' },
  ];

  const voicePresets = [
    {
      name: 'リセア',
      caption:
        '透明感のある若い女性の声。落ち着きがあり、知的でやわらかい。近い距離感で自然に話す。',
    },
    {
      name: 'ミュリィ',
      caption:
        '明るく軽やかな少女の声。好奇心が強く、少し甘めで親しみやすい。テンポよく元気に話す。',
    },
    {
      name: 'ピオナ',
      caption:
        '穏やかで包み込むような女性の声。少し儚く、優しく丁寧。静かな研究室でささやくように話す。',
    },
  ];

  const stylePresets = [
    { id: 'anime girl', caption: 'アニメ調の若い女性の声。明るく表情豊かで、親しみやすい。' },
    { id: 'cute idol', caption: '可愛いアイドルの声。華やかで甘く、笑顔で元気に話す。' },
    { id: 'sleepy android', caption: '眠たげなアンドロイドの声。無機質で静か、少し息が抜けた話し方。' },
    { id: 'calm android', caption: '落ち着いたアンドロイドの声。安定したトーンで、感情を抑えて丁寧に話す。' },
    { id: 'energetic idol', caption: 'エネルギッシュなアイドルの声。高揚感があり、テンポよく明るく話す。' },
    { id: 'soft voice', caption: '柔らかい声。近い距離感で、優しく穏やかに話す。' },
    { id: 'mature woman', caption: '大人の女性の声。落ち着きがあり、低めで上品に話す。' },
    { id: 'high pitch', caption: '高めの声。軽く澄んだ響きで、可愛らしく話す。' },
    { id: 'low energy', caption: '低エネルギーの声。控えめで淡々と、少し疲れた雰囲気で話す。' },
  ];

  type VoiceLibraryItem = {
    id: string;
    characterName: string;
    text: string;
    caption: string;
    seed: string | null;
    seconds: number;
    steps: number;
    fileName: string;
    audioUrl: string;
    createdAt: string;
    memo: string;
    checkpoint: string;
    generationTimeMs: number;
    modelReloaded: boolean;
  };

  type VoiceModelOption = {
    id: string;
    label: string;
    source: 'default' | 'env' | 'local';
    path?: string;
  };

  type VoiceModelGroup = {
    id: 'irodori-tts' | 'kizuna-voice-designer';
    label: string;
    models: VoiceModelOption[];
  };

  type IrodoriVoiceProfile = {
    characterName: string;
    caption: string;
    voice: string;
    ttsModel: string;
    designerModel: string;
    updatedAt: string;
  };

  type IrodoriSettings = {
    url: string;
    voiceProfiles: Record<string, IrodoriVoiceProfile>;
  };

  type VoiceBackend = 'local' | 'colab';

  type VoiceSettings = {
    backend: VoiceBackend;
    localUrl: string;
    colabUrl: string;
  };

  const TTS_MODEL_STORAGE_KEY = 'voice-lab:model:irodori-tts';
  const DESIGNER_MODEL_STORAGE_KEY = 'voice-lab:model:kizuna-voice-designer';

  let activeTab = $state<'sample' | 'design'>('sample');
  let sampleText = $state('こんにちは。VOICE LABからIrodori-TTSの音声サンプルを生成します。');
  let voice = $state('none');
  let audioUrl = $state<string | null>(null);
  let audioEl = $state<HTMLAudioElement | null>(null);
  let isGenerating = $state(false);
  let errorMessage = $state<string | null>(null);
  let lastGeneratedAt = $state<string | null>(null);
  let characterName = $state('リセア');
  let designText = $state('こんにちは。VOICE LABで作成した声のテストです。');
  let voiceCaption = $state(voicePresets[0].caption);
  let voiceSeed = $state('');
  let voiceSeconds = $state('');
  let voiceSteps = $state('20');
  let voiceMemo = $state('');
  let selectedStyleIds = $state<string[]>([]);
  let designAudioUrl = $state<string | null>(null);
  let designAudioEl = $state<HTMLAudioElement | null>(null);
  let isDesigning = $state(false);
  let designErrorMessage = $state<string | null>(null);
  let designGeneratedAt = $state<string | null>(null);
  let designLibraryName = $state<string | null>(null);
  let lastDesignResult = $state<VoiceLibraryItem | null>(null);
  let voiceLibrary = $state<VoiceLibraryItem[]>([]);
  let libraryErrorMessage = $state<string | null>(null);
  let ttsModels = $state<VoiceModelOption[]>([]);
  let designerModels = $state<VoiceModelOption[]>([]);
  let ttsModel = $state('');
  let designerModel = $state('');
  let modelErrorMessage = $state<string | null>(null);
  let voiceBackend = $state<VoiceBackend>('local');
  let localVoiceUrl = $state('http://127.0.0.1:7860');
  let colabVoiceUrl = $state('');
  let voiceProfiles = $state<Record<string, IrodoriVoiceProfile>>({});
  let settingsMessage = $state<string | null>(null);
  let profileMessage = $state<string | null>(null);

  function currentVoiceEndpoint() {
    return voiceBackend === 'colab' ? colabVoiceUrl : localVoiceUrl;
  }

  function setCurrentVoiceEndpoint(value: string) {
    if (voiceBackend === 'colab') {
      colabVoiceUrl = value;
      return;
    }
    localVoiceUrl = value;
  }

  function applyPreset(name: string) {
    const preset = voicePresets.find((item) => item.name === name);
    if (!preset) return;
    characterName = preset.name;
    loadVoiceProfileForCharacter(preset.name, preset.caption);
  }

  function rebuildCaptionFromStyles() {
    const characterPreset = voicePresets.find((item) => item.name === characterName)?.caption;
    const selectedCaptions = stylePresets
      .filter((preset) => selectedStyleIds.includes(preset.id))
      .map((preset) => preset.caption);
    voiceCaption = [characterPreset, ...selectedCaptions].filter(Boolean).join('\n');
  }

  function toggleStylePreset(id: string) {
    selectedStyleIds = selectedStyleIds.includes(id)
      ? selectedStyleIds.filter((item) => item !== id)
      : [...selectedStyleIds, id];
    rebuildCaptionFromStyles();
  }

  function countSpeechCharacters(value: string) {
    return Array.from(value.replace(/\s+/g, '')).length;
  }

  function estimateSecondsFromText(value: string) {
    const characterCount = countSpeechCharacters(value.trim());
    return Math.max(1, Math.ceil(characterCount / 15));
  }

  function resolvedDesignSeconds() {
    const estimatedSeconds = estimateSecondsFromText(designText);
    const raw = voiceSeconds.trim();
    if (!raw || raw.toLowerCase() === 'auto') return estimatedSeconds;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return estimatedSeconds;
    return Math.max(parsed, estimatedSeconds);
  }

  function secondsModeLabel() {
    const estimatedSeconds = estimateSecondsFromText(designText);
    const raw = voiceSeconds.trim();
    if (!raw || raw.toLowerCase() === 'auto') return `AUTO / ${estimatedSeconds}s`;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return `AUTO FALLBACK / ${estimatedSeconds}s`;
    if (parsed < estimatedSeconds) return `AUTO EXTENDED / ${estimatedSeconds}s`;
    return `MANUAL / ${parsed}s`;
  }

  function modelSourceLabel(model: VoiceModelOption) {
    if (model.source === 'local') return 'LOCAL';
    if (model.source === 'env') return 'ENV';
    return 'IRODORI';
  }

  function restoreSelectedModel(models: VoiceModelOption[], storageKey: string) {
    const saved = localStorage.getItem(storageKey);
    if (saved && models.some((model) => model.id === saved)) return saved;
    return models[0]?.id ?? '';
  }

  async function loadVoiceModels() {
    try {
      const res = await fetch('/api/voice/models');
      if (!res.ok) throw new Error(`model scan failed (${res.status})`);
      const data = (await res.json()) as { engines?: VoiceModelGroup[] };
      const ttsGroup = data.engines?.find((engine) => engine.id === 'irodori-tts');
      const designerGroup = data.engines?.find((engine) => engine.id === 'kizuna-voice-designer');

      ttsModels = ttsGroup?.models ?? [];
      designerModels = designerGroup?.models ?? [];
      ttsModel = restoreSelectedModel(ttsModels, TTS_MODEL_STORAGE_KEY);
      designerModel = restoreSelectedModel(designerModels, DESIGNER_MODEL_STORAGE_KEY);
      loadVoiceProfileForCharacter(characterName, voiceCaption);
      modelErrorMessage = null;
    } catch (e) {
      console.error('[voice-lab] model scan failed:', e);
      modelErrorMessage = e instanceof Error ? e.message : 'Model scan failed';
    }
  }

  function saveTtsModel() {
    if (ttsModel) localStorage.setItem(TTS_MODEL_STORAGE_KEY, ttsModel);
  }

  function saveDesignerModel() {
    if (designerModel) localStorage.setItem(DESIGNER_MODEL_STORAGE_KEY, designerModel);
  }

  async function loadIrodoriSettings() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error(`settings load failed (${res.status})`);
      const data = (await res.json()) as { irodori?: Partial<IrodoriSettings>; voice?: Partial<VoiceSettings> };
      const legacyUrl = data.irodori?.url ?? '';
      voiceBackend = data.voice?.backend === 'colab' ? 'colab' : 'local';
      localVoiceUrl = data.voice?.localUrl || (voiceBackend === 'local' ? legacyUrl : '') || 'http://127.0.0.1:7860';
      colabVoiceUrl = data.voice?.colabUrl || (voiceBackend === 'colab' ? legacyUrl : '') || '';
      voiceProfiles = data.irodori?.voiceProfiles ?? {};
      loadVoiceProfileForCharacter(characterName, voiceCaption);
      settingsMessage = null;
    } catch (e) {
      console.error('[voice-lab] settings load failed:', e);
      settingsMessage = e instanceof Error ? e.message : 'settings load failed';
    }
  }

  async function saveIrodoriSettings(message = 'SETTINGS SAVED') {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        irodori: {
          url: currentVoiceEndpoint().trim(),
          voiceProfiles,
        },
        voice: {
          backend: voiceBackend,
          localUrl: localVoiceUrl.trim(),
          colabUrl: colabVoiceUrl.trim(),
        },
      }),
    });
    if (!res.ok) throw new Error(`settings save failed (${res.status})`);
    settingsMessage = message;
  }

  async function saveIrodoriEndpoint() {
    try {
      await saveIrodoriSettings(`ENDPOINT SAVED: ${voiceBackend.toUpperCase()}`);
    } catch (e) {
      console.error('[voice-lab] endpoint save failed:', e);
      settingsMessage = e instanceof Error ? e.message : 'endpoint save failed';
    }
  }

  function loadVoiceProfileForCharacter(name: string, fallbackCaption = '') {
    const profile = voiceProfiles[name.trim()];
    if (!profile) {
      voiceCaption = fallbackCaption;
      profileMessage = null;
      return;
    }

    voice = profile.voice || voice;
    voiceCaption = profile.caption || fallbackCaption;
    if (profile.ttsModel && ttsModels.some((model) => model.id === profile.ttsModel)) {
      ttsModel = profile.ttsModel;
      saveTtsModel();
    }
    if (profile.designerModel && designerModels.some((model) => model.id === profile.designerModel)) {
      designerModel = profile.designerModel;
      saveDesignerModel();
    }
    profileMessage = `VOICE PROFILE LOADED: ${profile.characterName}`;
  }

  async function saveVoiceProfile() {
    const name = characterName.trim();
    const caption = voiceCaption.trim();
    if (!name || !caption) return;

    const nextProfile: IrodoriVoiceProfile = {
      characterName: name,
      caption,
      voice: voice.trim() || 'none',
      ttsModel,
      designerModel,
      updatedAt: new Date().toISOString(),
    };
    voiceProfiles = {
      ...voiceProfiles,
      [name]: nextProfile,
    };

    try {
      await saveIrodoriSettings(`VOICE PROFILE SAVED: ${name}`);
      profileMessage = `VOICE PROFILE SAVED: ${name}`;
    } catch (e) {
      console.error('[voice-lab] voice profile save failed:', e);
      profileMessage = e instanceof Error ? e.message : 'voice profile save failed';
    }
  }

  async function loadVoiceLibrary() {
    try {
      const res = await fetch('/api/voice/designer');
      if (!res.ok) throw new Error(`voice library failed (${res.status})`);
      const data = (await res.json()) as { items?: VoiceLibraryItem[] };
      voiceLibrary = data.items ?? [];
      libraryErrorMessage = null;
    } catch (e) {
      console.error('[voice-lab] library load failed:', e);
      libraryErrorMessage = e instanceof Error ? e.message : 'Voice Library load failed';
    }
  }

  onMount(() => {
    loadVoiceModels();
    loadVoiceLibrary();
    loadIrodoriSettings();
  });

  async function generateSample() {
    const text = sampleText.trim();
    if (!text || !ttsModel || isGenerating) return;

    isGenerating = true;
    errorMessage = null;

    try {
      const res = await fetch('/api/voice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voice.trim() || 'none', model: ttsModel }),
      });

      if (!res.ok) {
        const detail = await res
          .json()
          .then((data: { error?: string; detail?: string }) => data.detail || data.error || '')
          .catch(() => '');
        throw new Error(detail || `voice generation failed (${res.status})`);
      }

      const data = (await res.json()) as { audioUrl?: string };
      if (!data.audioUrl) {
        throw new Error('audioUrl was not returned');
      }

      audioUrl = `${data.audioUrl}?t=${Date.now()}`;
      lastGeneratedAt = new Date().toLocaleTimeString('ja-JP');

      await tick();
      await audioEl?.play().catch(() => {});
    } catch (e) {
      console.error('[voice-lab] generate failed:', e);
      errorMessage = e instanceof Error ? e.message : '音声生成に失敗しました';
    } finally {
      isGenerating = false;
    }
  }

  async function generateVoiceDesign() {
    const name = characterName.trim();
    const text = designText.trim();
    const caption = voiceCaption.trim();
    const seed = voiceSeed.trim();
    const seconds = voiceSeconds.trim();
    const steps = voiceSteps.trim();
    const memo = voiceMemo.trim();
    if (!name || !text || !caption || !designerModel || !steps || isDesigning) return;

    isDesigning = true;
    designErrorMessage = null;

    try {
      const res = await fetch('/api/voice/designer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterName: name, text, caption, model: designerModel, seed, seconds, steps, memo }),
      });

      if (!res.ok) {
        const detail = await res
          .json()
          .then((data: { error?: string; detail?: string }) => data.detail || data.error || '')
          .catch(() => '');
        throw new Error(detail || `voice designer failed (${res.status})`);
      }

      const data = (await res.json()) as { audioUrl?: string; libraryEntry?: VoiceLibraryItem };
      if (!data.audioUrl) {
        throw new Error('audioUrl was not returned');
      }

      designAudioUrl = `${data.audioUrl}?t=${Date.now()}`;
      designLibraryName = data.audioUrl.split('/').pop() ?? null;
      lastDesignResult = data.libraryEntry ?? null;
      designGeneratedAt = new Date().toLocaleTimeString('ja-JP');
      await saveVoiceProfile();
      await loadVoiceLibrary();

      await tick();
      await designAudioEl?.play().catch(() => {});
    } catch (e) {
      console.error('[voice-lab] voice design failed:', e);
      designErrorMessage = e instanceof Error ? e.message : 'Voice Design failed';
    } finally {
      isDesigning = false;
    }
  }

  async function regenerateFromLibrary(item: VoiceLibraryItem) {
    characterName = item.characterName;
    designText = item.text;
    voiceCaption = item.caption;
    voiceSeed = item.seed ?? '';
    voiceSeconds = String(item.seconds);
    voiceSteps = String(item.steps);
    voiceMemo = item.memo;
    if (designerModels.some((model) => model.id === item.checkpoint)) {
      designerModel = item.checkpoint;
      saveDesignerModel();
    }
    await tick();
    await generateVoiceDesign();
  }
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="voice-shell">
  <div class="grid-bg" aria-hidden="true"></div>
  <div class="scanlines" aria-hidden="true"></div>

  <main class="voice-lab">
    <header class="lab-header">
      <a href="/" class="back-link">← CENTRAL TERMINAL</a>
      <div class="status"><span></span>VOICE RESEARCH SECTION</div>
    </header>

    <section class="hero">
      <div>
        <p class="eyebrow">LOCAL AUDIO RESEARCH MODULE</p>
        <h1>VOICE LAB</h1>
        <p class="lead">Irodori-TTS / Irodori VoiceDesign / 音声サンプル管理</p>
      </div>

      <div class="voice-core" aria-hidden="true">
        <span class="ring ring-a"></span>
        <span class="ring ring-b"></span>
        <span class="ring ring-c"></span>
        <span class="core-dot"></span>
      </div>
    </section>

    <section class="panel-grid">
      <div class="panel main-panel">
        <div class="panel-header">
          <span>{activeTab === 'sample' ? 'VOICE CONTROL' : 'VOICE DESIGN'}</span>
          <b>{isGenerating || isDesigning ? 'GENERATING' : 'READY'}</b>
        </div>

        <div class="tab-bar" role="tablist" aria-label="VOICE LAB modes">
          <button class:active={activeTab === 'sample'} onclick={() => (activeTab = 'sample')}>
            SAMPLE
          </button>
          <button class:active={activeTab === 'design'} onclick={() => (activeTab = 'design')}>
            VOICE DESIGN
          </button>
        </div>

        <div class="control-stack">
          {#if activeTab === 'sample'}
            <label>
              <span>Engine</span>
              <input value="Irodori-TTS" readonly />
            </label>

            <label>
              <span>Model</span>
              <select bind:value={ttsModel} onchange={saveTtsModel} disabled={ttsModels.length === 0}>
                {#each ttsModels as model}
                  <option value={model.id}>{model.label} / {modelSourceLabel(model)}</option>
                {/each}
              </select>
            </label>

            <label>
              <span>Voice Backend</span>
              <select bind:value={voiceBackend}>
                <option value="local">Local</option>
                <option value="colab">Colab</option>
              </select>
            </label>

            <label>
              <span>Endpoint</span>
              <input
                value={currentVoiceEndpoint()}
                placeholder={voiceBackend === 'colab' ? 'https://xxxxx.trycloudflare.com' : 'http://127.0.0.1:7860'}
                oninput={(event) => setCurrentVoiceEndpoint(event.currentTarget.value)}
              />
            </label>

            <div class="actions compact-actions">
              <button onclick={saveIrodoriEndpoint} disabled={!currentVoiceEndpoint().trim()}>
                SAVE ENDPOINT
              </button>
              {#if settingsMessage}
                <span>{settingsMessage}</span>
              {/if}
            </div>

            <label>
              <span>Voice</span>
              <input bind:value={voice} placeholder="none / sample / reference voice id" />
            </label>

            <label>
              <span>Sample Text</span>
              <textarea bind:value={sampleText} placeholder="生成したいテキストを入力"></textarea>
            </label>

            <div class="actions">
              <button onclick={generateSample} disabled={isGenerating || !sampleText.trim() || !ttsModel}>
                {isGenerating ? 'GENERATING WAV...' : 'GENERATE SAMPLE'}
              </button>
              {#if lastGeneratedAt}
                <span>LAST WAV: {lastGeneratedAt}</span>
              {/if}
            </div>

            {#if audioUrl}
              <audio bind:this={audioEl} src={audioUrl} controls></audio>
            {/if}

            {#if errorMessage}
              <div class="error-box">{errorMessage}</div>
            {/if}

            {#if modelErrorMessage}
              <div class="error-box">{modelErrorMessage}</div>
            {/if}
          {:else}
            <label>
              <span>Engine</span>
              <input value="Irodori VoiceDesign" readonly />
            </label>

            <label>
              <span>Voice Backend</span>
              <input value="Irodori VoiceDesign API" readonly />
            </label>

            <label>
              <span>Backend</span>
              <select bind:value={voiceBackend}>
                <option value="local">Local</option>
                <option value="colab">Colab</option>
              </select>
            </label>

            <label>
              <span>Endpoint</span>
              <input
                value={currentVoiceEndpoint()}
                placeholder={voiceBackend === 'colab' ? 'https://xxxxx.trycloudflare.com' : 'http://127.0.0.1:7860'}
                oninput={(event) => setCurrentVoiceEndpoint(event.currentTarget.value)}
              />
            </label>

            <div class="actions compact-actions">
              <button onclick={saveIrodoriEndpoint} disabled={!currentVoiceEndpoint().trim()}>
                SAVE ENDPOINT
              </button>
              {#if settingsMessage}
                <span>{settingsMessage}</span>
              {/if}
            </div>

            <label>
              <span>Model</span>
              <select bind:value={designerModel} onchange={saveDesignerModel} disabled={designerModels.length === 0}>
                {#each designerModels as model}
                  <option value={model.id}>{model.label} / {modelSourceLabel(model)}</option>
                {/each}
              </select>
            </label>

            <div class="preset-row">
              {#each voicePresets as preset}
                <button class:active={characterName === preset.name} onclick={() => applyPreset(preset.name)}>
                  {preset.name}
                </button>
              {/each}
            </div>

            <label>
              <span>Character Name</span>
              <input bind:value={characterName} placeholder="キャラクター名" />
            </label>

            <label>
              <span>Text</span>
              <textarea bind:value={designText} placeholder="生成するセリフを入力"></textarea>
            </label>

            <div class="style-preset-grid">
              {#each stylePresets as preset}
                <button
                  class:active={selectedStyleIds.includes(preset.id)}
                  onclick={() => toggleStylePreset(preset.id)}
                >
                  {preset.id}
                </button>
              {/each}
            </div>

            <label>
              <span>Caption / Style Prompt</span>
              <textarea bind:value={voiceCaption} placeholder="声質・話し方・距離感を記述"></textarea>
            </label>

            <div class="actions compact-actions">
              <button onclick={saveVoiceProfile} disabled={!characterName.trim() || !voiceCaption.trim()}>
                SAVE VOICE PROFILE
              </button>
              {#if profileMessage}
                <span>{profileMessage}</span>
              {/if}
            </div>

            <div class="field-grid">
              <label>
                <span>Seed</span>
                <input bind:value={voiceSeed} inputmode="numeric" placeholder="blank = random" />
              </label>

              <label>
                <span>Seconds</span>
                <input bind:value={voiceSeconds} inputmode="decimal" placeholder="Auto" />
              </label>

              <label>
                <span>Num Steps</span>
                <input bind:value={voiceSteps} inputmode="numeric" placeholder="20" />
              </label>
            </div>

            <div class="estimate-box">
              <span>PREDICTED SECONDS</span>
              <b>{resolvedDesignSeconds()}s</b>
              <p>{secondsModeLabel()} / {countSpeechCharacters(designText)} chars / 15 chars per sec</p>
            </div>

            <label>
              <span>Memo</span>
              <input bind:value={voiceMemo} placeholder="用途・印象・調整メモ" />
            </label>

            <div class="actions">
              <button
                onclick={generateVoiceDesign}
                disabled={isDesigning || !characterName.trim() || !designText.trim() || !voiceCaption.trim() || !designerModel || !voiceSteps.trim()}
              >
                {isDesigning ? 'DESIGNING VOICE...' : 'VOICE DESIGN GENERATE'}
              </button>
              {#if designGeneratedAt}
                <span>VOICE LIBRARY: {designGeneratedAt}</span>
              {/if}
            </div>

            {#if designLibraryName}
              <div class="library-entry">
                <span>REGISTERED</span>
                <b>{designLibraryName}</b>
              </div>
            {/if}

            {#if lastDesignResult}
              <div class="result-grid">
                <div><span>SEED</span><b>{lastDesignResult.seed ?? 'random'}</b></div>
                <div><span>TIME</span><b>{lastDesignResult.generationTimeMs} ms</b></div>
                <div><span>RELOAD</span><b>{lastDesignResult.modelReloaded ? 'YES' : 'NO'}</b></div>
                <div><span>CHECKPOINT</span><b>{lastDesignResult.checkpoint}</b></div>
                <div class="wide"><span>CAPTION</span><p>{lastDesignResult.caption}</p></div>
              </div>
            {/if}

            {#if designAudioUrl}
              <audio bind:this={designAudioEl} src={designAudioUrl} controls></audio>
            {/if}

            {#if designErrorMessage}
              <div class="error-box">{designErrorMessage}</div>
            {/if}

            {#if modelErrorMessage}
              <div class="error-box">{modelErrorMessage}</div>
            {/if}

            <div class="library-list">
              <div class="panel-header library-header">
                <span>VOICE LIBRARY</span>
                <button onclick={loadVoiceLibrary}>REFRESH</button>
              </div>

              {#if libraryErrorMessage}
                <div class="error-box">{libraryErrorMessage}</div>
              {:else if voiceLibrary.length === 0}
                <div class="library-empty">NO VOICE DATA</div>
              {:else}
                {#each voiceLibrary as item}
                  <div class="library-card">
                    <div>
                      <b>{item.characterName}</b>
                      <span>{new Date(item.createdAt).toLocaleString('ja-JP')} / seed {item.seed ?? 'random'} / {item.seconds}s / {item.steps} steps</span>
                    </div>
                    <p>{item.memo || item.caption}</p>
                    <p class="caption-line">{item.caption}</p>
                    <div class="library-meta">
                      <span>{item.generationTimeMs ?? 0} ms</span>
                      <span>reload {item.modelReloaded ? 'yes' : 'no'}</span>
                      <button onclick={() => regenerateFromLibrary(item)}>SAME SEED</button>
                    </div>
                    <audio src={`${item.audioUrl}?t=${item.createdAt}`} controls></audio>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <aside class="panel side-panel">
        <div class="panel-header">
          <span>RESEARCH TARGETS</span>
          <b>ACTIVE PLAN</b>
        </div>

        <ul>
          {#each focusAreas as area}
            <li>{area}</li>
          {/each}
        </ul>

        <div class="profile-list">
          <div class="panel-header library-header">
            <span>VOICE PROFILES</span>
            <b>{Object.keys(voiceProfiles).length}</b>
          </div>
          {#if Object.keys(voiceProfiles).length === 0}
            <div class="library-empty">NO PROFILE DATA</div>
          {:else}
            {#each Object.values(voiceProfiles) as profile}
              <button class="profile-card" onclick={() => loadVoiceProfileForCharacter(profile.characterName)}>
                <b>{profile.characterName}</b>
                <span>{new Date(profile.updatedAt).toLocaleString('ja-JP')}</span>
                <p>{profile.caption}</p>
              </button>
            {/each}
          {/if}
        </div>
      </aside>
    </section>

    <section class="slot-grid">
      {#each sampleSlots as slot}
        <div class:purple={slot.tone === 'purple'} class="slot-card">
          <span>{slot.label}</span>
          <b>{slot.value}</b>
        </div>
      {/each}
    </section>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #030712 !important;
    color: #e2e8f0;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    min-height: 100%;
    height: auto !important;
    overflow-x: hidden;
    overflow-y: auto !important;
  }

  :global(html),
  :global(#app) {
    min-height: 100%;
    height: auto !important;
    overflow-y: auto !important;
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
    letter-spacing: 0;
  }

  .voice-shell {
    position: relative;
    min-height: 100vh;
    overflow-x: hidden;
    overflow-y: auto;
    background:
      radial-gradient(circle at 50% -12%, rgba(56, 189, 248, 0.18), transparent 38%),
      radial-gradient(circle at 92% 74%, rgba(168, 85, 247, 0.14), transparent 34%),
      linear-gradient(180deg, #020617 0%, #030712 55%, #050816 100%);
  }

  .grid-bg,
  .scanlines {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .grid-bg {
    z-index: 0;
    background-image:
      linear-gradient(rgba(56, 189, 248, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56, 189, 248, 0.045) 1px, transparent 1px),
      linear-gradient(rgba(168, 85, 247, 0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(168, 85, 247, 0.025) 1px, transparent 1px);
    background-size: 56px 56px, 56px 56px, 14px 14px, 14px 14px;
  }

  .scanlines {
    z-index: 3;
    opacity: 0.45;
    background: repeating-linear-gradient(0deg, rgba(255,255,255,0.018), rgba(255,255,255,0.018) 1px, transparent 1px, transparent 4px);
  }

  .voice-lab {
    position: relative;
    z-index: 2;
    width: min(1120px, calc(100vw - 40px));
    min-height: 100vh;
    height: auto !important;
    max-height: none !important;
    overflow: visible;
    margin: 0 auto;
    padding: 34px 0;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 24px;
  }

  .lab-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
  }

  .back-link {
    color: #67e8f9;
    text-decoration: none;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background: rgba(8, 18, 36, 0.58);
    padding: 10px 14px;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: rgba(203, 213, 225, 0.66);
  }

  .status span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 12px #38bdf8;
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 28px;
    align-items: center;
    padding: 34px;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background:
      linear-gradient(120deg, rgba(8, 15, 32, 0.82), rgba(12, 12, 34, 0.76)),
      radial-gradient(circle at 82% 50%, rgba(56,189,248,0.14), transparent 38%);
    box-shadow: 0 28px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06);
  }

  .eyebrow {
    margin: 0 0 10px;
    color: rgba(148, 163, 184, 0.68);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
  }

  h1 {
    margin: 0;
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(48px, 9vw, 96px) !important;
    line-height: 0.95;
    color: transparent;
    background: linear-gradient(90deg, #38bdf8, #818cf8 46%, #c084fc);
    -webkit-background-clip: text;
    background-clip: text;
    filter: drop-shadow(0 0 24px rgba(56,189,248,0.56)) drop-shadow(0 0 46px rgba(168,85,247,0.36));
  }

  .lead {
    margin: 12px 0 0;
    color: #cbd5e1;
    font-size: 20px !important;
  }

  .voice-core {
    position: relative;
    height: 220px;
    display: grid;
    place-items: center;
  }

  .ring {
    position: absolute;
    border-radius: 50%;
    border-style: solid;
  }

  .ring-a {
    width: 210px;
    height: 210px;
    border: 1px solid rgba(56, 189, 248, 0.32);
    border-top-color: #38bdf8;
    animation: spin 14s linear infinite;
  }

  .ring-b {
    width: 150px;
    height: 150px;
    border: 1px solid rgba(168, 85, 247, 0.28);
    border-right-color: #c084fc;
    animation: spin-reverse 9s linear infinite;
  }

  .ring-c {
    width: 86px;
    height: 86px;
    border: 1px solid rgba(56, 189, 248, 0.3);
    border-bottom-color: #67e8f9;
    animation: spin 5s linear infinite;
  }

  .core-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #e0f2fe;
    box-shadow: 0 0 18px #38bdf8, 0 0 56px rgba(56,189,248,0.56);
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes spin-reverse { to { transform: rotate(-360deg); } }

  .panel-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.6fr);
    gap: 18px;
    height: auto;
    max-height: none;
    overflow: visible;
  }

  .panel,
  .slot-card {
    border: 1px solid rgba(56, 189, 248, 0.2);
    background: rgba(8, 15, 32, 0.72);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .panel {
    padding: 20px;
  }

  .main-panel,
  .control-stack {
    height: auto;
    max-height: none;
    overflow: visible;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    color: rgba(148, 163, 184, 0.7);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    margin-bottom: 18px;
  }

  .panel-header b {
    color: #67e8f9;
  }

  .tab-bar,
  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 16px;
  }

  .tab-bar button,
  .preset-row button {
    min-height: 38px;
    padding: 9px 14px;
    border-color: rgba(56, 189, 248, 0.24);
    background: rgba(56, 189, 248, 0.055);
    color: rgba(203, 213, 225, 0.72);
  }

  .tab-bar button.active,
  .preset-row button.active {
    border-color: rgba(192, 132, 252, 0.58);
    background: rgba(168, 85, 247, 0.16);
    color: #e9d5ff;
    box-shadow: 0 0 20px rgba(168, 85, 247, 0.18);
  }

  .style-preset-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .style-preset-grid button {
    min-height: 38px;
    padding: 9px 10px;
    border-color: rgba(56, 189, 248, 0.22);
    background: rgba(56, 189, 248, 0.045);
    color: rgba(203, 213, 225, 0.74);
    font-size: 11px !important;
  }

  .style-preset-grid button.active {
    border-color: rgba(192, 132, 252, 0.58);
    background: rgba(168, 85, 247, 0.16);
    color: #e9d5ff;
  }

  .control-stack {
    display: grid;
    gap: 14px;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .estimate-box {
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(56, 189, 248, 0.055);
    padding: 12px;
    display: grid;
    gap: 5px;
  }

  .estimate-box span {
    color: rgba(148, 163, 184, 0.74);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .estimate-box b {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 18px !important;
  }

  .estimate-box p {
    margin: 0;
    color: rgba(203, 213, 225, 0.76);
    font-size: 13px !important;
  }

  label {
    display: grid;
    gap: 7px;
    color: #94a3b8;
    font-size: 14px !important;
  }

  label span {
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    color: rgba(203, 213, 225, 0.64);
  }

  input,
  select,
  textarea {
    width: 100%;
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(2, 6, 23, 0.68);
    color: #cbd5e1;
    padding: 12px 14px;
    font: inherit;
    min-height: 44px;
  }

  select {
    appearance: none;
  }

  input[readonly] {
    color: rgba(203, 213, 225, 0.66);
  }

  textarea {
    min-height: 120px;
    resize: vertical;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .compact-actions {
    margin-top: -4px;
  }

  .actions span {
    color: rgba(148, 163, 184, 0.74);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  button {
    justify-self: start;
    border: 1px solid rgba(168, 85, 247, 0.36);
    background: rgba(168, 85, 247, 0.08);
    color: #c084fc;
    font-family: 'Orbitron', sans-serif;
    padding: 12px 18px;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.5;
  }

  audio {
    width: 100%;
  }

  .error-box {
    border: 1px solid rgba(248, 113, 113, 0.28);
    background: rgba(127, 29, 29, 0.16);
    color: #fecaca;
    padding: 12px;
    font-size: 13px !important;
    white-space: pre-wrap;
  }

  .library-entry {
    border: 1px solid rgba(56, 189, 248, 0.2);
    background: rgba(56, 189, 248, 0.06);
    padding: 12px;
    display: grid;
    gap: 5px;
  }

  .library-entry span {
    color: rgba(148, 163, 184, 0.74);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .library-entry b {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 13px !important;
    overflow-wrap: anywhere;
  }

  .result-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    border: 1px solid rgba(168, 85, 247, 0.2);
    background: rgba(168, 85, 247, 0.055);
    padding: 12px;
  }

  .result-grid div {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .result-grid .wide {
    grid-column: 1 / -1;
  }

  .result-grid span,
  .library-meta span {
    color: rgba(148, 163, 184, 0.74);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .result-grid b {
    color: #e9d5ff;
    font-family: 'Orbitron', sans-serif;
    font-size: 12px !important;
    overflow-wrap: anywhere;
  }

  .result-grid p {
    margin: 0;
    color: rgba(203, 213, 225, 0.84);
    font-size: 13px !important;
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .library-list {
    display: grid;
    gap: 12px;
    margin-top: 8px;
    padding-top: 16px;
    border-top: 1px solid rgba(56, 189, 248, 0.12);
  }

  .profile-list {
    display: grid;
    gap: 10px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid rgba(56, 189, 248, 0.12);
  }

  .profile-card {
    width: 100%;
    display: grid;
    gap: 6px;
    justify-items: stretch;
    text-align: left;
    border-color: rgba(56, 189, 248, 0.18);
    background: rgba(2, 6, 23, 0.48);
    color: #cbd5e1;
    padding: 12px;
  }

  .profile-card b {
    color: #67e8f9;
    font-size: 12px !important;
  }

  .profile-card span {
    color: rgba(148, 163, 184, 0.74);
    font-size: 10px !important;
  }

  .profile-card p {
    margin: 0;
    color: rgba(203, 213, 225, 0.72);
    font-size: 12px !important;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .library-header {
    margin-bottom: 0;
    align-items: center;
  }

  .library-header button {
    padding: 8px 10px;
    font-size: 10px !important;
  }

  .library-empty {
    border: 1px solid rgba(56, 189, 248, 0.14);
    background: rgba(2, 6, 23, 0.42);
    color: rgba(148, 163, 184, 0.76);
    padding: 14px;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
  }

  .library-card {
    display: grid;
    gap: 10px;
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(2, 6, 23, 0.5);
    padding: 12px;
  }

  .library-card > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .library-card b {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 13px !important;
  }

  .library-card span {
    color: rgba(148, 163, 184, 0.72);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .library-card p {
    margin: 0;
    color: rgba(203, 213, 225, 0.78);
    font-size: 13px !important;
    line-height: 1.45;
  }

  .library-card .caption-line {
    color: rgba(203, 213, 225, 0.62);
    white-space: pre-wrap;
  }

  .library-meta {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .library-meta button {
    margin-left: auto;
    padding: 8px 10px;
    font-size: 10px !important;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }

  li {
    padding: 12px;
    color: #cbd5e1;
    border: 1px solid rgba(168, 85, 247, 0.18);
    background: rgba(168, 85, 247, 0.045);
  }

  .slot-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }

  .slot-card {
    padding: 18px;
    display: grid;
    gap: 8px;
  }

  .slot-card.purple {
    border-color: rgba(168, 85, 247, 0.24);
  }

  .slot-card span {
    color: rgba(148, 163, 184, 0.68);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .slot-card b {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 18px !important;
  }

  .slot-card.purple b {
    color: #c084fc;
  }

  @media (max-width: 840px) {
    .voice-lab {
      width: min(100% - 24px, 680px);
    }

    .hero,
    .panel-grid {
      grid-template-columns: 1fr;
    }

    .slot-grid {
      grid-template-columns: 1fr;
    }

    .field-grid,
    .style-preset-grid,
    .result-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
