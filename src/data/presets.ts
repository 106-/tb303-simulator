export interface FxData {
  delayTime: number;      // 0–0.5 s
  delayFeedback: number;  // 0–0.85
  delayWet: number;       // 0–1
  reverbWet: number;      // 0–1
  reverbDecay: number;    // 0.5–5 s
  modRate: number;        // 0.1–8 Hz
  modDepth: number;       // 0–1500 Hz
}

export const DEFAULT_FX: FxData = {
  delayTime: 0.25,
  delayFeedback: 0.4,
  delayWet: 0,
  reverbWet: 0,
  reverbDecay: 2,
  modRate: 2,
  modDepth: 0,
};

export interface Step {
  active: boolean;
  note: number;    // MIDI note number
  accent: boolean;
  slide: boolean;
}

export interface PatternData {
  name: string;
  bpm: number;
  tune: number;        // semitones, -12–+12
  volume: number;      // 0–1
  waveform: 'sawtooth' | 'square';
  resonance: number;   // 0–5
  cutoffBase: number;  // Hz
  envAmount: number;   // Hz
  decay: number;       // seconds
  accentLevel: number; // 0–1
  steps: Step[];
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + octave;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// MIDI range for note select: E1(28) to G3(55)
export const MIDI_RANGE = Array.from({ length: 55 - 28 + 1 }, (_, i) => 28 + i);

type RawStep = [number | null, boolean, boolean, boolean?];

function fromRaw(
  raw: RawStep[],
  name: string,
  bpm: number,
  resonance: number,
  cutoffBase: number,
  envAmount: number,
  decay: number,
  tune = 0,
  volume = 0.75,
  waveform: 'sawtooth' | 'square' = 'sawtooth',
  accentLevel = 1.0,
): PatternData {
  return {
    name, bpm, tune, volume, waveform, resonance, cutoffBase, envAmount, decay, accentLevel,
    steps: raw.slice(0, 16).map(([note, accent, slide, active]) => ({
      active: active ?? note !== null,
      note: note ?? 33,
      accent,
      slide,
    })),
  };
}

export const PRESETS: PatternData[] = [
  fromRaw([
    [33, false, false], [33, true,  false], [45, false, false], [33, false, true],
    [33, false, false], [40, true,  false], [33, false, false], [45, false, false],
    [33, false, true],  [37, false, false], [33, true,  false], [33, false, false],
    [45, false, false], [33, false, true],  [52, false, false], [37, true,  false],
  ], 'Classic Acid', 130, 2.4, 80, 4500, 0.4),

  fromRaw([
    [33, true,  true],  [33, false, true],  [36, true,  false], [33, false, false],
    [33, true,  true],  [40, false, true],  [38, true,  false], [33, false, false],
    [33, true,  true],  [33, false, true],  [36, true,  true],  [38, false, false],
    [40, true,  true],  [38, false, true],  [36, true,  false], [33, true,  false],
  ], 'Hard Techno', 145, 2.6, 60, 5500, 0.2),

  fromRaw([
    [33, true,  false], [33, false, true],  [33, true,  false], [33, false, false],
    [33, false, true],  [36, true,  true],  [33, false, false], [33, true,  false],
    [33, true,  true],  [33, false, false], [33, true,  true],  [36, false, false],
    [33, false, true],  [33, true,  false], [36, true,  true],  [33, false, false],
  ], 'Extreme Squelch', 128, 3.0, 25, 9000, 0.1),

  fromRaw([
    [45, false, false], [null, false, false], [45, true,  false], [null, false, false],
    [45, false, true],  [48,   false, false], [null, false, false], [43, false, false],
    [40, false, false], [null, false, false], [40,  false, true],  [38, false, false],
    [36, false, true],  [38,   false, false], [40,  true,  false], [null, false, false],
  ], 'Funky Groove', 95, 1.3, 350, 2500, 0.7),

  fromRaw([
    [40, false, false], [40, true,  false], [41, false, true],  [40, false, false],
    [40, false, true],  [44, false, false], [40, false, true],  [41, true,  false],
    [40, false, false], [38, false, true],  [40, false, false], [41, false, false],
    [44, true,  true],  [45, false, false], [44, false, true],  [40, false, false],
  ], 'Dark Phrygian', 120, 2.1, 50, 4000, 0.55),

  fromRaw([
    [33, false, false], [33, true,  false], [33, false, false], [33, false, false],
    [33, true,  false], [33, false, false], [34, false, true],  [33, false, false],
    [33, false, false], [33, true,  false], [33, false, false], [33, false, true],
    [34, false, false], [33, true,  false], [33, false, false], [33, false, false],
  ], 'Hypnotic Minimal', 132, 2.2, 80, 5000, 0.3),

  fromRaw([
    [33, true,  false], [null, false, false], [33, false, false], [34, false, true],
    [33, true,  false], [null, false, false], [33, false, false], [40, false, false],
    [33, true,  false], [34,   false, true],  [33, false, false], [null, false, false],
    [33, true,  false], [36,   false, false], [34, false, true],  [33, true,  false],
  ], 'Denki Drill', 134, 2.5, 65, 5200, 0.22),

  fromRaw([
    [45, true,  false], [null, false, false], [45, false, true],  [47, false, false],
    [45, true,  false], [43,   false, false], [45, false, false], [null, false, false],
    [45, true,  true],  [47,   false, false], [45, true,  false], [40,  false, true],
    [43, false, false], [45,   true,  false], [43, false, true],  [45,  false, false],
  ], 'Denki Flashback', 138, 2.3, 120, 4500, 0.28),

  fromRaw([
    [36, false, false], [48, false, false, false], [48, true,  false], [39, false, false],
    [40, false, false], [39, false, false],        [40, false, false], [39, false, false],
    [40, true,  false], [39, false, false],        [40, false, false], [36, false, false],
    [40, false, false], [40, false, false],        [36, false, false], [36, false, false],
  ], 'Denki Popcorn', 134, 0, 20, 5900, 0.25, 0, 0.75, 'sawtooth', 1.0),
];

export function emptyPattern(): PatternData {
  return {
    name: 'User',
    bpm: 120,
    tune: 0,
    volume: 0.75,
    waveform: 'sawtooth',
    resonance: 2.0,
    cutoffBase: 100,
    envAmount: 4000,
    decay: 0.4,
    accentLevel: 1.0,
    steps: Array.from({ length: 16 }, (_, i) => ({
      active: i % 4 === 0,
      note: 33,
      accent: false,
      slide: false,
    })),
  };
}
