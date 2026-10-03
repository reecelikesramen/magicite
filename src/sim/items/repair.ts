import { Content } from '../../content';
import type { ItemStack, PlayerState, SlotRef } from '../types';
import type { World } from '../world';
import { KIT_REPAIR, restoreDurability } from './consume';
import { removeItem, countItem } from './inventory';
import { nearestNpc } from './shop';

/** Smith repair price: half the item's value scaled by missing durability (min 1). */
export function repairCost(stack: ItemStack): number {
  const def = Content.items.get(stack.id);
  if (!def?.durability || stack.durability === undefined || stack.durability >= def.durability) return 0;
  const missing = 1 - stack.durability / def.durability;
  return Math.max(1, Math.ceil(def.value * 0.5 * missing));
}

function stackAt(p: PlayerState, ref: SlotRef): ItemStack | null {
  return ref.kind === 'inv' ? (p.inventory[ref.index] ?? null) : (p.equipment[ref.slot] ?? null);
}

function deny(world: World, p: PlayerState, text: string): false {
  world.emit({ type: 'message', text, player: p.index });
  world.emit({ type: 'sfx', id: 'denied', x: 0, y: 0 });
  return false;
}

/**
 * Repair the item at `ref` (GDD §6 extension): next to a smith it is restored fully for gold;
 * anywhere else a repair_kit restores KIT_REPAIR of its max durability.
 */
export function repairItem(world: World, p: PlayerState, ref: SlotRef): boolean {
  const e = world.get(p.entityId);
  const stack = stackAt(p, ref);
  if (!e || !stack || p.out) return false;
  const def = Content.items.get(stack.id);
  if (!def?.durability || stack.durability === undefined) return deny(world, p, "That can't be repaired.");
  if (stack.durability >= def.durability) return deny(world, p, 'It is already in perfect shape.');
  const smith = nearestNpc(world, e, (_o, s) => !!s.repairs);
  if (smith) {
    const cost = repairCost(stack);
    if (p.gold < cost) return deny(world, p, `Repair costs ${cost} gold.`);
    p.gold -= cost;
    stack.durability = def.durability;
    p.runStats.goldSpent = (p.runStats.goldSpent ?? 0) + cost;
  } else {
    if (countItem(p, 'repair_kit') <= 0) return deny(world, p, 'Find a smith or a repair kit.');
    removeItem(p, 'repair_kit', 1);
    restoreDurability(stack, KIT_REPAIR);
  }
  p.runStats.itemsRepaired = (p.runStats.itemsRepaired ?? 0) + 1;
  world.emit({ type: 'message', text: `Repaired ${def.name}.`, color: 0xffe080, player: p.index });
  world.emit({ type: 'sfx', id: 'repair', x: e.x + e.w / 2, y: e.y });
  world.emit({ type: 'particles', preset: 'repair', x: e.x + e.w / 2, y: e.y + 2, count: 6 });
  return true;
}
