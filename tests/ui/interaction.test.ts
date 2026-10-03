import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { HOTBAR_SIZE } from '../../src/sim/constants';
import {
  type InvState,
  invClick,
  isEquippable,
  naturalSlot,
  newInvState,
  padPress,
  sameRef,
  sanitize,
  secondaryCommand,
  slotAccepts,
} from '../../src/ui/interaction';
import type { UiTarget } from '../../src/ui/layout';
import { useTestItems, view } from './fixtures';

useTestItems();

const slot = (index: number): UiTarget => ({ kind: 'inv', index });
const OUT: UiTarget = { kind: 'outside' };

describe('click → swap / move', () => {
  it('first click picks up, second click on another slot swaps', () => {
    const s = newInvState();
    const v = view({ 0: ['wood', 3], 6: ['stone', 2] });
    expect(invClick(s, v, slot(0), 'primary', false).commands).toEqual([]);
    expect(s.held).toEqual({ kind: 'inv', index: 0 });
    const r = invClick(s, v, slot(6), 'primary', false);
    expect(r.commands).toEqual([{ type: 'swap', from: { kind: 'inv', index: 0 }, to: { kind: 'inv', index: 6 } }]);
    expect(s.held).toBeNull();
  });

  it('moving onto an empty slot also emits a swap (the sim moves/merges)', () => {
    const s = newInvState();
    const v = view({ 2: ['wood', 3] });
    invClick(s, v, slot(2), 'primary', false);
    expect(invClick(s, v, slot(9), 'primary', false).commands).toEqual([{ type: 'swap', from: { kind: 'inv', index: 2 }, to: { kind: 'inv', index: 9 } }]);
  });

  it('clicking an empty slot with nothing held does nothing', () => {
    const s = newInvState();
    expect(invClick(s, view(), slot(4), 'primary', false).commands).toEqual([]);
    expect(s.held).toBeNull();
  });

  it('clicking the held slot again puts the item back', () => {
    const s = newInvState();
    const v = view({ 1: ['wood', 3] });
    invClick(s, v, slot(1), 'primary', false);
    expect(invClick(s, v, slot(1), 'primary', false).commands).toEqual([]);
    expect(s.held).toBeNull();
  });

  it('clicking outside the panel while holding drops the whole stack', () => {
    const s = newInvState();
    const v = view({ 7: ['stone', 14] });
    invClick(s, v, slot(7), 'primary', false);
    expect(invClick(s, v, OUT, 'primary', false).commands).toEqual([{ type: 'drop', slot: { kind: 'inv', index: 7 }, count: 14 }]);
    expect(s.held).toBeNull();
  });

  it('clicking outside with nothing held does nothing', () => {
    expect(invClick(newInvState(), view({ 0: ['wood', 1] }), OUT, 'primary', false).commands).toEqual([]);
  });

  it('clicking the panel background cancels the pick', () => {
    const s = newInvState();
    const v = view({ 0: ['wood', 1] });
    invClick(s, v, slot(0), 'primary', false);
    expect(invClick(s, v, { kind: 'panel' }, 'primary', false).commands).toEqual([]);
    expect(s.held).toBeNull();
  });
});

describe('equipment slots', () => {
  it('knows which slot an item naturally goes to', () => {
    expect(naturalSlot(Content.items.get('test_helmet'))).toBe('head');
    expect(naturalSlot(Content.items.get('test_ring'))).toBe('accessory1');
    expect(naturalSlot(Content.items.get('test_arrow'))).toBe('ammo');
    expect(naturalSlot(Content.items.get('wood'))).toBeUndefined();
    expect(isEquippable(Content.items.get('test_tunic'))).toBe(true);
    expect(isEquippable(Content.items.get('axe'))).toBe(false);
  });

  it('accessory slots accept any accessory; others only their own kind', () => {
    const ring = Content.items.get('test_ring');
    expect(slotAccepts('accessory1', ring)).toBe(true);
    expect(slotAccepts('accessory2', ring)).toBe(true);
    expect(slotAccepts('head', ring)).toBe(false);
    expect(slotAccepts('head', Content.items.get('test_helmet'))).toBe(true);
    expect(slotAccepts('body', Content.items.get('test_helmet'))).toBe(false);
  });

  it('moving a helmet onto the head slot emits a swap to the equip ref', () => {
    const s = newInvState();
    const v = view({ 3: ['test_helmet', 1] });
    invClick(s, v, slot(3), 'primary', false);
    expect(invClick(s, v, { kind: 'equip', slot: 'head' }, 'primary', false).commands).toEqual([
      { type: 'swap', from: { kind: 'inv', index: 3 }, to: { kind: 'equip', slot: 'head' } },
    ]);
  });

  it('refuses to put an item into a slot that cannot take it', () => {
    const s = newInvState();
    const v = view({ 3: ['wood', 4] });
    invClick(s, v, slot(3), 'primary', false);
    const r = invClick(s, v, { kind: 'equip', slot: 'body' }, 'primary', false);
    expect(r.commands).toEqual([]);
    expect(r.feedback?.tone).toBe('bad');
  });

  it('refuses a swap that would push an inventory item into the source equip slot', () => {
    const s = newInvState();
    const v = view({ 5: ['wood', 1] }, { head: ['test_helmet', 1] });
    invClick(s, v, { kind: 'equip', slot: 'head' }, 'primary', false);
    const r = invClick(s, v, slot(5), 'primary', false);
    expect(r.commands).toEqual([]);
    expect(r.feedback).toBeDefined();
    // ...but dropping the helmet onto an empty slot is fine (unequip by move).
    invClick(s, v, { kind: 'equip', slot: 'head' }, 'primary', false);
    expect(invClick(s, v, slot(6), 'primary', false).commands).toEqual([{ type: 'swap', from: { kind: 'equip', slot: 'head' }, to: { kind: 'inv', index: 6 } }]);
  });
});

