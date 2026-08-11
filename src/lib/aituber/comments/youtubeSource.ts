import type { CommentPlatform, CommentSource, LiveComment } from './types.ts';

const DEFAULT_INTERVAL_MS = 20_000;
const MIN_INTERVAL_MS = 5_000;
const DEFAULT_TIME_LIMIT_MINUTES = 10;

/** fetch・タイマー・現在時刻を注入可能にし、ブラウザ外(テスト)でも動かせるようにする。 */
export interface YouTubeSourceEnvironment {
  fetchJson(url: string): Promise<unknown>;
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
  now(): number;
}

const browserEnvironment: YouTubeSourceEnvironment = {
  fetchJson: async (url) => {
    const response = await fetch(url);
    return response.json();
  },
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export interface YouTubeCommentSourceOptions {
  /** 配信のvideo ID(URLのv=パラメータ)。 */
  liveId: string;
  /** YouTube Data API v3 のAPIキー。 */
  apiKey: string;
  /** ポーリング間隔の下限。API推奨値(pollingIntervalMillis)の方が長い場合はそちらに従う。 */
  intervalMs?: number;
  /** これより古いコメントは無視する(起動時の過去ログ大量流入を防ぐ)。 */
  timeLimitMinutes?: number;
  onError?(message: string): void;
  environment?: Partial<YouTubeSourceEnvironment>;
}

interface YouTubeVideosResponse {
  items?: Array<{ liveStreamingDetails?: { activeLiveChatId?: string } }>;
}

interface YouTubeChatItem {
  id?: string;
  authorDetails?: { displayName?: string; channelId?: string; profileImageUrl?: string };
  snippet?: {
    publishedAt?: string;
    textMessageDetails?: { messageText?: string };
    superChatDetails?: { userComment?: string };
  };
}

interface YouTubeChatResponse {
  error?: { message?: string };
  items?: YouTubeChatItem[];
  nextPageToken?: string;
  pollingIntervalMillis?: number;
}

/**
 * YouTube Live チャットをポーリングしてLiveCommentへ正規化する供給源。
 * ID重複排除はCommentQueue側に委譲し、ここでは時間制限と空コメント除去のみ行う。
 */
export class YouTubeCommentSource implements CommentSource {
  readonly platform: CommentPlatform = 'youtube';
  private handler: ((comments: LiveComment[]) => void) | null = null;
  private timerHandle: unknown = null;
  private polling = false;
  private activeLiveChatId = '';
  private nextPageToken = '';
  private readonly liveId: string;
  private readonly apiKey: string;
  private readonly intervalMs: number;
  private readonly timeLimitMs: number;
  private readonly onError: (message: string) => void;
  private readonly environment: YouTubeSourceEnvironment;

  constructor(options: YouTubeCommentSourceOptions) {
    this.liveId = options.liveId.trim();
    this.apiKey = options.apiKey.trim();
    this.intervalMs = Math.max(options.intervalMs ?? DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS);
    this.timeLimitMs = (options.timeLimitMinutes ?? DEFAULT_TIME_LIMIT_MINUTES) * 60_000;
    this.onError = options.onError ?? ((message) => console.warn('[YOUTUBE_COMMENT_SOURCE]', message));
    this.environment = { ...browserEnvironment, ...options.environment };
  }

  start(onComments: (comments: LiveComment[]) => void): void {
    if (!this.liveId || !this.apiKey) {
      this.onError('liveId と APIキーの両方が必要です');
      return;
    }
    this.stop();
    this.handler = onComments;
    this.scheduleNext(0);
  }

  stop(): void {
    if (this.timerHandle !== null) this.environment.cancel(this.timerHandle);
    this.timerHandle = null;
    this.handler = null;
  }

  /** 1回分のポーリング。次回までの推奨待機時間(ms)を返す。 */
  async pollOnce(): Promise<number> {
    if (!this.handler || this.polling) return this.intervalMs;
    this.polling = true;
    try {
      if (!this.activeLiveChatId) {
        this.activeLiveChatId = await this.resolveLiveChatId();
        if (!this.activeLiveChatId) {
          this.onError('activeLiveChatId を取得できません(配信中か確認してください)');
          return this.intervalMs;
        }
      }
      return await this.fetchComments();
    } catch (error) {
      this.onError(error instanceof Error ? error.message : String(error));
      return this.intervalMs;
    } finally {
      this.polling = false;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.handler) return;
    this.timerHandle = this.environment.schedule(() => {
      void this.pollOnce().then((nextDelay) => this.scheduleNext(nextDelay));
    }, delayMs);
  }

  private async resolveLiveChatId(): Promise<string> {
    const params = new URLSearchParams({ part: 'liveStreamingDetails', id: this.liveId, key: this.apiKey });
    const json = (await this.environment.fetchJson(
      `https://youtube.googleapis.com/youtube/v3/videos?${params}`,
    )) as YouTubeVideosResponse;
    return json.items?.[0]?.liveStreamingDetails?.activeLiveChatId ?? '';
  }

  private async fetchComments(): Promise<number> {
    const params = new URLSearchParams({ liveChatId: this.activeLiveChatId, part: 'authorDetails,snippet', key: this.apiKey });
    if (this.nextPageToken) params.set('pageToken', this.nextPageToken);
    const json = (await this.environment.fetchJson(
      `https://youtube.googleapis.com/youtube/v3/liveChat/messages?${params}`,
    )) as YouTubeChatResponse;

    if (json.error) {
      // チャット終了やID失効の可能性があるため、次サイクルでliveChatIdを再解決する。
      this.activeLiveChatId = '';
      this.nextPageToken = '';
      this.onError(json.error.message ?? 'YouTube API error');
      return this.intervalMs;
    }

    this.nextPageToken = json.nextPageToken ?? '';
    const now = this.environment.now();
    const comments: LiveComment[] = [];
    for (const item of json.items ?? []) {
      const text = item.snippet?.textMessageDetails?.messageText ?? item.snippet?.superChatDetails?.userComment ?? '';
      const authorName = item.authorDetails?.displayName ?? '';
      if (!item.id || !text.trim() || !authorName) continue;
      const parsedPublishedAt = Date.parse(item.snippet?.publishedAt ?? '');
      const publishedAt = Number.isNaN(parsedPublishedAt) ? now : parsedPublishedAt;
      if (now - publishedAt > this.timeLimitMs) continue;
      comments.push({
        id: item.id,
        platform: 'youtube',
        authorName,
        text,
        publishedAt,
        ...(item.authorDetails?.channelId ? { authorId: item.authorDetails.channelId } : {}),
        ...(item.authorDetails?.profileImageUrl ? { authorIconUrl: item.authorDetails.profileImageUrl } : {}),
      });
    }
    if (comments.length > 0) this.handler?.(comments);

    const apiRecommended = json.pollingIntervalMillis ?? 0;
    return Math.max(this.intervalMs, apiRecommended);
  }
}
