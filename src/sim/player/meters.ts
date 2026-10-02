import type { World } from '../world';

/** PLACEHOLDER (scaffold): hunger drain/starvation, mana & stamina regen, downed → revive/bleed-out. */
export function metersSystem(world: World): void {
  for (const p of world.players) {
    p.runStats.ticksPlayed++;
  }
}
