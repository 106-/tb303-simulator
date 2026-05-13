import { PRESETS, PatternData } from '../data/presets';

interface Props {
  current: PatternData;
  onSelect: (p: PatternData) => void;
}

export function PresetBar({ current, onSelect }: Props) {
  return (
    <div className="preset-bar">
      <span className="preset-label">PRESET</span>
      {PRESETS.map((p) => (
        <button
          key={p.name}
          className={`preset-btn ${current.name === p.name ? 'active' : ''}`}
          onClick={() => onSelect({ ...p, steps: p.steps.map(s => ({ ...s })) })}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
