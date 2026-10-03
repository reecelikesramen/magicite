import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { PixelText } from '../render/pixelfont';
import { secs } from '../sim/constants';
import type { PlayerState } from '../sim/types';
import type { World } from '../sim/world';
import { fitText } from './format';
import { itemIcon } from './icons';
import { ICON } from './layout';
import { type ToastQueue, Timed, fadeAlpha } from './notify';
import { UI } from './theme';
import { Bar, frame, panel, solid } from './widgets';

/** Ticks a teammate must hold interact to revive (GDD: 2 s). */
export const REVIVE_TICKS = secs(2);

/**
 * reviveProgress (ticks a reviver has held interact, 0..REVIVE_TICKS; it decays while nobody
 * helps) → 0..1. Always ticks: guessing "≤ 1 means a fraction" drew a full bar for 1 tick.
 */
export function reviveFraction(progress: number): number {
  if (!(progress > 0)) return 0;
  return Math.min(1, progress / REVIVE_TICKS);
}

/** Text rendered at an integer multiple of the native scale (2× for banners). */
export class BigText extends Container {
  readonly inner: PixelText;

  constructor(text = '', color: number = UI.text, scale = 2) {
    super();
    this.inner = new PixelText(text, { color });
    this.inner.scale.set(scale);
    this.addChild(this.inner);
  }

  set text(v: string) {
    this.inner.text = v;
  }

  set color(c: number) {
    this.inner.color = c;
  }

  get textWidth(): number {
    return this.inner.textWidth * this.inner.scale.x;
  }
}

/** Centred toasts (bottom-centre), newest at the bottom, fading out. */
export class ToastView extends Container {
  private pool: PixelText[] = [];

  update(q: ToastQueue, centerX: number, bottom: number): void {
    const items = q.items;
    while (this.pool.length < items.length) {
      const t = new PixelText('');
      this.pool.push(t);
      this.addChild(t);
    }
    this.pool.forEach((t, i) => {
      const it = items[i];
      t.visible = !!it;
      if (!it) return;
      t.text = it.text;
      t.color = it.color;
      t.alpha = fadeAlpha(it.age, it.ttl, 0.1, 0.6);
      t.position.set(Math.round(centerX - t.textWidth / 2), bottom - (items.length - 1 - i) * 9);
    });
  }
}

/** Pickup feed: "+3 Wood [icon]" right-aligned, stacking upward. */
export class PickupFeed extends Container {
  private rows: { text: PixelText; icon: Sprite }[] = [];

  update(q: ToastQueue, right: number, bottom: number): void {
    const items = q.items;
    while (this.rows.length < items.length) {
      const row = { text: new PixelText('', { color: UI.text }), icon: new Sprite(Texture.EMPTY) };
      this.rows.push(row);
      this.addChild(row.icon, row.text);
    }
    this.rows.forEach((row, i) => {
      const it = items[i];
      row.text.visible = row.icon.visible = !!it;
      if (!it) return;
      row.text.text = it.text;
      row.text.color = it.color;
      const a = fadeAlpha(it.age, it.ttl, 0.08, 0.5);
      // Slide in from the right during the fade-in.
      const slide = it.age < 0.12 ? Math.round((1 - it.age / 0.12) * 8) : 0;
      const y = bottom - (items.length - 1 - i) * 11;
      row.icon.texture = it.icon ? itemIcon(it.icon) : Texture.EMPTY;
      row.icon.position.set(right - ICON + slide, y - 2);
      row.text.position.set(right - ICON - 3 - row.text.textWidth + slide, y);
      row.text.alpha = row.icon.alpha = a;
    });
  }
}

/** Big centred banner: small kicker line, 2× title, optional subtitle. */
export class Banner extends Container {
  readonly timer: Timed;
  private kicker = new PixelText('', { color: UI.textDim });
  private title = new BigText('');
  private sub = new PixelText('', { color: UI.textDim });
  private rule = new Graphics();
  private yFrac: number;

  constructor(ttl: number, yFrac: number) {
    super();
    this.timer = new Timed(ttl);
    this.yFrac = yFrac;
    this.addChild(this.rule, this.kicker, this.title, this.sub);
    this.visible = false;
  }

  show(kicker: string, title: string, sub = '', titleColor: number = UI.text, subColor: number = UI.textDim): void {
    this.kicker.text = kicker;
    this.title.text = title;
    this.title.color = titleColor;
    this.sub.text = sub;
    this.sub.color = subColor;
    this.timer.start();
  }

