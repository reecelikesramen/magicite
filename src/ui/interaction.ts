/**
 * Pure inventory interaction logic: pointer/gamepad clicks → PlayerCommands (+ local UI state).
 * The UI never mutates the sim; it only queues commands which the sim validates authoritatively.
 * Kept free of Pixi/DOM so it is unit-testable.
 */
import { Content } from '../content';
import type { EquipSlot, ItemDef } from '../content/types';
import { HOTBAR_SIZE } from '../sim/constants';
import type { ItemStack, PlayerCommand, SlotRef } from '../sim/types';
import type { UiTarget } from './layout';

export interface InvState {
  /** Slot whose item is picked up (drawn under the cursor); null = nothing held. */
  held: SlotRef | null;
  /** First Shift+Click craft pick (inventory index), -1 = none. */
  craftFirst: number;
}

export function newInvState(): InvState {
  return { held: null, craftFirst: -1 };
}

/** The slice of PlayerState the inventory UI reads. */
export interface InvView {
  inventory: readonly (ItemStack | null)[];
  equipment: Readonly<Record<EquipSlot, ItemStack | null>>;
}

export type UiAction = 'toggleBook' | 'closeBook' | 'pagePrev' | 'pageNext';

export interface Feedback {
  text: string;
  tone: 'bad' | 'info';
}

export interface ClickResult {
  commands: PlayerCommand[];
  /** Local UI action (recipe book). */
  ui?: UiAction;
  feedback?: Feedback;
}

export type ClickKind = 'primary' | 'secondary';

export function stackAt(v: InvView, ref: SlotRef): ItemStack | null {
  return ref.kind === 'inv' ? (v.inventory[ref.index] ?? null) : (v.equipment[ref.slot] ?? null);
}

export function sameRef(a: SlotRef | null, b: SlotRef | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === 'inv' ? a.index === (b as { index: number }).index : a.slot === (b as { slot: EquipSlot }).slot;
}

export function isAccessorySlot(s: EquipSlot | undefined): boolean {
  return s === 'accessory1' || s === 'accessory2';
}

/** The equipment slot an item naturally goes to (explicit `equipSlot`, else by category). */
export function naturalSlot(def: ItemDef | undefined): EquipSlot | undefined {
  if (!def) return undefined;
  if (def.equipSlot) return def.equipSlot;
  switch (def.category) {
    case 'hat':
      return 'head';
    case 'ammo':
      return 'ammo';
    case 'accessory':
      return 'accessory1';
    default:
      return undefined;
  }
}

export function isEquippable(def: ItemDef | undefined): boolean {
  return naturalSlot(def) !== undefined;
}

/** Can `def` be placed into equipment slot `slot`? (Both accessory slots accept accessories.) */
export function slotAccepts(slot: EquipSlot, def: ItemDef | undefined): boolean {
  const n = naturalSlot(def);
  if (!n) return false;
  if (isAccessorySlot(slot)) return isAccessorySlot(n);
  return n === slot;
}

function defOf(s: ItemStack | null): ItemDef | undefined {
  return s ? Content.items.get(s.id) : undefined;
}

/** Drop UI references to slots that emptied (item consumed, crafted away, moved by the sim). */
export function sanitize(state: InvState, v: InvView): void {
  if (state.held && !stackAt(v, state.held)) state.held = null;
  if (state.craftFirst >= 0 && !v.inventory[state.craftFirst]) state.craftFirst = -1;
}

export function clearSelection(state: InvState): void {
  state.held = null;
  state.craftFirst = -1;
}

const NOTHING: ClickResult = { commands: [] };

/** Would moving `from` → `to` put an item into an equipment slot that can't take it? */
function swapProblem(v: InvView, from: SlotRef, to: SlotRef): string | null {
  const a = stackAt(v, from);
  const b = stackAt(v, to);
  if (to.kind === 'equip' && !slotAccepts(to.slot, defOf(a))) return "Can't equip that there.";
  if (from.kind === 'equip' && b && !slotAccepts(from.slot, defOf(b))) return "Can't equip that there.";
  return null;
}

/** First empty inventory index in [lo, hi), or -1. */
function firstEmpty(v: InvView, lo: number, hi: number): number {
  for (let i = lo; i < hi; i++) if (!v.inventory[i]) return i;
  return -1;
}

/**
 * Right-click / gamepad Y on a slot: equip wearables, use consumables, unequip equipment,
 * otherwise quick-move between hotbar and backpack.
 */
