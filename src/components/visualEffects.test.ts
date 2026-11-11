import { test } from 'node:test';
import type { ColourPreset } from './visualEffects.js';
import assert from 'node:assert/strict';
import { defaultVisionSettings, applyVisionPreset, activeVisionPreset, applyIntensity, snapshotFilter, peripheralMask, colourMatrix, clampStrength } from './visualEffects.js';

test('colour presets preserve identity at zero, white at full strength, and grayscale channel equality', () => {
  const identity = [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0];
  for (const preset of ['protanopia', 'deuteranopia', 'tritanopia', 'grayscale'] as const) {
    assert.deepEqual(colourMatrix(preset, 0), identity);
    const matrix = colourMatrix(preset, 100);
    for (const start of [0,5,10]) assert.ok(Math.abs(matrix[start] + matrix[start+1] + matrix[start+2] - 1) < 0.00001);
  }
  const gray = colourMatrix('grayscale', 100);
  assert.deepEqual(gray.slice(0,3), gray.slice(5,8)); assert.deepEqual(gray.slice(0,3), gray.slice(10,13));
  assert.deepEqual(colourMatrix('deuteranopia', -5), identity); assert.equal(clampStrength(Number.NaN), 0);
});
test('Machado presets use distinct published endpoints and interpolate nearby severities', () => {
  assert.deepEqual(colourMatrix('protanopia', 100).slice(0, 5), [0.152286, 1.052583, -0.204868, 0, 0]);
  assert.deepEqual(colourMatrix('deuteranopia', 100).slice(0, 5), [0.367322, 0.860646, -0.227968, 0, 0]);
  assert.deepEqual(colourMatrix('tritanopia', 100).slice(0, 5), [1.255528, -0.076749, -0.178779, 0, 0]);
  assert.equal(colourMatrix('deuteranopia', 50)[0], 0.547494);
  assert.equal(colourMatrix('deuteranopia', 55)[0], 0.523179);
  for (const key of ['unknown', 'constructor', '__proto__']) {
    assert.deepEqual(colourMatrix(key as ColourPreset, 55), colourMatrix('deuteranopia', 55));
  }
  for (const preset of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
    assert.equal(applyVisionPreset(preset).strengths.colour, 100);
    assert.deepEqual(colourMatrix(preset, 150), colourMatrix(preset, 100));
  }
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
  const initial = defaultVisionSettings(); initial.enabled = false; initial.colourPreset = 'tritanopia';
  const preset = applyIntensity(initial, 'strong');
  assert.equal(preset.enabled, true); assert.equal(preset.colourPreset, 'tritanopia');
  assert.deepEqual(Object.values(preset.strengths), [80,80,80,80]);
  assert.equal(initial.strengths.blur, 0); assert.equal(initial.enabled, false);
  initial.strengths.blur = 99; assert.equal(defaultVisionSettings().strengths.blur, 0);
});

test('vision presets replace mixed effects and return independent editable settings', () => {
  const combined = applyIntensity(defaultVisionSettings(), 'strong');
  combined.enabled = false;
  const blur = applyVisionPreset('blurred');
  assert.equal(blur.enabled, true);
  assert.equal(snapshotFilter(blur, 'colour'), 'blur(2px)');
  assert.equal(peripheralMask(blur), undefined);
  assert.equal(combined.enabled, false);
  assert.equal(combined.strengths.colour, 80);
  const original = applyVisionPreset('original');
  assert.equal(snapshotFilter(original, 'colour'), undefined);
  assert.equal(peripheralMask(original), undefined);
  blur.strengths.colour = 100;
  assert.equal(applyVisionPreset('blurred').strengths.colour, 0);
  assert.equal(applyVisionPreset('tritanopia').colourPreset, 'tritanopia');
  assert.equal(snapshotFilter(applyVisionPreset('peripheral'), 'colour'), undefined);
  assert.equal(peripheralMask(applyVisionPreset('peripheral'))?.opacity, 0.65);
});
test('active preset follows visible settings, custom adjustments and pause state', () => {
  assert.equal(activeVisionPreset(defaultVisionSettings()), 'deuteranopia');
  const blue = applyVisionPreset('tritanopia');
  assert.equal(activeVisionPreset(blue), 'tritanopia');
  assert.equal(activeVisionPreset({...blue,enabled:false}), undefined);
  assert.equal(activeVisionPreset({...blue,strengths:{...blue.strengths,blur:1}}), undefined);
  assert.equal(activeVisionPreset(applyIntensity(blue, 'mild')), undefined);
  assert.equal(activeVisionPreset({...applyVisionPreset('blurred'),colourPreset:'grayscale'}), 'blurred');
  assert.equal(activeVisionPreset({...applyVisionPreset('original'),colourPreset:'tritanopia'}), 'original');
});
