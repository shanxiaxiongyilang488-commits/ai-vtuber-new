<script lang="ts">
  // Provider list, implemented flags, icons and labels are owned by the AI Router
  // so the modal and the chat header stay in sync.
  // Stored value (character_settings.json) is the descriptor id, verbatim.
  // Implemented: GPT-5.5 (OpenAI) / Gemini / AUTO. Reserved (greyed out): Grok / Claude / Local LLM.
  import { PROVIDER_DESCRIPTORS } from '$lib/ai/aiProviderRouter';

  let {
    characterName,
    characterImage = '',
    provider = $bindable('AUTO'),
    busy = false,
    onCancel,
    onStart,
  }: {
    characterName: string;
    characterImage?: string;
    provider?: string;
    busy?: boolean;
    onCancel: () => void;
    onStart: () => void;
  } = $props();

  function onBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !busy) onCancel();
  }
</script>

<svelte:window onkeydown={onBackdropKeydown} />

<div
  class="modal-backdrop"
  role="button"
  tabindex="-1"
  aria-label="閉じる"
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
      <h2>🧠 Personality Engine</h2>
      <p>{characterName}のAIを選択してください</p>
    </header>

    <div class="provider-grid">
      {#each PROVIDER_DESCRIPTORS as card (card.id)}
        <button
          type="button"
          class="provider-card"
          class:selected={provider === card.id}
          class:disabled={!card.implemented}
          aria-pressed={provider === card.id}
          disabled={!card.implemented}
          title={card.implemented ? card.label : `${card.label}（未実装）`}
          onclick={() => card.implemented && (provider = card.id)}
        >
          <span class="provider-icon">{card.icon}</span>
          <span class="provider-label">{card.label}</span>
          {#if !card.implemented}<span class="provider-pending">未実装</span>{/if}
        </button>
      {/each}
    </div>

    <footer>
      <button type="button" class="cancel" onclick={onCancel} disabled={busy}>キャンセル</button>
      <button type="button" class="start" onclick={onStart} disabled={busy}>
        {busy ? '保存中...' : 'チャット開始'}
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
