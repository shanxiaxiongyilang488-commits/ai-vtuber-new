<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { routeProvider, type RoutedProvider } from '$lib/ai/aiProviderRouter';
  import {
    GROWTH_HISTORY_LIMIT,
    GROWTH_PARAMS,
    clampGrowth,
    determinePersonalityType,
    evaluateGrowth,
    growthLogEntries,
    growthMessageSnippet,
    initialGrowthValues,
    type GrowthHistoryEntry,
    type GrowthKey,
    type GrowthValues,
  } from '$lib/character-memory/growthSystem';

  type CharacterListItem = {
    id: string;
    name: string;
    role: string;
    description: string;
    hasReference: boolean;
    hasMemoryEntry: boolean;
    updatedAt: string;
  };

  type Character = {
    id: string;
    name: string;
    role: string;
    description: string;
  };

  type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    imageUrl?: string;
    createdAt: string;
  };

  type CharacterMemory = {
    personality: string[];
    speechStyle: string[];
    likes: string[];
    dislikes: string[];
  };

  const emptyMemory = (): CharacterMemory => ({
    personality: [],
    speechStyle: [],
    likes: [],
    dislikes: [],
  });

  type ImageAction = { prompt: string; size: string; preamble: string };

  // 文字列中の最初のバランスの取れたJSONオブジェクトを抽出する（文字列内のブレース・エスケープを考慮）。
  function extractJsonObject(text: string): { json: string; start: number; end: number } | null {
    const start = text.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return { json: text.slice(start, i + 1), start, end: i + 1 };
      }
    }
    return null;
  }

  // assistant応答が ChatGPT風の dalle.text2im ツール呼び出しJSONなら、画像生成パラメータへ変換する。
  // 画像生成アクションでなければ null（＝従来どおりテキスト表示）。
  function parseImageAction(text: string): ImageAction | null {
    const extracted = extractJsonObject(text);
    if (!extracted) return null;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(extracted.json) as Record<string, unknown>;
    } catch {
      return null;
    }
    const action = String(parsed?.action ?? '').toLowerCase();
    if (!/text2im|dall[·.]?e/.test(action)) return null;

    let input: unknown = parsed.action_input;
    // action_input は二重エンコードされたJSON文字列のことがある。
    if (typeof input === 'string') {
      try {
        input = JSON.parse(input);
      } catch {
        input = { prompt: input };
      }
    }
    const inputObj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const prompt = String(inputObj.prompt ?? parsed.prompt ?? '').trim();
    if (!prompt) return null;
    const size = String(inputObj.size ?? '1024x1024').trim() || '1024x1024';

    const preamble = (text.slice(0, extracted.start) + text.slice(extracted.end))
      .replace(/```(?:json)?/gi, '')
      .trim();
    return { prompt, size, preamble };
  }

  let characters = $state<CharacterListItem[]>([]);
  let selectedId = $state('');
  let character = $state<Character | null>(null);
  let messages = $state<ChatMessage[]>([]);
  let memory = $state<CharacterMemory>(emptyMemory());
  let imageDataUrl = $state('');
  let updatedAt = $state('');
  let inputText = $state('');
  let loadingList = $state(true);
  let loadingCharacter = $state(false);
  let sending = $state(false);
  let analyzing = $state(false);
  let savingMemory = $state(false);
  let injecting = $state(false);
  let generatingPortrait = $state(false);
  let pendingImage = $state('');
  let errorMessage = $state('');

  // AI Router: the engine assigned to the current character (Personality Engine).
  let routedProvider = $state<RoutedProvider>(routeProvider('AUTO'));

  // 🧠 Growth System V3 — 送信時にユーザーの文章だけを見てキーワード一致で加算し、履歴を可視化する。
  // AI返答では変化させない。emotion / 表情 / 画像生成 / Memory保存 / AIモデル切替 とは無関係。
  // 値・履歴は永続化しない（in-memory のみ。character-memory.json には一切書き込まない）。
  let growthValues = $state<GrowthValues>(initialGrowthValues());
  let growthHistory = $state<GrowthHistoryEntry[]>([]);
  // V4: 成長値から導出する Personality Type（数値は変更しない・表示用のみ）。
  const personalityType = $derived(determinePersonalityType(growthValues));

  // 送信ボタン押下時のみ呼ぶ。ユーザー入力テキストだけを評価して数値を変動させ、履歴へ記録する。
  function applyGrowthFromUserText(userText: string): void {
    const delta = evaluateGrowth(userText);
    const changes = growthLogEntries(delta);
    if (changes.length === 0) return;
    for (const key of Object.keys(delta) as GrowthKey[]) {
      growthValues[key] = clampGrowth(growthValues[key] + (delta[key] ?? 0));
    }
    const entry: GrowthHistoryEntry = {
      id: `growth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      message: growthMessageSnippet(userText),
      changes,
    };
    // 最新を先頭に。最新5件のみ保持（古い履歴は自動削除）。
    growthHistory = [entry, ...growthHistory].slice(0, GROWTH_HISTORY_LIMIT);
  }

  // 感情システムは将来用に予約（emotion: 'normal' 相当）。今回はUI表示しない／表情変化は未実装。

  const LAB_INJECT_MEMORY_KEY = 'lab-inject-character-memory';

  onMount(() => {
    void loadInitial();
  });

  async function loadInitial(): Promise<void> {
    await loadCharacterList();
    const requestedId = page.url.searchParams.get('id')?.trim().toLowerCase();
    if (requestedId && characters.some((entry) => entry.id === requestedId)) {
      await selectCharacter(requestedId);
    }
  }

  async function loadCharacterList(): Promise<void> {
    loadingList = true;
    errorMessage = '';
    try {
      const response = await fetch('/api/character-memory');
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Character list load failed');
      characters = Array.isArray(data.characters) ? data.characters : [];
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      loadingList = false;
    }
  }

  async function selectCharacter(id: string): Promise<void> {
    if (id === selectedId || loadingCharacter) return;
    selectedId = id;
    loadingCharacter = true;
    errorMessage = '';
    character = null;
    messages = [];
    memory = emptyMemory();
    imageDataUrl = '';
    updatedAt = '';
    // 成長パラメータ・履歴はキャラ切替でセッション初期値へリセット（永続化しない）。
    growthValues = initialGrowthValues();
    growthHistory = [];
    try {
      const response = await fetch(`/api/character-memory/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Character load failed');
      character = data.character;
      messages = Array.isArray(data.messages) ? data.messages : [];
      memory = data.memory ?? emptyMemory();
      updatedAt = data.updatedAt ?? '';

      await loadRoutedProvider(id);

      const item = characters.find((entry) => entry.id === id);
      if (item?.hasReference) {
        const imageResponse = await fetch(`/api/characters/${encodeURIComponent(id)}/reference`);
        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          imageDataUrl = imageData.referenceImageDataUrl ?? '';
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      loadingCharacter = false;
    }
  }

  // Read the character's Personality Engine selection and resolve it via the AI Router.
  // Falls back to AUTO when no setting is saved or the request fails.
  async function loadRoutedProvider(id: string): Promise<void> {
    routedProvider = routeProvider('AUTO');
    try {
      const response = await fetch('/api/character-settings');
      if (!response.ok) return;
      const data = await response.json();
      const provider = data?.settings?.[id.trim().toLowerCase()]?.provider;
      if (typeof provider === 'string') routedProvider = routeProvider(provider);
    } catch {
      // Non-fatal: keep the AUTO fallback.
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
      'Character Memory ChatではStoryを生成・参照せず、日常会話に集中してください。',
      '保存済みの性格・口調・好き嫌いを優先し、自然な日本語で返答してください。',
    ].filter(Boolean).join('\n');
  }

  async function appendMessage(
    role: ChatMessage['role'],
    text: string,
    imageUrl = '',
  ): Promise<void> {
    if (!character) return;
    const response = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role, text, imageUrl }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message ?? 'Chat log save failed');
    messages = data.messages;
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
      reader.readAsDataURL(file);
    });
  }

  async function onPickImage(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      errorMessage = '画像ファイルを選択してください。';
      return;
    }
    try {
      pendingImage = await readFileAsDataUrl(file);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  async function persistImage(source: string): Promise<string> {
    if (!character) return '';
    const response = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/image`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message ?? '画像の保存に失敗しました。');
    return String(data?.url ?? '');
  }

  async function sendMessage(): Promise<void> {
    const text = inputText.trim();
    const attached = pendingImage;
    if ((!text && !attached) || sending || !character) return;
    inputText = '';
    pendingImage = '';
    sending = true;
    errorMessage = '';
    // Growth System V2: 送信時にユーザーの文章だけで判定（AI返答は見ない）。
    applyGrowthFromUserText(text);
    try {
      const savedUrl = attached ? await persistImage(attached) : '';
      const userText = text || (attached ? 'この画像を見て、感想を聞かせて。' : '');
      await appendMessage('user', userText, savedUrl);
      const response = await fetch('/api/lab-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          route: 'chat',
          // AI Router: route the per-character engine to the actual LLM provider.
          // Unimplemented selections fall back to GPT-5.5 (OpenAI).
          provider: routedProvider.labChatProvider ?? 'openai',
          systemPrompt: systemPrompt(),
          userMessage: userText,
          ...(attached ? { images: [attached] } : {}),
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
      const imageAction = parseImageAction(reply);
      if (imageAction) {
        generatingPortrait = true;
        try {
          const generatedUrl = await generateImage(imageAction.prompt, imageAction.size);
          const savedUrl = await persistImage(generatedUrl);
          await appendMessage('assistant', imageAction.preamble, savedUrl);
        } finally {
          generatingPortrait = false;
        }
      } else {
        await appendMessage('assistant', reply);
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      sending = false;
    }
  }

  function portraitPrompt(appearance: string): string {
    // 自画像生成は appearance のみを使用する（personality / likes / dislikes は渡さない）。
    return [
      'masterpiece, best quality, portrait of a single character',
      appearance,
    ].filter(Boolean).join(', ');
  }

  async function generateImage(prompt: string, size = '1024x1024'): Promise<string> {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Character Memory Chat の画像生成は GPT-Image2 に固定（Lab/Story/Project の設定には非依存）。
      // 参照画像があれば渡して GPT-Image2 Edit（image-to-image）にする。無ければ Text-to-Image にフォールバック。
      body: JSON.stringify({
        prompt,
        size,
        renderMode: 'illustration',
        selectedModel: 'openai/gpt-image-2',
        ...(imageDataUrl ? { refImages: [imageDataUrl] } : {}),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message ?? '画像生成に失敗しました。');
    const generatedUrl = String(data?.images?.[0]?.url ?? data?.url ?? '').trim();
    if (!generatedUrl) throw new Error('生成画像が空でした。');
    return generatedUrl;
  }

  async function generatePortrait(): Promise<void> {
    if (!character || generatingPortrait) return;
    generatingPortrait = true;
    errorMessage = '';
    try {
      const appearance = await fetchAppearance(character.id);
      const prompt = portraitPrompt(appearance || `character named ${character.name}`);
      const generatedUrl = await generateImage(prompt);
      const savedUrl = await persistImage(generatedUrl);
      await appendMessage('assistant', '自画像を生成してみたよ。これが今のわたしのイメージ。', savedUrl);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      generatingPortrait = false;
    }
  }

  async function saveMemory(nextMemory: CharacterMemory = memory): Promise<void> {
    if (!character) return;
    savingMemory = true;
    errorMessage = '';
    try {
      const response = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/memory`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(nextMemory),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'Memory save failed');
      memory = data.memory;
      updatedAt = data.updatedAt ?? updatedAt;
      markMemoryEntry();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      savingMemory = false;
    }
  }

  function markMemoryEntry(): void {
    characters = characters.map((entry) =>
      entry.id === selectedId ? { ...entry, hasMemoryEntry: true, updatedAt } : entry,
    );
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

  function updateMemoryList(
    key: keyof CharacterMemory,
    value: string,
  ): void {
    memory = {
      ...memory,
      [key]: value.split(/\r?\n|、/).map((item) => item.trim()).filter(Boolean),
    };
  }

  async function fetchAppearance(id: string): Promise<string> {
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(id)}`);
      if (!response.ok) return '';
      const data = await response.json();
      const list = data?.character?.characterBible?.characters;
      if (!Array.isArray(list) || list.length === 0) return '';
      const match = list.find((entry) => String(entry?.id ?? '').toLowerCase() === id.toLowerCase());
      const appearance = (match ?? list[0])?.appearance;
      return typeof appearance === 'string' ? appearance.trim() : '';
    } catch {
      return '';
    }
  }

  async function injectToLab(): Promise<void> {
    if (!character || injecting) return;
    injecting = true;
    errorMessage = '';
    try {
      const appearance = await fetchAppearance(character.id);
      const payload = {
        id: character.id,
        name: character.name,
        personality: memory.personality,
        speechStyle: memory.speechStyle,
        likes: memory.likes,
        dislikes: memory.dislikes,
        appearance,
      };
      sessionStorage.setItem(LAB_INJECT_MEMORY_KEY, JSON.stringify(payload));
      window.location.href = `/lab?injectMemory=${encodeURIComponent(character.id)}`;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      injecting = false;
    }
  }

  async function clearChat(): Promise<void> {
    if (!character || !confirm('このキャラクターの会話ログを削除しますか？')) return;
    const response = await fetch(`/api/character-memory/${encodeURIComponent(character.id)}/chat`, {
      method: 'DELETE',
    });
    if (response.ok) messages = [];
  }
</script>

<svelte:head>
  <title>CHARACTER MEMORY CHAT | AI VTuber</title>
</svelte:head>

<div class="chat-page">
  <header>
    <a href="/characters">← CHARACTER LIBRARY</a>
    <div>
      <p>INDEPENDENT MEMORY STORE / character-memory.json</p>
      <h1>CHARACTER MEMORY CHAT</h1>
    </div>
    <button onclick={clearChat} disabled={!character || messages.length === 0}>ログ削除</button>
  </header>

  {#if errorMessage}<div class="error-message">{errorMessage}</div>{/if}

  <main>
    <aside class="select-panel">
      <p class="panel-label">CHARACTER</p>
      {#if loadingList}
        <div class="hint">読み込み中...</div>
      {:else if characters.length === 0}
        <div class="hint">キャラクターがありません。</div>
      {:else}
        <ul class="character-list">
          {#each characters as item (item.id)}
            <li>
              <button
                class="character-item"
                class:active={item.id === selectedId}
                onclick={() => selectCharacter(item.id)}
              >
                <span class="character-name">{item.name}</span>
                {#if item.role}<span class="character-role">{item.role}</span>{/if}
                {#if item.hasMemoryEntry}<span class="memory-flag">MEM</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </aside>

    {#if loadingCharacter}
      <section class="conversation-panel"><div class="hint center">読み込み中...</div></section>
    {:else if character}
      <section class="conversation-panel">
        <div class="character-head">
          <div class="portrait">
            {#if imageDataUrl}<img src={imageDataUrl} alt={character.name} />{:else}<span>NO IMAGE</span>{/if}
          </div>
          <div class="head-info">
            <h2>{character.name}</h2>
            <div class="ai-chip" title="このキャラクターのAI（Personality Engine）">
              <span class="ai-icon">{routedProvider.icon}</span>
              <span class="ai-label">{routedProvider.label}</span>
              {#if !routedProvider.implemented}<span class="ai-pending">未実装</span>{/if}
            </div>
            {#if character.role}<div class="role"><span class="role-tag">🏷️</span>{character.role}</div>{/if}
            {#if character.description}<p class="desc">{character.description}</p>{/if}
          </div>
        </div>
        <div class="messages">
          {#if messages.length === 0}
            <div class="hint center">{character.name}との会話を始めてください。</div>
          {/if}
          {#each messages as message (message.id)}
            <!-- LABチャット同様の2カラム: [顔アイコン+名前+AIモデル] [吹き出し] -->
            <article class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
              <div class="msg-id">
                <div class="msg-avatar">
                  {#if message.role === 'assistant'}
                    {#if imageDataUrl}
                      <img src={imageDataUrl} alt={character.name} />
                    {:else}
                      <span class="msg-avatar-fallback">{character.name.slice(0, 1)}</span>
                    {/if}
                  {:else}
                    <span class="msg-avatar-fallback user-face">👤</span>
                  {/if}
                </div>
                {#if message.role === 'assistant'}
                  <span class="msg-name">{character.name}</span>
                  <span class="msg-ai" class:pending={!routedProvider.implemented}>
                    <span class="msg-ai-icon">{routedProvider.icon}</span>{routedProvider.label}
                  </span>
                {:else}
                  <span class="msg-name">YOU</span>
                {/if}
              </div>
              <div class="msg-bubble">
                {#if message.imageUrl}
                  <img class="message-image" src={message.imageUrl} alt="attached" />
                {/if}
                {#if message.text}<div class="bubble-text">{message.text}</div>{/if}
              </div>
            </article>
          {/each}
          {#if sending}<div class="hint center">{character.name} is thinking...</div>{/if}
          {#if generatingPortrait}<div class="hint center">{character.name} is drawing...</div>{/if}
        </div>
        <div class="composer">
          {#if pendingImage}
            <div class="pending-image">
              <img src={pendingImage} alt="pending" />
              <button class="remove-pending" onclick={() => (pendingImage = '')}>×</button>
            </div>
          {/if}
          <div class="composer-row">
            <textarea
              bind:value={inputText}
              rows="3"
              placeholder={`◢ TALK TO ${character.name.toUpperCase()}...`}
              onkeydown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void sendMessage();
              }}
            ></textarea>
            <div class="composer-actions">
              <label class="attach-button">
                画像
                <input type="file" accept="image/*" onchange={onPickImage} hidden />
              </label>
              <button onclick={sendMessage} disabled={sending || (!inputText.trim() && !pendingImage)}>送信</button>
            </div>
          </div>
          <button
            class="portrait-button"
            onclick={generatePortrait}
            disabled={generatingPortrait}
          >
            {generatingPortrait ? '自画像生成中...' : '自画像生成テスト'}
          </button>
        </div>
      </section>

      <aside class="memory-panel">
        <div class="memory-header">
          <div>
            <p class="panel-label">CHARACTER MEMORY</p>
            <h2>成長パラメータ</h2>
          </div>
          <button onclick={updateMemoryFromHistory} disabled={analyzing || messages.length === 0}>
            {analyzing ? '解析中...' : '履歴から更新'}
          </button>
        </div>

        <!-- 🧠 Growth System V3: 成長レーダー（絵文字ラベル＋横バー＋数値）。送信時にユーザー文章で自動変化 -->
        <section class="growth-system">
          <p class="growth-title">🧠 Growth System</p>
          {#each GROWTH_PARAMS as param (param.key)}
            <div class="growth-row">
              <span class="growth-name"><span class="growth-icon">{param.icon}</span>{param.label}</span>
              <div class="growth-bar"><div class="growth-fill" style={`width:${growthValues[param.key]}%`}></div></div>
              <span class="growth-value">{growthValues[param.key]}</span>
            </div>
          {/each}
        </section>

        <!-- V4: Personality Type（Growthの下に表示。数値変更・Memory保存なし） -->
        <section class="ai-type">
          <p class="ai-type-label">AI TYPE</p>
          <div class="ai-type-main">
            <span class="ai-type-icon">{personalityType.icon}</span>
            <span class="ai-type-name">{personalityType.name}</span>
            <span class="ai-type-sub">{personalityType.subtitle}</span>
          </div>
          <p class="ai-type-desc">説明：{personalityType.description}</p>
        </section>

        <p class="section-divider">会話メモリ</p>
        <label><span>性格</span><textarea rows="4" value={memory.personality.join('\n')} oninput={(e) => updateMemoryList('personality', e.currentTarget.value)}></textarea></label>
        <label><span>口調</span><textarea rows="4" value={memory.speechStyle.join('\n')} oninput={(e) => updateMemoryList('speechStyle', e.currentTarget.value)}></textarea></label>
        <label><span>好き</span><textarea rows="3" value={memory.likes.join('\n')} oninput={(e) => updateMemoryList('likes', e.currentTarget.value)}></textarea></label>
        <label><span>嫌い</span><textarea rows="3" value={memory.dislikes.join('\n')} oninput={(e) => updateMemoryList('dislikes', e.currentTarget.value)}></textarea></label>
        <button class="save-memory" onclick={() => saveMemory()} disabled={savingMemory}>
          {savingMemory ? '保存中...' : 'Memoryを保存'}
        </button>
        <button class="inject-lab" onclick={injectToLab} disabled={injecting}>
          {injecting ? '投入中...' : 'Lab Chatへ投入'}
        </button>
        <p class="inject-note">投入時のみ 性格・口調・好き・嫌い・外見 をコピーします（自動同期なし）。</p>
        {#if updatedAt}<small>UPDATED: {new Date(updatedAt).toLocaleString('ja-JP')}</small>{/if}

        {#if growthHistory.length > 0}
          <!-- 📈 Growth History: 最新5件のみ（in-memory／永続化なし）。最新を上に表示・スクロール可 -->
          <section class="growth-history">
            <p class="growth-history-title">📈 Growth History</p>
            <div class="growth-history-list">
              {#each growthHistory as item (item.id)}
                <div class="growth-history-card">
                  <div class="ghc-head">
                    <span class="ghc-time">{item.time}</span>
                    <span class="ghc-msg">💬 {item.message}</span>
                  </div>
                  <div class="ghc-deltas">
                    {#each item.changes as change (change.label)}
                      <span class="ghc-delta">{change.icon} {change.label} {change.amount > 0 ? '+' : ''}{change.amount}</span>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </section>
        {/if}
      </aside>
    {:else}
      <section class="conversation-panel">
        <div class="hint center">左の一覧からキャラクターを選択してください。</div>
      </section>
    {/if}
  </main>
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
  .select-panel, .conversation-panel, .memory-panel, .error-message {
    border: 1px solid rgba(148,163,184,.16); border-radius: 12px; background: rgba(8,15,32,.86);
  }
  .select-panel, .memory-panel { padding: 14px; align-self: start; }
  .panel-label { color: #22d3ee; font-size: 8px; letter-spacing: .15em; margin: 0 0 10px; }
  .character-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: calc(100vh - 180px); overflow-y: auto; }
  .character-item { width: 100%; display: flex; align-items: center; gap: 6px; padding: 9px 10px; text-align: left; }
  .character-item.active { border-color: rgba(34,211,238,.5); background: rgba(34,211,238,.1); }
  .character-name { font-size: 12px; color: #e2e8f0; }
  .character-role { font-size: 9px; color: #fbbf24; }
  .memory-flag { margin-left: auto; font-size: 7px; font-weight: 800; color: #fde68a; letter-spacing: .1em; }
  .conversation-panel { min-height: calc(100vh - 120px); display: grid; grid-template-rows: auto 1fr auto; overflow: hidden; }
  .character-head {
    display: flex;
    gap: 14px;
    padding: 16px;
    border-bottom: 1px solid rgba(34,211,238,.2);
    background: linear-gradient(180deg, rgba(34,211,238,.06), transparent);
  }
  .character-head h2 { margin: 0 0 4px; font-size: 19px; letter-spacing: .02em; text-shadow: 0 0 10px rgba(34,211,238,.35); }
  .head-info { min-width: 0; }
  .portrait {
    position: relative;
    width: 72px;
    height: 72px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 14px;
    background: #020617;
    color: #475569;
    font-size: 8px;
    border: 1px solid rgba(34,211,238,.45);
    box-shadow: 0 0 16px rgba(34,211,238,.35), inset 0 0 10px rgba(34,211,238,.12);
  }
  .portrait img { width: 100%; height: 100%; object-fit: cover; border-radius: 13px; }
  .role { display: inline-flex; align-items: center; gap: 5px; color: #fbbf24; font-size: 12px; font-weight: 700; }
  .role-tag { font-size: 11px; }
  .desc { color: #94a3b8; font-size: 11px; line-height: 1.5; margin: 5px 0 0; }
  .ai-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 2px 0 5px;
    padding: 3px 9px;
    border: 1px solid rgba(34, 211, 238, 0.35);
    border-radius: 999px;
    background: rgba(34, 211, 238, 0.1);
    box-shadow: 0 0 10px rgba(34, 211, 238, 0.25);
  }
  .ai-icon { font-size: 13px; line-height: 1; }
  .ai-label { color: #a5f3fc; font-size: 11px; font-weight: 800; letter-spacing: 0.02em; }
  .ai-pending {
    margin-left: 2px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.18);
    color: #94a3b8;
    font-size: 8px;
    font-weight: 800;
  }
  .messages { padding: 16px; overflow-y: auto; display: flex; flex-direction: column; }
  /* ① 2カラム構造: [顔アイコン+名前+AIモデル] [吹き出し] */
  article { display: flex; gap: 12px; align-items: flex-start; max-width: 90%; margin-bottom: 20px; }
  article.assistant { align-self: flex-start; }
  article.user { align-self: flex-end; flex-direction: row-reverse; }

  /* 左カラム: アイコン → 名前 → AIモデル の縦積み */
  .msg-id { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; width: 92px; }

  /* 顔アイコン 64〜80px（LABチャット同等） */
  .msg-avatar {
    flex-shrink: 0;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: #020617;
    border: 1.5px solid rgba(34,211,238,.5);
    box-shadow: 0 0 0 2px rgba(34,211,238,.07), 0 0 16px rgba(34,211,238,.34);
  }
  .msg-avatar img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .msg-avatar-fallback { color: #67e8f9; font-size: 26px; font-weight: 800; }
  article.user .msg-avatar {
    border-color: rgba(168,85,247,.55);
    box-shadow: 0 0 0 2px rgba(168,85,247,.07), 0 0 16px rgba(168,85,247,.32);
  }
  article.user .msg-avatar-fallback { font-size: 30px; }

  /* 右カラム: 吹き出し（サイバー調を維持） */
  .msg-bubble {
    min-width: 0;
    margin-top: 2px;
    padding: 11px 14px 12px;
    backdrop-filter: blur(2px);
  }
  article.assistant .msg-bubble {
    background: linear-gradient(135deg, rgba(34,211,238,.13), rgba(34,211,238,.05));
    border: 1px solid rgba(34,211,238,.38);
    border-radius: 4px 18px 18px 18px;
    box-shadow: 0 0 14px rgba(34,211,238,.28), inset 0 0 12px rgba(34,211,238,.07);
  }
  article.user .msg-bubble {
    background: linear-gradient(135deg, rgba(168,85,247,.16), rgba(168,85,247,.08));
    border: 1px solid rgba(168,85,247,.4);
    border-radius: 18px 4px 18px 18px;
    box-shadow: 0 0 14px rgba(168,85,247,.28), inset 0 0 12px rgba(168,85,247,.08);
  }

  /* アイコン下: キャラ名（中央寄せ） */
  .msg-name {
    max-width: 92px;
    text-align: center;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: .03em;
    color: #f8fafc;
    overflow-wrap: anywhere;
  }
  article.assistant .msg-name { color: #67e8f9; text-shadow: 0 0 8px rgba(34,211,238,.5); }
  article.user .msg-name { color: #d8b4fe; text-shadow: 0 0 8px rgba(168,85,247,.5); }
  /* 名前の下: AIモデルバッジ */
  .msg-ai {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 9px;
    border-radius: 999px;
    border: 1px solid rgba(34,211,238,.35);
    background: rgba(34,211,238,.1);
    box-shadow: 0 0 8px rgba(34,211,238,.22);
    color: #a5f3fc;
    font-size: 10px;
    font-weight: 800;
  }
  .msg-ai.pending { border-color: rgba(148,163,184,.3); background: rgba(148,163,184,.12); color: #94a3b8; box-shadow: none; }
  .msg-ai-icon { font-size: 11px; line-height: 1; }

  /* ⑤ 本文 18px / 行間 1.8 */
  .bubble-text { font-size: 18px; line-height: 1.8; white-space: pre-wrap; word-break: break-word; }
  .hint { color: #64748b; font-size: 11px; }
  .hint.center { text-align: center; align-self: center; padding: 30px; }
  .message-image { display: block; max-width: 100%; max-height: 320px; margin-bottom: 6px; border-radius: 8px; border: 1px solid rgba(148,163,184,.2); }
  .composer { display: grid; gap: 8px; padding: 12px; border-top: 1px solid rgba(34,211,238,.2); background: linear-gradient(0deg, rgba(34,211,238,.05), transparent); }
  .composer-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
  .composer textarea {
    border-color: rgba(34,211,238,.35);
    border-radius: 12px;
    box-shadow: inset 0 0 10px rgba(34,211,238,.08);
    transition: border-color .15s, box-shadow .15s;
  }
  .composer textarea:focus {
    outline: none;
    border-color: rgba(34,211,238,.7);
    box-shadow: 0 0 14px rgba(34,211,238,.3), inset 0 0 10px rgba(34,211,238,.12);
  }
  .composer textarea::placeholder { color: #5b7e8a; font-weight: 700; letter-spacing: .08em; }
  .composer-actions { display: grid; gap: 6px; align-content: start; }
  .attach-button { display: grid; place-items: center; padding: 8px 12px; border: 1px solid rgba(34,211,238,.35); border-radius: 6px; color: #67e8f9; font-size: 10px; font-weight: 800; cursor: pointer; }
  .portrait-button { border-color: rgba(168,85,247,.45); background: rgba(168,85,247,.1); color: #d8b4fe; }
  .pending-image { position: relative; width: 96px; }
  .pending-image img { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(148,163,184,.25); }
  .remove-pending { position: absolute; top: -8px; right: -8px; width: 22px; height: 22px; padding: 0; border-radius: 50%; background: #0f172a; color: #fb7185; }
  textarea, button { border: 1px solid rgba(148,163,184,.22); border-radius: 6px; background: #020617; color: #e2e8f0; font: inherit; }
  textarea { width: 100%; padding: 8px; resize: vertical; box-sizing: border-box; }
  button { padding: 8px 12px; color: #a5f3fc; font-size: 10px; font-weight: 800; cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .4; }
  .memory-header { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
  .memory-header p, .memory-header h2 { margin: 0; }
  .memory-header h2 { margin-top: 3px; font-size: 15px; }

  /* 🧠 Growth System V1 — 固定値の数値バー */
  .growth-system {
    margin-top: 14px;
    padding: 12px;
    border: 1px solid rgba(34,211,238,.22);
    border-radius: 10px;
    background: rgba(34,211,238,.05);
  }
  .growth-title {
    margin: 0 0 10px;
    color: #67e8f9;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .08em;
    text-shadow: 0 0 8px rgba(34,211,238,.4);
  }
  .growth-row { display: grid; grid-template-columns: 76px 1fr 30px; align-items: center; gap: 8px; margin-top: 8px; }
  .growth-name { display: inline-flex; align-items: center; gap: 4px; color: #cbd5e1; font-size: 11px; font-weight: 700; }
  .growth-icon { font-size: 12px; line-height: 1; }
  .growth-bar {
    height: 8px;
    border-radius: 999px;
    background: rgba(148,163,184,.16);
    overflow: hidden;
    box-shadow: inset 0 0 6px rgba(2,6,23,.6);
  }
  .growth-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(34,211,238,.55), rgba(34,211,238,.95));
    box-shadow: 0 0 8px rgba(34,211,238,.5);
  }
  .growth-value { color: #a5f3fc; font-size: 11px; font-weight: 800; text-align: right; }

  /* V4: AI TYPE（Personality Type）カード */
  .ai-type {
    margin-top: 12px;
    padding: 12px;
    border: 1px solid rgba(168,85,247,.32);
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(168,85,247,.12), rgba(34,211,238,.05));
    box-shadow: 0 0 14px rgba(168,85,247,.22), inset 0 0 12px rgba(168,85,247,.06);
  }
  .ai-type-label { margin: 0 0 8px; color: #c4b5fd; font-size: 8px; font-weight: 800; letter-spacing: .18em; }
  .ai-type-main { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .ai-type-icon { font-size: 20px; line-height: 1; }
  .ai-type-name { color: #f8fafc; font-size: 18px; font-weight: 800; letter-spacing: .02em; text-shadow: 0 0 10px rgba(168,85,247,.5); }
  .ai-type-sub { color: #a5f3fc; font-size: 10px; font-weight: 700; }
  .ai-type-desc { margin: 8px 0 0; color: #cbd5e1; font-size: 11px; line-height: 1.6; }

  /* 📈 Growth History — 最新5件（in-memory）。サイバー調・ネオンシアン・カード・スクロール可 */
  .growth-history {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid rgba(34,211,238,.2);
  }
  .growth-history-title {
    margin: 0 0 10px;
    color: #67e8f9;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .08em;
    text-shadow: 0 0 8px rgba(34,211,238,.4);
  }
  .growth-history-list { display: grid; gap: 8px; max-height: 240px; overflow-y: auto; padding-right: 2px; }
  .growth-history-card {
    padding: 9px 11px;
    border: 1px solid rgba(34,211,238,.28);
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(34,211,238,.1), rgba(34,211,238,.03));
    box-shadow: 0 0 12px rgba(34,211,238,.18), inset 0 0 10px rgba(34,211,238,.05);
    animation: growth-history-in .2s ease-out;
  }
  .ghc-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
  .ghc-time { color: #22d3ee; font-size: 9px; font-weight: 800; letter-spacing: .1em; }
  .ghc-msg { color: #e2e8f0; font-size: 11px; font-weight: 700; overflow-wrap: anywhere; }
  .ghc-deltas { display: flex; flex-wrap: wrap; gap: 5px 8px; }
  .ghc-delta {
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(74,222,128,.32);
    background: rgba(74,222,128,.1);
    color: #86efac;
    font-size: 11px;
    font-weight: 800;
    text-shadow: 0 0 6px rgba(74,222,128,.4);
  }
  @keyframes growth-history-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .section-divider {
    margin: 16px 0 0;
    padding-top: 12px;
    border-top: 1px solid rgba(148,163,184,.16);
    color: #22d3ee;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .15em;
  }
  label { display: grid; gap: 4px; margin-top: 10px; }
  label span { color: #94a3b8; font-size: 9px; font-weight: 800; }
  .save-memory { width: 100%; margin-top: 12px; border-color: rgba(251,191,36,.35); color: #fde68a; }
  .inject-lab { width: 100%; margin-top: 8px; border-color: rgba(168,85,247,.45); background: rgba(168,85,247,.1); color: #d8b4fe; }
  .inject-note { margin: 8px 0 0; color: #64748b; font-size: 8px; line-height: 1.5; }
  small { display: block; margin-top: 8px; color: #64748b; font-size: 8px; text-align: right; }
  .error-message { max-width: 1500px; margin: 0 auto 14px; padding: 10px; color: #fb7185; }
  @media (max-width: 1050px) { main { grid-template-columns: 200px 1fr; } .memory-panel { grid-column: 1 / -1; } }
  @media (max-width: 700px) { .chat-page { padding: 14px; } header { grid-template-columns: 1fr; align-items: start; } header div { text-align: left; } header button { justify-self: start; } main { grid-template-columns: 1fr; } .conversation-panel { min-height: 65vh; } }
</style>
