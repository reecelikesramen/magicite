/**
 * Pure UI geometry in native pixels (the HUD root is scaled by the renderer's integer scale).
 * Everything here is DOM/Pixi-free so it can be unit tested; views read these rects verbatim,
 * which keeps hit-testing and drawing in lock-step.
 */
import type { EquipSlot } from '../content/types';
import { type Rect, rectContains } from '../engine/math';
import { BACKPACK_SIZE, HOTBAR_SIZE } from '../sim/constants';
import type { SlotRef } from '../sim/types';

export type { Rect };

/** Item slot edge (px). Icons are ICON px, centred with a 2 px inset. */
export const SLOT = 14;
export const SLOT_GAP = 2;
export const SLOT_PITCH = SLOT + SLOT_GAP;
export const ICON = 10;
export const MARGIN = 3;
/** Small HUD glyph icons (heart, gem, drumstick, boot). */
export const GLYPH_ICON = 7;
export const BACKPACK_COLS = 5;
export const BACKPACK_ROWS = Math.ceil(BACKPACK_SIZE / BACKPACK_COLS);

export const EQUIP_SLOTS: readonly EquipSlot[] = ['head', 'body', 'accessory1', 'ammo', 'trinket', 'accessory2'];
/** Left column top→bottom, then right column top→bottom (matches the original screen). */
export const EQUIP_LEFT: readonly EquipSlot[] = ['head', 'body', 'accessory1'];
export const EQUIP_RIGHT: readonly EquipSlot[] = ['ammo', 'trinket', 'accessory2'];

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

// ---------------------------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------------------------

export type MeterId = 'hp' | 'mana' | 'hunger' | 'stamina';
export const METER_IDS: readonly MeterId[] = ['hp', 'mana', 'hunger', 'stamina'];

export interface MeterLayout {
  /** Right edge of the right-aligned "cur/max" text. */
  textRight: number;
  textY: number;
  /** Bar is right-aligned to `barRight`; its width depends on the meter's max (see meterBarWidth). */
  barRight: number;
  barY: number;
  barH: number;
  icon: { x: number; y: number };
}

export interface HudLayout {
  viewW: number;
  viewH: number;
  lv: { x: number; y: number };
  xpBar: Rect;
  coin: { x: number; y: number };
  gold: { x: number; y: number };
  hotbar: Rect[];
  skillBar: Rect[];
  meters: Record<MeterId, MeterLayout>;
  /** District caption, right-aligned under the meters. */
  district: { right: number; y: number };
  /** "Select Skill Path" panel anchor (top-right corner). */
  skillPanel: { right: number; y: number };
  /** Co-op party list (other players) under the hotbar. */
  party: { x: number; y: number };
  /** y of the lowest toast line (toasts stack upward, centred). */
  toastBottom: number;
  /** Pickup feed: right-aligned, stacking upward from `bottom`. */
  pickups: { right: number; bottom: number };
}

export const XP_BAR_W = 48;
export const XP_BAR_H = 5;
const METER_ROW_H = 17;
const METER_COL_W = 48;
const BAR_UNIT = 2;
const BAR_MIN = 8;
const BAR_MAX = 32;

/** Meter bars grow with their maximum (2 px per point, like the original's short bars). */
export function meterBarWidth(max: number): number {
  return Math.max(BAR_MIN, Math.min(BAR_MAX, 2 + Math.max(0, Math.round(max)) * BAR_UNIT));
}

/** Filled px of a bar `inner` px wide. Never shows empty for cur > 0 or full for cur < max. */
export function fillPx(cur: number, max: number, inner: number): number {
  if (max <= 0 || cur <= 0) return 0;
  if (cur >= max) return inner;
  return Math.max(1, Math.min(inner - 1, Math.round((inner * cur) / max)));
}

