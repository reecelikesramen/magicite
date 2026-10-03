import type { PlayerState } from '../types';
import type { World } from '../world';

/**
 * A player's personal item sound (equip, denied, …), positioned at their entity. The audio layer
 * treats x = y = 0 as "no position" and plays it at full volume for everyone, so a positioned cue is
 * what keeps a far teammate's inventory clicks quiet in co-op.
 */
export function playerSfx(world: World, p: PlayerState, id: string): void {
  const e = world.get(p.entityId);
  world.emit({ type: 'sfx', id, x: e ? e.x + e.w / 2 : 0, y: e ? e.y + e.h / 2 : 0 });
}

/** Refuse an action: a private message to the player plus their 'denied' sound. Returns false. */
export function deny(world: World, p: PlayerState, text: string): false {
  world.emit({ type: 'message', text, player: p.index });
  playerSfx(world, p, 'denied');
  return false;
}
