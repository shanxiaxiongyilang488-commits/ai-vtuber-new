export type CommentPlatform = 'youtube' | 'twitch' | 'local';

/** プラットフォーム差を吸収した正規形コメント。時刻はepoch ms。 */
export interface LiveComment {
  id: string;
  platform: CommentPlatform;
  authorName: string;
  text: string;
  publishedAt: number;
  authorId?: string;
  authorIconUrl?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

/** コメント供給源(YouTube/Twitch/ローカル)の最小境界。取得方式の差はここで隠蔽する。 */
export interface CommentSource {
  readonly platform: CommentPlatform;
  start(onComments: (comments: LiveComment[]) => void): void;
  stop(): void;
}

/** キューが既存チャット経路へ引き渡す1件分。promptはLLM入力、displayTextはログ表示用。 */
export interface CommentDelivery {
  comment: LiveComment;
  prompt: string;
  displayText: string;
}

/**
 * 既存チャット送信経路への接続点。
 * LLM呼び出し・Intent Router・メモリはページ側の実装をそのまま使い、ここでは関与しない。
 */
export interface CommentChatPort {
  /** 発話・思考・生成中はtrueを返し、コメント消化を保留させる。 */
  isBusy(): boolean;
  deliver(delivery: CommentDelivery): Promise<void> | void;
}

export type CommentDropReason = 'duplicate' | 'expired' | 'overflow' | 'unselected';
export type CommentSkipReason = 'busy' | 'flushing' | 'disposed';

export interface CommentQueueEvents {
  received?(comments: LiveComment[]): void;
  dropped?(comment: LiveComment, reason: CommentDropReason): void;
  delivered?(delivery: CommentDelivery): void;
  skipped?(reason: CommentSkipReason): void;
  failed?(delivery: CommentDelivery, error: unknown): void;
}

export interface CommentQueueOptions {
  maxPending?: number;
  maxBatchSize?: number;
  maxCommentAgeMs?: number;
  selectComment?(batch: LiveComment[]): LiveComment;
  buildPrompt?(comment: LiveComment): string;
  buildDisplayText?(comment: LiveComment): string;
  now?(): number;
}