/** `lvTextW` = measured width of the "Lv.N" label (the XP bar follows it). */
export function hudLayout(viewW: number, viewH: number, lvTextW: number): HudLayout {
  const lv = { x: MARGIN, y: 2 };
  const xpBar = rect(lv.x + lvTextW + 4, 3, XP_BAR_W, XP_BAR_H);
  const coin = { x: xpBar.x + xpBar.w + 5, y: 3 };
  const gold = { x: coin.x + 7, y: 2 };
  const hotbar: Rect[] = [];
  for (let i = 0; i < HOTBAR_SIZE; i++) hotbar.push(rect(MARGIN + i * SLOT_PITCH, 12, SLOT, SLOT));
  const hbRight = hotbar[HOTBAR_SIZE - 1]!.x + SLOT;
  const skillBar: Rect[] = [];
  for (let i = 0; i < 3; i++) skillBar.push(rect(hbRight + 6 + i * SLOT_PITCH, 12, SLOT, SLOT));

  const meter = (col: number, row: number): MeterLayout => {
    const iconX = viewW - MARGIN - GLYPH_ICON - col * METER_COL_W;
    const rowY = 2 + row * METER_ROW_H;
    return { textRight: iconX - 1, textY: rowY, barRight: iconX - 1, barY: rowY + 9, barH: 5, icon: { x: iconX, y: rowY + 8 } };
  };
  return {
    viewW,
    viewH,
    lv,
    xpBar,
    coin,
    gold,
    hotbar,
    skillBar,
    // Left column: HP over MANA; right column: HUNGER over STAMINA.
    meters: { hp: meter(1, 0), mana: meter(1, 1), hunger: meter(0, 0), stamina: meter(0, 1) },
    district: { right: viewW - MARGIN, y: 2 + 2 * METER_ROW_H + 1 },
    skillPanel: { right: viewW - MARGIN, y: 2 + 2 * METER_ROW_H + 12 },
    party: { x: MARGIN, y: 30 },
    toastBottom: viewH - 14,
    pickups: { right: viewW - MARGIN, bottom: viewH - 13 },
  };
}

// ---------------------------------------------------------------------------------------------
// Inventory panel
// ---------------------------------------------------------------------------------------------

export type ButtonId = 'recipes' | 'sort' | 'bookPrev' | 'bookNext' | 'bookClose';

export interface InvLayout {
  panel: Rect;
  /** Inventory indices 0..HOTBAR_SIZE-1. */
  hotbar: Rect[];
  /** Inventory indices HOTBAR_SIZE.. */
  backpack: Rect[];
  equip: Record<EquipSlot, Rect>;
  card: Rect;
  buttons: Record<'recipes' | 'sort', Rect>;
  /** Craft feedback line (under the panel). */
  feedback: { x: number; y: number };
  /** "SHIFT + CLICK TWO ITEMS TO CRAFT" tip line (bottom-left). */
  tip: { x: number; y: number };
  book: BookLayout;
}

export interface BookLayout {
  panel: Rect;
  title: { x: number; y: number };
  rowsY: number;
  rowH: number;
  rowsPerPage: number;
  prev: Rect;
  next: Rect;
  close: Rect;
  pageText: { x: number; y: number };
}

const EQUIP_PITCH = 22;
const CARD_W = 64;