describe('shift+click crafting', () => {
  it('first shift-click marks the pick, second emits craft', () => {
    const s = newInvState();
    const v = view({ 5: ['wood', 3], 9: ['stone', 1] });
    expect(invClick(s, v, slot(5), 'primary', true).commands).toEqual([]);
    expect(s.craftFirst).toBe(5);
    expect(invClick(s, v, slot(9), 'primary', true).commands).toEqual([{ type: 'craft', a: 5, b: 9 }]);
    expect(s.craftFirst).toBe(-1);
  });

  it('the same stack twice needs at least two items', () => {
    const one = newInvState();
    const v1 = view({ 5: ['wood', 1] });
    invClick(one, v1, slot(5), 'primary', true);
    const r = invClick(one, v1, slot(5), 'primary', true);
    expect(r.commands).toEqual([]);
    expect(r.feedback?.tone).toBe('bad');

    const two = newInvState();
    const v2 = view({ 5: ['wood', 2] });
    invClick(two, v2, slot(5), 'primary', true);
    expect(invClick(two, v2, slot(5), 'primary', true).commands).toEqual([{ type: 'craft', a: 5, b: 5 }]);
  });

  it('shift-clicking an empty slot or equipment clears the pick', () => {
    const s = newInvState();
    const v = view({ 5: ['wood', 2] }, { head: ['test_helmet', 1] });
    invClick(s, v, slot(5), 'primary', true);
    invClick(s, v, slot(12), 'primary', true);
    expect(s.craftFirst).toBe(-1);
    invClick(s, v, slot(5), 'primary', true);
    invClick(s, v, { kind: 'equip', slot: 'head' }, 'primary', true);
    expect(s.craftFirst).toBe(-1);
  });

  it('a plain click after a shift pick cancels it and picks up instead', () => {
    const s = newInvState();
    const v = view({ 5: ['wood', 2], 6: ['stone', 2] });
    invClick(s, v, slot(5), 'primary', true);
    invClick(s, v, slot(6), 'primary', false);
    expect(s.craftFirst).toBe(-1);
    expect(s.held).toEqual({ kind: 'inv', index: 6 });
  });

  it('shift-click while holding an item drops the hold and starts a pick', () => {
    const s = newInvState();
    const v = view({ 5: ['wood', 2], 6: ['stone', 2] });
    invClick(s, v, slot(5), 'primary', false);
    invClick(s, v, slot(6), 'primary', true);
    expect(s.held).toBeNull();
    expect(s.craftFirst).toBe(6);
  });
});

