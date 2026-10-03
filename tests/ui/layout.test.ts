import { describe, expect, it } from 'vitest';
import { type Rect, rectsOverlap } from '../../src/engine/math';
import { GLYPH_H, measureText } from '../../src/render/pixelfont';
import { BACKPACK_SIZE, HOTBAR_SIZE } from '../../src/sim/constants';
import {
  BACKPACK_COLS,
  BOOK_MAX_ROWS,
  EQUIP_LEFT,
  EQUIP_RIGHT,
  EQUIP_SLOTS,
  MARGIN,
  METER_IDS,
  SLOT,
  SLOT_GAP,
  XP_BAR_H,
  fillPx,
  hitTestButtons,
  hitTestInventory,
  hudLayout,
  inventoryLayout,
  invRect,
  meterBarWidth,
  navNeighbor,
  navTargets,
  placeBelow,
  placeTooltip,
  skillPanelLayout,
  targetRect,
} from '../../src/ui/layout';

const inside = (r: Rect, outer: Rect) => r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;
const centre = (r: Rect) => [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)] as const;
const VIEWS: [number, number][] = [
  [320, 180],
  [341, 192],
  [400, 300],
  [480, 270],
];

describe('HUD layout', () => {
  const L = hudLayout(320, 180, measureText('Lv.1'));

  it('puts Lv, XP bar and gold on the top row, left to right', () => {
    expect(L.lv.x).toBe(MARGIN);
    expect(L.xpBar.x).toBeGreaterThan(L.lv.x + measureText('Lv.1'));
    expect(L.coin.x).toBeGreaterThanOrEqual(L.xpBar.x + L.xpBar.w);
    expect(L.gold.x).toBeGreaterThan(L.coin.x);
  });

  it('XP bar is tall enough to hold the centred cur/max text and its shadow', () => {
    expect(XP_BAR_H).toBeGreaterThanOrEqual(GLYPH_H + 2);
    expect(L.xpBar.y + L.xpBar.h).toBeLessThan(L.hotbar[0]!.y);
  });

  it('has a 5-slot hotbar of 14 px slots with 2 px gaps under the top row', () => {
    expect(L.hotbar).toHaveLength(HOTBAR_SIZE);
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const r = L.hotbar[i]!;
      expect(r.w).toBe(SLOT);
      expect(r.h).toBe(SLOT);
      if (i > 0) expect(r.x - (L.hotbar[i - 1]!.x + SLOT)).toBe(SLOT_GAP);
    }
  });

  it('places Z/X/C skill slots right of the hotbar with key labels underneath', () => {
    const last = L.hotbar[HOTBAR_SIZE - 1]!;
    expect(L.skillBar).toHaveLength(3);
    expect(L.skillBar[0]!.x).toBeGreaterThan(last.x + last.w);
    L.skillBar.forEach((r, i) => {
      expect(L.skillKeys[i]!.y).toBeGreaterThanOrEqual(r.y + r.h);
      expect(L.skillKeys[i]!.cx).toBe(r.x + r.w / 2);
    });
    // The co-op party list starts below the key labels.
    expect(L.party.y).toBeGreaterThanOrEqual(L.skillKeys[0]!.y + GLYPH_H);
  });

  it('lays out two columns of meters top-right: HP over Mana, Hunger over Stamina', () => {
    const m = L.meters;
    expect(m.hunger.icon.x).toBeGreaterThan(m.hp.icon.x);
    expect(m.stamina.icon.x).toBe(m.hunger.icon.x);
    expect(m.mana.icon.x).toBe(m.hp.icon.x);
    expect(m.mana.textY).toBeGreaterThan(m.hp.barY);
    expect(m.stamina.textY).toBeGreaterThan(m.hunger.barY);
    for (const id of METER_IDS) {
      expect(m[id].icon.x + 7).toBeLessThanOrEqual(320 - MARGIN);
      // cur/max text sits above its bar.
      expect(m[id].textY + GLYPH_H).toBeLessThanOrEqual(m[id].barY);
    }
    // District caption sits under the meters.
    expect(L.district.y).toBeGreaterThan(m.mana.barY + m.mana.barH);
    expect(L.skillPanel.y).toBeGreaterThan(L.district.y);
  });

  it('meter bars grow with max within bounds', () => {
    expect(meterBarWidth(2)).toBeLessThan(meterBarWidth(9));
    expect(meterBarWidth(0)).toBeGreaterThan(0);
    expect(meterBarWidth(1000)).toBeLessThanOrEqual(32);
  });

  it('fillPx never shows empty for cur > 0 or full for cur < max', () => {
    expect(fillPx(0, 8, 20)).toBe(0);
    expect(fillPx(8, 8, 20)).toBe(20);
    expect(fillPx(9, 8, 20)).toBe(20);
    expect(fillPx(0.01, 8, 20)).toBe(1);
    expect(fillPx(7.99, 8, 20)).toBe(19);
    expect(fillPx(4, 8, 20)).toBe(10);
    expect(fillPx(3, 0, 20)).toBe(0);
  });
});

