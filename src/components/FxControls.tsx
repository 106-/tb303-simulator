import { FxData } from '../data/presets';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}

function Knob({ label, value, min, max, step, display, onChange }: KnobProps) {
  return (
    <label className="knob">
      <span className="knob-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
      <span className="knob-val">{display}</span>
    </label>
  );
}

interface Props {
  fx: FxData;
  onChange: (fx: FxData) => void;
}

export function FxControls({ fx, onChange }: Props) {
  const set = (partial: Partial<FxData>) => onChange({ ...fx, ...partial });

  return (
    <div className="fx-panel">
      <div className="fx-section">
        <div className="fx-section-label">DELAY</div>
        <div className="fx-knobs">
          <Knob
            label="TIME"
            value={fx.delayTime}
            min={0.05} max={0.5} step={0.01}
            display={`${Math.round(fx.delayTime * 1000)}ms`}
            onChange={v => set({ delayTime: v })}
          />
          <Knob
            label="FDBK"
            value={fx.delayFeedback}
            min={0} max={0.85} step={0.01}
            display={`${Math.round(fx.delayFeedback * 100)}%`}
            onChange={v => set({ delayFeedback: v })}
          />
          <Knob
            label="MIX"
            value={fx.delayWet}
            min={0} max={1} step={0.01}
            display={`${Math.round(fx.delayWet * 100)}%`}
            onChange={v => set({ delayWet: v })}
          />
        </div>
      </div>

      <div className="fx-section">
        <div className="fx-section-label">REVERB</div>
        <div className="fx-knobs">
          <Knob
            label="MIX"
            value={fx.reverbWet}
            min={0} max={1} step={0.01}
            display={`${Math.round(fx.reverbWet * 100)}%`}
            onChange={v => set({ reverbWet: v })}
          />
          <Knob
            label="SIZE"
            value={fx.reverbDecay}
            min={0.5} max={5} step={0.1}
            display={`${fx.reverbDecay.toFixed(1)}s`}
            onChange={v => set({ reverbDecay: v })}
          />
        </div>
      </div>

      <div className="fx-section">
        <div className="fx-section-label">MOD</div>
        <div className="fx-knobs">
          <Knob
            label="RATE"
            value={fx.modRate}
            min={0.1} max={8} step={0.1}
            display={`${fx.modRate.toFixed(1)}Hz`}
            onChange={v => set({ modRate: v })}
          />
          <Knob
            label="DEPTH"
            value={fx.modDepth}
            min={0} max={1500} step={10}
            display={`${fx.modDepth}`}
            onChange={v => set({ modDepth: v })}
          />
        </div>
      </div>
    </div>
  );
}
