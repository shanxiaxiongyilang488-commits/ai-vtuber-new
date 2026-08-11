import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeSpeechText, splitSpeechText } from './speechText.ts';

test('splits long Japanese speech at sentence boundaries without losing text', () => {
  const input = '最初の文章です。次の文章も丁寧に話します。最後の文章まで間違えずに読みます。';
  const chunks = splitSpeechText(input, 24);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 24));
  assert.equal(chunks.join(''), sanitizeSpeechText(input));
});

test('uses a safe hard boundary when one sentence is unusually long', () => {
  const input = 'あ'.repeat(95);
  const chunks = splitSpeechText(input, 30);

  assert.deepEqual(chunks.map((chunk) => Array.from(chunk).length), [30, 30, 30, 5]);
  assert.equal(chunks.join(''), input);
});

test('keeps closing punctuation with the preceding sentence', () => {
  const chunks = splitSpeechText('これは「大丈夫です！」次の文も続きます。さらに続きます。', 20);
  assert.equal(chunks.some((chunk) => chunk.startsWith('」')), false);
  assert.equal(chunks.join(''), 'これは「大丈夫です！」次の文も続きます。さらに続きます。');
});
