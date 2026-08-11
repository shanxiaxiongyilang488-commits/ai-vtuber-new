<script lang="ts">
  import type { RelationshipReviewResponse } from '$lib/memoryReview';

  let {
    review,
    characterName = 'シロ',
    developerMode = false,
    saving = false,
    savedIndexes = [],
    skippedIndexes = [],
    saveComment = '',
    saveDebug = null,
    onSaveCandidate,
    onSaveRecommended,
    onSkipCandidate,
  }: {
    review: RelationshipReviewResponse;
    characterName?: string;
    developerMode?: boolean;
    saving?: boolean;
    savedIndexes?: number[];
    skippedIndexes?: number[];
    saveComment?: string;
    saveDebug?: {
      requestPayload?: unknown;
      responseJson?: unknown;
      savedCount?: number;
      savedIds?: string[];
    } | null;
    onSaveCandidate?: (index: number) => void;
    onSaveRecommended?: () => void;
    onSkipCandidate?: (index: number) => void;
  } = $props();

  let open = $state(true);

  function stars(value: number): string {
    const filled = Math.round(Math.max(0, Math.min(1, value)) * 5);
    return `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}`;
  }

  function metric(value: number | undefined, suffix: string): string {
    return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : '-';
  }

  function recommendCount(): number {
    return review.updates.filter((update, index) => update.confidence >= 0.8 && !savedIndexes.includes(index) && !skippedIndexes.includes(index)).length;
  }
</script>

