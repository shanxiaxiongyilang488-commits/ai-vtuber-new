import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMiniMaxH3Payload } from './minimaxH3Payload.ts';

test('builds a MiniMax H3 text-to-video payload', () => {
  const payload = buildMiniMaxH3Payload({
    prompt: 'A character waves at the camera.',
    mode: 't2v',
    duration: 5,
  });
  assert.equal(payload.model, 'MiniMax-H3');
  assert.equal(payload.resolution, '768P');
  assert.equal(payload.ratio, '16:9');
  assert.deepEqual(payload.content, [{ type: 'text', text: 'A character waves at the camera.' }]);
});

test('uses one image as the first frame for image-to-video', () => {
  const payload = buildMiniMaxH3Payload({
    prompt: 'Slow camera push-in.',
    mode: 'i2v',
    duration: 6,
    imageUrl: 'https://example.com/character.png',
  });
  assert.equal(payload.ratio, 'adaptive');
  assert.deepEqual(payload.content[1], {
    type: 'image_url',
    image_url: { url: 'https://example.com/character.png' },
    role: 'first_frame',
  });
});

test('uses up to nine unique images as character references', () => {
  const payload = buildMiniMaxH3Payload({
    prompt: 'Keep the character design consistent.',
    mode: 'r2v',
    duration: 8,
    imageUrls: ['https://example.com/a.png', 'https://example.com/a.png', 'https://example.com/b.png'],
  });
  assert.equal(payload.ratio, 'adaptive');
  assert.equal(payload.content.length, 3);
  assert.equal(payload.content[1].type, 'image_url');
  assert.equal(payload.content[2].type, 'image_url');
});

test('rejects unsupported duration and missing reference images', () => {
  assert.throws(
    () => buildMiniMaxH3Payload({ prompt: 'test', mode: 't2v', duration: 3 }),
    /4 to 15/,
  );
  assert.throws(
    () => buildMiniMaxH3Payload({ prompt: 'test', mode: 'r2v', duration: 5, imageUrls: [] }),
    /at least one reference image/,
  );
});
