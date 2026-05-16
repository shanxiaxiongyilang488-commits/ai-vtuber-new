<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		EchoChatEngine,
		NoopSpeechEngine,
		OllamaChatEngine,
		testOllamaConnection
	} from '$lib/chat/engines';
	import type { ChatEngine, ChatMessage, LocalLlmSettings, LongTermMemory } from '$lib/chat/types';
	import { defaultCharacter } from '$lib/character';
	import {
		clearMessages,
		createId,
		deleteLongTermMemory,
		getLongTermMemories,
		getMessages,
		saveLongTermMemory,
		saveMessage
	} from '$lib/db';
	import { getShortTermMemory, SHORT_TERM_MEMORY_LIMIT } from '$lib/memory';
	import { defaultLocalLlmSettings, loadLocalLlmSettings, saveLocalLlmSettings } from '$lib/settings';

	let messages: ChatMessage[] = [];
	let memories: LongTermMemory[] = [];
	let draft = '';
	let memoryTitle = '';
	let memoryContent = '';
	let memoryTags = '';
	let activePanel: 'chat' | 'memory' | 'settings' = 'chat';
	let isSending = false;
	let isReady = false;
	let isTestingConnection = false;
	let errorMessage = '';
	let connectionMessage = '';
	let localLlmSettings: LocalLlmSettings = defaultLocalLlmSettings;
	let scrollAnchor: HTMLDivElement;

	const character = defaultCharacter;
	const speechEngine = new NoopSpeechEngine();

	$: chatEngine = createChatEngine(localLlmSettings);
	$: shortTermMemory = getShortTermMemory(messages);
	$: canSend = draft.trim().length > 0 && !isSending;
	$: canSaveMemory = memoryTitle.trim().length > 0 && memoryContent.trim().length > 0;

	onMount(async () => {
		try {
			localLlmSettings = loadLocalLlmSettings();

			const [storedMessages, storedMemories] = await Promise.all([
				getMessages(),
				getLongTermMemories()
			]);

			messages = storedMessages;
			memories = storedMemories;
			isReady = true;

			if (messages.length === 0) {
				await appendMessage({
					id: createId('msg'),
					role: 'assistant',
					content: `${character.name}だよ。ここに会話を残しながら、少しずつあなたのことを覚えていくね。`,
					createdAt: Date.now()
				});
			}
		} catch (error) {
			errorMessage = getErrorMessage(error);
		}
	});

	async function appendMessage(message: ChatMessage) {
		messages = [...messages, message];
		await saveMessage(message);
		await tick();
		scrollAnchor?.scrollIntoView({ block: 'end' });
	}

	async function sendMessage() {
		const input = draft.trim();
		if (!input || isSending) return;

		errorMessage = '';
		isSending = true;
		draft = '';

		const userMessage: ChatMessage = {
			id: createId('msg'),
			role: 'user',
			content: input,
			createdAt: Date.now()
		};

		try {
			await appendMessage(userMessage);

			const reply = await chatEngine.reply(input, {
				characterName: character.name,
				shortTermMemory: getShortTermMemory([...messages, userMessage]),
				longTermMemories: memories
			});

			const assistantMessage: ChatMessage = {
				id: createId('msg'),
				role: 'assistant',
				content: reply,
				createdAt: Date.now()
			};

			await appendMessage(assistantMessage);
			await speechEngine.speak(reply);
		} catch (error) {
			errorMessage = getErrorMessage(error);
		} finally {
			isSending = false;
		}
	}

	function updateLocalLlmSettings(settings: LocalLlmSettings) {
		localLlmSettings = settings;
		saveLocalLlmSettings(settings);
		connectionMessage = '';
	}

	async function testConnection() {
		isTestingConnection = true;
		connectionMessage = '';
		errorMessage = '';

		try {
			await testOllamaConnection(localLlmSettings);
			connectionMessage = 'Ollamaに接続できました。';
		} catch (error) {
			errorMessage = `${getErrorMessage(error)} Ollama側でブラウザからのアクセスを許可する必要がある場合があります。`;
		} finally {
			isTestingConnection = false;
		}
	}

	function createChatEngine(settings: LocalLlmSettings): ChatEngine {
		return settings.enabled ? new OllamaChatEngine(settings) : new EchoChatEngine();
	}

	async function saveMemory() {
		if (!canSaveMemory) return;

		const now = Date.now();
		const memory: LongTermMemory = {
			id: createId('mem'),
			title: memoryTitle.trim(),
			content: memoryContent.trim(),
			tags: memoryTags
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean),
			createdAt: now,
			updatedAt: now
		};

		await saveLongTermMemory(memory);
		memories = [memory, ...memories];
		memoryTitle = '';
		memoryContent = '';
		memoryTags = '';
	}

	async function removeMemory(id: string) {
		await deleteLongTermMemory(id);
		memories = memories.filter((memory) => memory.id !== id);
	}

	async function resetConversation() {
		await clearMessages();
		messages = [];
		await appendMessage({
			id: createId('msg'),
			role: 'assistant',
			content: '会話履歴をリセットしたよ。ここからまた始めよう。',
			createdAt: Date.now()
		});
	}

	function submitOnEnter(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void sendMessage();
		}
	}

	function getErrorMessage(error: unknown) {
		return error instanceof Error ? error.message : '予期しないエラーが発生しました。';
	}
</script>

<svelte:head>
	<title>{character.name} | Mobile Chat</title>
	<meta
		name="description"
		content="スマホで動く、記憶付きAIパートナーの最小PWAチャット"
	/>
