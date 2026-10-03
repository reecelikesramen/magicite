/**
 * Small Pixi building blocks for the pixel-perfect UI. Everything is positioned in native px
 * inside the HUD root (which the Hud scales by the renderer's integer scale).
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { ItemStack } from '../sim/types';
import type { Rect } from './layout';
import { ICON, SLOT } from './layout';
import { countLabel, MINI_H, MiniText } from './minifont';
import { itemIcon } from './icons';
import { UI, mix } from './theme';

/** A solid-colour rectangle sprite (1×1 white texture, scaled). Cheap to move/resize per frame. */
export function solid(color: number, x = 0, y = 0, w = 1, h = 1, alpha = 1): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.tint = color;
  s.alpha = alpha;
  s.position.set(x, y);
  s.width = w;
  s.height = h;
  return s;
}

export function setRect(s: Sprite, x: number, y: number, w: number, h: number): void {
  s.position.set(x, y);
  s.width = Math.max(0, w);
  s.height = Math.max(0, h);
  s.visible = w > 0 && h > 0;
}

/** 1 px frame made of four filled rects (strokes would straddle pixel edges). */
export function frame(g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1): Graphics {
  g.rect(x, y, w, 1).fill({ color, alpha });
  g.rect(x, y + h - 1, w, 1).fill({ color, alpha });
  g.rect(x, y + 1, 1, h - 2).fill({ color, alpha });
  g.rect(x + w - 1, y + 1, 1, h - 2).fill({ color, alpha });
  return g;
}

/** Translucent brown panel with a dark outer edge and a lighter inner bevel. */
export function panel(g: Graphics, r: Rect, alpha: number = UI.panelAlpha, bg: number = UI.panel): Graphics {
  g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).fill({ color: bg, alpha });
  frame(g, r.x, r.y, r.w, r.h, UI.panelEdge, Math.min(1, alpha + 0.1));
  frame(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, UI.panelBorder, alpha * 0.9);
  return g;
}

/**
 * Horizontal meter bar (frame + empty + fill), right- or left-anchored. Width can change with
 * the meter's max; `flash` briefly whitens the fill when the value drops.
 */
export class Bar extends Container {
  private bg = solid(UI.barFrame);
  private empty = solid(UI.barEmpty);
  private fill = solid(0xffffff);
  private hi = solid(0xffffff, 0, 0, 1, 1, 0.35);
  private flashT = 0;
  private last = -1;
  private key = '';

  constructor(
    private color: number,
    private emptyColor: number = UI.barEmpty,
  ) {
    super();
    this.empty.tint = emptyColor;
    this.addChild(this.bg, this.empty, this.fill, this.hi);
  }

  /** Position by left edge. `fillW` = filled inner px (0..w-2). */
  set(x: number, y: number, w: number, h: number, fillW: number, value: number): void {
    if (value < this.last) this.flashT = 0.25;
    this.last = value;
    const key = `${x},${y},${w},${h},${fillW}`;
    if (key === this.key) return;
    this.key = key;
    setRect(this.bg, x, y, w, h);
    setRect(this.empty, x + 1, y + 1, w - 2, h - 2);
    this.empty.tint = this.emptyColor;
    setRect(this.fill, x + 1, y + 1, fillW, h - 2);
    setRect(this.hi, x + 1, y + 1, fillW, 1);
  }

  tick(dt: number): void {
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    this.fill.tint = this.flashT > 0 ? mix(this.color, 0xffffff, Math.min(1, this.flashT * 4)) : this.color;
  }
}

export interface SlotFlags {
  hover?: boolean;
  selected?: boolean;
  craftPick?: boolean;
  held?: boolean;
  invalid?: boolean;
}

/**
 * One 14×14 item slot: translucent background, icon, stack count (tiny digits, bottom-right),
 * durability strip, optional ghost silhouette and highlight borders.
 */
export class SlotView extends Container {
  private bg = new Graphics();
  private ghost = new Sprite(Texture.EMPTY);
  private icon = new Sprite(Texture.EMPTY);
  private count = new MiniText('');
  private durBg = solid(0x000000, 2, SLOT - 3, ICON, 1);
  private dur = solid(UI.good, 2, SLOT - 3, ICON, 1);
  private border = new Graphics();
  private itemKey = '';
  private flagKey = '';
  /** Pulse phase for the craft-pick border. */
  pulse = 0;

