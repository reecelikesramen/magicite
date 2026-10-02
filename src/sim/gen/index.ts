import { Content } from '../../content';
import { hashSeed, Rng } from '../../engine/rng';
import { TILE } from '../constants';
import { Tile, TileGrid, Wall } from '../tiles';
import type { Level, SpawnSpec } from '../world';

export interface LevelRequest {
  seed: number;
  /** 1-based district depth. */
  district: number;
  biome: string;
  /** normal district · town before a district · boss district (arena at the end) · final lair (no exits). */
  kind: 'normal' | 'town' | 'boss' | 'lair';
  /** Destination biome per exit portal (normal/boss: up to 3 options; town: [] = single gate). */
  nextBiomes: string[];
}

/**
 * PLACEHOLDER generator (scaffold): a rolling cave floor with a few platforms. The level-gen
 * workstream replaces this with proper per-biome generation + traversability validation.
 */
export function generateLevel(req: LevelRequest): Level {
  const rng = new Rng(hashSeed(`${req.seed}:${req.district}:${req.biome}:${req.kind}`));
  const biome = Content.biomes.get(req.biome);
  const w = 120;
  const h = 48;
  const g = new TileGrid(w, h);
  g.fillWall(0, 0, w - 1, h - 1, Wall.CAVE);
  let ground = 34;
  const heights: number[] = [];
  for (let x = 0; x < w; x++) {
    if (x > 6 && x < w - 6 && rng.chance(0.18)) ground += rng.int(-2, 2);
    ground = Math.max(22, Math.min(40, ground));
    heights.push(ground);
    g.fill(x, ground, x, h - 1, Tile.GROUND);
    for (let y = ground + 3; y < h; y++) if (rng.chance(0.25)) g.set(x, y, Tile.ROCK);
  }
  g.fill(0, 0, w - 1, 2, Tile.GROUND);
  g.fill(0, 0, 1, h - 1, Tile.BEDROCK);
  g.fill(w - 2, 0, w - 1, h - 1, Tile.BEDROCK);
  g.fill(0, h - 1, w - 1, h - 1, Tile.BEDROCK);
  for (let i = 0; i < 10; i++) {
    const px = rng.int(8, w - 14);
    const py = heights[px]! - rng.int(4, 7);
    g.fill(px, py, px + rng.int(3, 6), py, Tile.PLATFORM);
  }
  const spawns: SpawnSpec[] = [];
  for (let x = 10; x < w - 10; x += rng.int(5, 9)) {
    const top = heights[x]! * TILE;
    if (rng.chance(0.5)) spawns.push({ kind: 'resource', def: 'tree_forest', x: x * TILE + 4, y: top });
    else if (rng.chance(0.4)) spawns.push({ kind: 'resource', def: 'rock_stone', x: x * TILE + 4, y: top });
    else if (rng.chance(0.5)) spawns.push({ kind: 'enemy', def: 'green_slime', x: x * TILE + 4, y: top });
  }
  const sx = 5;
  const exits = (req.kind === 'town' ? [''] : req.nextBiomes).map((biome, i) => {
    const ex = w - 8 - i * 6;
    return { x: ex * TILE - 8, y: heights[ex]! * TILE - 20, w: 24, h: 20, biome };
  });
  return {
    info: {
      district: req.district,
      biome: req.biome,
      name: `District ${req.district}: ${biome?.name ?? req.biome}`,
      isTown: req.kind === 'town',
      isBoss: req.kind === 'boss',
      seed: req.seed,
    },
    grid: g,
    spawn: { x: sx * TILE + 4, y: heights[sx]! * TILE },
    exits: req.kind === 'lair' ? [] : exits,
    locked: req.kind === 'boss',
    spawns,
    lights: [],
  };
}
