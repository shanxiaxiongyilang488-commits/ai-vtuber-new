<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		clearMobileMessages,
		deleteMobileLongTermMemory,
		getMobileLongTermMemories,
		getMobileMessages,
		getShortTermLimit,
		getShortTermMessages,
		loadMobileChatSettings,
		saveMobileChatSettings,
		saveMobileLongTermMemory,
		saveMobileMessage
	} from '$lib/mobile-chat/db';
	import { createMobileChatId } from '$lib/mobile-chat/id';
	import { speakMobileChat } from '$lib/mobile-chat/tts';
	import type {
		MobileChatMessage,
		MobileChatSettings,
		MobileLongTermMemory
	} from '$lib/mobile-chat/types';
	import { defaultMobileChatSettings } from '$lib/mobile-chat/types';

	type Panel = 'chat' | 'memory' | 'settings';

	let messages = $state<MobileChatMessage[]>([]);
	let memories = $state<MobileLongTermMemory[]>([]);
	let settings = $state<MobileChatSettings>(defaultMobileChatSettings);
	let inputText = $state('');
	let memoryTitle = $state('');
	let memoryContent = $state('');
	let memoryTags = $state('');
	let activePanel = $state<Panel>('chat');
	let isLoading = $state(false);
	let isReady = $state(false);
	let statusText = $state('');
	let messagesEl = $state<HTMLDivElement | null>(null);

	const shortTermLimit = getShortTermLimit();
	const canSend = $derived(inputText.trim().length > 0 && !isLoading);
	const shortTermMessages = $derived(getShortTermMessages(messages));
	const canSaveMemory = $derived(memoryTitle.trim().length > 0 && memoryContent.trim().length > 0);

	onMount(async () => {
		settings = loadMobileChatSettings();
		const [storedMessages, storedMemories] = await Promise.all([
			getMobileMessages(),
			getMobileLongTermMemories()
		]);

		memories = storedMemories;
		messages = storedMessages;
		isReady = true;

		if (messages.length === 0) {
			await appendMessage({
				id: createMobileChatId('msg'),
				role: 'assistant',
				speaker: settings.characterName,
				text: '起動したよ。今日のこと、少しずつ聞かせて。',
				createdAt: Date.now()
			});
		}

		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch(() => {
				statusText = 'PWA登録に失敗しました';
			});
		}
	});

	async function appendMessage(message: MobileChatMessage) {
		messages = [...messages, message];
		await saveMobileMessage(message);
		await tick();
		messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
	}

	async function sendMessage() {
		const text = inputText.trim();
		if (!text || isLoading) return;

		statusText = '';
		inputText = '';
		isLoading = true;

		const userMessage: MobileChatMessage = {
			id: createMobileChatId('msg'),
			role: 'user',
			speaker: 'あなた',
			text,
			createdAt: Date.now()
		};

		try {
			await appendMessage(userMessage);

			const res = await fetch('/api/mobile-chat/reply', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					input: text,
					settings,
					shortTermMessages: getShortTermMessages([...messages, userMessage]),
					longTermMemories: memories
				})
			});

			const data = (await res.json()) as { text?: string; error?: string };
			if (!res.ok) throw new Error(data.error || '返信の生成に失敗しました');

			const reply = data.text?.trim() || '……ごめん、うまく言葉にならなかった。';
			const assistantMessage: MobileChatMessage = {
				id: createMobileChatId('msg'),
				role: 'assistant',
				speaker: settings.characterName,
				text: reply,
				createdAt: Date.now()
			};

			await appendMessage(assistantMessage);
			void speakMobileChat(reply, settings).catch((error) => {
				statusText = error instanceof Error ? error.message : '音声再生に失敗しました';
			});
		} catch (error) {
			statusText = error instanceof Error ? error.message : '送信に失敗しました';
		} finally {
			isLoading = false;
		}
	}

	async function resetChat() {
		await clearMobileMessages();
		messages = [];
		await appendMessage({
			id: createMobileChatId('msg'),
			role: 'assistant',
			speaker: settings.characterName,
			text: '履歴をリセットしたよ。ここからまた話そう。',
			createdAt: Date.now()
		});
	}

	async function saveMemory() {
		if (!canSaveMemory) return;

		const now = Date.now();
		const memory: MobileLongTermMemory = {
			id: createMobileChatId('mem'),
			title: memoryTitle.trim(),
			content: memoryContent.trim(),
			tags: memoryTags
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean),
			createdAt: now,
			updatedAt: now
		};

		await saveMobileLongTermMemory(memory);
		memories = [memory, ...memories];
		memoryTitle = '';
		memoryContent = '';
		memoryTags = '';
	}

	async function deleteMemory(id: string) {
		await deleteMobileLongTermMemory(id);
		memories = memories.filter((memory) => memory.id !== id);
	}

	function updateSettings(next: MobileChatSettings) {
		settings = next;
		saveMobileChatSettings(settings);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void sendMessage();
		}
	}
