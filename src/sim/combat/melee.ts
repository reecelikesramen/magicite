import { Content } from '../../content';
import { rectsOverlap } from '../../engine/math';
import type { Entity } from '../types';
import type { World } from '../world';
import { applyDamage } from './damage';
import { hitResource } from './harvest';

/** PLACEHOLDER (scaffold): resolves active swings as a box in front of the attacker. */
export function meleeSystem(world: World): void {
  if (world.freeze > 0) return;
  for (const e of world.entities) {
    const s = e.swing;
    if (!s) continue;
    s.ticks--;
    if (s.ticks <= 0) {
      e.swing = undefined;
      continue;
    }
    const def = Content.items.get(s.item);
    const reach = def?.range ?? 10;
    const box = { x: e.facing > 0 ? e.x + e.w : e.x - reach, y: e.y - 3, w: reach, h: e.h + 6 };
    for (const t of world.entities) {
      if (t === e || t.dead || s.hit.includes(t.id)) continue;
      if (!rectsOverlap(box, t)) continue;
      if (t.kind === 'enemy' || t.kind === 'boss') {
        s.hit.push(t.id);
        const atk = e.kind === 'player' ? (world.players[e.playerIndex!]?.stats.atk ?? 0) : 0;
        applyDamage(world, t, (def?.damage ?? 1) + Math.floor(atk / 3), { source: e, knockback: def?.knockback ?? 60 });
      } else if (t.kind === 'resource') {
        s.hit.push(t.id);
        hitResource(world, e as Entity, t, def);
      }
    }
  }
}
