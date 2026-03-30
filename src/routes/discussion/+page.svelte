<script lang="ts">
  import { appStore } from '$lib/stores/appStore.svelte';
  import CharacterCard from '$lib/components/CharacterCard.svelte';
  import ConversationLog from '$lib/components/ConversationLog.svelte';
  import ConversationControls from '$lib/components/ConversationControls.svelte';
  import type { Message } from '$lib/types/conversation';
  

  const MAX_TURNS = 6;

  let stopSignal = false;
  let errorMessage = $state<string | null>(null);

  async function startConversation() {
    console.log('🚀 会話開始');

    stopSignal = false;
    errorMessage = null;

    appStore.clearMessages();
    appStore.setStatus('running');
    appStore.setTyping(false);

    let turnIndex = 0;
    let turnCount = 0;

    let model = '';





    // このページは2人会話専用
    const activeChars = [appStore.char1, appStore.char2];

    if (activeChars.length < 2) {
      console.error('キャラが足りない');
      errorMessage = 'キャラ設定が不足しています。';
      appStore.setStatus('stopped');
      return;
    }

    const history: Array<{ role: 'assistant' | 'user'; content: string }> = [];

    while (!stopSignal) {
      const character = activeChars[turnIndex];
      const other = activeChars[(turnIndex + 1) % activeChars.length];

      if (character.aiEngine === 'openai') {
        model = 'gpt-4o-mini';
      } else if (character.aiEngine === 'lmstudio') {
        model = character.lmstudioModel || '';
      } else if (character.aiEngine === 'ollama') {
        model = character.ollamaModel || '';
      }

      console.log('🎭 現在キャラ', character.name);
      console.log('👂 相手キャラ', other.name);

      appStore.setTyping(true);

      const safePrompt = [
        character.prompt,
        '自己紹介は最初の1回だけにしてください。',
        '短く自然に会話してください（1〜2文）。',
        '質問で返しすぎないでください。'
      ].join('\n');

      try {
        console.log('📤 送信', {
          speaker: character.name,
          listener: other.name,
          topic: appStore.topic,
          engine: character.aiEngine,
          model: character.aiEngine === 'lmstudio'
            ? (character.lmstudioModel || '')
            : (character.ollamaModel || '')
        });

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt: safePrompt,
            lastMessage: history.at(-1)?.content ?? '',
            speakerName: character.name,
            listenerName: other.name,
            topic: appStore.topic,
            engine: character.aiEngine,
            model:
              character.aiEngine === 'lmstudio'
                ? (character.lmstudioModel || '')
                : (character.ollamaModel || '')
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error('💥 /api/chat エラー', res.status, errText);
          errorMessage = `/api/chat エラー: ${res.status}`;
          break;
        }

        const data = await res.json();
        const text = (data.message ?? data.text ?? '').trim();

        console.log('📩 受信', data);

        if (!text) {
          console.warn('⚠ 空レスポンス');
          errorMessage = 'AIから空のレスポンスが返りました。';
          break;
        }

        appStore.setTyping(false);

        const msg: Message = {
          id: crypto.randomUUID(),
          characterId: character.id as 'char1' | 'char2',
          characterName: character.name,
          text,
          timestamp: new Date()
        };

        appStore.addMessage(msg);
        saveConversationLog(msg);

        history.push({
          role: 'assistant',
          content: `${character.name}: ${text}`
        });

        if (history.length > 20) {
          history.splice(0, history.length - 20);
        }

        turnCount++;
        turnIndex = (turnIndex + 1) % activeChars.length;

        console.log('🔁 次ターン', turnIndex);

        if (turnCount >= MAX_TURNS) {
          console.log('🛑 MAX到達');
          break;
        }

        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error('💥 会話エラー', err);
        errorMessage = err instanceof Error ? err.message : String(err);
        break;
      } finally {
        appStore.setTyping(false);
      }
    }

    appStore.setStatus('stopped');
    console.log('🏁 会話終了');
  }

  function stopConversation() {
    stopSignal = true;
    appStore.setTyping(false);
    appStore.setStatus('stopped');
  }

  const isRunning = $derived(appStore.status === 'running');

  function saveConversationLog(message: Message) {
    try {
      const logs = JSON.parse(localStorage.getItem('ai_logs') || '[]');

      logs.push({
        time: new Date().toISOString(),
        character: message.characterName ?? 'unknown',
        text: message.text ?? ''
      });

      localStorage.setItem('ai_logs', JSON.stringify(logs));
    } catch (e) {
      console.error('ログ保存エラー', e);
    }
  }
</script>


<svelte:head>
  <title>Discussion — AI Vtuber</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">🎭 AI Discussion</h1>
    <p class="page-subtitle">2人のキャラクターが交互に会話します</p>
  </header>

  
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

  
  {#if errorMessage}
    <div class="error-banner">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{errorMessage}</span>
      <button class="error-close" onclick={() => (errorMessage = null)}>✕</button>
    </div>
  {/if}

  
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
