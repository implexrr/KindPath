import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultVisionSettings, applyIntensity, snapshotFilter, peripheralMask, colourMatrix, clampStrength } from './visualEffects.js';

test('colour presets preserve identity at zero, white at full strength, and grayscale channel equality', () => {
  const identity = [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0];
  for (const preset of ['red-green', 'blue-yellow', 'grayscale'] as const) {
    assert.deepEqual(colourMatrix(preset, 0), identity);
    const matrix = colourMatrix(preset, 100);
    for (const start of [0,5,10]) assert.ok(Math.abs(matrix[start] + matrix[start+1] + matrix[start+2] - 1) < 0.00001);
  }
  const gray = colourMatrix('grayscale', 100);
  assert.deepEqual(gray.slice(0,3), gray.slice(5,8)); assert.deepEqual(gray.slice(0,3), gray.slice(10,13));
  assert.deepEqual(colourMatrix('red-green', -5), identity); assert.equal(clampStrength(Number.NaN), 0);
});
test('effects compose independently and pause removes every visible transformation', () => {
  const settings = defaultVisionSettings();
  settings.strengths = { colour: 40, blur: 50, contrast: 75, peripheral: 60 };
  assert.equal(snapshotFilter(settings, 'local-colour'), 'url(#local-colour) contrast(0.5) blur(2px)');
  assert.equal(peripheralMask(settings)?.opacity, 0.6);
  assert.equal(snapshotFilter({ ...settings, enabled: false }, 'local-colour'), undefined);
  assert.equal(peripheralMask({ ...settings, enabled: false }), undefined);
  assert.deepEqual(settings.strengths, { colour: 40, blur: 50, contrast: 75, peripheral: 60 });
  assert.equal(snapshotFilter({ ...settings, strengths: { colour: 0, blur: 0, contrast: 0, peripheral: 0 } }, 'local-colour'), undefined);
});
test('intensity presets enable all sliders without changing the colour choice or mutating prior settings', () => {
  const initial = defaultVisionSettings(); initial.enabled = false; initial.colourPreset = 'blue-yellow';
  const preset = applyIntensity(initial, 'strong');
  assert.equal(preset.enabled, true); assert.equal(preset.colourPreset, 'blue-yellow');
  assert.deepEqual(Object.values(preset.strengths), [80,80,80,80]);
  assert.equal(initial.strengths.blur, 0); assert.equal(initial.enabled, false);
  initial.strengths.blur = 99; assert.equal(defaultVisionSettings().strengths.blur, 0);
});
