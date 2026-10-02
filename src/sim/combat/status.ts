import type { World } from '../world';

/** Ticks invulnerability/hurt timers. PLACEHOLDER for status effects (burn, poison, freeze…). */
export function statusSystem(world: World): void {
  for (const e of world.entities) {
    if (e.invuln > 0) e.invuln--;
    if (e.hurt > 0) e.hurt--;
    if (e.resource && e.resource.hitFlash > 0) e.resource.hitFlash--;
  }
}
