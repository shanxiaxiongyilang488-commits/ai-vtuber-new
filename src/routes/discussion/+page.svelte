<script lang="ts">
import { onMount } from 'svelte';

type Character = {
  id: string;
  name: string;
  role: string;
  color: string;
  emoji: string;
  engine: string;
  voice: string;
  personality?: string;
  avatar?: string;
  systemPrompt: string;
};

let characters = $state<Character[]>([
  {
id: 'char1',
name: 'アリア',
role: 'AIキャラクター A',
color: '#00d4ff',
emoji: '🤖',
engine: 'openai',
voice: 'VoiceVox',
systemPrompt: 'あなたは明るく知的で落ち着いた女性AIです。短く自然に会話してください。'
},
{
id: 'char2',
name: 'ノヴァ',
role: 'AIキャラクター B',
color: '#bf00ff',
emoji: '✨',
engine: 'ollama',
voice: 'ElevenLabs',
systemPrompt: 'あなたはクールで論理的なAIです。簡潔に返答してください。'
}
]);

type Message = {
  speaker: string;
  text: string;
  avatar: string;
};

let selectedCharacter: Character | null = null;
let showModal = $state(false);
let status = $state('idle');
let topic = $state('');
let messages = $state<Message[]>([]);

// =========================
// モーダル操作
// =========================
function openSettings(char: Character) {
  selectedCharacter = char;
  showModal = true;
}

function saveCharacter(updated: Character) {
  characters = characters.map(c =>
    c.id === updated.id ? updated : c
  );

  localStorage.setItem('ai-characters', JSON.stringify(characters));
  showModal = false;
}

// =========================
// 状態操作
// =========================
function handleStop() {
  status = 'stopped';
}

function handleReset() {
  status = 'idle';
  topic = '';
  messages = [];
}

// =========================
// モック会話
// =========================
const mockLines = [
  'なるほど、それは興味深い視点ですね。',
  'もう少し詳しく聞かせてもらえますか？',
  '確かに、その点は重要だと思います。',
  'では、別の角度から考えてみましょう。'
];

// =========================
// 会話開始（API連携）
// =========================
async function startDiscussion() {
  console.log("送信characters:", characters);

  console.log('[DEBUG] START button clicked');

  if (!topic.trim()) return;

  status = 'running';

  // 元キャラ取得
  const c0 = characters[0];
  const c1 = characters[1];

  // 🔥 engineをここで確定させる（重要）
  const char0 = {
  ...c0,
    engine: c0.engine
  };

  const char1 = {
    ...c1,
    engine: c1.engine
  };

  // 初期表示（UIだけ先に出す）
  messages = [
    {
      speaker: char0.name,
      text: `${topic}について話そうよ！`,
      avatar: char0.avatar ?? '/avatars/default.png'
    },
    {
      speaker: char1.name,
      text: `${topic}、興味深いテーマですね。`,
      avatar: char1.avatar ?? '/avatars/default.png'
    }
  ];

  console.log('[DEBUG] UI initial messages', messages);

  try {
    const res = await fetch('/api/discussion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: topic,
        turns: 3,
        characters: [char0, char1] // ←これが最重要
      })
    });

    console.log('[DEBUG] API status:', res.status);

    const data = await res.json();
    console.log('[DEBUG] API result:', data);

    // 会話を順番に表示（演出）
    let delay = 0;

    for (const msg of data.messages) {
      setTimeout(() => {
        const char = [char0, char1].find(c => c.name === msg.speaker);

        messages = [
          ...messages,
          {
            speaker: msg.speaker,
            text: msg.text,
            avatar: char?.avatar ?? '/avatars/default.png'
          }
        ];
      }, delay);

      delay += 800;
    }

  } catch (err) {
    console.error('[ERROR] Discussion failed:', err);
  }
}

// =========================
// ダミー会話
// =========================
async function startDummyDiscussion() {
  messages = [];
  status = 'running';

  const c0 = characters[0];
  const c1 = characters[1];

  const script = [
    { speaker: c0.name, text: '春っていい季節ね…', avatar: c0.avatar ?? '/avatars/default.png' },
    { speaker: c1.name, text: 'うん、暖かくて過ごしやすい…', avatar: c1.avatar ?? '/avatars/default.png' },
    { speaker: c0.name, text: '桜も綺麗だし、気分も上がるわ', avatar: c0.avatar ?? '/avatars/default.png' },
    { speaker: c1.name, text: 'ちょっと眠くなるけどね…', avatar: c1.avatar ?? '/avatars/default.png' }
  ];

  for (const line of script) {
    await new Promise(resolve => setTimeout(resolve, 600));
    messages = [...messages, line];
  }

  status = 'idle';
}

