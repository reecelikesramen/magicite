import { hashSeed, Rng } from '../../engine/rng';
import { moodFor, type MoodDef } from './moods';
import { degreeToMidi, MODES, nearestChordTone } from './theory';

/**
 * Seeded generative chiptune composer. Pure and deterministic: (track id, seed) → the same note list
 * every time, on every machine. The sequencer (sequencer.ts) only plays what this returns.
 *
 * Structure: optional intro (sting/fanfare, played once) + a body of sections (mood.form, e.g. AABA) of
 * 4 bars in 4/4, 16 steps (16th notes) per bar. Sections with the same letter share chords and melody
 * (the 2nd occurrence varies its cadence), which is what makes a generated loop feel like a *tune*.
 */

export const STEPS_PER_BAR = 16;

export const CH_LEAD = 0;
export const CH_HARMONY = 1;
export const CH_BASS = 2;
export const CH_DRUMS = 3;
export type Channel = 0 | 1 | 2 | 3;

export const DRUM_KICK = 0;
export const DRUM_SNARE = 1;
export const DRUM_HAT = 2;
export const DRUM_TICK = 3;
export const DRUM_CRASH = 4;
export const DRUM_OPEN_HAT = 5;

export interface MusicNote {
  /** 16th-note step from the start of the composition. */
  step: number;
  ch: Channel;
  /** MIDI note for tonal channels; DRUM_* id for CH_DRUMS. */
  note: number;
  /** Written length in steps (sounding length = len × instrument legato). */
  len: number;
  /** Velocity 0..1. */
  vel: number;
}

export interface Composition {
  id: string;
  seed: number;
  mood: MoodDef;
  bpm: number;
  swing: number;
  /** Seconds per step (16th note). */
  stepDur: number;
  lengthSteps: number;
  /** Step the loop jumps back to (= intro length). */
  loopStart: number;
  loop: boolean;
  /** Every event, sorted by step, then channel, then note. */
  notes: MusicNote[];
  /** Index of the first note with step >= loopStart. */
  loopStartIndex: number;
  /** Chord root (scale degree) at the start of every bar, intro included. */
  chords: number[];
}

// Rhythm cells: note lengths (in 16ths) filling one bar.
const SPARSE: number[][] = [[16], [8, 8], [12, 4], [8, 4, 4], [4, 4, 8], [6, 2, 8], [4, 12]];
const MEDIUM: number[][] = [[4, 4, 4, 4], [6, 2, 4, 4], [4, 2, 2, 8], [2, 2, 4, 8], [8, 2, 2, 4], [3, 3, 2, 8], [4, 4, 2, 2, 4], [6, 6, 4]];
const BUSY: number[][] = [[2, 2, 2, 2, 4, 4], [2, 2, 4, 2, 2, 4], [4, 2, 2, 2, 2, 4], [2, 2, 2, 2, 2, 2, 4], [3, 3, 2, 2, 2, 4], [2, 4, 2, 4, 4], [1, 1, 2, 4, 2, 2, 4]];
const CADENCE: number[][] = [[16], [8, 8], [4, 12], [4, 4, 8], [2, 2, 12]];

const ARP_PATTERNS: number[][] = [[0, 1, 2, 3], [0, 1, 2, 3, 2, 1], [0, 2, 1, 2], [3, 2, 1, 0], [0, 1, 2, 1]];
/** Melodic interval weights (in scale steps) — mostly steps, a few skips, rare leaps. */
const INTERVALS = [0, 1, 2, 3, 4, 5];
const INTERVAL_W = [0.12, 0.5, 0.24, 0.08, 0.04, 0.02];

interface PhraseNote {
  /** Step within the section. */
  at: number;
  len: number;
  degree: number;
  rest: boolean;
}

const cache = new Map<string, Composition>();

/** Compose (memoised) the track `trackId` for `seed`. Same inputs → identical output. */
export function composeTrack(trackId: string, seed = 1): Composition {
  const mood = moodFor(trackId);
  const key = `${mood.id}:${seed}`;
  let c = cache.get(key);
  if (!c) {
    c = compose(mood, seed);
    cache.set(key, c);
  }
  return c;
}

