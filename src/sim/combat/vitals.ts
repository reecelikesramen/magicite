import type { Entity, PlayerState } from '../types';
import type { World } from '../world';

/*
 * stub: replaced by player workstream — src/sim/player/meters.ts exports heal / feed / restoreMana /
 * restoreStamina / spendMana / spendStamina with the same signatures (plus its own meter timers).
 * At integration, re-export those here (or switch the imports in combat/*) and delete these bodies.
 */

/** Heal an entity up to maxHp and emit a `heal` event. Downed/out players can't be healed. Returns HP restored. */
export function heal(world: World, e: Entity, amount: number): number {
  if (e.dead || amount <= 0) return 0;
  if (e.kind === 'player') {
    const p = world.players[e.playerIndex ?? -1];
    if (!p || p.downed || p.out) return 0;
  }
  const before = e.hp;
  e.hp = Math.min(e.maxHp, e.hp + Math.round(amount));
  const healed = e.hp - before;
  if (healed > 0) world.emit({ type: 'heal', target: e.id, amount: healed, x: e.x + e.w / 2, y: e.y });
  return healed;
}

/** Restore (or drain, if negative) hunger. Returns the change. */
export function feed(p: PlayerState, amount: number): number {
  const before = p.hunger;
  p.hunger = Math.max(0, Math.min(p.stats.maxHunger, p.hunger + amount));
  return p.hunger - before;
}

export function restoreMana(p: PlayerState, amount: number): number {
  const before = p.mana;
  p.mana = Math.max(0, Math.min(p.stats.maxMana, p.mana + amount));
  return p.mana - before;
}

export function restoreStamina(p: PlayerState, amount: number): number {
  const before = p.stamina;
  p.stamina = Math.max(0, Math.min(p.stats.maxStamina, p.stamina + amount));
  return p.stamina - before;
}

export function spendMana(p: PlayerState, n: number): boolean {
  if (p.mana < n) return false;
  p.mana -= n;
  return true;
}

export function spendStamina(p: PlayerState, n = 1): boolean {
  if (p.stamina < n) return false;
  p.stamina -= n;
  return true;
}
