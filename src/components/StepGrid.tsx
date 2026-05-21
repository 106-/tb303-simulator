import { NOTE_NAMES, Step, PatternData, midiToName, MIDI_RANGE } from '../data/presets';

const REVERSED_RANGE = [...MIDI_RANGE].reverse();

interface StepCellProps {
  step: Step;
  index: number;
  isCurrent: boolean;
  onChange: (s: Step) => void;
  onPreviewNote?: (midi: number) => void;
}

function StepCell({ step, index, isCurrent, onChange, onPreviewNote }: StepCellProps) {
  const set = (partial: Partial<Step>) => onChange({ ...step, ...partial });

  return (
    <div className={`step-cell ${step.active ? 'step-on' : 'step-off'} ${isCurrent ? 'step-playing' : ''}`}>
      <div className="step-num">{index + 1}</div>

      <div className="note-picker">
        <div className="note-lcd">{midiToName(step.note)}</div>
        <div className="note-dots">
          {REVERSED_RANGE.map(m => {
            const isSharp = NOTE_NAMES[m % 12].includes('#');
            const isC = m % 12 === 0;
            return (
              <button
                key={m}
                className={[
                  'note-dot',
                  isSharp ? 'note-dot-sharp' : 'note-dot-nat',
                  isC ? 'note-dot-c' : '',
                  step.note === m ? 'note-dot-sel' : '',
                ].filter(Boolean).join(' ')}
                disabled={!step.active}
                onClick={() => { set({ note: m }); onPreviewNote?.(m); }}
                title={midiToName(m)}
              />
            );
          })}
        </div>
      </div>

      <div className="step-flags">
        <button
          className={`flag-btn accent-btn ${step.accent ? 'flag-on' : ''}`}
          onClick={() => set({ accent: !step.accent })}
          title="Accent"
        >A</button>
        <button
          className={`flag-btn slide-btn ${step.slide ? 'flag-on' : ''}`}
          onClick={() => set({ slide: !step.slide })}
          title="Slide"
        >S</button>
      </div>

      <button
        className="step-led"
        onClick={() => set({ active: !step.active })}
        aria-label={step.active ? 'on' : 'off'}
      />
    </div>
  );
}

interface Props {
  pattern: PatternData;
  currentStep: number;
  onChange: (p: PatternData) => void;
  onPreviewNote?: (midi: number) => void;
}

export function StepGrid({ pattern, currentStep, onChange, onPreviewNote }: Props) {
  const updateStep = (i: number, s: Step) => {
    const steps = pattern.steps.map((st, idx) => idx === i ? s : st);
    onChange({ ...pattern, steps });
  };

  return (
    <div className="step-grid">
      {pattern.steps.map((step, i) => (
        <StepCell
          key={i}
          step={step}
          index={i}
          isCurrent={currentStep === i}
          onChange={s => updateStep(i, s)}
          onPreviewNote={onPreviewNote}
        />
      ))}
    </div>
  );
}
