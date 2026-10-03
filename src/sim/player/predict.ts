import { stepBody } from '../physics';
import type { Entity, PlayerInput, PlayerState } from '../types';
import type { World } from '../world';
import { controlPlayer, latchInput } from './controller';
import { regenStamina } from './meters';

/**
 * Client-side prediction step for the local player: exactly the movement-relevant subset of
 * `World.step` in the same order (controller → physics → hurt/i-frame timers → stamina regen → input latch). With no
 * other influences (enemies, hazards, hit-stop) it reproduces the authoritative movement bit-for-bit
 * (tested in tests/player/determinism.test.ts), so reconciliation only has to fix real divergence.
 * Events emitted while replaying should be discarded by the caller.
 */
export function predictPlayer(world: World, p: PlayerState, e: Entity, input: PlayerInput): void {
  e.px = e.x;
  e.py = e.y;
  controlPlayer(world, p, e, input);
  stepBody(world, e);
  // Mirrors statusSystem's timers that movement reads (hurt = knockback stagger).
  if (e.invuln > 0) e.invuln--;
  if (e.hurt > 0) e.hurt--;
  if (!p.downed && !p.out) regenStamina(p);
  latchInput(p, input);
}
