import { createRun, emptyInput, type Entity, type GameEvent, type PlayerCommand, type PlayerState, type World } from '../../src/sim';
import { makeStack } from '../../src/sim/items/inventory';

export const SETUP = { name: 'TEST', race: 'drifter', hat: '', companion: '' };

export interface Rig {
  w: World;
  p: PlayerState;
  e: Entity;
}

/** A fresh run with an empty pack, settled on the ground. */
export function rig(seed = 7, setup: Partial<typeof SETUP> & { traits?: string[] } = {}): Rig {
  const w = createRun(seed, [{ ...SETUP, ...setup }]);
  // Peaceful test bench: no enemies wandering into the player.
  for (const o of w.entities) if (o.kind === 'enemy' || o.kind === 'boss') w.kill(o);
  for (let i = 0; i < 30; i++) w.step([emptyInput()]);
  const p = w.players[0]!;
  p.inventory.fill(null);
  for (const k of Object.keys(p.equipment) as (keyof PlayerState['equipment'])[]) p.equipment[k] = null;
  return { w, p, e: w.playerEntity(0)! };
}

/** Put a fresh stack into an inventory slot. */
export function give(p: PlayerState, slot: number, id: string, count = 1): void {
  p.inventory[slot] = makeStack(id, count);
}

/** Step one tick with these UI commands (no movement). */
export function cmd(w: World, ...commands: PlayerCommand[]): void {
  w.step([{ ...emptyInput(), commands }]);
}

/** Spawn a static prop / npc right next to the player. */
export function spawnNear(w: World, e: Entity, kind: 'prop' | 'npc', def: string, dx = 6): Entity {
  return w.spawn(kind, def, e.x + dx, e.y, { w: 8, h: kind === 'npc' ? 12 : 8, gravityScale: 0, collides: false });
}

export function ids(p: PlayerState): (string | null)[] {
  return p.inventory.map((s) => (s ? `${s.id}x${s.count}` : null));
}

export function messages(w: World): string[] {
  const out: string[] = [];
  for (const ev of w.events) if (ev.type === 'message') out.push(ev.text);
  return out;
}

/** Events of one type emitted during the last tick. */
export function eventsOf<T extends GameEvent['type']>(w: World, type: T): Extract<GameEvent, { type: T }>[] {
  return w.events.filter((ev): ev is Extract<GameEvent, { type: T }> => ev.type === type);
}

/** Step `n` idle ticks. */
export function idle(w: World, n: number): void {
  for (let i = 0; i < n; i++) w.step([emptyInput()]);
}
