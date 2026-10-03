import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import type { Rng } from '../../engine/rng';

/** Simplex noise whose permutation table comes from our seeded Rng (deterministic). */
export function makeNoise(rng: Rng): NoiseFunction2D {
  return createNoise2D(() => rng.next());
}

/** Fractal noise in roughly [-1, 1]. */
export function fbm(n: NoiseFunction2D, x: number, y: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += n(x * f, y * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** Smooth 1-D noise in [0, 1]. */
export function noise01(n: NoiseFunction2D, x: number, row: number): number {
  return (n(x, row * 17.31) + 1) * 0.5;
}
