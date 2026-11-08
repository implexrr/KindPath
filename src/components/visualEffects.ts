export type Effect = 'colour' | 'contrast' | 'blur' | 'peripheral';
export const effects: Record<Effect, { name: string; description: string }> = {
  colour: { name: 'Colour vision difference', description: 'An illustrative red–green colour transformation. It does not represent every type of colour vision deficiency.' },
  contrast: { name: 'Reduced contrast', description: 'Softens the distinction between light and dark. Try noticing which details become harder to separate.' },
  blur: { name: 'Blur', description: 'An illustrative loss of sharpness. Blur alone does not capture the experience of low vision.' },
  peripheral: { name: 'Peripheral field restriction', description: 'A simplified illustration of peripheral field restriction. It does not reproduce glaucoma or any individual’s vision.' },
};
