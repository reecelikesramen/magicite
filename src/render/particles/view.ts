import { Container, Sprite, Texture } from 'pixi.js';
import type { LightPool } from '../lights';
import { PF, type ParticleSystem } from './system';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sprite pool for one layer (1×1 white texture scaled to the particle size). */
class Pool {
  readonly container = new Container();
  private sprites: Sprite[] = [];
  n = 0;

  next(): Sprite {
    let s = this.sprites[this.n];
    if (!s) {
      s = new Sprite(Texture.WHITE);
      this.sprites.push(s);
      this.container.addChild(s);
    }
    this.n++;
    s.visible = true;
    return s;
  }

  end(): void {
    for (let i = this.n; i < this.sprites.length; i++) {
      const s = this.sprites[i]!;
      if (!s.visible) break;
      s.visible = false;
    }
    this.n = 0;
  }
}

/**
 * Draws a ParticleSystem: unlit-by-default particles into the lit entity layer, GLOW particles
 * into the emissive layer (+ soft halos into bloom, tiny lights into the lightmap).
 */
export class ParticleView {
  private litPool = new Pool();
  private glowPool = new Pool();
  /** Lit particles (add to the entity layer's world). */
  readonly lit = this.litPool.container;
  /** Glowing particles (add to the emissive layer's world). */
  readonly glow = this.glowPool.container;
  maxLights = 40;
  maxHalos = 220;

  sync(ps: ParticleSystem, view: Rect, lights: LightPool | null, halos: LightPool | null): void {
    const x0 = view.x - 4;
    const y0 = view.y - 4;
    const x1 = view.x + view.w + 4;
    const y1 = view.y + view.h + 4;
    let nl = 0;
    let nh = 0;
    for (let i = 0; i < ps.count; i++) {
      const x = ps.x[i]!;
      const y = ps.y[i]!;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const a = ps.alpha[i]!;
      if (a <= 0.02) continue;
      const f = ps.flags[i]!;
      const glow = (f & PF.GLOW) !== 0;
      const s = glow ? this.glowPool.next() : this.litPool.next();
      const size = ps.sizeOf(i);
      const half = size >> 1;
      s.position.set(Math.round(x) - half, Math.round(y) - half);
      s.scale.set(size);
      s.tint = ps.color[i]!;
      s.alpha = a;
      if (glow && halos && nh < this.maxHalos) {
        halos.add(x, y, 2.5 + size * 1.5, ps.color[i]!, 0.3 * a);
        nh++;
      }
      if (f & PF.LIGHT && lights && nl < this.maxLights) {
        lights.add(x, y, 14, ps.color[i]!, 0.45 * a);
        nl++;
      }
    }
    this.litPool.end();
    this.glowPool.end();
  }
}
