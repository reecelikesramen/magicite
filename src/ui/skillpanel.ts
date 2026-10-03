import { Container, Graphics, Sprite } from 'pixi.js';
import { PixelText } from '../render/pixelfont';
import type { PlayerCommand, PlayerState } from '../sim/types';
import { type TipLine, fitText, skillInfo, wrapText } from './format';
import { skillGlyph } from './icons';
import { type SkillPanelLayout, skillPanelLayout } from './layout';
import { MiniText } from './minifont';
import { UI, mix } from './theme';
import { frame, panel } from './widgets';

/** Should the "Select Skill Path" panel be shown? */
export function skillPanelVisible(p: Pick<PlayerState, 'skillPicks' | 'skillOffer'>): boolean {
  return p.skillPicks > 0 && p.skillOffer.length > 0;
}

/** The command for choosing offer `index` ('path' carries the chosen skill id). */
export function chooseSkillCommand(p: Pick<PlayerState, 'skillOffer'>, index: number): PlayerCommand | null {
  const id = p.skillOffer[index];
  return id !== undefined ? { type: 'chooseSkill', path: id } : null;
}

/** Keyboard/gamepad focus movement across the offered buttons (wraps). */
export function moveFocus(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  const i = index < 0 ? (delta > 0 ? -1 : count) : index;
  return (((i + delta) % count) + count) % count;
}

export function skillTooltip(id: string, rank: number): TipLine[] {
  const s = skillInfo(id);
  const lines: TipLine[] = [
    { text: s.name, color: mix(s.color, 0xffffff, 0.35) },
    { text: `${s.pathName || 'Skill'}${rank > 0 ? ` - upgrade to rank ${rank + 1}` : ''}`, color: UI.textMuted },
  ];
  for (const l of wrapText(s.description, 110)) lines.push({ text: l, color: UI.textDim });
  if (s.cooldown > 0) lines.push({ text: `Cooldown ${s.cooldown}s`, color: UI.text });
  return lines;
}

interface Btn {
  g: Graphics;
  glyph: Sprite;
  rank: MiniText;
}

/** Top-right "Select Skill Path" panel: one button per offered skill, coloured by path. */
export class SkillPanel extends Container {
  L: SkillPanelLayout = skillPanelLayout(320, 46);
  private bg = new Graphics();
  private title = new PixelText('Select Skill Path', { color: UI.gold });
  private caption = new PixelText('');
  private btns: Btn[] = [];
  private anchorRight = 320;
  private anchorY = 46;
  private key = '';

  constructor() {
    super();
    this.addChild(this.bg, this.title, this.caption);
    this.visible = false;
  }

  layout(right: number, y: number): void {
    this.anchorRight = right;
    this.anchorY = y;
    this.key = '';
  }

  /** Returns true when visible. `hover`/`focus` = button index or -1. */
  update(p: PlayerState, hover: number, focus: number, keyboardFocus: boolean, t: number, allowed = true): boolean {
    this.visible = allowed && skillPanelVisible(p);
    if (!this.visible) return false;
    const offer = p.skillOffer;
    const key = `${offer.join(',')}|${p.skillPicks}|${this.anchorRight},${this.anchorY}|${hover}|${focus}|${keyboardFocus}`;
    if (key !== this.key) {
      this.key = key;
      const L = (this.L = skillPanelLayout(this.anchorRight, this.anchorY, offer.length));
      const g = this.bg;
      g.clear();
      panel(g, L.panel);
      if (keyboardFocus) frame(g, L.panel.x, L.panel.y, L.panel.w, L.panel.h, UI.gold, 0.8);
      this.title.text = p.skillPicks > 1 ? `Select Skill Path x${p.skillPicks}` : 'Select Skill Path';
      this.title.position.set(L.title.x - Math.floor(this.title.textWidth / 2), L.title.y);
      while (this.btns.length < offer.length) {
        const b: Btn = { g: new Graphics(), glyph: new Sprite(skillGlyph('unknown')), rank: new MiniText('') };
        this.addChild(b.g, b.glyph, b.rank);
        this.btns.push(b);
      }
      this.btns.forEach((b, i) => {
        const id = offer[i];
        const vis = id !== undefined;
        b.g.visible = b.glyph.visible = b.rank.visible = vis;
        if (id === undefined) return;
        const r = L.buttons[i]!;
        const info = skillInfo(id);
        const lit = i === hover || i === focus;
        const c = lit ? mix(info.color, 0xffffff, 0.25) : info.color;
        b.g.clear();
        b.g.rect(r.x, r.y, r.w, r.h).fill({ color: 0x120d08 });
        b.g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).fill({ color: c });
        b.g.rect(r.x + 1, r.y + 1, r.w - 2, 1).fill({ color: mix(c, 0xffffff, 0.4) });
        b.g.rect(r.x + 1, r.y + r.h - 2, r.w - 2, 1).fill({ color: mix(c, 0x000000, 0.4) });
        if (lit) frame(b.g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, 0xffffff);
        b.glyph.texture = skillGlyph(info.path || 'unknown');
        b.glyph.position.set(r.x + 5, r.y + 5);
        const rank = p.skills[id] ?? 0;
        b.rank.text = rank > 0 ? `+${rank + 1}` : '';
        b.rank.position.set(r.x + r.w - b.rank.textWidth - 2, r.y + r.h - 7);
      });
      const shown = hover >= 0 ? hover : focus;
      const sid = offer[shown];
      if (sid !== undefined) {
        const info = skillInfo(sid);
        this.caption.text = fitText(info.name, L.panel.w - 6);
        this.caption.color = mix(info.color, 0xffffff, 0.45);
      } else {
        this.caption.text = 'Pick one';
        this.caption.color = UI.textMuted;
      }
      this.caption.position.set(L.caption.cx - Math.floor(this.caption.textWidth / 2), L.caption.y);
    }
    // Gentle pulse on the title so a pending pick is noticed.
    this.title.alpha = 0.75 + 0.25 * Math.abs(Math.sin(t * 3));
    return true;
  }
}
