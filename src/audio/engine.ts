import { PatternData, FxData, DEFAULT_FX, midiToFreq } from '../data/presets';

function makeTanhCurve(n: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (2 * i) / (n - 1) - 1;
    curve[i] = Math.tanh(x * 1.5);
  }
  return curve;
}

export class TB303Engine {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private filter1: BiquadFilterNode | null = null;
  private filter2: BiquadFilterNode | null = null;
  private vca: GainNode | null = null;

  private outGain: GainNode | null = null;

  private delay: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;
  private delayWetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  private isPlaying = false;
  private currentStep = 0;
  private nextNoteTime = 0;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  private readonly LOOKAHEAD = 0.12;
  private readonly SCHEDULE_INTERVAL = 30;

  private pattern: PatternData;
  private fx: FxData;
  private onStep: ((step: number) => void) | null = null;

  constructor(pattern: PatternData, fx: FxData = { ...DEFAULT_FX }) {
    this.pattern = { ...pattern };
    this.fx = { ...fx };
  }

  setPattern(p: PatternData) {
    this.pattern = { ...p };
    if (!this.ctx) return;
    this.osc!.type = p.waveform;
    this.outGain!.gain.value = p.volume;
  }

  setFx(fx: FxData) {
    const prevDecay = this.fx.reverbDecay;
    this.fx = { ...fx };
    if (!this.ctx) return;

    this.delay!.delayTime.value = fx.delayTime;
    this.delayFeedbackGain!.gain.value = fx.delayFeedback;
    this.delayWetGain!.gain.value = fx.delayWet;
    this.reverbWetGain!.gain.value = fx.reverbWet;
    this.lfo!.frequency.value = fx.modRate;
    this.lfoGain!.gain.value = fx.modDepth;

    if (fx.reverbDecay !== prevDecay) {
      this.convolver!.buffer = this.makeIR(fx.reverbDecay);
    }
  }

  setOnStep(cb: (step: number) => void) {
    this.onStep = cb;
  }

