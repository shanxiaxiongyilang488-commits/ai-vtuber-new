import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_VOICE_PERFORMANCE,
  applyVoiceTuning,
  stripVoiceTuning,
  type VoiceAdjustmentId,
} from './localVoiceTuning.ts';

test('selected voice adjustments are added ahead of the original design', () => {
  const result = applyVoiceTuning('透明感のある声。', ['cute', 'high'], 'strong');

  assert.match(result, /HIGHEST PRIORITY/u);
  assert.match(result, /可愛らしさを最優先/u);
  assert.match(result, /明確に高い音域/u);
  assert.ok(result.endsWith('透明感のある声。'));
});

test('changing strength replaces the existing tuning block without duplication', () => {
  const first = applyVoiceTuning('元の設計', ['cute'], 'soft');
  const second = applyVoiceTuning(first, ['cute'], 'strong');

  assert.equal((second.match(/LOCAL VOICE TUNING — HIGHEST PRIORITY/gu) ?? []).length, 1);
  assert.doesNotMatch(second, /少し加え/u);
  assert.match(second, /大胆に強める/u);
  assert.equal(stripVoiceTuning(second), '元の設計');
});

test('clearing every adjustment restores the untouched design', () => {
  const selected: VoiceAdjustmentId[] = ['young', 'natural'];
  const tuned = applyVoiceTuning('自然な声。', selected, 'medium');

  assert.equal(applyVoiceTuning(tuned, [], 'medium'), '自然な声。');
});

test('character flavors can combine gyaru delivery with android acting', () => {
  const tuned = applyVoiceTuning('元の声。', ['gyaru', 'android'], 'strong');

  assert.match(tuned, /ギャルキャラクター/u);
  assert.match(tuned, /高性能アンドロイド/u);
  assert.ok(tuned.endsWith('元の声。'));
});

test('performance parameters add only non-neutral instructions', () => {
  const performance = {
    ...DEFAULT_VOICE_PERFORMANCE,
    expressiveness: 4,
    distance: 3,
    synthetic: 4,
  };
  const tuned = applyVoiceTuning('元の声。', [], 'medium', performance);

  assert.match(tuned, /ドラマチック/u);
  assert.match(tuned, /すぐそば/u);
  assert.match(tuned, /サイバーアンドロイド/u);
  assert.equal(
    applyVoiceTuning('元の声。', [], 'medium', DEFAULT_VOICE_PERFORMANCE),
    '元の声。',
  );
});
