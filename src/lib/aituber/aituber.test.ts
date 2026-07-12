import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CharacterRuntime } from './characterRuntime.ts';
import { AudioLevelAnalyser, type AudioAnalyserEnvironment } from './audioAnalyser.ts';
import { mapExistingEmotion } from './emotionMapper.ts';
import { AITuberBridge } from './aituberBridge.ts';
import type { AvatarEmotion, AvatarStatePort } from './types.ts';
import { evaluateProactiveEligibility } from './proactiveConversation.ts';
import { DEFAULT_PROACTIVE_SETTINGS, hasStoredProactiveSettings, loadProactiveSettings } from './settings.ts';
import { orderSpeechRequests, SpeechQueue, type AudioLike } from './speechQueue.ts';
import type { SpeechRequest, VoiceAdapter } from './types.ts';

const NOW = 2_000_000_000_000;

function runtimeAtIdle(): CharacterRuntime {
  const runtime = new CharacterRuntime('shiro', undefined, NOW - 20 * 60_000);
  return runtime;
}

test('proactive guard accepts an eligible idle character', () => {
  const result = evaluateProactiveEligibility({
    runtime: runtimeAtIdle().get(),
    settings: DEFAULT_PROACTIVE_SETTINGS,
    now: NOW,
    pageHidden: false,
    busy: false,
  });
  assert.deepEqual(result, { eligible: true });
});

test('proactive guard rejects hidden, busy, cooldown, hourly limit, and unanswered proactive states', () => {
  const base = runtimeAtIdle();
  const input = { runtime: base.get(), settings: DEFAULT_PROACTIVE_SETTINGS, now: NOW, pageHidden: false, busy: false };
  assert.equal(evaluateProactiveEligibility({ ...input, pageHidden: true }).reason, 'page_hidden');
  assert.equal(evaluateProactiveEligibility({ ...input, busy: true }).reason, 'busy');

  base.recordProactive(NOW - 60_000);
  assert.equal(evaluateProactiveEligibility({ ...input, runtime: base.get() }).reason, 'awaiting_user');
  base.recordUserActivity(NOW - 20 * 60_000);
  assert.equal(evaluateProactiveEligibility({ ...input, runtime: base.get() }).reason, 'cooldown');

  const limited = {
    ...base.get(),
    lastProactiveAt: NOW - 20 * 60_000,
    proactiveTimestamps: [NOW - 10_000, NOW - 20_000, NOW - 30_000],
  };
  assert.equal(evaluateProactiveEligibility({ ...input, runtime: limited }).reason, 'hourly_limit');
});

test('user activity releases the unanswered proactive guard', () => {
  const runtime = runtimeAtIdle();
  runtime.recordProactive(NOW - 20 * 60_000);
  assert.equal(runtime.get().awaitingUserAfterProactive, true);
  runtime.recordUserActivity(NOW - 10 * 60_000);
  assert.equal(runtime.get().awaitingUserAfterProactive, false);
});

test('speech requests are ordered with normal replies before proactive messages', () => {
  const make = (id: string, origin: SpeechRequest['origin'], createdAt: number): SpeechRequest => ({
    id, origin, createdAt, characterId: 'shiro', messageId: id, text: id,
  });
  const ordered = orderSpeechRequests([make('p1', 'proactive', 1), make('p2', 'proactive', 2), make('u1', 'user_reply', 3)]);
  assert.deepEqual(ordered.map((item) => item.id), ['u1', 'p1', 'p2']);
});

