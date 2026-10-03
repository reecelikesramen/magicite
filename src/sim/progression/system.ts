import { startPlayer } from '../run';
import type { World } from '../world';
import { companionSystem } from './companions';
import { refreshSkillOffer, skillCommandSystem } from './offers';
import { skillEffectSystem, skillSystem } from './skills';
import { wraithSystem } from './wraith';

/**
 * Progression tick (runs after meters, before exit — see systems.ts): late-joiner run start →
 * skill-pick commands → offers → cooldowns + skill activation → skill effects → companions →
 * Blight Wraith timer/hunt. Skill picks are processed even during hit-stop so UI commands are
 * never lost; everything else pauses with the rest of the sim.
 */
export function progressionSystem(world: World): void {
  for (const p of world.players) startPlayer(world, p); // co-op players joining mid-run
  skillCommandSystem(world);
  for (const p of world.players) refreshSkillOffer(world, p);
  if (world.freeze > 0 || world.run.over) return;
  skillSystem(world);
  skillEffectSystem(world);
  companionSystem(world);
  wraithSystem(world);
}