  hide(): void {
    this.timer.age = -1;
    this.visible = false;
  }

  update(dt: number, viewW: number, viewH: number): void {
    this.timer.tick(dt);
    this.visible = this.timer.active;
    if (!this.visible) return;
    this.alpha = this.timer.alpha(0.2, 0.8);
    const cx = Math.floor(viewW / 2);
    const y = Math.floor(viewH * this.yFrac);
    const hasKicker = this.kicker.text.length > 0;
    this.kicker.position.set(cx - Math.floor(this.kicker.textWidth / 2), y);
    const ty = hasKicker ? y + 10 : y;
    this.title.position.set(cx - Math.floor(this.title.textWidth / 2), ty);
    this.sub.position.set(cx - Math.floor(this.sub.textWidth / 2), ty + 18);
    const g = this.rule;
    g.clear();
    if (hasKicker) {
      const half = Math.floor(this.kicker.textWidth / 2) + 4;
      const len = Math.min(40, Math.floor(viewW / 6));
      g.rect(cx - half - len, y + 3, len, 1).fill({ color: UI.textMuted });
      g.rect(cx + half, y + 3, len, 1).fill({ color: UI.textMuted });
    }
  }
}

/** Full-screen colour flash (level-up). */
export class Flash extends Container {
  private s = solid(UI.flash, 0, 0, 1, 1, 0);
  private t = 0;
  private dur = 0.4;
  private peak = 0.35;

  constructor() {
    super();
    this.addChild(this.s);
  }

  fire(color: number = UI.flash, peak = 0.35, dur = 0.4): void {
    this.s.tint = color;
    this.peak = peak;
    this.dur = dur;
    this.t = dur;
  }

  update(dt: number, viewW: number, viewH: number): void {
    this.t = Math.max(0, this.t - dt);
    this.s.width = viewW;
    this.s.height = viewH;
    this.s.alpha = this.t > 0 ? this.peak * (this.t / this.dur) : 0;
    this.visible = this.t > 0;
  }
}

/** Local player downed/out overlay + teammate "is down" notices with revive progress. */
export class DownedOverlay extends Container {
  private veil = solid(UI.downed, 0, 0, 1, 1, 0.2);
  private title = new BigText('YOU ARE DOWN', UI.bad);
  private sub = new PixelText('', { color: UI.textDim });
  private bar = new Bar(UI.good);
  private notices: { text: PixelText; bar: Bar }[] = [];
  private noticeLayer = new Container();

  constructor() {
    super();
    this.addChild(this.veil, this.title, this.sub, this.bar, this.noticeLayer);
  }

  /** `noticeTop` = y of the first teammate-down notice (below the co-op party list). */
  update(world: World, me: number, dt: number, t: number, viewW: number, viewH: number, noticeTop = 40): void {
    const p = world.players[me];
    const down = !!p && (p.downed || p.out) && !world.run.over;
    this.veil.visible = this.title.visible = this.sub.visible = this.bar.visible = down;
    if (down && p) {
      this.veil.width = viewW;
      this.veil.height = viewH;
      this.veil.alpha = 0.16 + 0.06 * Math.sin(t * 2.5);
      this.title.text = p.out ? 'KNOCKED OUT' : 'YOU ARE DOWN';
      const cx = Math.floor(viewW / 2);
      const y = Math.floor(viewH * 0.38);
      this.title.position.set(cx - Math.floor(this.title.textWidth / 2), y);
      const frac = reviveFraction(p.reviveProgress);
      this.sub.text = p.out ? "You'll be back next district" : frac > 0 ? 'Being revived...' : 'A teammate can revive you';
      this.sub.position.set(cx - Math.floor(this.sub.textWidth / 2), y + 18);
      this.bar.visible = !p.out && frac > 0;
      this.bar.set(cx - 30, y + 29, 60, 5, Math.round(58 * frac), frac);
      this.bar.tick(dt);
    }
    this.updateNotices(world, me, dt, viewW, noticeTop);
  }

