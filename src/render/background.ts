import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { hash01 } from '../engine/rng';
import { css, lift, mix } from './color';
import type { BiomeFamily, BiomeStyle } from './style';

/**
 * Far background: a flat haze of `palette.sky` plus two faint parallax silhouette strips
 * (cave columns / stalactites, distant tree tops, crystal spires…). Only visible where the level
 * has no back wall (open caverns); drawn first into the terrain layer and lit by the sky mask.
 */
const STRIP_W = 256;
const STRIP_H = 128;

type Shape = 'trees' | 'columns' | 'spires' | 'pines';

const SHAPES: Record<BiomeFamily, Shape> = {
  woods: 'trees',
  fen: 'trees',
  hollow: 'columns',
  rime: 'pines',
  amethyst: 'spires',
  cinder: 'columns',
  lair: 'spires',
};

/** Smooth 1D value noise in 0..1 (wraps every `period` px). */
function noise1(x: number, period: number, cell: number, seed: number): number {
  const n = period / cell;
  const i = Math.floor(x / cell);
  const f = x / cell - i;
  const a = hash01(((i % n) + n) % n, seed, 5);
  const b = hash01((((i + 1) % n) + n) % n, seed, 5);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

/** Draw one silhouette strip (pure canvas calls). Exported for tests via a fake context. */
export function drawStrip(ctx: CanvasRenderingContext2D, shape: Shape, color: number, seed: number): void {
  ctx.fillStyle = css(color);
  for (let x = 0; x < STRIP_W; x++) {
    // Floor hills (all shapes).
    const hill = 18 + noise1(x, STRIP_W, 32, seed) * 22 + noise1(x, STRIP_W, 8, seed + 1) * 5;
    ctx.fillRect(x, Math.round(STRIP_H - hill), 1, Math.ceil(hill));
    // Ceiling (caves): stalactites hanging from the top.
    if (shape === 'columns' || shape === 'spires') {
      const top = 6 + noise1(x, STRIP_W, 24, seed + 2) * 14 + (hash01(x >> 1, seed, 9) < 0.06 ? 10 : 0);
      ctx.fillRect(x, 0, 1, Math.round(top));
    }
  }
  const count = shape === 'columns' ? 3 : 7;
  for (let k = 0; k < count; k++) {
    const cx = Math.floor(hash01(k, seed, 11) * STRIP_W);
    const s = 0.6 + hash01(k, seed, 12) * 0.6;
    switch (shape) {
      case 'trees': {
        const h = Math.round(50 * s);
        ctx.fillRect(cx, STRIP_H - h - 20, 2, h);
        for (let j = 0; j < 4; j++) {
          const py = STRIP_H - 26 - Math.round(h * (0.3 + j * 0.2));
          const r = Math.round((5 - j) * s + 3);
          const ox = j % 2 === 0 ? -r + 1 : r - 1;
          for (let dy = -r; dy <= r; dy++) {
            const half = Math.round(Math.sqrt(r * r - dy * dy) * 1.3);
            ctx.fillRect(cx + ox - half, py + dy, half * 2 + 1, 1);
          }
        }
        break;
      }
      case 'pines': {
        const h = Math.round(46 * s);
        for (let y = 0; y < h; y++) {
          const half = Math.round((y / h) * 9 * s * (1 - 0.3 * ((y % 8) / 8)));
          ctx.fillRect(cx - half, STRIP_H - 22 - h + y, half * 2 + 1, 1);
        }
        break;
      }
      case 'spires': {
        const h = Math.round(60 * s);
        for (let y = 0; y < h; y++) {
          const half = Math.round((y / h) * 4 * s) + 1;
          ctx.fillRect(cx - half, STRIP_H - 20 - h + y, half * 2, 1);
        }
        break;
      }
      case 'columns': {
        const w = Math.round(10 * s) + 4;
        for (let y = 0; y < STRIP_H; y++) {
          const pinch = Math.abs(y - STRIP_H * 0.45) / (STRIP_H * 0.45);
          const half = Math.round(w * (0.45 + 0.55 * pinch * pinch));
          ctx.fillRect(cx - half, y, half * 2, 1);
        }
        break;
      }
    }
  }
}

export class Background {
  /** Screen-aligned (add to the terrain layer root, behind the world). */
  readonly root = new Container();
  private haze = new Sprite(Texture.WHITE);
  private far: TilingSprite | null = null;
  private near: TilingSprite | null = null;
  private textures: Texture[] = [];

  constructor() {
    this.root.addChild(this.haze);
  }

  setStyle(st: BiomeStyle, seed: number): void {
    this.destroyStrips();
    const sky = st.pal.sky;
    this.haze.tint = sky;
    const shape = SHAPES[st.family];
    const farColor = mix(sky, lift(st.pal.wall[1] ?? sky, 4), 0.55);
    const nearColor = mix(sky, lift(st.pal.wall[2] ?? sky, 6), 0.75);
    this.far = this.strip(shape, farColor, seed);
    this.near = this.strip(shape, nearColor, seed + 7);
    this.root.addChild(this.far, this.near);
  }

  private strip(shape: Shape, color: number, seed: number): TilingSprite {
    const c = document.createElement('canvas');
    c.width = STRIP_W;
    c.height = STRIP_H;
    drawStrip(c.getContext('2d')!, shape, color, seed);
    const tex = Texture.from(c);
    tex.source.scaleMode = 'nearest';
    this.textures.push(tex);
    return new TilingSprite({ texture: tex, width: 64, height: STRIP_H });
  }

  /** Lay out for a native view of w×h at camera (cx, cy); levelH = level height in px. */
  update(w: number, h: number, cx: number, cy: number, levelH: number): void {
    this.haze.position.set(0, 0);
    this.haze.width = w;
    this.haze.height = h;
    this.place(this.far, 0.2, w, h, cx, cy, levelH);
    this.place(this.near, 0.4, w, h, cx, cy, levelH);
  }

  private place(s: TilingSprite | null, k: number, w: number, h: number, cx: number, cy: number, levelH: number): void {
    if (!s) return;
    s.width = w;
    s.tilePosition.x = -Math.round(cx * k);
    // Vertically: the strip sits around the level's middle, drifting with parallax.
    const mid = levelH * 0.5;
    s.position.set(0, Math.round(h * 0.55 - STRIP_H * 0.5 - (cy + h / 2 - mid) * k));
  }

  private destroyStrips(): void {
    this.far?.destroy();
    this.near?.destroy();
    this.far = this.near = null;
    for (const t of this.textures) t.destroy(true);
    this.textures.length = 0;
  }

  destroy(): void {
    this.destroyStrips();
    this.root.destroy({ children: true });
  }
}