describe('inventory layout', () => {
  for (const [w, h] of VIEWS) {
    it(`fits a ${w}x${h} view without overlapping slots`, () => {
      const L = inventoryLayout(w, h);
      const all: Rect[] = [...L.hotbar, ...L.backpack, ...EQUIP_SLOTS.map((s) => L.equip[s]), L.card, L.buttons.recipes, L.buttons.sort];
      expect(L.hotbar).toHaveLength(HOTBAR_SIZE);
      expect(L.backpack).toHaveLength(BACKPACK_SIZE);
      for (const r of all) expect(inside(r, L.panel)).toBe(true);
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(rectsOverlap(all[i]!, all[j]!)).toBe(false);
      expect(inside(L.panel, { x: 0, y: 0, w, h })).toBe(true);
      expect(inside(L.book.panel, { x: 0, y: 0, w, h })).toBe(true);
      expect(L.book.rowsPerPage).toBeGreaterThanOrEqual(1);
      expect(L.book.rowsPerPage).toBeLessThanOrEqual(BOOK_MAX_ROWS);
      expect(L.book.rowsY + L.book.rowsPerPage * L.book.rowH).toBeLessThanOrEqual(L.book.prev.y);
      expect(L.tip.y + GLYPH_H).toBeLessThanOrEqual(h);
      expect(L.feedback.y).toBeGreaterThanOrEqual(L.panel.y + L.panel.h);
    });
  }

  it('arranges the backpack as 5 columns x 3 rows and the equipment in two columns around the card', () => {
    const L = inventoryLayout(320, 180);
    expect(BACKPACK_COLS).toBe(5);
    expect(new Set(L.backpack.map((r) => r.y)).size).toBe(3);
    for (const s of EQUIP_LEFT) expect(L.equip[s].x + L.equip[s].w).toBeLessThanOrEqual(L.card.x);
    for (const s of EQUIP_RIGHT) expect(L.equip[s].x).toBeGreaterThanOrEqual(L.card.x + L.card.w);
    expect(L.equip.head.y).toBeLessThan(L.equip.body.y);
    expect(L.equip.ammo.y).toBe(L.equip.head.y);
    // Hotbar row above the card, backpack below.
    expect(L.hotbar[0]!.y + SLOT).toBeLessThanOrEqual(L.card.y);
    expect(L.backpack[0]!.y).toBeGreaterThanOrEqual(L.card.y + L.card.h);
  });

  it('hit-tests every slot, the buttons, the panel background and the outside', () => {
    const L = inventoryLayout(320, 180);
    for (let i = 0; i < HOTBAR_SIZE + BACKPACK_SIZE; i++) {
      const [x, y] = centre(invRect(L, i));
      expect(hitTestInventory(L, x, y, false)).toEqual({ kind: 'inv', index: i });
    }
    for (const s of EQUIP_SLOTS) {
      const [x, y] = centre(L.equip[s]);
      expect(hitTestInventory(L, x, y, false)).toEqual({ kind: 'equip', slot: s });
    }
    expect(hitTestInventory(L, ...centre(L.buttons.recipes), false)).toEqual({ kind: 'button', id: 'recipes' });
    expect(hitTestInventory(L, ...centre(L.buttons.sort), false)).toEqual({ kind: 'button', id: 'sort' });
    expect(hitTestInventory(L, ...centre(L.card), false)).toEqual({ kind: 'panel' });
    expect(hitTestInventory(L, 300, 170, false)).toEqual({ kind: 'outside' });
    // Slot edges: the 2 px gap between slots is panel, not a slot.
    const r0 = L.hotbar[0]!;
    expect(hitTestInventory(L, r0.x + r0.w, r0.y + 3, false)).toEqual({ kind: 'panel' });
  });

  it('hit-tests the recipe book only while it is open', () => {
    const L = inventoryLayout(320, 180);
    const B = L.book;
    const rowY = B.rowsY + B.rowH + 2;
    const x = B.panel.x + 20;
    expect(hitTestInventory(L, x, rowY, true)).toEqual({ kind: 'book', row: 1 });
    expect(hitTestInventory(L, x, rowY, false)).toEqual({ kind: 'outside' });
    expect(hitTestInventory(L, ...centre(B.close), true)).toEqual({ kind: 'button', id: 'bookClose' });
    expect(hitTestInventory(L, ...centre(B.prev), true)).toEqual({ kind: 'button', id: 'bookPrev' });
    expect(hitTestInventory(L, ...centre(B.next), true)).toEqual({ kind: 'button', id: 'bookNext' });
  });
});

