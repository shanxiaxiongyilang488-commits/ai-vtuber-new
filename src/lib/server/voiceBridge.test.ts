import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { estimateDesignDurationSeconds, synthesizeSpeech } from './voiceBridge.ts';

test('design audition duration scales with text and never allocates thirty seconds', () => {
  assert.equal(estimateDesignDurationSeconds('こんにちは'), 2.5);
  assert.ok(estimateDesignDurationSeconds('ミケです。これからよろしくね。') < 3.5);
  assert.equal(estimateDesignDurationSeconds('あ'.repeat(200)), 12);
});

test('voice bridge client waits for and reads a native HTTP audio response', async () => {
  const expected = Buffer.from('RIFF-test-wave');
  let requestBody = '';
  const server = createServer((request, response) => {
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => { requestBody += chunk; });
    request.once('end', () => {
      setTimeout(() => {
        response.writeHead(200, {
          'content-type': 'audio/wav',
          'x-duration': '1.25',
        });
        response.end(expected);
      }, 40);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const result = await synthesizeSpeech(
      `http://127.0.0.1:${address.port}`,
      { engine: 'irodori', mode: 'design', model: '', caption: 'test', speed: 1 },
      'こんにちは',
    );
    assert.deepEqual(Buffer.from(result.audio), expected);
    assert.equal(result.duration, 1.25);
    assert.equal(JSON.parse(requestBody).seconds, 2.5);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('voice bridge error preserves the final Python exception', async () => {
  const finalCause = 'RuntimeError: local checkpoint is invalid';
  const server = createServer((_request, response) => {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ detail: `${'loading\n'.repeat(900)}${finalCause}` }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await assert.rejects(
      synthesizeSpeech(
        `http://127.0.0.1:${address.port}`,
        { engine: 'irodori', mode: 'design', model: '', caption: 'test', speed: 1 },
        'test',
      ),
      (error: Error) => error.message.includes(finalCause),
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
