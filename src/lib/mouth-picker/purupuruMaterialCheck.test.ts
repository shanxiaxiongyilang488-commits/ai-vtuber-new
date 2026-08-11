import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHIRO_PURUPURU_FILES,
  summarizePuruPuruMaterials,
  type PuruPuruMaterialFileCheck,
} from './purupuruMaterialCheck.ts';

function completeSet(): PuruPuruMaterialFileCheck[] {
  return SHIRO_PURUPURU_FILES.map((filename) => ({
    filename,
    exists: true,
    width: 1024,
    height: 1024,
    hasTransparency: true,
  }));
}

test('passes a complete, equal-sized transparent six-image set', () => {
  const summary = summarizePuruPuruMaterials(completeSet());
  assert.equal(summary.allPresent, true);
  assert.equal(summary.presentCount, 6);
  assert.equal(summary.sizeMatch, true);
  assert.equal(summary.allHaveTransparency, true);
  assert.deepEqual(summary.referenceSize, { width: 1024, height: 1024 });
});

test('reports a missing required image', () => {
  const files = completeSet();
  files[3] = { ...files[3], exists: false, width: null, height: null, hasTransparency: null };
  const summary = summarizePuruPuruMaterials(files);
  assert.equal(summary.presentCount, 5);
  assert.equal(summary.allPresent, false);
  assert.equal(summary.sizeMatch, false);
});

test('reports size mismatch and a PNG without transparency', () => {
  const files = completeSet();
  files[1] = { ...files[1], width: 800 };
  files[4] = { ...files[4], hasTransparency: false };
  const summary = summarizePuruPuruMaterials(files);
  assert.equal(summary.allPresent, true);
  assert.equal(summary.sizeMatch, false);
  assert.equal(summary.allHaveTransparency, false);
});
