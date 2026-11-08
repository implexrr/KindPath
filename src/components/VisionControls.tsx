import { applyIntensity, clampStrength, colourPresets, defaultVisionSettings, effects, intensityPresets } from './visualEffects';
import type { ColourPreset, Effect, IntensityPreset, VisionSettings } from './visualEffects';

const sliderLabels: Record<Effect, string> = {
  colour: 'Colour strength', contrast: 'Contrast reduction', blur: 'Blur strength', peripheral: 'Peripheral restriction',
};
export function VisionControls({ settings, onChange }: { settings: VisionSettings; onChange: (value: VisionSettings) => void }) {
  const hasEffects = Object.values(settings.strengths).some(value => value > 0);
  return <section className="vision-controls" aria-labelledby="vision-controls-title">
    <div className="vision-toolbar">
      <div><h3 id="vision-controls-title">Adjust the modified preview</h3><p>Combine effects or explore one at a time. The original snapshot stays unchanged.</p></div>
      <div className="vision-actions">
        <button type="button" className="secondary" aria-pressed={settings.enabled} onClick={() => onChange({ ...settings, enabled: !settings.enabled })}>Apply visual effects</button>
        <span className="vision-toggle-status" aria-hidden="true">{settings.enabled ? 'On' : 'Off'}</span>
        <button type="button" className="secondary" onClick={() => onChange(defaultVisionSettings())}>Reset effects</button>
      </div>
    </div>
    <div className="intensity-presets" role="group" aria-label="Intensity presets">
      <span>Starting points</span>
      {(Object.entries(intensityPresets) as [IntensityPreset, { name: string; strength: number }][]).map(([key, value]) =>
        <button type="button" className="secondary" key={key} aria-pressed={settings.enabled && Object.values(settings.strengths).every(strength => strength === value.strength)}
          onClick={() => onChange(applyIntensity(settings, key))}>{value.name}</button>)}
    </div>
    <p className="vision-note">Presets turn effects on and set all four strengths. Percentages describe visual settings, not measured vision loss.</p>
    <div className="colour-choice">
      <label htmlFor="colour-preset">Colour preset</label>
      <select id="colour-preset" value={settings.colourPreset} aria-describedby="colour-preset-note"
        onChange={event => onChange({ ...settings, colourPreset: event.target.value as ColourPreset })}>
        {Object.entries(colourPresets).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
      <p id="colour-preset-note">Illustrative colour mixes; individual colour vision varies.</p>
    </div>
    <div className="effect-grid">
      {(Object.keys(effects) as Effect[]).map(key => <div className="effect-control" key={key}>
        <div className="effect-label"><label htmlFor={`${key}-strength`}>{sliderLabels[key]}</label>
          <output htmlFor={`${key}-strength`} aria-hidden="true">{settings.strengths[key]}%</output></div>
        <input id={`${key}-strength`} type="range" min="0" max="100" value={settings.strengths[key]}
          aria-describedby={`${key}-description`} aria-valuetext={`${settings.strengths[key]} percent`}
          onChange={event => onChange({ ...settings, strengths: { ...settings.strengths, [key]: clampStrength(Number(event.target.value)) } })}/>
        <p id={`${key}-description`}>{effects[key].description}</p>
      </div>)}
    </div>
    <p className="vision-application-status" role="status" aria-live="polite">{!settings.enabled
      ? 'Effects paused. Your slider settings are retained.'
      : hasEffects ? 'Effects are applied to the modified snapshot only.' : 'All strengths are zero. Both snapshots show the original appearance.'}</p>
  </section>;
}
