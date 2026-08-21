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
    selfImages?: SelfImage[];
  };

  type SelfImage = {
    id: string;
    createdAt: string;
    provider: string;
    prompt: string;
    imageUrl: string;
  };

  type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    createdAt: string;
  };

  type ImageIntentResult = {
    imageRequestCandidate: boolean;
    prompt: string;
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
  let selfImageModalOpen = $state(false);
  let selfImagePrompt = $state('');
  let selfImageProvider = $state<'nanobanana-2-lite' | 'nano-banana-2' | 'nano-banana-pro' | 'gpt-image-2' | 'ideogram-character'>('nano-banana-2');
  let selfImageBusy = $state(false);
  let selfImageStatus = $state('');
  let generatedSelfImage = $state<SelfImage | null>(null);
  let selfImages = $state<SelfImage[]>([]);
  let imageRequestCandidate = $state(false);
  let suggestedSelfImagePrompt = $state('');

  const selfImageProviders = [
    { id: 'nanobanana-2-lite', label: 'NanoBanana 2 Lite' },
    { id: 'nano-banana-2', label: 'Nano Banana 2' },
    { id: 'nano-banana-pro', label: 'Nano Banana Pro' },
    { id: 'gpt-image-2', label: 'GPT Image 2' },
    { id: 'ideogram-character', label: 'Ideogram Character' },
  ] as const;

  const selfImageTriggerPatterns = [
    /描いて/,
    /描き/,
    /イラストにして/,
    /イラスト化/,
    /絵にして/,
    /画像にして/,
    /自画像/,
    /少しお色気/,
    /お色気/,
    /セクシー/,
    /別衣装/,
    /衣装.*描/,
    /self\s*image/i,
    /draw/i,
    /illustrat/i,
  ];

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
      selfImages = Array.isArray(character?.selfImages) ? character.selfImages : [];

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

  function ImageIntentDetector(text: string, hasAttachedImage: boolean): ImageIntentResult {
    const normalized = text.normalize('NFKC').toLowerCase();
    const japaneseTriggers = [
      '\u63cf\u3044\u3066',
      '\u63cf\u304d',
      '\u30a4\u30e9\u30b9\u30c8\u306b\u3057\u3066',
      '\u30a4\u30e9\u30b9\u30c8\u5316',
      '\u7d75\u306b\u3057\u3066',
      '\u753b\u50cf\u306b\u3057\u3066',
      '\u753b\u50cf\u751f\u6210',
      '\u753b\u50cf\u4f5c\u3063\u3066',
      '\u753b\u50cf\u3092\u4f5c\u3063\u3066',
      '\u30a4\u30e1\u30fc\u30b8\u4f5c\u3063\u3066',
      '\u81ea\u753b\u50cf',
      '\u81ea\u753b\u50cf\u4f5c\u3063\u3066',
      '\u5c11\u3057\u304a\u8272\u6c17',
      '\u304a\u8272\u6c17',
      '\u30bb\u30af\u30b7\u30fc',
      '\u5225\u8863\u88c5',
      '\u30a2\u30f3\u30c9\u30ed\u30a4\u30c9\u5316',
      '\u30a2\u30f3\u30c9\u30ed\u30a4\u30c9\u306b\u3057\u3066',
    ];
    const hasImageKeyword = japaneseTriggers.some((trigger) => normalized.includes(trigger))
      || selfImageTriggerPatterns.some((pattern) => pattern.test(normalized));
    return {
      imageRequestCandidate: hasAttachedImage && hasImageKeyword,
      prompt: text,
    };
  }

  async function sendMessage(): Promise<void> {
    const text = inputText.trim();
    if (!text || sending || !character) return;
    inputText = '';
    sending = true;
    errorMessage = '';
    try {
      const imageIntent = ImageIntentDetector(text, Boolean(imageDataUrl));
      await appendMessage('user', text);
      if (imageIntent.imageRequestCandidate) {
        imageRequestCandidate = true;
        suggestedSelfImagePrompt = imageIntent.prompt;
        selfImagePrompt = imageIntent.prompt;
        selfImageStatus = '';
        return;
      }
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

  function openSelfImageModal(): void {
    selfImagePrompt = inputText.trim();
    selfImageStatus = '';
    selfImageModalOpen = true;
  }

  async function confirmImageSuggestion(): Promise<void> {
    const prompt = suggestedSelfImagePrompt.trim();
    if (!prompt || selfImageBusy) return;
    if (!imageDataUrl) {
      selfImageStatus = 'Reference image is required for SELF IMAGE';
      return;
    }
    selfImagePrompt = prompt;
    generatedSelfImage = null;
    await runSelfImageGeneration(prompt);
    if (generatedSelfImage) {
      imageRequestCandidate = false;
      suggestedSelfImagePrompt = '';
    }
  }

  function cancelImageSuggestion(): void {
    imageRequestCandidate = false;
    suggestedSelfImagePrompt = '';
    selfImageStatus = '';
  }

  function reviseImageSuggestion(): void {
    selfImagePrompt = suggestedSelfImagePrompt.trim();
    selfImageStatus = '';
    selfImageModalOpen = true;
  }

  async function runSelfImageGeneration(userPrompt: string): Promise<void> {
    if (!character || selfImageBusy) return;
    const prompt = userPrompt.trim();
    if (!prompt) {
      selfImageStatus = '画像化したい内容を入力してください。';
      return;
    }
    selfImageBusy = true;
    selfImageStatus = 'Generating...';
    errorMessage = '';
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/self-image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          provider: selfImageProvider,
          userPrompt: prompt,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Self image generation failed');
      generatedSelfImage = data.image;
      selfImageModalOpen = false;
      selfImageStatus = 'Generated';
    } catch (error) {
      selfImageStatus = error instanceof Error ? error.message : String(error);
    } finally {
      selfImageBusy = false;
    }
  }

  async function generateSelfImage(): Promise<void> {
    await runSelfImageGeneration(selfImagePrompt.trim() || inputText.trim());
  }

  async function saveGeneratedSelfImage(): Promise<void> {
    if (!character || !generatedSelfImage || selfImageBusy) return;
    selfImageBusy = true;
    selfImageStatus = 'Saving...';
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/self-image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', image: generatedSelfImage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Self image save failed');
      selfImages = Array.isArray(data.selfImages) ? data.selfImages : selfImages;
      selfImageStatus = 'Saved';
    } catch (error) {
      selfImageStatus = error instanceof Error ? error.message : String(error);
    } finally {
      selfImageBusy = false;
    }
  }

  async function applyGeneratedSelfImage(): Promise<void> {
    if (!character || !generatedSelfImage || selfImageBusy) return;
    selfImageBusy = true;
    selfImageStatus = 'Applying...';
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/self-image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'apply', imageUrl: generatedSelfImage.imageUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Apply failed');
      character = data.character;
      imageDataUrl = generatedSelfImage.imageUrl;
      selfImageStatus = 'Applied';
    } catch (error) {
      selfImageStatus = error instanceof Error ? error.message : String(error);
    } finally {
      selfImageBusy = false;
    }
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
    <div class="header-actions">
      <button onclick={openSelfImageModal} disabled={!character || !imageDataUrl}>🖼 SELF IMAGE</button>
      <button onclick={clearChat} disabled={!character || messages.length === 0}>繝ｭ繧ｰ蜑企勁</button>
    </div>
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
          {#if imageRequestCandidate}
            <section class="self-image-suggestion">
              <div>
                <span>SELF IMAGE SUGGESTION</span>
                <strong>{character.name}からの提案</strong>
                <p>ご主人様、この姿なら描けそうです♪</p>
                <p class="self-image-request">{suggestedSelfImagePrompt}</p>
                {#if selfImageStatus}<em>{selfImageStatus}</em>{/if}
              </div>
              <div class="self-image-suggestion-actions">
                <button onclick={confirmImageSuggestion} disabled={selfImageBusy || !imageDataUrl}>
                  {selfImageBusy ? 'Generating...' : '🖼️この姿で描く'}
                </button>
                <button onclick={reviseImageSuggestion} disabled={selfImageBusy}>🔧別案を考える</button>
                <button onclick={cancelImageSuggestion} disabled={selfImageBusy}>❌キャンセル</button>
              </div>
            </section>
          {/if}
          {#if generatedSelfImage}
            <section class="self-image-result">
              <div class="self-image-head">
                <div>
                  <span>SELF IMAGE</span>
                  <strong>{generatedSelfImage.provider}</strong>
                </div>
                {#if selfImageStatus}<em>{selfImageStatus}</em>{/if}
              </div>
              <img src={generatedSelfImage.imageUrl} alt={`${character.name} self generated`} />
              <p>{generatedSelfImage.prompt}</p>
              <div class="self-image-actions">
                <button onclick={generateSelfImage} disabled={selfImageBusy}>🔄 再生成</button>
                <button onclick={saveGeneratedSelfImage} disabled={selfImageBusy}>💾 保存</button>
                <button onclick={applyGeneratedSelfImage} disabled={selfImageBusy}>📌 キャラ画像に反映</button>
              </div>
            </section>
          {/if}
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

{#if selfImageModalOpen && character}
  <div
    class="self-image-modal-backdrop"
    role="button"
    tabindex="-1"
    onclick={() => !selfImageBusy && (selfImageModalOpen = false)}
    onkeydown={() => {}}
  >
    <div
      class="self-image-modal"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Character Self Image"
      onclick={(event) => event.stopPropagation()}
      onkeydown={() => {}}
    >
      <header>
        <p>CHARACTER IMAGE GENERATION</p>
        <h2>🖼 SELF IMAGE</h2>
      </header>
      <div class="self-image-reference">
        {#if imageDataUrl}<img src={imageDataUrl} alt={character.name} />{/if}
        <div>
          <strong>{character.name}</strong>
          <span>Reference image will be used automatically.</span>
        </div>
      </div>
      <label class="self-image-prompt">
        <span>Prompt Request</span>
        <textarea bind:value={selfImagePrompt} rows="4" placeholder="少しお色気なアンドロイドにして"></textarea>
      </label>
      <div class="self-image-provider-grid">
        {#each selfImageProviders as provider}
          <button
            type="button"
            class:selected={selfImageProvider === provider.id}
            onclick={() => (selfImageProvider = provider.id)}
          >
            {provider.label}
          </button>
        {/each}
      </div>
      {#if selfImageStatus}<div class="self-image-status">{selfImageStatus}</div>{/if}
      <footer>
        <button type="button" onclick={() => (selfImageModalOpen = false)} disabled={selfImageBusy}>Cancel</button>
        <button type="button" class="primary" onclick={generateSelfImage} disabled={selfImageBusy}>
          {selfImageBusy ? 'Generating...' : 'Generate'}
        </button>
      </footer>
    </div>
  </div>
{/if}

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
  .header-actions { justify-self: end; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
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
  .self-image-suggestion {
    margin: 14px 0 2px;
    padding: 12px;
    border: 1px solid rgba(251,191,36,.24);
    border-radius: 12px;
    background: rgba(15,23,42,.82);
  }
  .self-image-suggestion span { display: block; color: #fbbf24; font-size: 8px; font-weight: 900; letter-spacing: .16em; }
  .self-image-suggestion strong { display: block; margin-top: 3px; color: #f8fafc; font-size: 13px; }
  .self-image-suggestion p { margin: 8px 0 0; color: #cbd5e1; font-size: 11px; line-height: 1.55; white-space: pre-wrap; }
  .self-image-suggestion .self-image-request { color: #94a3b8; }
  .self-image-suggestion em { display: block; margin-top: 8px; color: #fb7185; font-size: 10px; font-style: normal; }
  .self-image-suggestion-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 11px; }
  .self-image-suggestion-actions button:first-child { border-color: rgba(251,191,36,.45); color: #fde68a; background: rgba(251,191,36,.12); }
  .self-image-result {
    margin: 14px 0 2px;
    padding: 12px;
    border: 1px solid rgba(251,191,36,.28);
    border-radius: 12px;
    background: rgba(15,23,42,.84);
  }
  .self-image-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 10px; }
  .self-image-head span { display: block; color: #fbbf24; font-size: 8px; font-weight: 900; letter-spacing: .16em; }
  .self-image-head strong { color: #f8fafc; font-size: 13px; }
  .self-image-head em { color: #94a3b8; font-size: 10px; font-style: normal; }
  .self-image-result img { width: min(100%, 520px); display: block; border-radius: 10px; border: 1px solid rgba(148,163,184,.18); background: #020617; }
  .self-image-result p { color: #cbd5e1; font-size: 11px; line-height: 1.55; white-space: pre-wrap; }
  .self-image-actions { display: flex; gap: 8px; flex-wrap: wrap; }
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
  .self-image-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(2,6,23,.78);
    backdrop-filter: blur(4px);
  }
  .self-image-modal {
    width: min(520px, 100%);
    border: 1px solid rgba(251,191,36,.28);
    border-radius: 14px;
    background: rgba(8,15,32,.98);
    padding: 18px;
    box-shadow: 0 24px 70px rgba(0,0,0,.55);
  }
  .self-image-modal header { display: block; margin: 0 0 14px; }
  .self-image-modal header p { color: #fbbf24; font-size: 9px; letter-spacing: .16em; }
  .self-image-modal header h2 { margin: 3px 0 0; font-size: 22px; }
  .self-image-reference { display: grid; grid-template-columns: 72px 1fr; gap: 12px; align-items: center; padding: 10px; border: 1px solid rgba(148,163,184,.14); border-radius: 10px; background: rgba(2,6,23,.5); }
  .self-image-reference img { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; }
  .self-image-reference strong { display: block; }
  .self-image-reference span { color: #94a3b8; font-size: 11px; }
  .self-image-prompt { margin-top: 12px; }
  .self-image-provider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
  .self-image-provider-grid button.selected { border-color: #fbbf24; color: #fde68a; background: rgba(251,191,36,.12); }
  .self-image-status { margin-top: 10px; color: #fbbf24; font-size: 11px; }
  .self-image-modal footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  .self-image-modal footer .primary { border-color: rgba(251,191,36,.45); color: #fde68a; background: rgba(251,191,36,.12); }
  @media (max-width: 1050px) { main { grid-template-columns: 210px 1fr; } .memory-panel { grid-column: 1 / -1; } }
  @media (max-width: 700px) { .chat-page { padding: 14px; } header { grid-template-columns: 1fr; align-items: start; } header div { text-align: left; } header button, .header-actions { justify-self: start; justify-content: flex-start; } main { grid-template-columns: 1fr; } .memory-panel { grid-column: auto; } .conversation-panel { min-height: 65vh; } .self-image-provider-grid { grid-template-columns: 1fr; } }
</style>
