import { Container, Sprite, type Texture } from 'pixi.js';
import { blue, green, red, rgb } from './color';
import { LIGHT_RANGE } from './compositor';

/**
 * Pooled additive radial sprites (lights into the lightmap, halos into the bloom layer).
 * Call `begin()` once per frame, `add()` per light, then `end()` to hide the unused tail.
 * No allocations after warm-up.
 */
export class LightPool {
  readonly container = new Container();
  private pool: Sprite[] = [];
  private n = 0;
  /** Texture edge in px (lights are scaled from it). */
  private size: number;

  constructor(
    private readonly texture: Texture,
    /** Divide intensities by this (lightmap encoding); 1 for halos. */
    private readonly range = LIGHT_RANGE,
  ) {
    this.size = texture.width;
  }

  get count(): number {
    return this.n;
  }

  begin(): void {
    this.n = 0;
  }

  /**
   * Add a radial light centred at (x,y) (world px) reaching `radius` px. `w` > 0 stretches it
   * horizontally into a capsule-ish glow (merged lava runs). Intensity 1 = full colour.
   */
  add(x: number, y: number, radius: number, color: number, intensity: number, w = 0): void {
    if (radius <= 0 || intensity <= 0) return;
    let s = this.pool[this.n];
    if (!s) {
      s = new Sprite(this.texture);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this.pool.push(s);
      this.container.addChild(s);
    }
    this.n++;
    s.visible = true;
    s.position.set(x, y);
    s.scale.set((radius * 2 + w) / this.size, (radius * 2) / this.size);
    s.tint = lightTint(color, intensity, this.range);
  }

  end(): void {
    for (let i = this.n; i < this.pool.length; i++) {
      const s = this.pool[i]!;
      if (!s.visible) break;
      s.visible = false;
    }
  }

  clear(): void {
    this.begin();
    this.end();
  }
}

/** Sprite tint for a light of `color` at `intensity`, encoded for a lightmap of `range`. */
export function lightTint(color: number, intensity: number, range = LIGHT_RANGE): number {
  const k = intensity / range;
  return rgb(red(color) * k, green(color) * k, blue(color) * k);
}

/** Cheap deterministic flicker 0..1 for light `seed` at time `t` seconds (sum of sines). */
export function flicker(seed: number, t: number): number {
  const a = Math.sin(t * 9.1 + seed * 1.7) * 0.5 + Math.sin(t * 23.3 + seed * 3.1) * 0.3 + Math.sin(t * 4.3 + seed) * 0.2;
  return a * 0.5 + 0.5;
}