<section class="relationship-inbox" class:closed={!open} aria-label="関係性レビュー">
  <button class="inbox-toggle" type="button" onclick={() => (open = !open)} aria-expanded={open}>
    <span class="speaker">💞 {characterName}</span>
    <span class="toggle-mark">{open ? '閉じる' : '開く'}</span>
  </button>

  {#if open}
    <div class="inbox-body">
      <p class="character-comment">今日わかったことを、RootSさんとの関係として整理しました。</p>

      <div class="review-panel">
        <div class="review-heading">
          <span class="heart">💞</span>
          <div>
            <p class="review-label">関係性レビュー</p>
            <p class="review-summary">{review.summary}</p>
          </div>
        </div>

        <div class="review-actions">
          <button type="button" onclick={() => onSaveRecommended?.()} disabled={saving || recommendCount() === 0}>
            {saving ? '記憶中...' : 'おすすめを記憶'}
          </button>
          {#if saveComment}
            <span class="saved-comment">💞 {saveComment}</span>
          {/if}
        </div>

        {#if review.updates.length > 0}
          <div class="candidate-list">
            {#each review.updates as update, index (`${update.category}:${update.key}:${index}`)}
              <article class="candidate">
                <div class="candidate-stars" aria-label={`${Math.round(update.confidence * 100)}%`}>
                  {stars(update.confidence)}
                </div>
                <div class="candidate-copy">
                  <p class="candidate-title">{update.key} <small>{update.category}</small></p>
                  <p class="candidate-summary">{update.value}</p>
                  {#if savedIndexes.includes(index)}
                    <p class="candidate-status">💞 記憶済み</p>
                  {:else if skippedIndexes.includes(index)}
                    <p class="candidate-status muted">今回は覚えない</p>
                  {:else}
                    <div class="candidate-actions">
                      <button type="button" onclick={() => onSaveCandidate?.(index)} disabled={saving}>記憶する</button>
                      <button class="quiet" type="button" onclick={() => onSkipCandidate?.(index)} disabled={saving}>今回は覚えない</button>
                    </div>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <p class="empty">今日は関係性として新しく覚えることはありませんでした。</p>
        {/if}
      </div>

      {#if developerMode}
        <details class="developer-log">
          <summary>Developer Log</summary>
          <div class="developer-metrics">
            <span>Model: {review.cost?.model ?? '-'}</span>
            <span>Latency: {metric(review.cost?.latencyMs, 'ms')}</span>
            <span>Token Usage: Input {metric(review.cost?.inputTokens, ' tokens')} / Output {metric(review.cost?.outputTokens, ' tokens')}</span>
            <span>Confidence: {review.updates[0]?.confidence?.toFixed(2) ?? '-'}</span>
            <span>Saved Count: {saveDebug?.savedCount ?? 0}</span>
            <span>Saved IDs: {saveDebug?.savedIds?.join(', ') || '-'}</span>
          </div>
          {#if saveDebug?.requestPayload}
            <p class="developer-subhead">Request Payload</p>
            <pre>{JSON.stringify(saveDebug.requestPayload, null, 2)}</pre>
          {/if}
          {#if saveDebug?.responseJson}
            <p class="developer-subhead">Response JSON</p>
            <pre>{JSON.stringify(saveDebug.responseJson, null, 2)}</pre>
          {/if}
          <p class="developer-subhead">関係性レビュー JSON</p>
          <pre>{JSON.stringify(review, null, 2)}</pre>
        </details>
      {/if}
    </div>
  {/if}
</section>

<style>
  .relationship-inbox {
    display: grid;
    gap: 0;
    margin: 14px 0;
    border: 1px solid rgba(244, 114, 182, 0.28);
    border-radius: 8px;
    background:
      linear-gradient(135deg, rgba(244, 114, 182, 0.08), rgba(34, 211, 238, 0.05)),
      rgba(2, 6, 23, 0.76);
    box-shadow: 0 0 18px rgba(244, 114, 182, 0.12), inset 0 0 14px rgba(244, 114, 182, 0.04);
    overflow: hidden;
  }
  .relationship-inbox.closed {
    background: rgba(2, 6, 23, 0.62);
  }
  .inbox-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 11px 13px;
    border: none;
    border-radius: 0;
    background: rgba(15, 23, 42, 0.46);
    color: #e2e8f0;
    font: inherit;
    cursor: pointer;
  }
  .speaker { color: #f8fafc; font-size: 14px; font-weight: 900; }
  .toggle-mark { color: #94a3b8; font-size: 12px; font-weight: 800; }
  .inbox-body { display: grid; gap: 12px; padding: 12px; }
  .character-comment { margin: 0; color: #f8fafc; font-size: 15px; font-weight: 800; line-height: 1.55; overflow-wrap: anywhere; }
  .review-panel { display: grid; gap: 12px; padding: 12px; border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 8px; background: rgba(15, 23, 42, 0.6); }
  .review-heading { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; }
  .heart { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid rgba(244, 114, 182, 0.32); border-radius: 999px; background: rgba(244, 114, 182, 0.08); }
  .review-label { margin: 0 0 3px; color: #f9a8d4; font-size: 13px; font-weight: 900; letter-spacing: 0.04em; }
  .review-summary, .candidate-summary, .empty { margin: 0; color: #cbd5e1; font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
  .candidate-list { display: grid; gap: 9px; }
  .candidate { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 10px; align-items: start; padding: 9px 0; border-top: 1px solid rgba(148, 163, 184, 0.13); }
  .candidate:first-child { border-top: none; padding-top: 0; }
  .candidate-stars { color: #fde68a; font-size: 13px; font-weight: 900; white-space: nowrap; }
  .candidate-copy { min-width: 0; }
  .candidate-title { margin: 0 0 3px; color: #f8fafc; font-size: 15px; font-weight: 900; overflow-wrap: anywhere; }
  .candidate-title small { margin-left: 6px; color: #94a3b8; font-size: 11px; font-weight: 800; white-space: nowrap; }
  .review-actions, .candidate-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .review-actions button, .candidate-actions button {
    padding: 6px 10px;
    border: 1px solid rgba(244, 114, 182, 0.36);
    border-radius: 6px;
    background: rgba(244, 114, 182, 0.08);
    color: #fbcfe8;
    font: inherit;
    font-size: 12px;
    font-weight: 900;
    cursor: pointer;
  }
  .review-actions button:disabled, .candidate-actions button:disabled { cursor: not-allowed; opacity: .48; }
  .candidate-actions .quiet { border-color: rgba(148, 163, 184, 0.26); background: rgba(148, 163, 184, 0.06); color: #cbd5e1; }
  .saved-comment, .candidate-status { margin: 0; color: #f9a8d4; font-size: 13px; font-weight: 900; line-height: 1.45; }
  .candidate-status { margin-top: 7px; }
  .candidate-status.muted { color: #94a3b8; }
  .developer-log { padding-top: 8px; border-top: 1px solid rgba(148, 163, 184, 0.16); }
  .developer-log summary { color: #94a3b8; cursor: pointer; font-size: 12px; font-weight: 900; }
  .developer-metrics { display: grid; gap: 4px; margin-top: 8px; padding: 8px; border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 6px; background: rgba(2, 6, 23, 0.68); }
  .developer-metrics span, .developer-log pre, .developer-subhead { color: #bce8ff; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
  .developer-subhead { margin: 8px 0 0; color: #94a3b8; font-weight: 900; }
  .developer-log pre { max-height: 220px; margin: 8px 0 0; padding: 10px; overflow: auto; border-radius: 6px; background: #020617; white-space: pre; }
</style>
