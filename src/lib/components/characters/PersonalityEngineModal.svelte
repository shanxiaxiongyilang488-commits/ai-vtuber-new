<script lang="ts">
  // Provider list, implemented flags, icons and labels are owned by the AI Router
  // so the modal and the chat header stay in sync.
  // Stored provider value stays owned by the parent page; mode is kept local to this modal.
  // Implemented: GPT-5.5 (OpenAI) / Gemini / Grok / AUTO. Reserved (greyed out): Claude / Local LLM.
  import { onMount } from 'svelte';
  import { buildProviderDescriptors, PROVIDER_DESCRIPTORS } from '$lib/ai/aiProviderRouter';

  type PersonalityMode = 'standard' | 'flirty' | 'creative' | 'story' | 'developer';
  type PersonalityStartPayload = {
    chatConfig: {
      provider: string;
      mode: PersonalityMode;
    };
    aiProfile: { brainAI: string; conversationAI: string; storyCardAI: string; motionPromptAI: string; characterAnalysisAI: string; intentRouterAI: string; imageAI: string; videoAI: string; voiceAI: string; memoryEnabled: boolean };
  };
  // 開発者向けロールAI（Conversation / StoryCard / MotionPrompt / Character Analysis /
  // Intent Router / Video）はチャット開始後の Advanced Studio Settings（character-memory
  // サイドバー）で編集する。値は bindable props として保持し、Start Chat 時にそのまま保存される。
  const IMAGE_AI = ['GPT Image', 'NanoBanana 2 Lite', 'NanoBanana 2', 'NanoBanana Pro', 'NanoBanana', 'Flux Kontext', 'Seedream'];
  const VOICE_AI = ['Irodori', 'Irodori Lite', 'Qwen-TTS', 'Local Voice'];

  const MODE_OPTIONS: Array<{ id: PersonalityMode; label: string; grokOnly: boolean }> = [
    { id: 'standard', label: 'Standard', grokOnly: false },
    { id: 'flirty', label: 'Flirty', grokOnly: true },
    { id: 'creative', label: 'Creative', grokOnly: false },
    { id: 'story', label: 'Story', grokOnly: false },
    { id: 'developer', label: 'Developer', grokOnly: false },
  ];

  let {
    characterId = '',
    characterName,
    characterImage = '',
    provider = $bindable('AUTO'),
    conversationAI = $bindable('INHERIT'),
    storyCardAI = $bindable('INHERIT'),
    motionPromptAI = $bindable('INHERIT'),
    characterAnalysisAI = $bindable('INHERIT'),
    intentRouterAI = $bindable('INHERIT'),
    imageAI = $bindable('GPT Image'),
    videoAI = $bindable('Seedance2'),
    voiceAI = $bindable('Irodori'),
    memoryEnabled = $bindable(true),
    mode = $bindable<PersonalityMode>('standard'),
    busy = false,
    onCancel,
    onStart,
  }: {
    characterId?: string;
    characterName: string;
    characterImage?: string;
    provider?: string;
    conversationAI?: string;
    storyCardAI?: string;
    motionPromptAI?: string;
    characterAnalysisAI?: string;
    intentRouterAI?: string;
    imageAI?: string;
    videoAI?: string;
    voiceAI?: string;
    memoryEnabled?: boolean;
    mode?: PersonalityMode;
    busy?: boolean;
    onCancel: () => void;
    onStart: (payload?: PersonalityStartPayload) => void | Promise<void>;
  } = $props();

  let providerCards = $state(PROVIDER_DESCRIPTORS);
  const characterStorageKey = $derived(`personality-engine:${characterId || characterName}:mode`);
  const flirtyEnabled = $derived(provider === 'Grok');
  const selectedMode = $derived(flirtyEnabled ? mode : 'standard');

  onMount(async () => {
    loadStoredMode();
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const settings = await res.json();
      providerCards = buildProviderDescriptors({
        openai: Boolean(settings.openai?.key),
        grok: Boolean(settings.grok?.enabled || settings.grok?.apiKey || settings.grok?.key),
        gemini: Boolean(settings.gemini?.key),
        claude: Boolean(settings.anthropic?.key),
        local: Boolean(settings.local?.baseUrl),
      });
    } catch {
      providerCards = buildProviderDescriptors({});
    }
  });

  $effect(() => {
    if (!flirtyEnabled && mode !== 'standard') {
      mode = 'standard';
    }
  });

  function isPersonalityMode(value: string | null): value is PersonalityMode {
    return MODE_OPTIONS.some((option) => option.id === value);
  }

  function readStoredMode(): PersonalityMode {
    if (typeof localStorage === 'undefined') return 'standard';
    const stored = localStorage.getItem(characterStorageKey);
    return isPersonalityMode(stored) ? stored : 'standard';
  }

  function loadStoredMode(): void {
    mode = readStoredMode();
    if (!flirtyEnabled) mode = 'standard';
  }

  function saveStoredMode(nextMode: PersonalityMode): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(characterStorageKey, nextMode);
  }

  function selectProvider(nextProvider: string): void {
    provider = nextProvider;
    const nextMode: PersonalityMode = nextProvider === 'Grok' ? readStoredMode() : 'standard';
    mode = nextMode;
    if (nextProvider === 'Grok') saveStoredMode(nextMode);
  }

  function toggleFlirtyMode(): void {
    if (!flirtyEnabled || busy) return;
    mode = mode === 'flirty' ? 'standard' : 'flirty';
    saveStoredMode(mode);
  }

  function startWithConfig(): void | Promise<void> {
    return onStart({
      chatConfig: {
        provider,
        mode: selectedMode,
      },
      aiProfile: { brainAI: provider, conversationAI, storyCardAI, motionPromptAI, characterAnalysisAI, intentRouterAI, imageAI, videoAI, voiceAI, memoryEnabled },
    });
  }

  function onBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !busy) onCancel();
  }
