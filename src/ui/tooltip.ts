import { Container, Graphics } from 'pixi.js';
import { GLYPH_H, PixelText, measureText } from '../render/pixelfont';
import type { TipLine } from './format';
import { placeTooltip } from './layout';
import { UI } from './theme';
import { frame } from './widgets';

const PITCH = GLYPH_H + 2;
const PAD = 3;

/** Floating tooltip box (item stats, skill descriptions). Rebuilds only when content changes. */
export class Tooltip extends Container {
  private bg = new Graphics();
  private texts: PixelText[] = [];
  private key = '';
  private w = 0;
  private h = 0;

  constructor() {
    super();
    this.addChild(this.bg);
    this.visible = false;
  }

  show(lines: readonly TipLine[], ax: number, ay: number, viewW: number, viewH: number, border: number = UI.panelBorder): void {
    const key = `${border}|${lines.map((l) => `${l.color}:${l.text}`).join('\n')}`;
    if (key !== this.key) {
      this.key = key;
      for (const t of this.texts) t.destroy();
      this.texts = [];
      this.w = 0;
      lines.forEach((l, i) => {
        const t = new PixelText(l.text, { color: l.color });
        t.position.set(PAD, PAD + i * PITCH);
        this.texts.push(t);
        this.addChild(t);
        this.w = Math.max(this.w, measureText(l.text));
      });
      this.w += PAD * 2 + 1;
      this.h = lines.length * PITCH + PAD * 2 - 1;
      const g = this.bg;
      g.clear();
      g.rect(0, 0, this.w, this.h).fill({ color: UI.tooltipBg, alpha: UI.tooltipAlpha });
      frame(g, 0, 0, this.w, this.h, border);
    }
    const p = placeTooltip(ax, ay, this.w, this.h, viewW, viewH);
    this.position.set(p.x, p.y);
    this.visible = lines.length > 0;
  }

  hide(): void {
    this.visible = false;
  }
}
