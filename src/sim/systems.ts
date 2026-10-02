import { aiSystem } from './ai';
import { contactDamageSystem } from './combat/contact';
import { hazardSystem } from './combat/hazards';
import { meleeSystem } from './combat/melee';
import { projectileSystem } from './combat/projectiles';
import { statusSystem } from './combat/status';
import { playerActionSystem } from './combat/use';
import { commandSystem } from './items/commands';
import { pickupSystem } from './items/pickups';
import { physicsSystem } from './physics';
import { playerControlSystem, playerInputLatchSystem } from './player/controller';
import { metersSystem } from './player/meters';
import { progressionSystem } from './progression/xp';
import { exitSystem } from './run';
import type { System, World } from './world';

function freezeSystem(world: World): void {
  if (world.freeze > 0) world.freeze--;
}

/**
 * The fixed system order for one tick. Order matters and is part of the determinism contract:
 * do not reorder without updating docs/architecture.md. Workstreams implement the bodies.
 */
export const SYSTEMS: readonly System[] = [
  freezeSystem,
  commandSystem, // inventory / crafting / equip / skill picks (from UI commands)
  playerControlSystem, // movement, jumping, ladders, swimming
  playerActionSystem, // use held item: swing / shoot / cast / mine / eat / place
  aiSystem, // enemies & bosses decide velocities and attacks
  physicsSystem, // integrate + tile collision for everything mobile
  meleeSystem, // resolve active swings vs enemies/resources
  projectileSystem,
  contactDamageSystem,
  hazardSystem,
  statusSystem, // timers, burn/poison/etc.
  pickupSystem,
  metersSystem, // hunger, mana/stamina regen, downed/revive
  progressionSystem,
  exitSystem, // portal → next district
  playerInputLatchSystem, // must be last
];
