import { Content } from '../../content';
import type { EquipSlot, ItemDef } from '../../content/types';
import type { ItemStack, PlayerState, SlotRef } from '../types';
import type { World } from '../world';
import { addStack, canMerge, maxStackOf, validInv } from './inventory';
import { recalcStats } from './stats';

export const EQUIP_SLOTS: readonly EquipSlot[] = ['head', 'body', 'accessory1', 'accessory2', 'ammo', 'trinket'];

export function isEquipSlot(s: unknown): s is EquipSlot {
  return typeof s === 'string' && (EQUIP_SLOTS as readonly string[]).includes(s);
}

export function isAccessorySlot(s: EquipSlot | undefined): boolean {
  return s === 'accessory1' || s === 'accessory2';
}

/** The slot an item naturally equips to: explicit `equipSlot`, else by category (ammo, accessory). */
export function naturalSlot(def: ItemDef | undefined): EquipSlot | undefined {
  if (!def) return undefined;
  if (def.equipSlot) return def.equipSlot;
  if (def.category === 'ammo') return 'ammo';
  if (def.category === 'accessory') return 'accessory1';
  return undefined;
}

/** Can `def` sit in equipment slot `slot`? Both accessory slots take accessories. */
export function slotAccepts(slot: EquipSlot, def: ItemDef | undefined): boolean {
  const n = naturalSlot(def);
  if (!n) return false;
  if (isAccessorySlot(slot)) return isAccessorySlot(n);
  return n === slot;
}

function defOf(s: ItemStack | null | undefined): ItemDef | undefined {
  return s ? Content.items.get(s.id) : undefined;
}

function refresh(world: World, p: PlayerState): void {
  recalcStats(p, world.get(p.entityId));
}

function deny(world: World, p: PlayerState, text: string): false {
  world.emit({ type: 'message', text, player: p.index });
  world.emit({ type: 'sfx', id: 'denied', x: 0, y: 0 });
  return false;
}

function stackAt(p: PlayerState, ref: SlotRef): ItemStack | null {
  return ref.kind === 'inv' ? (p.inventory[ref.index] ?? null) : (p.equipment[ref.slot] ?? null);
}

function setAt(p: PlayerState, ref: SlotRef, s: ItemStack | null): void {
  if (ref.kind === 'inv') p.inventory[ref.index] = s;
  else p.equipment[ref.slot] = s;
}

export function validRef(p: PlayerState, ref: unknown): ref is SlotRef {
  if (!ref || typeof ref !== 'object') return false;
  const r = ref as { kind?: unknown; index?: unknown; slot?: unknown };
  if (r.kind === 'inv') return validInv(p, r.index);
  if (r.kind === 'equip') return isEquipSlot(r.slot);
  return false;
}

/** Equip the item in inventory slot `index` into its natural slot (swapping out what was there). */
export function equipFromInventory(world: World, p: PlayerState, index: number): boolean {
  const s = p.inventory[index];
  const def = defOf(s);
  let slot = naturalSlot(def);
  if (!s || !slot) return s ? deny(world, p, "That can't be equipped.") : false;
  if (isAccessorySlot(slot)) slot = !p.equipment.accessory1 ? 'accessory1' : !p.equipment.accessory2 ? 'accessory2' : 'accessory1';
  const cur = p.equipment[slot];
  if (cur && canMerge(cur, s)) {
    // Same ammo: top up the equipped stack.
    const n = Math.min(maxStackOf(s.id) - cur.count, s.count);
    if (n <= 0) return false;
    cur.count += n;
    s.count -= n;
    if (s.count <= 0) p.inventory[index] = null;
  } else {
    p.equipment[slot] = s;
    p.inventory[index] = cur ?? null;
  }
  refresh(world, p);
  world.emit({ type: 'sfx', id: 'equip', x: 0, y: 0 });
  return true;
}

/** Move an equipped item back into the inventory. Fails (no change) when there is no room. */
export function unequip(world: World, p: PlayerState, slot: EquipSlot): boolean {
  const s = p.equipment[slot];
  if (!s) return false;
  const left = addStack(p, s);
  if (left >= s.count) return deny(world, p, 'No room in your pack.');
  if (left > 0) s.count = left;
  else p.equipment[slot] = null;
  refresh(world, p);
  world.emit({ type: 'sfx', id: 'unequip', x: 0, y: 0 });
  return true;
}

/**
 * Move / swap between inventory and equipment slots (the inventory UI's drag & drop). Same-item
 * stacks merge (remainder stays behind); equipment slots only accept matching items.
 */
export function swapSlots(world: World, p: PlayerState, from: SlotRef, to: SlotRef): boolean {
  if (from.kind === to.kind && (from.kind === 'inv' ? from.index === (to as { index: number }).index : from.slot === (to as { slot: EquipSlot }).slot)) return false;
  const a = stackAt(p, from);
  if (!a) return false;
  const b = stackAt(p, to);
  if (to.kind === 'equip' && !slotAccepts(to.slot, defOf(a))) return deny(world, p, "Can't equip that there.");
  if (b && from.kind === 'equip' && !canMerge(a, b) && !slotAccepts(from.slot, defOf(b))) return deny(world, p, "Can't equip that there.");
  if (b && canMerge(a, b)) {
    const n = Math.min(maxStackOf(b.id) - b.count, a.count);
    if (n <= 0) {
      setAt(p, to, a);
      setAt(p, from, b);
    } else {
      b.count += n;
      a.count -= n;
      if (a.count <= 0) setAt(p, from, null);
    }
  } else {
    setAt(p, to, a);
    setAt(p, from, b);
  }
  if (from.kind === 'equip' || to.kind === 'equip') refresh(world, p);
  return true;
}
