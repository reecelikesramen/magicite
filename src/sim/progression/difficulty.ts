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

/** Co-op scaling per extra player (GDD §2b.6, from the original's code). */
export const COOP_HP_PER_PLAYER = 0.5;
export const COOP_DAMAGE_PER_PLAYER = 0.4;

/** Combined enemy multipliers: difficulty × co-op party size. */
export function enemyScale(world: World): { hp: number; damage: number } {
  const d = difficultyMul(world);
  const extra = Math.max(0, world.players.length - 1);
  return { hp: d.enemyHp * (1 + COOP_HP_PER_PLAYER * extra), damage: d.enemyDamage * (1 + COOP_DAMAGE_PER_PLAYER * extra) };
}

/** Scale an enemy damage value for difficulty and party size (always ≥ the base value). */
export function scaleEnemyDamage(world: World, dmg: number): number {
  const m = enemyScale(world).damage;
  return m === 1 ? dmg : Math.ceil(dmg * m);
}

/**
 * Scale a freshly spawned enemy/boss's HP for difficulty and party size. Called by spawnFromSpec for
 * every enemy (level load and mid-level spawns: minions, roaming monsters, the Wraith is exempt).
 */
export function scaleSpawnedEnemy(world: World, e: { kind: string; def: string; hp: number; maxHp: number }): void {
  if ((e.kind !== 'enemy' && e.kind !== 'boss') || e.def === WRAITH_DEF) return;
  const m = enemyScale(world).hp;
  if (m === 1) return;
  e.maxHp = Math.ceil(e.maxHp * m);
  e.hp = e.maxHp;
}

/** The run's difficulty from the lobby setups: Madcap if any player picked it. */
export function runDifficulty(setups: readonly PlayerSetup[]): Difficulty {
  for (const s of setups) if (s.difficulty === 'madcap') return 'madcap';
  return 'normal';
}

/** Kept for callers: HP scaling now happens per spawn (scaleSpawnedEnemy), so this is a no-op. */
export function applyDifficultyToLevel(_world: World): void {}
