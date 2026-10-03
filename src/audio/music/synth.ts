import { DRUM_CRASH, DRUM_HAT, DRUM_KICK, DRUM_OPEN_HAT, DRUM_SNARE, DRUM_TICK } from './compose';
import type { InstrumentDef, Wave } from './moods';
import { midiToFreq } from './theory';

/**
 * NES-flavoured voices on plain WebAudio nodes: band-limited pulse waves (12.5/25/50 % duty) via
 * PeriodicWave, triangle bass, and noise drums (white + short-period "metallic" LFSR noise). One
 * oscillator + gain per note; nodes self-disconnect when they end.
 */

/** Peak level of a full-velocity note before channel gain. */
const VOICE_LEVEL = 0.5;

/** Fourier coefficients of a pulse wave with the given duty cycle (0..1). */
export function pulseCoefficients(duty: number, harmonics = 48): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(harmonics);
  const imag = new Float32Array(harmonics);
  for (let k = 1; k < harmonics; k++) {
    real[k] = Math.sin(2 * Math.PI * k * duty) / (Math.PI * k);
    imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (Math.PI * k);
  }
  return { real, imag };
}

/** Per-track drum bus: shared filters so each hit only allocates a source + gain. */
export interface DrumKit {
  out: AudioNode;
  snare: BiquadFilterNode;
  hat: BiquadFilterNode;
  crash: BiquadFilterNode;
}

export class ChipSynth {
  private readonly waves = new Map<Wave, PeriodicWave>();
  readonly noise: AudioBuffer;
  readonly metal: AudioBuffer;

  constructor(readonly ctx: BaseAudioContext) {
    for (const [w, duty] of [['pulse12', 0.125], ['pulse25', 0.25], ['pulse50', 0.5]] as const) {
      const { real, imag } = pulseCoefficients(duty);
      this.waves.set(w, ctx.createPeriodicWave(real, imag));
    }
    const sr = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, sr, sr);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // NES "short mode" noise: 15-bit LFSR tapping bits 0 and 6 → a 93-step metallic loop.
    this.metal = ctx.createBuffer(1, sr >> 1, sr);
    const md = this.metal.getChannelData(0);
    let reg = 1;
    const hold = Math.max(1, Math.round(sr / 24000));
    for (let i = 0; i < md.length; i++) {
      if (i % hold === 0) {
        const fb = (reg & 1) ^ ((reg >> 6) & 1);
        reg = (reg >> 1) | (fb << 14);
      }
      md[i] = reg & 1 ? 0.8 : -0.8;
    }
  }

  makeDrumKit(dest: AudioNode): DrumKit {
    const ctx = this.ctx;
    const snare = ctx.createBiquadFilter();
    snare.type = 'bandpass';
    snare.frequency.value = 1900;
    snare.Q.value = 0.8;
    const hat = ctx.createBiquadFilter();
    hat.type = 'highpass';
    hat.frequency.value = 7000;
    const crash = ctx.createBiquadFilter();
    crash.type = 'highpass';
    crash.frequency.value = 3500;
    snare.connect(dest);
    hat.connect(dest);
    crash.connect(dest);
    return { out: dest, snare, hat, crash };
  }

  private oscillator(wave: Wave): OscillatorNode {
    const osc = this.ctx.createOscillator();
    const pw = this.waves.get(wave);
    if (pw) osc.setPeriodicWave(pw);
    else osc.type = wave === 'saw' ? 'sawtooth' : wave === 'sine' ? 'sine' : 'triangle';
    return osc;
  }

  /** Schedule one tonal note at time `t` (s) lasting `dur` seconds. */
  tone(dest: AudioNode, inst: InstrumentDef, midi: number, t: number, dur: number, vel: number): void {
    const ctx = this.ctx;
    const freq = midiToFreq(midi);
    const peak = vel * VOICE_LEVEL;
    const attack = 0.004;
    const release = 0.03;
    const end = t + Math.max(dur, attack + 0.01);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (inst.decay > 0) g.gain.setTargetAtTime(0, t + attack, inst.decay * 0.35);
    else g.gain.setTargetAtTime(peak * 0.78, t + attack, 0.12);
    g.gain.setTargetAtTime(0, end, release / 3);
    g.connect(dest);
    const stopAt = end + release * 2;

    const osc = this.oscillator(inst.wave);
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(g);
    osc.start(t);
    osc.stop(stopAt);
    osc.onended = () => g.disconnect();

    if (inst.detune !== 0) {
      const o2 = this.oscillator(inst.wave);
      o2.frequency.setValueAtTime(freq, t);
      o2.detune.setValueAtTime(inst.detune, t);
      o2.connect(g);
      o2.start(t);
      o2.stop(stopAt);
    }
    if (inst.vibrato > 0 && dur > 0.3) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(inst.vibrato, t + Math.min(0.35, dur * 0.5));
      lfo.connect(depth);
      depth.connect(osc.detune);
      lfo.start(t);
      lfo.stop(stopAt);
      lfo.onended = () => depth.disconnect();
    }
  }

  /** Schedule one drum hit. `len` = written length in seconds (open hat / crash ring). */
  drum(kit: DrumKit, kind: number, t: number, vel: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    switch (kind) {
      case DRUM_KICK: {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        g.gain.setValueAtTime(vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(kit.out);
        o.start(t);
        o.stop(t + 0.24);
        o.onended = () => g.disconnect();
        return;
      }
      case DRUM_TICK: {
        const o = ctx.createOscillator();
        o.type = 'sine';
        const f = 1300 + vel * 1600;
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.65, t + 0.04);
        g.gain.setValueAtTime(vel * 0.6, t);
        g.gain.setTargetAtTime(0, t, 0.012);
        o.connect(g).connect(kit.out);
        o.start(t);
        o.stop(t + 0.08);
        o.onended = () => g.disconnect();
        return;
      }
      case DRUM_SNARE: {
        this.noiseHit(this.noise, g, kit.snare, t, vel * 0.9, 0.045, 0.25);
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(210, t);
        o.frequency.exponentialRampToValueAtTime(130, t + 0.06);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(vel * 0.45, t);
        tg.gain.setTargetAtTime(0, t, 0.02);
        o.connect(tg).connect(kit.out);
        o.start(t);
        o.stop(t + 0.12);
        o.onended = () => tg.disconnect();
        return;
      }
      case DRUM_HAT:
        this.noiseHit(this.metal, g, kit.hat, t, vel * 0.5, 0.012, 0.08);
        return;
      case DRUM_OPEN_HAT:
        this.noiseHit(this.metal, g, kit.hat, t, vel * 0.45, 0.06, 0.3);
        return;
      case DRUM_CRASH:
        this.noiseHit(this.noise, g, kit.crash, t, vel * 0.45, 0.35, 1.6);
        return;
      default:
        return;
    }
  }

  private noiseHit(buf: AudioBuffer, g: GainNode, dest: AudioNode, t: number, level: number, tc: number, length: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    g.gain.setValueAtTime(level, t);
    g.gain.setTargetAtTime(0, t, tc);
    src.connect(g).connect(dest);
    const maxOffset = Math.max(0, buf.duration - length);
    src.start(t, Math.random() * maxOffset);
    src.stop(t + length);
    src.onended = () => g.disconnect();
  }
}
