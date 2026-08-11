<script lang="ts">
  import type { BrainEmotionState, EmotionReviewResponse } from '$lib/memoryReview';

  let {
    review,
    saved = null,
    saveComment = '',
    developerMode = false,
    saveDebug = null,
    history = [],
  }: {
    review: EmotionReviewResponse;
    saved?: BrainEmotionState | null;
    saveComment?: string;
    developerMode?: boolean;
    saveDebug?: {
      requestPayload?: unknown;
      responseJson?: unknown;
      latencyMs?: number;
    } | null;
    history?: BrainEmotionState[];
  } = $props();

  let open = $state(true);

  const labels: Record<string, { icon: string; text: string }> = {
    happy: { icon: '😊', text: 'うれしい' },
    thinking: { icon: '🤔', text: '考えています' },
    excited: { icon: '✨', text: 'わくわくしています' },
    curious: { icon: '👀', text: '知りたがっています' },
    sleepy: { icon: '🌙', text: '少し眠そうです' },
    calm: { icon: '🍵', text: '落ち着いています' },
    worried: { icon: '💭', text: '少し心配しています' },
    sad: { icon: '☔', text: '少しさみしそうです' },
  };

  const current = $derived(labels[review.emotion] ?? labels.calm);

  function percent(value: number): string {
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  }
</script>

<section class="emotion-card" class:closed={!open} aria-label="Emotion Review">
  <button class="emotion-toggle" type="button" onclick={() => (open = !open)} aria-expanded={open}>
    <span>{current.icon} 今日の気持ち</span>
    <span>{open ? '閉じる' : '開く'}</span>
  </button>

  {#if open}
    <div class="emotion-body">
      <div class="emotion-main">
        <div class="emotion-icon">{current.icon}</div>
        <div>
          <p class="emotion-label">{current.text}</p>
          <p class="emotion-reason">{review.reason}</p>
        </div>
      </div>

      <div class="emotion-meter">
        <span>Intensity</span>
        <strong>{percent(review.intensity)}</strong>
        <div><i style={`width:${percent(review.intensity)}`}></i></div>
      </div>

      {#if saved}
        <p class="saved">🫀 Brainへ保存しました</p>
      {/if}
      {#if saveComment}
        <p class="comment">{saveComment}</p>
      {/if}

      {#if developerMode}
        <details class="developer-log">
          <summary>Developer Log</summary>
          <div class="developer-metrics">
            <span>Emotion: {review.emotion}</span>
            <span>Intensity: {review.intensity.toFixed(2)}</span>
            <span>Confidence: {review.confidence.toFixed(2)}</span>
            <span>Latency: {review.cost?.latencyMs ?? saveDebug?.latencyMs ?? '-'}ms</span>
            <span>History: {history.length}</span>
          </div>
          <p class="developer-subhead">Emotion JSON</p>
          <pre>{JSON.stringify(review, null, 2)}</pre>
          {#if saveDebug?.requestPayload}
            <p class="developer-subhead">Save Request</p>
            <pre>{JSON.stringify(saveDebug.requestPayload, null, 2)}</pre>
          {/if}
          {#if saveDebug?.responseJson}
            <p class="developer-subhead">Save Response</p>
            <pre>{JSON.stringify(saveDebug.responseJson, null, 2)}</pre>
          {/if}
          <p class="developer-subhead">History</p>
          <pre>{JSON.stringify(history, null, 2)}</pre>
        </details>
      {/if}
    </div>
  {/if}
</section>

<style>
  .emotion-card {
    margin: 14px 0;
    border: 1px solid rgba(74, 222, 128, 0.26);
    border-radius: 8px;
    background:
      linear-gradient(135deg, rgba(74, 222, 128, 0.08), rgba(34, 211, 238, 0.05)),
      rgba(2, 6, 23, 0.76);
    overflow: hidden;
  }
  .emotion-card.closed { background: rgba(2, 6, 23, 0.62); }
  .emotion-toggle {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 11px 13px;
    border: none;
    border-radius: 0;
    background: rgba(15, 23, 42, 0.46);
    color: #f8fafc;
    font: inherit;
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
  }
  .emotion-toggle span:last-child { color: #94a3b8; font-size: 12px; }
  .emotion-body { display: grid; gap: 12px; padding: 12px; }
  .emotion-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    padding: 12px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.6);
  }
  .emotion-icon { font-size: 30px; line-height: 1; }
  .emotion-label { margin: 0 0 4px; color: #bbf7d0; font-size: 16px; font-weight: 900; }
  .emotion-reason { margin: 0; color: #cbd5e1; font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
  .emotion-meter {
    display: grid;
    grid-template-columns: auto auto;
    gap: 6px 10px;
    align-items: center;
  }
  .emotion-meter span { color: #94a3b8; font-size: 12px; font-weight: 900; }
  .emotion-meter strong { color: #bbf7d0; font-size: 13px; text-align: right; }
  .emotion-meter div {
    grid-column: 1 / -1;
    height: 9px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.9);
  }
  .emotion-meter i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #86efac, #67e8f9);
  }
  .saved, .comment { margin: 0; color: #86efac; font-size: 13px; font-weight: 900; }
  .comment { color: #e2e8f0; font-weight: 800; }
  .developer-log { padding-top: 8px; border-top: 1px solid rgba(148, 163, 184, 0.16); }
  .developer-log summary { color: #94a3b8; cursor: pointer; font-size: 12px; font-weight: 900; }
  .developer-metrics { display: grid; gap: 4px; margin-top: 8px; padding: 8px; border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 6px; background: rgba(2, 6, 23, 0.68); }
  .developer-metrics span, .developer-log pre, .developer-subhead { color: #bce8ff; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
  .developer-subhead { margin: 8px 0 0; color: #94a3b8; font-weight: 900; }
  .developer-log pre { max-height: 220px; margin: 8px 0 0; padding: 10px; overflow: auto; border-radius: 6px; background: #020617; white-space: pre; }
</style>
