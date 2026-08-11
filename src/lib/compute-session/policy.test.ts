import assert from 'node:assert/strict';
import test from 'node:test';
import { computeKeepaliveSeconds, resolveComputeTarget } from './policy.ts';

test('local mode never selects RunPod', () => {
  assert.equal(resolveComputeTarget('local', true), 'local');
});

test('auto mode uses RunPod only when configured', () => {
  assert.equal(resolveComputeTarget('runpod-auto', true), 'runpod');
  assert.equal(resolveComputeTarget('runpod-auto', false), 'local');
});

test('force mode fails closed when endpoint is missing', () => {
  assert.throws(() => resolveComputeTarget('runpod-force', false), /not configured/i);
});

test('keepalive stays below half the app lease', () => {
  assert.equal(computeKeepaliveSeconds(45, 90), 45);
  assert.equal(computeKeepaliveSeconds(60, 60), 30);
  assert.equal(computeKeepaliveSeconds(5, 20), 10);
});
