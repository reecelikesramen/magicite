import { maybeItem } from '../../content';
import { secs } from '../constants';
import { pressed } from '../player/controller';
import type { World } from '../world';

/**
 * PLACEHOLDER (scaffold): pressing attack with a 'swing' item starts a melee swing that the
 * melee system resolves. The combat workstream replaces this with the full item-use dispatcher
 * (swing/thrust/shoot/cast/throw/consume/place, tile mining, durability, mana/ammo costs).
 */
export function playerActionSystem(world: World): void {
  if (world.freeze > 0) return;
  for (const p of world.players) {
    const e = world.get(p.entityId);
    if (!e || p.downed || p.out) continue;
    const input = world.inputs[p.index]!;
    if (p.useCooldown > 0) p.useCooldown--;
    const stack = p.inventory[p.selected];
    const def = maybeItem(stack?.id);
    e.held = def?.id;
    if (!def || p.useCooldown > 0) continue;
    if (def.use === 'swing' && (input.attack || pressed(p, input, 'attack'))) {
      const ang = Math.atan2(input.aimY - (e.y + e.h / 2), input.aimX - (e.x + e.w / 2));
      e.facing = Math.cos(ang) >= 0 ? 1 : -1;
      const total = Math.max(6, secs((def.cooldown ?? 0.4) * 0.6));
      e.swing = { ticks: total, total, angle: ang, hit: [], item: def.id };
      p.useCooldown = secs(def.cooldown ?? 0.4);
      world.emit({ type: 'sfx', id: 'swing', x: e.x, y: e.y });
    }
  }
}
