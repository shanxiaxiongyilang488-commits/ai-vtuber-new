import type {
  CommentChatPort,
  CommentDelivery,
  CommentQueueEvents,
  CommentQueueOptions,
  CommentSource,
  LiveComment,
} from './types.ts';

const DEFAULTS: Required<Pick<CommentQueueOptions, 'maxPending' | 'maxBatchSize' | 'maxCommentAgeMs'>> = {
  maxPending: 200,
  maxBatchSize: 50,
  maxCommentAgeMs: 10 * 60_000,
};

/** 重複判定用に保持するコメントIDの上限。超過時は古い半分を捨てる。 */
const SEEN_ID_LIMIT = 1000;

export function selectNewestComment(batch: LiveComment[]): LiveComment {
  return batch.reduce((selected, candidate) => (candidate.publishedAt >= selected.publishedAt ? candidate : selected));
}

export function buildDefaultCommentPrompt(comment: LiveComment): string {
  return [
    `視聴者「${comment.authorName}」さんからコメントが届きました。配信者として短く自然に反応してください。`,
    `コメント: ${comment.text}`,
  ].join('\n');
}

export function buildDefaultCommentDisplayText(comment: LiveComment): string {
  return `「${comment.authorName}」さんのコメント: ${comment.text}`;
}

/**
 * コメント源から届いた発言を溜め、キャラクターが手隙のときだけ1件選んで既存チャット経路へ流す。
 * 発話・思考中(CommentChatPort.isBusy)は消化を保留し、会話への割り込みを防ぐ。
 */
export class CommentQueue {
  private pending: LiveComment[] = [];
  private readonly seenIds = new Set<string>();
  private readonly sources = new Set<CommentSource>();
  private flushing = false;
  private disposed = false;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private readonly chat: CommentChatPort;
  private readonly events: CommentQueueEvents;
  private readonly maxPending: number;
  private readonly maxBatchSize: number;
  private readonly maxCommentAgeMs: number;
  private readonly selectComment: (batch: LiveComment[]) => LiveComment;
  private readonly buildPrompt: (comment: LiveComment) => string;
  private readonly buildDisplayText: (comment: LiveComment) => string;
  private readonly now: () => number;

  constructor(chat: CommentChatPort, events: CommentQueueEvents = {}, options: CommentQueueOptions = {}) {
    this.chat = chat;
    this.events = events;
    this.maxPending = options.maxPending ?? DEFAULTS.maxPending;
    this.maxBatchSize = options.maxBatchSize ?? DEFAULTS.maxBatchSize;
    this.maxCommentAgeMs = options.maxCommentAgeMs ?? DEFAULTS.maxCommentAgeMs;
    this.selectComment = options.selectComment ?? selectNewestComment;
    this.buildPrompt = options.buildPrompt ?? buildDefaultCommentPrompt;
    this.buildDisplayText = options.buildDisplayText ?? buildDefaultCommentDisplayText;
    this.now = options.now ?? Date.now;
  }

  /** 供給源を接続し、届いたコメントを自動でenqueueする。dispose()時にまとめてstopされる。 */
  attachSource(source: CommentSource): void {
    if (this.disposed || this.sources.has(source)) return;
    this.sources.add(source);
    source.start((comments) => this.enqueue(comments));
  }

  detachSource(source: CommentSource): void {
    if (!this.sources.delete(source)) return;
    source.stop();
  }

  enqueue(comments: LiveComment[]): void {
    if (this.disposed || comments.length === 0) return;
    const accepted: LiveComment[] = [];
    for (const comment of comments) {
      if (this.seenIds.has(comment.id)) {
        this.events.dropped?.(comment, 'duplicate');
        continue;
      }
      this.rememberId(comment.id);
      if (this.now() - comment.publishedAt > this.maxCommentAgeMs) {
        this.events.dropped?.(comment, 'expired');
        continue;
      }
      accepted.push(comment);
    }
    if (accepted.length === 0) return;
    this.pending.push(...accepted);
    this.events.received?.(accepted);
    while (this.pending.length > this.maxPending) {
      const overflow = this.pending.shift();
      if (overflow) this.events.dropped?.(overflow, 'overflow');
    }
  }

  /** 1件選んで配送する。配送できたらtrue。busy/空/多重呼び出し時は何もしない。 */
  async flush(): Promise<boolean> {
    if (this.disposed) {
      this.events.skipped?.('disposed');
      return false;
    }
    if (this.flushing) {
      this.events.skipped?.('flushing');
      return false;
    }
    if (this.pending.length === 0) return false;
    if (this.chat.isBusy()) {
      this.events.skipped?.('busy');
      return false;
    }
    this.flushing = true;
    try {
      const batch = this.pending.splice(0, this.maxBatchSize);
      const selected = this.selectComment(batch);
      for (const comment of batch) {
        if (comment !== selected) this.events.dropped?.(comment, 'unselected');
      }
      const delivery: CommentDelivery = {
        comment: selected,
        prompt: this.buildPrompt(selected),
        displayText: this.buildDisplayText(selected),
      };
      try {
        await this.chat.deliver(delivery);
        this.events.delivered?.(delivery);
        return true;
      } catch (error) {
        this.events.failed?.(delivery, error);
        return false;
      }
    } finally {
      this.flushing = false;
    }
  }

  startAutoFlush(intervalMs = 1000): void {
    this.stopAutoFlush();
    if (this.disposed) return;
    this.timerId = setInterval(() => {
      void this.flush();
    }, intervalMs);
  }

  stopAutoFlush(): void {
    if (this.timerId !== null) clearInterval(this.timerId);
    this.timerId = null;
  }

  size(): number {
    return this.pending.length;
  }

  clear(): void {
    this.pending = [];
  }

  dispose(): void {
    this.disposed = true;
    this.stopAutoFlush();
    for (const source of this.sources) source.stop();
    this.sources.clear();
    this.pending = [];
  }

  private rememberId(id: string): void {
    this.seenIds.add(id);
    if (this.seenIds.size <= SEEN_ID_LIMIT) return;
    let removeCount = Math.floor(SEEN_ID_LIMIT / 2);
    for (const seen of this.seenIds) {
      if (removeCount <= 0) break;
      this.seenIds.delete(seen);
      removeCount -= 1;
    }
  }
}
