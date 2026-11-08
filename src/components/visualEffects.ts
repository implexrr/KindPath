export type Effect = 'colour' | 'contrast' | 'blur' | 'peripheral';
export const effects: Record<Effect, { name: string; description: string }> = {
  colour: { name: 'Colour vision difference', description: 'Adjusts the selected colour mix to explore colour-dependent cues. It does not reproduce individual colour vision.' },
  contrast: { name: 'Reduced contrast', description: 'Softens the distinction between light and dark. Try noticing which details become harder to separate.' },
  blur: { name: 'Blur', description: 'An illustrative loss of sharpness. Blur alone does not capture the experience of low vision.' },
  peripheral: { name: 'Peripheral field restriction', description: 'A simplified illustration of peripheral field restriction. It does not reproduce glaucoma or any individual’s vision.' },
};

export type ColourPreset = 'red-green' | 'blue-yellow' | 'grayscale';
export type VisionSettings = { enabled: boolean; colourPreset: ColourPreset; strengths: Record<Effect, number> };
export type IntensityPreset = 'mild' | 'moderate' | 'strong';
export const colourPresets: Record<ColourPreset, string> = {
  'red-green': 'Red–green', 'blue-yellow': 'Blue–yellow', grayscale: 'Grayscale',
};
export const intensityPresets: Record<IntensityPreset, { name: string; strength: number }> = {
  mild: { name: 'Mild', strength: 25 }, moderate: { name: 'Moderate', strength: 50 }, strong: { name: 'Strong', strength: 80 },
};
export const clampStrength = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
export function defaultVisionSettings(): VisionSettings {
  return { enabled: true, colourPreset: 'red-green', strengths: { colour: 65, contrast: 0, blur: 0, peripheral: 0 } };
}
export function applyIntensity(settings: VisionSettings, preset: IntensityPreset): VisionSettings {
  const strength = intensityPresets[preset].strength;
  return { enabled: true, colourPreset: settings.colourPreset, strengths: { colour: strength, contrast: strength, blur: strength, peripheral: strength } };
}

// Illustrative display-space channel mixes, not calibrated models of a person's vision.
// SVG matrix layout: https://www.w3.org/TR/SVG11/filters.html#feColorMatrixElement
const colourMixes = new Map<ColourPreset, number[]>([
  ['red-green', [.567, .433, 0, .558, .442, 0, 0, .242, .758]],
  ['blue-yellow', [.95, .05, 0, 0, .433, .567, 0, .475, .525]],
  ['grayscale', [.2126, .7152, .0722, .2126, .7152, .0722, .2126, .7152, .0722]],
]);
export function colourMatrix(preset: ColourPreset, strength: number): number[] {
  const mix = colourMixes.get(preset) ?? colourMixes.get('red-green')!;
  const amount = clampStrength(strength) / 100;
  const values: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const identity = row === column ? 1 : 0;
      values.push(Number((identity + (mix[row * 3 + column] - identity) * amount).toFixed(6)));
    }
    values.push(0, 0);
  }
  return [...values, 0, 0, 0, 1, 0];
}
export function snapshotFilter(settings: VisionSettings, colourId: string): string | undefined {
  if (!settings.enabled) return undefined;
  const { colour, contrast, blur } = settings.strengths;
  const filters = [
    clampStrength(colour) > 0 ? `url(#${colourId})` : '',
    clampStrength(contrast) > 0 ? `contrast(${1 - clampStrength(contrast) / 150})` : '',
    clampStrength(blur) > 0 ? `blur(${clampStrength(blur) / 25}px)` : '',
  ].filter(Boolean);
  return filters.length ? filters.join(' ') : undefined;
}
export function peripheralMask(settings: VisionSettings) {
  const strength = clampStrength(settings.strengths.peripheral);
  if (!settings.enabled || strength === 0) return undefined;
  return { opacity: strength / 100,
    background: `radial-gradient(ellipse at center, transparent ${48 - strength * .35}%, rgba(12,20,16,.96) ${85 - strength * .35}%)` };
}
