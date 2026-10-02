/** Public entry point of the simulation. Pure TS, no DOM: runs in the browser, Bun/Deno servers and tests. */
import { addPlayer } from './player/create';
import { enterLevel, requestFor } from './run';
import { SYSTEMS } from './systems';
import { World, type PlayerSetup } from './world';

export { World } from './world';
export type { Level, LevelInfo, PlayerSetup, SpawnSpec } from './world';
export * from './types';

/** Create a world, add players, and load district 1. */
export function createRun(seed: number, setups: PlayerSetup[]): World {
  const world = new World(seed, SYSTEMS);
  for (const s of setups) addPlayer(world, s);
  enterLevel(world, requestFor(world, 1));
  return world;
}