  constructor(r: Rect, ghost?: Texture) {
    super();
    this.position.set(r.x, r.y);
    if (ghost) {
      this.ghost.texture = ghost;
      this.ghost.tint = UI.ghost;
      this.ghost.alpha = 0.55;
      this.ghost.position.set(2, 2);
    }
    this.icon.position.set(2, 2);
    this.durBg.visible = this.dur.visible = false;
    this.addChild(this.bg, this.ghost, this.icon, this.durBg, this.dur, this.count, this.border);
    this.drawBg({});
  }

  /** Update the shown stack; `durFrac` = 0..1 or null when the item has no durability. */
  setItem(stack: ItemStack | null, durFrac: number | null): void {
    const key = stack ? `${stack.id}|${stack.count}|${durFrac === null ? '' : Math.round(durFrac * 10)}` : '';
    if (key === this.itemKey) return;
    this.itemKey = key;
    if (!stack) {
      this.icon.visible = false;
      this.count.text = '';
      this.ghost.visible = this.ghost.texture !== Texture.EMPTY;
      this.durBg.visible = this.dur.visible = false;
      return;
    }
    this.icon.texture = itemIcon(stack.id);
    this.icon.width = ICON;
    this.icon.height = ICON;
    this.icon.visible = true;
    this.ghost.visible = false;
    this.count.text = stack.count > 1 ? countLabel(stack.count) : '';
    this.count.position.set(SLOT - 1 - this.count.textWidth - 1, SLOT - MINI_H - 1);
    const showDur = durFrac !== null && durFrac < 1;
    this.durBg.visible = this.dur.visible = showDur;
    if (showDur) {
      this.dur.width = Math.max(1, Math.round(ICON * durFrac!));
      this.dur.tint = durFrac! > 0.5 ? UI.good : durFrac! > 0.25 ? UI.stamina : UI.bad;
    }
  }

  setFlags(f: SlotFlags): void {
    const key = `${f.hover ? 1 : 0}${f.selected ? 1 : 0}${f.craftPick ? 1 : 0}${f.held ? 1 : 0}${f.invalid ? 1 : 0}`;
    if (key !== this.flagKey) {
      this.flagKey = key;
      this.drawBg(f);
      this.icon.alpha = f.held ? 0.35 : 1;
    }
    if (f.craftPick) this.border.alpha = 0.6 + 0.4 * Math.abs(Math.sin(this.pulse * 6));
    else this.border.alpha = 1;
  }

  private drawBg(f: SlotFlags): void {
    const g = this.bg;
    g.clear();
    g.rect(1, 1, SLOT - 2, SLOT - 2).fill({ color: f.hover ? UI.slotHover : UI.slot, alpha: UI.slotAlpha });
    frame(g, 0, 0, SLOT, SLOT, UI.slotEdge, 0.9);
    const b = this.border;
    b.clear();
    if (f.craftPick) frame(b, 0, 0, SLOT, SLOT, UI.craftPick).rect(1, 1, SLOT - 2, 1).fill({ color: UI.craftPick, alpha: 0.5 });
    else if (f.invalid) frame(b, 0, 0, SLOT, SLOT, UI.bad);
    else if (f.selected) frame(b, 0, 0, SLOT, SLOT, UI.slotSelected);
    else if (f.held) frame(b, 0, 0, SLOT, SLOT, UI.held, 0.7);
  }
}

/** A small square button with an icon (recipe book, sort). */
export class IconButton extends Container {
  private bg = new Graphics();
  private hoverKey = -1;
  private bw: number;
  private bh: number;

  constructor(
    r: Rect,
    private color: number,
    icon: Texture,
  ) {
    super();
    this.position.set(r.x, r.y);
    const ic = new Sprite(icon);
    ic.position.set(Math.floor((r.w - icon.width) / 2), Math.floor((r.h - icon.height) / 2));
    this.addChild(this.bg, ic);
    this.bw = r.w;
    this.bh = r.h;
    this.setHover(false, false);
  }

  setHover(hover: boolean, active: boolean): void {
    const k = (hover ? 1 : 0) + (active ? 2 : 0);
    if (k === this.hoverKey) return;
    this.hoverKey = k;
    const g = this.bg;
    g.clear();
    const c = hover || active ? mix(this.color, 0xffffff, 0.25) : this.color;
    g.rect(0, 0, this.bw, this.bh).fill({ color: 0x120d08 });
    g.rect(1, 1, this.bw - 2, this.bh - 2).fill({ color: c });
    g.rect(1, this.bh - 2, this.bw - 2, 1).fill({ color: mix(c, 0x000000, 0.35) });
    g.rect(1, 1, this.bw - 2, 1).fill({ color: mix(c, 0xffffff, 0.35) });
    if (active) frame(g, 0, 0, this.bw, this.bh, 0xffffff);
  }
}
