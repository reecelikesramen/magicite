import { approach } from '../../engine/math';
import { isDisabled, speedMul } from '../combat/status';
import { DT } from '../constants';
import type { Entity } from '../types';
import type { World } from '../world';
import { charger, critter, dropper, flyer, hopper, shooter, turret, walker } from './behaviors';
import { enemyDef } from './common';
import { BOSS_UPDATERS } from './registry';
import './bosses'; // registers boss patterns

export { canSee, lineOfSight, nearestPlayer } from './common';
export { BOSS_UPDATERS, type BossUpdater } from './registry';

/** Entities whose movement is owned by another system (the Blight Wraith: progression/wraith.ts). */
function externallyDriven(e: Entity): boolean {
  return e.def === 'blight_wraith';
}

/** AI dispatcher: routes each enemy/boss to its behaviour (content-driven, deterministic). */
export function aiSystem(world: World): void {
  if (world.freeze > 0) return;
  for (const e of world.entities) {
    if (e.dead) continue;
    if (e.kind === 'boss') {
      const up = BOSS_UPDATERS[e.def];
      if (up && !isDisabled(e)) up(world, e);
      continue;
    }
    if (e.kind !== 'enemy' || externallyDriven(e)) continue;
    const def = enemyDef(e);
    if (!def) continue;
    if (isDisabled(e)) {
      // Frozen/stunned: no control, slide to a stop (flyers hang in the air).
      e.vx = approach(e.vx, 0, 600 * DT);
      if (def.flying) e.vy = approach(e.vy, 0, 600 * DT);
      e.anim = 'hurt';
      continue;
    }
    if (e.hurt > 0 && def.behavior !== 'turret') continue; // brief stagger: let knockback play
    const spd = speedMul(e);
    switch (def.behavior) {
      case 'walker':
        walker(world, e, def, spd);
        break;
      case 'hopper':
        hopper(world, e, def, spd);
        break;
      case 'flyer':
        flyer(world, e, def, spd);
        break;
      case 'shooter':
        shooter(world, e, def, spd);
        break;
      case 'turret':
        turret(world, e, def);
        break;
      case 'charger':
        charger(world, e, def, spd);
        break;
      case 'dropper':
        dropper(world, e, def, spd);
        break;
      case 'critter':
        critter(world, e, def, spd);
        break;
      default:
        walker(world, e, def, spd);
    }
  }
}
