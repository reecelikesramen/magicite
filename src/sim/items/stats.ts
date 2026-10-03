import { Content, maybeItem } from '../../content';
import type { StatMods } from '../../content/types';
import type { Entity, PlayerState } from '../types';

/** Merge `b` into `a` additively (resistances merged per type). */
export function addMods(a: StatMods, b: StatMods | undefined): StatMods {
  if (!b) return a;
  for (const k of Object.keys(b) as (keyof StatMods)[]) {
    if (k === 'resist') {
      const r = (a.resist ??= {});
      for (const [t, v] of Object.entries(b.resist ?? {})) r[t as keyof typeof r] = (r[t as keyof typeof r] ?? 0) + (v ?? 0);
    } else {
      (a as Record<string, number>)[k] = ((a as Record<string, number>)[k] ?? 0) + ((b as Record<string, number>)[k] ?? 0);
    }
  }
  return a;
}

/** Max stamina from level alone (original rule): 4 until Lv4, then the level, capped at 12. */
export function staminaForLevel(level: number): number {
  return Math.min(12, Math.max(4, level));
}

/** Move-speed multiplier delta per DEX point away from 3 (applied by the controller via dexSpeedMul). */
export const DEX_SPEED_PER_POINT = 0.01;

/** Movement multiplier from DEX (GDD §2b.4): ±1% per point away from 3, never below 0.8. */
export function dexSpeedMul(dex: number): number {
  return Math.max(0.8, 1 + DEX_SPEED_PER_POINT * (dex - 3));
}

/** Default creation roll when a setup doesn't provide one (15 points). */
export const DEFAULT_BASE = { hp: 5, atk: 4, dex: 4, mag: 2, lck: 3 } as const; // = creationStats(DEFAULT_BIAS)

/**
 * Recompute a player's final stats from rolled base + race + traits + hat + companion + skills +
 * equipment. Call after anything that changes those inputs. Clamps current meters to the new maxima.
 * Derived (GDD §2b): maxMana = 2 + MAG, maxStamina = 4 until Lv4 then = level (cap 12), maxHunger = 8,
 * and DEX moves speed by ±1% per point away from 3.
 */
export function recalcStats(p: PlayerState, e: Entity | undefined): void {
  const mods: StatMods = {};
  const specials: string[] = [];
  const race = Content.races.get(p.race);
  addMods(mods, race?.mods);
  if (race?.special) specials.push(race.special);
  for (const t of p.traits) {
    const def = Content.traits.get(t);
    addMods(mods, def?.mods);
    if (def?.special) specials.push(def.special);
  }
  const hat = Content.hats.get(p.hat);
  if (hat) {
    addMods(mods, hat.mods);
    if (hat.special) specials.push(hat.special);
  }
  const comp = Content.companions.get(p.companion);
  if (comp) addMods(mods, comp.mods);
  for (const [id, rank] of Object.entries(p.skills)) {
    const def = Content.skills.get(id);
    if (!def?.mods) continue;
    for (let i = 0; i < rank; i++) addMods(mods, def.mods);
  }
  for (const stack of Object.values(p.equipment)) addMods(mods, maybeItem(stack?.id)?.mods);

  const b = p.base;
  const atk = b.atk + (mods.atk ?? 0);
  const dex = b.dex + (mods.dex ?? 0);
  const mag = b.mag + (mods.mag ?? 0);
  p.mods = mods;
  p.specials = specials;
  p.stats = {
    maxHp: Math.max(1, b.hp + (mods.maxHp ?? 0)),
    maxMana: Math.max(0, 2 + mag + (mods.maxMana ?? 0)),
    maxHunger: Math.max(1, 8 + (mods.maxHunger ?? 0)),
    maxStamina: Math.max(1, staminaForLevel(p.level) + (mods.maxStamina ?? 0)),
    atk,
    dex,
    mag,
    lck: b.lck + (mods.lck ?? 0),
    def: mods.def ?? 0,
  };
  p.mana = Math.min(p.mana, p.stats.maxMana);
  p.hunger = Math.min(p.hunger, p.stats.maxHunger);
  p.stamina = Math.min(p.stamina, p.stats.maxStamina);
  if (e) {
    e.maxHp = p.stats.maxHp;
    e.hp = Math.min(e.hp, e.maxHp);
    e.armor = p.stats.def;
  }
}
