import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeItemLayers } from './itemLayers.ts';
import {
  extractRendererSettings,
  frameLerpFactor,
  MOUTH_CROSSFADE_MAX_MS,
  mouthResponse,
  mouthStateForTarget,
  mouthTargetForLevel,
  nextBlinkDelayMs,
  randomBlinkStep,
  RENDERER_SETTING_DEFAULTS,
} from './rendererSettings.ts';

test('settings missing or empty fall back to official defaults', () => {
  assert.deepEqual(extractRendererSettings(undefined), RENDERER_SETTING_DEFAULTS);
  assert.deepEqual(extractRendererSettings({}), RENDERER_SETTING_DEFAULTS);
  assert.deepEqual(extractRendererSettings({ state: {} }), RENDERER_SETTING_DEFAULTS);
});

test('settings state values are picked up and clamped', () => {
  const extracted = extractRendererSettings({
    state: {
      autoBlink: false,
      hairVisible: false,
      hairSpring: 80,
      mouthHalf: 12,
      mouthFull: 30,
      mouthRelease: 25,
      mouthCrossfadeMs: 500,
      micGain: 110,
    },
  });
  assert.equal(extracted.autoBlink, false);
  assert.equal(extracted.hairVisible, false);
  assert.equal(extracted.hairSpring, 80);
  assert.equal(extracted.mouthHalf, 12);
  assert.equal(extracted.mouthFull, 30);
  assert.equal(extracted.mouthRelease, 25);
  assert.equal(extracted.mouthCrossfadeMs, MOUTH_CROSSFADE_MAX_MS);
  assert.equal(extracted.micGain, 110);
});

test('invalid setting types fall back to defaults', () => {
  const extracted = extractRendererSettings({
    state: { autoBlink: 'yes', hairSpring: Number.NaN, mouthHalf: Infinity, mouthCrossfadeMs: '80' },
  });
  assert.equal(extracted.autoBlink, RENDERER_SETTING_DEFAULTS.autoBlink);
  assert.equal(extracted.hairSpring, RENDERER_SETTING_DEFAULTS.hairSpring);
  assert.equal(extracted.mouthHalf, RENDERER_SETTING_DEFAULTS.mouthHalf);
  assert.equal(extracted.mouthCrossfadeMs, RENDERER_SETTING_DEFAULTS.mouthCrossfadeMs);
});

test('mouth response mirrors the official floor/range mapping', () => {
  const response = mouthResponse(RENDERER_SETTING_DEFAULTS);
  // 公式: floor = max(0.004, (8/100)*0.45) = 0.036, range = 0.22 - 0.036 = 0.184
  assert.ok(Math.abs(response.floor - 0.036) < 1e-9);
  assert.ok(Math.abs(response.range - 0.184) < 1e-9);
  assert.equal(response.voiceGain, 1);
  assert.equal(mouthTargetForLevel(0, response), 0);
  assert.equal(mouthTargetForLevel(response.floor, response), 0);
  assert.equal(mouthTargetForLevel(response.floor + response.range, response), 1);
  assert.equal(mouthTargetForLevel(1, response), 1);
});

test('inverted half/full thresholds are reordered like the official app', () => {
  const response = mouthResponse({ ...RENDERER_SETTING_DEFAULTS, mouthHalf: 40, mouthFull: 10 });
  // half = min(40, 10-1) = 9, full = max(10, 40+1) = 41
  assert.ok(Math.abs(response.floor - 0.09 * 0.45) < 1e-9);
  assert.ok(response.range > 0);
});

test('mouth state thresholds are 0.22 and 0.78', () => {
  assert.equal(mouthStateForTarget(0), 0);
  assert.equal(mouthStateForTarget(0.219), 0);
  assert.equal(mouthStateForTarget(0.22), 1);
  assert.equal(mouthStateForTarget(0.779), 1);
  assert.equal(mouthStateForTarget(0.78), 2);
  assert.equal(mouthStateForTarget(1), 2);
});

test('frame lerp factor matches the 60fps base factor at 1/60s', () => {
  assert.ok(Math.abs(frameLerpFactor(0.42, 1 / 60) - 0.42) < 1e-9);
  assert.equal(frameLerpFactor(0.42, 0), 0);
  // 長いフレームほど係数が大きくなる(フレームレート非依存)
  assert.ok(frameLerpFactor(0.42, 1 / 30) > 0.42);
});

test('blink delay follows the official short/long wait distribution', () => {
  const short = nextBlinkDelayMs(() => 0.1);
  assert.ok(short >= 850 && short <= 1500);
  const long = nextBlinkDelayMs(() => 0.5);
  assert.ok(long >= 1900 && long <= 4600);
});

test('item layers keep only visible entries with a file reference', () => {
  const layers = normalizeItemLayers({
    itemLayers: [
      { file: 'items/body.png', name: 'body.png', slot: 'faceBack', x: 0, y: -15, scale: 100, rotation: 0, opacity: 100, visible: true },
      { file: 'items/hidden.png', slot: 'faceBack', visible: false },
      { file: null, slot: 'faceBack', visible: true },
      'not-an-object',
      { file: 'items/pin.png', slot: 'unknown-slot', visible: true },
    ],
  });
  assert.equal(layers.length, 2);
  assert.deepEqual(layers[0], { file: 'items/body.png', name: 'body.png', slot: 'faceBack', x: 0, y: -15, scale: 100, rotation: 0, opacity: 100 });
  // 不正スロットは公式既定のfrontHairFrontへフォールバックする
  assert.equal(layers[1].slot, 'frontHairFront');
});

test('item layer numbers are clamped to the official limits', () => {
  const [layer] = normalizeItemLayers({
    itemLayers: [{ file: 'items/a.png', slot: 'stageFront', x: -9999, y: 9999, scale: 1000, rotation: 270, opacity: 0, visible: true }],
  });
  assert.deepEqual({ x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation, opacity: layer.opacity },
    { x: -3000, y: 3000, scale: 500, rotation: 180, opacity: 10 });
});

test('item layers tolerate missing or malformed settings', () => {
  assert.deepEqual(normalizeItemLayers(undefined), []);
  assert.deepEqual(normalizeItemLayers({}), []);
  assert.deepEqual(normalizeItemLayers({ itemLayers: 'nope' }), []);
  const [layer] = normalizeItemLayers({ itemLayers: [{ file: 'items/a.png', visible: true }] });
  assert.deepEqual(layer, { file: 'items/a.png', name: 'items/a.png', slot: 'frontHairFront', x: 0, y: 0, scale: 100, rotation: 0, opacity: 100 });
});

test('blink step durations stay in the official normal-blink ranges', () => {
  for (const roll of [0, 0.5, 0.999]) {
    const step = randomBlinkStep(() => roll);
    assert.ok(step.closeMs >= 62 && step.closeMs <= 90);
    assert.ok(step.holdMs >= 32 && step.holdMs <= 66);
    assert.ok(step.openMs >= 122 && step.openMs <= 178);
  }
});
