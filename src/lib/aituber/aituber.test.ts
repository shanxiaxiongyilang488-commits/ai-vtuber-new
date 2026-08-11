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
import {
  getVoiceOutputEffectPreset,
  nextVoiceOutputEffectMode,
  parseVoiceOutputEffectMode,
} from './voiceOutputEffect.ts';
import { loadVoiceCandidates, replaceVoiceCandidates, saveVoiceCandidate } from './voiceCandidateStore.ts';

const NOW = 2_000_000_000_000;

test('android output effect cycles through off, soft, and clear safely', () => {
  assert.equal(nextVoiceOutputEffectMode('off'), 'android-soft');
  assert.equal(nextVoiceOutputEffectMode('android-soft'), 'android-clear');
  assert.equal(nextVoiceOutputEffectMode('android-clear'), 'off');
  assert.equal(parseVoiceOutputEffectMode('android-soft'), 'android-soft');
  assert.equal(parseVoiceOutputEffectMode('unknown'), 'off');
  assert.equal(getVoiceOutputEffectPreset('android-soft').wetGain < 0.1, true);
  assert.equal(getVoiceOutputEffectPreset('android-clear').delaySeconds < 0.02, true);
});

test('voice candidates survive reload and invalid external URLs are discarded', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  saveVoiceCandidate('shiro', 'm1', '/voice-output/shiro/one.wav', storage, 10);
  saveVoiceCandidate('shiro', 'm2', '/voice-output/shiro/two.wav', storage, 20);
  saveVoiceCandidate('shiro', 'm1', '/voice-output/shiro/new-one.wav', storage, 30);
  replaceVoiceCandidates('shiro', [
    ...loadVoiceCandidates('shiro', storage),
    { messageId: 'bad', audioUrl: 'https://example.com/not-local.wav', createdAt: 40 },
  ], storage);

  assert.deepEqual(loadVoiceCandidates('shiro', storage), [
    { messageId: 'm2', audioUrl: '/voice-output/shiro/two.wav', createdAt: 20 },
    { messageId: 'm1', audioUrl: '/voice-output/shiro/new-one.wav', createdAt: 30 },
  ]);
});

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

test('speech queue forwards a per-message VoiceLab caption to the adapter', async () => {
  let receivedCaption = '';
  let receivedSpeed: number | undefined;
  let receivedPreserveBaseVoice = false;
  let resolvedUrl = '';
  const voice: VoiceAdapter = {
    async synthesize(_characterId, text, _signal, voiceCaption, voiceSpeed, preserveBaseVoice) {
      receivedCaption = voiceCaption ?? '';
      receivedSpeed = voiceSpeed;
      receivedPreserveBaseVoice = preserveBaseVoice ?? false;
      return { url: text };
    },
  };
  class FakeAudio implements AudioLike {
    currentTime = 0;
    listeners = new Map<string, () => void>();
    addEventListener(type: string, listener: () => void): void { this.listeners.set(type, listener); }
    removeEventListener(type: string): void { this.listeners.delete(type); }
    async play(): Promise<void> { queueMicrotask(() => this.listeners.get('ended')?.()); }
    pause(): void {}
  }
  const queue = new SpeechQueue(voice, {
    resolved: (_request, source) => { resolvedUrl = source.url; },
  }, (url) => new FakeAudio());
  queue.enqueue({
    id: 'styled',
    origin: 'user_reply',
    createdAt: 1,
    characterId: 'shiro',
    messageId: 'styled',
    text: 'こんにちは',
    voiceCaption: '優しいお姉さんのような声',
    voiceSpeed: 1.12,
    preserveBaseVoice: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(receivedCaption, '優しいお姉さんのような声');
  assert.equal(receivedSpeed, 1.12);
  assert.equal(receivedPreserveBaseVoice, true);
  assert.equal(resolvedUrl, 'こんにちは');
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

test('audio analyser unlocks a suspended context during user interaction', async () => {
  let contextCreations = 0;
  let resumeCalls = 0;
  const fakeContext = {
    state: 'suspended',
    resume: async () => { resumeCalls += 1; fakeContext.state = 'running'; },
    close: async () => { fakeContext.state = 'closed'; },
  };
  const environment: AudioAnalyserEnvironment = {
    isAvailable: () => true,
    createContext: () => { contextCreations += 1; return fakeContext as unknown as AudioContext; },
    requestFrame: () => 1,
    cancelFrame: () => undefined,
  };
  const analyser = new AudioLevelAnalyser(() => undefined, {}, environment);

  assert.equal(await analyser.unlock(), true);
  assert.equal(await analyser.unlock(), true);
  assert.equal(contextCreations, 1);
  assert.equal(resumeCalls, 1);
  await analyser.dispose();
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

test('android effect builds a quiet parallel wet path without a noise source or feedback loop', async () => {
  class FakeAudio {
    addEventListener(): void {}
    removeEventListener(): void {}
  }

  const gainValues: number[] = [];
  const filterValues: Array<{ type: string; frequency: number; q: number }> = [];
  const delayValues: number[] = [];
  let sourceConnects = 0;
  const node = () => ({ connect: () => undefined, disconnect: () => undefined });
  const fakeContext = {
    state: 'running',
    destination: {},
    createAnalyser: () => ({
      ...node(),
      fftSize: 1024,
      smoothingTimeConstant: 0,
      getByteTimeDomainData: () => undefined,
    }),
    createMediaElementSource: () => ({
      connect: () => { sourceConnects += 1; },
      disconnect: () => undefined,
    }),
    createGain: () => {
      const gain = { value: 0 };
      gainValues.push(0);
      return {
        ...node(),
        gain: {
          get value() { return gain.value; },
          set value(value: number) {
            gain.value = value;
            gainValues[gainValues.length - 1] = value;
          },
        },
      };
    },
    createBiquadFilter: () => {
      const record = { type: '', frequency: 0, q: 0 };
      filterValues.push(record);
      return {
        ...node(),
        get type() { return record.type; },
        set type(value: string) { record.type = value; },
        frequency: {
          get value() { return record.frequency; },
          set value(value: number) { record.frequency = value; },
        },
        Q: {
          get value() { return record.q; },
          set value(value: number) { record.q = value; },
        },
      };
    },
    createDelay: () => {
      const delay = { value: 0 };
      delayValues.push(0);
      return {
        ...node(),
        delayTime: {
          get value() { return delay.value; },
          set value(value: number) {
            delay.value = value;
            delayValues[delayValues.length - 1] = value;
          },
        },
      };
    },
    resume: async () => undefined,
    close: async () => undefined,
  };
  const environment: AudioAnalyserEnvironment = {
    isAvailable: () => true,
    createContext: () => fakeContext as unknown as AudioContext,
    requestFrame: () => 1,
    cancelFrame: () => undefined,
  };
  const analyser = new AudioLevelAnalyser(() => undefined, {}, environment);

  assert.equal(analyser.attach(new FakeAudio() as unknown as HTMLAudioElement, 'android-soft'), true);
  assert.equal(sourceConnects, 2);
  assert.deepEqual(gainValues, [0.96, 0.07]);
  assert.deepEqual(filterValues, [{ type: 'bandpass', frequency: 2_600, q: 0.72 }]);
  assert.deepEqual(delayValues, [0.011]);
  assert.equal('createOscillator' in fakeContext, false);
  await analyser.dispose();
});
