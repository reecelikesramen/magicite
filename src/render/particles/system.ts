/**
 * Pooled particle simulation (pure, DOM-free, allocation-free after construction). Square
 * 1–2 px particles with gravity, drag, fade, optional tile collision, wander and blink.
 * Presentation only: uses its own xorshift RNG (never touches the sim's RNG).
 */
export const PF = {
  /** Drawn into the emissive layer (unlit, bloomed). */
  GLOW: 1,
  /** Alpha fades out over the particle's life. */
  FADE: 2,
  /** Size shrinks to 1 px over life. */
  SHRINK: 4,
  /** Casts a tiny light into the lightmap. */
  LIGHT: 8,
  /** Stops on solid tiles (chips and blood settle on the ground). */
  COLLIDE: 16,
  /** Random drifting (fireflies, spores). */
  WANDER: 32,
  /** Brightness pulses (fireflies). */
  BLINK: 64,
  /** Ambient particle (managed per biome around the camera). */
  AMBIENT: 128,
} as const;

export type SolidFn = (x: number, y: number) => boolean;

export class ParticleSystem {
  readonly cap: number;
  count = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Float32Array;
  readonly max: Float32Array;
  readonly size: Float32Array;
  readonly grav: Float32Array;
  readonly drag: Float32Array;
  readonly color: Uint32Array;
  readonly flags: Uint16Array;
  /** Per-particle phase (blink / wander). */
  readonly phase: Float32Array;
  /** Computed by update(): 0..1 opacity for rendering. */
  readonly alpha: Float32Array;
  /** Number of live AMBIENT particles. */
  ambientCount = 0;
  private seed = 0x9e3779b9;

  constructor(cap = 4096) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.color = new Uint32Array(cap);
    this.flags = new Uint16Array(cap);
    this.phase = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
  }

  /** Uniform random 0..1 (presentation RNG). */
  rand(): number {
    let s = this.seed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.rand();
  }

  /** Spawn one particle; returns its index or -1 when full (oldest non-ambient is recycled). */
  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: number, flags: number, grav = 0, drag = 0): number {
    let i = this.count;
    if (i >= this.cap) {
      i = this.victim();
      if (i < 0) return -1;
      if (this.flags[i]! & PF.AMBIENT) this.ambientCount--;
    } else this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.color[i] = color;
    this.flags[i] = flags;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.phase[i] = this.rand() * 6.283;
    this.alpha[i] = 1;
    if (flags & PF.AMBIENT) this.ambientCount++;
    return i;
  }

  /** Index of the particle closest to death (cheap scan of a window), for recycling. */
  private victim(): number {
    let best = -1;
    let bl = 1e9;
    const start = Math.floor(this.rand() * this.count);
    for (let k = 0; k < 64; k++) {
      const i = (start + k) % this.count;
      if (this.life[i]! < bl) {
        bl = this.life[i]!;
        best = i;
      }
    }
    return best;
  }

  /** Advance by dt seconds. `solid` enables COLLIDE particles to settle on terrain. */
  update(dt: number, time: number, solid?: SolidFn): void {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      let l = this.life[i]! - dt;
      if (l <= 0) {
        this.remove(i, n - 1);
        n--;
        i--;
        continue;
      }
      this.life[i] = l;
      const f = this.flags[i]!;
      let vx = this.vx[i]!;
      let vy = this.vy[i]! + this.grav[i]! * dt;
      const d = this.drag[i]!;
      if (d > 0) {
        const k = Math.exp(-d * dt);
        vx *= k;
        vy *= k;
      }
      if (f & PF.WANDER) {
        vx += (this.rand() - 0.5) * 60 * dt;
        vy += (this.rand() - 0.5) * 60 * dt;
        vx *= 1 - Math.min(1, 0.8 * dt);
        vy *= 1 - Math.min(1, 0.8 * dt);
      }
      let nx = this.x[i]! + vx * dt;
      let ny = this.y[i]! + vy * dt;
      if (f & PF.COLLIDE && solid && solid(nx, ny)) {
        if (!solid(this.x[i]!, ny)) {
          nx = this.x[i]!;
          vx = -vx * 0.3;
        } else {
          ny = this.y[i]!;
          vy = 0;
          vx *= 0.5;
          // Settled: linger a moment, then fade.
          if (l > 0.6) l = this.life[i] = 0.6 + this.rand() * 0.4;
        }
      }
      this.x[i] = nx;
      this.y[i] = ny;
      this.vx[i] = vx;
      this.vy[i] = vy;
      const t = l / this.max[i]!;
      let a = f & PF.FADE ? Math.min(1, t * 2) : 1;
      if (f & PF.AMBIENT) a *= Math.min(1, (this.max[i]! - l) * 2, l * 2);
      if (f & PF.BLINK) a *= 0.35 + 0.65 * Math.max(0, Math.sin(time * 2.6 + this.phase[i]!));
      this.alpha[i] = a;
    }
    this.count = n;
  }

  /** Swap-remove particle i with the last live one. */
  private remove(i: number, last: number): void {
    if (this.flags[i]! & PF.AMBIENT) this.ambientCount--;
    if (i !== last) {
      this.x[i] = this.x[last]!;
      this.y[i] = this.y[last]!;
      this.vx[i] = this.vx[last]!;
      this.vy[i] = this.vy[last]!;
      this.life[i] = this.life[last]!;
      this.max[i] = this.max[last]!;
      this.size[i] = this.size[last]!;
      this.grav[i] = this.grav[last]!;
      this.drag[i] = this.drag[last]!;
      this.color[i] = this.color[last]!;
      this.flags[i] = this.flags[last]!;
      this.phase[i] = this.phase[last]!;
      this.alpha[i] = this.alpha[last]!;
    }
  }

  /** Kill ambient particles outside a rect (camera moved away) so they respawn near the view. */
  cullAmbient(x0: number, y0: number, x1: number, y1: number): void {
    for (let i = 0; i < this.count; i++) {
      if (!(this.flags[i]! & PF.AMBIENT)) continue;
      const x = this.x[i]!;
      const y = this.y[i]!;
      if (x < x0 || x > x1 || y < y0 || y > y1) this.life[i] = Math.min(this.life[i]!, 0.0001);
    }
  }

  clear(): void {
    this.count = 0;
    this.ambientCount = 0;
  }

  /** Current rendered size of particle i (SHRINK shrinks to 1 px). */
  sizeOf(i: number): number {
    const s = this.size[i]!;
    if (!(this.flags[i]! & PF.SHRINK) || s <= 1) return s;
    return Math.max(1, Math.round(s * (this.life[i]! / this.max[i]!) + 0.4));
  }
}
