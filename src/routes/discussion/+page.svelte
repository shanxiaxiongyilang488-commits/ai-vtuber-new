<script lang="ts">
  import { appStore } from '$lib/stores/appStore.svelte';
  import { createAIEngine, type ChatMessage } from '$lib/api/aiEngine';
  import { createVoiceEngine } from '$lib/api/voiceEngine';
  import CharacterCard from '$lib/components/CharacterCard.svelte';
  import ConversationLog from '$lib/components/ConversationLog.svelte';
  import ConversationControls from '$lib/components/ConversationControls.svelte';
  import type { Message } from '$lib/types/conversation';

  // Maximum number of turns before the conversation is force-stopped
  const MAX_TURNS = 6;

  // Flag to signal the running loop to stop
  let stopSignal = false;
  let errorMessage = $state<string | null>(null);

  async function startConversation() {
    appStore.clearMessages();
    appStore.setStatus('running');
    appStore.setCurrentTurn('char1');
    stopSignal = false;
    errorMessage = null;

    // Instantiate engines per character based on current settings
    const engines = {
      char1: createAIEngine(appStore.char1.aiEngine, appStore.char1.ollamaModel),
      char2: createAIEngine(appStore.char2.aiEngine, appStore.char2.ollamaModel),
    };
    const voiceEngines = {
      char1: createVoiceEngine(appStore.char1.voiceEngine),
      char2: createVoiceEngine(appStore.char2.voiceEngine),
    };

    const history: ChatMessage[] = [];
    let turn: 'char1' | 'char2' = 'char1';
    let turnCount = 0;

    while (!stopSignal) {
      const character = turn === 'char1' ? appStore.char1 : appStore.char2;
      const other     = turn === 'char1' ? appStore.char2 : appStore.char1;
      const engine    = engines[turn];
      const voice     = voiceEngines[turn];

      appStore.setCurrentTurn(turn);
      appStore.setTyping(true);

      let text: string;
      try {
        text = await engine.generate(
          [...history],
          character.prompt,
          character.name,
          other.name,
          appStore.topic
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Conversation] engine error:', msg);
        errorMessage = msg;
        break;
      }

      if (stopSignal) break;

      appStore.setTyping(false);

      const msg: Message = {
        id: crypto.randomUUID(),
        characterId: turn,
        characterName: character.name,
        text,
        timestamp: new Date(),
      };

      appStore.addMessage(msg);
      turnCount += 1;

      // Force-stop when MAX_TURNS is reached
      if (turnCount >= MAX_TURNS) break;

      history.push({
        role: 'assistant',
        content: `${character.name}: ${text}`,
      });

      // Keep history bounded to last 20 entries to avoid bloat
      if (history.length > 20) history.splice(0, history.length - 20);

      // Speak (no-op until voice engines are implemented)
      voice.speak(text, turn).catch(() => {});

      // Pause briefly between turns
      await new Promise((r) => setTimeout(r, 400));

      turn = turn === 'char1' ? 'char2' : 'char1';
    }

    appStore.setTyping(false);
    if (appStore.status === 'running') {
      appStore.setStatus('stopped');
    }
  }

  function stopConversation() {
    stopSignal = true;
    appStore.setTyping(false);
    appStore.setStatus('stopped');
  }

  const isRunning = $derived(appStore.status === 'running');
</script>

<svelte:head>
  <title>Discussion — AI Vtuber</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">🎭 AI Discussion</h1>
    <p class="page-subtitle">2人のキャラクターが交互に会話します</p>
  </header>

  <!-- Character Settings -->
  <section class="characters-section">
    <CharacterCard
      character={appStore.char1}
      onUpdate={(u) => appStore.updateCharacter(0, u)}
      disabled={isRunning}
    />
    <div class="vs-badge">VS</div>
    <CharacterCard
      character={appStore.char2}
      onUpdate={(u) => appStore.updateCharacter(1, u)}
      disabled={isRunning}
    />
  </section>

  <!-- Error banner -->
  {#if errorMessage}
    <div class="error-banner">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{errorMessage}</span>
      <button class="error-close" onclick={() => (errorMessage = null)}>✕</button>
    </div>
  {/if}

  <!-- Conversation area -->
  <section class="conversation-section">
    <ConversationControls onStart={startConversation} onStop={stopConversation} />
    <ConversationLog />
  </section>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .page-header {
    padding: 14px 20px 10px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .page-title {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
  }

  .page-subtitle {
    margin: 2px 0 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  /* Characters side-by-side */
  .characters-section {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow-x: auto;
  }

  .characters-section :global(.card) {
    flex: 1;
    min-width: 260px;
  }

  .vs-badge {
    font-size: 1rem;
    font-weight: 900;
    color: var(--text-muted);
    padding: 0 12px;
    flex-shrink: 0;
  }

  .error-banner {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 16px;
    background: #3a1a1a;
    border-bottom: 1px solid #c0392b;
    color: #ff6b6b;
    font-size: 0.85rem;
    flex-shrink: 0;
    white-space: pre-wrap;
  }

  .error-icon {
    flex-shrink: 0;
  }

  .error-text {
    flex: 1;
    line-height: 1.5;
  }

  .error-close {
    background: none;
    border: none;
    color: #ff6b6b;
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0;
    flex-shrink: 0;
    opacity: 0.7;
  }
  .error-close:hover {
    opacity: 1;
  }

  /* Conversation section fills remaining space */
  .conversation-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
</style>
