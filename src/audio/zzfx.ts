/**
 * Lazy loader for the `zzfx` synth (MIT, Frank Force — https://github.com/KilledByAPixel/ZzFX).
 *
 * The package constructs `new AudioContext` as a module side effect. To keep it from creating a second
 * (autoplay-blocked) context — or throwing where WebAudio does not exist (tests, Bun/Deno, odd webviews) —
 * we import it dynamically while `globalThis.AudioContext` temporarily returns our own context (or an
 * inert stub). We only use its pure `buildSamples`; playback goes through our own gain graph.
 */

/** ZzFX parameter list: [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide,
 * deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume,
 * decay, tremolo, filter]. Shapes: 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise, 5 square (duty = shapeCurve). */
export type ZzfxParams = readonly (number | undefined)[];

/** Renders a parameter list to mono samples. Deterministic: the randomness param is forced to 0
 * (per-play pitch variance is applied as playback rate instead). */
export type SampleBuilder = (params: ZzfxParams, sampleRate: number) => Float32Array;

let loading: Promise<SampleBuilder | null> | null = null;

/** Load zzfx once. Resolves to null if the module can't be evaluated in this environment. */
export function loadZzfx(sharedContext?: object): Promise<SampleBuilder | null> {
  if (loading) return loading;
  loading = (async (): Promise<SampleBuilder | null> => {
    const g = globalThis as { AudioContext?: unknown };
    const had = Object.prototype.hasOwnProperty.call(g, 'AudioContext');
    const prev = g.AudioContext;
    const stub = sharedContext ?? { sampleRate: 44100 };
    g.AudioContext = function AudioContextShim(): object {
      return stub;
    };
    try {
      const mod = await import('zzfx');
      const Z = mod.ZZFX;
      if (!Z || typeof Z.buildSamples !== 'function') return null;
      const scratch: (number | undefined)[] = [];
      return (params: ZzfxParams, sampleRate: number): Float32Array => {
        Z.sampleRate = sampleRate;
        scratch.length = 0;
        for (let i = 0; i < params.length; i++) scratch.push(params[i]);
        scratch[1] = 0;
        return Z.buildSamples(...scratch);
      };
    } catch {
      return null;
    } finally {
      if (had) g.AudioContext = prev;
      else delete g.AudioContext;
    }
  })();
  return loading;
}
