import { activeVisionPreset, applyVisionPreset, visionPresets, applyIntensity, clampStrength, colourPresets, defaultVisionSettings, effects, intensityPresets } from './visualEffects';
import type { ColourPreset, Effect, IntensityPreset, VisionPreset, VisionSettings } from './visualEffects';

const sliderLabels: Record<Effect, string> = {
  colour: 'Colour strength', contrast: 'Contrast reduction', blur: 'Blur strength', peripheral: 'Peripheral restriction',
};
export function VisionControls({ settings, onChange }: { settings: VisionSettings; onChange: (value: VisionSettings) => void }) {
  const activePreset = activeVisionPreset(settings);
  return <section className="vision-controls" aria-labelledby="vision-controls-title">
    <div className="vision-toolbar">
      <div><h3 id="vision-controls-title">Adjust the modified preview</h3><p>Combine effects or explore one at a time. The original snapshot stays unchanged.</p></div>
      <div className="vision-actions">
        <button type="button" className="secondary" onClick={() => onChange(defaultVisionSettings())}>Reset effects</button>
      </div>
    </div>
    <div className="vision-presets" role="group" aria-label="Vision presets" aria-describedby="vision-presets-note">
      <h4>Choose a vision preset</h4>
      <div className="vision-preset-buttons">
        {(Object.keys(visionPresets) as VisionPreset[]).map(key =>
          <button type="button" className="secondary" key={key} aria-pressed={activePreset === key}
            onClick={() => onChange(applyVisionPreset(key))}>{visionPresets[key].name}</button>)}
      </div>
      <p id="vision-presets-note" className="vision-note">Selecting a preset updates the sliders below.</p>
    </div>
    <div className="intensity-presets" role="group" aria-label="Intensity presets">
      <span>Starting points</span>
      {(Object.entries(intensityPresets) as [IntensityPreset, { name: string; strength: number }][]).map(([key, value]) =>
        <button type="button" className="secondary" key={key} aria-pressed={Object.values(settings.strengths).every(strength => strength === value.strength)}
          onClick={() => onChange(applyIntensity(settings, key))}>{value.name}</button>)}
    </div>
    <p className="vision-note">Intensity presets set all four strengths.</p>
    <div className="colour-choice">
      <label htmlFor="colour-preset">Colour preset</label>
      <select id="colour-preset" value={settings.colourPreset} aria-describedby="colour-preset-note"
        onChange={event => onChange({ ...settings, colourPreset: event.target.value as ColourPreset })}>
        {Object.entries(colourPresets).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
      <p id="colour-preset-note">The named colour filters use the Machado model. Use Colour strength for milder simulations, with 100% showing the named form. Individual colour vision varies.</p>
    </div>
    <div className="effect-grid">
      {(Object.keys(effects) as Effect[]).map(key => <div className="effect-control" key={key}>
        <div className="effect-label"><label htmlFor={`${key}-strength`}>{sliderLabels[key]}</label>
          <output htmlFor={`${key}-strength`} aria-hidden="true">{settings.strengths[key]}%</output></div>
        <input id={`${key}-strength`} type="range" min="0" max="100" value={settings.strengths[key]}
          aria-describedby={key === 'colour' ? 'colour-description colour-preset-note' : `${key}-description`} aria-valuetext={`${settings.strengths[key]} percent`}
          onChange={event => onChange({ ...settings, strengths: { ...settings.strengths, [key]: clampStrength(Number(event.target.value)) } })}/>
        <p id={`${key}-description`}>{effects[key].description}</p>
      </div>)}
    </div>
  </section>;
}
