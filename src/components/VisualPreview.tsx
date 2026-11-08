import { SampleSite } from './SampleSite';
import { effects } from './visualEffects';
import type { Effect } from './visualEffects';

interface VisualPreviewProps {
  effect: Effect;
  strength: number;
  onEffectChange: (effect: Effect) => void;
  onStrengthChange: (strength: number) => void;
  onReset: () => void;
}

export function VisualPreview({ effect, strength, onEffectChange, onStrengthChange, onReset }: VisualPreviewProps) {
  return <div className="preview-workspace">
    <div className="preview-controls">
      <div>
        <label htmlFor="effect">Visual effect</label>
        <select id="effect" value={effect} onChange={e => onEffectChange(e.target.value as Effect)}>
          {Object.entries(effects).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
        </select>
      </div>
      <div className="strength">
        <label htmlFor="strength">Effect strength <output htmlFor="strength">{strength}%</output></label>
        <input
          id="strength" type="range" min="0" max="100" value={strength}
          onChange={e => onStrengthChange(Number(e.target.value))}
        />
      </div>
      <button className="secondary" onClick={onReset}>Reset effects</button>
    </div>
    <p className="effect-description">{effects[effect].description}</p>
    <div className="comparison">
      <div>
        <h3><span className="status-dot"/>Original example</h3>
        <SampleSite modified={false} effect={effect} strength={strength}/>
      </div>
      <div>
        <h3><span className="status-dot altered"/>With visual effect</h3>
        <SampleSite modified effect={effect} strength={strength}/>
      </div>
    </div>
    <p className="preview-caption">Hover over “Explore the collection” to see its style change. Navigation and submissions are disabled. The ad is a static placeholder.</p>
    <div className="notice">Educational approximations. Vision varies between people; these effects do not reproduce a medical condition or replace accessibility testing.</div>
  </div>;
}
