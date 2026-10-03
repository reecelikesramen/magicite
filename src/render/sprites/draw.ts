import { css } from '../color';
import type { PixelContext } from './registry';

const cssCache = new Map<number, string>();
function cs(c: number): string {
  let s = cssCache.get(c);
  if (!s) {
    s = css(c);
    cssCache.set(c, s);
  }
  return s;
}

/** Tiny pixel-art pen over a canvas-like context (integer coords, 0xRRGGBB colours). */
export class Pen {
  constructor(
    readonly ctx: PixelContext,
    public ox = 0,
    public oy = 0,
  ) {}

  px(x: number, y: number, c: number): void {
    this.ctx.fillStyle = cs(c);
    this.ctx.fillRect(this.ox + Math.round(x), this.oy + Math.round(y), 1, 1);
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = cs(c);
    this.ctx.fillRect(this.ox + Math.round(x), this.oy + Math.round(y), Math.round(w), Math.round(h));
  }

  hline(x0: number, x1: number, y: number, c: number): void {
    this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c);
  }

  vline(x: number, y0: number, y1: number, c: number): void {
    this.rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c);
  }

  /** Filled ellipse centred on (cx,cy) in pixel-centre space, radii rx/ry. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number): void {
    this.ctx.fillStyle = cs(c);
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy * dy > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      const xa = Math.round(cx - half);
      const xb = Math.round(cx + half);
      if (xb > xa) this.ctx.fillRect(this.ox + xa, this.oy + y, xb - xa, 1);
    }
  }

  disc(cx: number, cy: number, r: number, c: number): void {
    this.ellipse(cx, cy, r, r, c);
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    this.ctx.fillStyle = cs(c);
    for (let i = 0; i < 512; i++) {
      this.ctx.fillRect(this.ox + x0, this.oy + y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /**
   * ASCII-art block: each row is a string, each char a palette key ('.' / ' ' = transparent).
   * `flip` mirrors horizontally.
   */
  grid(rows: readonly string[], pal: Record<string, number>, x = 0, y = 0, flip = false): void {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]!;
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]!;
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c === undefined) continue;
        this.px(x + (flip ? row.length - 1 - i : i), y + r, c);
      }
    }
  }
}
