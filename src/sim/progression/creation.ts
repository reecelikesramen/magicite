import { Content } from '../../content';
import type { CompanionDef, HatDef, RaceDef, SkillDef, SkillPath, TraitDef } from '../../content/types';
import { hashSeed, type Rng } from '../../engine/rng';
import type { BaseStats } from '../types';
import type { PlayerSetup } from '../world';

/**
 * Character-creation helpers (GDD §3). Pure: everything random takes an explicit Rng, so the lobby
 * can reroll deterministically and the result can be sent over the network as plain data.
 */

/** Creation stat rules: exactly `total` points over HP/ATK/DEX/MAG/LCK within [min, max]. */
export const STAT_RULES = {
  total: 15,
  min: { hp: 4, atk: 2, dex: 2, mag: 2, lck: 2 } as Readonly<BaseStats>,
  max: { hp: 6, atk: 4, dex: 4, mag: 4, lck: 4 } as Readonly<BaseStats>,
} as const;

const KEYS: readonly (keyof BaseStats)[] = ['hp', 'atk', 'dex', 'mag', 'lck'];

/**
 * Roll creation stats. Rule: start every stat at its minimum (HP 4, others 2 → 12 points), then
 * hand out the remaining 3 points one at a time, each to a uniformly random stat that is still
 * below its cap (HP 6, others 4). Total is always exactly 15.
 */
export function rollStats(rng: Rng): BaseStats {
  const s: BaseStats = { ...STAT_RULES.min };
  let left = STAT_RULES.total - KEYS.reduce((n, k) => n + s[k], 0);
  while (left > 0) {
    const k = KEYS[rng.int(0, KEYS.length - 1)]!;
    if (s[k] >= STAT_RULES.max[k]) continue;
    s[k]++;
    left--;
  }
  return s;
}

/** True if a stat block satisfies the creation rules (used to validate lobby input). */
export function validStats(s: BaseStats): boolean {
  let total = 0;
  for (const k of KEYS) {
    const v = s[k];
    if (!Number.isInteger(v) || v < STAT_RULES.min[k] || v > STAT_RULES.max[k]) return false;
    total += v;
  }
  return total === STAT_RULES.total;
}

const ONSETS = ['b', 'br', 'd', 'dr', 'f', 'g', 'gr', 'h', 'k', 'kr', 'l', 'm', 'n', 'p', 'r', 's', 'sk', 'st', 't', 'th', 'v', 'w', 'z', ''];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'o', 'ae', 'ia', 'ei', 'ou', 'y'];
const CODAS = ['', '', '', 'n', 'r', 'l', 's', 'th', 'k', 'm', 'nd', 'rn', 'x', 'sh', 'ld'];

/** Max hero name length (GDD §3). */
export const NAME_MAX = 10;

/** Random original fantasy name from syllables, upper-case, 3..10 chars (e.g. "VORANDEL"). */
export function randomName(rng: Rng): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const syll = rng.chance(0.65) ? 2 : 3;
    let s = '';
    for (let i = 0; i < syll; i++) {
      s += i === 0 && rng.chance(0.15) ? '' : rng.pick(ONSETS);
      s += rng.pick(VOWELS);
      if (i === syll - 1 || rng.chance(0.3)) s += rng.pick(CODAS);
    }
    if (s.length >= 3 && s.length <= NAME_MAX) return s.toUpperCase();
  }
  return 'DELVER';
}

/** Clean a typed name: trims, upper-cases, keeps letters/digits/space/'-, max 10 chars. */
export function sanitizeName(name: string): string {
  const s = name.toUpperCase().replace(/[^A-Z0-9 '-]/g, '').trim().slice(0, NAME_MAX).trim();
  return s || 'DELVER';
}

/** `count` distinct random trait ids. */
export function rollTraits(rng: Rng, count = 2): string[] {
  const ids = [...Content.traits.keys()];
  rng.shuffle(ids);
  return ids.slice(0, count);
}

// --- Listings (content order) ---------------------------------------------------------------------

export const listRaces = (): RaceDef[] => [...Content.races.values()];
export const listTraits = (): TraitDef[] => [...Content.traits.values()];
export const listHats = (): HatDef[] => [...Content.hats.values()];
export const listCompanions = (): CompanionDef[] => [...Content.companions.values()];
export const listSkills = (path?: SkillPath): SkillDef[] => [...Content.skills.values()].filter((s) => !path || s.path === path);

/**
 * Cycle through `options` (◀ ▶ buttons): returns the option `dir` steps from `current` (wrapping).
 * Unknown `current` starts from the first option.
 */
export function cycleOption<T>(options: readonly T[], current: T, dir: number): T {
  if (options.length === 0) return current;
  const i = options.indexOf(current);
  const n = options.length;
  return options[(((i < 0 ? 0 : i + dir) % n) + n) % n]!;
}

/** A complete random hero for quick-start / co-op guests (default race, no hat/companion). */
export function randomSetup(rng: Rng, overrides: Partial<PlayerSetup> = {}): PlayerSetup {
  return {
    name: randomName(rng),
    race: 'drifter',
    hat: '',
    companion: '',
    traits: rollTraits(rng, 2),
    stats: rollStats(rng),
    difficulty: 'normal',
    ...overrides,
  };
}

/** Daily-run seed: the same for everyone on a given date string ("YYYY-MM-DD"). */
export function dailySeed(date: string): number {
  return hashSeed(`shardfall-daily:${date.trim()}`);
}
