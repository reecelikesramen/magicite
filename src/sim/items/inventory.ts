import { Content } from '../../content';
import type { ItemStack, PlayerState } from '../types';

export function maxStackOf(id: string): number {
  return Content.items.get(id)?.maxStack ?? 99;
}

/**
 * Add items to a player's inventory: tops up existing stacks first, then empty slots
 * (hotbar first). Returns the count that did NOT fit.
 */
export function addItem(p: PlayerState, id: string, count: number): number {
  let left = count;
  const max = maxStackOf(id);
  for (const s of p.inventory) {
    if (left <= 0) break;
    if (s && s.id === id && s.count < max) {
      const n = Math.min(max - s.count, left);
      s.count += n;
      left -= n;
    }
  }
  for (let i = 0; i < p.inventory.length && left > 0; i++) {
    if (p.inventory[i]) continue;
    const n = Math.min(max, left);
    p.inventory[i] = { id, count: n };
    left -= n;
  }
  return left;
}

export function countItem(p: PlayerState, id: string): number {
  let n = 0;
  for (const s of p.inventory) if (s && s.id === id) n += s.count;
  return n;
}

/** Remove up to `count` of an item; returns how many were removed. */
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

export function heldStack(p: PlayerState): ItemStack | null {
  return p.inventory[p.selected] ?? null;
}
