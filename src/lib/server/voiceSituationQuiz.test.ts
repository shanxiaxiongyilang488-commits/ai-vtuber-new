import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVoiceQuizAnswer } from './voiceSituationQuiz.ts';

test('parses the final explicit three-choice answer', () => {
  assert.equal(parseVoiceQuizAnswer('1番だと思う'), 1);
  assert.equal(parseVoiceQuizAnswer('うーん、1か2。迷ったけど2番'), 2);
  assert.equal(parseVoiceQuizAnswer('簡単。これは2だね'), 2);
  assert.equal(parseVoiceQuizAnswer('最終回答は三番です'), 3);
  assert.equal(parseVoiceQuizAnswer('まだ分からない'), null);
});
