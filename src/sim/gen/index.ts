/**
 * Procedural level generation (GDD §8). `generateLevel(req)` is a PURE function of the
 * `LevelRequest` + static content: every peer regenerates the same level locally (exact integer /
 * IEEE arithmetic only, no Math.hypot/pow/trig, no Math.random).
 *
 * Pipeline (districts): route profile (macro height curve, terraces, cliffs climbed by stairs /
 * platform stacks / ladders) → noise caverns + CA → main corridor → extra corridors joined by
 * ladder or platform shafts → exit terraces (one portal per `req.nextBiomes`) or boss arena →
 * pocket connection → guarded dressing (liquid basins & pools, special tiles, platforms, spikes;
 * a pass that breaks exit reachability is rolled back feature by feature) → rock pockets, secret
 * chest rooms, back-wall windows, mine frames → traversal repair (validate.ts movement graph:
 * every exit reachable, no reachable dead-end pits) → populate (resources, chests, enemies, decor).
 *
 * SpawnSpec `data` conventions (all optional, plain values):
 * - chests / pots (`kind: 'resource'`, defs chest_wood / chest_iron / pot): `lootTier` (0 pot,
 *   1 wooden, 2 iron, +1 for `secret: 1` sealed rooms, +district/6), roll loot from it.
 * - enemies: `point` = the spawn-point kind they were placed on (ground/air/ceiling/turret).
 * - boss: `arena: 1`, plus `doorX0 doorY0 doorX1 doorY1` (tiles, inclusive) of the opening in the arena's
 *   left wall in boss districts — fill it with BEDROCK while the fight runs (GDD: arena locks). npcs: `role` (= def). chickens: `critter: 1` (kind 'npc' unless an enemy def
 *   named 'chicken' exists). props: `decor: 1`, `hang: 1` when hanging from a ceiling (y = bottom
 *   of the cell under the ceiling).
 * - ceiling resources (placement 'ceiling'): y = the ceiling surface (spawn.ts hangs them below).
 * `GeneratedLevel.spawnPoints`: typed enemy spawn points (≥ 12 tiles from the player spawn, never in
 * a boss arena) incl. one `giant` point for a roaming giant monster when the level has room.
 */
import { Content } from '../../content';
import type { BiomeDef } from '../../content/types';
import { clamp, lerp } from '../../engine/math';
import { hashSeed, Rng } from '../../engine/rng';
import { TILE } from '../constants';
import { Tile, TileGrid } from '../tiles';
import type { Level } from '../world';
import { buildCliffs, buildEntrance, buildProfile, carveCaverns, carveCorridors, carveRoute, connectPockets, ENTRANCE_W, initGrid } from './district';
import { backWalls, cavernPools, mineSupports, platforms, rockPockets, routeBasins, secretPockets, specialTiles, spikes } from './features';
import { levelName } from './names';
import { populate } from './populate';
import { guardedPasses, repairTraversal } from './repair';
import { arenaSize, buildArena, buildExitTerraces, buildLair, EXIT_W } from './structures';
import { styleFor } from './styles';
import { buildTown } from './town';
import type { GenCtx, GeneratedLevel, LevelRequest, SpawnPoint, TRect } from './types';

export type { GeneratedLevel, LevelRequest, SpawnPoint, SpawnPointKind } from './types';
export { describeLevel } from './describe';
export { analyzeTraversal, checkLevel, MOVE, softLockCount, type LevelReport, type Traversal } from './validate';
export { gridHash } from './grid';

/** Town level size (GDD §8: flat ≈ 90×30 street). */
export const TOWN_SIZE = { w: [90, 100] as [number, number], h: 30 };
/** Widest district (GDD §8: ≈ 160–260 tiles). Boss districts trade route length for their arena. */
export const MAX_DISTRICT_W = 260;

/**
 * Generate a level. PURE function of the request (and the static content tables): clients
 * regenerate levels locally from the `LevelRequest` instead of downloading tiles.
 */
export function generateLevel(req: LevelRequest): GeneratedLevel {
  const biome = Content.biomes.get(req.biome) ?? Content.biomes.get('woods') ?? [...Content.biomes.values()][0]!;
  const rng = new Rng(hashSeed(`gen:${req.seed}:${req.district}:${req.biome}:${req.kind}`));
  const nameRng = rng.fork('name');
  const style = styleFor(biome);
  let w: number;
  let h: number;
  if (req.kind === 'town') {
    w = rng.int(TOWN_SIZE.w[0], TOWN_SIZE.w[1]);
    h = TOWN_SIZE.h;
  } else if (req.kind === 'lair') {
    const lair = biome.id === 'lair' ? biome : Content.biomes.get('lair');
    w = lair ? rng.int(lair.size.w[0], lair.size.w[1]) : 104;
    h = lair ? rng.int(lair.size.h[0], lair.size.h[1]) : 36;
  } else {
    w = rng.int(biome.size.w[0], biome.size.w[1]);
    h = rng.int(biome.size.h[0], biome.size.h[1]);
    if (req.kind === 'boss') {
      const a = arenaSize(biome.boss);
      w = Math.min(w - 30 + a.w + 4, MAX_DISTRICT_W);
      h = Math.max(h, a.h + 14);
    }
  }
  const ctx: GenCtx = {
    req,
    biome,
    style,
    rng,
    grid: new TileGrid(w, h),
    w,
    h,
    flags: new Uint8Array(w * h),
    floor: new Int16Array(w).fill(-1),
    spawnTx: 4,
    spawnTy: h - 3,
    exits: [],
    spawns: [],
    points: [],
    lights: [],
    depth: clamp((req.district - 1) / 20, 0, 1),
  };
  if (req.kind === 'town') buildTown(ctx);
  else if (req.kind === 'lair') buildLairLevel(ctx);
  else buildDistrictLevel(ctx, req.kind === 'boss');

  const arena = ctx.arena ? tileRectToPx(ctx.arena) : undefined;
  return {
    info: {
      district: req.district,
      biome: biome.id,
      name: levelName(req, biome, nameRng),
      isTown: req.kind === 'town',
      isBoss: req.kind === 'boss' || req.kind === 'lair',
      seed: req.seed,
    },
    grid: ctx.grid,
    spawn: { x: ctx.spawnTx * TILE + TILE / 2, y: (ctx.spawnTy + 1) * TILE },
    exits: ctx.exits,
    locked: req.kind === 'boss' || req.kind === 'lair',
    ...(arena ? { arena } : {}),
    spawns: ctx.spawns,
    lights: ctx.lights,
    spawnPoints: ctx.points,
  };
}

