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
};

let characters = $state<Character[]>([
  {
    id: 'char1',
    name: 'アリア',
    role: 'AIキャラクター A',
    color: '#00d4ff',
    emoji: '🤖',
    engine: 'openai',
    voice: 'VoiceVox'
  },
  {
    id: 'char2',
    name: 'ノヴァ',
    role: 'AIキャラクター B',
    color: '#bf00ff',
    emoji: '✨',
    engine: 'ollama',
    voice: 'ElevenLabs'
  }
]);

let selectedCharacter: Character | null = null;
let showModal = $state(false);
let status = $state('idle');
let topic = $state('');
let messages = $state<any[]>([]);

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
// 会話開始
// =========================
async function startDiscussion() {
  if (!topic.trim()) return;

  status = 'running';

  messages = [
    ...messages,
    { speaker: 'アリア', text: `${topic}について話しましょう！` },
    { speaker: 'ノヴァ', text: `${topic}、面白いテーマですね。` }
  ];

  const speakers = ['アリア', 'ノヴァ'];

  for (let i = 0; i < 4; i++) {
    setTimeout(() => {
      messages = [
        ...messages,
        { speaker: speakers[(i + 2) % 2], text: mockLines[i] }
      ];
    }, 800 * (i + 1));
  }

  const res = await fetch('/api/discussion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, messages })
  });

  const data = await res.json();

  messages = [
    ...messages,
    { speaker: 'アリア', text: data.text }
  ];
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
    <div class="messages">
      {#each messages as msg}
        <div>
          <b>{msg.speaker}：</b> {msg.text}
        </div>
      {/each}
    </div>

    <input
      placeholder="話題を入力"
      bind:value={topic}
    />

    <button onclick={startDiscussion}>
      会話開始
    </button>
  </div>

</div>

<!-- モーダル -->
{#if showModal && selectedCharacter}
  <div class="modal-backdrop" onclick={() => showModal = false}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      
      <h2>キャラクター設定</h2>

      <input bind:value={selectedCharacter.name} />

      <select bind:value={selectedCharacter.engine}>
        <option value="openai">OpenAI</option>
        <option value="gemini">Gemini</option>
        <option value="ollama">Ollama</option>
      </select>

      <button onclick={() => saveCharacter(selectedCharacter)}>
        保存
      </button>

    </div>
  </div>
{/if}