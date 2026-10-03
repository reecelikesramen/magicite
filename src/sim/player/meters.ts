import { secs } from '../constants';
import { applyDamage } from '../combat/damage';
import type { Entity, PlayerState } from '../types';
import type { World } from '../world';
import { currentLevelKey, enterLevelFor, updateDowned } from './downed';

/**
 * Meter tuning (GDD §5). Meters are small integers shown as pips on the HUD:
 * stamina (double jump / dash charges), mana, hunger. No natural HP regeneration (as in the original).
 */
export const METERS = {
  /** One stamina charge back every 1.2 s while below max. */
  staminaRegenTicks: secs(1), // GDD §2b.4: +1 per second
  /** Mana: +1 every manaBaseSecs / ((1 + manaPerMag·MAG) · (1 + mods.manaRegen)) seconds. */
  manaBaseSecs: 3.2,
  manaPerMag: 0.15,
  manaMinTicks: 6,
  /** Hunger: −1 every 50 s in districts, every 150 s in towns (scaled by mods.hungerRate). */
  hungerSecs: 50,
  hungerTownSecs: 150,
  /** At 0 hunger: −1 HP every 15 s (never in towns — towns are safe). */
  starveSecs: 15,
  starveDamage: 1,
} as const;

/** Spend `n` stamina charges if available (double jump, dash, shield blocks). */
export function spendStamina(p: PlayerState, n = 1): boolean {
  if (p.stamina < n) return false;
  p.stamina -= n;
  return true;
}

/** Spend `n` mana if available. */
export function spendMana(p: PlayerState, n: number): boolean {
  if (p.mana < n) return false;
  p.mana -= n;
  return true;
}

/** Restore stamina charges (potions, skills). Returns the amount actually restored. */
export function restoreStamina(p: PlayerState, amount: number): number {
  const before = p.stamina;
  p.stamina = Math.max(0, Math.min(p.stats.maxStamina, p.stamina + amount));
  if (p.stamina >= p.stats.maxStamina) p.ctl.staminaT = 0;
  return p.stamina - before;
}

/** Restore mana (potions, skills). Returns the amount actually restored. */
export function restoreMana(p: PlayerState, amount: number): number {
  const before = p.mana;
  p.mana = Math.max(0, Math.min(p.stats.maxMana, p.mana + amount));
  if (p.mana >= p.stats.maxMana) p.ctl.manaT = 0;
  return p.mana - before;
}

/** Eat: restore hunger (negative = drain). Returns the amount actually restored. Resets starvation. */
export function feed(p: PlayerState, amount: number): number {
  const before = p.hunger;
  p.hunger = Math.max(0, Math.min(p.stats.maxHunger, p.hunger + amount));
  if (p.hunger > 0) p.ctl.starveT = 0;
  return p.hunger - before;
}

/**
 * Heal an entity (player or not) up to maxHp and emit a `heal` event. Downed/out players can't be
 * healed — they must be revived. Returns HP actually restored.
 */
export function heal(world: World, e: Entity, amount: number): number {
  // Already at/above max (e.g. maxHp just dropped after unequipping): never heal *down*.
  if (e.dead || amount <= 0 || e.hp >= e.maxHp) return 0;
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

/** Full refill of HP and meters (level-ups). */
export function refillMeters(p: PlayerState, e: Entity | undefined): void {
  p.stamina = p.stats.maxStamina;
  p.mana = p.stats.maxMana;
  p.hunger = p.stats.maxHunger;
  p.ctl.staminaT = 0;
  p.ctl.manaT = 0;
  p.ctl.starveT = 0;
  if (e && !p.downed && !p.out) e.hp = e.maxHp;
}

/**
 * Stamina regen: one charge per METERS.staminaRegenTicks while below max. Exported so client-side
 * prediction can run it alongside controlPlayer (stamina gates double jump and dash).
 */
export function regenStamina(p: PlayerState): void {
  const max = p.stats.maxStamina;
  if (p.stamina >= max) {
    p.stamina = max;
    p.ctl.staminaT = 0;
    return;
  }
  if (++p.ctl.staminaT >= METERS.staminaRegenTicks) {
    p.ctl.staminaT = 0;
    p.stamina++;
  }
}

/** Ticks per mana point for this player (scales with MAG and mods.manaRegen). */
export function manaRegenTicks(p: PlayerState): number {
  const rate = (1 + METERS.manaPerMag * Math.max(0, p.stats.mag)) * Math.max(0.1, 1 + (p.mods.manaRegen ?? 0));
  return Math.max(METERS.manaMinTicks, Math.round(secs(METERS.manaBaseSecs) / rate));
}

function regenMana(p: PlayerState): void {
  const max = p.stats.maxMana;
  if (p.mana >= max) {
    p.mana = max;
    p.ctl.manaT = 0;
    return;
  }
  if (++p.ctl.manaT >= manaRegenTicks(p)) {
    p.ctl.manaT = 0;
    p.mana++;
  }
}

/** Ticks per hunger point lost (towns drain 3x slower; mods.hungerRate 0.25 = 25% faster drain). */
export function hungerTicks(p: PlayerState, isTown: boolean): number {
  const rate = Math.max(0.1, 1 + (p.mods.hungerRate ?? 0));
  return Math.max(1, Math.round(secs(isTown ? METERS.hungerTownSecs : METERS.hungerSecs) / rate));
}

function drainHunger(world: World, p: PlayerState, e: Entity): void {
  const isTown = world.level.info.isTown;
  if (p.hunger > 0) {
    if (++p.ctl.hungerT >= hungerTicks(p, isTown)) {
      p.ctl.hungerT = 0;
      p.hunger--;
      if (p.hunger === 2) world.emit({ type: 'message', text: 'Your stomach growls...', color: 0xd0a060, player: p.index });
      else if (p.hunger === 0) world.emit({ type: 'message', text: 'You are starving!', color: 0xe05030, player: p.index });
    }
    p.ctl.starveT = 0;
    return;
  }
  if (isTown) return; // towns are safe: no starvation damage
  if (p.ctl.starveT < secs(METERS.starveSecs)) p.ctl.starveT++;
  // Retry each tick while invulnerable so a recent hit doesn't swallow the starvation tick.
  if (p.ctl.starveT >= secs(METERS.starveSecs) && e.invuln === 0) {
    p.ctl.starveT = 0;
    applyDamage(world, e, METERS.starveDamage, { knockback: 0, type: 'physical' });
  }
}

/**
 * Meters system: level-entry bookkeeping (auto-revive), stamina/mana regen, hunger + starvation,
 * then downed/revive/bleed-out and party-wipe detection. Runs after combat/hazards each tick.
 */
export function metersSystem(world: World): void {
  if (world.run.over) return;
  const key = currentLevelKey(world);
  for (const p of world.players) if (p.ctl.levelKey !== key) enterLevelFor(world, p, key);
  for (const p of world.players) {
    p.runStats.ticksPlayed++;
    const e = world.get(p.entityId);
    if (!e || p.downed || p.out) continue;
    regenStamina(p);
    regenMana(p);
    drainHunger(world, p, e);
  }
  updateDowned(world);
}
