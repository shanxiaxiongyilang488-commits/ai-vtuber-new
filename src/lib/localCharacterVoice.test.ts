import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLocalCharacterVoiceProposal } from './localCharacterVoice.ts';

test('builds a transparent but natural android voice from visual evidence', () => {
  const result = buildLocalCharacterVoiceProposal({
    name: 'シロ',
    role: '妹',
    description: 'ネコ型アンドロイド姉妹、ミケの妹',
    visual: {
      hairColor: 'white',
      eyeColor: 'bright blue',
      ears: 'mechanical cat ears',
      tail: 'segmented mechanical tail',
      androidParts: 'visible connection port',
      appearance: 'bright smile',
    },
  });

  assert.match(result.caption, /透明感/);
  assert.match(result.caption, /明るい中高音域/);
  assert.doesNotMatch(result.caption, /人工的な精密さ/);
  assert.match(result.caption, /音声エフェクトや機械音は加えない/);
  assert.match(result.caption, /エコー、リバーブ、コーラス、二重声/);
  assert.match(result.testPhrase, /シロです/);
  assert.ok(result.reasons.length >= 3);
});

test('does not invent image details when only a role is available', () => {
  const result = buildLocalCharacterVoiceProposal({ name: 'ミケ', role: '姉' });
  assert.match(result.caption, /落ち着いた中音域/);
  assert.doesNotMatch(result.caption, /人工的な精密さ/);
});
