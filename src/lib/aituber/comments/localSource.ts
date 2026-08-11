import type { CommentPlatform, CommentSource, LiveComment } from './types.ts';

/**
 * UIや開発コンソールから手動でコメントを流し込むための供給源。
 * 配信API(YouTube/Twitch)なしでキュー〜発話のパイプラインを検証できる。
 */
export class LocalCommentSource implements CommentSource {
  readonly platform: CommentPlatform = 'local';
  private handler: ((comments: LiveComment[]) => void) | null = null;
  private sequence = 0;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  start(onComments: (comments: LiveComment[]) => void): void {
    this.handler = onComments;
  }

  stop(): void {
    this.handler = null;
  }

  /** start()前に呼ばれた場合はnullを返して捨てる。 */
  push(authorName: string, text: string, overrides: Partial<LiveComment> = {}): LiveComment | null {
    if (!this.handler) return null;
    this.sequence += 1;
    const comment: LiveComment = {
      id: overrides.id ?? `local-${this.now()}-${this.sequence}`,
      platform: 'local',
      authorName,
      text,
      publishedAt: overrides.publishedAt ?? this.now(),
      ...(overrides.authorId !== undefined ? { authorId: overrides.authorId } : {}),
      ...(overrides.authorIconUrl !== undefined ? { authorIconUrl: overrides.authorIconUrl } : {}),
      ...(overrides.metadata !== undefined ? { metadata: overrides.metadata } : {}),
    };
    this.handler([comment]);
    return comment;
  }
}
