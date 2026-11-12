import { machadoMatrices } from './machadoMatrices';

export type Effect = 'colour' | 'contrast' | 'blur' | 'peripheral';
export const effects: Record<Effect, { name: string; description: string }> = {
  colour: { name: 'Colour vision difference', description: 'Adjusts the selected colour simulation to explore colour-dependent cues. Individual colour vision varies.' },
  contrast: { name: 'Reduced contrast', description: 'Softens the distinction between light and dark. Try noticing which details become harder to separate.' },
  blur: { name: 'Blur', description: 'An illustrative loss of sharpness. Blur alone does not capture the experience of low vision.' },
  peripheral: { name: 'Peripheral field restriction', description: 'A simplified illustration of peripheral field restriction. It does not reproduce glaucoma or any individual’s vision.' },
};

type MachadoPreset = keyof typeof machadoMatrices;
export type ColourPreset = MachadoPreset | 'grayscale';
export type VisionSettings = { colourPreset: ColourPreset; strengths: Record<Effect, number> };
export type IntensityPreset = 'mild' | 'moderate' | 'strong';
export const colourPresets: Record<ColourPreset, string> = {
  protanopia: 'Protanopia', deuteranopia: 'Deuteranopia', tritanopia: 'Tritanopia', grayscale: 'Grayscale',
};
export const intensityPresets: Record<IntensityPreset, { name: string; strength: number }> = {
  mild: { name: 'Mild', strength: 25 }, moderate: { name: 'Moderate', strength: 50 }, strong: { name: 'Strong', strength: 80 },
};
export type VisionPreset = 'original' | MachadoPreset | 'blurred' | 'peripheral';
export const visionPresets: Record<VisionPreset, { name: string; colourPreset: ColourPreset; strengths: Record<Effect, number> }> = {
  original: { name: 'Original', colourPreset: 'deuteranopia', strengths: { colour: 0, contrast: 0, blur: 0, peripheral: 0 } },
  protanopia: { name: 'Protanopia', colourPreset: 'protanopia', strengths: { colour: 100, contrast: 0, blur: 0, peripheral: 0 } },
  deuteranopia: { name: 'Deuteranopia', colourPreset: 'deuteranopia', strengths: { colour: 100, contrast: 0, blur: 0, peripheral: 0 } },
  tritanopia: { name: 'Tritanopia', colourPreset: 'tritanopia', strengths: { colour: 100, contrast: 0, blur: 0, peripheral: 0 } },
  blurred: { name: 'Blurred vision', colourPreset: 'deuteranopia', strengths: { colour: 0, contrast: 0, blur: 50, peripheral: 0 } },
  peripheral: { name: 'Reduced peripheral vision', colourPreset: 'deuteranopia', strengths: { colour: 0, contrast: 0, blur: 0, peripheral: 65 } },
};
export function applyVisionPreset(preset: VisionPreset): VisionSettings {
  const value = visionPresets[preset];
  return { colourPreset: value.colourPreset, strengths: { ...value.strengths } };
}
export function activeVisionPreset(settings: VisionSettings): VisionPreset | undefined {
  return (Object.keys(visionPresets) as VisionPreset[]).find(key => {
    const value = visionPresets[key];
    return (Object.keys(effects) as Effect[]).every(effect => settings.strengths[effect] === value.strengths[effect])
      && (value.strengths.colour === 0 || settings.colourPreset === value.colourPreset);
  });
}

export const clampStrength = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
export function defaultVisionSettings(): VisionSettings {
  return applyVisionPreset('deuteranopia');
}
export function applyIntensity(settings: VisionSettings, preset: IntensityPreset): VisionSettings {
  const strength = intensityPresets[preset].strength;
  return { colourPreset: settings.colourPreset, strengths: { colour: strength, contrast: strength, blur: strength, peripheral: strength } };
}

const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const grayscale = [.2126, .7152, .0722, .2126, .7152, .0722, .2126, .7152, .0722];

export function colourMatrix(preset: ColourPreset, strength: number): number[] {
  const clamped = clampStrength(strength);
  const step = clamped / 10;
  const index = Math.floor(step);
  const table = preset === 'grayscale' ? undefined
    : Object.hasOwn(machadoMatrices, preset) ? machadoMatrices[preset] : machadoMatrices.deuteranopia;
  const lower = table ? table[index] : identity;
  const upper = table ? table[Math.min(index + 1, 10)] : grayscale;
  const fraction = table ? step - index : clamped / 100;

  // Expand the interpolated 3×3 coefficients into SVG's RGBA matrix.
  const values: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const channel = row * 3 + column;
      values.push(Number((lower[channel] + (upper[channel] - lower[channel]) * fraction).toFixed(6)));
    }
    values.push(0, 0);
  }
  return [...values, 0, 0, 0, 1, 0];
}
export function snapshotFilter(settings: VisionSettings, colourId: string): string | undefined {
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
  if (strength === 0) return undefined;
  return { opacity: strength / 100,
    background: `radial-gradient(ellipse at center, transparent ${48 - strength * .35}%, rgba(12,20,16,.96) ${85 - strength * .35}%)` };
}