export function inventoryLayout(viewW: number, viewH: number): InvLayout {
  const x0 = MARGIN;
  const hotbar: Rect[] = [];
  for (let i = 0; i < HOTBAR_SIZE; i++) hotbar.push(rect(x0 + i * SLOT_PITCH, 12, SLOT, SLOT));
  const midY = 12 + SLOT + 5;
  const card = rect(x0 + SLOT + 3, midY, CARD_W, SLOT + 2 * EQUIP_PITCH);
  const rightX = card.x + card.w + 3;
  const equip = {} as Record<EquipSlot, Rect>;
  EQUIP_LEFT.forEach((s, i) => (equip[s] = rect(x0, midY + i * EQUIP_PITCH, SLOT, SLOT)));
  EQUIP_RIGHT.forEach((s, i) => (equip[s] = rect(rightX, midY + i * EQUIP_PITCH, SLOT, SLOT)));
  const btnX = rightX + SLOT + 4;
  const buttons = { recipes: rect(btnX, midY, 12, 12), sort: rect(btnX, midY + 16, 12, 12) };
  const packY = card.y + card.h + 5;
  const backpack: Rect[] = [];
  for (let i = 0; i < BACKPACK_SIZE; i++) {
    backpack.push(rect(x0 + (i % BACKPACK_COLS) * SLOT_PITCH, packY + Math.floor(i / BACKPACK_COLS) * SLOT_PITCH, SLOT, SLOT));
  }
  const bottom = packY + BACKPACK_ROWS * SLOT_PITCH - SLOT_GAP;
  const panel = rect(1, 10, btnX + 12 + 3 - 1, bottom + 3 - 10);
  // The recipe book sits right of the panel, below the top-right meters.
  const bookX = panel.x + panel.w + 3;
  const bookY = 2 + 2 * METER_ROW_H + 2;
  const bookW = Math.max(120, Math.min(176, viewW - bookX - MARGIN));
  const bookH = Math.max(60, viewH - bookY - 14);
  const rowsY = bookY + 13;
  const rowH = 12;
  const rowsPerPage = Math.max(1, Math.floor((bookY + bookH - 13 - rowsY) / rowH));
  const book: BookLayout = {
    panel: rect(bookX, bookY, bookW, bookH),
    title: { x: bookX + 4, y: bookY + 3 },
    rowsY,
    rowH,
    rowsPerPage,
    prev: rect(bookX + 3, bookY + bookH - 11, 9, 9),
    next: rect(bookX + bookW - 12, bookY + bookH - 11, 9, 9),
    close: rect(bookX + bookW - 11, bookY + 2, 9, 9),
    pageText: { x: bookX + Math.floor(bookW / 2), y: bookY + bookH - 10 },
  };
  return {
    panel,
    hotbar,
    backpack,
    equip,
    card,
    buttons,
    feedback: { x: MARGIN, y: panel.y + panel.h + 3 },
    tip: { x: MARGIN, y: viewH - 10 },
    book,
  };
}

/** What the pointer (or gamepad cursor) is over in the inventory screen. */
export type UiTarget =
  | { kind: 'inv'; index: number }
  | { kind: 'equip'; slot: EquipSlot }
  | { kind: 'button'; id: ButtonId }
  | { kind: 'book'; row: number }
  | { kind: 'panel' }
  | { kind: 'outside' };

/** Rect of an inventory index (hotbar or backpack). */
export function invRect(L: InvLayout, index: number): Rect {
  return index < HOTBAR_SIZE ? L.hotbar[index]! : L.backpack[index - HOTBAR_SIZE]!;
}

export function slotRefRect(L: InvLayout, ref: SlotRef): Rect {
  return ref.kind === 'inv' ? invRect(L, ref.index) : L.equip[ref.slot];
}

export function hitTestInventory(L: InvLayout, x: number, y: number, bookOpen: boolean): UiTarget {
  if (bookOpen && rectContains(L.book.panel, x, y)) {
    if (rectContains(L.book.close, x, y)) return { kind: 'button', id: 'bookClose' };
    if (rectContains(L.book.prev, x, y)) return { kind: 'button', id: 'bookPrev' };
    if (rectContains(L.book.next, x, y)) return { kind: 'button', id: 'bookNext' };
    const row = Math.floor((y - L.book.rowsY) / L.book.rowH);
    if (y >= L.book.rowsY && row >= 0 && row < L.book.rowsPerPage) return { kind: 'book', row };
    return { kind: 'panel' };
  }
  if (!rectContains(L.panel, x, y)) return { kind: 'outside' };
  for (let i = 0; i < L.hotbar.length; i++) if (rectContains(L.hotbar[i]!, x, y)) return { kind: 'inv', index: i };
  for (let i = 0; i < L.backpack.length; i++) if (rectContains(L.backpack[i]!, x, y)) return { kind: 'inv', index: HOTBAR_SIZE + i };
  for (const s of EQUIP_SLOTS) if (rectContains(L.equip[s], x, y)) return { kind: 'equip', slot: s };
  if (rectContains(L.buttons.recipes, x, y)) return { kind: 'button', id: 'recipes' };
  if (rectContains(L.buttons.sort, x, y)) return { kind: 'button', id: 'sort' };
  return { kind: 'panel' };
}

