import { PatternData } from '../data/presets';

interface Props {
  pattern: PatternData;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onChange: (p: PatternData) => void;
}

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

export function Controls({ pattern, isPlaying, onTogglePlay, onChange }: Props) {
  const set = (partial: Partial<PatternData>) => onChange({ ...pattern, ...partial });

  return (
    <div className="controls">
      <button
        className={`play-btn ${isPlaying ? 'playing' : ''}`}
        onClick={onTogglePlay}
      >
        {isPlaying ? '■ STOP' : '▶ PLAY'}
      </button>

      <Knob
        label="BPM"
        value={pattern.bpm}
        min={60} max={200} step={1}
        display={String(pattern.bpm)}
        onChange={v => set({ bpm: v })}
      />
      <Knob
        label="TUNE"
        value={pattern.tune}
        min={-12} max={12} step={0.5}
        display={`${pattern.tune > 0 ? '+' : ''}${pattern.tune.toFixed(1)}`}
        onChange={v => set({ tune: v })}
      />
      <Knob
        label="VOL"
        value={pattern.volume}
        min={0} max={1} step={0.01}
        display={`${Math.round(pattern.volume * 100)}%`}
        onChange={v => set({ volume: v })}
      />

      <label className="knob">
        <span className="knob-label">WAVE</span>
        <button
          className="wave-btn"
          onClick={() => set({ waveform: pattern.waveform === 'sawtooth' ? 'square' : 'sawtooth' })}
        >
          {pattern.waveform === 'sawtooth' ? 'SAW' : 'SQR'}
        </button>
      </label>

      <Knob
        label="RES"
        value={pattern.resonance}
        min={0} max={5} step={0.05}
        display={pattern.resonance.toFixed(2)}
        onChange={v => set({ resonance: v })}
      />
      <Knob
        label="CUTOFF"
        value={pattern.cutoffBase}
        min={20} max={2000} step={10}
        display={`${pattern.cutoffBase}Hz`}
        onChange={v => set({ cutoffBase: v })}
      />
      <Knob
        label="ENV"
        value={pattern.envAmount}
        min={0} max={10000} step={100}
        display={String(pattern.envAmount)}
        onChange={v => set({ envAmount: v })}
      />
      <Knob
        label="DECAY"
        value={pattern.decay}
        min={0.05} max={2} step={0.05}
        display={`${pattern.decay.toFixed(2)}s`}
        onChange={v => set({ decay: v })}
      />
      <Knob
        label="ACCENT"
        value={pattern.accentLevel}
        min={0} max={1} step={0.05}
        display={`${Math.round(pattern.accentLevel * 100)}%`}
        onChange={v => set({ accentLevel: v })}
      />
    </div>
  );
}
