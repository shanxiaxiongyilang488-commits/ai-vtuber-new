<script lang="ts">
  import { AI_ENGINE_OPTIONS, VOICE_ENGINE_OPTIONS, OLLAMA_MODEL_PRESETS } from '$lib/types/character';
  import type { Character } from '$lib/types/character';

  interface Props {
    character: Character;
    onUpdate: (updates: Partial<Omit<Character, 'id'>>) => void;
    disabled?: boolean;
  }

  let { character, onUpdate, disabled = false }: Props = $props();

  const EMOJIS = ['🌸', '⭐', '🔥', '🌙', '🎵', '🐱', '🦊', '🐧', '🌊', '🍀'];
</script>

<div class="card" style="--accent: {character.color}">
  <div class="card-header">
    <button
      class="emoji-btn"
      onclick={() => {
        const idx = (EMOJIS.indexOf(character.avatarEmoji) + 1) % EMOJIS.length;
        onUpdate({ avatarEmoji: EMOJIS[idx] });
      }}
      {disabled}
      title="クリックで変更"
    >
      {character.avatarEmoji}
    </button>
    <div class="name-row">
      <label class="field-label">名前</label>
      <input
        class="text-input name-input"
        type="text"
        value={character.name}
        oninput={(e) => onUpdate({ name: (e.target as HTMLInputElement).value })}
        placeholder="キャラクター名"
        {disabled}
      />
    </div>
    <input
      class="color-swatch"
      type="color"
      value={character.color}
      oninput={(e) => onUpdate({ color: (e.target as HTMLInputElement).value })}
      {disabled}
      title="カラー変更"
    />
  </div>

  <div class="field">
    <label class="field-label">性格プロンプト</label>
    <textarea
      class="textarea"
      value={character.prompt}
      oninput={(e) => onUpdate({ prompt: (e.target as HTMLTextAreaElement).value })}
      placeholder="このキャラクターの性格・話し方を入力…"
      rows={3}
      {disabled}
    ></textarea>
  </div>

  <div class="row">
    <div class="field half">
      <label class="field-label">AIエンジン</label>
      <select
        class="select"
        value={character.aiEngine}
        onchange={(e) => onUpdate({ aiEngine: (e.target as HTMLSelectElement).value as Character['aiEngine'] })}
        {disabled}
      >
        {#each AI_ENGINE_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <div class="field half">
      <label class="field-label">音声方式</label>
      <select
        class="select"
        value={character.voiceEngine}
        onchange={(e) => onUpdate({ voiceEngine: (e.target as HTMLSelectElement).value as Character['voiceEngine'] })}
        {disabled}
      >
        {#each VOICE_ENGINE_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if character.aiEngine === 'ollama'}
  <div class="field">
    <label class="field-label">Ollamaモデル</label>
    <input
      class="text-input"
      type="text"
      list={"ollama-presets-" + character.id}
      value={character.ollamaModel}
      oninput={(e) => onUpdate({ ollamaModel: (e.target as HTMLInputElement).value })}
      placeholder="例: qwen:0.5b"
      {disabled}
    />

    <datalist id={"ollama-presets-" + character.id}>
      {#each OLLAMA_MODEL_PRESETS as preset}
        <option value={preset.value}>{preset.label}</option>
      {/each}
    </datalist>
  </div>

{:else if character.aiEngine === 'lmstudio'}
  <div class="field">
    <label class="field-label">LM Studioモデル</label>
    <input
      class="text-input"
      type="text"
      value={character.ollamaModel}
      oninput={(e) => onUpdate({ ollamaModel: (e.target as HTMLInputElement).value })}
      placeholder="例: qwen2.5-0.5b-instruct"
      {disabled}
    />
  </div>
{/if}
</div>

<style>
  .card {
    background: var(--surface);
    border: 2px solid var(--accent);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .emoji-btn {
    font-size: 2rem;
    background: none;
    border: 2px solid var(--accent);
    border-radius: 50%;
    width: 52px;
    height: 52px;
    cursor: pointer;
    flex-shrink: 0;
    transition: transform 0.15s;
  }
  .emoji-btn:hover:not(:disabled) {
    transform: scale(1.1);
  }
  .emoji-btn:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .name-row {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .color-swatch {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    padding: 0;
    background: none;
    flex-shrink: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .row {
    display: flex;
    gap: 10px;
  }

  .half {
    flex: 1;
  }

  .text-input,
  .textarea,
  .select {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 0.9rem;
    padding: 6px 8px;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .text-input:focus,
  .textarea:focus,
  .select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .text-input:disabled,
  .textarea:disabled,
  .select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .name-input {
    font-weight: 600;
    font-size: 1rem;
  }

  .textarea {
    resize: vertical;
    font-family: inherit;
    line-height: 1.4;
  }

  .select {
    cursor: pointer;
  }
</style>
