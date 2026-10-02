import type { DropEntry } from '../../content/types';
import type { World } from '../world';

/** Spawn a pickup that pops out with a little random velocity. */
export function spawnPickup(world: World, id: string, count: number, x: number, y: number, gold = 0): void {
  world.spawn('pickup', id, x - 3, y - 3, {
    w: 6,
    h: 6,
    vx: world.rng.range(-50, 50),
    vy: world.rng.range(-140, -80),
    pickup: { item: { id, count }, delay: 20, gold },
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
