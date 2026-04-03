<script lang="ts">
import Sidebar from '$lib/components/chat/Sidebar.svelte';
import ControlPanel from '$lib/components/chat/ControlPanel.svelte';
import CharacterSettingsModal from '$lib/components/CharacterSettingsModal.svelte';
import type { Character } from '$lib/types/character';

type Message = {
  speaker: string;
  text: string;
};

let topic = $state("");
let modalOpen = $state(false);
let selectedCharacter = $state<Character | null>(null);
let messages = $state<Message[]>([]);

// ✅ systemPromptに修正
const defaultChar1: Character = {
  id: 'char1',
  name: 'アリア',
  avatarEmoji: '🌸',
  color: '#22d3ee',
  aiEngine: 'openai',
  voiceEngine: 'voicevox',
  systemPrompt: "あなたはクールなギャルAI。語尾は〜っしょ！",
  ollamaModel: 'qwen:0.5b',
  voiceId: '',
  speakerId: 0
};

const defaultChar2: Character = {
  id: 'char2',
  name: 'ノヴァ',
  avatarEmoji: '🔥',
  color: '#a855f7',
  aiEngine: 'openai',
  voiceEngine: 'elevenlabs',
  systemPrompt: 'あなたはクールで論理的なAIアシスタントのノヴァです。',
  ollamaModel: 'llama3.2:1b',
  voiceId: '',
  speakerId: 0
};

function loadChar(id: string, fallback: Character): Character {
  if (typeof localStorage === 'undefined') return fallback;
  const stored = localStorage.getItem(id);
  return stored ? JSON.parse(stored) : fallback;
}

let char1 = $state<Character>(loadChar('char1', defaultChar1));
let char2 = $state<Character>(loadChar('char2', defaultChar2));

const characters = $derived([char1, char2]);

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

// 🔥 会話開始（完成版）
async function handleStartDiscussion() {
  console.log("🔥 親で受け取った:", topic);

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

  const incoming: Message[] = (data.messages ?? []).map((m: any) => ({
    speaker: m.speaker,
    text: (m.text ?? "").replace(/\n/g, " ")
  }));

  // 👇 1人ずつ表示
  for (const msg of incoming) {
    messages = [...messages, msg];
    await new Promise(r => setTimeout(r, 800));
  }
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
          <span class="ver-tag">v2.0.0</span>
        </div>
      </div>
      <div class="header-line" aria-hidden="true"></div>
    </header>

    <!-- Chat area -->
    <main class="chat-area">
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
          {#each messages as msg}
            {@const isLeft = msg.speaker === characters[0].name}
            <div class="message-row" class:left={isLeft} class:right={!isLeft}>
              {#if isLeft}
                <img
                  class="avatar"
                  src={characters.find(c => c.name === msg.speaker)?.avatar}
                  alt={msg.speaker}
                  />
                <div class="bubble-wrap">
                  <span class="speaker-name">{msg.speaker}</span>
                  <div class="bubble">{msg.text}</div>
                </div>
              {:else}
                <div class="bubble-wrap right-wrap">
                  <span class="speaker-name">{msg.speaker}</span>
                  <div class="bubble">{msg.text}</div>
                </div>
                <img class="avatar" src={characters.find(c => c.name === msg.speaker)?.avatar} alt={msg.speaker} />
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

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .bubble-wrap {
    display: flex;
    flex-direction: column;
    max-width: 60%;
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

  .bubble {
    padding: 10px 14px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(6px);
    line-height: 1.5;
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
</style>
