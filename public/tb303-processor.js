class TB303VoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.events = [];
    this.phase = 0;
    this.freq = 110;
    this.slideStart = 110;
    this.slideTarget = 110;
    this.slidePos = 1;
    this.slideSamples = 1;

    this.amp = 0;
    this.ampTarget = 0;
    this.ampCoef = 0.001;
    this.releaseInSamples = 0;
    this.env = 0;
    this.envCoef = 0.001;
    this.accentEnv = 0;
    this.accentCoef = 0.001;

    this.waveform = 'sawtooth';
    this.cutoffBase = 100;
    this.envAmount = 4000;
    this.resonance = 3;
    this.accentLevel = 1;
    this.drive = 1.35;
    this.outputDrive = 1.18;

    this.z1 = 0;
    this.z2 = 0;
    this.z3 = 0;
    this.z4 = 0;

    this.modPhase = 0;
    this.modRate = 2;
    this.modDepth = 0;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'event') {
        this.events.push(msg.event);
        this.events.sort((a, b) => a.time - b.time);
      } else if (msg.type === 'params') {
        this.applyParams(msg.params);
      } else if (msg.type === 'silence') {
        this.ampTarget = 0;
        this.releaseInSamples = 0;
        this.events.length = 0;
      }
    };
  }

  applyParams(params) {
    if (!params) return;
    if (params.waveform) this.waveform = params.waveform;
    if (Number.isFinite(params.cutoffBase)) this.cutoffBase = params.cutoffBase;
    if (Number.isFinite(params.envAmount)) this.envAmount = params.envAmount;
    if (Number.isFinite(params.decay)) this.decay = params.decay;
    if (Number.isFinite(params.resonance)) this.resonance = params.resonance;
    if (Number.isFinite(params.accentLevel)) this.accentLevel = params.accentLevel;
    if (Number.isFinite(params.modRate)) this.modRate = params.modRate;
    if (Number.isFinite(params.modDepth)) this.modDepth = params.modDepth;
  }

  handleEvent(event) {
    if (event.kind === 'off') {
      this.ampTarget = 0;
      this.ampCoef = this.timeToCoef(0.004);
      return;
    }

    this.applyParams(event);

    const accentDrive = event.accent ? 1 + 0.65 * this.accentLevel : 1;
    this.drive = 1.25 * accentDrive;
    if (event.accent) {
      this.accentEnv = Math.max(this.accentEnv, this.accentLevel);
    }
    this.accentCoef = this.timeToCoef(0.085);

    if (event.slide) {
      this.slideStart = Math.max(1, this.freq);
      this.slideTarget = Math.max(1, event.freq);
      this.slidePos = 0;
      this.slideSamples = Math.max(1, Math.floor(sampleRate * 0.075));
      const tiedLevel = event.accent ? 1.2 + 0.24 * this.accentLevel : 0.82;
      this.ampTarget = Math.max(this.amp, this.ampTarget, tiedLevel);
      this.ampCoef = this.timeToCoef(event.accent ? 0.003 : 0.012);
      this.releaseInSamples = Math.max(1, Math.floor(sampleRate * (event.stepDur || 0.12) * 0.65));
    } else {
      this.freq = Math.max(1, event.freq);
      this.slideTarget = this.freq;
      this.slidePos = 1;
      this.phase = this.phase % 1;
      this.env = 1;
      this.amp = 0;
      this.ampTarget = event.accent ? 1.18 + 0.38 * this.accentLevel : 1;
      this.ampCoef = this.timeToCoef(0.0025);
      this.releaseInSamples = Math.max(1, Math.floor(sampleRate * 0.003));
    }

    const filterDecay = event.accent ? 0.045 : Math.max(0.025, event.decay || 0.4);
    this.envCoef = this.timeToCoef(filterDecay);

    const ampDecay = Math.max(0.035, (event.stepDur || 0.12) * (event.accent ? 0.95 : 0.48));
    this.releaseCoef = this.timeToCoef(ampDecay);
  }

  timeToCoef(seconds) {
    return 1 - Math.exp(-1 / Math.max(1, seconds * sampleRate));
  }

  polyBlep(t, dt) {
    if (t < dt) {
      const x = t / dt;
      return x + x - x * x - 1;
    }
    if (t > 1 - dt) {
      const x = (t - 1) / dt;
      return x * x + x + x + 1;
    }
    return 0;
  }

  knobCutoff(value) {
    const k = Math.max(0, Math.min(1, (value - 20) / 1980));
    return 22 * Math.pow(92, k);
  }

  knobEnvAmount(value) {
    const k = Math.max(0, Math.min(1, value / 10000));
    return 80 + 9800 * k * k;
  }

  oscillator() {
    const dt = Math.min(0.5, this.freq / sampleRate);
    this.phase += this.freq / sampleRate;
    this.phase -= Math.floor(this.phase);

    if (this.waveform === 'square') {
      const width = 0.515;
      let pulse = this.phase < width ? 1 : -1;
      pulse += this.polyBlep(this.phase, dt);
      pulse -= this.polyBlep((this.phase - width + 1) % 1, dt);
      const edgeTilt = 0.18 * Math.sin(2 * Math.PI * this.phase);
      return 0.72 * (pulse + edgeTilt);
    }

    const p = this.phase;
    const saw = 2 * p - 1 - this.polyBlep(p, dt);
    const shaped = saw + 0.16 * Math.sin(2 * Math.PI * p) - 0.06 * Math.sin(4 * Math.PI * p);
    return 0.78 * shaped;
  }

  diodeLadder(input, cutoff, resonance) {
    const nyquist = sampleRate * 0.49;
    const fc = Math.min(nyquist, Math.max(18, cutoff));
    const g = 1 - Math.exp(-2 * Math.PI * fc / sampleRate);
    const res = Math.max(0, Math.min(1, resonance / 5));
    const resCurve = Math.pow(res, 1.7);
    const fb = 0.08 + resCurve * 1.82;

    const compensatedInput = input * (1 + resCurve * 0.28);
    const pre = compensatedInput - fb * this.z4;
    const x = Math.tanh(pre * this.drive);
    this.z1 += g * (x - Math.tanh(this.z1 * 0.72));
    this.z2 += g * (Math.tanh(this.z1 * 0.72) - Math.tanh(this.z2 * 0.7));
    this.z3 += g * (Math.tanh(this.z2 * 0.7) - Math.tanh(this.z3 * 0.68));
    this.z4 += g * (Math.tanh(this.z3 * 0.68) - Math.tanh(this.z4 * 0.66));

    const resonancePeak = (this.z3 - this.z4) * resCurve * 0.28;
    return Math.tanh((this.z4 + resonancePeak) * (1.45 + resCurve * 0.16));
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || left;

    for (let i = 0; i < left.length; i++) {
      const t = (currentFrame + i) / sampleRate;
      while (this.events.length && this.events[0].time <= t) {
        this.handleEvent(this.events.shift());
      }

      if (this.slidePos < 1) {
        this.slidePos = Math.min(1, this.slidePos + 1 / this.slideSamples);
        const k = this.slidePos * this.slidePos * (3 - 2 * this.slidePos);
        this.freq = this.slideStart * Math.pow(this.slideTarget / this.slideStart, k);
      }

      this.modPhase += this.modRate / sampleRate;
      this.modPhase -= Math.floor(this.modPhase);
      const mod = Math.sin(2 * Math.PI * this.modPhase) * this.modDepth;

      this.env += (0 - this.env) * this.envCoef;
      this.accentEnv += (0 - this.accentEnv) * this.accentCoef;
      if (this.releaseInSamples > 0) {
        this.releaseInSamples--;
      } else if (this.ampTarget !== 0) {
        this.ampTarget = 0;
        this.ampCoef = this.releaseCoef || this.timeToCoef(0.08);
      }
      this.amp += (this.ampTarget - this.amp) * this.ampCoef;

      const accentPush = this.accentEnv * this.accentLevel;
      const cutoffBase = this.knobCutoff(this.cutoffBase);
      const envAmount = this.knobEnvAmount(this.envAmount);
      const cutoff = cutoffBase + envAmount * this.env * (1 + 0.68 * accentPush) + 1100 * accentPush + mod;
      const q = Math.min(3.55, this.resonance * 0.78 + this.env * 0.1 + accentPush * 0.3);
      this.drive = 1.1 + accentPush * 0.75 + Math.min(0.2, this.resonance * 0.02);
      const filtered = this.diodeLadder(this.oscillator(), cutoff, q);
      const vca = this.amp * (1 + 0.08 * accentPush);
      const sample = Math.tanh(filtered * vca * this.outputDrive) * 0.86;

      left[i] = sample;
      if (right !== left) right[i] = sample;
    }

    return true;
  }
}

registerProcessor('tb303-voice', TB303VoiceProcessor);
