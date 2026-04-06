<script lang="ts">
  import type { Character, AIEngine, VoiceEngine } from '$lib/types/character';

  interface Props {
    open: boolean;
    character: Character | null;
    onclose: () => void;
    onsave: (char: Character) => void;
  }

  let { open, character, onclose, onsave }: Props = $props();

  let name = $state('');
  let aiEngine = $state<AIEngine>('openai');
  let voiceEngine = $state<VoiceEngine>('voicevox');
  let voiceId = $state('');
  let systemPrompt = $state('');
  let avatarPreview = $state<string | null>(null);

  $effect(() => {
    if (open && character) {
      name = character.name;
      aiEngine = character.aiEngine;
      voiceEngine = character.voiceEngine;
      voiceId = character.voiceId;
      systemPrompt = character.systemPrompt;
      avatarPreview = character.avatar ?? null;
    }
  });

  function handleAvatarFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      avatarPreview = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function handleSave() {
    if (!character) return;

    onsave({
      ...character,
      name,
      aiEngine,
      voiceEngine,
      voiceId,
      systemPrompt,
      avatar: avatarPreview ?? character.avatar
    });

    onclose();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  const accentColor = $derived('#22d3ee');
</script>

{#if open}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="overlay" onclick={handleOverlayClick}>
  <div class="modal" style="--char-accent: {accentColor}; --char-glow: {accentColor}33">

    <!-- Header -->
    <div class="modal-header">
      <div class="header-left">
        <span class="header-tag">// CHARACTER CONFIG</span>
        <h2 class="modal-title">
          
          {character?.name ?? '---'}
          <span class="title-accent"> 設定</span>
        </h2>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="close-btn" onclick={onclose}>✕</div>
    </div>
    <div class="header-line"></div>

    <div class="modal-body">

      <!-- Basic Info -->
      <div class="section-label">
        <span class="section-tag">01</span> 基本情報
      </div>

      <div class="avatar-section">
        <!-- Avatar preview + upload trigger -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="avatar-ring-wrap" onclick={() => (document.getElementById('avatar-file-input') as HTMLInputElement)?.click()}>
          <div class="avatar-circle">
            {#if avatarPreview}
              <img class="avatar-img" src={avatarPreview} alt="avatar preview" />
            {:else}
              <span class="avatar-emoji">{character?.avatarEmoji ?? '?'}</span>
            {/if}
          </div>
          <div class="avatar-neon-ring"></div>
          <div class="avatar-upload-hint">
            <span class="upload-icon">↑</span>
          </div>
        </div>

        <!-- Hidden file input -->
        <input
          id="avatar-file-input"
          type="file"
          accept="image/*"
          style="display:none"
          onchange={handleAvatarFile}
        />

        <div class="field-group" style="flex:1">
          <label class="field-label">
            <span class="label-tag">NAME</span>キャラクター名
          </label>
          <input
            class="cyber-input"
            type="text"
            bind:value={name}
            placeholder="キャラクター名"
          />
          <button class="avatar-upload-btn" type="button" onclick={() => (document.getElementById('avatar-file-input') as HTMLInputElement)?.click()}>
            <span class="label-tag">IMG</span> アバター画像を選択
          </button>
        </div>
      </div>

      <!-- AI Engine -->
      <div class="section-label">
        <span class="section-tag">02</span> AIエンジン
      </div>

      <div class="field-group">
        <label class="field-label">
          <span class="label-tag">AI</span>エンジン選択
        </label>
        <select bind:value={aiEngine}>
        <option value="openai">OpenAI</option>
        <option value="gemini">Gemini</option>
        <option value="ollama">Ollama</option>
        <option value="lmstudio">LM Studio</option>
      </select>
      </div>

      <!-- Personality Prompt -->
      <div class="section-label">
        <span class="section-tag">03</span> 性格プロンプト
      </div>
      
      <div class="field-group">
        <label class="field-label">
          <span class="label-tag">SYS</span>システムプロンプト
        </label>
        <div class="form-group">
          <label>一人称</label>
          <input
            type="text"
                        value={character?.firstPerson || ""}
            oninput={(e) => {
                if (!character) return;

                character = {
                  ...character,
                  firstPerson: (e.target as HTMLInputElement).value
                }
              }}
          />
        </div>

          <div class="form-group">
            <label>二人称</label>
            <input
              type="text"
              value={character?.secondPerson || ""}
                  oninput={(e) => {
                if (!character) return;

                character = {
                  ...character,
                  secondPerson: (e.target as HTMLInputElement).value
                }
              }}
            />
          </div>

            <div class="form-group">
              <label>口癖</label>
              <input
                type="text"
                value={character?.catchPhrase || ""}
                oninput={(e) => {
                    if (!character) return;

                    character = {
                      ...character,
                      catchPhrase: (e.target as HTMLInputElement).value
                    }
                  }}
              />
            </div>
        
        <textarea bind:value={systemPrompt}></textarea>
      </div>

      <!-- Voice Settings -->
      <div class="section-label">
        <span class="section-tag">04</span> ボイス設定
      </div>

      <div class="voice-row">
  <div class="field-group" style="flex:1">
    <label class="field-label">
      <span class="label-tag">VOX</span> 音声エンジン
    </label>

    <select class="cyber-select" bind:value={voiceEngine}>
      <option value="voicevox">VoiceVox</option>
      <option value="elevenlabs">ElevenLabs</option>
      <option value="piper">Piper</option>
      <option value="none">None</option>
    </select>
  </div>

  <div class="field-group" style="flex:1">
    <label class="field-label">
      <span class="label-tag">ID</span> ボイスID
    </label>

    <input
      class="cyber-input"
      bind:value={voiceId}
      placeholder="例: alloy / ja-JP..."
    />
  </div>
</div>

    </div><!-- /modal-body -->

    <!-- Footer -->
    <div class="modal-footer">
      <button class="btn-save" onclick={handleSave}>
        <span class="btn-icon">▶</span> 保存
      </button>
      <button class="btn-cancel" onclick={onclose}>キャンセル</button>
    </div>

  </div><!-- /modal -->
</div><!-- /overlay -->
{/if}

<style>
  /* ── Overlay ── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.78);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: overlay-in 0.2s ease forwards;
  }

  @keyframes overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* ── Modal Card ── */
  .modal {
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    background: linear-gradient(145deg, rgba(8, 12, 26, 0.98), rgba(16, 8, 34, 0.98));
    border: 1px solid var(--char-accent);
    border-radius: 16px;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.5),
      0 0 40px var(--char-glow),
      0 24px 64px rgba(0, 0, 0, 0.8);
    animation: modal-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  @keyframes modal-in {
    from { opacity: 0; transform: scale(0.9) translateY(12px); }
    to   { opacity: 1; transform: scale(1)   translateY(0); }
  }

  /* ── Header ── */
  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 20px 22px 14px;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .header-tag {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: var(--char-accent);
    opacity: 0.6;
    font-family: 'Courier New', monospace;
  }

  .modal-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #e2e8f0;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .title-emoji {
    font-size: 20px;
    line-height: 1;
  }

  .title-accent {
    color: var(--char-accent);
    text-shadow: 0 0 14px var(--char-accent);
  }

  .close-btn {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.35);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .close-btn:hover {
    background: rgba(248, 113, 113, 0.15);
    color: #f87171;
  }

  .header-line {
    height: 1px;
    background: linear-gradient(90deg, var(--char-accent) 0%, rgba(168, 85, 247, 0.4) 50%, transparent 100%);
    margin: 0 22px;
    opacity: 0.6;
  }

  /* ── Body ── */
  .modal-body {
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* Section label */
  .section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'Orbitron', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    margin-top: 4px;
  }

  .section-tag {
    font-size: 9px;
    padding: 1px 5px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 3px;
    color: var(--char-accent);
    font-family: 'Courier New', monospace;
    letter-spacing: 0.1em;
  }

  /* Avatar section */
  .avatar-section {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .avatar-ring-wrap {
    position: relative;
    width: 64px;
    height: 64px;
    flex-shrink: 0;
  }

  .avatar-circle {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.08), rgba(0,0,0,0.4));
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 1;
  }

  .avatar-emoji {
    font-size: 28px;
    line-height: 1;
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  /* Hover overlay hint */
  .avatar-upload-hint {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
    z-index: 2;
    cursor: pointer;
  }

  .avatar-ring-wrap:hover .avatar-upload-hint {
    opacity: 1;
  }

  .upload-icon {
    font-size: 20px;
    color: var(--char-accent);
    text-shadow: 0 0 10px var(--char-accent);
    font-weight: 700;
  }

  .avatar-upload-btn {
    margin-top: 6px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed var(--char-accent);
    border-radius: 7px;
    color: rgba(255, 255, 255, 0.5);
    font-family: 'Rajdhani', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    padding: 7px 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 7px;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
    width: 100%;
  }

  .avatar-upload-btn:hover {
    background: rgba(255, 255, 255, 0.07);
    color: var(--char-accent);
    border-color: var(--char-accent);
    box-shadow: 0 0 10px var(--char-glow);
  }

  .avatar-neon-ring {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid var(--char-accent);
    box-shadow: 0 0 12px var(--char-glow), inset 0 0 8px var(--char-glow);
    pointer-events: none;
    animation: ring-pulse 3s ease-in-out infinite;
  }

  @keyframes ring-pulse {
    0%, 100% { opacity: 0.7; }
    50%       { opacity: 1; box-shadow: 0 0 20px var(--char-accent), inset 0 0 12px var(--char-glow); }
  }

  /* Field groups */
  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.45);
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .label-tag {
    font-size: 9px;
    font-family: 'Courier New', monospace;
    padding: 1px 5px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--char-accent);
    border-radius: 3px;
    color: var(--char-accent);
    letter-spacing: 0.12em;
    opacity: 0.8;
  }

  /* Voice row */
  .voice-row {
    display: flex;
    gap: 12px;
  }

  /* Cyber inputs */
  .cyber-input {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 13px;
    padding: 9px 12px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    font-family: 'Rajdhani', sans-serif;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .cyber-input::placeholder {
    color: rgba(255, 255, 255, 0.18);
  }
  .cyber-input:focus {
    border-color: var(--char-accent);
    box-shadow: 0 0 0 2px var(--char-glow), 0 0 12px var(--char-glow);
  }

  .cyber-select {
    appearance: none;
    -webkit-appearance: none;
    background-color: rgba(255, 255, 255, 0.03);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(180,180,255,0.4)'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 13px;
    padding: 9px 36px 9px 12px;
    outline: none;
    cursor: pointer;
    width: 100%;
    font-family: 'Rajdhani', sans-serif;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .cyber-select option {
    background: #0d1117;
    color: #e2e8f0;
  }
  .cyber-select:focus {
    border-color: var(--char-accent);
    box-shadow: 0 0 0 2px var(--char-glow), 0 0 12px var(--char-glow);
  }

  .cyber-textarea {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 13px;
    line-height: 1.6;
    padding: 10px 12px;
    width: 100%;
    height: 96px;
    resize: vertical;
    outline: none;
    font-family: 'Rajdhani', sans-serif;
    box-sizing: border-box;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .cyber-textarea::placeholder {
    color: rgba(255, 255, 255, 0.18);
  }
  .cyber-textarea:focus {
    border-color: var(--char-accent);
    box-shadow: 0 0 0 2px var(--char-glow), 0 0 12px var(--char-glow);
  }

  /* ── Footer ── */
  .modal-footer {
    display: flex;
    gap: 10px;
    padding: 16px 22px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .btn-save {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 11px 0;
    border: none;
    border-radius: 9px;
    background: linear-gradient(135deg, var(--char-accent), color-mix(in srgb, var(--char-accent) 60%, #a855f7));
    color: #fff;
    font-family: 'Orbitron', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    cursor: pointer;
    box-shadow: 0 0 20px var(--char-glow);
    transition: box-shadow 0.2s, transform 0.15s;
  }
  .btn-save:hover {
    box-shadow: 0 0 32px var(--char-accent);
    transform: translateY(-1px);
  }
  .btn-save:active {
    transform: translateY(0);
  }

  .btn-icon {
    font-size: 10px;
  }

  .btn-cancel {
    padding: 11px 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.4);
    font-family: 'Rajdhani', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }
  .btn-cancel:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
    border-color: rgba(255, 255, 255, 0.22);
  }
</style>
