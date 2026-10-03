import { clamp, damp } from '../engine/math';
import { TICK_RATE } from '../sim/constants';

export interface CameraTarget {
  /** Focus centre in world px. */
  x: number;
  y: number;
  /** Velocity px/s (for lookahead). */
  vx: number;
  vy: number;
  grounded: boolean;
  /** Optional aim point in world px (mouse/stick). */
  aimX?: number;
  aimY?: number;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Smooth-follow platformer camera in native px (pure; no Pixi). Velocity + aim lookahead,
 * softer vertical follow in the air, clamping to level (or boss-arena) bounds, trauma shake.
 * `x,y` is the top-left of the view; the renderer snaps the final offset to screen pixels.
 */
export class Camera {
  x = 0;
  y = 0;
  viewW = 320;
  viewH = 180;
  /** Current shake offset (add to x/y when rendering). */
  shakeX = 0;
  shakeY = 0;
  private lookX = 0;
  private lookY = 0;
  private shakeAmp = 0;
  private shakeT = 0;
  private shakeDur = 0;
  private hasTarget = false;

  setView(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  /** Jump straight to a focus point (level load / teleport). */
  snap(cx: number, cy: number, b: Bounds): void {
    this.lookX = 0;
    this.lookY = 0;
    this.x = clampAxis(cx - this.viewW / 2, this.viewW, b.x, b.w);
    this.y = clampAxis(cy - this.viewH / 2, this.viewH, b.y, b.h);
    this.hasTarget = true;
  }

  /** Add screen shake of `amount` native px for `ticks` sim ticks (strongest wins). */
  addShake(amount: number, ticks: number): void {
    const dur = Math.max(1, ticks) / TICK_RATE;
    const remaining = this.shakeDur > 0 ? this.shakeAmp * (this.shakeT / this.shakeDur) : 0;
    if (amount >= remaining) {
      this.shakeAmp = amount;
      this.shakeT = dur;
      this.shakeDur = dur;
    }
  }

  update(dt: number, t: CameraTarget | null, b: Bounds, rand: () => number = Math.random): void {
    if (t) {
      if (!this.hasTarget) this.snap(t.x, t.y, b);
      let tlx = clamp(t.vx * 0.3, -32, 32);
      let tly = clamp(t.vy * 0.08, -8, 22);
      if (t.aimX !== undefined && t.aimY !== undefined) {
        tlx += clamp((t.aimX - t.x) * 0.15, -16, 16);
        tly += clamp((t.aimY - t.y) * 0.1, -10, 10);
      }
      this.lookX += (tlx - this.lookX) * damp(2.5, dt);
      this.lookY += (tly - this.lookY) * damp(2, dt);
      const dx = t.x + this.lookX - this.viewW / 2;
      const dy = t.y + this.lookY - this.viewH / 2;
      if (Math.abs(dx - this.x) > this.viewW * 1.5 || Math.abs(dy - this.y) > this.viewH * 1.5) {
        this.snap(t.x, t.y, b);
      } else {
        this.x += (dx - this.x) * damp(7, dt);
        this.y += (dy - this.y) * damp(t.grounded ? 6 : 3.5, dt);
      }
    }
    this.x = clampAxis(this.x, this.viewW, b.x, b.w);
    this.y = clampAxis(this.y, this.viewH, b.y, b.h);
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeDur > 0 ? this.shakeT / this.shakeDur : 0;
      const a = this.shakeAmp * k * k;
      this.shakeX = (rand() * 2 - 1) * a;
      this.shakeY = (rand() * 2 - 1) * a;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }
}

/** Clamp a view's start to [lo, lo+size-view]; centre it when the area is smaller than the view. */
export function clampAxis(pos: number, view: number, lo: number, size: number): number {
  if (size <= view) return lo + (size - view) / 2;
  return clamp(pos, lo, lo + size - view);
}
