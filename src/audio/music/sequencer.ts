import { CH_DRUMS, CH_HARMONY, CH_LEAD, composeTrack, type Composition, type MusicNote } from './compose';
import { resolveTrackId } from './moods';
import { ChipSynth, type DrumKit } from './synth';

/**
 * Lookahead step sequencer on the AudioContext clock ("A Tale of Two Clocks"): a coarse JS timer calls
 * `tick()`, which schedules every note falling inside the next LOOKAHEAD seconds at sample-accurate
 * times. Positions are absolute steps from the track start, so loops are seamless and tempo never drifts.
 */
export const LOOKAHEAD = 0.25;
/** Events this late (s) are skipped instead of being crammed in (after a stall or tab suspend). */
const LATE_SKIP = 0.03;

/** Absolute step of a note on loop pass `pass` (pass 0 includes the intro). */
export function absoluteStep(comp: Composition, step: number, pass: number): number {
  if (pass === 0) return step;
  const body = comp.lengthSteps - comp.loopStart;
  return comp.lengthSteps + (pass - 1) * body + (step - comp.loopStart);
}

/** Start time (s, relative to the track's t0) of a note on loop pass `pass`, swing included. */
export function noteTime(comp: Composition, n: MusicNote, pass: number): number {
  const swing = n.step % 2 === 1 ? comp.swing * comp.stepDur : 0;
  return absoluteStep(comp, n.step, pass) * comp.stepDur + swing;
}

export class TrackPlayer {
  readonly out: GainNode;
  private readonly chans: GainNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly kit: DrumKit;
  private t0 = 0;
  private pass = 0;
  private idx = 0;
  private stopAt = Infinity;
  /** True once the player scheduled its last note (non-looping) or was stopped. */
  done = false;
  stopping = false;

  constructor(
    ctx: BaseAudioContext,
    private readonly synth: ChipSynth,
    readonly comp: Composition,
    dest: AudioNode,
  ) {
    const m = comp.mood;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    // Echo: delay with feedback, fed by per-channel sends.
    const delay = ctx.createDelay(2);
    delay.delayTime.value = Math.min(1.9, m.echo.steps * comp.stepDur);
    const fb = ctx.createGain();
    fb.gain.value = m.echo.feedback;
    const wet = ctx.createGain();
    wet.gain.value = m.echo.wet;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(this.out);
    this.nodes.push(delay, fb, wet);
    const insts = [m.lead, m.harmony, m.bass];
    const pans = [-0.12, 0.22, 0];
    for (let c = 0; c < 4; c++) {
      const g = ctx.createGain();
      g.gain.value = c < 3 ? insts[c]!.gain : m.drums.gain;
      let tail: AudioNode = g;
      const pan = c < 3 ? pans[c]! : 0;
      if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        tail = p;
        this.nodes.push(p);
      }
      tail.connect(this.out);
      const echo = c < 3 ? insts[c]!.echo : 0;
      if (echo > 0) {
        const send = ctx.createGain();
        send.gain.value = echo;
        g.connect(send).connect(delay);
        this.nodes.push(send);
      }
      this.chans.push(g);
      this.nodes.push(g);
    }
    this.kit = synth.makeDrumKit(this.chans[CH_DRUMS]!);
    this.nodes.push(this.kit.snare, this.kit.hat, this.kit.crash);
  }

  get id(): string {
    return this.comp.id;
  }

  /** Begin playback at context time `at`, fading in over `fadeIn` seconds. */
  start(at: number, fadeIn: number): void {
    this.t0 = at;
    const g = this.out.gain;
    g.setValueAtTime(0, at);
    if (fadeIn > 0.001) g.linearRampToValueAtTime(1, at + fadeIn);
    else g.setValueAtTime(1, at);
  }

  /** Fade out from `at` over `fade` seconds; nothing is scheduled past the fade. */
  stop(at: number, fade: number): void {
    if (this.stopping) return;
    this.stopping = true;
    const g = this.out.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(0, at + Math.max(0.01, fade));
    this.stopAt = at + Math.max(0.01, fade);
  }

  /** Time after which this player is silent and can be disposed. */
  get endTime(): number {
    if (this.stopAt !== Infinity) return this.stopAt + 0.1;
    if (!this.comp.loop && this.done) return this.t0 + this.comp.lengthSteps * this.comp.stepDur + 2;
    return Infinity;
  }

  /** Schedule all notes starting before `until`. */
  schedule(now: number, until: number): void {
    const comp = this.comp;
    const notes = comp.notes;
    let guard = 0;
    while (!this.done && guard++ < 4096) {
      if (this.idx >= notes.length) {
        if (!comp.loop || comp.loopStartIndex >= notes.length) {
          this.done = true;
          break;
        }
        this.pass++;
        this.idx = comp.loopStartIndex;
        continue;
      }
      const n = notes[this.idx]!;
      const time = this.t0 + noteTime(comp, n, this.pass);
      if (time >= until) break;
      if (time >= this.stopAt) {
        this.done = true;
        break;
      }
      if (time >= now - LATE_SKIP) this.play(n, Math.max(time, now));
      this.idx++;
    }
  }

  private play(n: MusicNote, t: number): void {
    const comp = this.comp;
    if (n.ch === CH_DRUMS) {
      this.synth.drum(this.kit, n.note, t, n.vel);
      return;
    }
    const m = comp.mood;
    const inst = n.ch === CH_LEAD ? m.lead : n.ch === CH_HARMONY ? m.harmony : m.bass;
    const dur = n.len * comp.stepDur * inst.legato;
    this.synth.tone(this.chans[n.ch]!, inst, n.note, t, dur, n.vel);
  }

  dispose(): void {
    try {
      this.out.disconnect();
      for (const node of this.nodes) node.disconnect();
    } catch {
      // already disconnected
    }
  }
}