</svelte:head>

<main class="app-shell">
	<header class="topbar">
		<div>
			<p class="eyebrow">AI Partner</p>
			<h1>{character.name}</h1>
		</div>
		<div class="status" aria-label="保存状態">
			<span class:online={isReady}></span>
			IndexedDB
		</div>
	</header>

	<nav class="tabs" aria-label="表示切り替え">
		<button class:active={activePanel === 'chat'} type="button" on:click={() => (activePanel = 'chat')}>
			会話
		</button>
		<button
			class:active={activePanel === 'memory'}
			type="button"
			on:click={() => (activePanel = 'memory')}
		>
			記憶
		</button>
		<button
			class:active={activePanel === 'settings'}
			type="button"
			on:click={() => (activePanel = 'settings')}
		>
			設定
		</button>
	</nav>

	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{/if}

	{#if activePanel === 'chat'}
		<section class="chat-panel" aria-label="チャット">
			<div class="memory-strip">
				<span>短期記憶 {shortTermMemory.length}/{SHORT_TERM_MEMORY_LIMIT}</span>
				<span>長期記憶 {memories.length}</span>
				<span>{chatEngine.label}</span>
			</div>

			<div class="message-list" aria-live="polite">
				{#each messages as message (message.id)}
					<article class:assistant={message.role === 'assistant'} class:user={message.role === 'user'} class="message">
						<div class="bubble">
							<p>{message.content}</p>
							<time>{new Date(message.createdAt).toLocaleTimeString('ja-JP', {
								hour: '2-digit',
								minute: '2-digit'
							})}</time>
						</div>
					</article>
				{/each}

				{#if isSending}
					<article class="message assistant">
						<div class="bubble typing">考え中...</div>
					</article>
				{/if}

				<div bind:this={scrollAnchor}></div>
			</div>

			<form class="composer" on:submit|preventDefault={sendMessage}>
				<textarea
					bind:value={draft}
					on:keydown={submitOnEnter}
					placeholder={`${character.name}に話しかける`}
					rows="1"
					aria-label="メッセージ"
				></textarea>
				<button type="submit" disabled={!canSend}>送信</button>
			</form>

			<button class="ghost-button" type="button" on:click={resetConversation}>会話をリセット</button>
		</section>
	{:else if activePanel === 'memory'}
		<section class="memory-panel" aria-label="長期記憶">
			<form class="memory-form" on:submit|preventDefault={saveMemory}>
				<label>
					<span>タイトル</span>
					<input bind:value={memoryTitle} placeholder="例: 好きな呼び方" />
				</label>
				<label>
					<span>内容</span>
					<textarea bind:value={memoryContent} placeholder="覚えておきたいこと" rows="4"></textarea>
				</label>
				<label>
					<span>タグ</span>
					<input bind:value={memoryTags} placeholder="profile, preference" />
				</label>
				<button type="submit" disabled={!canSaveMemory}>記憶する</button>
			</form>

			<div class="memory-list">
				{#if memories.length === 0}
					<p class="empty">まだ長期記憶はありません。</p>
				{/if}

				{#each memories as memory (memory.id)}
					<article class="memory-card">
						<div>
							<h2>{memory.title}</h2>
							<p>{memory.content}</p>
							{#if memory.tags.length > 0}
								<div class="tags">
									{#each memory.tags as tag}
										<span>{tag}</span>
									{/each}
								</div>
							{/if}
						</div>
						<button type="button" aria-label={`${memory.title}を削除`} on:click={() => removeMemory(memory.id)}>
							削除
						</button>
					</article>
				{/each}
			</div>
		</section>
	{:else}
		<section class="settings-panel" aria-label="ローカルLLM設定">
			<div class="settings-card">
				<div class="setting-row">
					<div>
						<h2>ローカルLLM</h2>
						<p>{localLlmSettings.enabled ? 'Ollamaへ送信します' : '仮返答エンジンを使います'}</p>
					</div>
					<label class="switch">
						<input
							type="checkbox"
							checked={localLlmSettings.enabled}
							on:change={(event) =>
								updateLocalLlmSettings({
									...localLlmSettings,
									enabled: event.currentTarget.checked
								})}
						/>
						<span></span>
					</label>
				</div>

				<label>
					<span>エンドポイント</span>
					<input
						value={localLlmSettings.endpoint}
						placeholder="http://localhost:11434"
						on:input={(event) =>
							updateLocalLlmSettings({
								...localLlmSettings,
								endpoint: event.currentTarget.value
							})}
					/>
				</label>

				<label>
					<span>モデル</span>
					<input
						value={localLlmSettings.model}
						placeholder="llama3.1"
						on:input={(event) =>
							updateLocalLlmSettings({
								...localLlmSettings,
								model: event.currentTarget.value
							})}
					/>
				</label>

				<label>
					<span>Temperature {localLlmSettings.temperature.toFixed(1)}</span>
					<input
						type="range"
						min="0"
						max="1.5"
						step="0.1"
						value={localLlmSettings.temperature}
						on:input={(event) =>
							updateLocalLlmSettings({
								...localLlmSettings,
								temperature: Number(event.currentTarget.value)
							})}
					/>
				</label>

				<button type="button" on:click={testConnection} disabled={isTestingConnection}>
					{isTestingConnection ? '確認中...' : '接続テスト'}
				</button>

				{#if connectionMessage}
					<p class="success">{connectionMessage}</p>
				{/if}
			</div>
		</section>
	{/if}
</main>
