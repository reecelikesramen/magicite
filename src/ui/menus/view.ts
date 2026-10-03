import { Container, Graphics } from 'pixi.js';
import { measureText, PixelText } from '../../render/pixelfont';
import type { MenuModel } from './model';

/** Palette for menus (matches the HUD's warm-on-dark look). */
const C = {
  shade: 0x050403,
  panel: 0x16100b,
  border: 0x5a4430,
  text: 0xe8dcc0,
  dim: 0x8a7a62,
  focus: 0xffd070,
  value: 0x9fe0ff,
  title: 0xffc040,
  error: 0xff7060,
};

const ROW = 11;

/** Greedy word wrap to `maxW` px, at most `maxLines` lines (the last one ellipsised). */
function wrap(text: string, maxW: number, maxLines: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (measureText(next) <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = `${lines[maxLines - 1]}..`;
    while (last.length > 3 && measureText(last) > maxW) last = `${last.slice(0, -3)}..`;
    lines[maxLines - 1] = last;
  }
  return lines;
}
const PAD = 8;

/**
 * Renders a MenuModel at native pixel scale (put `root` on the stage; call layout() with the
 * renderer's integer scale). Pointer hit-testing works in screen pixels.
 */
export class MenuView {
  readonly root = new Container();
  private shade = new Graphics();
  private panel = new Graphics();
  private texts = new Container();
  private rows: { y: number; h: number; x: number; w: number }[] = [];
  private scale = 1;
  private viewW = 320;
  private viewH = 180;
  /** Big decorative title above the panel (title screen). */
  logo: string | null = null;
  /** Dim the game behind the menu (0..1). */
  shadeAlpha = 0.65;

  constructor() {
    this.root.addChild(this.shade, this.panel, this.texts);
  }

  layout(screenW: number, screenH: number, scale: number): void {
    this.scale = scale;
    this.viewW = screenW / scale;
    this.viewH = screenH / scale;
    this.root.scale.set(scale);
  }

  render(m: MenuModel, tick: number): void {
    for (const c of this.texts.removeChildren()) c.destroy();
    this.shade.clear().rect(0, 0, this.viewW, this.viewH).fill({ color: C.shade, alpha: this.shadeAlpha });
    const labelW = Math.max(40, ...m.items.map((i) => measureText(i.label)));
    const valueW = Math.max(0, ...m.items.map((i) => (i.value ? measureText(i.value) + (i.cycle ? 16 : 0) : 0)));
    const w = Math.min(this.viewW - 16, Math.max(120, labelW + (valueW ? valueW + 16 : 0) + PAD * 2, measureText(m.title) + PAD * 2, m.subtitle ? measureText(m.subtitle) + PAD * 2 : 0));
    const hasMsg = !!m.message;
    const hintLines = wrap(m.items[m.focus]?.hint ?? '', w - PAD * 2, 2);
    const h = PAD * 2 + 12 + (m.subtitle ? 10 : 0) + m.items.length * ROW + (hasMsg ? 12 : 0) + (hintLines.length ? 4 + hintLines.length * 9 : 0);
    let top = Math.round((this.viewH - h) / 2);
    if (this.logo) top = Math.max(top, 46);
    const left = Math.round((this.viewW - w) / 2);

    if (this.logo) {
      const logo = new PixelText(this.logo, { color: C.title, align: 'center' });
      logo.scale.set(3);
      logo.position.set(Math.round(this.viewW / 2 - (logo.textWidth * 3) / 2), Math.max(6, top - 34));
      this.texts.addChild(logo);
      // Twinkles around the logo.
      for (let i = 0; i < 6; i++) {
        const a = (tick * 0.03 + i * 1.7) % (Math.PI * 2);
        const s = new PixelText('*', { color: 0xfff0a0, shadow: false });
        s.alpha = 0.4 + 0.6 * Math.abs(Math.sin(a * 2));
        s.position.set(Math.round(this.viewW / 2 + Math.cos(a + i) * (logo.textWidth * 1.7)), Math.round(top - 22 + Math.sin(a * 1.3 + i) * 12));
        this.texts.addChild(s);
      }
    }

    this.panel.clear().rect(left, top, w, h).fill({ color: C.panel, alpha: 0.92 }).stroke({ color: C.border, width: 1 });
    let y = top + PAD;
    const title = new PixelText(m.title, { color: C.title, align: 'center' });
    title.position.set(Math.round(left + (w - title.textWidth) / 2), y);
    this.texts.addChild(title);
    y += 12;
    if (m.subtitle) {
      const sub = new PixelText(m.subtitle, { color: C.dim });
      sub.position.set(Math.round(left + (w - sub.textWidth) / 2), y);
      this.texts.addChild(sub);
      y += 10;
    }
    this.rows = [];
    m.items.forEach((it, i) => {
      const focused = i === m.focus;
      const color = it.disabled ? C.dim : focused ? C.focus : C.text;
      if (focused) this.panel.rect(left + 3, y - 2, w - 6, ROW).fill({ color: 0xffd070, alpha: 0.12 });
      const label = new PixelText((focused ? '> ' : '  ') + it.label, { color });
      label.position.set(left + PAD - 4, y);
      this.texts.addChild(label);
      if (it.value !== undefined) {
        const val = new PixelText(it.cycle ? `< ${it.value} >` : it.value, { color: it.disabled ? C.dim : C.value });
        val.position.set(left + w - PAD - val.textWidth, y);
        this.texts.addChild(val);
      }
      this.rows.push({ x: left, y: y - 2, w, h: ROW });
      y += ROW;
    });
    if (hintLines.length) {
      y += 2;
      for (const line of hintLines) {
        const t = new PixelText(line, { color: C.dim });
        t.position.set(Math.round(left + (w - t.textWidth) / 2), y);
        this.texts.addChild(t);
        y += 9;
      }
      y += 2;
    }
    if (m.message) {
      const t = new PixelText(m.message, { color: m.message.startsWith('!') ? C.error : C.value });
      if (m.message.startsWith('!')) t.text = m.message.slice(1);
      t.position.set(Math.round(left + (w - t.textWidth) / 2), y + 2);
      this.texts.addChild(t);
    }
  }

  /** Index of the item under a screen-space point, or -1. */
  hit(sx: number, sy: number): number {
    const x = sx / this.scale;
    const y = sy / this.scale;
    return this.rows.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  }

  /** True if the point is on the left/right third of a row (cycle by click). */
  side(sx: number, index: number): -1 | 0 | 1 {
    const r = this.rows[index];
    if (!r) return 0;
    const x = sx / this.scale;
    if (x > r.x + r.w * 0.75) return 1;
    if (x > r.x + r.w * 0.5) return -1;
    return 0;
  }
}
