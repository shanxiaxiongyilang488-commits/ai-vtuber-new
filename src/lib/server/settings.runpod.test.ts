import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSettings } from './settings.ts';

test('normalizes voice-only RunPod settings', () => {
  const settings = normalizeSettings({
    runpod: {
      apiKey: 'rp-test',
      voiceEndpointId: 'voice-endpoint',
      videoEndpointId: 'video-endpoint',
      voiceModel: 'Aratako/Irodori-TTS-v4-Small-Quantized/int8-weight-only',
      sessionIdleSeconds: 120,
      maxActiveSessions: 2,
      voiceWarmIntervalSeconds: 72,
      voicePodEnabled: true,
      voicePodId: 'pod-voice-1',
      voicePodUrl: 'https://pod-voice-1-8791.proxy.runpod.net',
      voicePodToken: 'shared-secret',
      voicePodIdleMinutes: 25,
    },
    voice: { backend: 'local', ttsBackend: 'runpod', localUrl: 'http://127.0.0.1:7860' },
    video: { backend: 'runpod', localUrl: 'http://127.0.0.1:8793' },
  });
  assert.equal(settings.voice.ttsBackend, 'runpod');
  assert.equal(settings.video.backend, 'runpod');
  assert.equal(settings.runpod.voiceWarmIntervalSeconds, 72);
  assert.equal(settings.runpod.voiceEndpointId, 'voice-endpoint');
  assert.equal(settings.runpod.videoEndpointId, 'video-endpoint');
  assert.equal(settings.runpod.voiceModel, 'Aratako/Irodori-TTS-v4-Small-Quantized/int8-weight-only');
  assert.equal(settings.runpod.sessionIdleSeconds, 120);
  assert.equal(settings.runpod.maxActiveSessions, 2);
  assert.equal(settings.runpod.voicePodEnabled, true);
  assert.equal(settings.runpod.voicePodId, 'pod-voice-1');
  assert.equal(settings.runpod.voicePodToken, 'shared-secret');
  assert.equal(settings.runpod.voicePodIdleMinutes, 25);
});

test('clamps unsafe warm intervals and invalid backends', () => {
  const settings = normalizeSettings({
    runpod: {
      voiceWarmIntervalSeconds: 2,
      sessionIdleSeconds: 5,
      maxActiveSessions: 99,
      voicePodIdleMinutes: 1,
    },
    voice: { backend: 'unknown' },
    video: { backend: 'unknown' },
  });
  assert.equal(settings.runpod.voiceWarmIntervalSeconds, 10);
  assert.equal(settings.runpod.sessionIdleSeconds, 30);
  assert.equal(settings.runpod.maxActiveSessions, 4);
  assert.equal(settings.runpod.voicePodIdleMinutes, 5);
  assert.equal(settings.voice.backend, 'local');
  assert.equal(settings.voice.ttsBackend, 'local');
  assert.equal(settings.video.backend, 'fal');
});

test('uses the full-quality RunPod voice model when a custom model id is invalid', () => {
  const settings = normalizeSettings({ runpod: { voiceModel: '../../bad model' } });
  assert.equal(settings.runpod.voiceModel, 'Aratako/Irodori-TTS-v4-Small');
});
