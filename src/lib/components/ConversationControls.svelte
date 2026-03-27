<script lang="ts">
  import { appStore } from '$lib/stores/appStore.svelte';

  interface Props {
    onStart: () => void;
    onStop: () => void;
  }

  let { onStart, onStop }: Props = $props();

  const isRunning = $derived(appStore.status === 'running');
  const isStopped = $derived(appStore.status === 'stopped');
  const messageCount = $derived(appStore.messages.length);
</script>

<div class="controls">
  <div class="topic-row">
    <label class="field-label" for="topic-input">会話トピック</label>
    <input
      id="topic-input"
      class="topic-input"
      type="text"
      value={appStore.topic}
      oninput={(e) => appStore.setTopic((e.target as HTMLInputElement).value)}
      placeholder="2人が話すテーマを入力…"
      disabled={isRunning}
    />
  </div>

  <div class="button-row">
    {#if !isRunning}
      <button class="btn btn-start" onclick={onStart}>
        ▶ 会話開始
      </button>
    {:else}
      <button class="btn btn-stop" onclick={onStop}>
        ■ 停止
      </button>
    {/if}

    {#if messageCount > 0 && !isRunning}
      <button
        class="btn btn-clear"
        onclick={() => appStore.clearMessages()}
      >
        🗑 履歴クリア
      </button>
    {/if}
  </div>

  <div class="status-bar">
    <span class="status-dot" class:running={isRunning} class:stopped={isStopped} class:idle={!isRunning && !isStopped}></span>
    <span class="status-text">
      {#if isRunning}
        会話中 — {messageCount} 件
      {:else if isStopped}
        停止済み — {messageCount} 件
      {:else}
        待機中
      {/if}
    </span>
  </div>
</div>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  .topic-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .field-label {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .topic-input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 0.9rem;
    padding: 6px 10px;
    transition: border-color 0.15s;
  }

  .topic-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .topic-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .button-row {
    display: flex;
    gap: 8px;
  }

  .btn {
    padding: 8px 20px;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
  }

  .btn:hover {
    opacity: 0.85;
    transform: translateY(-1px);
  }

  .btn:active {
    transform: translateY(0);
  }

  .btn-start {
    background: #22c55e;
    color: #fff;
  }

  .btn-stop {
    background: #ef4444;
    color: #fff;
  }

  .btn-clear {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.running {
    background: #22c55e;
    box-shadow: 0 0 0 0 #22c55e;
    animation: pulse 1.5s infinite;
  }

  .status-dot.stopped {
    background: #ef4444;
  }

  .status-dot.idle {
    background: var(--text-muted);
  }

  .status-text {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6); }
    70% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
    100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
  }
</style>
