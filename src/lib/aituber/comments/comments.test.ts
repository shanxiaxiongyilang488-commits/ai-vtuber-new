import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDefaultCommentDisplayText,
  buildDefaultCommentPrompt,
  CommentQueue,
  selectNewestComment,
} from './commentQueue.ts';
import { LocalCommentSource } from './localSource.ts';
import { YouTubeCommentSource, type YouTubeSourceEnvironment } from './youtubeSource.ts';
import type { CommentChatPort, CommentDelivery, CommentDropReason, CommentSkipReason, LiveComment } from './types.ts';

const NOW = 2_000_000_000_000;

function makeComment(id: string, overrides: Partial<LiveComment> = {}): LiveComment {
  return {
    id,
    platform: 'local',
    authorName: 'テスト視聴者',
    text: `コメント ${id}`,
    publishedAt: NOW,
    ...overrides,
  };
}

interface RecordingChat extends CommentChatPort {
  deliveries: CommentDelivery[];
  busy: boolean;
  failNext: boolean;
}

function makeChat(): RecordingChat {
  const chat: RecordingChat = {
    deliveries: [],
    busy: false,
    failNext: false,
    isBusy: () => chat.busy,
    deliver: (delivery) => {
      if (chat.failNext) {
        chat.failNext = false;
        throw new Error('deliver failed');
      }
      chat.deliveries.push(delivery);
    },
  };
  return chat;
}

test('duplicate comment ids are dropped and queued only once', () => {
  const chat = makeChat();
  const dropped: Array<[string, CommentDropReason]> = [];
  const queue = new CommentQueue(chat, { dropped: (c, reason) => dropped.push([c.id, reason]) }, { now: () => NOW });
  queue.enqueue([makeComment('a')]);
  queue.enqueue([makeComment('a')]);
  assert.equal(queue.size(), 1);
  assert.deepEqual(dropped, [['a', 'duplicate']]);
});

test('expired comments are dropped on enqueue', () => {
  const chat = makeChat();
  const dropped: Array<[string, CommentDropReason]> = [];
  const queue = new CommentQueue(
    chat,
    { dropped: (c, reason) => dropped.push([c.id, reason]) },
    { now: () => NOW, maxCommentAgeMs: 60_000 },
  );
  queue.enqueue([makeComment('old', { publishedAt: NOW - 120_000 }), makeComment('fresh')]);
  assert.equal(queue.size(), 1);
  assert.deepEqual(dropped, [['old', 'expired']]);
});

test('overflow trims the oldest pending comments', () => {
  const chat = makeChat();
  const dropped: Array<[string, CommentDropReason]> = [];
  const queue = new CommentQueue(
    chat,
    { dropped: (c, reason) => dropped.push([c.id, reason]) },
    { now: () => NOW, maxPending: 2 },
  );
  queue.enqueue([makeComment('a'), makeComment('b'), makeComment('c')]);
  assert.equal(queue.size(), 2);
  assert.deepEqual(dropped, [['a', 'overflow']]);
});

test('flush is skipped while the character is busy', async () => {
  const chat = makeChat();
  chat.busy = true;
  const skipped: CommentSkipReason[] = [];
  const queue = new CommentQueue(chat, { skipped: (reason) => skipped.push(reason) }, { now: () => NOW });
  queue.enqueue([makeComment('a')]);
  assert.equal(await queue.flush(), false);
  assert.deepEqual(skipped, ['busy']);
  assert.equal(queue.size(), 1);

  chat.busy = false;
  assert.equal(await queue.flush(), true);
  assert.equal(chat.deliveries.length, 1);
});

