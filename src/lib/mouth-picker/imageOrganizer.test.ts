import assert from 'node:assert/strict';
import test from 'node:test';
import {
  organizerCoverage,
  organizerFilename,
  safeCharacterName,
  type OrganizerAnalysis,
} from './imageOrganizer.ts';

test('generates the requested PuruPuru-style PNG names', () => {
  assert.equal(
    organizerFilename('shiro', { eye: 'open', mouth: 'closed' }),
    'shiro_eye_open_mouth_close.png',
  );
  assert.equal(
    organizerFilename('shiro', { eye: 'closed', mouth: 'half' }),
    'shiro_eye_close_mouth_half.png',
  );
});

test('normalizes the character portion of a filename', () => {
  assert.equal(safeCharacterName('  Shiro White  '), 'shiro_white');
  assert.equal(safeCharacterName('../'), 'character');
});

test('reports coverage for all six eye and mouth combinations', () => {
  const results: OrganizerAnalysis[] = [
    { eye: 'open', mouth: 'closed', confidence: 0.9 },
    { eye: 'closed', mouth: 'open', confidence: 0.8 },
  ];
  const coverage = organizerCoverage(results);
  assert.equal(coverage.eye_open_mouth_close, true);
  assert.equal(coverage.eye_open_mouth_half, false);
  assert.equal(coverage.eye_close_mouth_open, true);
});
