import type { DropEntry } from '../../content/types';
import type { Entity, ItemStack } from '../types';
import type { World } from '../world';
import { cloneStack, makeStack } from './inventory';

/**
 * Spawn a pickup that pops out with a little random velocity. New durable items start at full
 * durability. The `gold` currency id always becomes wallet coins (a drop table listing `gold`
 * must never put a "Gold" item into someone's pack).
 */
export function spawnPickup(world: World, id: string, count: number, x: number, y: number, gold = 0): Entity {
  const coins = gold > 0 ? gold : id === 'gold' ? Math.max(1, count) : 0;
  return world.spawn('pickup', id, x - 3, y - 3, {
    w: 6,
    h: 6,
    vx: world.rng.range(-50, 50),
    vy: world.rng.range(-140, -80),
    pickup: { item: coins > 0 ? { id, count } : makeStack(id, count), delay: 20, gold: coins },
  });
}

export interface TossOpts {
  vx?: number;
  vy?: number;
  /** Ticks before anyone can collect it. */
  delay?: number;
}

/** Spawn an existing stack (keeps durability) as a pickup, e.g. a dropped or overflowing item. */
export function spawnStackPickup(world: World, stack: ItemStack, x: number, y: number, o: TossOpts = {}): Entity {
  return world.spawn('pickup', stack.id, x - 3, y - 3, {
    w: 6,
    h: 6,
    vx: o.vx ?? world.rng.range(-40, 40),
    vy: o.vy ?? -100,
    pickup: { item: cloneStack(stack), delay: o.delay ?? 30, gold: 0 },
  });
}

export function spawnDrops(world: World, drops: readonly DropEntry[], x: number, y: number): void {
  for (const d of drops) {
    if (!world.rng.chance(d.chance)) continue;
    const n = world.rng.int(d.min, d.max);
    if (n > 0) spawnPickup(world, d.item, n, x, y);
  }
}

export function spawnGold(world: World, amount: number, x: number, y: number): void {
  let left = amount;
  while (left > 0) {
    const n = Math.min(left, left >= 10 ? 5 : 1);
    spawnPickup(world, 'gold', n, x, y, n);
    left -= n;
  }
}
