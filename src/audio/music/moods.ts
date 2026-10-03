import { hashSeed } from '../../engine/rng';
import type { ModeId } from './theory';

/**
 * Mood presets: the knobs the generative composer turns per track (art-direction §13.1). Track ids are
 * our own; biome ids map onto them via TRACK_ALIASES (BiomeDef.music may use either).
 */

/** Oscillator flavours of the chip synth. Pulses are band-limited PeriodicWaves (12.5/25/50 % duty). */
export type Wave = 'pulse12' | 'pulse25' | 'pulse50' | 'triangle' | 'sine' | 'saw';

export interface InstrumentDef {
  wave: Wave;
  /** Channel level 0..1. */
  gain: number;
  /** Fraction of the written length that sounds (0.3 staccato … 1 legato). */
  legato: number;
  /** Exponential decay time (s) for plucked/bell voices; 0 = sustained organ-like envelope. */
  decay: number;
  /** Vibrato depth in cents on long notes (0 = none). */
  vibrato: number;
  /** Second oscillator detuned by this many cents (0 = single osc). */
  detune: number;
  /** Send into the track's echo (0..1). */
  echo: number;
}

export type BassStyle = 'root' | 'walking' | 'eighths' | 'pulse' | 'drone' | 'octaves';
export type HarmonyStyle = 'arp16' | 'arp8' | 'offbeat' | 'pad' | 'tremolo' | 'none';
export type DrumStyle = 'basic' | 'four' | 'half' | 'double' | 'heartbeat' | 'sparse' | 'shaker' | 'none';

export interface MoodDef {
  id: string;
  bpm: number;
  /** MIDI note of the tonic for the lead's home octave (e.g. 62 = D4). */
  root: number;
  mode: ModeId;
  /** Delay of odd 16ths as a fraction of a 16th (0 = straight, 0.33 ≈ triplet swing). */
  swing: number;
  /** Section letters, e.g. 'AABA'. Same letter → same material (repetition makes themes stick). */
  form: string;
  barsPerSection: number;
  /** Candidate chord progressions (scale degrees, 0-based) for 'A' sections and for other letters. */
  progA: number[][];
  progB: number[][];
  lead: InstrumentDef & { octave: number; density: number; rest: number };
  harmony: InstrumentDef & { style: HarmonyStyle; octave: number };
  bass: InstrumentDef & { style: BassStyle; octave: number };
  drums: { style: DrumStyle; density: number; gain: number; fills: boolean; crash: boolean; sections: string };
  /** Echo: time in 16th steps, feedback 0..0.8, wet level. */
  echo: { steps: number; feedback: number; wet: number };
  intro: 'none' | 'sting' | 'fanfare';
  loop: boolean;
}

const I = (wave: Wave, gain: number, o: Partial<InstrumentDef> = {}): InstrumentDef => ({
  wave,
  gain,
  legato: o.legato ?? 0.85,
  decay: o.decay ?? 0,
  vibrato: o.vibrato ?? 0,
  detune: o.detune ?? 0,
  echo: o.echo ?? 0,
});

const MAJOR_A = [[0, 4, 5, 3], [0, 3, 4, 0], [0, 5, 3, 4], [0, 3, 0, 4]];
const MAJOR_B = [[3, 4, 0, 5], [5, 3, 0, 4], [3, 0, 3, 4], [5, 4, 3, 4]];
const MINOR_A = [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 6], [0, 5, 3, 4]];
const MINOR_B = [[5, 6, 0, 0], [3, 5, 6, 4], [5, 3, 6, 4]];