  private updateNotices(world: World, me: number, dt: number, viewW: number, top: number): void {
    const downed: PlayerState[] = world.players.filter((q) => q.index !== me && q.downed && !q.out);
    while (this.notices.length < downed.length) {
      const n = { text: new PixelText('', { color: UI.bad }), bar: new Bar(UI.good) };
      this.notices.push(n);
      this.noticeLayer.addChild(n.text, n.bar);
    }
    const cx = Math.floor(viewW / 2);
    this.notices.forEach((n, i) => {
      const q = downed[i];
      n.text.visible = n.bar.visible = !!q;
      if (!q) return;
      const y = top + i * 16;
      n.text.text = `${fitText(q.name, 60)} is down! Hold F to revive`;
      n.text.position.set(cx - Math.floor(n.text.textWidth / 2), y);
      const frac = reviveFraction(q.reviveProgress);
      n.bar.visible = frac > 0;
      n.bar.set(cx - 25, y + 9, 50, 4, Math.round(48 * frac), frac);
      n.bar.tick(dt);
    });
  }
}

/** Run-over panel chrome: title + subtitle above the rows, prompt below (px). */
const RUN_ROW_H = 9;
const RUN_PANEL_EXTRA = 30 + 18;

/**
 * Rows per column for the two-column run summary: balanced, but never taller than the view
 * (rows past 2 × perCol are left out rather than drawn off-screen).
 */
export function runSummaryRowsPerCol(rows: number, viewH: number): number {
  const fit = Math.max(1, Math.floor((viewH - 4 - RUN_PANEL_EXTRA) / RUN_ROW_H));
  return Math.max(1, Math.min(Math.ceil(rows / 2), fit));
}

/** End-of-run summary panel ("Press R to restart" — the game wires the restart). */
export class RunOverScreen extends Container {
  private dim = solid(0x000000, 0, 0, 1, 1, 0.62);
  private bg = new Graphics();
  private title = new BigText('', UI.bad);
  private subtitle = new PixelText('', { color: UI.textDim });
  private rows: { label: PixelText; value: PixelText }[] = [];
  private prompt = new PixelText('Press R to restart', { color: UI.gold });
  private data: [string, string][] = [];
  private victory = false;
  private key = '';

  constructor() {
    super();
    this.addChild(this.dim, this.bg, this.title, this.subtitle, this.prompt);
    this.visible = false;
  }

  show(victory: boolean, name: string, rows: [string, string][]): void {
    this.victory = victory;
    this.data = rows;
    this.title.text = victory ? 'VICTORY!' : 'RUN OVER';
    this.title.color = victory ? UI.gold : UI.bad;
    this.subtitle.text = victory ? `${name} destroyed the Blightwall!` : `${name} has fallen`;
    for (const r of this.rows) {
      r.label.destroy();
      r.value.destroy();
    }
    this.rows = rows.map(([l, v]) => {
      const row = { label: new PixelText(l, { color: UI.textDim }), value: new PixelText(v) };
      this.addChild(row.label, row.value);
      return row;
    });
    this.key = '';
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  get shown(): boolean {
    return this.visible;
  }

  update(t: number, viewW: number, viewH: number): void {
    if (!this.visible) return;
    this.dim.width = viewW;
    this.dim.height = viewH;
    const perCol = runSummaryRowsPerCol(this.rows.length, viewH);
    const gap = 13;
    const w = Math.min(viewW - 6, 236);
    const cw = Math.floor((w - 10 - gap) / 2);
    const h = RUN_PANEL_EXTRA + perCol * RUN_ROW_H;
    const x = Math.floor((viewW - w) / 2);
    const y = Math.max(2, Math.floor((viewH - h) / 2));
    const key = `${viewW}x${viewH}|${this.data.length}|${this.victory}`;
    if (key !== this.key) {
      this.key = key;
      const g = this.bg;
      g.clear();
      panel(g, { x, y, w, h }, 0.95);
      frame(g, x - 1, y - 1, w + 2, h + 2, this.victory ? UI.gold : UI.downed, 0.8);
      // Column divider.
      g.rect(x + 5 + cw + Math.floor(gap / 2), y + 31, 1, perCol * RUN_ROW_H - 2).fill({ color: UI.panelBorder });
      this.title.position.set(x + Math.floor((w - this.title.textWidth) / 2), y + 4);
      this.subtitle.position.set(x + Math.floor((w - this.subtitle.textWidth) / 2), y + 20);
      this.rows.forEach((r, i) => {
        const col = Math.floor(i / perCol);
        r.label.visible = r.value.visible = col < 2;
        const ry = y + 31 + (i % perCol) * RUN_ROW_H;
        const rx = x + 5 + col * (cw + gap);
        r.label.position.set(rx, ry);
        r.value.position.set(rx + cw - r.value.textWidth, ry);
      });
      this.prompt.position.set(x + Math.floor((w - this.prompt.textWidth) / 2), y + h - 12);
    }
    this.prompt.alpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.5));
  }
}