test('flush selects the newest comment and marks the rest unselected', async () => {
  const chat = makeChat();
  const dropped: Array<[string, CommentDropReason]> = [];
  const queue = new CommentQueue(chat, { dropped: (c, reason) => dropped.push([c.id, reason]) }, { now: () => NOW });
  queue.enqueue([
    makeComment('a', { publishedAt: NOW - 3000 }),
    makeComment('b', { publishedAt: NOW - 1000, authorName: '花子', text: 'こんにちは' }),
    makeComment('c', { publishedAt: NOW - 2000 }),
  ]);
  assert.equal(await queue.flush(), true);
  assert.equal(queue.size(), 0);
  assert.deepEqual(dropped.map(([id]) => id).sort(), ['a', 'c']);

  const delivery = chat.deliveries[0];
  assert.equal(delivery.comment.id, 'b');
  assert.equal(delivery.displayText, '「花子」さんのコメント: こんにちは');
  assert.match(delivery.prompt, /花子/);
  assert.match(delivery.prompt, /こんにちは/);
});

test('delivery failure emits failed and consumes the batch', async () => {
  const chat = makeChat();
  chat.failNext = true;
  const failures: string[] = [];
  const queue = new CommentQueue(chat, { failed: (delivery) => failures.push(delivery.comment.id) }, { now: () => NOW });
  queue.enqueue([makeComment('a')]);
  assert.equal(await queue.flush(), false);
  assert.deepEqual(failures, ['a']);
  assert.equal(queue.size(), 0);
});

test('dispose stops sources and blocks further enqueue and flush', async () => {
  const chat = makeChat();
  const source = new LocalCommentSource(() => NOW);
  const queue = new CommentQueue(chat, {}, { now: () => NOW });
  queue.attachSource(source);
  queue.dispose();
  assert.equal(source.push('太郎', '届かないコメント'), null);
  queue.enqueue([makeComment('a')]);
  assert.equal(queue.size(), 0);
  assert.equal(await queue.flush(), false);
});

test('local source flows comments into the queue', () => {
  const chat = makeChat();
  const source = new LocalCommentSource(() => NOW);
  const queue = new CommentQueue(chat, {}, { now: () => NOW });
  queue.attachSource(source);
  const pushed = source.push('太郎', 'やっほー');
  assert.ok(pushed);
  assert.equal(queue.size(), 1);
});

test('selection and formatting helpers behave deterministically', () => {
  const oldest = makeComment('a', { publishedAt: NOW - 5000 });
  const newest = makeComment('b', { publishedAt: NOW, authorName: '次郎', text: 'テスト' });
  assert.equal(selectNewestComment([oldest, newest]).id, 'b');
  assert.equal(buildDefaultCommentDisplayText(newest), '「次郎」さんのコメント: テスト');
  assert.match(buildDefaultCommentPrompt(newest), /次郎/);
});

interface FakeYouTubeEnv {
  env: YouTubeSourceEnvironment;
  scheduled: Array<{ callback: () => void; delayMs: number }>;
  cancelled: unknown[];
  urls: string[];
}

function makeYouTubeEnv(videosResponse: unknown, messagesResponses: unknown[]): FakeYouTubeEnv {
  const scheduled: FakeYouTubeEnv['scheduled'] = [];
  const cancelled: unknown[] = [];
  const urls: string[] = [];
  let messagesCall = 0;
  return {
    scheduled,
    cancelled,
    urls,
    env: {
      fetchJson: async (url) => {
        urls.push(url);
        if (url.includes('/videos?')) return videosResponse;
        const response = messagesResponses[Math.min(messagesCall, messagesResponses.length - 1)];
        messagesCall += 1;
        return response;
      },
      schedule: (callback, delayMs) => {
        scheduled.push({ callback: callback as () => void, delayMs });
        return scheduled.length;
      },
      cancel: (handle) => {
        cancelled.push(handle);
      },
      now: () => NOW,
    },
  };
}

function chatItem(id: string, text: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    id,
    authorDetails: { displayName: '視聴者A', channelId: 'ch-1', profileImageUrl: 'https://example.test/icon.png' },
    snippet: { publishedAt: new Date(NOW - 1000).toISOString(), textMessageDetails: { messageText: text } },
    ...overrides,
  };
}

const VIDEOS_OK = { items: [{ liveStreamingDetails: { activeLiveChatId: 'chat-1' } }] };

