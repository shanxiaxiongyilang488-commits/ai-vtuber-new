<script lang="ts">
  import CharacterCard from './CharacterCard.svelte';
  import type { Character } from '$lib/types/character';

  interface StatusInfo {
    label: string;
    mode: string;
    turnCount: number;
  }

  interface Props {
    char1: Character;
    char2: Character;
    status?: StatusInfo;
    oncharacterclick?: (char: Character) => void;
  }

  let {
    char1,
    char2,
    status = { label: '待機中', mode: '対話型', turnCount: 0 },
    oncharacterclick,
  }: Props = $props();
</script>

<aside class="sidebar">
  <!-- Title -->
  <div class="section-title">
    <span class="title-bracket">[</span>
    キャラクター
    <span class="title-bracket">]</span>
  </div>

  <!-- Characters -->
  <div class="characters">
    <CharacterCard
      name={char1.name}
      emoji={char1.avatarEmoji}
      color={char1.color}
      aiEngine={char1.aiEngine}
      voiceEngine={char1.voiceEngine}
      avatar={char1.avatar}
      onclick={() => oncharacterclick?.(char1)}
    />

    <div class="vs-separator" aria-hidden="true">
      <span class="vs-line"></span>
      <span class="vs-text">VS</span>
      <span class="vs-line"></span>
    </div>

    <CharacterCard
      name={char2.name}
      emoji={char2.avatarEmoji}
      color={char2.color}
      aiEngine={char2.aiEngine}
      voiceEngine={char2.voiceEngine}
      avatar={char2.avatar}
      onclick={() => oncharacterclick?.(char2)}
    />
  </div>

  <!-- Divider -->
  <div class="panel-divider" aria-hidden="true"></div>

  <!-- Status Panel -->
  <div class="status-panel">
    <div class="status-title">
      <span class="dot" aria-hidden="true"></span>
      システム状態
    </div>

    <div class="status-rows">
      <div class="status-row">
        <span class="status-key">ステータス</span>
        <span class="status-val status-val--active">{status.label}</span>
      </div>
      <div class="status-row">
        <span class="status-key">発言数</span>
        <span class="status-val">{status.turnCount}</span>
      </div>
      <div class="status-row">
        <span class="status-key">モード</span>
        <span class="status-val">{status.mode}</span>
      </div>
    </div>
  </div>

  <!-- Hint -->
  <p class="hint">カードをクリックして設定を開く</p>
</aside>

<style>
  .sidebar {
    width: 200px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 14px;
    background: linear-gradient(180deg, rgba(15, 17, 23, 0.95) 0%, rgba(10, 12, 18, 0.98) 100%);
    border-right: 1px solid rgba(34, 211, 238, 0.15);
    overflow-y: auto;
  }

  /* Title */
  .section-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: #22d3ee;
    text-align: center;
    text-transform: uppercase;
  }

  .title-bracket {
    opacity: 0.5;
  }

  /* Characters */
  .characters {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* VS Separator */
  .vs-separator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 4px;
  }

  .vs-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.4), transparent);
  }

  .vs-text {
    font-family: 'Orbitron', sans-serif;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.1em;
    background: linear-gradient(135deg, #22d3ee, #a855f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-shadow: none;
    filter: drop-shadow(0 0 6px rgba(168, 85, 247, 0.6));
  }

  /* Divider */
  .panel-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.2), transparent);
    margin: 0 -4px;
  }

  /* Status Panel */
  .status-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 10px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(34, 211, 238, 0.12);
    border-radius: 8px;
  }

  .status-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'Orbitron', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #64748b;
    text-transform: uppercase;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22d3ee;
    box-shadow: 0 0 6px #22d3ee;
    animation: blink 2s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  .status-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .status-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 4px;
  }

  .status-key {
    font-family: 'Rajdhani', sans-serif;
    font-size: 11px;
    color: #475569;
    font-weight: 500;
    flex-shrink: 0;
  }

  .status-val {
    font-family: 'Rajdhani', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    text-align: right;
  }

  .status-val--active {
    color: #22d3ee;
    text-shadow: 0 0 6px rgba(34, 211, 238, 0.5);
  }

  /* Hint */
  .hint {
    font-family: 'Rajdhani', sans-serif;
    font-size: 10px;
    color: rgba(34, 211, 238, 0.3);
    text-align: center;
    letter-spacing: 0.03em;
    line-height: 1.4;
    margin: 0;
  }
</style>
