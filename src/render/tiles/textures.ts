import { Texture } from 'pixi.js';
import { hash01 } from '../../engine/rng';
import { css } from '../color';

/** Create a small canvas texture drawn by `draw` (nearest sampling unless `linear`). */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, linear = false): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const t = Texture.from(c);
  if (linear) t.source.scaleMode = 'linear';
  return t;
}

let cracks: Texture[] | null = null;

/** 4 progressive 8×8 crack overlays for mining damage. */
export function crackTextures(): Texture[] {
  if (cracks) return cracks;
  // Crack pixel lists grow with each stage.
  const paths: [number, number][][] = [
    [[3, 3], [4, 4], [4, 3]],
    [[2, 2], [5, 5], [5, 2], [2, 5], [3, 1]],
    [[1, 2], [6, 6], [6, 1], [1, 6], [0, 3], [4, 0], [7, 4], [3, 7]],
    [[0, 1], [7, 7], [7, 0], [0, 7], [2, 4], [5, 3], [1, 0], [6, 7], [4, 6], [3, 5]],
  ];
  cracks = [];
  for (let s = 0; s < 4; s++) {
    cracks.push(
      canvasTexture(8, 8, (ctx) => {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        for (let k = 0; k <= s; k++) for (const [x, y] of paths[k]!) ctx.fillRect(x, y, 1, 1);
        ctx.fillStyle = 'rgba(255,240,220,0.25)';
        if (s >= 2) ctx.fillRect(3, 4, 1, 1);
      }),
    );
  }
  return cracks;
}

let surf: { water: [Texture, Texture]; lava: [Texture, Texture] } | null = null;

/** Tiling strips for animated liquid surfaces (two layers each, scrolled in opposite directions). */
export function surfaceTextures(): { water: [Texture, Texture]; lava: [Texture, Texture] } {
  if (surf) return surf;
  const wave = (seed: number, color: string, alpha: number) =>
    canvasTexture(16, 2, (ctx) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      for (let x = 0; x < 16; x++) {
        if (hash01(x, seed) < 0.45) ctx.fillRect(x, 1, 1, 1);
        if (hash01(x, seed + 9) < 0.18) ctx.fillRect(x, 0, 1, 1);
      }
    });
  const lava = (seed: number, a: number, b: number) =>
    canvasTexture(16, 3, (ctx) => {
      for (let x = 0; x < 16; x++) {
        const r = hash01(x >> 1, seed);
        ctx.fillStyle = css(r < 0.5 ? a : b);
        ctx.fillRect(x, 1, 1, 2);
        if (r > 0.7) ctx.fillRect(x, 0, 1, 1);
      }
    });
  surf = {
    water: [wave(3, '#bfe4ff', 0.55), wave(7, '#ffffff', 0.35)],
    lava: [lava(5, 0xffd040, 0xffb030), lava(11, 0xfff0a0, 0xffd040)],
  };
  return surf;
}

let grad: Texture | null = null;
let halo: Texture | null = null;

/** Smooth radial falloff (white, premultiplied) used for light sprites. 128×128, linear. */
export function lightTexture(): Texture {
  if (grad) return grad;
  grad = radialTexture(128, (t) => {
    const k = 1 - t;
    return k <= 0 ? 0 : k * k * (0.6 + 0.4 * k);
  });
  return grad;
}

/** Tighter core with a soft tail, for additive glow halos. */
export function haloTexture(): Texture {
  if (halo) return halo;
  halo = radialTexture(64, (t) => {
    const k = 1 - t;
    return k <= 0 ? 0 : Math.pow(k, 2.6);
  });
  return halo;
}

function radialTexture(size: number, falloff: (t: number) => number): Texture {
  return canvasTexture(
    size,
    size,
    (ctx) => {
      const img = ctx.createImageData(size, size);
      const r = size / 2;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = x + 0.5 - r;
          const dy = y + 0.5 - r;
          const t = Math.min(1, Math.sqrt(dx * dx + dy * dy) / r);
          const v = Math.round(255 * Math.max(0, Math.min(1, falloff(t))));
          const o = (y * size + x) * 4;
          img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
          img.data[o + 3] = v;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    true,
  );
}