describe('right-click (use / equip / unequip / quick-move)', () => {
  it('equips wearables', () => {
    expect(secondaryCommand(view({ 7: ['test_tunic', 1] }), { kind: 'inv', index: 7 })).toEqual({ type: 'equip', slot: 7 });
    expect(invClick(newInvState(), view({ 7: ['test_ring', 1] }), slot(7), 'secondary', false).commands).toEqual([{ type: 'equip', slot: 7 }]);
  });

  it('uses consumables', () => {
    expect(secondaryCommand(view({ 2: ['meat', 2] }), { kind: 'inv', index: 2 })).toEqual({ type: 'use', slot: 2 });
    expect(secondaryCommand(view({ 2: ['test_potion', 1] }), { kind: 'inv', index: 2 })).toEqual({ type: 'use', slot: 2 });
  });

  it('unequips from equipment slots', () => {
    expect(secondaryCommand(view({}, { body: ['test_tunic', 1] }), { kind: 'equip', slot: 'body' })).toEqual({ type: 'unequip', slot: 'body' });
  });

  it('quick-moves other items between hotbar and backpack', () => {
    const v = view({ 0: ['wood', 3], 1: ['stone', 3], 5: ['plank', 1] });
    expect(secondaryCommand(v, { kind: 'inv', index: 0 })).toEqual({ type: 'swap', from: { kind: 'inv', index: 0 }, to: { kind: 'inv', index: 6 } });
    expect(secondaryCommand(v, { kind: 'inv', index: 5 })).toEqual({ type: 'swap', from: { kind: 'inv', index: 5 }, to: { kind: 'inv', index: 2 } });
  });

  it('does nothing on empty slots or when there is no room', () => {
    expect(secondaryCommand(view(), { kind: 'inv', index: 0 })).toBeNull();
    const full: Record<number, [string, number]> = {};
    for (let i = 0; i < HOTBAR_SIZE; i++) full[i] = ['stone', 1];
    full[8] = ['wood', 1];
    expect(secondaryCommand(view(full), { kind: 'inv', index: 8 })).toBeNull();
  });

  it('right-click clears any pending selection', () => {
    const s = newInvState();
    const v = view({ 0: ['wood', 3], 2: ['meat', 1] });
    invClick(s, v, slot(0), 'primary', false);
    invClick(s, v, slot(2), 'secondary', false);
    expect(s.held).toBeNull();
  });
});

describe('buttons and state hygiene', () => {
  it('maps buttons to UI actions or commands', () => {
    const s = newInvState();
    const v = view();
    expect(invClick(s, v, { kind: 'button', id: 'recipes' }, 'primary', false).ui).toBe('toggleBook');
    expect(invClick(s, v, { kind: 'button', id: 'bookClose' }, 'primary', false).ui).toBe('closeBook');
    expect(invClick(s, v, { kind: 'button', id: 'bookPrev' }, 'primary', false).ui).toBe('pagePrev');
    expect(invClick(s, v, { kind: 'button', id: 'bookNext' }, 'primary', false).ui).toBe('pageNext');
    expect(invClick(s, v, { kind: 'button', id: 'sort' }, 'primary', false).commands).toEqual([{ type: 'sort' }]);
    expect(invClick(s, v, { kind: 'book', row: 0 }, 'primary', false).commands).toEqual([]);
  });

  it('sanitize forgets references to slots that emptied', () => {
    const s: InvState = { held: { kind: 'inv', index: 3 }, craftFirst: 4 };
    sanitize(s, view({ 3: ['wood', 1] }));
    expect(s.held).not.toBeNull();
    expect(s.craftFirst).toBe(-1);
    sanitize(s, view());
    expect(s.held).toBeNull();
  });

  it('a stale held ref is not dropped or swapped', () => {
    const s: InvState = { held: { kind: 'inv', index: 3 }, craftFirst: -1 };
    expect(invClick(s, view(), OUT, 'primary', false).commands).toEqual([]);
  });

  it('sameRef compares slot refs structurally', () => {
    expect(sameRef({ kind: 'inv', index: 1 }, { kind: 'inv', index: 1 })).toBe(true);
    expect(sameRef({ kind: 'inv', index: 1 }, { kind: 'inv', index: 2 })).toBe(false);
    expect(sameRef({ kind: 'equip', slot: 'head' }, { kind: 'equip', slot: 'head' })).toBe(true);
    expect(sameRef({ kind: 'equip', slot: 'head' }, { kind: 'inv', index: 0 })).toBe(false);
    expect(sameRef(null, { kind: 'inv', index: 0 })).toBe(false);
  });
});

describe('gamepad buttons', () => {
  it('A picks/places, X craft-picks, Y uses, B cancels then closes', () => {
    const s = newInvState();
    const v = view({ 0: ['wood', 2], 2: ['meat', 1], 4: ['stone', 1] });
    padPress(s, v, slot(0), 'a');
    expect(s.held).toEqual({ kind: 'inv', index: 0 });
    expect(padPress(s, v, slot(0), 'b').close).toBeUndefined();
    expect(s.held).toBeNull();
    expect(padPress(s, v, slot(0), 'b').close).toBe(true);
    padPress(s, v, slot(0), 'x');
    expect(padPress(s, v, slot(4), 'x').commands).toEqual([{ type: 'craft', a: 0, b: 4 }]);
    expect(padPress(s, v, slot(2), 'y').commands).toEqual([{ type: 'use', slot: 2 }]);
  });
});