// =========================
// 初期ロード
// =========================
onMount(() => {
  const saved = localStorage.getItem('ai-characters');
  if (saved) {
    characters = JSON.parse(saved);
  }
});
</script>

<div class="page">

  <!-- 左：キャラ -->
  <div class="sidebar">
    {#each characters as char}
      <div class="char-card" onclick={() => openSettings(char)}>
        <div>{char.emoji}</div>
        <div>{char.name}</div>
      </div>
    {/each}
  </div>

  <!-- 右：会話 -->
  <div class="main">
  <p>件数: {messages.length}</p>
    <div class="messages">
     {#each messages as msg}

  {@const isLeft = characters[0] && msg.speaker === characters[0].name}
  {@const char = characters.find(c => c.name === msg.speaker)}

  <div class={`message-row ${isLeft ? 'left' : 'right'}`}>

    {#if isLeft}

      {#if char && char.avatar}
        <div class="avatar">
          <img src={char.avatar} alt={msg.speaker} />
        </div>
      {:else}
        <div class="avatar">
          {char?.emoji ?? '🤖'}
        </div>
      {/if}

      <div class="bubble-wrap">
        <span class="speaker-name">{msg.speaker}</span>
        <div class="bubble">{msg.text}</div>
      </div>

    {:else}

      <div class="bubble-wrap right-wrap">
        <span class="speaker-name">{msg.speaker}</span>
        <div class="bubble">{msg.text}</div>
      </div>

      {#if char && char.avatar}
        <div class="avatar">
          <img src={char.avatar} alt={msg.speaker} />
        </div>
      {:else}
        <div class="avatar">
          {char?.emoji ?? '🤖'}
        </div>
      {/if}

    {/if}

  </div>

{/each}
    </div>

    <input
      placeholder="話題を入力"
      bind:value={topic}
    />

    <button onclick={startDiscussion}>
      会話開始（API）
    </button>
    <button onclick={startDummyDiscussion}>
      ダミー会話
    </button>
  </div>

</div>

<!-- モーダル -->
{#if showModal && selectedCharacter}
  <div class="modal-backdrop" onclick={() => showModal = false}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      
      <h2>キャラクター設定</h2>

      <input bind:value={selectedCharacter.name} />

      <select bind:value={aiEngine}>
      <option value="openai">OpenAI</option>
      <option value="gemini">Gemini</option>
      <option value="ollama">Ollama</option>
      <option value="lmstudio">LM Studio</option>
    </select>

      <button onclick={() => saveCharacter(selectedCharacter)}>
        保存
      </button>

    </div>
  </div>
{/if}

<style>
  /* ===================== Messages ===================== */
.messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

/* ===================== Message row ===================== */
.message-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  animation: fadeInUp 0.3s ease both;
}

/* 左 */
.message-row.left {
  flex-direction: row;
  justify-content: flex-start;
}

/* 🔥 右（ここが修正ポイント） */
.message-row.right {
  flex-direction: row-reverse;
  justify-content: flex-end; /* ← ここ重要 */
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

/* 🔥 これ超重要 */
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 右側カラー */
.message-row.right .avatar {
  border-color: rgba(168, 85, 247, 0.5);
  box-shadow: 0 0 8px rgba(168, 85, 247, 0.35);
}

/* ===================== Bubble wrapper ===================== */
.bubble-wrap {
  display: flex;
  flex-direction: column;
  max-width: 60%;
}

.bubble-wrap.right-wrap {
  align-items: flex-end;
}

.bubble-wrap {
  max-width: 40%;
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

  background: linear-gradient(
    135deg,
    rgba(10, 20, 30, 0.85),
    rgba(20, 40, 60, 0.6)
  );

  border: 1px solid rgba(34, 211, 238, 0.4);

  box-shadow:
    0 0 10px rgba(34, 211, 238, 0.4),
    0 0 20px rgba(34, 211, 238, 0.2),
    inset 0 0 10px rgba(34, 211, 238, 0.15);
}

/* 右側 */
.message-row.right .bubble {
  border-color: rgba(168, 85, 247, 0.5);

  box-shadow:
    0 0 10px rgba(168, 85, 247, 0.5),
    0 0 20px rgba(168, 85, 247, 0.3),
    inset 0 0 10px rgba(168, 85, 247, 0.2);
}

.message-row.left {
  justify-content: flex-start;
  padding-left: 20px;  /* ← 追加 */
}

.message-row.right {
  justify-content: flex-end;
  padding-right: 20px; /* ← 追加 */
}

/* ===================== Animation ===================== */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>