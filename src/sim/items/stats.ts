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

/**
 * Recompute a player's final stats from race base + level + skills + equipment + hat + companion.
 * Call after anything that changes those inputs. Clamps current meters to the new maxima.
 */
export function recalcStats(p: PlayerState, e: Entity | undefined): void {
  const race = Content.races.get(p.race);
  const base = race?.base ?? { maxHp: 5, maxMana: 3, maxHunger: 8, maxStamina: 5, atk: 1, dex: 1, mag: 1 };
  const mods: StatMods = {};
  const specials: string[] = [];
  addMods(mods, race?.mods);
  const hat = Content.hats.get(p.hat);
  if (hat) {
    addMods(mods, hat.mods);
    if (hat.special) specials.push(hat.special);
  }
  const comp = Content.companions.get(p.companion);
  if (comp) addMods(mods, comp.mods);
  for (const [path, rank] of Object.entries(p.skills)) {
    const def = Content.skills.get(path);
    if (!def) continue;
    for (let i = 0; i < rank && i < def.ranks.length; i++) {
      const node = def.ranks[i]!;
      addMods(mods, node.mods);
      if (node.special) specials.push(node.special);
    }
  }
  for (const stack of Object.values(p.equipment)) addMods(mods, maybeItem(stack?.id)?.mods);

  p.mods = mods;
  p.specials = specials;
  p.stats = {
    maxHp: Math.max(1, base.maxHp + (mods.maxHp ?? 0)),
    maxMana: Math.max(0, base.maxMana + (mods.maxMana ?? 0)),
    maxHunger: Math.max(1, base.maxHunger + (mods.maxHunger ?? 0)),
    maxStamina: Math.max(1, base.maxStamina + (mods.maxStamina ?? 0)),
    atk: base.atk + (mods.atk ?? 0),
    dex: base.dex + (mods.dex ?? 0),
    mag: base.mag + (mods.mag ?? 0),
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
