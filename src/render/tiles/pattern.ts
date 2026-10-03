import { hash01, hash3 } from '../../engine/rng';

/**
 * Seamless (wrap-around) cellular "cobble" pattern: rounded blobs with dark crevices, lit from
 * the top. Precomputed once per style into small typed arrays so tile painting is a lookup.
 *
 * level: 0 = crevice, 1 = shadowed lower rim, 2 = body, 3 = highlighted upper rim.
 * cell:  per-blob hash 0..255 (for per-cobble tone variance).
 */
export interface CobblePattern {
  size: number;
  mask: number;
  level: Uint8Array;
  cell: Uint8Array;
}

export interface CobbleOptions {
  /** Pattern edge in px (power of two). */
  size: number;
  /** Approximate blob diameter in px. */
  cell: number;
  seed: number;
  /** Crevice width threshold (F2 - F1 in px); larger = thicker cracks. */
  crevice?: number;
  /** Vertical squash of blobs (>1 = wider than tall). */
  squash?: number;
}

export function makeCobble(opts: CobbleOptions): CobblePattern {
  const { size, seed } = opts;
  if ((size & (size - 1)) !== 0) throw new Error('cobble size must be a power of two');
  const n = Math.max(2, Math.round(size / opts.cell));
  const cs = size / n;
  const crev = opts.crevice ?? 0.9;
  const squash = opts.squash ?? 1;
  // Jittered feature point per cell.
  const fx = new Float32Array(n * n);
  const fy = new Float32Array(n * n);
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      fx[cy * n + cx] = (cx + 0.2 + 0.6 * hash01(cx, cy, seed)) * cs;
      fy[cy * n + cx] = (cy + 0.2 + 0.6 * hash01(cx, cy, seed + 101)) * cs;
    }
  }
  const level = new Uint8Array(size * size);
  const cell = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const ccx = Math.floor(px / cs);
      const ccy = Math.floor(py / cs);
      let d1 = 1e9;
      let d2 = 1e9;
      let best = 0;
      let bdx = 0;
      let bdy = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = ccx + ox;
          const gy = ccy + oy;
          const wx = ((gx % n) + n) % n;
          const wy = ((gy % n) + n) % n;
          const i = wy * n + wx;
          // Feature point position, shifted by the wrap offset so distances are seamless.
          const fpx = fx[i]! + (gx - wx) * cs;
          const fpy = fy[i]! + (gy - wy) * cs;
          const dx = (px - fpx) / squash;
          const dy = py - fpy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = i;
            bdx = dx;
            bdy = dy;
          } else if (d < d2) d2 = d;
        }
      }
      const o = y * size + x;
      cell[o] = hash3(best, seed, 7) & 255;
      const edge = d2 - d1;
      const r = cs * 0.5;
      let lv = 2;
      if (edge < crev) lv = 0;
      else if (bdy < -r * 0.3 && edge > crev + 0.6 && bdx < r * 0.35) lv = 3;
      else if (bdy > r * 0.3 || (edge < crev + 0.8 && bdy > 0)) lv = 1;
      level[o] = lv;
    }
  }
  return { size, mask: size - 1, level, cell };
}

export interface PatternSet {
  ground: CobblePattern;
  wall: CobblePattern;
  rock: CobblePattern;
  bedrock: CobblePattern;
  lava: CobblePattern;
}

let shared: PatternSet | null = null;

/** The shared set of patterns (deterministic, built once). */
export function patterns(): PatternSet {
  if (!shared) {
    shared = {
      ground: makeCobble({ size: 128, cell: 5, seed: 11 }),
      wall: makeCobble({ size: 128, cell: 8, seed: 23, crevice: 1.2, squash: 1.15 }),
      rock: makeCobble({ size: 128, cell: 4, seed: 37, crevice: 0.8 }),
      bedrock: makeCobble({ size: 128, cell: 6, seed: 41, crevice: 1.1 }),
      lava: makeCobble({ size: 128, cell: 6, seed: 53, crevice: 1.3, squash: 1.3 }),
    };
  }
  return shared;
}