</script>

<svelte:head>
	<title>{settings.characterName} Mobile Chat</title>
	<meta name="theme-color" content="#0a0f1a" />
	<meta name="description" content="ai-vtuber mobile chat" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="icon" href="/icons/mobile-chat.svg" />
</svelte:head>

<div class="mobile-page">
	<header class="mobile-header">
		<div class="character-orb" aria-hidden="true">◇</div>
		<div class="header-main">
			<div class="overline">MOBILE LINK</div>
			<h1>{settings.characterName}</h1>
		</div>
		<div class="live-pill" class:ready={isReady}>
			<span></span>
			{settings.aiEngine}
		</div>
	</header>

	<nav class="mobile-tabs" aria-label="mobile chat panels">
		<button class:active={activePanel === 'chat'} onclick={() => (activePanel = 'chat')}>Chat</button>
		<button class:active={activePanel === 'memory'} onclick={() => (activePanel = 'memory')}>Memory</button>
		<button class:active={activePanel === 'settings'} onclick={() => (activePanel = 'settings')}>Config</button>
	</nav>

	{#if statusText}
		<div class="status-banner">{statusText}</div>
	{/if}

	{#if activePanel === 'chat'}
		<section class="chat-stack">
			<div class="metrics">
				<span>Short {shortTermMessages.length}/{shortTermLimit}</span>
				<span>Long {memories.length}</span>
				<span>{settings.ttsProvider}</span>
			</div>

			<div class="messages" bind:this={messagesEl}>
				{#each messages as message (message.id)}
					{@const isAi = message.role === 'assistant'}
					<div class={`message-row ${isAi ? 'left' : 'right'}`}>
						<div class="avatar">{isAi ? '◇' : '●'}</div>
						<div class="bubble-wrap">
							<span class="speaker-name">{message.speaker}</span>
							<div class="bubble">{message.text}</div>
						</div>
					</div>
				{/each}

				{#if isLoading}
					<div class="message-row left">
						<div class="avatar">◇</div>
						<div class="bubble-wrap">
							<span class="speaker-name">{settings.characterName}</span>
							<div class="bubble loading-bubble">
								<span></span><span></span><span></span>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<form class="composer" onsubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
				<textarea
					bind:value={inputText}
					onkeydown={handleKeydown}
					placeholder="メッセージを入力"
					rows="1"
					disabled={isLoading}
				></textarea>
				<button disabled={!canSend}>送信</button>
			</form>

			<button class="plain-button" onclick={resetChat}>履歴リセット</button>
		</section>
	{:else if activePanel === 'memory'}
		<section class="panel-stack">
			<form class="memory-form" onsubmit={(event) => { event.preventDefault(); void saveMemory(); }}>
				<label>
					<span>Title</span>
					<input bind:value={memoryTitle} placeholder="好きな呼び方" />
				</label>
				<label>
					<span>Content</span>
					<textarea bind:value={memoryContent} rows="4" placeholder="覚えておく内容"></textarea>
				</label>
				<label>
					<span>Tags</span>
					<input bind:value={memoryTags} placeholder="profile, preference" />
				</label>
				<button disabled={!canSaveMemory}>記憶する</button>
			</form>

			<div class="memory-list">
				{#if memories.length === 0}
					<div class="empty-panel">長期記憶はまだありません</div>
				{/if}

				{#each memories as memory (memory.id)}
					<article class="memory-card">
						<div>
							<h2>{memory.title}</h2>
							<p>{memory.content}</p>
							<div class="tag-row">
								{#each memory.tags as tag}
									<span>{tag}</span>
								{/each}
							</div>
						</div>
						<button onclick={() => deleteMemory(memory.id)}>削除</button>
					</article>
				{/each}
			</div>
		</section>
	{:else}
		<section class="panel-stack">
			<div class="settings-grid">
				<label>
					<span>Character</span>
					<input
						value={settings.characterName}
						oninput={(event) =>
							updateSettings({ ...settings, characterName: event.currentTarget.value || 'リセア' })}
					/>
				</label>

				<label>
					<span>AI</span>
					<select
						value={settings.aiEngine}
						onchange={(event) =>
							updateSettings({
								...settings,
								aiEngine: event.currentTarget.value as MobileChatSettings['aiEngine']
							})}
					>
						<option value="ollama">Ollama</option>
						<option value="lmstudio">LM Studio</option>
					</select>
				</label>

				<label>
					<span>Model</span>
					<input
						value={settings.model}
						oninput={(event) => updateSettings({ ...settings, model: event.currentTarget.value })}
					/>
				</label>

				<label>
					<span>System Prompt</span>
					<textarea
						rows="5"
						value={settings.systemPrompt}
						oninput={(event) =>
							updateSettings({ ...settings, systemPrompt: event.currentTarget.value })}
					></textarea>
				</label>

				<label>
					<span>TTS</span>
					<select
						value={settings.ttsProvider}
						onchange={(event) =>
							updateSettings({
								...settings,
								ttsProvider: event.currentTarget.value as MobileChatSettings['ttsProvider']
							})}
					>
						<option value="none">None</option>
						<option value="irodori">Irodori TTS</option>
						<option value="voicevox">VOICEVOX</option>
					</select>
				</label>

				{#if settings.ttsProvider === 'voicevox'}
					<label>
						<span>VOICEVOX URL</span>
						<input
							value={settings.voicevoxEndpoint}
							oninput={(event) =>
								updateSettings({ ...settings, voicevoxEndpoint: event.currentTarget.value })}
						/>
					</label>
					<label>
						<span>Speaker ID</span>
						<input
							type="number"
							value={settings.voicevoxSpeakerId}
							oninput={(event) =>
								updateSettings({
									...settings,
									voicevoxSpeakerId: Number(event.currentTarget.value)
								})}
						/>
					</label>
				{/if}

				{#if settings.ttsProvider === 'irodori'}
					<label>
						<span>Irodori URL</span>
						<input
							value={settings.irodoriEndpoint}
							oninput={(event) =>
								updateSettings({ ...settings, irodoriEndpoint: event.currentTarget.value })}
						/>
					</label>
					<label>
						<span>Speaker</span>
						<input
							value={settings.irodoriSpeakerId}
							oninput={(event) =>
								updateSettings({ ...settings, irodoriSpeakerId: event.currentTarget.value })}
						/>
					</label>
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	:global(body) {
		background: #0a0f1a;
	}

	.mobile-page {
		display: flex;
		flex-direction: column;
		width: min(100%, 520px);
		min-height: 100svh;
		margin: 0 auto;
		padding: max(14px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom));
		background:
			radial-gradient(circle at 24px 20px, rgba(34, 211, 238, 0.17), transparent 190px),
			linear-gradient(180deg, #0a0f1a 0%, #111827 100%);
		color: #f8fafc;
	}

	.mobile-header {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 12px;
		align-items: center;
		padding: 2px 0 14px;
	}

	.character-orb,
	.avatar {
		display: grid;
		place-items: center;
		border: 1px solid rgba(34, 211, 238, 0.55);
		border-radius: 50%;
		background: rgba(15, 23, 42, 0.82);
		color: #22d3ee;
		box-shadow: 0 0 18px rgba(34, 211, 238, 0.22);
	}

	.character-orb {
		width: 44px;
		height: 44px;
	}

	.overline {
		color: #64748b;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.12em;
	}

	h1 {
		margin: 0;
		font-size: 1.42rem;
		line-height: 1.1;
		letter-spacing: 0;
	}

	.live-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 8px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 999px;
		color: #94a3b8;
		font-size: 0.72rem;
		font-weight: 800;
	}

	.live-pill span {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #64748b;
	}

	.live-pill.ready span {
		background: #22c55e;
	}

	.mobile-tabs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin-bottom: 12px;
	}

	button,
	input,
	select,
	textarea {
		font: inherit;
	}

	button {
		border: 0;
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.mobile-tabs button,
	.composer button,
	.memory-form button {
		min-height: 42px;
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.9);
		color: #cbd5e1;
		font-size: 0.86rem;
		font-weight: 900;
	}

	.mobile-tabs button {
		border: 1px solid rgba(34, 211, 238, 0.2);
	}

	.mobile-tabs button.active,
	.composer button,
	.memory-form button {
		background: linear-gradient(135deg, #22d3ee, #818cf8);
		color: #020617;
	}

	.status-banner {
		margin-bottom: 10px;
		padding: 10px 12px;
		border: 1px solid rgba(251, 113, 133, 0.35);
		border-radius: 8px;
		background: rgba(127, 29, 29, 0.35);
		color: #fecdd3;
		font-size: 0.84rem;
	}

	.chat-stack,
	.panel-stack {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
	}

	.metrics {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 10px;
	}

	.metrics span {
		padding: 6px 8px;
		border: 1px solid rgba(34, 211, 238, 0.16);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.7);
		color: #94a3b8;
		font-size: 0.72rem;
		font-weight: 800;
	}

	.messages {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 12px;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 0 12px;
	}

	.message-row {
		display: flex;
		align-items: flex-end;
		gap: 9px;
	}

	.message-row.right {
		flex-direction: row-reverse;
	}

	.avatar {
		width: 34px;
		height: 34px;
		flex: 0 0 auto;
		font-size: 0.76rem;
	}

	.message-row.right .avatar {
		border-color: rgba(168, 85, 247, 0.55);
		color: #c084fc;
		box-shadow: 0 0 18px rgba(168, 85, 247, 0.2);
	}

	.bubble-wrap {
		display: flex;
		flex-direction: column;
		max-width: min(82%, 390px);
	}

	.message-row.right .bubble-wrap {
		align-items: flex-end;
	}

	.speaker-name {
		margin-bottom: 3px;
		color: #22d3ee;
		font-size: 0.68rem;
		font-weight: 800;
	}

	.message-row.right .speaker-name {
		color: #c084fc;
	}

	.bubble {
		padding: 10px 12px;
		border: 1px solid rgba(34, 211, 238, 0.35);
		border-radius: 8px;
		background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.75));
		box-shadow: 0 0 18px rgba(34, 211, 238, 0.13);
		color: #e5f4ff;
		font-size: 0.92rem;
		line-height: 1.58;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}

	.message-row.right .bubble {
		border-color: rgba(168, 85, 247, 0.45);
		box-shadow: 0 0 18px rgba(168, 85, 247, 0.16);
	}

	.loading-bubble {
		display: inline-flex;
		gap: 5px;
		min-width: 58px;
	}

	.loading-bubble span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #22d3ee;
		animation: pulse 1s ease-in-out infinite;
	}

	.loading-bubble span:nth-child(2) {
		animation-delay: 0.16s;
	}

	.loading-bubble span:nth-child(3) {
		animation-delay: 0.32s;
	}

	.composer {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid rgba(34, 211, 238, 0.12);
	}

	textarea,
	input,
	select {
		width: 100%;
		border: 1px solid rgba(34, 211, 238, 0.2);
		border-radius: 8px;
		background: rgba(2, 6, 23, 0.66);
		color: #f8fafc;
		outline: none;
	}

	.composer textarea {
		min-height: 46px;
		max-height: 132px;
		padding: 11px 12px;
		resize: vertical;
	}

	.composer button {
		padding: 0 15px;
	}

	.plain-button {
		margin: 8px auto 0;
		padding: 9px 10px;
		background: transparent;
		color: #64748b;
		font-size: 0.78rem;
		font-weight: 800;
	}

	.memory-form,
	.settings-grid {
		display: grid;
		gap: 12px;
	}

	.memory-form,
	.settings-grid,
	.memory-card,
	.empty-panel {
		padding: 12px;
		border: 1px solid rgba(34, 211, 238, 0.14);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.72);
	}

	label {
		display: grid;
		gap: 6px;
		color: #94a3b8;
		font-size: 0.78rem;
		font-weight: 900;
	}

	input,
	select {
		min-height: 42px;
		padding: 9px 10px;
	}

	label textarea {
		padding: 10px;
		resize: vertical;
	}

	.memory-list {
		display: grid;
		gap: 10px;
		margin-top: 12px;
		overflow-y: auto;
	}

	.memory-card {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 10px;
		align-items: start;
	}

	.memory-card h2 {
		margin: 0 0 5px;
		font-size: 0.98rem;
		letter-spacing: 0;
	}

	.memory-card p,
	.empty-panel {
		color: #cbd5e1;
		font-size: 0.88rem;
		line-height: 1.5;
	}

	.memory-card button {
		padding: 7px 8px;
		border-radius: 8px;
		background: rgba(244, 63, 94, 0.18);
		color: #fecdd3;
		font-size: 0.76rem;
		font-weight: 900;
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}

	.tag-row span {
		padding: 3px 7px;
		border-radius: 999px;
		background: rgba(34, 211, 238, 0.13);
		color: #67e8f9;
		font-size: 0.68rem;
		font-weight: 800;
	}

	@keyframes pulse {
		0%,
		80%,
		100% {
			opacity: 0.3;
			transform: translateY(0);
		}
		40% {
			opacity: 1;
			transform: translateY(-5px);
		}
	}

	@media (min-width: 720px) {
		.mobile-page {
			min-height: min(100svh, 880px);
			margin-top: 16px;
			margin-bottom: 16px;
			border: 1px solid rgba(34, 211, 238, 0.14);
			border-radius: 8px;
		}
	}
</style>
