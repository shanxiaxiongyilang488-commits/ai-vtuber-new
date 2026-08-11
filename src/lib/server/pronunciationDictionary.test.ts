import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPronunciationRules, compilePronunciationRules } from './pronunciationDictionary.ts';

test('hyphenated character IDs can be given a stable Japanese reading', () => {
  const rules = compilePronunciationRules({ 'N-02': 'エヌゼロツー' });
  assert.equal(
    applyPronunciationRules(rules, 'N-02です。これからよろしくね。'),
    'エヌゼロツーです。これからよろしくね。',
  );
});