</script>

<svelte:window onkeydown={onBackdropKeydown} />

<div
  class="modal-backdrop"
  role="button"
  tabindex="-1"
  aria-label="Close Personality Engine"
  onclick={() => !busy && onCancel()}
  onkeydown={() => {}}
>
  <div
    class="modal"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Personality Engine"
    onclick={(event) => event.stopPropagation()}
    onkeydown={() => {}}
  >
    <header>
      <div class="avatar">
        {#if characterImage}
          <img src={characterImage} alt={characterName} />
        {:else}
          <div class="avatar-placeholder">{characterName.slice(0, 1) || '?'}</div>
        {/if}
      </div>
      <h2>AI Studio Engine</h2>
      <p>キャラクターの主要AI（頭脳・画像・音声・記憶）を選択します</p>
    </header>

    <div class="provider-grid">
      {#each providerCards as card (card.id)}
        <button
          type="button"
          class="provider-card"
          class:selected={provider === card.id}
          class:disabled={!card.implemented}
          aria-pressed={provider === card.id}
          disabled={!card.implemented}
          title={card.implemented ? card.label : `${card.label} is not configured`}
          onclick={() => card.implemented && selectProvider(card.id)}
        >
          <span class="provider-icon">{card.icon}</span>
          <span class="provider-label">{card.label}</span>
          {#if !card.implemented}<span class="provider-pending">OFF</span>{/if}
        </button>
      {/each}
    </div>

    <section class="studio-profile" aria-label="AI Studio Engine profile">
      <label>🧠 Brain AI <strong>{provider}</strong></label>
      <label>🎨 Image AI
        <select bind:value={imageAI}>{#each IMAGE_AI as option}<option value={option}>{option}</option>{/each}</select>
      </label>
      <label>🎙️ Voice AI
        <select bind:value={voiceAI}>{#each VOICE_AI as option}<option value={option}>{option}</option>{/each}</select>
      </label>
      <label>💾 Memory
        <input type="checkbox" bind:checked={memoryEnabled} />
      </label>
      <p class="advanced-note">StoryCard・MotionPrompt・分析・Intent Router・Video AIはチャット開始後の Advanced Studio Settings で変更できます。</p>
    </section>

    <section class="mode-panel" aria-label="Personality mode">
      <div class="mode-copy">
        <span class="mode-title">&#x1F49E; Flirty Mode</span>
        <span class="mode-note">{flirtyEnabled ? 'Available for Grok' : 'Grok only'}</span>
      </div>
      <button
        type="button"
        class="mode-toggle"
        class:active={selectedMode === 'flirty'}
        disabled={!flirtyEnabled || busy}
        aria-pressed={selectedMode === 'flirty'}
        onclick={toggleFlirtyMode}
      >
        <span class="toggle-track"><span class="toggle-knob"></span></span>
        <span class="toggle-label">{selectedMode === 'flirty' ? 'ON' : 'OFF'}</span>
      </button>
    </section>

    <footer>
      <button type="button" class="cancel" onclick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" class="start" onclick={startWithConfig} disabled={busy}>
        {busy ? 'Saving...' : 'Start Chat'}
      </button>
    </footer>
  </div>
</div>
<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(2, 6, 23, 0.78);
    backdrop-filter: blur(4px);
    cursor: default;
  }
  .modal {
    width: min(440px, 100%);
    max-width: calc(100vw - 40px);
    box-sizing: border-box;
    max-height: 90vh;
    overflow-y: auto;
    padding: 24px;
    border: 1px solid rgba(34, 211, 238, 0.28);
    border-radius: 16px;
    background:
      radial-gradient(circle at 50% 0%, rgba(34, 211, 238, 0.12), transparent 55%),
      rgba(8, 15, 32, 0.96);
    box-shadow: 0 20px 60px rgba(2, 6, 23, 0.7);
    cursor: default;
  }
  header { display: grid; justify-items: center; text-align: center; gap: 6px; }
  .avatar {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid rgba(34, 211, 238, 0.5);
    box-shadow: 0 0 18px rgba(34, 211, 238, 0.35);
    background: #020617;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    color: #67e8f9;
    font-size: 32px;
    font-weight: 800;
    text-transform: uppercase;
  }
  h2 { margin: 8px 0 0; color: #f8fafc; font-size: 20px; }
  header p { margin: 0; color: #94a3b8; font-size: 12px; }

  .provider-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin: 20px 0;
  }
  .studio-profile { display: grid; gap: 9px; min-width: 0; margin: 0 0 18px; padding: 12px; border: 1px solid rgba(168,85,247,.35); border-radius: 10px; background: rgba(76,29,149,.12); }
  .studio-profile label { display: flex; align-items: center; justify-content: space-between; gap: 9px; min-width: 0; color: #ddd6fe; font-size: 12px; }
  .studio-profile select { min-width: 0; width: min(210px, 58%); max-width: 100%; box-sizing: border-box; border: 1px solid rgba(168,85,247,.48); border-radius: 6px; padding: 6px; color: #f5f3ff; background: #1e1b4b; font: inherit; font-size: 12px; }
  .advanced-note { margin: 2px 0 0; color: #a78bfa; font-size: 10px; line-height: 1.5; opacity: 0.85; }
  .provider-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 10px;
    background: rgba(2, 6, 23, 0.6);
    color: #e2e8f0;
    font: inherit;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  }
  .provider-card:hover { border-color: rgba(34, 211, 238, 0.45); }
  .provider-card.selected {
    border-color: #22d3ee;
    background: rgba(34, 211, 238, 0.12);
    box-shadow: 0 0 0 1px #22d3ee, 0 0 18px rgba(34, 211, 238, 0.55);
  }
  .provider-icon { font-size: 20px; line-height: 1; }
  .provider-label { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; }
  .provider-card.selected .provider-label { color: #a5f3fc; }
  .provider-card.disabled {
    cursor: not-allowed;
    opacity: 0.4;
    filter: grayscale(1);
  }
  .provider-card.disabled:hover { border-color: rgba(148, 163, 184, 0.22); }
  .provider-pending {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.18);
    color: #94a3b8;
    font-size: 8px;
    font-weight: 800;
  }

  .mode-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin: -2px 0 20px;
    padding: 12px 14px;
    border: 1px solid rgba(34, 211, 238, 0.22);
    border-radius: 10px;
    background: rgba(2, 6, 23, 0.45);
  }
  .mode-copy {
    display: grid;
    gap: 3px;
  }
  .mode-title {
    color: #e0f2fe;
    font-size: 13px;
    font-weight: 800;
  }
  .mode-note {
    color: #7dd3fc;
    font-size: 11px;
    opacity: 0.76;
  }
  .mode-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 88px;
    justify-content: flex-end;
    border: 0;
    background: transparent;
    color: #94a3b8;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }
  .mode-toggle:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .toggle-track {
    position: relative;
    width: 38px;
    height: 20px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.9);
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  }
  .toggle-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #94a3b8;
    transition: transform 0.15s, background 0.15s;
  }
  .mode-toggle.active {
    color: #a5f3fc;
  }
  .mode-toggle.active .toggle-track {
    border-color: #22d3ee;
    background: rgba(34, 211, 238, 0.18);
    box-shadow: 0 0 14px rgba(34, 211, 238, 0.32);
  }
  .mode-toggle.active .toggle-knob {
    transform: translateX(18px);
    background: #67e8f9;
  }

  footer { display: flex; justify-content: flex-end; gap: 8px; }
  footer button {
    padding: 10px 16px;
    border: 1px solid rgba(34, 211, 238, 0.35);
    border-radius: 8px;
    background: rgba(34, 211, 238, 0.08);
    color: #a5f3fc;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }
  footer button:disabled { cursor: not-allowed; opacity: 0.45; }
  .cancel { border-color: rgba(148, 163, 184, 0.25); background: transparent; color: #94a3b8; }
  .start {
    border-color: rgba(34, 211, 238, 0.6);
    background: rgba(34, 211, 238, 0.16);
    color: #67e8f9;
  }
</style>
