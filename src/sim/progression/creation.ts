import { Content } from '../../content';
import type { CompanionDef, HatDef, RaceDef, SkillDef, SkillPath, TraitDef } from '../../content/types';
import { hashSeed, type Rng } from '../../engine/rng';
import type { BaseStats, BiasStat, StatBias } from '../types';
import type { PlayerSetup } from '../world';

/**
 * Character-creation helpers (GDD §3). Pure: everything random takes an explicit Rng, so the lobby
 * can reroll deterministically and the result can be sent over the network as plain data.
 */

/** Stats a player can pick as good/bad at creation (LCK is fixed at CREATION_BASE). */
export const BIAS_STATS: readonly BiasStat[] = ['hp', 'atk', 'dex', 'mag'];
/** Every stat starts here; HP gets HP_BONUS on top (GDD §2b.3). */
export const CREATION_BASE = 3;
export const HP_BONUS = 2;
/** Default picks when a setup has none (balanced fighter). */
export const DEFAULT_BIAS: Readonly<StatBias> = { good: ['atk', 'dex'], bad: 'mag' };

/** True if `b` is a legal pick: two distinct good stats and an optional bad stat not among them. */
export function validBias(b: StatBias | undefined | null): b is StatBias {
  if (!b || !Array.isArray(b.good) || b.good.length !== 2) return false;
  const [g1, g2] = b.good;
  if (!BIAS_STATS.includes(g1!) || !BIAS_STATS.includes(g2!) || g1 === g2) return false;
  if (b.bad === null) return true;
  return BIAS_STATS.includes(b.bad) && !b.good.includes(b.bad);
}

/** Base stats from creation picks: all 3 (HP 5), good +1, bad −1, LCK 3. */
export function creationStats(bias: StatBias = DEFAULT_BIAS): BaseStats {
  const b = validBias(bias) ? bias : DEFAULT_BIAS;
  const s: BaseStats = { hp: CREATION_BASE + HP_BONUS, atk: CREATION_BASE, dex: CREATION_BASE, mag: CREATION_BASE, lck: CREATION_BASE };
  for (const k of b.good) s[k]++;
  if (b.bad) s[b.bad]--;
  return s;
}

/** Random legal picks (the creation screen's "Reroll"). */
export function rollBias(rng: Rng): StatBias {
  const keys = rng.shuffle([...BIAS_STATS]);
  const good = [keys[0]!, keys[1]!].sort((a, b) => BIAS_STATS.indexOf(a) - BIAS_STATS.indexOf(b));
  return { good, bad: keys[2]! };
}

/** Compatibility: random creation stats (= creationStats(rollBias(rng))). */
export function rollStats(rng: Rng): BaseStats {
  return creationStats(rollBias(rng));
}

/** Best-effort picks for legacy explicit stats: highest two above base are good, lowest below is bad. */
export function inferBias(s: BaseStats): StatBias {
  const rel = (k: BiasStat) => s[k] - (CREATION_BASE + (k === 'hp' ? HP_BONUS : 0));
  const sorted = [...BIAS_STATS].sort((a, b) => rel(b) - rel(a));
  const good = sorted.slice(0, 2) as BiasStat[];
  const worst = sorted[3]!;
  return { good, bad: rel(worst) < 0 ? worst : null };
}

/** True if a stat block is exactly what some legal pick produces (lobby/network validation). */
export function validStats(s: BaseStats): boolean {
  for (let i = 0; i < BIAS_STATS.length; i++) {
    for (let j = i + 1; j < BIAS_STATS.length; j++) {
      const good = [BIAS_STATS[i]!, BIAS_STATS[j]!];
      for (const bad of [null, ...BIAS_STATS.filter((k) => !good.includes(k))]) {
        const c = creationStats({ good, bad });
        if ((Object.keys(c) as (keyof BaseStats)[]).every((k) => c[k] === s[k])) return true;
      }
    }
  }
  return false;
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
    bias: rollBias(rng),
    difficulty: 'normal',
    ...overrides,
  };
}

/** Daily-run seed: the same for everyone on a given date string ("YYYY-MM-DD"). */
export function dailySeed(date: string): number {
  return hashSeed(`shardfall-daily:${date.trim()}`);
}
