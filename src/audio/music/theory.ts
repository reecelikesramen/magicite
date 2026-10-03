/** Scales as semitone offsets from the tonic. Any length works (degree maths is modulo length). */
export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  /** Half-whole diminished: every triad is diminished — dread. */
  octatonic: [0, 1, 3, 4, 6, 7, 9, 10],
} as const satisfies Record<string, readonly number[]>;

export type ModeId = keyof typeof MODES;

/** MIDI note of a scale degree (degree may be negative or exceed the scale length). */
export function degreeToMidi(root: number, scale: readonly number[], degree: number): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const idx = degree - oct * n;
  return root + oct * 12 + scale[idx]!;
}

/** Equal-tempered frequency of a MIDI note (A4 = 69 = 440 Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Pitch classes (0..11) contained in a scale rooted at `root`. */
export function scalePitchClasses(root: number, scale: readonly number[]): Set<number> {
  const s = new Set<number>();
  for (const iv of scale) s.add((((root + iv) % 12) + 12) % 12);
  return s;
}

/** Scale degrees of the triad (or 7th chord) built on `degree`. */
export function chordDegrees(degree: number, seventh = false): number[] {
  return seventh ? [degree, degree + 2, degree + 4, degree + 6] : [degree, degree + 2, degree + 4];
}

/** Nearest degree to `d` whose pitch class is a chord tone of the chord on `chord` (ties prefer lower). */
export function nearestChordTone(d: number, chord: number, scaleLen: number): number {
  for (let off = 0; off <= scaleLen; off++) {
    if (isChordTone(d - off, chord, scaleLen)) return d - off;
    if (isChordTone(d + off, chord, scaleLen)) return d + off;
  }
  return d;
}

export function isChordTone(d: number, chord: number, scaleLen: number): boolean {
  const rel = ((((d - chord) % scaleLen) + scaleLen) % scaleLen);
  return rel === 0 || rel === 2 || rel === 4;
}
