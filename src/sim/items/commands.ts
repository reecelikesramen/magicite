import { HOTBAR_SIZE } from '../constants';
import type { PlayerCommand, PlayerState, SlotRef } from '../types';
import type { Level, World } from '../world';
import { craft } from './craft';
import { spawnStackPickup } from './drops';
import { equipFromInventory, isEquipSlot, swapSlots, unequip, validRef } from './equip';
import { useItemFromInventory } from './consume';
import { cloneStack, firstEmpty, sortBackpack, validInv } from './inventory';
import { repairItem } from './repair';
import { buy, initShops, sell } from './shop';
import { recalcStats } from './stats';

export { craft } from './craft';

/** Ticks before a dropped item can be picked up again (so it doesn't fly straight back). */
export const DROP_DELAY = 90;

/** Drop `count` from a slot: tossed forward from the player as a pickup (keeps durability). */
export function dropItem(world: World, p: PlayerState, ref: SlotRef, count: number): boolean {
  const e = world.get(p.entityId);
  if (!e) return false;
  const s = ref.kind === 'inv' ? p.inventory[ref.index] : p.equipment[ref.slot];
  if (!s) return false;
  const n = Math.max(1, Math.min(s.count, typeof count === 'number' && Number.isInteger(count) ? count : s.count));
  const out = cloneStack(s, n);
  s.count -= n;
  if (s.count <= 0) {
    if (ref.kind === 'inv') p.inventory[ref.index] = null;
    else p.equipment[ref.slot] = null;
  }
  if (ref.kind === 'equip') recalcStats(p, e);
  spawnStackPickup(world, out, e.x + e.w / 2 + e.facing * 6, e.y + 6, { vx: e.facing * 100, vy: -90, delay: DROP_DELAY });
  world.emit({ type: 'sfx', id: 'drop', x: e.x + e.w / 2, y: e.y });
  return true;
}

/** Split a stack: floor(n/2) moves to the first empty slot (backpack first, then hotbar). */
export function splitStack(world: World, p: PlayerState, slot: number): boolean {
  const s = p.inventory[slot];
  if (!s || s.count < 2) return false;
  let to = firstEmpty(p, HOTBAR_SIZE);
  if (to < 0) to = firstEmpty(p, 0, HOTBAR_SIZE);
  if (to < 0) {
    world.emit({ type: 'message', text: 'No room to split.', player: p.index });
    return false;
  }
  const half = Math.floor(s.count / 2);
  s.count -= half;
  p.inventory[to] = cloneStack(s, half);
  return true;
}

/** Inventory commands that a downed player may still issue (pack management only). */
function allowedWhileDowned(c: PlayerCommand): boolean {
  return c.type === 'swap' || c.type === 'sort' || c.type === 'split' || c.type === 'equip' || c.type === 'unequip';
}

/** Run one command for one player. Malformed (e.g. network-garbled) commands are ignored. */
export function runCommand(world: World, p: PlayerState, c: PlayerCommand): void {
  if (p.out) return;
  if (p.downed && !allowedWhileDowned(c)) return;
  switch (c.type) {
    case 'craft':
      craft(world, p, c.a, c.b);
      return;
    case 'swap':
      if (validRef(p, c.from) && validRef(p, c.to)) swapSlots(world, p, c.from, c.to);
      return;
    case 'equip':
      if (validInv(p, c.slot)) equipFromInventory(world, p, c.slot);
      return;
    case 'unequip':
      if (isEquipSlot(c.slot)) unequip(world, p, c.slot);
      return;
    case 'use':
      if (validInv(p, c.slot)) useItemFromInventory(world, p, c.slot);
      return;
    case 'drop':
      if (validRef(p, c.slot)) dropItem(world, p, c.slot, c.count);
      return;
    case 'split':
      if (validInv(p, c.slot)) splitStack(world, p, c.slot);
      return;
    case 'sort':
      sortBackpack(p, HOTBAR_SIZE);
      return;
    case 'buy':
      buy(world, p, c.npc, c.index);
      return;
    case 'sell':
      sell(world, p, c.slot, c.count);
      return;
    case 'repair':
      if (validRef(p, c.slot)) repairItem(world, p, c.slot);
      return;
    default:
      // 'chooseSkill' is handled by the progression workstream.
      return;
  }
}

/** Levels whose shop NPCs have been stocked (pure memo: stocking is deterministic and idempotent). */
const stocked = new WeakSet<Level>();

/**
 * Processes UI commands (GDD §7, §9): crafting, inventory moves, equipment, click-use, drop, split,
 * sort, shops, repairs. Commands run in player order, then in the order they were issued.
 */
export function commandSystem(world: World): void {
  if (world.level && !stocked.has(world.level)) {
    stocked.add(world.level);
    initShops(world);
  }
  for (const p of world.players) {
    const input = world.inputs[p.index];
    if (!input || input.commands.length === 0) continue;
    for (const c of input.commands) runCommand(world, p, c);
  }
}