test('youtube source normalizes chat items into LiveComment', async () => {
  const received: LiveComment[][] = [];
  const fake = makeYouTubeEnv(VIDEOS_OK, [
    { items: [chatItem('yt-1', 'こんにちは')], nextPageToken: 'p2', pollingIntervalMillis: 3000 },
  ]);
  const source = new YouTubeCommentSource({ liveId: 'live-1', apiKey: 'key', environment: fake.env });
  source.start((comments) => received.push(comments));
  const nextDelay = await source.pollOnce();

  assert.equal(received.length, 1);
  const comment = received[0][0];
  assert.equal(comment.id, 'yt-1');
  assert.equal(comment.platform, 'youtube');
  assert.equal(comment.authorName, '視聴者A');
  assert.equal(comment.authorId, 'ch-1');
  assert.equal(comment.text, 'こんにちは');
  assert.equal(comment.publishedAt, NOW - 1000);
  // API推奨値(3000)よりintervalMs下限の方が長いのでそちらに従う
  assert.equal(nextDelay, 20_000);
});

test('youtube source honors a longer API-recommended polling interval', async () => {
  const fake = makeYouTubeEnv(VIDEOS_OK, [{ items: [], pollingIntervalMillis: 45_000 }]);
  const source = new YouTubeCommentSource({ liveId: 'live-1', apiKey: 'key', environment: fake.env });
  source.start(() => {});
  assert.equal(await source.pollOnce(), 45_000);
});

test('youtube source skips expired and empty comments', async () => {
  const received: LiveComment[][] = [];
  const fake = makeYouTubeEnv(VIDEOS_OK, [
    {
      items: [
        chatItem('yt-old', '古い', {
          snippet: { publishedAt: new Date(NOW - 20 * 60_000).toISOString(), textMessageDetails: { messageText: '古い' } },
        }),
        chatItem('yt-empty', ''),
        chatItem('yt-ok', '生きてる'),
      ],
    },
  ]);
  const source = new YouTubeCommentSource({ liveId: 'live-1', apiKey: 'key', environment: fake.env });
  source.start((comments) => received.push(comments));
  await source.pollOnce();
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].map((comment) => comment.id), ['yt-ok']);
});

test('youtube source reports API errors and re-resolves the chat id next cycle', async () => {
  const errors: string[] = [];
  const fake = makeYouTubeEnv(VIDEOS_OK, [
    { error: { message: 'The live chat is no longer live.' } },
    { items: [] },
  ]);
  const source = new YouTubeCommentSource({
    liveId: 'live-1',
    apiKey: 'key',
    environment: fake.env,
    onError: (message) => errors.push(message),
  });
  source.start(() => {});
  await source.pollOnce();
  assert.deepEqual(errors, ['The live chat is no longer live.']);

  await source.pollOnce();
  const videoCalls = fake.urls.filter((url) => url.includes('/videos?')).length;
  assert.equal(videoCalls, 2);
});

test('youtube source refuses to start without credentials and stop cancels the timer', async () => {
  const errors: string[] = [];
  const fake = makeYouTubeEnv(VIDEOS_OK, [{ items: [] }]);
  const noCredentials = new YouTubeCommentSource({
    liveId: '',
    apiKey: '',
    environment: fake.env,
    onError: (message) => errors.push(message),
  });
  noCredentials.start(() => {});
  assert.equal(errors.length, 1);
  assert.equal(fake.scheduled.length, 0);

  const source = new YouTubeCommentSource({ liveId: 'live-1', apiKey: 'key', environment: fake.env });
  source.start(() => {});
  assert.equal(fake.scheduled.length, 1);
  assert.equal(fake.scheduled[0].delayMs, 0);
  source.stop();
  assert.equal(fake.cancelled.length, 1);
  // stop後はpollOnceがフェッチせず即座に戻る
  const urlCountAfterStop = fake.urls.length;
  await source.pollOnce();
  assert.equal(fake.urls.length, urlCountAfterStop);
});
