import { Content } from '../../content';
import { rectsOverlap } from '../../engine/math';
import type { World } from '../world';
import { applyDamage } from './damage';

/** Enemies hurt players on touch (classic platformer contact damage). */
export function contactDamageSystem(world: World): void {
  if (world.freeze > 0) return;
  const players = world.activePlayers();
  if (players.length === 0) return;
  for (const e of world.entities) {
    if (e.dead || (e.kind !== 'enemy' && e.kind !== 'boss')) continue;
    const def = e.kind === 'boss' ? Content.bosses.get(e.def) : Content.enemies.get(e.def);
    const dmg = def?.damage ?? 1;
    for (const pl of players) {
      if (pl.invuln > 0 || !rectsOverlap(e, pl)) continue;
      applyDamage(world, pl, dmg, { source: e, knockback: 120, type: def?.damageType });
    }
  }
}
