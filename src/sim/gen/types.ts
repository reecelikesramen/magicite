import type { BiomeDef } from '../../content/types';
import type { Rng } from '../../engine/rng';
import type { TileGrid } from '../tiles';
import type { ExitPortal, Level, SpawnSpec, StaticLight } from '../world';
import type { GenStyle } from './styles';

export interface LevelRequest {
  seed: number;
  /** 1-based run level (GDD §2b: odd = combat district, even = town, 21 = lair). */
  district: number;
  biome: string;
  /** normal district · town before a district · boss district (arena at the end) · final lair (no exits). */
  kind: 'normal' | 'town' | 'boss' | 'lair';
  /** Destination biome per exit portal (normal/boss: up to 3 options; town: [] = single gate). */
  nextBiomes: string[];
}

/**
 * Where enemies may appear, by movement type. Exposed so the enemies workstream (and run-flow
 * events such as a roaming giant monster) can place things without re-scanning the grid.
 * x,y = bottom-centre px, except `ceiling` points whose y is the ceiling surface (hang below it).
 */
export type SpawnPointKind = 'ground' | 'air' | 'ceiling' | 'turret' | 'giant';

export interface SpawnPoint {
  kind: SpawnPointKind;
  x: number;
  y: number;
  /** Distance from the player spawn in tiles (points closer than 12 are never generated). */
  dist: number;
}

/** What generateLevel returns: a plain `Level` plus generator extras (still plain data). */
export interface GeneratedLevel extends Level {
  spawnPoints: SpawnPoint[];
}

/** Per-cell generator flags (GenCtx.flags). */
export const F_PROTECT = 1; // never carved / decorated (arena shell, portal footprints, spawn pad)
export const F_CLAIM = 2; // occupied by a placed entity / structure
export const F_ROUTE = 4; // main corridor air
export const F_SECRET = 8; // secret pocket interior
export const F_NOHAZ = 16; // keep hazards / liquids out (spawn area, ladders, cliff structures)

/** Tile-space rectangle, inclusive bounds. */
export interface TRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GenCtx {
  req: LevelRequest;
  biome: BiomeDef;
  style: GenStyle;
  rng: Rng;
  grid: TileGrid;
  w: number;
  h: number;
  flags: Uint8Array;
  /** Route floor row per column (first solid row under the main corridor), -1 = none. */
  floor: Int16Array;
  /** Player spawn feet cell. */
  spawnTx: number;
  spawnTy: number;
  exits: ExitPortal[];
  /** Boss arena interior (tiles). */
  arena?: TRect;
  /** Opening in the arena's left wall (tiles); the boss fight seals it. */
  arenaDoor?: TRect;
  spawns: SpawnSpec[];
  points: SpawnPoint[];
  lights: StaticLight[];
  /** Depth factor 0..1 (level 1 → 0, level 21 → 1) for density scaling. */
  depth: number;
}
