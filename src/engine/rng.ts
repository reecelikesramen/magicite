/**
 * Deterministic seeded PRNG (sfc32). All simulation randomness MUST come from an Rng
 * instance owned by the world — never Math.random — so runs replay identically from a
 * seed and co-op peers stay in lockstep.
 */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Hash a string or number into a 32-bit seed (xmur3). */
export function hashSeed(input: string | number): number {
  const str = typeof input === 'number' ? `n${input}` : input;
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Stateless integer hash of up to 3 ints → [0, 2^32). Useful for per-tile visual noise. */
export function hash3(x: number, y: number, z = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** hash3 mapped to [0, 1). */
export function hash01(x: number, y: number, z = 0): number {
  return hash3(x, y, z) / 4294967296;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number | string = 1) {
    const s = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = s;
    for (let i = 0; i < 15; i++) this.nextU32();
  }

  static fromState(s: RngState): Rng {
    const r = new Rng(0);
    r.a = s.a;
    r.b = s.b;
    r.c = s.c;
    r.d = s.d;
    return r;
  }

  getState(): RngState {
    return { a: this.a, b: this.b, c: this.c, d: this.d };
  }

  nextU32(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    const t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    const r = (t + this.d) | 0;
    this.c = (this.c + r) | 0;
    return r >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick on empty array');
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  /** Pick by weight. `weight` returns a non-negative number for each item. */
  weighted<T>(arr: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const t of arr) total += Math.max(0, weight(t));
    if (total <= 0) return this.pick(arr);
    let r = this.next() * total;
    for (const t of arr) {
      r -= Math.max(0, weight(t));
      if (r < 0) return t;
    }
    return arr[arr.length - 1]!;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }

  /** Derive an independent child generator (e.g. one per level, per system). */
  fork(label: string | number = 0): Rng {
    return new Rng(hashSeed(`${this.nextU32()}:${label}`));
  }
}
