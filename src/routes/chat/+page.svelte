<script lang="ts">
import Sidebar from '$lib/components/chat/Sidebar.svelte';
import ControlPanel from '$lib/components/chat/ControlPanel.svelte';
import CharacterSettingsModal from '$lib/components/CharacterSettingsModal.svelte';
import type { Character } from '$lib/types/character';
import { tick } from 'svelte';

type Message = {
  speaker: string;
  text: string;
};

import { marked } from 'marked';

// 型をちゃんとつける
function renderMessage(text: string) {
  if (!text) return "";

  // 強制的に構造化
  const formatted = text
    // 見出し
    .replace(/##\s*/g, '\n\n## ')
    // セクション区切り
    .replace(/■\s*/g, '\n\n■ ')
    // リスト
    .replace(/-\s*/g, '\n- ')
    // 文末で改行
    .replace(/。/g, '。\n')
    // 連続改行整理
    .replace(/\n{3,}/g, '\n\n');

  return marked.parse(formatted);
}

let topic = $state("");
let modalOpen = $state(false);
let selectedCharacter = $state<Character | null>(null);
let messages = $state<Message[]>([]);
let selectedEngine = $state<"openai" | "gemini" | "claude">("openai");
// 長文モード：true のとき bubble 幅を拡張し pre-wrap を強制する
let longMode = $state(false);

// ----------------------------
// キャラ初期設定
// ----------------------------
const defaultChar1: Character = {
  id: 'char1',
  name: 'ミュリィ',
  avatarEmoji: '🌸',
  color: '#22d3ee',
  aiEngine: 'openai',
  voiceEngine: 'elevenlabs',
  systemPrompt: '明るく感情的でギャルっぽく話すAI。',
  ollamaModel: 'qwen:0.5b',
  voiceId: '21m00Tcm4TlvDq8ikWAM',
  speakerId: 0
};

const defaultChar2: Character = {
  id: 'char2',
  name: 'シエル',
  avatarEmoji: '🧊',
  color: '#a855f7',
  aiEngine: 'openai',
  voiceEngine: 'elevenlabs',
  systemPrompt: '冷静で論理的に話すAI。',
  ollamaModel: 'llama3.2:1b',
  voiceId: 'EXAVITQu4vr4xnSDxMaL',
  speakerId: 0
};

// ----------------------------
// localStorage読み込み
// ----------------------------
function loadChar(id: string, fallback: Character): Character {
  if (typeof localStorage === 'undefined') return fallback;
  const stored = localStorage.getItem(id);
  return stored ? JSON.parse(stored) : fallback;
}

let char1 = $state<Character>(loadChar('char1', defaultChar1));
let char2 = $state<Character>(loadChar('char2', defaultChar2));

const characters = [char1, char2];
let leftSpeaker = char1.name;

// ----------------------------
// UI操作
// ----------------------------
function handleCharacterClick(char: Character) {
  selectedCharacter = char;
  modalOpen = true;
}

function handleModalClose() {
  modalOpen = false;
  selectedCharacter = null;
}

function handleModalSave(updated: Character) {
  if (updated.id === 'char1') {
    char1 = updated;
    localStorage.setItem('char1', JSON.stringify(char1));
  } else {
    char2 = updated;
    localStorage.setItem('char2', JSON.stringify(char2));
  }
}

// ----------------------------
// 音声再生（完全版）
// ----------------------------
async function speak(text: string, speaker?: string) {
  console.log('🔊 speak:', speaker, text);

  const character =
    speaker === char1.name ? char1 :
    speaker === char2.name ? char2 :
    null;

  const voiceId = character?.voiceId || '21m00Tcm4TlvDq8ikWAM';

  const res = await fetch('/api/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceId })
  });

  if (!res.ok) {
    console.error('音声生成失敗');
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const audio = new Audio(url);

  // ★ここが最重要（順番制御）
  await new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play();
  });
}

