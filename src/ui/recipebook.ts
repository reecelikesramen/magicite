import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { PixelText } from '../render/pixelfont';
import { type RecipeEntry, fitText, recipeLine } from './format';
import { hudIcon, itemIcon } from './icons';
import type { BookLayout } from './layout';
import { UI } from './theme';
import { frame, panel } from './widgets';

interface Row {
  /** Result icon. */
  c: Sprite;
  /** "A + B = C" line. */
  name: PixelText;
  hl: Graphics;
}

/** Text column x offset (after the result icon) inside a recipe row. */
const TEXT_X = 13;

export function pageCount(entries: number, perPage: number): number {
  return Math.max(1, Math.ceil(entries / Math.max(1, perPage)));
}

/** Clamp a page index after the entry count or page size changed. */
export function clampPage(page: number, entries: number, perPage: number): number {
  return Math.max(0, Math.min(pageCount(entries, perPage) - 1, page));
}

/** Known recipes as "[icon] A + B = C", paged. Opened by the lightbulb button. */
export class RecipeBook extends Container {
  page = 0;
  private bg = new Graphics();
  private title = new PixelText('', { color: UI.gold });
  private pageText = new PixelText('');
  private prev = new PixelText('<');
  private next = new PixelText('>');
  private close = new PixelText('x', { color: UI.textDim });
  private empty = new PixelText('', { color: UI.textMuted });
  private bulb = new Sprite(hudIcon('bulb'));
  private rows: Row[] = [];
  private L: BookLayout | null = null;
  private key = '';
  /** Entries the rows were last built from (a new list with the same length must still rebuild). */
  private shown: readonly RecipeEntry[] | null = null;

  constructor() {
    super();
    this.addChild(this.bg, this.bulb, this.title, this.pageText, this.prev, this.next, this.close, this.empty);
    this.visible = false;
  }

  layout(L: BookLayout): void {
    this.L = L;
    const g = this.bg;
    g.clear();
    panel(g, L.panel);
    g.rect(L.panel.x + 2, L.rowsY - 2, L.panel.w - 4, 1).fill({ color: UI.panelBorder });
    this.bulb.position.set(L.title.x, L.title.y - 1);
    this.title.position.set(L.title.x + 10, L.title.y);
    this.prev.position.set(L.prev.x + 2, L.prev.y + 1);
    this.next.position.set(L.next.x + 2, L.next.y + 1);
    this.close.position.set(L.close.x + 3, L.close.y + 1);
    this.empty.position.set(L.panel.x + 6, L.rowsY + 4);
    for (const r of this.rows) for (const o of [r.c, r.name, r.hl]) o.destroy();
    this.rows = [];
    for (let i = 0; i < L.rowsPerPage; i++) {
      const y = L.rowsY + i * L.rowH;
      const x = L.panel.x + 4;
      const row: Row = {
        hl: new Graphics().rect(L.panel.x + 2, y - 1, L.panel.w - 4, L.rowH).fill({ color: 0xffffff, alpha: 0.07 }),
        c: new Sprite(Texture.EMPTY),
        name: new PixelText(''),
      };
      row.c.position.set(x, y);
      row.name.position.set(x + TEXT_X, y + 1);
      this.addChild(row.hl, row.c, row.name);
      this.rows.push(row);
    }
    this.key = '';
  }

  update(entries: readonly RecipeEntry[], hoverRow: number, hoverBtn: string): void {
    const L = this.L;
    if (!L) return;
    this.page = clampPage(this.page, entries.length, L.rowsPerPage);
    const pages = pageCount(entries.length, L.rowsPerPage);
    const key = `${this.page}|${entries.length}`;
    if (key !== this.key || entries !== this.shown) {
      this.key = key;
      this.shown = entries;
      this.title.text = `Recipes (${entries.length})`;
      this.pageText.text = `${this.page + 1}/${pages}`;
      this.pageText.position.set(L.pageText.x - Math.floor(this.pageText.textWidth / 2), L.pageText.y);
      this.empty.text = entries.length ? '' : 'None yet. Try Wood + Wood!';
      const nameW = L.panel.w - 4 - TEXT_X - 4;
      this.rows.forEach((row, i) => {
        const e = entries[this.page * L.rowsPerPage + i];
        row.c.visible = row.name.visible = !!e;
        if (!e) return;
        row.c.texture = e.result === '?' ? Texture.EMPTY : itemIcon(e.result);
        row.name.text = fitText(recipeLine(e), nameW);
        row.name.color = e.station ? UI.warn : UI.text;
      });
    }
    this.rows.forEach((row, i) => (row.hl.visible = i === hoverRow && !!entries[this.page * L.rowsPerPage + i]));
    this.prev.alpha = this.page > 0 ? 1 : 0.3;
    this.next.alpha = this.page < pages - 1 ? 1 : 0.3;
    this.prev.color = hoverBtn === 'bookPrev' ? UI.gold : UI.text;
    this.next.color = hoverBtn === 'bookNext' ? UI.gold : UI.text;
    this.close.color = hoverBtn === 'bookClose' ? UI.bad : UI.textDim;
  }

  /** Recipe under a row index on the current page (for tooltips). */
  entryAt(entries: readonly RecipeEntry[], row: number): RecipeEntry | undefined {
    return this.L ? entries[this.page * this.L.rowsPerPage + row] : undefined;
  }

  frameRect(g: Graphics): void {
    if (this.L) frame(g, this.L.panel.x, this.L.panel.y, this.L.panel.w, this.L.panel.h, UI.gold, 0.5);
  }
}
