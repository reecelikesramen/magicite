import { Content } from '../../content';
import type { ItemDef } from '../../content/types';
import { DEFAULT_STACK } from '../constants';
import type { ItemStack, PlayerState } from '../types';

export function maxStackOf(id: string): number {
  return Content.items.get(id)?.maxStack ?? DEFAULT_STACK;
}

/** Max durability of an item id (undefined = unbreakable). */
export function maxDurabilityOf(id: string): number | undefined {
  return Content.items.get(id)?.durability;
}

/** A fresh stack; durable items start at full durability (GDD §6). */
export function makeStack(id: string, count: number): ItemStack {
  const max = maxDurabilityOf(id);
  return max !== undefined ? { id, count, durability: max } : { id, count };
}

/** Copy a stack (plain data) with an optional new count. */
export function cloneStack(s: ItemStack, count = s.count): ItemStack {
  return s.durability !== undefined ? { id: s.id, count, durability: s.durability } : { id: s.id, count };
}

/** Two stacks can merge when they are the same item and neither carries wear. */
export function canMerge(a: ItemStack | null | undefined, b: ItemStack | null | undefined): boolean {
  return !!a && !!b && a.id === b.id && a.durability === undefined && b.durability === undefined && maxStackOf(a.id) > 1;
}

/** First empty inventory index in [from, to), or -1. */
export function firstEmpty(p: PlayerState, from = 0, to = p.inventory.length): number {
  for (let i = from; i < to; i++) if (!p.inventory[i]) return i;
  return -1;
}

/** How many more of `id` fit into the inventory (existing stacks + empty slots). */
export function roomFor(p: PlayerState, id: string): number {
  const max = maxStackOf(id);
  const durable = maxDurabilityOf(id) !== undefined;
  let n = 0;
  for (const s of p.inventory) {
    if (!s) n += max;
    else if (!durable && s.id === id && s.durability === undefined && s.count < max) n += max - s.count;
  }
  return n;
}

/**
 * Add items to a player's inventory: tops up existing stacks first, then empty slots
 * (hotbar first). New stacks get full durability. Returns the count that did NOT fit.
 */
export function addItem(p: PlayerState, id: string, count: number): number {
  return addStack(p, makeStack(id, count));
}

/**
 * Add a stack (keeping its durability): merges into matching unworn stacks, then fills empty
 * slots. Returns the count that did NOT fit (the caller decides whether to drop it).
 */
export function addStack(p: PlayerState, stack: ItemStack): number {
  let left = stack.count;
  if (left <= 0) return 0;
  const max = maxStackOf(stack.id);
  if (stack.durability === undefined) {
    for (const s of p.inventory) {
      if (left <= 0) break;
      if (s && s.id === stack.id && s.durability === undefined && s.count < max) {
        const n = Math.min(max - s.count, left);
        s.count += n;
        left -= n;
      }
    }
  }
  for (let i = 0; i < p.inventory.length && left > 0; i++) {
    if (p.inventory[i]) continue;
    const n = Math.min(max, left);
    p.inventory[i] = cloneStack(stack, n);
    left -= n;
  }
  return left;
}

export function countItem(p: PlayerState, id: string): number {
  let n = 0;
  for (const s of p.inventory) if (s && s.id === id) n += s.count;
  return n;
}

/** Remove up to `count` of an item (backpack first, from the end); returns how many were removed. */
export function removeItem(p: PlayerState, id: string, count: number): number {
  let left = count;
  for (let i = p.inventory.length - 1; i >= 0 && left > 0; i--) {
    const s = p.inventory[i];
    if (!s || s.id !== id) continue;
    const n = Math.min(s.count, left);
    s.count -= n;
    left -= n;
    if (s.count <= 0) p.inventory[i] = null;
  }
  return count - left;
}

/** Take `n` from an inventory slot (clears it at 0). Returns how many were taken. */
export function takeFromSlot(p: PlayerState, slot: number, n: number): number {
  const s = p.inventory[slot];
  if (!s || n <= 0) return 0;
  const k = Math.min(n, s.count);
  s.count -= k;
  if (s.count <= 0) p.inventory[slot] = null;
  return k;
}

export function heldStack(p: PlayerState): ItemStack | null {
  return p.inventory[p.selected] ?? null;
}

/** True for a valid inventory index (guards network-supplied commands). */
export function validInv(p: PlayerState, i: unknown): i is number {
  return typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < p.inventory.length;
}

/** Crafted / bought / looted items of this def come out in batches? (materials, ammo, `batch` tag). */
export function isBatch(def: ItemDef | undefined): boolean {
  if (!def) return false;
  return def.category === 'material' || def.category === 'ammo' || !!def.tags?.includes('batch');
}

/** Display order for sorting the backpack. */
const CATEGORY_ORDER: Record<string, number> = {
  weapon: 0, tool: 1, armor: 2, accessory: 3, hat: 4, ammo: 5, consumable: 6, placeable: 7, material: 8, key: 9,
};

/**
 * Sort the backpack (hotbar untouched): merge partial stacks, then order by category, tier
 * (high first), id, durability. Deterministic (pure comparison, stable for equal keys).
 */
export function sortBackpack(p: PlayerState, from: number): void {
  const items: ItemStack[] = [];
  for (let i = from; i < p.inventory.length; i++) {
    const s = p.inventory[i];
    if (!s) continue;
    p.inventory[i] = null;
    let left = s.count;
    if (s.durability === undefined) {
      const max = maxStackOf(s.id);
      for (const t of items) {
        if (left <= 0) break;
        if (t.id === s.id && t.durability === undefined && t.count < max) {
          const n = Math.min(max - t.count, left);
          t.count += n;
          left -= n;
        }
      }
    }
    if (left > 0) items.push(cloneStack(s, left));
  }
  items.sort((a, b) => {
    const da = Content.items.get(a.id);
    const db = Content.items.get(b.id);
    const ca = CATEGORY_ORDER[da?.category ?? 'key'] ?? 10;
    const cb = CATEGORY_ORDER[db?.category ?? 'key'] ?? 10;
    if (ca !== cb) return ca - cb;
    const ta = da?.tier ?? 0;
    const tb = db?.tier ?? 0;
    if (ta !== tb) return tb - ta;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    if ((a.durability ?? 0) !== (b.durability ?? 0)) return (b.durability ?? 0) - (a.durability ?? 0);
    return b.count - a.count;
  });
  for (let i = 0; i < items.length; i++) p.inventory[from + i] = items[i]!;
}
