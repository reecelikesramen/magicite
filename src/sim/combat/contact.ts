import { rectsOverlap } from '../../engine/math';
import type { World } from '../world';
import { applyDamage, combatDef, enemyDamage } from './damage';
import { applyStatuses, isDisabled } from './status';

/** Knockback (px/s) dealt to players touching an enemy. */
export const CONTACT_KNOCKBACK = 120;

/**
 * Enemies hurt players on touch (classic platformer contact damage). Frozen/stunned enemies and
 * harmless ones (damage 0, e.g. critters) don't; the enemy's onHit statuses apply on contact.
 */
export function contactDamageSystem(world: World): void {
  if (world.freeze > 0) return;
  const players = world.activePlayers();
  if (players.length === 0) return;
  for (const e of world.entities) {
    if (e.dead || (e.kind !== 'enemy' && e.kind !== 'boss')) continue;
    const def = combatDef(e);
    const base = def?.damage ?? 1;
    if (base <= 0 || isDisabled(e)) continue;
    for (const pl of players) {
      if (pl.invuln > 0 || pl.dead || !rectsOverlap(e, pl)) continue;
      const dealt = applyDamage(world, pl, enemyDamage(world, e, base), { source: e, knockback: CONTACT_KNOCKBACK, type: def?.damageType });
      if (dealt > 0) applyStatuses(world, pl, def?.onHit, e);
    }
  }
}