/** Rect under the gamepad cursor for a navigable target (slots and the two buttons). */
export function targetRect(L: InvLayout, t: UiTarget): Rect | null {
  switch (t.kind) {
    case 'inv':
      return invRect(L, t.index);
    case 'equip':
      return L.equip[t.slot];
    case 'button':
      return t.id === 'recipes' || t.id === 'sort' ? L.buttons[t.id] : null;
    default:
      return null;
  }
}

/** All gamepad-navigable targets in reading order. */
export function navTargets(): UiTarget[] {
  const out: UiTarget[] = [];
  for (let i = 0; i < HOTBAR_SIZE + BACKPACK_SIZE; i++) out.push({ kind: 'inv', index: i });
  for (const s of EQUIP_SLOTS) out.push({ kind: 'equip', slot: s });
  out.push({ kind: 'button', id: 'recipes' }, { kind: 'button', id: 'sort' });
  return out;
}

/**
 * Spatial navigation: the nearest rect whose centre lies in direction (dx, dy) from `rects[from]`.
 * Off-axis distance is penalised so moving "right" prefers the same row. Returns `from` if none.
 */
export function navNeighbor(rects: readonly Rect[], from: number, dx: number, dy: number): number {
  const a = rects[from];
  if (!a) return from;
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  let best = from;
  let bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === from) continue;
    const r = rects[i]!;
    const ox = r.x + r.w / 2 - ax;
    const oy = r.y + r.h / 2 - ay;
    const along = ox * dx + oy * dy;
    if (along <= 0.5) continue;
    const across = Math.abs(ox * dy - oy * dx);
    const score = along + across * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * Place a w×h tooltip near an anchor point, preferring below-right and flipping/clamping so it
 * stays inside the view.
 */
export function placeTooltip(ax: number, ay: number, w: number, h: number, viewW: number, viewH: number, offset = 6): { x: number; y: number } {
  let x = ax + offset;
  let y = ay + offset;
  if (x + w > viewW - 1) x = ax - offset - w;
  if (y + h > viewH - 1) y = ay - offset - h;
  x = Math.max(1, Math.min(viewW - w - 1, x));
  y = Math.max(1, Math.min(viewH - h - 1, y));
  return { x: Math.round(x), y: Math.round(y) };
}

// ---------------------------------------------------------------------------------------------
// Skill path panel
// ---------------------------------------------------------------------------------------------

export interface SkillPanelLayout {
  panel: Rect;
  title: { x: number; y: number };
  buttons: Rect[];
  /** Centre x / y of the focused skill's name line. */
  caption: { cx: number; y: number };
}

export const SKILL_PANEL_W = 92;
export const SKILL_BTN = 20;

export function skillPanelLayout(right: number, y: number, count = 3): SkillPanelLayout {
  const panel = rect(right - SKILL_PANEL_W, y, SKILL_PANEL_W, 47);
  const gap = 8;
  const total = count * SKILL_BTN + (count - 1) * gap;
  const bx = panel.x + Math.floor((panel.w - total) / 2);
  const buttons: Rect[] = [];
  for (let i = 0; i < count; i++) buttons.push(rect(bx + i * (SKILL_BTN + gap), y + 13, SKILL_BTN, SKILL_BTN));
  return { panel, title: { x: panel.x + Math.floor(panel.w / 2), y: y + 3 }, buttons, caption: { cx: panel.x + Math.floor(panel.w / 2), y: y + 37 } };
}

export function hitTestButtons(buttons: readonly Rect[], x: number, y: number): number {
  for (let i = 0; i < buttons.length; i++) if (rectContains(buttons[i]!, x, y)) return i;
  return -1;
}