export const MOODS: Readonly<Record<string, MoodDef>> = {
  /** Woods: hopeful, curious. */
  forest: {
    id: 'forest', bpm: 100, root: 62, mode: 'dorian', swing: 0, form: 'AABA', barsPerSection: 4,
    progA: [[0, 3, 0, 3], [0, 6, 3, 0], [0, 3, 6, 0], [0, 2, 3, 0]],
    progB: [[3, 6, 0, 4], [2, 3, 6, 0], [6, 3, 2, 4]],
    lead: { ...I('pulse50', 0.32, { legato: 0.8, vibrato: 12, echo: 0.15 }), octave: 0, density: 0.45, rest: 0.12 },
    harmony: { ...I('pulse25', 0.13, { legato: 0.6 }), style: 'arp16', octave: 0 },
    bass: { ...I('triangle', 0.55, { legato: 0.9 }), style: 'walking', octave: -2 },
    drums: { style: 'shaker', density: 0.5, gain: 0.35, fills: false, crash: false, sections: '' },
    echo: { steps: 3, feedback: 0.3, wet: 0.25 }, intro: 'none', loop: true,
  },
  /** Fen: murky, humid, swung. */
  swamp: {
    id: 'swamp', bpm: 84, root: 64, mode: 'phrygian', swing: 0.3, form: 'AABA', barsPerSection: 4,
    progA: [[0, 1, 0, 6], [0, 1, 6, 0], [0, 6, 5, 1]],
    progB: [[5, 6, 0, 1], [3, 1, 0, 1], [5, 3, 1, 0]],
    lead: { ...I('pulse25', 0.28, { legato: 0.9, vibrato: 30, detune: 14, echo: 0.2 }), octave: 0, density: 0.3, rest: 0.18 },
    harmony: { ...I('pulse12', 0.12, { legato: 0.35, decay: 0.12 }), style: 'offbeat', octave: 0 },
    bass: { ...I('triangle', 0.6, { legato: 0.45 }), style: 'pulse', octave: -2 },
    drums: { style: 'half', density: 0.35, gain: 0.3, fills: false, crash: false, sections: '' },
    echo: { steps: 3, feedback: 0.35, wet: 0.3 }, intro: 'none', loop: true,
  },
  /** Hollow: lonely, careful — echoing plucks, drips. */
  cave: {
    id: 'cave', bpm: 92, root: 69, mode: 'aeolian', swing: 0, form: 'ABAB', barsPerSection: 4,
    progA: [[0, 5, 0, 6], [0, 3, 0, 5], [0, 6, 5, 4]],
    progB: [[5, 3, 6, 4], [3, 5, 6, 6], [5, 6, 3, 4]],
    lead: { ...I('pulse12', 0.3, { legato: 0.5, decay: 0.35, echo: 0.6 }), octave: 0, density: 0.25, rest: 0.3 },
    harmony: { ...I('sine', 0.1, { legato: 1 }), style: 'pad', octave: -1 },
    bass: { ...I('triangle', 0.5, { legato: 1 }), style: 'drone', octave: -2 },
    drums: { style: 'sparse', density: 0.4, gain: 0.3, fills: false, crash: false, sections: '' },
    echo: { steps: 6, feedback: 0.45, wet: 0.45 }, intro: 'none', loop: true,
  },
  /** Rime: sparse, cold, beautiful — bells, drums only in B. */
  frost: {
    id: 'frost', bpm: 76, root: 65, mode: 'lydian', swing: 0, form: 'AABA', barsPerSection: 4,
    progA: [[0, 1, 0, 1], [0, 1, 4, 0], [0, 4, 1, 0]],
    progB: [[5, 1, 4, 0], [2, 1, 5, 4], [5, 4, 1, 1]],
    lead: { ...I('triangle', 0.4, { legato: 0.9, decay: 0.6, echo: 0.35 }), octave: 1, density: 0.3, rest: 0.15 },
    harmony: { ...I('sine', 0.14, { legato: 0.7, decay: 0.3, echo: 0.3 }), style: 'arp8', octave: 0 },
    bass: { ...I('triangle', 0.45, { legato: 0.95 }), style: 'root', octave: -2 },
    drums: { style: 'shaker', density: 0.3, gain: 0.25, fills: false, crash: false, sections: 'B' },
    echo: { steps: 4, feedback: 0.4, wet: 0.4 }, intro: 'none', loop: true,
  },
  /** Amethyst: mysterious, glittering — glassy high arps, long echo, pad. */
  crystal: {
    id: 'crystal', bpm: 96, root: 72, mode: 'melodicMinor', swing: 0, form: 'AABA', barsPerSection: 4,
    progA: [[0, 2, 0, 2], [0, 3, 2, 4], [0, 2, 3, 4]],
    progB: [[3, 2, 3, 4], [5, 2, 3, 4], [3, 4, 2, 2]],
    lead: { ...I('pulse12', 0.24, { legato: 0.7, decay: 0.5, echo: 0.55 }), octave: 0, density: 0.35, rest: 0.2 },
    harmony: { ...I('pulse12', 0.1, { legato: 0.5, echo: 0.4 }), style: 'arp16', octave: 0 },
    bass: { ...I('triangle', 0.5, { legato: 0.9 }), style: 'root', octave: -2 },
    drums: { style: 'half', density: 0.3, gain: 0.25, fills: false, crash: false, sections: 'B' },
    echo: { steps: 6, feedback: 0.5, wet: 0.4 }, intro: 'none', loop: true,
  },
  /** Cinder: urgent, hot — driving 8ths, hard snare. */
  volcano: {
    id: 'volcano', bpm: 132, root: 60, mode: 'harmonicMinor', swing: 0, form: 'AABA', barsPerSection: 4,
    progA: [[0, 5, 3, 4], [0, 3, 4, 0], [0, 5, 1, 4]],
    progB: [[5, 3, 4, 4], [3, 4, 0, 5], [5, 1, 4, 4]],
    lead: { ...I('pulse50', 0.3, { legato: 0.75, vibrato: 15 }), octave: 0, density: 0.6, rest: 0.08 },
    harmony: { ...I('pulse25', 0.12, { legato: 0.5 }), style: 'offbeat', octave: -1 },
    bass: { ...I('triangle', 0.6, { legato: 0.7 }), style: 'eighths', octave: -2 },
    drums: { style: 'basic', density: 0.75, gain: 0.45, fills: true, crash: true, sections: '' },
    echo: { steps: 3, feedback: 0.2, wet: 0.15 }, intro: 'none', loop: true,
  },
  /** Blight Lair: dread — drone, dissonant stabs, heartbeat. */
  lair: {
    id: 'lair', bpm: 124, root: 59, mode: 'octatonic', swing: 0, form: 'AABA', barsPerSection: 4,
    progA: [[0, 0, 1, 0], [0, 0, 0, 1]],
    progB: [[0, 2, 4, 6], [2, 0, 6, 1]],
    lead: { ...I('pulse25', 0.24, { legato: 0.9, vibrato: 25, detune: 20, echo: 0.3 }), octave: 0, density: 0.2, rest: 0.35 },
    harmony: { ...I('pulse12', 0.14, { legato: 0.3 }), style: 'offbeat', octave: -1 },
    bass: { ...I('triangle', 0.6, { legato: 1 }), style: 'drone', octave: -2 },
    drums: { style: 'heartbeat', density: 0.4, gain: 0.5, fills: false, crash: false, sections: '' },
    echo: { steps: 4, feedback: 0.4, wet: 0.3 }, intro: 'none', loop: true,
  },
  /** Towns: safe, homely. */
  town: {
    id: 'town', bpm: 88, root: 67, mode: 'major', swing: 0.12, form: 'AABA', barsPerSection: 4,
    progA: MAJOR_A, progB: MAJOR_B,
    lead: { ...I('pulse50', 0.28, { legato: 0.85, vibrato: 10, echo: 0.1 }), octave: 0, density: 0.45, rest: 0.1 },
    harmony: { ...I('pulse25', 0.11, { legato: 0.4 }), style: 'offbeat', octave: -1 },
    bass: { ...I('triangle', 0.55, { legato: 0.85 }), style: 'walking', octave: -2 },
    drums: { style: 'basic', density: 0.25, gain: 0.25, fills: false, crash: false, sections: '' },
    echo: { steps: 3, feedback: 0.25, wet: 0.2 }, intro: 'none', loop: true,
  },
  /** Giant monsters: aggressive — fast arps, double-time drums, one-bar sting. */
  boss: {
    id: 'boss', bpm: 150, root: 64, mode: 'aeolian', swing: 0, form: 'AABA', barsPerSection: 4,
    progA: [[0, 5, 6, 4], [0, 6, 5, 6], [0, 3, 5, 4]],
    progB: [[5, 6, 0, 0], [3, 4, 5, 6], [5, 3, 6, 4]],
    lead: { ...I('pulse25', 0.3, { legato: 0.8, vibrato: 12 }), octave: 0, density: 0.65, rest: 0.06 },
    harmony: { ...I('pulse12', 0.12, { legato: 0.6 }), style: 'arp16', octave: -1 },
    bass: { ...I('triangle', 0.6, { legato: 0.7 }), style: 'octaves', octave: -2 },
    drums: { style: 'double', density: 0.8, gain: 0.5, fills: true, crash: true, sections: '' },
    echo: { steps: 3, feedback: 0.15, wet: 0.1 }, intro: 'sting', loop: true,
  },
  /** Blight Wraith invasion: panic, leave now. */
  invasion: {
    id: 'invasion', bpm: 160, root: 64, mode: 'phrygian', swing: 0, form: 'AB', barsPerSection: 4,
    progA: [[0, 1, 0, 1], [0, 0, 1, 1]],
    progB: [[6, 1, 6, 1], [5, 6, 1, 0]],
    lead: { ...I('pulse25', 0.3, { legato: 0.9, vibrato: 40 }), octave: 1, density: 0.25, rest: 0.05 },
    harmony: { ...I('pulse12', 0.12, { legato: 0.5 }), style: 'arp16', octave: -1 },
    bass: { ...I('triangle', 0.6, { legato: 0.6 }), style: 'eighths', octave: -2 },
    drums: { style: 'four', density: 0.7, gain: 0.5, fills: true, crash: true, sections: '' },
    echo: { steps: 2, feedback: 0.2, wet: 0.15 }, intro: 'sting', loop: true,
  },
  /** Title screen: mysterious, inviting. */
  title: {
    id: 'title', bpm: 80, root: 62, mode: 'aeolian', swing: 0, form: 'AABB', barsPerSection: 4,
    progA: [[0, 5, 2, 6], [0, 6, 5, 6]],
    progB: [[5, 6, 0, 0], [3, 5, 6, 4]],
    lead: { ...I('pulse25', 0.26, { legato: 0.9, vibrato: 14, echo: 0.35 }), octave: 0, density: 0.3, rest: 0.12 },
    harmony: { ...I('triangle', 0.16, { legato: 0.6, decay: 0.4, echo: 0.3 }), style: 'arp8', octave: 0 },
    bass: { ...I('triangle', 0.5, { legato: 1 }), style: 'root', octave: -2 },
    drums: { style: 'half', density: 0.25, gain: 0.25, fills: false, crash: false, sections: 'B' },
    echo: { steps: 6, feedback: 0.4, wet: 0.35 }, intro: 'none', loop: true,
  },
  /** Victory: fanfare, then a warm loop. */
  victory: {
    id: 'victory', bpm: 110, root: 60, mode: 'major', swing: 0, form: 'AB', barsPerSection: 4,
    progA: MAJOR_A, progB: MAJOR_B,
    lead: { ...I('pulse50', 0.3, { legato: 0.85, vibrato: 12 }), octave: 0, density: 0.45, rest: 0.08 },
    harmony: { ...I('pulse25', 0.12, { legato: 0.6 }), style: 'arp8', octave: 0 },
    bass: { ...I('triangle', 0.55, { legato: 0.85 }), style: 'walking', octave: -2 },
    drums: { style: 'basic', density: 0.4, gain: 0.35, fills: true, crash: true, sections: '' },
    echo: { steps: 3, feedback: 0.2, wet: 0.15 }, intro: 'fanfare', loop: true,
  },
  /** Run lost: a short lament that does not loop. */
  gameover: {
    id: 'gameover', bpm: 66, root: 57, mode: 'aeolian', swing: 0, form: 'A', barsPerSection: 4,
    progA: [[0, 5, 3, 4], [0, 3, 5, 4]],
    progB: MINOR_B,
    lead: { ...I('pulse25', 0.28, { legato: 0.95, vibrato: 20, echo: 0.3 }), octave: 0, density: 0.2, rest: 0.05 },
    harmony: { ...I('triangle', 0.14, { legato: 1 }), style: 'pad', octave: -1 },
    bass: { ...I('triangle', 0.5, { legato: 1 }), style: 'root', octave: -2 },
    drums: { style: 'none', density: 0, gain: 0, fills: false, crash: false, sections: '' },
    echo: { steps: 6, feedback: 0.4, wet: 0.35 }, intro: 'none', loop: false,
  },
};

