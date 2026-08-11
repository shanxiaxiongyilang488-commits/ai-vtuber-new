import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultCharacterVoice, stableCharacterVoiceSeed } from './characterVoiceDefaults.ts';

test('new characters receive realtime Irodori voice defaults', () => {
  assert.deepEqual(createDefaultCharacterVoice('Mike'), {
    engine: 'irodori',
    mode: 'design',
    model: 'default-mike',
    caption: 'A clear, warm, natural Japanese character voice recorded dry and close. Keep one consistent speaker identity across every utterance. Use friendly conversational pacing and accurate, unhurried pronunciation.',
    speed: 1,
    autoSpeak: true,
  });
});

test('design voice seeds are stable and distinct per character', () => {
  const mike = stableCharacterVoiceSeed('mike', 'default');
  assert.equal(mike, stableCharacterVoiceSeed('MIKE', 'default'));
  assert.notEqual(mike, stableCharacterVoiceSeed('n-02', 'default'));
  assert.ok(mike > 0);
});
