import assert from 'node:assert/strict';
import test from 'node:test';
import { decideReflection } from './reflectionRouter.ts';

test('short acknowledgements use fast mode', () => {
  const decision = decideReflection({ text: 'ありがとう！', tendency: 'balanced' });
  assert.equal(decision.mode, 'fast');
  assert.deepEqual(decision.memoryBudget, { shortTermMessages: 4, retrievedMemories: 1 });
});

test('ambiguous advice uses think mode and voice live gets a filler', () => {
  const decision = decideReflection({
    text: 'ちょっと相談。どうすればいいかな？',
    tendency: 'balanced',
    voiceLive: true,
  });
  assert.equal(decision.mode, 'think');
  assert.ok(decision.filler);
});

test('multi-part design questions use deep mode', () => {
  const decision = decideReflection({
    text: '実装方針を比較して、メリットとデメリットを詳しく分析して。将来どう設計すべき？',
    tendency: 'balanced',
  });
  assert.equal(decision.mode, 'deep');
  assert.equal(decision.memoryBudget.retrievedMemories, 5);
});

test('character tendency shifts borderline requests', () => {
  const quick = decideReflection({ text: 'これについて考えて', tendency: 'quick' });
  const reflective = decideReflection({ text: 'これについて考えて', tendency: 'reflective' });
  assert.equal(quick.mode, 'fast');
  assert.equal(reflective.mode, 'think');
});

test('memory recall exposes only a public status label', () => {
  const decision = decideReflection({ text: '前の話を思い出して', memoryEnabled: true });
  assert.equal(decision.uiState, 'remembering');
  assert.equal(decision.uiLabel, '思い出しています');
  assert.equal('reason' in decision, false);
  assert.equal('score' in decision, false);
});
