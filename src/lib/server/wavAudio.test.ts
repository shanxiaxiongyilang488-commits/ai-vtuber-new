import assert from 'node:assert/strict';
import test from 'node:test';
import { concatenateWavAudio } from './wavAudio.ts';

function pcmWav(samples: number[], sampleRate = 24_000): Uint8Array {
  const output = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(output.buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) output[offset + index] = value.charCodeAt(index);
  };
  write(0, 'RIFF');
  view.setUint32(4, output.byteLength - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return output;
}

test('joins compatible WAV audio in its original order', () => {
  const combined = concatenateWavAudio([pcmWav([1, 2]), pcmWav([3, 4, 5])]);
  const view = new DataView(combined.buffer, combined.byteOffset, combined.byteLength);

  assert.equal(combined.byteLength, 54);
  assert.equal(view.getUint32(4, true), 46);
  assert.equal(view.getUint32(40, true), 10);
  assert.deepEqual(
    Array.from({ length: 5 }, (_, index) => view.getInt16(44 + index * 2, true)),
    [1, 2, 3, 4, 5],
  );
});

test('rejects incompatible WAV formats instead of producing corrupt audio', () => {
  assert.throws(
    () => concatenateWavAudio([pcmWav([1], 24_000), pcmWav([2], 48_000)]),
    /incompatible WAV formats/,
  );
});
