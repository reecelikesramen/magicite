import type { World } from '../world';
import type { PlayerSetup } from '../world';
import { WRAITH_DEF } from './util';

export type Difficulty = 'normal' | 'madcap';

/** Multipliers applied to enemies for a difficulty. */
export interface DifficultyMul {
  /** Enemy and boss max HP. Applied at level load (src/sim/run.ts). */
  enemyHp: number;
  /** Enemy contact / projectile damage. Combat code should multiply by this (then round up). */
  enemyDamage: number;
}

const NORMAL: Readonly<DifficultyMul> = Object.freeze({ enemyHp: 1, enemyDamage: 1 });
const MADCAP: Readonly<DifficultyMul> = Object.freeze({ enemyHp: 1.6, enemyDamage: 1.5 });

/** Difficulty multipliers for the current run (allocation-free; returns a frozen constant). */
export function difficultyMul(world: World): Readonly<DifficultyMul> {
  return world.run.difficulty === 'madcap' ? MADCAP : NORMAL;
}

/** Scale an enemy damage value for the run's difficulty (always ≥ the base value). */
export function scaleEnemyDamage(world: World, dmg: number): number {
  const m = difficultyMul(world).enemyDamage;
  return m === 1 ? dmg : Math.ceil(dmg * m);
}

/** The run's difficulty from the lobby setups: Madcap if any player picked it. */
export function runDifficulty(setups: readonly PlayerSetup[]): Difficulty {
  for (const s of setups) if (s.difficulty === 'madcap') return 'madcap';
  return 'normal';
}

/** Scale HP of every enemy/boss currently in the level (called once right after level load). */
export function applyDifficultyToLevel(world: World): void {
  const m = difficultyMul(world).enemyHp;
  if (m === 1) return;
  for (const e of world.entities) {
    if (e.dead || (e.kind !== 'enemy' && e.kind !== 'boss') || e.def === WRAITH_DEF) continue;
    e.maxHp = Math.ceil(e.maxHp * m);
    e.hp = e.maxHp;
  }
}
