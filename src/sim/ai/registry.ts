import type { Entity } from '../types';
import type { World } from '../world';

/**
 * Boss pattern hook: src/sim/ai/bosses.ts registers `(world, boss) => void` updaters by boss id.
 * Kept as a registry so the AI dispatcher has no hard dependency on boss content.
 */
export type BossUpdater = (world: World, e: Entity) => void;
export const BOSS_UPDATERS: Record<string, BossUpdater> = {};