// ----------------------------
// 会話開始
// ----------------------------
async function handleStartDiscussion() {
  console.log("🔥 会話開始:", topic);

  messages = [];

  const res = await fetch('/api/discussion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: topic,
      characters: [char1, char2]
    })
  });

  const data = await res.json();

  
  console.log("🔥 API結果:", data);
  console.log("🔥 data.messages:", data.messages);

  
  const raw =
  data.messages ??
  (data.message
    ? [data.message]
    : data.response
    ? [data.response]
    : []);

  const incoming: Message[] = raw.map((m: any) => {
  if (typeof m === "string") {
    const [speaker, ...rest] = m.split("：");
    return {
      speaker: speaker || "AI",
      text: rest.join("：") || m
    };
  }

  return {
    speaker: m.speaker,
    text: (m.text ?? "").replace(/\n/g, "")
  };
});

  console.log("🔥 incoming:", incoming);

  // 👇 交互に順番再生（完成版）
  for (const msg of incoming) {
    console.log('💬', msg.speaker, msg.text);

    messages = [...messages, msg];
    console.log("🔥 messages:", messages);

    await speak(msg.text, msg.speaker);

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 800);
    });
  }
}

function copyText(text: string) {
  if (!text) return;
  navigator.clipboard.writeText(text);
}