describe('gamepad navigation', () => {
  const L = inventoryLayout(320, 180);
  const targets = navTargets();
  const rects = targets.map((t) => targetRect(L, t)!);
  const idx = (pred: (t: (typeof targets)[number]) => boolean) => targets.findIndex(pred);
  const inv = (i: number) => idx((t) => t.kind === 'inv' && t.index === i);
  const eq = (s: string) => idx((t) => t.kind === 'equip' && t.slot === s);

  it('every target has a rect', () => {
    expect(rects.every((r) => !!r)).toBe(true);
    expect(targets).toHaveLength(HOTBAR_SIZE + BACKPACK_SIZE + EQUIP_SLOTS.length + 2);
  });

  it('moves along rows and columns and stops at edges', () => {
    expect(navNeighbor(rects, inv(0), 1, 0)).toBe(inv(1));
    expect(navNeighbor(rects, inv(1), -1, 0)).toBe(inv(0));
    expect(navNeighbor(rects, inv(0), -1, 0)).toBe(inv(0));
    expect(navNeighbor(rects, inv(0), 0, -1)).toBe(inv(0));
    expect(navNeighbor(rects, inv(0), 0, 1)).toBe(eq('head'));
    expect(navNeighbor(rects, eq('head'), 0, 1)).toBe(eq('body'));
    expect(navNeighbor(rects, inv(HOTBAR_SIZE), 1, 0)).toBe(inv(HOTBAR_SIZE + 1));
    expect(navNeighbor(rects, inv(HOTBAR_SIZE), 0, 1)).toBe(inv(HOTBAR_SIZE + BACKPACK_COLS));
    const last = HOTBAR_SIZE + BACKPACK_SIZE - 1;
    expect(navNeighbor(rects, inv(last), 0, 1)).toBe(inv(last));
  });
});

describe('tooltip placement', () => {
  it('prefers below-right of the anchor', () => {
    expect(placeTooltip(10, 10, 50, 20, 320, 180)).toEqual({ x: 16, y: 16 });
  });

  it('flips and clamps to stay inside the view', () => {
    const p = placeTooltip(300, 170, 60, 30, 320, 180);
    expect(p.x + 60).toBeLessThanOrEqual(319);
    expect(p.y + 30).toBeLessThanOrEqual(179);
    expect(p.x).toBeLessThan(300);
    const big = placeTooltip(5, 5, 400, 300, 320, 180);
    expect(big.x).toBeGreaterThanOrEqual(1);
    expect(big.y).toBeGreaterThanOrEqual(1);
  });

  it('placeBelow right-aligns under an anchor and clamps', () => {
    expect(placeBelow(317, 96, 60, 30, 320, 180)).toEqual({ x: 257, y: 96 });
    expect(placeBelow(317, 170, 60, 30, 320, 180).y).toBe(149);
    expect(placeBelow(20, 10, 60, 30, 320, 180).x).toBe(1);
  });
});

describe('skill panel layout', () => {
  it('centres the buttons inside the panel, anchored to the right edge', () => {
    const L = skillPanelLayout(317, 48, 3);
    expect(L.panel.x + L.panel.w).toBe(317);
    expect(L.buttons).toHaveLength(3);
    for (const b of L.buttons) expect(inside(b, L.panel)).toBe(true);
    const left = L.buttons[0]!.x - L.panel.x;
    const right = L.panel.x + L.panel.w - (L.buttons[2]!.x + L.buttons[2]!.w);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    expect(L.caption.y).toBeGreaterThan(L.buttons[0]!.y + L.buttons[0]!.h);
    expect(L.caption.y + GLYPH_H).toBeLessThanOrEqual(L.panel.y + L.panel.h);
  });

  it('hit-tests buttons', () => {
    const L = skillPanelLayout(317, 48, 3);
    L.buttons.forEach((b, i) => expect(hitTestButtons(L.buttons, ...centre(b))).toBe(i));
    expect(hitTestButtons(L.buttons, L.panel.x + 1, L.panel.y + 1)).toBe(-1);
  });

  it('handles fewer offers gracefully', () => {
    const L = skillPanelLayout(317, 48, 1);
    expect(L.buttons).toHaveLength(1);
    expect(inside(L.buttons[0]!, L.panel)).toBe(true);
  });
});