/** Biome ids (GDD §8) and older names → track ids. */
export const TRACK_ALIASES: Readonly<Record<string, string>> = {
  woods: 'forest',
  fen: 'swamp',
  hollow: 'cave',
  rime: 'frost',
  amethyst: 'crystal',
  cinder: 'volcano',
  blight: 'lair',
  menu: 'title',
  win: 'victory',
  lose: 'gameover',
  death: 'gameover',
};

/** Canonical track id ('' stays '' = silence). Unknown ids are kept (they get a derived mood). */
export function resolveTrackId(id: string): string {
  return TRACK_ALIASES[id] ?? id;
}

const DERIVED_BASES = ['forest', 'cave', 'swamp', 'frost', 'crystal', 'volcano', 'town'] as const;
const DERIVED_MODES: ModeId[] = ['dorian', 'aeolian', 'phrygian', 'lydian', 'mixolydian', 'major', 'harmonicMinor'];
const derived = new Map<string, MoodDef>();

/**
 * Mood for any track id. Known ids return their preset; unknown ids (new biomes, phase-2 content) get a
 * stable mood derived from a hash of the id, so every music id plays *something* characteristic.
 */
export function moodFor(trackId: string): MoodDef {
  const id = resolveTrackId(trackId);
  const known = MOODS[id];
  if (known) return known;
  let m = derived.get(id);
  if (!m) {
    const h = hashSeed(`mood:${id}`);
    const base = MOODS[DERIVED_BASES[h % DERIVED_BASES.length]!]!;
    m = {
      ...base,
      id,
      mode: DERIVED_MODES[(h >>> 8) % DERIVED_MODES.length]!,
      root: 57 + ((h >>> 12) % 12),
      bpm: 76 + ((h >>> 16) % 60),
      progA: MINOR_A,
      progB: MINOR_B,
    };
    derived.set(id, m);
  }
  return m;
}