  async previewNote(midi: number) {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.buildGraph();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = midiToFreq(midi) * Math.pow(2, this.pattern.tune / 12);

    const osc = ctx.createOscillator();
    osc.type = this.pattern.waveform;
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.pattern.cutoffBase + this.pattern.envAmount, now);
    filter.frequency.setTargetAtTime(this.pattern.cutoffBase, now, 0.08);
    filter.Q.value = this.pattern.resonance * 8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.7 * this.pattern.volume, now + 0.003);
    gain.gain.setTargetAtTime(0, now + 0.003, 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  async start() {
    if (this.isPlaying) return;

    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.buildGraph();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.tick();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId !== null) clearTimeout(this.timerId);
    this.timerId = null;
    if (this.vca) {
      this.vca.gain.cancelScheduledValues(0);
      this.vca.gain.setValueAtTime(0, this.ctx!.currentTime);
    }
    this.onStep?.(-1);
  }

  private makeIR(decaySec: number): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.ceil(sr * decaySec);
    const buf = ctx.createBuffer(2, len, sr);
    // k: -60dB (1/1000) at end of buffer
    const k = Math.log(1000) / len;
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-k * i);
      }
    }
    return buf;
  }

  private buildGraph() {
    const ctx = this.ctx!;

    this.osc = ctx.createOscillator();
    this.osc.type = this.pattern.waveform;
    this.osc.frequency.value = 110;

    // Two cascaded biquad LP filters = 4-pole, -24dB/oct (Moog-like slope)
    this.filter1 = ctx.createBiquadFilter();
    this.filter1.type = 'lowpass';

    this.filter2 = ctx.createBiquadFilter();
    this.filter2.type = 'lowpass';
    this.filter2.Q.value = 0.5;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeTanhCurve(512);
    shaper.oversample = '4x';

    this.vca = ctx.createGain();
    this.vca.gain.value = 0;

    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.pattern.volume;
    const outGain = this.outGain;

    // Diode-ladder approximation: saturation inside the filter path
    // filter1 (resonant) → shaper (in-filter nonlinearity) → filter2 (cleanup, 2x cutoff)
    // Combined slope ≈ 18dB/oct in the musically critical band
    this.osc.connect(this.filter1);
    this.filter1.connect(shaper);
    shaper.connect(this.filter2);
    this.filter2.connect(this.vca);
    this.vca.connect(outGain);
    outGain.connect(ctx.destination);

    this.osc.start();

    // --- Delay ---
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = this.fx.delayTime;

    this.delayFeedbackGain = ctx.createGain();
    this.delayFeedbackGain.gain.value = this.fx.delayFeedback;

    this.delayWetGain = ctx.createGain();
    this.delayWetGain.gain.value = this.fx.delayWet;

    outGain.connect(this.delay);
    this.delay.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delay);  // feedback loop
    this.delay.connect(this.delayWetGain);
    this.delayWetGain.connect(ctx.destination);

    // --- Reverb ---
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.makeIR(this.fx.reverbDecay);

    this.reverbWetGain = ctx.createGain();
    this.reverbWetGain.gain.value = this.fx.reverbWet;

    outGain.connect(this.convolver);
    this.convolver.connect(this.reverbWetGain);
    this.reverbWetGain.connect(ctx.destination);

    // --- LFO → filter modulation ---
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = this.fx.modRate;

    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = this.fx.modDepth;

    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter1.frequency);
    this.lfoGain.connect(this.filter2.frequency);
    this.lfo.start();
  }

  private tick() {
    if (!this.isPlaying || !this.ctx) return;

    while (this.nextNoteTime < this.ctx.currentTime + this.LOOKAHEAD) {
      const stepDur = 60 / this.pattern.bpm / 4;
      this.scheduleStep(this.currentStep, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.currentStep = (this.currentStep + 1) % 16;
    }

    this.timerId = setTimeout(() => this.tick(), this.SCHEDULE_INTERVAL);
  }

  private scheduleStep(idx: number, time: number, stepDur: number) {
    const ctx = this.ctx!;
    const step = this.pattern.steps[idx];
    const prevStep = this.pattern.steps[(idx - 1 + 16) % 16];
    const hasSlide = prevStep.slide && prevStep.active;

    // Visual step indicator
    const delay = Math.max(0, (time - ctx.currentTime) * 1000);
    setTimeout(() => { if (this.isPlaying) this.onStep?.(idx); }, delay);

    if (!step.active) {
      this.vca!.gain.setValueAtTime(0, time);
      return;
    }

    const { resonance, cutoffBase, envAmount, decay, tune, accentLevel } = this.pattern;
    const accent = step.accent;
    const freq = midiToFreq(step.note) * Math.pow(2, tune / 12);

    // --- Oscillator frequency ---
    if (hasSlide) {
      const prevFreq = midiToFreq(prevStep.note);
      this.osc!.frequency.setValueAtTime(prevFreq, time);
      this.osc!.frequency.exponentialRampToValueAtTime(freq, time + 0.06);
    } else {
      this.osc!.frequency.setValueAtTime(freq, time);
    }

    // --- Filter envelope ---
    // Accent decay much shorter for TB-303-style punch
    const fDecay = accent ? 0.05 : decay;
    const fAmount = accent ? envAmount * (1 + 0.4 * accentLevel) : envAmount;
    const q = accent ? Math.min(resonance + 0.5 * accentLevel, 3.95) * 8 : resonance * 8;
    const sr = ctx.sampleRate;
    const cutoffPeak = Math.min(cutoffBase + fAmount, sr / 2 - 100);
    const cutoffMin = Math.max(cutoffBase, 30);
    // filter2 tracks at 2x cutoff → combined slope ≈ 18dB/oct
    const cutoffPeak2 = Math.min(cutoffPeak * 2, sr / 2 - 100);
    const cutoffMin2 = Math.min(cutoffMin * 2, sr / 2 - 100);

    if (!hasSlide) {
      this.filter1!.frequency.setValueAtTime(cutoffPeak, time);
      this.filter2!.frequency.setValueAtTime(cutoffPeak2, time);
    }
    this.filter1!.frequency.setTargetAtTime(cutoffMin, time, fDecay);
    this.filter2!.frequency.setTargetAtTime(cutoffMin2, time, fDecay);
    this.filter1!.Q.setValueAtTime(Math.max(0.5, q), time);

    // --- VCA envelope ---
    const ampDecay = accent ? stepDur * 1.2 : stepDur * 0.6;
    const ampPeak = accent ? 1.0 + 0.4 * accentLevel : 1.0;

    if (!hasSlide) {
      this.vca!.gain.setValueAtTime(0, time);
      this.vca!.gain.linearRampToValueAtTime(ampPeak, time + 0.003);
    } else {
      this.vca!.gain.setValueAtTime(ampPeak, time);
    }
    this.vca!.gain.setTargetAtTime(0, time + 0.003, ampDecay / 3);
  }
}
