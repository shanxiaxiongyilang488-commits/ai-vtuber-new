<script lang="ts">
import { onMount } from 'svelte';
import CharacterSettingsModal from '$lib/components/CharacterSettingsModal.svelte';
import { createVoiceEngine } from '$lib/api/voiceEngine';
import type { Character } from '$lib/types/character';

// ================================
// 型
// ================================

type ChatMessage = {
  role: 'user' | 'ai';
  speaker: string;
  text: string;
  avatar?: string;
};

// ================================
// 状態（Svelte5対応）
// ================================

let messages = $state<ChatMessage[]>([]);
let inputText = $state('');
let isLoading = $state(false);

// ================================
// キャラ（単体モード）
// ================================

let character = $state<Character>({
  id: 'char1',
  name: 'ミュリィ',
  avatar: '/avatars/muryi.png',
  aiEngine: 'openai',
  voiceEngine: 'voicevox',
  voiceId: '',
  speakerId: 20,
  systemPrompt: '',
  ollamaModel: ''
});

// ================================
// 保存復元
// ================================

onMount(() => {
  const saved = localStorage.getItem('character');
  if (saved) {
    character = JSON.parse(saved);
  }
});

function saveCharacter() {
  localStorage.setItem('character', JSON.stringify(character));
}

// ================================
// モーダル
// ================================

let showSettings = $state(false);
let selectedCharacter = $state<Character | null>(null);

function openSettings() {
  selectedCharacter = { ...character };
  showSettings = true;
}

function closeSettings() {
  showSettings = false;
  selectedCharacter = null;
}

function handleCharacterSave(updated: Character) {
  character = { ...updated };
  saveCharacter();
  closeSettings();
}

// ================================
// 送信
// ================================

async function sendMessage() {
  const text = inputText.trim();
  if (!text || isLoading) return;

  messages = [
    ...messages,
    { role: 'user', speaker: 'ユーザー', text }
  ];

  inputText = '';
  isLoading = true;

        


  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        systemPrompt: character.systemPrompt,
        lastMessage: text,
        speakerName: character.name,
        listenerName: 'ユーザー',
        topic: text,
        engine: character.aiEngine,
        model: character.ollamaModel,
        voiceEngine: character.voiceEngine,
        voiceId: character.voiceId
      })
    });

    

    

    // 🎤 音声（型エラー回避）
    const data = await res.json();
    const reply: string = data.text ?? '';

// 音声（先）
if (character.voiceEngine !== 'none' && reply) {
  const voice = createVoiceEngine({
    voiceEngine: character.voiceEngine as any,
    voice: character.voice,
    voiceId: character.voiceId,
    speakerId: character.speakerId
  });

  voice.speak(reply);
}

// 表示（後）
setTimeout(() => {
  messages = [
    ...messages,
    {
      role: 'ai',
      speaker: character.name,
      text: reply,
      avatar: character.avatar
    }
  ];
}, 500);

      } catch (e) {
        console.error('❌ chat error', e);
      } finally {
        isLoading = false;
      }
}

// ================================
// Enter送信
// ================================

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}
</script>

