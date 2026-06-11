<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';

  type Character = {
    id: string;
    name: string;
    role: string;
    description: string;
    image: string;
    hasReference?: boolean;
  };

  type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    createdAt: string;
  };

  type CharacterMemory = {
    personality: string[];
    speechStyle: string[];
    likes: string[];
    dislikes: string[];
    updatedAt: string;
  };

  const emptyMemory = (): CharacterMemory => ({
    personality: [],
    speechStyle: [],
    likes: [],
    dislikes: [],
    updatedAt: '',
  });

  let character = $state<Character | null>(null);
  let messages = $state<ChatMessage[]>([]);
  let memory = $state<CharacterMemory>(emptyMemory());
  let imageDataUrl = $state('');
  let inputText = $state('');
  let loading = $state(true);
  let sending = $state(false);
  let analyzing = $state(false);
  let savingMemory = $state(false);
  let errorMessage = $state('');

  onMount(() => {
    void loadCharacterChat();
  });

  async function loadCharacterChat(): Promise<void> {
    loading = true;
    errorMessage = '';
    const id = page.params.id;
    if (!id) {
      errorMessage = 'Character IDがありません。';
      loading = false;
      return;
    }
    try {
      const [characterResponse, chatResponse, memoryResponse] = await Promise.all([
        fetch(`/api/characters/${encodeURIComponent(id)}`),
        fetch(`/api/characters/${encodeURIComponent(id)}/chat`),
        fetch(`/api/characters/${encodeURIComponent(id)}/memory`),
      ]);
      const characterData = await characterResponse.json();
      const chatData = await chatResponse.json();
      const memoryData = await memoryResponse.json();
      if (!characterResponse.ok) throw new Error(characterData?.message ?? 'Character not found');
      if (!chatResponse.ok) throw new Error(chatData?.message ?? 'Chat log load failed');
      if (!memoryResponse.ok) throw new Error(memoryData?.message ?? 'Memory load failed');
      character = characterData.character;
      messages = Array.isArray(chatData.messages) ? chatData.messages : [];
      memory = memoryData.memory ?? emptyMemory();

      if (character?.hasReference) {
        const imageResponse = await fetch(`/api/characters/${encodeURIComponent(id)}/reference`);
        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          imageDataUrl = imageData.referenceImageDataUrl ?? '';
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  }

  function memoryPrompt(): string {
    return [
      memory.personality.length ? `性格: ${memory.personality.join('、')}` : '',
      memory.speechStyle.length ? `口調: ${memory.speechStyle.join('、')}` : '',
      memory.likes.length ? `好き: ${memory.likes.join('、')}` : '',
      memory.dislikes.length ? `嫌い: ${memory.dislikes.join('、')}` : '',
    ].filter(Boolean).join('\n');
  }

  function systemPrompt(): string {
    if (!character) return '';
    return [
      `あなたは「${character.name}」として会話してください。`,
      character.role ? `役割: ${character.role}` : '',
      character.description ? `設定: ${character.description}` : '',
      memoryPrompt(),
      'Character ChatではStoryを生成・参照せず、日常会話に集中してください。',
      '保存済みの性格・口調・好き嫌いを優先し、自然な日本語で返答してください。',
    ].filter(Boolean).join('\n');
  }

  async function appendMessage(role: ChatMessage['role'], text: string): Promise<void> {
    if (!character) return;
    const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role, text }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message ?? 'Chat log save failed');
    messages = data.messages;
  }

  async function sendMessage(): Promise<void> {
    const text = inputText.trim();
    if (!text || sending || !character) return;
    inputText = '';
    sending = true;
    errorMessage = '';
    try {
      await appendMessage('user', text);
      const response = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          route: 'chat',
          systemPrompt: systemPrompt(),
          userMessage: text,
          conversationHistory: messages.slice(-12).map((message) => ({
            role: message.role === 'assistant' ? 'ai' : 'user',
            text: message.text,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Character response failed');
      const reply = String(data?.text ?? data?.reply ?? '').trim();
      if (!reply) throw new Error('Character response was empty');
      await appendMessage('assistant', reply);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      sending = false;
    }
  }

  async function saveMemory(nextMemory: CharacterMemory = memory): Promise<void> {
    if (!character) return;
    savingMemory = true;
    errorMessage = '';
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/memory`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(nextMemory),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Memory save failed');
      memory = data.memory;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingMemory = false;
    }
  }

  function parseMemoryResponse(text: string): CharacterMemory | null {
    const jsonText = text.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? text;
    try {
      const parsed = JSON.parse(jsonText);
      const list = (value: unknown) => Array.isArray(value)
        ? value.map(String).map((item) => item.trim()).filter(Boolean)
        : [];
      return {
        personality: list(parsed.personality),
        speechStyle: list(parsed.speechStyle),
        likes: list(parsed.likes),
        dislikes: list(parsed.dislikes),
        updatedAt: memory.updatedAt,
      };
    } catch {
      return null;
    }
  }

  async function updateMemoryFromHistory(): Promise<void> {
    if (!character || messages.length === 0 || analyzing) return;
    analyzing = true;
    errorMessage = '';
    try {
      const transcript = messages.slice(-80)
        .map((message) => `${message.role === 'user' ? 'USER' : character!.name}: ${message.text}`)
        .join('\n');
      const response = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          route: 'chat',
          systemPrompt: [
            '会話履歴からキャラクターのMemoryを抽出してください。',
            '必ずJSONのみを返してください。',
            '{"personality":[],"speechStyle":[],"likes":[],"dislikes":[]}',
            '明示または繰り返し確認できる特徴だけを短い日本語で記録してください。',
          ].join('\n'),
          userMessage: transcript,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Memory analysis failed');
      const analyzed = parseMemoryResponse(String(data?.text ?? data?.reply ?? ''));
      if (!analyzed) throw new Error('Memory analysis result was invalid');
      await saveMemory(analyzed);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      analyzing = false;
    }
  }

  function updateMemoryList(key: keyof Pick<CharacterMemory, 'personality' | 'speechStyle' | 'likes' | 'dislikes'>, value: string): void {
    memory = {
      ...memory,
      [key]: value.split(/\r?\n|、/).map((item) => item.trim()).filter(Boolean),
    };
  }

  async function clearChat(): Promise<void> {
    if (!character || !confirm('このキャラクターの会話ログを削除しますか？')) return;
    const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/chat`, {
      method: 'DELETE',
    });
    if (response.ok) messages = [];
  }
</script>

<svelte:head>
  <title>{character?.name ?? 'CHARACTER'} CHAT | AI VTuber</title>
</svelte:head>

<div class="chat-page">
  <header>
    <a href="/characters">← CHARACTER LIBRARY</a>
    <div>
      <p>CHARACTER SHEET / CHARACTER MEMORY</p>
      <h1>{character?.name ?? 'CHARACTER CHAT'}</h1>
    </div>
    <button onclick={clearChat} disabled={!character || messages.length === 0}>ログ削除</button>
  </header>

  {#if errorMessage}<div class="error-message">{errorMessage}</div>{/if}

  {#if loading}
    <div class="loading">読み込み中...</div>
  {:else if character}
    <main>
      <aside class="character-panel">
        <div class="portrait">
          {#if imageDataUrl}<img src={imageDataUrl} alt={character.name} />{:else}<span>NO IMAGE</span>{/if}
        </div>
        <h2>{character.name}</h2>
        <div class="role">{character.role}</div>
        <p>{character.description}</p>
      </aside>

      <section class="conversation-panel">
        <div class="messages">
          {#if messages.length === 0}
            <div class="empty-chat">このキャラクターとの会話を始めてください。</div>
          {/if}
          {#each messages as message (message.id)}
            <article class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
              <span>{message.role === 'user' ? 'YOU' : character.name}</span>
              <div>{message.text}</div>
            </article>
          {/each}
          {#if sending}<div class="thinking">{character.name} is thinking...</div>{/if}
        </div>
        <div class="composer">
          <textarea
            bind:value={inputText}
            rows="3"
            placeholder={`${character.name}に話しかける`}
            onkeydown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void sendMessage();
            }}
          ></textarea>
          <button onclick={sendMessage} disabled={sending || !inputText.trim()}>送信</button>
        </div>
      </section>

      <aside class="memory-panel">
        <div class="memory-header">
          <div>
            <p>CHARACTER MEMORY</p>
            <h2>会話から育つ設定</h2>
          </div>
          <button onclick={updateMemoryFromHistory} disabled={analyzing || messages.length === 0}>
            {analyzing ? '解析中...' : '履歴から更新'}
          </button>
        </div>

        <label><span>性格</span><textarea rows="4" value={memory.personality.join('\n')} oninput={(e) => updateMemoryList('personality', e.currentTarget.value)}></textarea></label>
        <label><span>口調</span><textarea rows="4" value={memory.speechStyle.join('\n')} oninput={(e) => updateMemoryList('speechStyle', e.currentTarget.value)}></textarea></label>
        <label><span>好き</span><textarea rows="3" value={memory.likes.join('\n')} oninput={(e) => updateMemoryList('likes', e.currentTarget.value)}></textarea></label>
        <label><span>嫌い</span><textarea rows="3" value={memory.dislikes.join('\n')} oninput={(e) => updateMemoryList('dislikes', e.currentTarget.value)}></textarea></label>
        <button class="save-memory" onclick={() => saveMemory()} disabled={savingMemory}>
          {savingMemory ? '保存中...' : 'Memoryを保存'}
        </button>
        {#if memory.updatedAt}<small>UPDATED: {new Date(memory.updatedAt).toLocaleString('ja-JP')}</small>{/if}
      </aside>
    </main>
  {/if}
</div>

<style>
  :global(body) { margin: 0; background: #030712; color: #e2e8f0; font-family: 'Segoe UI', sans-serif; }
  .chat-page { min-height: 100vh; padding: 22px; background: radial-gradient(circle at 50% 0%, rgba(34,211,238,.1), transparent 36%), #030712; }
  header { max-width: 1500px; margin: 0 auto 18px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 16px; }
  header a { color: #a5f3fc; font-size: 10px; text-decoration: none; }
  header div { text-align: center; }
  header p, header h1 { margin: 0; }
  header p { color: #22d3ee; font-size: 9px; letter-spacing: .18em; }
  header h1 { margin-top: 3px; color: #f8fafc; font-size: 30px; }
  header button { justify-self: end; }
  main { max-width: 1500px; margin: 0 auto; display: grid; grid-template-columns: 240px minmax(360px, 1fr) 320px; gap: 14px; }
  .character-panel, .conversation-panel, .memory-panel, .loading, .error-message {
    border: 1px solid rgba(148,163,184,.16); border-radius: 12px; background: rgba(8,15,32,.86);
  }
  .character-panel, .memory-panel { padding: 14px; align-self: start; }
  .portrait { aspect-ratio: 1; display: grid; place-items: center; overflow: hidden; border-radius: 9px; background: #020617; color: #475569; }
  .portrait img { width: 100%; height: 100%; object-fit: cover; }
  .character-panel h2 { margin: 11px 0 3px; }
  .role { color: #fbbf24; font-size: 11px; }
  .character-panel p { color: #94a3b8; font-size: 12px; line-height: 1.55; }
  .conversation-panel { min-height: calc(100vh - 120px); display: grid; grid-template-rows: 1fr auto; overflow: hidden; }
  .messages { max-height: calc(100vh - 240px); padding: 16px; overflow-y: auto; }
  article { max-width: 82%; margin-bottom: 10px; padding: 9px 11px; border-radius: 9px; }
  article span { display: block; margin-bottom: 4px; font-size: 8px; font-weight: 800; letter-spacing: .12em; }
  article div { font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
  article.user { margin-left: auto; background: rgba(168,85,247,.12); border: 1px solid rgba(168,85,247,.22); }
  article.assistant { background: rgba(34,211,238,.08); border: 1px solid rgba(34,211,238,.18); }
  article.user span { color: #c4b5fd; } article.assistant span { color: #67e8f9; }
  .empty-chat, .thinking { color: #64748b; font-size: 11px; text-align: center; }
  .composer { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 12px; border-top: 1px solid rgba(148,163,184,.14); }
  textarea, button { border: 1px solid rgba(148,163,184,.22); border-radius: 6px; background: #020617; color: #e2e8f0; font: inherit; }
  textarea { width: 100%; padding: 8px; resize: vertical; box-sizing: border-box; }
  button { padding: 8px 12px; color: #a5f3fc; font-size: 10px; font-weight: 800; cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .4; }
  .memory-header { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
  .memory-header p, .memory-header h2 { margin: 0; }
  .memory-header p { color: #22d3ee; font-size: 8px; letter-spacing: .15em; }
  .memory-header h2 { margin-top: 3px; font-size: 15px; }
  label { display: grid; gap: 4px; margin-top: 10px; }
  label span { color: #94a3b8; font-size: 9px; font-weight: 800; }
  .save-memory { width: 100%; margin-top: 12px; border-color: rgba(251,191,36,.35); color: #fde68a; }
  small { display: block; margin-top: 8px; color: #64748b; font-size: 8px; text-align: right; }
  .loading, .error-message { max-width: 900px; margin: 40px auto; padding: 30px; text-align: center; color: #94a3b8; }
  .error-message { padding: 10px; color: #fb7185; }
  @media (max-width: 1050px) { main { grid-template-columns: 210px 1fr; } .memory-panel { grid-column: 1 / -1; } }
  @media (max-width: 700px) { .chat-page { padding: 14px; } header { grid-template-columns: 1fr; align-items: start; } header div { text-align: left; } header button { justify-self: start; } main { grid-template-columns: 1fr; } .memory-panel { grid-column: auto; } .conversation-panel { min-height: 65vh; } }
</style>
