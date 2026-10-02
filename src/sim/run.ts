import { rectsOverlap } from '../engine/math';
import { Content } from '../content';
import { generateLevel, type LevelRequest } from './gen';
import { spawnLevelEntities } from './spawn';
import type { World } from './world';

/** Pick the biome for a district. PLACEHOLDER: the run-flow workstream adds branching path choice. */
export function biomeForDistrict(world: World, district: number): string {
  const options = [...Content.biomes.values()].filter((b) => b.depths.includes(district));
  return (options.length ? world.rng.pick(options) : [...Content.biomes.values()][0]!).id;
}

export function requestFor(world: World, district: number): LevelRequest {
  return { seed: world.seed, district, biome: biomeForDistrict(world, district), kind: 'normal' };
}

export function enterLevel(world: World, req: LevelRequest): void {
  world.run.path.push(req.biome);
  world.loadLevel(generateLevel(req), spawnLevelEntities);
}

/** Exit portal: when every non-out player stands in the exit and one presses interact, advance. */
export function exitSystem(world: World): void {
  if (world.run.over) return;
  const exit = world.level.exit;
  let anyPressed = false;
  let allIn = true;
  for (const p of world.players) {
    if (p.out) continue;
    const e = world.get(p.entityId);
    if (!e) continue;
    const inside = rectsOverlap(e, exit);
    if (!inside && !p.downed) allIn = false;
    if (inside && world.inputs[p.index]!.interact && !p.prev.interact) anyPressed = true;
  }
  if (anyPressed && allIn) {
    for (const p of world.players) p.runStats.districtsCleared++;
    enterLevel(world, requestFor(world, world.level.info.district + 1));
  } else if (anyPressed) {
    world.emit({ type: 'message', text: 'Wait for your party at the portal!' });
  }
}