export function secondaryCommand(v: InvView, ref: SlotRef): PlayerCommand | null {
  const s = stackAt(v, ref);
  if (!s) return null;
  if (ref.kind === 'equip') return { type: 'unequip', slot: ref.slot };
  const def = defOf(s);
  if (isEquippable(def)) return { type: 'equip', slot: ref.index };
  if (def?.use === 'consume' || def?.consume) return { type: 'use', slot: ref.index };
  const inHotbar = ref.index < HOTBAR_SIZE;
  const to = inHotbar ? firstEmpty(v, HOTBAR_SIZE, v.inventory.length) : firstEmpty(v, 0, HOTBAR_SIZE);
  return to >= 0 ? { type: 'swap', from: ref, to: { kind: 'inv', index: to } } : null;
}

/**
 * Apply one click to the inventory UI. Mutates `state` (held item / craft pick) and returns the
 * commands to queue on the next PlayerInput.
 *  - click a slot: pick up its item; click another slot: swap/move; click the same slot: put back
 *  - click outside the panel while holding: drop the whole stack
 *  - Shift+click two items: craft (the same stack twice needs ≥ 2)
 *  - right-click: equip / use / unequip / quick-move
 */
export function invClick(state: InvState, v: InvView, target: UiTarget, kind: ClickKind, shift: boolean): ClickResult {
  sanitize(state, v);
  if (target.kind === 'button') {
    clearSelection(state);
    switch (target.id) {
      case 'recipes':
        return { commands: [], ui: 'toggleBook' };
      case 'bookClose':
        return { commands: [], ui: 'closeBook' };
      case 'bookPrev':
        return { commands: [], ui: 'pagePrev' };
      case 'bookNext':
        return { commands: [], ui: 'pageNext' };
      case 'sort':
        return { commands: [{ type: 'sort' }] };
    }
  }
  if (target.kind === 'book') return NOTHING;
  if (target.kind === 'outside') {
    if (kind === 'primary' && state.held) {
      const s = stackAt(v, state.held);
      const held = state.held;
      state.held = null;
      return s ? { commands: [{ type: 'drop', slot: held, count: s.count }] } : NOTHING;
    }
    state.craftFirst = -1;
    return NOTHING;
  }
  if (target.kind === 'panel') {
    clearSelection(state);
    return NOTHING;
  }

  const ref: SlotRef = target.kind === 'inv' ? { kind: 'inv', index: target.index } : { kind: 'equip', slot: target.slot };
  const stack = stackAt(v, ref);

  if (kind === 'secondary') {
    clearSelection(state);
    const c = secondaryCommand(v, ref);
    return c ? { commands: [c] } : NOTHING;
  }

  if (shift) {
    state.held = null;
    if (ref.kind !== 'inv' || !stack) {
      state.craftFirst = -1;
      return NOTHING;
    }
    if (state.craftFirst < 0) {
      state.craftFirst = ref.index;
      return NOTHING;
    }
    const a = state.craftFirst;
    state.craftFirst = -1;
    if (a === ref.index && stack.count < 2) return { commands: [], feedback: { text: 'Need two of those to craft.', tone: 'bad' } };
    return { commands: [{ type: 'craft', a, b: ref.index }] };
  }

  state.craftFirst = -1;
  if (!state.held) {
    if (stack) state.held = ref;
    return NOTHING;
  }
  const from = state.held;
  state.held = null;
  if (sameRef(from, ref)) return NOTHING;
  const problem = swapProblem(v, from, ref);
  if (problem) return { commands: [], feedback: { text: problem, tone: 'bad' } };
  return { commands: [{ type: 'swap', from, to: ref }] };
}

/** Gamepad buttons inside the inventory, mapped onto the same click semantics. */
export type PadButton = 'a' | 'x' | 'y' | 'b';

export function padPress(state: InvState, v: InvView, target: UiTarget, button: PadButton): ClickResult & { close?: boolean } {
  switch (button) {
    case 'a':
      return invClick(state, v, target, 'primary', false);
    case 'x':
      return invClick(state, v, target, 'primary', true);
    case 'y':
      return invClick(state, v, target, 'secondary', false);
    case 'b':
      if (state.held || state.craftFirst >= 0) {
        clearSelection(state);
        return NOTHING;
      }
      return { commands: [], close: true };
  }
}
