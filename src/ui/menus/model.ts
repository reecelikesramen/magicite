import { Content } from '../../content';
import type { Rng } from '../../engine/rng';
import { BIAS_STATS, creationStats, randomName, rollBias, rollTraits, sanitizeName } from '../../sim/progression/creation';
import type { BiasStat, StatBias } from '../../sim/types';
import type { PlayerSetup } from '../../sim/world';

/**
 * Pure menu/creation models (no Pixi, no DOM) so navigation and the setup a menu produces are
 * unit-testable. The view (view.ts) only renders these.
 */

export interface MenuItem {
  id: string;
  label: string;
  /** Current value shown on the right (cyclable items). */
  value?: string;
  /** Item can be cycled with left/right. */
  cycle?: boolean;
  disabled?: boolean;
  /** Small note under the menu when this item is focused. */
  hint?: string;
}

export interface MenuModel {
  title: string;
  subtitle?: string;
  items: MenuItem[];
  focus: number;
  /** Status / error line. */
  message?: string;
}

/** Move focus by `dir`, skipping disabled items, wrapping around. */
export function moveFocus(m: MenuModel, dir: number): number {
  const n = m.items.length;
  if (n === 0) return 0;
  let i = m.focus;
  for (let k = 0; k < n; k++) {
    i = (((i + dir) % n) + n) % n;
    if (!m.items[i]!.disabled) return i;
  }
  return m.focus;
}

export function cycleIndex(i: number, n: number, dir: number): number {
  return n <= 0 ? 0 : (((i + dir) % n) + n) % n;
}

// ------------------------------------------------------------------------------------------------
// Character creation
// ------------------------------------------------------------------------------------------------

export const STAT_LABEL: Record<BiasStat | 'lck', string> = { hp: 'HP', atk: 'ATK', dex: 'DEX', mag: 'MAG', lck: 'LCK' };

/** All legal "good" pairs, in a stable order. */
export const GOOD_PAIRS: readonly [BiasStat, BiasStat][] = (() => {
  const out: [BiasStat, BiasStat][] = [];
  for (let i = 0; i < BIAS_STATS.length; i++) for (let j = i + 1; j < BIAS_STATS.length; j++) out.push([BIAS_STATS[i]!, BIAS_STATS[j]!]);
  return out;
})();

export interface CreationState {
  name: string;
  race: string;
  hat: string;
  companion: string;
  traits: [string, string];
  goodPair: number;
  /** Index into the stats not in the good pair. */
  bad: number;
  difficulty: 'normal' | 'madcap';
}

export function badOptions(goodPair: number): BiasStat[] {
  const g = GOOD_PAIRS[goodPair]!;
  return BIAS_STATS.filter((k) => !g.includes(k));
}

export function biasOf(c: CreationState): StatBias {
  const g = GOOD_PAIRS[c.goodPair]!;
  const bads = badOptions(c.goodPair);
  return { good: [g[0], g[1]], bad: bads[c.bad % bads.length]! };
}

export function randomCreation(rng: Rng, races: readonly string[]): CreationState {
  const bias = rollBias(rng);
  const goodPair = Math.max(0, GOOD_PAIRS.findIndex(([a, b]) => bias.good.includes(a) && bias.good.includes(b)));
  const traits = rollTraits(rng, 2);
  return {
    name: randomName(rng),
    race: races.includes('drifter') ? 'drifter' : (races[0] ?? 'drifter'),
    hat: '',
    companion: '',
    traits: [traits[0] ?? '', traits[1] ?? ''],
    goodPair,
    bad: Math.max(0, badOptions(goodPair).indexOf(bias.bad ?? badOptions(goodPair)[0]!)),
    difficulty: 'normal',
  };
}

export function setupFromCreation(c: CreationState): PlayerSetup {
  const traits = [...new Set(c.traits.filter((t) => t && Content.traits.has(t)))];
  return {
    name: sanitizeName(c.name) || 'DELVER',
    race: c.race,
    hat: c.hat,
    companion: c.companion,
    traits,
    bias: biasOf(c),
    difficulty: c.difficulty,
  };
}

export function statLine(c: CreationState): string {
  const s = creationStats(biasOf(c));
  const race = Content.races.get(c.race)?.mods;
  const v = (k: BiasStat | 'lck') => s[k] + ((k === 'hp' ? race?.maxHp : race?.[k]) ?? 0);
  return (['hp', 'atk', 'dex', 'mag', 'lck'] as const).map((k) => `${STAT_LABEL[k]} ${v(k)}`).join('  ');
}

