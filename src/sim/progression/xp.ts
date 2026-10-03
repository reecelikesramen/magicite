import { SKILL_LEVELS } from '../../content/skills';
import { recalcStats } from '../items/stats';
import type { BaseStats, PlayerState } from '../types';
import type { World } from '../world';
import { refreshSkillOffer } from './offers';
import { refillAll } from './util';

// The tick-level orchestrator lives in system.ts; systems.ts imports it from here.
export { progressionSystem } from './system';

/**
 * XP needed to go from `level` to level+1. Linear: 8 at Lv1, +12 per level → 92 at Lv8 (matches the
 * original's HUD readings "0/8" at Lv1 and "15/92" at Lv8), 296 at Lv25.
 */
export function xpForLevel(level: number): number {
  return 8 + 12 * (Math.max(1, level) - 1);
}

/** Total XP needed to reach `level` from Lv1. */
export function totalXpForLevel(level: number): number {
  let t = 0;
  for (let l = 1; l < level; l++) t += xpForLevel(l);
  return t;
}

export const STAT_KEYS: readonly (keyof BaseStats)[] = ['hp', 'atk', 'dex', 'mag', 'lck'];
const STAT_LABEL: Record<keyof BaseStats, string> = { hp: 'HP', atk: 'ATK', dex: 'DEX', mag: 'MAG', lck: 'LCK' };

/**
 * Grant XP to a player (kills are shared by the party: see combat/damage killEntity). The `bookworm`
 * trait adds +25% (one bonus point per 4 base XP earned, tracked via runStats.xpEarned so it is exact
 * and integer). Multiple level-ups in one grant are handled.
 */
export function grantXp(world: World, p: PlayerState, amount: number): void {
  if (amount <= 0) return;
  const before = p.runStats.xpEarned ?? 0;
  let gain = amount;
  if (p.specials.includes('bookworm')) gain += Math.floor((before + amount) / 4) - Math.floor(before / 4);
  p.runStats.xpEarned = before + amount;
  p.xp += gain;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    levelUp(world, p);
  }
}

/**
 * One level-up (GDD §5): +1 to a random base stat (world.rng), recompute stats, full refill of HP
 * and meters. At levels 5/10/15/20/25 a skill pick is granted and an offer generated.
 */
export function levelUp(world: World, p: PlayerState): void {
  p.level++;
  p.xpToNext = xpForLevel(p.level);
  const stat = STAT_KEYS[world.rng.int(0, STAT_KEYS.length - 1)]!;
  p.base[stat]++;
  const e = world.get(p.entityId);
  recalcStats(p, e);
  refillAll(p, e);
  if ((p.runStats.level ?? 1) < p.level) p.runStats.level = p.level;
  if (SKILL_LEVELS.includes(p.level)) {
    p.skillPicks++;
    refreshSkillOffer(world, p);
  }
  const x = e ? e.x + e.w / 2 : 0;
  const y = e ? e.y : 0;
  world.emit({ type: 'levelUp', player: p.index, level: p.level });
  world.emit({ type: 'message', text: `Level ${p.level}! +1 ${STAT_LABEL[stat]}`, color: 0xfff080, player: p.index });
  world.emit({ type: 'sfx', id: 'level_up', x, y });
  world.emit({ type: 'particles', preset: 'level_up', x, y: e ? e.y + e.h : 0, count: 20, color: 0xfff0a0 });
}