test('speech queue serializes playback and preserves pending priority', async () => {
  const started: string[] = [];
  const voice: VoiceAdapter = { async synthesize(_characterId, text) { return { url: text }; } };
  class FakeAudio implements AudioLike {
    currentTime = 0;
    listeners = new Map<string, () => void>();
    constructor(_url: string) {}
    addEventListener(type: string, listener: () => void): void { this.listeners.set(type, listener); }
    removeEventListener(type: string): void { this.listeners.delete(type); }
    async play(): Promise<void> { queueMicrotask(() => this.listeners.get('ended')?.()); }
    pause(): void {}
  }
  const queue = new SpeechQueue(voice, { started: (request) => started.push(request.id) }, (url) => new FakeAudio(url));
  const make = (id: string, origin: SpeechRequest['origin']): SpeechRequest => ({ id, origin, createdAt: Number(id.slice(1)) || 0, characterId: 'shiro', messageId: id, text: id });
  queue.enqueue(make('p1', 'proactive'));
  queue.enqueue(make('p2', 'proactive'));
  queue.enqueue(make('u3', 'user_reply'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(started, ['p1', 'u3', 'p2']);
  assert.equal(queue.size(), 0);
  queue.dispose();
});

test('speech queue stop clears pending playback', async () => {
  let release: (() => void) | undefined;
  const voice: VoiceAdapter = {
    synthesize: async () => new Promise((resolve) => { release = () => resolve({ url: 'audio' }); }),
  };
  const queue = new SpeechQueue(voice, {}, () => { throw new Error('audio should not start after stop'); });
  const request = (id: string): SpeechRequest => ({ id, origin: 'proactive', createdAt: 1, characterId: 'shiro', messageId: id, text: id });
  queue.enqueue(request('one'));
  queue.enqueue(request('two'));
  queue.stop();
  release?.();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(queue.size(), 0);
  queue.dispose();
});

test('settings and event modules are SSR safe without browser globals', () => {
  assert.deepEqual(loadProactiveSettings('shiro'), DEFAULT_PROACTIVE_SETTINGS);
  assert.equal(hasStoredProactiveSettings('shiro'), false);
});

test('proactive chat adapter never calls the Intent Router', async () => {
  const source = await readFile(new URL('./adapters/chatAdapter.ts', import.meta.url), 'utf8');
  assert.match(source, /route:\s*'chat'/);
  assert.doesNotMatch(source, /\/api\/intent-router/);
});

test('existing emotion values are mapped without an external classifier', () => {
  assert.equal(mapExistingEmotion({ emotion: 'excited' }), 'happy');
  assert.equal(mapExistingEmotion({ label: '悲しい' }), 'sad');
  assert.equal(mapExistingEmotion('angry'), 'angry');
  assert.equal(mapExistingEmotion('びっくり'), 'surprised');
  assert.equal(mapExistingEmotion(undefined), 'neutral');
  assert.equal(mapExistingEmotion('unmapped-custom-state'), 'neutral');
});

test('audio analyser is SSR safe and does not initialize Web Audio on construction', async () => {
  const levels: number[] = [];
  const analyser = new AudioLevelAnalyser((level) => levels.push(level));
  assert.equal(analyser.attach({} as HTMLAudioElement), false);
  assert.deepEqual(levels, []);
  await analyser.dispose();
  assert.deepEqual(levels, [0]);
});

test('bridge terminal callbacks reset speaking through the runtime boundary', async () => {
  const calls: Array<[string, unknown]> = [];
  const avatar: AvatarStatePort = {
    setSpeaking: (value) => calls.push(['speaking', value]),
    setMouthLevel: (value) => calls.push(['mouthLevel', value]),
    setEmotion: (value: AvatarEmotion) => calls.push(['emotion', value]),
    setThinking: (value) => calls.push(['thinking', value]),
    reset: () => calls.push(['reset', true]),
  };
  const bridge = new AITuberBridge(avatar);
  bridge.speechFinished();
  bridge.speechFailed();
  assert.equal(calls.filter(([key, value]) => key === 'speaking' && value === false).length, 2);
  assert.equal(calls.filter(([key, value]) => key === 'mouthLevel' && value === 0).length, 2);
  await bridge.dispose();
  assert.ok(calls.some(([key]) => key === 'reset'));
});

test('audio analyser reuses one context, disconnects old sources, and closes on dispose', async () => {
  class FakeAudio {
    listeners = new Map<string, Set<() => void>>();
    addEventListener(type: string, listener: () => void): void {
      const listeners = this.listeners.get(type) ?? new Set<() => void>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }
    removeEventListener(type: string, listener: () => void): void { this.listeners.get(type)?.delete(listener); }
    dispatch(type: string): void { for (const listener of this.listeners.get(type) ?? []) listener(); }
  }

  let contextCreations = 0;
  let contextClosed = 0;
  let sourceCreations = 0;
  let sourceDisconnects = 0;
  let analyserDisconnects = 0;
  let frameSequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const fakeContext = {
    state: 'running',
    destination: {},
    createAnalyser: () => ({
      fftSize: 1024,
      smoothingTimeConstant: 0,
      connect: () => undefined,
      disconnect: () => { analyserDisconnects += 1; },
      getByteTimeDomainData: (samples: Uint8Array) => {
        samples.fill(128);
        samples[0] = 220;
      },
    }),
    createMediaElementSource: () => {
      sourceCreations += 1;
      return { connect: () => undefined, disconnect: () => { sourceDisconnects += 1; } };
    },
    resume: async () => undefined,
    close: async () => { contextClosed += 1; fakeContext.state = 'closed'; },
  };
  const environment: AudioAnalyserEnvironment = {
    isAvailable: () => true,
    createContext: () => { contextCreations += 1; return fakeContext as unknown as AudioContext; },
    requestFrame: (callback) => { const id = ++frameSequence; frames.set(id, callback); return id; },
    cancelFrame: (id) => { frames.delete(id); },
  };
  const levels: number[] = [];
  const analyser = new AudioLevelAnalyser((level) => levels.push(level), { smoothing: 0 }, environment);
  const firstAudio = new FakeAudio();
  const secondAudio = new FakeAudio();

  assert.equal(analyser.attach(firstAudio as unknown as HTMLAudioElement), true);
  firstAudio.dispatch('play');
  const firstFrame = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
  assert.ok(firstFrame);
  frames.delete(firstFrame[0]);
  firstFrame[1](0);
  assert.ok(levels.some((level) => level > 0));
  firstAudio.dispatch('ended');
  assert.equal(levels.at(-1), 0);

  assert.equal(analyser.attach(secondAudio as unknown as HTMLAudioElement), true);
  assert.equal(contextCreations, 1);
  assert.equal(sourceCreations, 2);
  assert.equal(sourceDisconnects, 1);
  assert.equal(analyserDisconnects, 1);

  await analyser.dispose();
  assert.equal(sourceDisconnects, 2);
  assert.equal(analyserDisconnects, 2);
  assert.equal(contextClosed, 1);
});