/** Spawn points of a generated level (empty for levels from elsewhere). */
export function levelSpawnPoints(level: Level): readonly SpawnPoint[] {
  return (level as Partial<GeneratedLevel>).spawnPoints ?? [];
}

function tileRectToPx(r: TRect): { x: number; y: number; w: number; h: number } {
  return { x: r.x0 * TILE, y: r.y0 * TILE, w: (r.x1 - r.x0 + 1) * TILE, h: (r.y1 - r.y0 + 1) * TILE };
}

function buildDistrictLevel(ctx: GenCtx, boss: boolean): void {
  const { rng, w, h, req, biome } = ctx;
  initGrid(ctx);
  const a = boss ? arenaSize(biome.boss) : null;
  const arenaX0 = a ? w - 1 - (a.w + 4) : w - 1;
  const routeEnd = a ? arenaX0 : w - 1;
  let endFloor: number | undefined;
  if (a) endFloor = clamp(Math.round(lerp(a.h + 4, h - 6, rng.range(0.25, 0.75))), a.h + 4, h - 6);
  const profile = buildProfile(ctx, routeEnd, a ? 6 : EXIT_W + 8, endFloor);
  const cavEnd = a ? routeEnd - 3 : w - EXIT_W - 6;
  carveCaverns(ctx, ENTRANCE_W + 2, cavEnd);
  carveRoute(ctx, profile);
  buildEntrance(ctx, profile);
  buildCliffs(ctx, profile);
  carveCorridors(ctx, profile, ENTRANCE_W + 6, cavEnd - 4);
  if (a) ctx.arena = buildArena(ctx, arenaX0, profile.floor[routeEnd - 1]!, a, req.nextBiomes);
  else buildExitTerraces(ctx, profile, req.nextBiomes);
  connectPockets(ctx);
  guardedPasses(ctx, [(c, check) => routeBasins(c, ENTRANCE_W + 8, cavEnd - 6, check), cavernPools, specialTiles, platforms, spikes]);
  rockPockets(ctx);
  const secrets = secretPockets(ctx);
  backWalls(ctx);
  mineSupports(ctx);
  const t = repairTraversal(ctx);
  populate(ctx, t, secrets);
  if (ctx.arena) bossSpawn(ctx, biome, ctx.arena, 0.4);
}

function buildLairLevel(ctx: GenCtx): void {
  ctx.arena = buildLair(ctx);
  specialTiles(ctx);
  const t = repairTraversal(ctx, 2);
  populate(ctx, t, []);
  bossSpawn(ctx, ctx.biome.id === 'lair' ? ctx.biome : (Content.biomes.get('lair') ?? ctx.biome), ctx.arena, 0.82);
}

function bossSpawn(ctx: GenCtx, biome: BiomeDef, a: TRect, at: number): void {
  const exitsLeft = ctx.exits.length ? Math.min(...ctx.exits.map((e) => e.x / TILE)) - 3 : a.x1;
  const want = Math.round(lerp(a.x0 + 4, Math.min(a.x1, exitsLeft) - 4, at));
  // Nearest arena-floor column with room for the boss's body (default 4×3 tiles before boss content).
  const def = Content.bosses.get(biome.boss);
  const half = Math.ceil((def?.w ?? 32) / TILE / 2);
  const tall = Math.ceil((def?.h ?? 24) / TILE);
  const room = (x: number): boolean => {
    for (let xx = x - half; xx <= x + half; xx++) for (let y = a.y1 - tall + 1; y <= a.y1; y++) if (ctx.grid.get(xx, y) !== Tile.AIR) return false;
    return true;
  };
  let x = want;
  for (let d = 0; d < a.x1 - a.x0; d++) {
    if (room(want - d)) {
      x = want - d;
      break;
    }
    if (room(want + d)) {
      x = want + d;
      break;
    }
  }
  const data: Record<string, number> = { arena: 1 };
  const door = ctx.arenaDoor;
  if (door) Object.assign(data, { doorX0: door.x0, doorY0: door.y0, doorX1: door.x1, doorY1: door.y1 });
  ctx.spawns.push({ kind: 'boss', def: biome.boss, x: x * TILE + TILE / 2, y: (a.y1 + 1) * TILE, data });
}
