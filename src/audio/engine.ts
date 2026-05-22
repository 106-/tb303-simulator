import { PatternData, FxData, DEFAULT_FX, midiToFreq } from '../data/presets';

export class TB303Engine {
  private ctx: AudioContext | null = null;
  private voice: AudioWorkletNode | null = null;

  private outGain: GainNode | null = null;

  private delay: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;
  private delayWetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;

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
    this.outGain!.gain.value = p.volume;
    this.sendVoiceParams();
  }

  setFx(fx: FxData) {
    const prevDecay = this.fx.reverbDecay;
    this.fx = { ...fx };
    if (!this.ctx) return;

    this.delay!.delayTime.value = fx.delayTime;
    this.delayFeedbackGain!.gain.value = fx.delayFeedback;
    this.delayWetGain!.gain.value = fx.delayWet;
    this.reverbWetGain!.gain.value = fx.reverbWet;
    this.sendVoiceParams();

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
      await this.buildGraph();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = midiToFreq(midi) * Math.pow(2, this.pattern.tune / 12);
    this.postVoiceEvent({
      kind: 'on',
      time: now + 0.01,
      freq,
      slide: false,
      accent: false,
      stepDur: 0.35,
      ...this.voiceParams(),
    });
    this.postVoiceEvent({ kind: 'off', time: now + 0.35 });
  }

  async start() {
    if (this.isPlaying) return;

    if (!this.ctx) {
      this.ctx = new AudioContext();
      await this.buildGraph();
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
    if (this.voice) {
      this.voice.port.postMessage({ type: 'silence' });
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

  private async buildGraph() {
    const ctx = this.ctx!;
    const baseUrl = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
    await ctx.audioWorklet.addModule(`${baseUrl}tb303-processor.js`);

    this.voice = new AudioWorkletNode(ctx, 'tb303-voice', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.pattern.volume;
    const outGain = this.outGain;

    this.voice.connect(outGain);
    outGain.connect(ctx.destination);

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

    this.sendVoiceParams();
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
      this.postVoiceEvent({ kind: 'off', time });
      return;
    }

    const { tune } = this.pattern;
    const accent = step.accent;
    const freq = midiToFreq(step.note) * Math.pow(2, tune / 12);
    this.postVoiceEvent({
      kind: 'on',
      time,
      freq,
      slide: hasSlide,
      accent,
      stepDur,
      ...this.voiceParams(),
    });
  }

  private voiceParams() {
    const { waveform, resonance, cutoffBase, envAmount, decay, accentLevel } = this.pattern;
    return {
      waveform,
      resonance,
      cutoffBase,
      envAmount,
      decay,
      accentLevel,
      modRate: this.fx.modRate,
      modDepth: this.fx.modDepth,
    };
  }

  private sendVoiceParams() {
    this.voice?.port.postMessage({ type: 'params', params: this.voiceParams() });
  }

  private postVoiceEvent(event: Record<string, number | string | boolean>) {
    this.voice?.port.postMessage({ type: 'event', event });
  }
}
