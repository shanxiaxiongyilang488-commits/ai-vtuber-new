import assert from 'node:assert/strict';
import test from 'node:test';
import { findOutputString } from './runpodClient.ts';

test('deep worker reply can be read from a nested RunPod output', () => {
  assert.equal(findOutputString({ result: { text: '最終回答' } }, ['text', 'reply', 'answer']), '最終回答');
});