function downloadText(text: string, filename = "output.md") {
  if (!text) return;

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

// 会話履歴を Markdown 形式に整形してダウンロード
function generateMarkdown() {
  if (messages.length === 0) return;
  const lines = messages.map(m => `## ${m.speaker}\n\n${m.text}`);
  const content = `# AI ディスカッション\n\nトピック：${topic}\n\n---\n\n${lines.join('\n\n---\n\n')}`;
  downloadText(content, 'discussion.md');
}

// 会話履歴を YAML 形式に整形してダウンロード
function generateYAML() {
  if (messages.length === 0) return;
  const entries = messages.map(m =>
    `- speaker: "${m.speaker}"\n  text: |\n    ${m.text.replace(/\n/g, '\n    ')}`
  );
  const content = `topic: "${topic}"\nmessages:\n${entries.join('\n')}`;
  downloadText(content, 'discussion.yaml');
}

// AIに資料生成を依頼する（既存の discussion フローを再利用）
async function generateDocFlow() {
  const basePrompt = topic.trim()
    ? `「${topic}」について、以下の構成でMarkdown資料を作成してください。\n\n## 概要\n## 背景・目的\n## 主なポイント（箇条書き）\n## まとめ`
    : `会話の内容を整理し、以下の構成でMarkdown資料を作成してください。\n\n## 概要\n## 背景・目的\n## 主なポイント（箇条書き）\n## まとめ`;
  topic = basePrompt;
  await handleStartDiscussion();
}


</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<!-- Background layers -->
<div class="grid-bg" aria-hidden="true"></div>
<div class="scanlines" aria-hidden="true"></div>
<div class="orb orb-cyan" aria-hidden="true"></div>
<div class="orb orb-purple" aria-hidden="true"></div>

<!-- Root shell -->
<div class="shell">
  <!-- Left Sidebar -->
  <Sidebar {char1} {char2} oncharacterclick={handleCharacterClick} />

  <!-- Character Settings Modal -->
  <CharacterSettingsModal
    open={modalOpen}
    character={selectedCharacter}
    onclose={handleModalClose}
    onsave={handleModalSave}
  />

  <!-- Main column -->
  <div class="main-col">

    <!-- Header -->
    <header class="header">
      <div class="header-inner">
        <div class="header-left">
          <span class="sys-badge">
            <span class="sys-dot" aria-hidden="true"></span>
            SYSTEM ONLINE
          </span>
        </div>
        <h1 class="page-title">
          AI ディスカッション
          <span class="title-accent">ターミナル</span>
        </h1>
        <div class="header-right">
          <!-- 資料生成ボタン -->
          <button class="gen-btn" onclick={generateDocFlow}>📄 資料生成</button>
          <button class="gen-btn" onclick={generateMarkdown} disabled={messages.length === 0}>MD</button>
          <button class="gen-btn" onclick={generateYAML}     disabled={messages.length === 0}>YAML</button>
          <!-- 長文モードトグル -->
          <button
            class="long-mode-btn"
            class:active={longMode}
            onclick={() => (longMode = !longMode)}
          >LONG</button>
          <span class="ver-tag">v2.0.0</span>
        </div>
      </div>
      <div class="header-line" aria-hidden="true"></div>
    </header>

    <!-- Chat area -->
    <main class="chat-area" class:long-mode={longMode}>
      {#if messages.length === 0}
        <div class="empty-state">
          <div class="corner corner-tl" aria-hidden="true"></div>
          <div class="corner corner-tr" aria-hidden="true"></div>
          <div class="corner corner-bl" aria-hidden="true"></div>
          <div class="corner corner-br" aria-hidden="true"></div>

          <div class="diamond-wrap" aria-hidden="true">
            <div class="diamond-outer"></div>
            <div class="diamond-inner"></div>
            <div class="diamond-core"></div>
          </div>

          <p class="empty-text">トピックを入力して会話を開始してください</p>
          <p class="empty-sub">AWAITING INPUT — NEURAL LINK STANDBY</p>
        </div>
      {:else}
        <div class="messages">
  {#each messages as msg, index}

  {@const char = characters.find(c => c.name === msg.speaker) || null}
  {@const isLeft = msg.speaker === char1.name}

  <div class="message-row {isLeft ? 'left' : 'right'}">

    {#if isLeft}
      <div class="avatar">
        {#if char?.avatar}
          <img src={char.avatar} alt={msg.speaker} />
        {/if}
      </div>
    {/if}

    <div class="bubble-wrap">
      <span class="name">{msg.speaker}</span>

      <div class="bubble">
  <div class="markdown" style="white-space: pre-wrap;">
    {@html renderMessage(msg.text)}
  </div>
</div>

<div class="action-buttons">
  <button onclick={() => copyText(msg.text)}>📋 COPY</button>
  <button onclick={() => downloadText(msg.text)}>💾 DL</button>
</div>
</div>

    {#if !isLeft}
      <div class="avatar">
        {#if char?.avatar}
          <img src={char.avatar} alt={msg.speaker} />
        {/if}
      </div>
    {/if}

  </div>

{/each}
</div>
      {/if}
    </main>

    <!-- Control Panel -->
    <ControlPanel bind:topic onStart={handleStartDiscussion} />

  </div>
</div>
<div style="margin-bottom: 12px;">
  <label>AI：</label>
  <select bind:value={selectedEngine}>
    <option value="openai">OpenAI</option>
    <option value="gemini">Gemini</option>
    <option value="claude">Claude (開発者専用)</option>
  </select>
</div>


<style>
  /* ── Globals ── */
  :global(body) {
    margin: 0;
    background: #030712;
    color: #e2e8f0;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    overflow: hidden;
  }

  /* ── Background ── */
  .grid-bg {
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background-image:
      linear-gradient(rgba(34, 211, 238, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(34, 211, 238, 0.04) 1px, transparent 1px);
    background-size: 52px 52px;
  }

  .scanlines {
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background: repeating-linear-gradient(
      0deg, transparent, transparent 2px,
      rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px
    );
  }

  .orb {
    position: fixed; border-radius: 50%;
    filter: blur(140px); pointer-events: none; z-index: 0;
  }

  .orb-cyan {
    width: 600px; height: 600px;
    top: -200px; left: 100px;
    background: radial-gradient(circle, rgba(34, 211, 238, 0.10) 0%, transparent 70%);
    animation: drift-a 18s ease-in-out infinite alternate;
  }

  .orb-purple {
    width: 500px; height: 500px;
    bottom: -180px; right: -100px;
    background: radial-gradient(circle, rgba(168, 85, 247, 0.13) 0%, transparent 70%);
    animation: drift-b 22s ease-in-out infinite alternate;
  }

  @keyframes drift-a {
    from { transform: translate(0, 0); }
    to   { transform: translate(60px, 80px); }
  }
  @keyframes drift-b {
    from { transform: translate(0, 0); }
    to   { transform: translate(-50px, -60px); }
  }

  /* ── Shell ── */
  .shell {
    position: relative; z-index: 1;
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Main column ── */
  .main-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  /* ── Header ── */
  .header {
    flex-shrink: 0;
  }

  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 28px 12px;
  }

  .sys-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'Orbitron', sans-serif;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.15em;
    color: #22d3ee;
    opacity: 0.7;
  }

  .sys-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: #22d3ee;
    box-shadow: 0 0 6px #22d3ee;
    animation: blink 2.5s ease-in-out infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.2; }
  }

  .page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(14px, 2vw, 20px);
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #e2e8f0;
    text-align: center;
    margin: 0;
  }

  .title-accent {
    background: linear-gradient(135deg, #22d3ee 0%, #06b6d4 50%, #a855f7 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 8px rgba(34, 211, 238, 0.5));
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .ver-tag {
    font-family: 'Orbitron', sans-serif;
    font-size: 9px;
    letter-spacing: 0.12em;
    color: #334155;
    opacity: 0.8;
  }

  .header-line {
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(34, 211, 238, 0.3) 20%,
      rgba(168, 85, 247, 0.3) 80%,
      transparent 100%
    );
    box-shadow: 0 0 6px rgba(34, 211, 238, 0.1);
  }

  /* ── Chat area ── */
  .chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    padding: 32px 40px;
  }

  /* ── Empty state ── */
  .empty-state {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 60px 48px;
    border: 1px solid rgba(34, 211, 238, 0.1);
    border-radius: 16px;
    background: rgba(0, 0, 0, 0.25);
    max-width: 480px;
    width: 100%;
  }

  .corner {
    position: absolute;
    width: 16px; height: 16px;
    border-color: rgba(34, 211, 238, 0.5);
    border-style: solid;
  }

  .corner-tl { top: -1px; left: -1px; border-width: 2px 0 0 2px; border-radius: 4px 0 0 0; }
  .corner-tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; border-radius: 0 4px 0 0; }
  .corner-bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; border-radius: 0 0 0 4px; }
  .corner-br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; border-radius: 0 0 4px 0; }

  .diamond-wrap {
    position: relative;
    width: 56px; height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .diamond-outer,
  .diamond-inner,
  .diamond-core {
    position: absolute;
    transform: rotate(45deg);
    border-radius: 3px;
  }

  .diamond-outer {
    width: 48px; height: 48px;
    border: 1px solid rgba(34, 211, 238, 0.25);
    animation: diamond-spin 8s linear infinite;
  }

  .diamond-inner {
    width: 32px; height: 32px;
    border: 1px solid rgba(34, 211, 238, 0.5);
    animation: diamond-spin 5s linear infinite reverse;
  }

  .diamond-core {
    width: 14px; height: 14px;
    background: rgba(34, 211, 238, 0.15);
    border: 1.5px solid #22d3ee;
    box-shadow: 0 0 12px rgba(34, 211, 238, 0.6), inset 0 0 6px rgba(34, 211, 238, 0.3);
    animation: core-pulse 2.5s ease-in-out infinite;
  }

  @keyframes diamond-spin {
    from { transform: rotate(45deg); }
    to   { transform: rotate(405deg); }
  }

  @keyframes core-pulse {
    0%, 100% { box-shadow: 0 0 12px rgba(34, 211, 238, 0.6), inset 0 0 6px rgba(34, 211, 238, 0.3); }
    50%       { box-shadow: 0 0 22px rgba(34, 211, 238, 0.9), inset 0 0 10px rgba(34, 211, 238, 0.5); }
  }

  .empty-text {
    font-family: 'Rajdhani', sans-serif;
    font-size: 16px;
    font-weight: 500;
    color: #64748b;
    text-align: center;
    letter-spacing: 0.03em;
    line-height: 1.5;
    margin: 0;
  }

  .empty-sub {
    font-family: 'Orbitron', sans-serif;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.2em;
    color: rgba(34, 211, 238, 0.25);
    text-transform: uppercase;
    margin: 0;
  }

  /* ── Messages ── */
  .messages {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 720px;
  }

  .message-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    animation: fadeInUp 0.3s ease;
  }

  .message-row.left {
    justify-content: flex-start;
  }

  .message-row.right {
    justify-content: flex-end;
  }

  .message-row {
  animation: popIn 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  animation-fill-mode: both;
}

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  

  .right-wrap {
    align-items: flex-end;
    text-align: right;
  }

  .speaker-name {
    font-size: 10px;
    margin-bottom: 4px;
    opacity: 0.7;
  }

  

  .message-row.left .bubble {
    border: 1px solid #22d3ee;
    box-shadow: 0 0 10px rgba(34, 211, 238, 0.4);
  }

  .message-row.right .bubble {
    border: 1px solid #a855f7;
    box-shadow: 0 0 10px rgba(168, 85, 247, 0.4);
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .word-wrap-fix {
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}

.message {
  max-width: 60%;
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}

.chat-bubble {
  max-width: 420px;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.chat-bubble {
  max-width: 600px !important;
  width: fit-content;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar {
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.5);
  border: 1.5px solid rgba(34, 211, 238, 0.6);
}



.right-wrap {
  justify-content: flex-end;
}

/* ==================== Messages ==================== */
.messages {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px 40px 28px;
}

/* ==================== Message Row ==================== */
.message-row {
  display: flex;
  width: 100%;
  align-items: flex-end;
  gap: 12px;
  animation: popIn 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 左 */
.message-row.left {
  justify-content: flex-start;
}

/* 右 */
.message-row.right {
  justify-content: flex-end;
}

/* ==================== Avatar ==================== */
.avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

/* ==================== Bubble Wrap ==================== */
.bubble-wrap {
  display: flex;
  flex-direction: column;
  max-width: 60%;
  width: fit-content;
}

/* 右側調整 */
.bubble-wrap.right-wrap {
  align-items: flex-end;
}

/* ==================== Name ==================== */
.speaker-name {
  font-size: 11px;
  margin-bottom: 4px;
  opacity: 0.8;
}

/* ==================== Bubble ==================== */
.bubble {
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  backdrop-filter: blur(6px);
}

/* 左（シアン） */
.message-row.left .bubble {
  background: rgba(10, 30, 40, 0.75);
  border: 1px solid rgba(34, 211, 238, 0.5);
  box-shadow:
    0 0 12px rgba(34, 211, 238, 0.4),
    inset 0 0 6px rgba(34, 211, 238, 0.2);
}

/* 右（紫） */
.message-row.right .bubble {
  background: rgba(30, 10, 40, 0.75);
  border: 1px solid rgba(168, 85, 247, 0.5);
  box-shadow:
    0 0 12px rgba(168, 85, 247, 0.4),
    inset 0 0 6px rgba(168, 85, 247, 0.2);
}

.bubble::after {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  z-index: -1;
  filter: blur(8px);
  opacity: 0.45;
}

.message-row.left .bubble::after {
  background: rgba(34, 211, 238, 0.25);
}

.message-row.right .bubble::after {
  background: rgba(168, 85, 247, 0.25);
}

@keyframes popIn {
  0% {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    filter: blur(6px);
  }
  60% {
    opacity: 1;
    transform: translateY(-4px) scale(1.02);
    filter: blur(0px);
  }
  100% {
    transform: translateY(0) scale(1);
  }
}

.bubble {
  transition: all 0.3s ease;
}

.markdown ul {
  padding-left: 20px;
}

.markdown {
  white-space: pre-wrap;
  line-height: 1.6;
}

.action-buttons {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.action-buttons button {
  background: #0f172a;
  border: 1px solid #38bdf8;
  color: #38bdf8;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
}

.action-buttons button:hover {
  background: #38bdf8;
  color: black;
}

/* ── 長文モードトグルボタン ── */
.long-mode-btn {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #475569;
  background: transparent;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.long-mode-btn.active {
  color: #22d3ee;
  border-color: rgba(34, 211, 238, 0.5);
  background: rgba(34, 211, 238, 0.06);
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.15);
}

/* ── 長文モード：コンテナ幅とバブル幅を拡張 ── */
.chat-area.long-mode .messages {
  max-width: min(1200px, 95vw);
}
.chat-area.long-mode .bubble-wrap {
  max-width: 80%;
}
/* 長文モード時のみ pre-wrap を CSS で付与（inline style 不使用） */
.chat-area.long-mode .markdown {
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── 資料生成ボタン ── */
.gen-btn {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #64748b;
  background: transparent;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.gen-btn:hover:not(:disabled) {
  color: #a855f7;
  border-color: rgba(168, 85, 247, 0.5);
  background: rgba(168, 85, 247, 0.06);
}
.gen-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

</style>