/** Uncached composition (tests use this to prove determinism without the memo). */
export function compose(mood: MoodDef, seed: number): Composition {
  const rng = new Rng(hashSeed(`music:${mood.id}:${seed}`));
  const scale = MODES[mood.mode];
  const N = scale.length;
  const bps = mood.barsPerSection;
  const secSteps = bps * STEPS_PER_BAR;
  const introBars = mood.intro === 'sting' ? 1 : mood.intro === 'fanfare' ? 2 : 0;
  const bodyStart = introBars * STEPS_PER_BAR;
  const letters = mood.form.split('');
  const lengthSteps = bodyStart + letters.length * secSteps;
  const notes: MusicNote[] = [];
  const chords: number[] = [];
  for (let b = 0; b < introBars; b++) chords.push(introBars === 2 && b === 1 ? 4 : 0);

  const leadRoot = mood.root + 12 * mood.lead.octave;
  const harmRoot = mood.root + 12 * mood.harmony.octave;
  const bassRoot = mood.root + 12 * mood.bass.octave;

  // Progressions, arp patterns and melodies per section letter.
  const progs = new Map<string, number[]>();
  const arps = new Map<string, number[]>();
  const phrases = new Map<string, PhraseNote[]>();
  const seen = new Map<string, number>();
  const usedB: number[][] = [];
  for (const L of letters) {
    if (progs.has(L)) continue;
    let prog: number[];
    if (L === 'A') prog = rng.pick(mood.progA);
    else {
      const fresh = mood.progB.filter((p) => !usedB.includes(p));
      prog = rng.pick(fresh.length > 0 ? fresh : mood.progB);
      usedB.push(prog);
    }
    progs.set(L, prog);
    arps.set(L, rng.pick(ARP_PATTERNS));
  }
  for (const L of letters) {
    if (!phrases.has(L)) phrases.set(L, makePhrase(rng, mood, progs.get(L)!, bps, N));
  }

  if (mood.intro !== 'none') writeIntro(notes, mood, scale, leadRoot, harmRoot, bassRoot);

  for (let si = 0; si < letters.length; si++) {
    const L = letters[si]!;
    const prog = progs.get(L)!;
    const start = bodyStart + si * secSteps;
    const chordAt = (s: number): number => prog[Math.floor((s * prog.length) / secSteps)]!;
    for (let b = 0; b < bps; b++) chords.push(chordAt(b * STEPS_PER_BAR));
    const occurrence = seen.get(L) ?? 0;
    seen.set(L, occurrence + 1);

    // Lead: the letter's phrase; odd repeats get a fresh cadence bar (variation keeps loops alive).
    let phrase = phrases.get(L)!;
    if (occurrence % 2 === 1) phrase = varyCadence(rng, phrase, chordAt, bps, N);
    for (const pn of phrase) {
      if (pn.rest) continue;
      const strong = pn.at % STEPS_PER_BAR === 0;
      const vel = clamp01(0.78 + (strong ? 0.14 : 0) - (pn.at % 2 === 1 ? 0.12 : 0));
      notes.push({ step: start + pn.at, ch: CH_LEAD, note: degreeToMidi(leadRoot, scale, pn.degree), len: pn.len, vel });
    }

    writeHarmony(notes, mood, scale, harmRoot, start, secSteps, chordAt, arps.get(L)!, N);
    writeBass(notes, rng, mood, scale, bassRoot, start, secSteps, chordAt);
    const drumsOn = mood.drums.style !== 'none' && (mood.drums.sections === '' || mood.drums.sections.includes(L));
    if (drumsOn) {
      const lastSection = si === letters.length - 1;
      for (let b = 0; b < bps; b++) {
        const fill = mood.drums.fills && b === bps - 1 && (!lastSection || mood.loop);
        writeDrumBar(notes, rng, mood, start + b * STEPS_PER_BAR, b, fill);
      }
      if (mood.drums.crash) notes.push({ step: start, ch: CH_DRUMS, note: DRUM_CRASH, len: 8, vel: 0.55 });
    }
  }

  for (const n of notes) if (n.step + n.len > lengthSteps) n.len = Math.max(1, lengthSteps - n.step);
  notes.sort((a, b) => a.step - b.step || a.ch - b.ch || a.note - b.note);
  let loopStartIndex = notes.findIndex((n) => n.step >= bodyStart);
  if (loopStartIndex < 0) loopStartIndex = notes.length;
  const stepDur = 60 / mood.bpm / 4;
  return {
    id: mood.id,
    seed,
    mood,
    bpm: mood.bpm,
    swing: mood.swing,
    stepDur,
    lengthSteps,
    loopStart: bodyStart,
    loop: mood.loop,
    notes,
    loopStartIndex,
    chords,
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function cellFor(rng: Rng, density: number): number[] {
  const r = rng.next();
  const busyP = Math.max(0, density - 0.4) * 1.2;
  const sparseP = Math.max(0, 0.55 - density) * 1.2;
  if (r < busyP) return rng.pick(BUSY);
  if (r < busyP + sparseP) return rng.pick(SPARSE);
  return rng.pick(MEDIUM);
}

function interval(rng: Rng): number {
  let r = rng.next();
  for (let i = 0; i < INTERVALS.length; i++) {
    r -= INTERVAL_W[i]!;
    if (r < 0) return INTERVALS[i]!;
  }
  return 1;
}

const LO = -2;
const HI = 9;

/** Next melody degree from `d`, preferring to keep direction `dir` (mutated via return tuple). */
function walk(rng: Rng, d: number, dir: number): [number, number] {
  const iv = interval(rng);
  let nd = dir;
  if (rng.chance(0.35)) nd = -nd;
  let next = d + iv * nd;
  if (next > HI || next < LO) {
    nd = -nd;
    next = d + iv * nd;
  }
  // After a leap, turn back (classic melodic gap-fill).
  if (iv >= 3) nd = -nd;
  return [Math.max(LO, Math.min(HI, next)), nd];
}

function makePhrase(rng: Rng, mood: MoodDef, prog: number[], bps: number, N: number): PhraseNote[] {
  const secSteps = bps * STEPS_PER_BAR;
  const chordAt = (s: number): number => prog[Math.floor((s * prog.length) / secSteps)]!;
  const cells: number[][] = [];
  const r1 = cellFor(rng, mood.lead.density);
  const r2 = cellFor(rng, mood.lead.density);
  for (let b = 0; b < bps; b++) {
    if (b === bps - 1) cells.push(rng.pick(CADENCE));
    else if (b % 2 === 0) cells.push(r1);
    else cells.push(b === 1 ? r2 : cellFor(rng, mood.lead.density));
  }
  const out: PhraseNote[] = [];
  let d = nearestChordTone(rng.pick([2, 4, 0, 7]), chordAt(0), N);
  let dir: number = rng.sign();
  // Contour of bar 0, replayed as a sequence on bar 2 (if the rhythm matches).
  const bar0: number[] = [];
  for (let b = 0; b < bps; b++) {
    const cell = cells[b]!;
    let at = b * STEPS_PER_BAR;
    const lastBar = b === bps - 1;
    for (let i = 0; i < cell.length; i++) {
      const len = cell[i]!;
      const chord = chordAt(at);
      if (b === 2 && cells[2] === cells[0] && bar0.length === cell.length) {
        // Sequence: same intervals as bar 0, re-anchored on this bar's chord.
        d = i === 0 ? nearestChordTone(bar0[0]! + (chord - chordAt(0)), chord, N) : d + (bar0[i]! - bar0[i - 1]!);
        d = Math.max(LO, Math.min(HI, d));
      } else if (!(b === 0 && i === 0)) {
        [d, dir] = walk(rng, d, dir);
      }
      const strong = at % 8 === 0 || len >= 6;
      if (strong) d = nearestChordTone(d, chord, N);
      if (lastBar && i === cell.length - 1) {
        // Cadence: land on the chord root closest to the line (tonic when the chord is I).
        d = nearestRoot(d, chord, N);
      }
      if (b === 0) bar0.push(d);
      const rest = i > 0 && !lastBar && rng.chance(mood.lead.rest);
      out.push({ at, len, degree: d, rest });
      at += len;
    }
  }
  return out;
}

function nearestRoot(d: number, chord: number, N: number): number {
  const k = Math.round((d - chord) / N);
  const r = chord + k * N;
  return r > HI ? r - N : r < LO ? r + N : r;
}

/** Same phrase with a newly generated final bar (different cadence rhythm and approach). */
function varyCadence(rng: Rng, phrase: PhraseNote[], chordAt: (s: number) => number, bps: number, N: number): PhraseNote[] {
  const lastBarStart = (bps - 1) * STEPS_PER_BAR;
  const out = phrase.filter((p) => p.at < lastBarStart);
  let d = out.length > 0 ? out[out.length - 1]!.degree : 0;
  let dir: number = rng.sign();
  const cell = rng.pick(CADENCE.length > 1 ? CADENCE.slice(1) : CADENCE);
  let at = lastBarStart;
  for (let i = 0; i < cell.length; i++) {
    const len = cell[i]!;
    const chord = chordAt(at);
    [d, dir] = walk(rng, d, dir);
    if (at % 8 === 0 || len >= 6) d = nearestChordTone(d, chord, N);
    if (i === cell.length - 1) d = nearestRoot(d, chord, N);
    out.push({ at, len, degree: d, rest: false });
    at += len;
  }
  return out;
}

function chordTone(root: number, scale: readonly number[], chord: number, idx: number, N: number): number {
  // idx 0..2 = triad, 3 = root an octave up.
  const off = idx === 3 ? N : idx * 2;
  return degreeToMidi(root, scale, chord + off);
}

function writeHarmony(
  notes: MusicNote[],
  mood: MoodDef,
  scale: readonly number[],
  root: number,
  start: number,
  secSteps: number,
  chordAt: (s: number) => number,
  arp: number[],
  N: number,
): void {
  const style = mood.harmony.style;
  if (style === 'none') return;
  if (style === 'pad') {
    let s = 0;
    while (s < secSteps) {
      const chord = chordAt(s);
      let e = s + 1;
      while (e < secSteps && chordAt(e) === chord) e++;
      for (let i = 0; i < 3; i++) notes.push({ step: start + s, ch: CH_HARMONY, note: chordTone(root, scale, chord, i, N), len: e - s, vel: 0.5 });
      s = e;
    }
    return;
  }
  for (let s = 0; s < secSteps; s++) {
    const chord = chordAt(s);
    const beat = s % 4 === 0;
    if (style === 'arp16') {
      notes.push({ step: start + s, ch: CH_HARMONY, note: chordTone(root, scale, chord, arp[s % arp.length]!, N), len: 1, vel: beat ? 0.7 : 0.55 });
    } else if (style === 'arp8') {
      if (s % 2 === 0) notes.push({ step: start + s, ch: CH_HARMONY, note: chordTone(root, scale, chord, arp[(s >> 1) % arp.length]!, N), len: 2, vel: beat ? 0.7 : 0.55 });
    } else if (style === 'offbeat') {
      if (s % 4 === 2) {
        notes.push({ step: start + s, ch: CH_HARMONY, note: chordTone(root, scale, chord, 1, N), len: 2, vel: 0.6 });
        notes.push({ step: start + s, ch: CH_HARMONY, note: chordTone(root, scale, chord, 2, N), len: 2, vel: 0.55 });
      }
    } else if (style === 'tremolo') {
      notes.push({ step: start + s, ch: CH_HARMONY, note: chordTone(root, scale, chord, 1 + (s & 1), N), len: 1, vel: 0.45 });
    }
  }
}

function writeBass(
  notes: MusicNote[],
  rng: Rng,
  mood: MoodDef,
  scale: readonly number[],
  root: number,
  start: number,
  secSteps: number,
  chordAt: (s: number) => number,
): void {
  const style = mood.bass.style;
  const at = (deg: number): number => degreeToMidi(root, scale, deg);
  for (let bar = 0; bar < secSteps / STEPS_PER_BAR; bar++) {
    const b0 = bar * STEPS_PER_BAR;
    const c = chordAt(b0);
    const cMid = chordAt(b0 + 8);
    const next = chordAt((b0 + STEPS_PER_BAR) % secSteps);
    const push = (s: number, note: number, len: number, vel: number): void => {
      notes.push({ step: start + b0 + s, ch: CH_BASS, note, len, vel });
    };
    switch (style) {
      case 'root':
        push(0, at(c), 8, 0.85);
        push(8, at(cMid), 8, 0.75);
        break;
      case 'walking': {
        const second = rng.chance(0.5) ? c + 2 : c + 4;
        const third = rng.chance(0.5) ? c + 4 : c + 5;
        const approach = rng.chance(0.5) ? next - 1 : next + 1;
        push(0, at(c), 4, 0.85);
        push(4, at(second), 4, 0.7);
        push(8, at(cMid === c ? third : cMid), 4, 0.75);
        push(12, at(approach), 4, 0.7);
        break;
      }
      case 'eighths':
        for (let s = 0; s < 16; s += 2) {
          const ch = s < 8 ? c : cMid;
          const deg = s === 14 && rng.chance(0.5) ? ch + 4 : ch;
          push(s, at(deg) + (s === 6 && rng.chance(0.4) ? 12 : 0), 2, s % 4 === 0 ? 0.85 : 0.65);
        }
        break;
      case 'pulse':
        push(0, at(c), 6, 0.85);
        push(6, at(c), 2, 0.6);
        push(8, at(cMid), 6, 0.8);
        push(14, at(cMid + 4), 2, 0.6);
        break;
      case 'drone':
        if (cMid === c) push(0, at(c), 16, 0.8);
        else {
          push(0, at(c), 8, 0.8);
          push(8, at(cMid), 8, 0.8);
        }
        break;
      case 'octaves':
        for (let s = 0; s < 16; s += 2) {
          const ch = s < 8 ? c : cMid;
          push(s, at(ch) + ((s >> 1) % 2 === 1 ? 12 : 0), 2, s % 4 === 0 ? 0.85 : 0.7);
        }
        break;
    }
  }
}

function writeDrumBar(notes: MusicNote[], rng: Rng, mood: MoodDef, barStart: number, barIdx: number, fill: boolean): void {
  const dens = mood.drums.density;
  const hit = (s: number, drum: number, vel: number, len = 1): void => {
    if (fill && s >= 8) return;
    notes.push({ step: barStart + s, ch: CH_DRUMS, note: drum, len, vel });
  };
  switch (mood.drums.style) {
    case 'basic':
      hit(0, DRUM_KICK, 0.9);
      hit(8, DRUM_KICK, 0.8);
      if (dens > 0.6 && barIdx % 2 === 1) hit(10, DRUM_KICK, 0.6);
      hit(4, DRUM_SNARE, 0.8);
      hit(12, DRUM_SNARE, 0.8);
      for (let s = 0; s < 16; s += 2) if (rng.chance(0.5 + dens / 2)) hit(s, DRUM_HAT, s % 4 === 0 ? 0.55 : 0.4);
      for (let s = 1; s < 16; s += 2) if (rng.chance(dens * 0.3)) hit(s, DRUM_HAT, 0.25);
      break;
    case 'four':
      for (let s = 0; s < 16; s += 4) hit(s, DRUM_KICK, 0.85);
      hit(4, DRUM_SNARE, 0.8);
      hit(12, DRUM_SNARE, 0.8);
      for (let s = 2; s < 16; s += 4) hit(s, DRUM_OPEN_HAT, 0.45, 2);
      break;
    case 'half':
      hit(0, DRUM_KICK, 0.8);
      hit(8, DRUM_SNARE, 0.7);
      for (let s = 0; s < 16; s += 4) if (rng.chance(dens + 0.3)) hit(s, DRUM_HAT, 0.4);
      if (rng.chance(dens * 0.6)) hit(14, DRUM_KICK, 0.5);
      break;
    case 'double':
      hit(0, DRUM_KICK, 0.95);
      hit(6, DRUM_KICK, 0.75);
      hit(8, DRUM_KICK, 0.85);
      hit(14, DRUM_KICK, 0.7);
      if (dens > 0.7 && barIdx % 2 === 1) {
        hit(3, DRUM_KICK, 0.6);
        hit(11, DRUM_KICK, 0.6);
      }
      hit(4, DRUM_SNARE, 0.85);
      hit(12, DRUM_SNARE, 0.85);
      for (let s = 0; s < 16; s++) if (s % 2 === 0 || rng.chance(dens * 0.7)) hit(s, DRUM_HAT, s % 2 === 0 ? 0.45 : 0.28);
      break;
    case 'heartbeat':
      hit(0, DRUM_KICK, 0.9);
      hit(3, DRUM_KICK, 0.6);
      hit(8, DRUM_KICK, 0.85);
      hit(11, DRUM_KICK, 0.55);
      if (rng.chance(dens)) hit(rng.pick([6, 14]), DRUM_TICK, 0.35);
      break;
    case 'sparse':
      if (barIdx % 2 === 0) hit(0, DRUM_KICK, 0.6);
      for (let k = 0; k < 2; k++) if (rng.chance(dens)) hit(rng.int(1, 15), DRUM_TICK, 0.3 + rng.next() * 0.3);
      break;
    case 'shaker':
      if (dens > 0.4 && barIdx % 2 === 0) hit(0, DRUM_KICK, 0.5);
      for (let s = 0; s < 16; s += 2) hit(s, DRUM_HAT, s % 4 === 2 ? 0.45 : 0.3);
      for (let s = 1; s < 16; s += 2) if (rng.chance(dens * 0.5)) hit(s, DRUM_HAT, 0.2);
      break;
    case 'none':
      break;
  }
  if (fill) {
    const roll = [8, 10, 12, 13, 14, 15];
    for (let i = 0; i < roll.length; i++) notes.push({ step: barStart + roll[i]!, ch: CH_DRUMS, note: DRUM_SNARE, len: 1, vel: 0.5 + (0.4 * i) / (roll.length - 1) });
    notes.push({ step: barStart + 8, ch: CH_DRUMS, note: DRUM_KICK, len: 1, vel: 0.8 });
  }
}

function writeIntro(notes: MusicNote[], mood: MoodDef, scale: readonly number[], leadRoot: number, harmRoot: number, bassRoot: number): void {
  const L = (deg: number): number => degreeToMidi(leadRoot, scale, deg);
  const H = (deg: number): number => degreeToMidi(harmRoot, scale, deg);
  const B = (deg: number): number => degreeToMidi(bassRoot, scale, deg);
  const push = (step: number, ch: Channel, note: number, len: number, vel: number): void => {
    notes.push({ step, ch, note, len, vel });
  };
  if (mood.intro === 'sting') {
    // Three stabs (the last one a semitone-ish neighbour), then a held tonic with a snare roll.
    const stabs: [number, number][] = [[0, 0], [3, 0], [6, 1]];
    for (const [s, deg] of stabs) {
      push(s, CH_LEAD, L(deg + 7), 2, 0.95);
      push(s, CH_HARMONY, H(deg + 4), 2, 0.8);
      push(s, CH_BASS, B(deg), 2, 0.95);
      push(s, CH_DRUMS, DRUM_KICK, 1, 0.95);
    }
    push(0, CH_DRUMS, DRUM_CRASH, 8, 0.7);
    push(8, CH_LEAD, L(7), 8, 0.9);
    push(8, CH_HARMONY, H(4), 8, 0.7);
    push(8, CH_BASS, B(0), 8, 0.9);
    for (const [i, s] of [8, 10, 12, 13, 14, 15].entries()) push(s, CH_DRUMS, DRUM_SNARE, 1, 0.5 + i * 0.08);
  } else if (mood.intro === 'fanfare') {
    // Rising tonic arpeggio, dominant, resolve.
    const line: [number, number, number][] = [[0, 0, 3], [3, 2, 3], [6, 4, 2], [8, 7, 8], [16, 4, 6], [22, 6, 2], [24, 7, 8]];
    for (const [s, deg, len] of line) push(s, CH_LEAD, L(deg), len, 0.9);
    for (const i of [0, 2, 4]) {
      push(0, CH_HARMONY, H(i), 16, 0.5);
      push(16, CH_HARMONY, H(4 + i), 8, 0.5);
      push(24, CH_HARMONY, H(i), 8, 0.5);
    }
    push(0, CH_BASS, B(0), 16, 0.85);
    push(16, CH_BASS, B(4), 8, 0.85);
    push(24, CH_BASS, B(0), 8, 0.85);
    push(0, CH_DRUMS, DRUM_CRASH, 8, 0.6);
    push(0, CH_DRUMS, DRUM_KICK, 1, 0.9);
    push(8, CH_DRUMS, DRUM_KICK, 1, 0.8);
    push(16, CH_DRUMS, DRUM_KICK, 1, 0.9);
    for (const [i, s] of [26, 28, 29, 30, 31].entries()) push(s, CH_DRUMS, DRUM_SNARE, 1, 0.5 + i * 0.1);
  }
}
