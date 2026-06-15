<script lang="ts">
  import { appStore } from '$lib/stores/appStore.svelte';
  import { tick } from 'svelte';

  let logEl = $state<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new messages or typing indicator
  $effect(() => {
    // Track messages length and isTyping to react on changes
    const _ = appStore.messages.length + (appStore.isTyping ? 1 : 0);
    tick().then(() => {
      logEl?.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
    });
  });

  function formatTime(d: Date): string {
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getCharacterColor(characterId: 'char1' | 'char2'): string {
    return (characterId === 'char1' ? appStore.char1.color : appStore.char2.color) ?? '#94a3b8';
  }

  function getCharacterEmoji(characterId: 'char1' | 'char2'): string {
    return (characterId === 'char1' ? appStore.char1.avatarEmoji : appStore.char2.avatarEmoji) ?? '';
  }

  // The character currently "typing"
  const typingCharacter = $derived(
    appStore.currentTurn === 'char1' ? appStore.char1 : appStore.char2
  );
</script>

<div class="log-wrapper">
  {#if appStore.messages.length === 0 && appStore.status === 'idle'}
    <div class="empty-state">
      <p class="empty-icon">💬</p>
      <p>「会話開始」を押すと2人のキャラクターが会話を始めます</p>
    </div>
  {:else}
    <div class="log" bind:this={logEl}>
      {#each appStore.messages as msg (msg.id)}
        {@const isLeft = msg.characterId === 'char1'}
        <div class="message-row" class:left={isLeft} class:right={!isLeft}>
          {#if isLeft}
            <div class="avatar" style="background: {getCharacterColor(msg.characterId)}20; border-color: {getCharacterColor(msg.characterId)}">
              {getCharacterEmoji(msg.characterId)}
            </div>
          {/if}
          <div class="bubble-col" class:align-right={!isLeft}>
            <span class="speaker-name" style="color: {getCharacterColor(msg.characterId)}">
              {msg.characterName}
            </span>
            <div
              class="bubble"
              style="
                background: {getCharacterColor(msg.characterId)}18;
                border-color: {getCharacterColor(msg.characterId)}60;
              "
            >
              {msg.text}
            </div>
            <span class="timestamp">{formatTime(msg.timestamp)}</span>
          </div>
          {#if !isLeft}
            <div class="avatar" style="background: {getCharacterColor(msg.characterId)}20; border-color: {getCharacterColor(msg.characterId)}">
              {getCharacterEmoji(msg.characterId)}
            </div>
          {/if}
        </div>
      {/each}

      {#if appStore.isTyping}
        {@const isLeft = appStore.currentTurn === 'char1'}
        <div class="message-row typing-row" class:left={isLeft} class:right={!isLeft}>
          {#if isLeft}
            <div class="avatar" style="background: {typingCharacter.color}20; border-color: {typingCharacter.color}">
              {typingCharacter.avatarEmoji}
            </div>
          {/if}
          <div class="bubble-col" class:align-right={!isLeft}>
            <span class="speaker-name" style="color: {typingCharacter.color}">
              {typingCharacter.name}
            </span>
            <div class="bubble typing-bubble" style="border-color: {typingCharacter.color}60">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
          {#if !isLeft}
            <div class="avatar" style="background: {typingCharacter.color}20; border-color: {typingCharacter.color}">
              {typingCharacter.avatarEmoji}
            </div>
          {/if}
        </div>
      {/if}

      {#if appStore.status === 'stopped'}
        <div class="end-banner">会話終了</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .log-wrapper {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .log {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    gap: 8px;
    text-align: center;
    padding: 32px;
  }

  .empty-icon {
    font-size: 3rem;
    margin: 0;
  }

  .message-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }

  .message-row.right {
    flex-direction: row-reverse;
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
    flex-shrink: 0;
  }

  .bubble-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-width: 65%;
  }

  .bubble-col.align-right {
    align-items: flex-end;
  }

  .speaker-name {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0 4px;
  }

  .bubble {
    background: var(--surface);
    border: 1px solid;
    border-radius: 12px;
    padding: 10px 14px;
    font-size: 0.95rem;
    line-height: 1.5;
    word-break: break-word;
  }

  .timestamp {
    font-size: 0.65rem;
    color: var(--text-muted);
    padding: 0 4px;
  }

  /* Typing indicator */
  .typing-bubble {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 12px 18px;
    background: var(--surface) !important;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
    animation: bounce 1.2s infinite;
  }

  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes bounce {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-6px); }
  }

  .end-banner {
    text-align: center;
    padding: 10px 0;
    font-size: 0.85rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
    margin-top: 4px;
    letter-spacing: 0.08em;
  }
</style>