export interface MusicOptions {
  /** Seed for the generative compositions (default 1: every track keeps a recognisable identity). */
  seed?: number;
}

/** Owns the playing track(s): crossfades on change, ticks the lookahead scheduler, cleans up. */
export class MusicEngine {
  private readonly synth: ChipSynth;
  private readonly players: TrackPlayer[] = [];
  private current: TrackPlayer | null = null;
  seed: number;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    opts: MusicOptions = {},
  ) {
    this.synth = new ChipSynth(ctx);
    this.seed = opts.seed ?? 1;
  }

  /** Id of the track currently playing (or fading in), null when silent. */
  get currentId(): string | null {
    return this.current && !this.current.stopping ? this.current.id : null;
  }

  get playerCount(): number {
    return this.players.length;
  }

  /**
   * Switch to `trackId` with a crossfade: the old track fades over `fade` s while the new one enters
   * after 40 % of it. Urgent tracks (boss/invasion) cut in fast. '' stops the music.
   */
  play(trackId: string, fade?: number): void {
    const id = resolveTrackId(trackId);
    if (id === '') {
      this.stop(fade ?? 1);
      return;
    }
    if (this.current && !this.current.stopping && this.current.id === id) return;
    const urgent = id === 'boss' || id === 'invasion';
    const f = fade ?? (urgent ? 0.3 : 1.2);
    const now = this.ctx.currentTime;
    const hadOld = this.current !== null && !this.current.stopping;
    if (this.current) this.current.stop(now, f);
    const p = new TrackPlayer(this.ctx, this.synth, composeTrack(id, this.seed), this.dest);
    const startAt = now + 0.05 + (hadOld && !urgent ? f * 0.4 : 0);
    p.start(startAt, hadOld && !urgent ? f * 0.6 : urgent ? 0.02 : 0.4);
    this.players.push(p);
    this.current = p;
    this.tick();
  }

  stop(fade = 1): void {
    if (!this.current) return;
    this.current.stop(this.ctx.currentTime, fade);
    this.current = null;
  }

  /** Schedule ahead and dispose finished players. Call every frame and/or from a timer. */
  tick(): void {
    const now = this.ctx.currentTime;
    const until = now + LOOKAHEAD;
    for (let i = this.players.length - 1; i >= 0; i--) {
      const p = this.players[i]!;
      p.schedule(now, until);
      if (now > p.endTime) {
        p.dispose();
        this.players.splice(i, 1);
        if (this.current === p) this.current = null;
      }
    }
  }

  dispose(): void {
    for (const p of this.players) p.dispose();
    this.players.length = 0;
    this.current = null;
  }
}
