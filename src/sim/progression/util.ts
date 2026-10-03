import type { StatusId } from '../../content/types';
import type { Entity, PlayerState } from '../types';
import type { World } from '../world';

/**
 * Small helpers shared by the progression modules. Some mirror helpers other workstreams add in
 * parallel (player/meters heal/refill, combat status apply); the lead may consolidate them.
 */

/** Alive and not downed/out. */
export function isActive(p: PlayerState): boolean {
  return !p.downed && !p.out;
}

/** The PlayerState owning a player entity (or undefined). */
export function playerOf(world: World, e: Entity | undefined): PlayerState | undefined {
  return e && e.kind === 'player' ? world.players[e.playerIndex ?? -1] : undefined;
}

/** Id of the run-flow hunter; skills/companions never target it (it is invulnerable anyway). */
export const WRAITH_DEF = 'blight_wraith';

/** A living enemy or boss that player skills / companions may hit. */
export function isFoe(e: Entity): boolean {
  return !e.dead && (e.kind === 'enemy' || e.kind === 'boss') && e.def !== WRAITH_DEF;
}

/** Add (or refresh, keeping the stronger/longer) a status effect on an entity. */
export function addStatus(e: Entity, id: StatusId, ticks: number, power: number, source: number): void {
  if (e.dead || ticks <= 0 || e.def === WRAITH_DEF) return;
  for (const s of e.status) {
    if (s.id !== id) continue;
    if (ticks > s.ticks) s.ticks = ticks;
    if (power > s.power) s.power = power;
    s.source = source;
    return;
  }
  e.status.push({ id, ticks, power, source });
}

export function hasStatus(e: Entity, id: StatusId): boolean {
  for (const s of e.status) if (s.id === id && s.ticks > 0) return true;
  return false;
}

/** Heal an entity up to maxHp (downed/out players can't be healed). Emits a heal event. */
export function healEntity(world: World, e: Entity, amount: number): number {
  if (e.dead || amount <= 0) return 0;
  if (e.kind === 'player') {
    const p = world.players[e.playerIndex ?? -1];
    if (!p || !isActive(p)) return 0;
  }
  const before = e.hp;
  e.hp = Math.min(e.maxHp, e.hp + Math.round(amount));
  const healed = e.hp - before;
  if (healed > 0) world.emit({ type: 'heal', target: e.id, amount: healed, x: e.x + e.w / 2, y: e.y });
  return healed;
}

/** Full refill of HP (if not downed) and meters, used on level-up. */
export function refillAll(p: PlayerState, e: Entity | undefined): void {
  p.mana = p.stats.maxMana;
  p.stamina = p.stats.maxStamina;
  p.hunger = p.stats.maxHunger;
  if (e && isActive(p)) e.hp = e.maxHp;
}

/** Increment an (optionally missing) numeric run stat. */
export function bumpStat(p: PlayerState, key: string, by = 1): void {
  p.runStats[key] = (p.runStats[key] ?? 0) + by;
}
