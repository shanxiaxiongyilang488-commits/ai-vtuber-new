import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizationValue,
  cancelRunpodJob,
  findOutputString,
  runRunpodInteractive,
  submitRunpodJob,
} from './runpodClient.ts';

test('RunPod authorization uses one Bearer prefix', () => {
  assert.equal(authorizationValue('rp-test'), 'Bearer rp-test');
  assert.equal(authorizationValue('Bearer rp-test'), 'Bearer rp-test');
});

test('findOutputString reads nested RunPod media output', () => {
  assert.equal(findOutputString({ output: { video_url: 'https://example.test/video.mp4' } }, ['video_url', 'url']), 'https://example.test/video.mp4');
  assert.equal(findOutputString([{ audioUrl: 'https://example.test/voice.wav' }], ['audioUrl', 'url']), 'https://example.test/voice.wav');
});

test('findOutputString ignores unrelated scalar fields', () => {
  assert.equal(findOutputString({ status: 'ok', output: { duration: 2.5 } }, ['video_url', 'url']), '');
});

test('queue submission and cancellation use non-blocking RunPod operations', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ id: 'warm-job', status: 'IN_QUEUE' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    const credentials = { apiKey: 'rp-test', endpointId: 'voice-endpoint' };
    const submitted = await submitRunpodJob(credentials, { task: 'voice.warmup' });
    await cancelRunpodJob(credentials, submitted.id!);

    assert.equal(calls[0]?.url, 'https://api.runpod.ai/v2/voice-endpoint/run');
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { input: { task: 'voice.warmup' } });
    assert.equal(calls[1]?.url, 'https://api.runpod.ai/v2/voice-endpoint/cancel/warm-job');
    assert.equal(calls[1]?.init?.method, 'POST');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('interactive jobs use async submission and status polling', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
    const payload = url.endsWith('/run')
      ? { id: 'voice-job', status: 'IN_QUEUE' }
      : { id: 'voice-job', status: 'COMPLETED', output: { audio_base64: 'UklGRg==' } };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    const result = await runRunpodInteractive(
      { apiKey: 'rp-test', endpointId: 'voice-endpoint' },
      { task: 'voice.speak', text: 'test' },
      2_000,
    );

    assert.equal(result.status, 'COMPLETED');
    assert.equal(calls[0], 'https://api.runpod.ai/v2/voice-endpoint/run');
    assert.equal(calls[1], 'https://api.runpod.ai/v2/voice-endpoint/status/voice-job');
    assert.equal(calls.some((url) => url.includes('/runsync')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
