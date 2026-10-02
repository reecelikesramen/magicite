import type { PlayerState } from '../types';
import type { World } from '../world';

/** XP needed to go from `level` to level+1. Original: 8 at Lv.1, 92 at Lv.8. */
export function xpForLevel(level: number): number {
  return Math.round(8 * Math.pow(level, 1.18) + 2 * (level - 1) * (level - 1));
}

export function grantXp(world: World, p: PlayerState, amount: number): void {
  p.xp += amount;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level++;
    p.xpToNext = xpForLevel(p.level);
    p.skillPicks++;
    world.emit({ type: 'levelUp', player: p.index, level: p.level });
  }
}

/** Placeholder: level-up rewards / skill path choices are handled by the progression workstream. */
export function progressionSystem(_world: World): void {}
