<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  type VoiceMode = 'design' | 'clone' | 'lora';

  type CharacterVoiceConfig = {
    engine: string;
    mode: VoiceMode;
    model: string;
    caption?: string;
    speed?: number;
    autoSpeak?: boolean;
  };

  type CharacterEntry = {
    id: string;
    name: string;
    role: string;
    voice?: CharacterVoiceConfig | null;
  };

  type VoiceCandidate = {
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
    mode?: VoiceMode;
  };

  type VoiceModelOption = {
    id: string;
    label: string;
    source: 'default' | 'env' | 'local';
  };

  type VoiceBackend = 'local' | 'colab';

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

  const DESIGNER_MODEL_STORAGE_KEY = 'voice-lab:model:kizuna-voice-designer';

  // --- form state -------------------------------------------------------
  let characters = $state<CharacterEntry[]>([]);
  let selectedCharacterId = $state('');
  let mode = $state<VoiceMode>('design');
  let voiceCaption = $state('');
  let sampleText = $state('こんにちは。VOICE LABで作成した声のテストです。');
  let candidateName = $state('');
  let cloneModel = $state('');
  let loraModel = $state('');
  let autoSpeak = $state(false);

  // --- resources --------------------------------------------------------
  let candidates = $state<VoiceCandidate[]>([]);
  let keptVoices = $state<string[]>([]);
  let loras = $state<string[]>([]);
  let bridgeReachable = $state(false);
  let bridgeInfo = $state('');
  let designerModels = $state<VoiceModelOption[]>([]);
  let designerModel = $state('');

  // --- advanced ---------------------------------------------------------
  let voiceSeed = $state('');
  let voiceSeconds = $state('');
  let voiceSteps = $state('20');
  let voiceSpeed = $state('1.0');
  let voiceBackend = $state<VoiceBackend>('local');
  let localVoiceUrl = $state('http://127.0.0.1:7860');
  let colabVoiceUrl = $state('');
  let settingsMessage = $state<string | null>(null);

  // --- status -----------------------------------------------------------
  let isGenerating = $state(false);
  let elapsedSec = $state(0);
  let generateError = $state<string | null>(null);
  let statusMessage = $state<string | null>(null);
  let candidatesError = $state<string | null>(null);
  let busyCandidateId = $state<string | null>(null);
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;

  const selectedCharacter = $derived(characters.find((entry) => entry.id === selectedCharacterId) ?? null);
  const currentVoice = $derived(selectedCharacter?.voice ?? null);

  const canGenerate = $derived.by(() => {
    if (isGenerating || !selectedCharacter || !sampleText.trim()) return false;
    if (mode === 'design') return Boolean(voiceCaption.trim() && designerModel);
    if (mode === 'clone') return Boolean(cloneModel);
    return Boolean(loraModel);
  });

  const canApplyForm = $derived.by(() => {
    if (!selectedCharacter) return false;
    if (mode === 'design') return Boolean(voiceCaption.trim());
    if (mode === 'clone') return Boolean(cloneModel);
    return Boolean(loraModel);
  });

  function parsedSpeed(): number {
    const parsed = Number(voiceSpeed);
    return Number.isFinite(parsed) && parsed > 0.25 && parsed < 4 ? parsed : 1;
  }

  function countSpeechCharacters(value: string) {
    return Array.from(value.replace(/\s+/g, '')).length;
  }

  function estimatedSeconds() {
    return Math.max(1, Math.ceil(countSpeechCharacters(sampleText.trim()) / 15));
  }

  function candidateTitle(item: VoiceCandidate) {
    return item.memo || `${item.characterName} / ${item.mode ?? 'design'}`;
  }

  function candidateMode(item: VoiceCandidate): VoiceMode {
    return item.mode ?? 'design';
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString('ja-JP');
  }

  function describeVoice(voice: CharacterVoiceConfig | null) {
    if (!voice) return 'NOT CONFIGURED';
    const parts = [`mode=${voice.mode}`];
    if (voice.model) parts.push(`model=${voice.model}`);
    if (voice.speed && voice.speed !== 1) parts.push(`speed=${voice.speed}`);
    if (voice.autoSpeak) parts.push('autoSpeak');
    return parts.join(' / ');
  }

  function syncAutoSpeakFromCharacter() {
    autoSpeak = Boolean(selectedCharacter?.voice?.autoSpeak);
  }

  // --- loading ----------------------------------------------------------
  async function loadCharacters() {
    try {
      const res = await fetch('/api/characters');
      if (!res.ok) throw new Error(`characters load failed (${res.status})`);
      const data = (await res.json()) as { characters?: CharacterEntry[] };
      characters = data.characters ?? [];
      if (!selectedCharacterId && characters.length > 0) {
        selectedCharacterId = characters[0].id;
      }
      syncAutoSpeakFromCharacter();
    } catch (e) {
      console.error('[voice-lab] characters load failed:', e);
    }
  }

  async function loadCandidates() {
    try {
      const res = await fetch('/api/voice/designer');
      if (!res.ok) throw new Error(`candidates load failed (${res.status})`);
      const data = (await res.json()) as { items?: VoiceCandidate[] };
      candidates = data.items ?? [];
      candidatesError = null;
    } catch (e) {
      console.error('[voice-lab] candidates load failed:', e);
      candidatesError = e instanceof Error ? e.message : 'candidates load failed';
    }
  }

  async function loadBridgeResources() {
    try {
      const res = await fetch('/api/voice/candidates');
      if (!res.ok) throw new Error(`bridge status failed (${res.status})`);
      const data = (await res.json()) as {
        bridge?: { reachable?: boolean; backend?: string | null; device?: string | null; loras?: string[] };
        keptVoices?: string[];
      };
      bridgeReachable = Boolean(data.bridge?.reachable);
      bridgeInfo = bridgeReachable
        ? `${data.bridge?.backend ?? '?'} / ${data.bridge?.device ?? '?'}`
        : 'OFFLINE';
      loras = data.bridge?.loras ?? [];
      keptVoices = data.keptVoices ?? [];
      if (!cloneModel && keptVoices.length > 0) cloneModel = keptVoices[0];
      if (!loraModel && loras.length > 0) loraModel = loras[0];
    } catch (e) {
      console.error('[voice-lab] bridge status failed:', e);
      bridgeReachable = false;
      bridgeInfo = 'OFFLINE';
    }
  }

  async function loadDesignerModels() {
    try {
      const res = await fetch('/api/voice/models');
      if (!res.ok) throw new Error(`model scan failed (${res.status})`);
      const data = (await res.json()) as { engines?: { id: string; models: VoiceModelOption[] }[] };
      designerModels = data.engines?.find((engine) => engine.id === 'kizuna-voice-designer')?.models ?? [];
      const saved = localStorage.getItem(DESIGNER_MODEL_STORAGE_KEY);
      designerModel = saved && designerModels.some((model) => model.id === saved)
        ? saved
        : (designerModels[0]?.id ?? '');
    } catch (e) {
      console.error('[voice-lab] model scan failed:', e);
    }
  }

  async function loadEndpointSettings() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error(`settings load failed (${res.status})`);
      const data = (await res.json()) as {
        voice?: { backend?: string; localUrl?: string; colabUrl?: string };
      };
      voiceBackend = data.voice?.backend === 'colab' ? 'colab' : 'local';
      localVoiceUrl = data.voice?.localUrl || 'http://127.0.0.1:7860';
      colabVoiceUrl = data.voice?.colabUrl || '';
    } catch (e) {
      console.error('[voice-lab] settings load failed:', e);
    }
  }

  async function saveEndpointSettings() {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: {
            backend: voiceBackend,
            localUrl: localVoiceUrl.trim(),
            colabUrl: colabVoiceUrl.trim(),
          },
        }),
      });
      if (!res.ok) throw new Error(`settings save failed (${res.status})`);
      settingsMessage = `ENDPOINT SAVED: ${voiceBackend.toUpperCase()}`;
    } catch (e) {
      settingsMessage = e instanceof Error ? e.message : 'endpoint save failed';
    }
  }

  onMount(() => {
    loadCharacters();
    loadCandidates();
    loadBridgeResources();
    loadDesignerModels();
    loadEndpointSettings();
  });

  onDestroy(() => {
    if (elapsedTimer) clearInterval(elapsedTimer);
  });

  // --- actions ----------------------------------------------------------
  function startElapsed() {
    elapsedSec = 0;
    elapsedTimer = setInterval(() => (elapsedSec += 1), 1000);
  }

  function stopElapsed() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  async function generateVoice() {
    if (!canGenerate || !selectedCharacter) return;

    isGenerating = true;
    generateError = null;
    statusMessage = null;
    startElapsed();

    try {
      let res: Response;
      if (mode === 'design') {
        res = await fetch('/api/voice/designer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterName: selectedCharacter.name,
            text: sampleText.trim(),
            caption: voiceCaption.trim(),
            model: designerModel,
            seed: voiceSeed.trim(),
            seconds: voiceSeconds.trim(),
            steps: voiceSteps.trim() || '20',
            memo: candidateName.trim(),
          }),
        });
      } else {
        res = await fetch('/api/voice/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterName: selectedCharacter.name,
            text: sampleText.trim(),
            mode,
            model: mode === 'clone' ? cloneModel : loraModel,
            caption: voiceCaption.trim(),
            speed: parsedSpeed(),
            memo: candidateName.trim(),
          }),
        });
      }

      if (!res.ok) {
        const detail = await res
          .json()
          .then((data: { error?: string; detail?: string }) => data.detail || data.error || '')
          .catch(() => '');
        throw new Error(detail || `voice generation failed (${res.status})`);
      }

      const data = (await res.json()) as { libraryEntry?: VoiceCandidate };
      if (data.libraryEntry) {
        candidates = [data.libraryEntry, ...candidates.filter((item) => item.id !== data.libraryEntry?.id)];
      } else {
        await loadCandidates();
      }
      statusMessage = `CANDIDATE ADDED (${elapsedSec}s)`;
    } catch (e) {
      console.error('[voice-lab] generate failed:', e);
      generateError = e instanceof Error ? e.message : 'voice generation failed';
    } finally {
      stopElapsed();
      isGenerating = false;
    }
  }

  async function putCharacterVoice(payload: Record<string, unknown>): Promise<CharacterEntry> {
    if (!selectedCharacter) throw new Error('character is not selected');
    const res = await fetch(`/api/characters/${encodeURIComponent(selectedCharacter.id)}/voice`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { character?: CharacterEntry; message?: string };
    if (!res.ok || !data.character) {
      throw new Error(data.message || `voice update failed (${res.status})`);
    }
    characters = characters.map((entry) => (entry.id === data.character?.id ? data.character : entry));
    return data.character;
  }

  async function adoptCandidate(item: VoiceCandidate) {
    if (!selectedCharacter || busyCandidateId) return;

    busyCandidateId = item.id;
    generateError = null;
    statusMessage = null;

    try {
      const base = {
        engine: 'irodori',
        speed: parsedSpeed(),
        autoSpeak,
      };
      const itemMode = candidateMode(item);
      let payload: Record<string, unknown>;

      if (itemMode === 'design') {
        // design 候補は wav を kept voice として登録し clone モードで採用する
        // (bridge の design 直接合成は 30 秒固定生成で CPU では実用外のため)。
        payload = {
          voice: { ...base, mode: 'design', model: '', caption: item.caption },
          keptVoice: {
            sourceAudioUrl: item.audioUrl,
            text: item.text,
            name: `${selectedCharacter.id}_${item.id.slice(0, 8)}`,
          },
        };
      } else {
        payload = {
          voice: {
            ...base,
            mode: itemMode,
            model: item.checkpoint,
            ...(item.caption ? { caption: item.caption } : {}),
          },
        };
      }

      const character = await putCharacterVoice(payload);
      statusMessage = `ADOPTED: ${candidateTitle(item)} → ${character.name}`;
      if (itemMode === 'design') await loadBridgeResources();
    } catch (e) {
      console.error('[voice-lab] adopt failed:', e);
      generateError = e instanceof Error ? e.message : 'adopt failed';
    } finally {
      busyCandidateId = null;
    }
  }

  async function deleteCandidate(item: VoiceCandidate) {
    if (busyCandidateId) return;
    if (!confirm(`候補「${candidateTitle(item)}」を削除しますか?`)) return;

    busyCandidateId = item.id;
    try {
      const res = await fetch(`/api/voice/candidates?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `delete failed (${res.status})`);
      }
      candidates = candidates.filter((entry) => entry.id !== item.id);
      statusMessage = `DELETED: ${candidateTitle(item)}`;
    } catch (e) {
      console.error('[voice-lab] delete failed:', e);
      generateError = e instanceof Error ? e.message : 'delete failed';
    } finally {
      busyCandidateId = null;
    }
  }

  async function applyFormToCharacter() {
    if (!canApplyForm || busyCandidateId) return;

    generateError = null;
    statusMessage = null;
    try {
      const voice = {
        engine: 'irodori',
        mode,
        model: mode === 'clone' ? cloneModel : mode === 'lora' ? loraModel : '',
        ...(voiceCaption.trim() ? { caption: voiceCaption.trim() } : {}),
        speed: parsedSpeed(),
        autoSpeak,
      };
      const character = await putCharacterVoice({ voice });
      statusMessage = `VOICE APPLIED: ${character.name}`;
    } catch (e) {
      console.error('[voice-lab] apply failed:', e);
      generateError = e instanceof Error ? e.message : 'apply failed';
    }
  }

  function toggleStylePreset(caption: string) {
    const trimmed = voiceCaption.trim();
    voiceCaption = trimmed ? `${trimmed}\n${caption}` : caption;
  }

  function saveDesignerModel() {
    if (designerModel) localStorage.setItem(DESIGNER_MODEL_STORAGE_KEY, designerModel);
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
      <div class="title-block">
        <h1>VOICE LAB</h1>
        <p>CREATE / COMPARE / ADOPT CHARACTER VOICES</p>
      </div>
      <div class="status">
        <span class:offline={!bridgeReachable}></span>
        BRIDGE {bridgeReachable ? bridgeInfo : 'OFFLINE'}
      </div>
    </header>

    <section class="workspace">
      <!-- ============ LEFT: CREATE ============ -->
      <div class="panel create-panel">
        <div class="panel-header">
          <span>CREATE VOICE</span>
          <b>{isGenerating ? `GENERATING ${elapsedSec}s` : 'READY'}</b>
        </div>

        <label>
          <span>Character</span>
          <select bind:value={selectedCharacterId} onchange={syncAutoSpeakFromCharacter}>
            {#each characters as character}
              <option value={character.id}>{character.name} ({character.id})</option>
            {/each}
          </select>
        </label>

        <div class="mode-bar" role="tablist" aria-label="production mode">
          <button class:active={mode === 'design'} onclick={() => (mode = 'design')}>VOICE DESIGN</button>
          <button class:active={mode === 'clone'} onclick={() => (mode = 'clone')}>CLONE</button>
          <button class:active={mode === 'lora'} onclick={() => (mode = 'lora')}>LORA</button>
        </div>

        {#if mode !== 'design' && !bridgeReachable}
          <div class="warn-box">Voice Bridge (port 8791) が起動していません。run_voice_bridge.bat を実行してください。</div>
        {/if}

        {#if mode === 'clone'}
          <label>
            <span>Kept Voice</span>
            <select bind:value={cloneModel} disabled={keptVoices.length === 0}>
              {#each keptVoices as name}
                <option value={name}>{name}</option>
              {/each}
            </select>
          </label>
          {#if keptVoices.length === 0}
            <div class="hint-line">kept voice がありません。design 候補を採用すると自動登録されます。</div>
          {/if}
        {:else if mode === 'lora'}
          <label>
            <span>LoRA Model</span>
            <select bind:value={loraModel} disabled={loras.length === 0}>
              {#each loras as name}
                <option value={name}>{name}</option>
              {/each}
            </select>
          </label>
          {#if loras.length === 0}
            <div class="hint-line">学習済み LoRA がありません。</div>
          {/if}
        {/if}

        <label>
          <span>Voice Caption {mode === 'design' ? '(required)' : '(optional)'}</span>
          <textarea bind:value={voiceCaption} rows="3" placeholder="声質・話し方・距離感を記述"></textarea>
        </label>

        {#if mode === 'design'}
          <div class="style-preset-row">
            {#each stylePresets as preset}
              <button onclick={() => toggleStylePreset(preset.caption)} title={preset.caption}>{preset.id}</button>
            {/each}
          </div>
        {/if}

        <label>
          <span>Sample Text</span>
          <textarea bind:value={sampleText} rows="3" placeholder="生成するセリフを入力"></textarea>
        </label>
        {#if mode === 'design'}
          <div class="hint-line">EST {estimatedSeconds()}s / {countSpeechCharacters(sampleText)} chars</div>
        {/if}

        <label>
          <span>Candidate Name</span>
          <input bind:value={candidateName} placeholder="候補の名前 (例: リセア案A・低め)" />
        </label>

        <button class="generate-btn" onclick={generateVoice} disabled={!canGenerate}>
          {isGenerating ? `GENERATING... ${elapsedSec}s` : 'GENERATE VOICE'}
        </button>

        {#if generateError}
          <div class="error-box">{generateError}</div>
        {/if}
        {#if statusMessage}
          <div class="ok-box">{statusMessage}</div>
        {/if}

        <details class="advanced">
          <summary>ADVANCED SETTINGS</summary>
          <div class="advanced-body">
            <label>
              <span>Engine</span>
              <input
                readonly
                value={mode === 'design' ? 'Irodori VoiceDesign (Gradio)' : 'Voice Bridge (FastAPI :8791)'}
              />
            </label>

            <label>
              <span>Designer Model</span>
              <select bind:value={designerModel} onchange={saveDesignerModel} disabled={designerModels.length === 0}>
                {#each designerModels as model}
                  <option value={model.id}>{model.label}</option>
                {/each}
              </select>
            </label>

            <div class="field-grid">
              <label>
                <span>Backend</span>
                <select bind:value={voiceBackend}>
                  <option value="local">Local</option>
                  <option value="colab">Colab</option>
                </select>
              </label>
              <label class="span-2">
                <span>Endpoint</span>
                {#if voiceBackend === 'colab'}
                  <input bind:value={colabVoiceUrl} placeholder="https://xxxxx.trycloudflare.com" />
                {:else}
                  <input bind:value={localVoiceUrl} placeholder="http://127.0.0.1:7860" />
                {/if}
              </label>
            </div>
            <div class="actions">
              <button onclick={saveEndpointSettings}>SAVE ENDPOINT</button>
              {#if settingsMessage}
                <span>{settingsMessage}</span>
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
                <span>Steps</span>
                <input bind:value={voiceSteps} inputmode="numeric" placeholder="20" />
              </label>
              <label>
                <span>Speed</span>
                <input bind:value={voiceSpeed} inputmode="decimal" placeholder="1.0" />
              </label>
            </div>
          </div>
        </details>
      </div>

      <!-- ============ RIGHT: CANDIDATES ============ -->
      <div class="panel candidates-panel">
        <div class="panel-header">
          <span>VOICE CANDIDATES</span>
          <div class="header-actions">
            <b>{candidates.length}</b>
            <button class="mini-btn" onclick={loadCandidates}>REFRESH</button>
          </div>
        </div>

        {#if candidatesError}
          <div class="error-box">{candidatesError}</div>
        {:else if candidates.length === 0}
          <div class="empty-box">NO CANDIDATES — 左のフォームから声を生成してください</div>
        {:else}
          <div class="candidate-list">
            {#each candidates as item (item.id)}
              <div class="candidate-card">
                <div class="candidate-head">
                  <b>{candidateTitle(item)}</b>
                  <span class="mode-tag" data-mode={candidateMode(item)}>{candidateMode(item).toUpperCase()}</span>
                </div>
                <div class="candidate-meta">
                  <span>{formatDate(item.createdAt)}</span>
                  {#if item.checkpoint && candidateMode(item) !== 'design'}
                    <span>{item.checkpoint}</span>
                  {/if}
                  {#if item.seconds}
                    <span>{item.seconds}s</span>
                  {/if}
                </div>
                <audio src={`${item.audioUrl}?t=${item.createdAt}`} controls preload="none"></audio>
                <div class="candidate-actions">
                  <button
                    class="adopt-btn"
                    onclick={() => adoptCandidate(item)}
                    disabled={!selectedCharacter || busyCandidateId !== null}
                  >
                    {busyCandidateId === item.id ? 'APPLYING...' : `ADOPT → ${selectedCharacter?.name ?? '-'}`}
                  </button>
                  <button
                    class="delete-btn"
                    onclick={() => deleteCandidate(item)}
                    disabled={busyCandidateId !== null}
                  >
                    DELETE
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <!-- ============ BOTTOM: CURRENT VOICE ============ -->
    <section class="panel current-panel">
      <div class="panel-header">
        <span>CURRENT VOICE</span>
        <b>{selectedCharacter ? selectedCharacter.name : 'NO CHARACTER'}</b>
      </div>

      <div class="current-grid">
        <div class="current-info">
          <div class="current-line" class:unset={!currentVoice}>{describeVoice(currentVoice)}</div>
          {#if currentVoice?.caption}
            <p class="current-caption">{currentVoice.caption}</p>
          {/if}
        </div>

        <div class="current-actions">
          <label class="check-line">
            <input type="checkbox" bind:checked={autoSpeak} />
            <span>AUTO SPEAK</span>
          </label>
          <button class="apply-btn" onclick={applyFormToCharacter} disabled={!canApplyForm || busyCandidateId !== null}>
            APPLY TO CHARACTER
          </button>
        </div>
      </div>
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
    width: min(1560px, calc(100vw - 48px));
    margin: 0 auto;
    padding: 26px 0 40px;
    display: grid;
    gap: 18px;
  }

  /* ---------- header ---------- */
  .lab-header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 18px;
    padding: 16px 22px;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background: linear-gradient(120deg, rgba(8, 15, 32, 0.82), rgba(12, 12, 34, 0.76));
    box-shadow: 0 18px 48px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.06);
  }

  .back-link {
    color: #67e8f9;
    text-decoration: none;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background: rgba(8, 18, 36, 0.58);
    padding: 9px 13px;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
  }

  .title-block {
    display: flex;
    align-items: baseline;
    gap: 16px;
    min-width: 0;
  }

  .title-block h1 {
    margin: 0;
    font-family: 'Orbitron', sans-serif;
    font-size: 30px !important;
    line-height: 1;
    color: transparent;
    background: linear-gradient(90deg, #38bdf8, #818cf8 46%, #c084fc);
    -webkit-background-clip: text;
    background-clip: text;
    filter: drop-shadow(0 0 18px rgba(56,189,248,0.5));
  }

  .title-block p {
    margin: 0;
    color: rgba(148, 163, 184, 0.68);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: rgba(203, 213, 225, 0.66);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    white-space: nowrap;
  }

  .status span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 12px #38bdf8;
  }

  .status span.offline {
    background: #f87171;
    box-shadow: 0 0 12px #f87171;
  }

  /* ---------- layout ---------- */
  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 11fr) minmax(0, 9fr);
    gap: 18px;
    align-items: start;
  }

  .panel {
    border: 1px solid rgba(56, 189, 248, 0.2);
    background: rgba(8, 15, 32, 0.72);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
    padding: 20px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    color: rgba(148, 163, 184, 0.7);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    margin-bottom: 16px;
  }

  .panel-header b {
    color: #67e8f9;
  }

  .header-actions {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  /* ---------- create panel ---------- */
  .create-panel {
    display: grid;
    gap: 14px;
    align-content: start;
  }

  .mode-bar {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .mode-bar button {
    min-height: 46px;
    padding: 10px;
    border: 1px solid rgba(56, 189, 248, 0.24);
    background: rgba(56, 189, 248, 0.055);
    color: rgba(203, 213, 225, 0.72);
    font-family: 'Orbitron', sans-serif;
    font-size: 12px !important;
    cursor: pointer;
  }

  .mode-bar button.active {
    border-color: rgba(192, 132, 252, 0.58);
    background: rgba(168, 85, 247, 0.16);
    color: #e9d5ff;
    box-shadow: 0 0 20px rgba(168, 85, 247, 0.18);
  }

  .style-preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .style-preset-row button {
    padding: 6px 10px;
    border: 1px solid rgba(56, 189, 248, 0.22);
    background: rgba(56, 189, 248, 0.045);
    color: rgba(203, 213, 225, 0.74);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
    cursor: pointer;
  }

  label {
    display: grid;
    gap: 6px;
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
    padding: 11px 13px;
    font: inherit;
    min-height: 42px;
  }

  select {
    appearance: none;
  }

  input[readonly] {
    color: rgba(203, 213, 225, 0.66);
  }

  textarea {
    resize: vertical;
    min-height: 72px;
  }

  .hint-line {
    color: rgba(148, 163, 184, 0.74);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .generate-btn {
    min-height: 58px;
    border: 1px solid rgba(192, 132, 252, 0.55);
    background: linear-gradient(120deg, rgba(56, 189, 248, 0.14), rgba(168, 85, 247, 0.2));
    color: #e9d5ff;
    font-family: 'Orbitron', sans-serif;
    font-size: 16px !important;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 0 26px rgba(168, 85, 247, 0.2);
  }

  .generate-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    box-shadow: none;
  }

  .advanced {
    border: 1px solid rgba(56, 189, 248, 0.14);
    background: rgba(2, 6, 23, 0.4);
  }

  .advanced summary {
    padding: 12px 14px;
    color: rgba(148, 163, 184, 0.8);
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    cursor: pointer;
    user-select: none;
  }

  .advanced-body {
    display: grid;
    gap: 12px;
    padding: 4px 14px 16px;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .field-grid .span-2 {
    grid-column: span 3;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .actions button,
  .mini-btn {
    border: 1px solid rgba(168, 85, 247, 0.36);
    background: rgba(168, 85, 247, 0.08);
    color: #c084fc;
    font-family: 'Orbitron', sans-serif;
    padding: 9px 14px;
    font-size: 11px !important;
    cursor: pointer;
  }

  .actions span {
    color: rgba(148, 163, 184, 0.74);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  .mini-btn {
    padding: 7px 10px;
    font-size: 10px !important;
  }

  /* ---------- candidates ---------- */
  .candidates-panel {
    display: grid;
    align-content: start;
    gap: 12px;
  }

  .candidate-list {
    display: grid;
    gap: 12px;
    max-height: 720px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .candidate-card {
    display: grid;
    gap: 9px;
    border: 1px solid rgba(56, 189, 248, 0.18);
    background: rgba(2, 6, 23, 0.5);
    padding: 12px;
  }

  .candidate-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .candidate-head b {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 13px !important;
    overflow-wrap: anywhere;
  }

  .mode-tag {
    flex-shrink: 0;
    padding: 3px 8px;
    font-family: 'Orbitron', sans-serif;
    font-size: 9px !important;
    color: #e9d5ff;
    border: 1px solid rgba(192, 132, 252, 0.4);
    background: rgba(168, 85, 247, 0.12);
  }

  .mode-tag[data-mode='clone'] {
    color: #a5f3fc;
    border-color: rgba(56, 189, 248, 0.4);
    background: rgba(56, 189, 248, 0.1);
  }

  .mode-tag[data-mode='lora'] {
    color: #bbf7d0;
    border-color: rgba(74, 222, 128, 0.4);
    background: rgba(74, 222, 128, 0.1);
  }

  .candidate-meta {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    color: rgba(148, 163, 184, 0.72);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px !important;
  }

  audio {
    width: 100%;
    height: 38px;
  }

  .candidate-actions {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
  }

  .adopt-btn {
    min-height: 42px;
    border: 1px solid rgba(56, 189, 248, 0.45);
    background: rgba(56, 189, 248, 0.12);
    color: #a5f3fc;
    font-family: 'Orbitron', sans-serif;
    font-size: 12px !important;
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .adopt-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .delete-btn {
    min-height: 42px;
    padding: 0 14px;
    border: 1px solid rgba(248, 113, 113, 0.32);
    background: rgba(127, 29, 29, 0.14);
    color: #fca5a5;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
    cursor: pointer;
  }

  .delete-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  /* ---------- current voice ---------- */
  .current-panel {
    display: grid;
    gap: 8px;
  }

  .current-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px;
    align-items: center;
  }

  .current-info {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .current-line {
    color: #67e8f9;
    font-family: 'Orbitron', sans-serif;
    font-size: 15px !important;
    overflow-wrap: anywhere;
  }

  .current-line.unset {
    color: rgba(148, 163, 184, 0.6);
  }

  .current-caption {
    margin: 0;
    color: rgba(203, 213, 225, 0.72);
    font-size: 13px !important;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .current-actions {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .check-line {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }

  .check-line input {
    width: 18px;
    height: 18px;
    min-height: 0;
    accent-color: #38bdf8;
  }

  .apply-btn {
    min-height: 52px;
    padding: 0 26px;
    border: 1px solid rgba(192, 132, 252, 0.55);
    background: linear-gradient(120deg, rgba(56, 189, 248, 0.14), rgba(168, 85, 247, 0.2));
    color: #e9d5ff;
    font-family: 'Orbitron', sans-serif;
    font-size: 14px !important;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .apply-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  /* ---------- boxes ---------- */
  .error-box {
    border: 1px solid rgba(248, 113, 113, 0.28);
    background: rgba(127, 29, 29, 0.16);
    color: #fecaca;
    padding: 12px;
    font-size: 13px !important;
    white-space: pre-wrap;
  }

  .warn-box {
    border: 1px solid rgba(250, 204, 21, 0.28);
    background: rgba(113, 63, 18, 0.18);
    color: #fde68a;
    padding: 12px;
    font-size: 13px !important;
  }

  .ok-box {
    border: 1px solid rgba(56, 189, 248, 0.24);
    background: rgba(56, 189, 248, 0.07);
    color: #a5f3fc;
    padding: 12px;
    font-size: 13px !important;
  }

  .empty-box {
    border: 1px solid rgba(56, 189, 248, 0.14);
    background: rgba(2, 6, 23, 0.42);
    color: rgba(148, 163, 184, 0.76);
    padding: 16px;
    font-family: 'Orbitron', sans-serif;
    font-size: 11px !important;
  }

  @media (max-width: 980px) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .lab-header {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .field-grid {
      grid-template-columns: 1fr 1fr;
    }

    .field-grid .span-2 {
      grid-column: span 1;
    }

    .current-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