/** Items for the creation screen, built from state + what is unlocked. */
export function creationItems(c: CreationState, opts: { races: string[]; hats: string[]; companions: string[]; startLabel: string }): MenuItem[] {
  const g = GOOD_PAIRS[c.goodPair]!;
  const bads = badOptions(c.goodPair);
  const traitName = (id: string) => Content.traits.get(id)?.name ?? 'None';
  const items: MenuItem[] = [
    { id: 'name', label: 'Name', value: c.name, hint: 'Type to rename, Enter for a random name' },
    { id: 'race', label: 'Race', value: Content.races.get(c.race)?.name ?? c.race, cycle: opts.races.length > 1, hint: Content.races.get(c.race)?.description },
    { id: 'good', label: 'Strong', value: `${STAT_LABEL[g[0]]} + ${STAT_LABEL[g[1]]}`, cycle: true, hint: 'Grow every 2 levels (+1 now)' },
    { id: 'bad', label: 'Weak', value: STAT_LABEL[bads[c.bad % bads.length]!], cycle: true, hint: 'Grows every 4 levels (-1 now)' },
    { id: 'trait1', label: 'Trait', value: traitName(c.traits[0]), cycle: true, hint: Content.traits.get(c.traits[0])?.description },
    { id: 'trait2', label: 'Trait', value: traitName(c.traits[1]), cycle: true, hint: Content.traits.get(c.traits[1])?.description },
  ];
  if (opts.companions.length) items.push({ id: 'companion', label: 'Companion', value: Content.companions.get(c.companion)?.name ?? 'None', cycle: true, hint: Content.companions.get(c.companion)?.description });
  if (opts.hats.length) items.push({ id: 'hat', label: 'Hat', value: Content.hats.get(c.hat)?.name ?? 'None', cycle: true, hint: Content.hats.get(c.hat)?.description });
  items.push(
    { id: 'difficulty', label: 'Difficulty', value: c.difficulty === 'madcap' ? 'Madcap' : 'Normal', cycle: true, hint: c.difficulty === 'madcap' ? 'Tougher foes, the Wraith comes early' : 'The intended way to play' },
    { id: 'start', label: opts.startLabel },
    { id: 'back', label: 'Back' },
  );
  return items;
}

/** Apply a left/right cycle on creation item `id`. */
export function cycleCreation(c: CreationState, id: string, dir: number, opts: { races: string[]; hats: string[]; companions: string[] }): void {
  const traitIds = ['', ...Content.traits.keys()];
  switch (id) {
    case 'race': {
      const i = opts.races.indexOf(c.race);
      c.race = opts.races[cycleIndex(i < 0 ? 0 : i, opts.races.length, dir)] ?? c.race;
      break;
    }
    case 'good':
      c.goodPair = cycleIndex(c.goodPair, GOOD_PAIRS.length, dir);
      c.bad = 0;
      break;
    case 'bad':
      c.bad = cycleIndex(c.bad, badOptions(c.goodPair).length, dir);
      break;
    case 'trait1':
    case 'trait2': {
      const slot = id === 'trait1' ? 0 : 1;
      const other = c.traits[1 - slot];
      let i = traitIds.indexOf(c.traits[slot]);
      for (let k = 0; k < traitIds.length; k++) {
        i = cycleIndex(i < 0 ? 0 : i, traitIds.length, dir);
        if (!traitIds[i] || traitIds[i] !== other) break;
      }
      c.traits[slot] = traitIds[i] ?? '';
      break;
    }
    case 'companion': {
      const list = ['', ...opts.companions];
      c.companion = list[cycleIndex(Math.max(0, list.indexOf(c.companion)), list.length, dir)] ?? '';
      break;
    }
    case 'hat': {
      const list = ['', ...opts.hats];
      c.hat = list[cycleIndex(Math.max(0, list.indexOf(c.hat)), list.length, dir)] ?? '';
      break;
    }
    case 'difficulty':
      c.difficulty = c.difficulty === 'madcap' ? 'normal' : 'madcap';
      break;
  }
}

/** Room codes are shown as "ABC-123"; typing accepts letters/digits only. */
export function formatRoomCode(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return s.length > 3 ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
}
