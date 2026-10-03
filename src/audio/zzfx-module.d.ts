/** Minimal typings for the parts of `zzfx` (MIT, Frank Force) we use. */
declare module 'zzfx' {
  export const ZZFX: {
    volume: number;
    sampleRate: number;
    audioContext: unknown;
    /** Synthesize one ZzFX parameter list into mono samples (amplitude ≈ volume param). */
    buildSamples(...params: (number | undefined)[]): Float32Array;
    getNote(semitoneOffset?: number, rootNoteFrequency?: number): number;
  };
  export function zzfx(...params: (number | undefined)[]): unknown;
}
