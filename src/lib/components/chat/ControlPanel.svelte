<script lang="ts">
  interface Props {
    topic?: string;
    onTopicChange?: (val: string) => void;
    onStart?: () => void;
    onStop?: () => void;
    onReset?: () => void;
    disabled?: boolean;
  }

  let {
    topic = $bindable(''),
    onTopicChange,
    onStart,
    onStop,
    onReset,
    disabled = false,
  }: Props = $props();
</script>

<div class="panel">
  <!-- Scan line accent -->
  <div class="scan-top" aria-hidden="true"></div>

  <div class="panel-inner">
    <!-- Input -->
    <div class="input-wrap">
      <span class="input-icon" aria-hidden="true">⟩</span>
      <input
        class="topic-input"
        type="text"
        placeholder="議論するトピックを入力してください..."
        value={topic}
        oninput={(e) => {
          topic = (e.target as HTMLInputElement).value;
          onTopicChange?.(topic);
        }}
        {disabled}
      />
    </div>

    <!-- Controls -->
    <div class="controls">
      <!-- Left buttons -->
      <div class="btn-group">
        <button
          class="btn btn--start"
          onclick={onStart}
          {disabled}
        >
          <span class="btn-icon">▶</span>
          会話開始
        </button>

        <button
          class="btn btn--stop"
          onclick={onStop}
          {disabled}
        >
          <span class="btn-icon">■</span>
          停止
        </button>

        <button
          class="btn btn--reset"
          onclick={onReset}
          {disabled}
        >
          <span class="btn-icon">↺</span>
          リセット
        </button>
      </div>

    </div>
  </div>
</div>

<style>
  .panel {
    position: relative;
    background: linear-gradient(180deg, rgba(10, 12, 18, 0.98) 0%, rgba(15, 17, 23, 0.95) 100%);
    border-top: 1px solid rgba(34, 211, 238, 0.2);
    padding: 0 0 20px;
  }

  .scan-top {
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(34, 211, 238, 0.6) 30%,
      rgba(168, 85, 247, 0.6) 70%,
      transparent 100%
    );
    box-shadow: 0 0 8px rgba(34, 211, 238, 0.3);
  }

  .panel-inner {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 24px 0;
  }

  /* Input */
  .input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-icon {
    position: absolute;
    left: 14px;
    font-family: 'Orbitron', monospace;
    font-size: 14px;
    color: #22d3ee;
    pointer-events: none;
    z-index: 1;
    text-shadow: 0 0 6px #22d3ee;
  }

  .topic-input {
    width: 100%;
    padding: 12px 16px 12px 36px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(34, 211, 238, 0.25);
    border-radius: 8px;
    color: #e2e8f0;
    font-family: 'Rajdhani', sans-serif;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.03em;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    caret-color: #22d3ee;
  }

  .topic-input::placeholder {
    color: #334155;
  }

  .topic-input:focus {
    border-color: rgba(34, 211, 238, 0.6);
    box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.08), inset 0 0 12px rgba(34, 211, 238, 0.03);
  }

  /* Controls row */
  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .btn-group {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* Base button */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 6px;
    border: 1px solid transparent;
    font-family: 'Rajdhani', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-icon {
    font-size: 10px;
    line-height: 1;
  }

  /* 会話開始 — cyan glow */
  .btn--start {
    background: rgba(34, 211, 238, 0.1);
    border-color: rgba(34, 211, 238, 0.5);
    color: #22d3ee;
    text-shadow: 0 0 8px rgba(34, 211, 238, 0.6);
    box-shadow: 0 0 12px rgba(34, 211, 238, 0.15);
  }

  .btn--start:hover:not(:disabled) {
    background: rgba(34, 211, 238, 0.2);
    border-color: #22d3ee;
    box-shadow: 0 0 20px rgba(34, 211, 238, 0.3), inset 0 0 10px rgba(34, 211, 238, 0.05);
  }

  /* 停止 — red */
  .btn--stop {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.4);
    color: #f87171;
    text-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
  }

  .btn--stop:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.18);
    border-color: #f87171;
    box-shadow: 0 0 16px rgba(239, 68, 68, 0.25);
  }

  /* リセット — gray */
  .btn--reset {
    background: rgba(100, 116, 139, 0.1);
    border-color: rgba(100, 116, 139, 0.35);
    color: #94a3b8;
  }

  .btn--reset:hover:not(:disabled) {
    background: rgba(100, 116, 139, 0.2);
    border-color: #94a3b8;
  }

</style>