<div class="page">
  <!-- 左：キャラ -->
  <div class="sidebar">
    <div class="char-card" onclick={openSettings}>
      <img src={character.avatar ?? '/avatars/default.png'} alt={character.name} />
      <p>{character.name}</p>

      <div class="char-meta">
        <div><span>AI</span><b>{character.aiEngine ?? '-'}</b></div>
        <div><span>VOICE</span><b>{character.voiceEngine ?? '-'}</b></div>
      </div>
    </div>

    <div class="status-box">
      <div class="status-title">● システム状態</div>
      <div class="status-row"><span>ステータス</span><b>{isLoading ? '応答中' : '待機中'}</b></div>
      <div class="status-row"><span>発言数</span><b>{messages.length}</b></div>
      <div class="status-row"><span>モード</span><b>対話型</b></div>
      <div class="hint">カードをクリックして設定を開く</div>
    </div>
  </div>

  <!-- 右：会話 -->
  <div class="main">
    <p class="count">件数: {messages.length}</p>

    <div class="messages">
      {#if messages.length === 0}
        <div class="empty-state">
          <div class="empty-icon">◈</div>
          <div class="empty-title">メッセージを入力して会話を開始してください</div>
          <div class="empty-sub">AWAITING INPUT — NEURAL LINK STANDBY</div>
        </div>
      {/if}

      {#each messages as msg}
        {@const isAi = msg.role === 'ai'}

        <div class={`message-row ${isAi ? 'left' : 'right'}`}>
          {#if isAi}
            <div class="avatar">
              {#if msg.avatar}
                <img src={msg.avatar} alt={msg.speaker} />
              {:else}
                🤖
              {/if}
            </div>

            <div class="bubble-wrap">
              <span class="speaker-name">{msg.speaker}</span>
              <div class="bubble">{msg.text}</div>
            </div>
          {:else}
            <div class="bubble-wrap right-wrap">
              <span class="speaker-name">{msg.speaker}</span>
              <div class="bubble">{msg.text}</div>
            </div>

            <div class="avatar">
              👤
            </div>
          {/if}
        </div>
      {/each}

      {#if isLoading}
        <div class="message-row left">
          <div class="avatar">
            {#if character.avatar}
              <img src={character.avatar} alt={character.name} />
            {:else}
              🤖
            {/if}
          </div>
          <div class="bubble-wrap">
            <span class="speaker-name">{character.name}</span>
            <div class="bubble loading-bubble">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <div class="input-area">
      <input
        class="topic-input"
        placeholder="メッセージを入力してください... (Enterで送信)"
        bind:value={inputText}
        onkeydown={handleKeydown}
        disabled={isLoading}
      />

      <div class="button-row">
        <button onclick={sendMessage} disabled={isLoading || !inputText.trim()}>送信</button>
      </div>
    </div>
  </div>
</div>

{#if selectedCharacter}
  <CharacterSettingsModal
    open={showSettings}
    character={selectedCharacter}
    onclose={closeSettings}
    onsave={(char) => handleCharacterSave(char)}
  />
{/if}

<style>
  /* ===================== Layout ===================== */
  .page {
    display: flex;
    height: 100vh;
    background: #0a0f1a;
    color: #fff;
    font-family: sans-serif;
  }

  .sidebar {
    width: 120px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px 12px;
    background: rgba(0, 0, 0, 0.4);
    border-right: 1px solid rgba(34, 211, 238, 0.15);
  }

  .char-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 8px;
    border-radius: 12px;
    transition: background 0.2s;
  }

  .char-card:hover {
    background: rgba(34, 211, 238, 0.1);
  }

  .char-card img {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(34, 211, 238, 0.4);
  }

  .char-card p {
    margin: 0;
    font-size: 11px;
    color: #aaa;
    text-align: center;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .count {
    margin: 8px 16px;
    font-size: 12px;
    color: #555;
  }

  /* ===================== Messages ===================== */
  .messages {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
    overflow-y: auto;
  }

  /* ===================== Message row ===================== */
  .message-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    animation: fadeInUp 0.3s ease both;
  }

  .message-row.left {
    flex-direction: row;
    justify-content: flex-start;
    padding-left: 20px;
  }

  .message-row.right {
    flex-direction: row-reverse;
    justify-content: flex-end;
    padding-right: 20px;
  }

  /* ===================== Avatar ===================== */
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid rgba(34, 211, 238, 0.5);
    box-shadow: 0 0 8px rgba(34, 211, 238, 0.35);
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .message-row.right .avatar {
    border-color: rgba(168, 85, 247, 0.5);
    box-shadow: 0 0 8px rgba(168, 85, 247, 0.35);
  }

  /* ===================== Bubble wrapper ===================== */
  .bubble-wrap {
    display: flex;
    flex-direction: column;
    max-width: 40%;
  }

  .bubble-wrap.right-wrap {
    align-items: flex-end;
  }

  /* ===================== Speaker ===================== */
  .speaker-name {
    font-size: 10px;
    color: #22d3ee;
    margin-bottom: 3px;
    letter-spacing: 0.08em;
  }

  .message-row.right .speaker-name {
    color: #a855f7;
  }

  /* ===================== Bubble ===================== */
  .bubble {
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.6;
    word-break: break-word;
    backdrop-filter: blur(6px);
    background: linear-gradient(135deg, rgba(10, 20, 30, 0.85), rgba(20, 40, 60, 0.6));
    border: 1px solid rgba(34, 211, 238, 0.4);
    box-shadow:
      0 0 10px rgba(34, 211, 238, 0.4),
      0 0 20px rgba(34, 211, 238, 0.2),
      inset 0 0 10px rgba(34, 211, 238, 0.15);
  }

  .message-row.right .bubble {
    border-color: rgba(168, 85, 247, 0.5);
    box-shadow:
      0 0 10px rgba(168, 85, 247, 0.5),
      0 0 20px rgba(168, 85, 247, 0.3),
      inset 0 0 10px rgba(168, 85, 247, 0.2);
  }

  /* ===================== Loading bubble ===================== */
  .loading-bubble {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 12px 16px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22d3ee;
    animation: dotBounce 1.2s ease-in-out infinite;
  }

  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes dotBounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
    40%            { transform: translateY(-6px); opacity: 1; }
  }

  /* ===================== Empty state ===================== */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #333;
    padding: 40px;
    text-align: center;
  }

  .empty-icon {
    font-size: 48px;
    color: rgba(34, 211, 238, 0.2);
  }

  .empty-title {
    font-size: 14px;
    color: #444;
  }

  .empty-sub {
    font-size: 10px;
    color: #333;
    letter-spacing: 0.15em;
  }

  /* ===================== Input area ===================== */
  .input-area {
    padding: 16px;
    border-top: 1px solid rgba(34, 211, 238, 0.1);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .topic-input {
    width: 100%;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(34, 211, 238, 0.3);
    background: rgba(0, 0, 0, 0.4);
    color: #fff;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }

  .topic-input:focus {
    border-color: #22d3ee;
    box-shadow: 0 0 8px rgba(34, 211, 238, 0.4);
  }

  .topic-input:disabled {
    opacity: 0.5;
  }

  .button-row {
    display: flex;
    gap: 10px;
  }

  button {
    padding: 9px 20px;
    border-radius: 8px;
    border: none;
    background: linear-gradient(135deg, #00ffff, #00aaff);
    color: #000;
    font-weight: bold;
    font-size: 13px;
    cursor: pointer;
    transition: 0.2s;
  }

  button:hover:not(:disabled) {
    transform: scale(1.04);
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.7);
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ===================== Sidebar meta ===================== */
  .char-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
  }

  .char-meta div {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
  }

  .char-meta span {
    color: #555;
  }

  .char-meta b {
    color: #22d3ee;
    font-size: 9px;
    font-weight: normal;
    max-width: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid rgba(34, 211, 238, 0.15);
    border-radius: 8px;
    font-size: 10px;
  }

  .status-title {
    color: #22d3ee;
    font-size: 9px;
    letter-spacing: 0.05em;
  }

  .status-row {
    display: flex;
    justify-content: space-between;
  }

  .status-row span {
    color: #555;
  }

  .status-row b {
    color: #aaa;
    font-weight: normal;
  }

  .hint {
    margin-top: 4px;
    color: #333;
    font-size: 8px;
    text-align: center;
    line-height: 1.4;
  }

  /* ===================== Animation ===================== */
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
