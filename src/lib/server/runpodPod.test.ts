import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRunpodVoicePodUrl, startRunpodPod } from './runpodPod.ts';

test('builds the default voice proxy URL from a Pod ID', () => {
  assert.equal(
    resolveRunpodVoicePodUrl('voicepod1234'),
    'https://voicepod1234-8791.proxy.runpod.net',
  );
});

test('rejects a proxy URL for a different Pod', () => {
  assert.throws(
    () => resolveRunpodVoicePodUrl('voice-pod', 'https://other-pod-8791.proxy.runpod.net'),
    /does not match/,
  );
});

test('rejects non-RunPod and non-HTTPS URLs', () => {
  assert.throws(() => resolveRunpodVoicePodUrl('voice-pod', 'http://voice-pod.example.com'));
});

test('normalizes an API key that already includes Bearer', async () => {
  const originalFetch = globalThis.fetch;
  let authorization = '';
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get('authorization') ?? '';
    return new Response('{}', { status: 200 });
  };
  try {
    await startRunpodPod({ apiKey: 'Bearer rpa_test', podId: 'voice-pod' });
    assert.equal(authorization, 'Bearer rpa_test');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
