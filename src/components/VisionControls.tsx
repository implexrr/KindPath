import { activeVisionPreset, applyVisionPreset, visionPresets, applyIntensity, clampStrength, colourPresets, defaultVisionSettings, effects, intensityPresets } from './visualEffects';
import type { ColourPreset, Effect, IntensityPreset, VisionPreset, VisionSettings } from './visualEffects';

const sliderLabels: Record<Effect, string> = {
  colour: 'Colour strength', contrast: 'Contrast reduction', blur: 'Blur strength', peripheral: 'Peripheral restriction',
};
interface VisionControlsProps {
  settings: VisionSettings;
  onChange: (value: VisionSettings) => void;
}

export function VisionPresetControls({ settings, onChange }: VisionControlsProps) {
  const activePreset = activeVisionPreset(settings);
  return <section className="vision-controls vision-preset-controls" aria-label="Preview effects">
    <div className="vision-presets" role="group" aria-label="Vision presets" aria-describedby="vision-presets-note">
      <h4>Choose a vision preset</h4>
      <div className="vision-preset-buttons">
        {(Object.keys(visionPresets) as VisionPreset[]).map(key =>
          <button type="button" className="secondary" key={key} aria-pressed={activePreset === key}
            onClick={() => onChange(applyVisionPreset(key))}>
            <svg className="preset-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/>
              <circle cx="12" cy="12" r="3"/>
              <path className="preset-eye-slash" d="m3 3 18 18" pathLength="1" strokeLinecap="butt"/>
            </svg>{visionPresets[key].name}
          </button>)}
      </div>
      <p id="vision-presets-note" className="vision-note">Educational approximations. Individual experiences vary.</p>
    </div>
    <button type="button" className="secondary" onClick={() => onChange(defaultVisionSettings())}>Reset effects</button>
  </section>;
}

export function VisionFineTuning({ settings, onChange }: VisionControlsProps) {
  return <details className="vision-controls vision-fine-tuning">
    <summary>Fine-tune effects</summary>
    <div className="intensity-presets" role="group" aria-label="Intensity presets">
      <span>Starting points</span>
      {(Object.entries(intensityPresets) as [IntensityPreset, { name: string; strength: number }][]).map(([key, value]) =>
        <button type="button" className="secondary" key={key} aria-pressed={Object.values(settings.strengths).every(strength => strength === value.strength)}
          onClick={() => onChange(applyIntensity(settings, key))}>{value.name}</button>)}
    </div>
    <p className="vision-note">Intensity presets set all four strengths.</p>
    <div className="colour-choice">
      <label htmlFor="colour-preset">Colour preset</label>
      <div className="select-field">
        <select id="colour-preset" value={settings.colourPreset} aria-describedby="colour-preset-note"
          onChange={event => onChange({ ...settings, colourPreset: event.target.value as ColourPreset })}>
          {Object.entries(colourPresets).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select>
      </div>
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
  </details>;
}
