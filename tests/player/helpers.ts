import { TILE } from '../../src/sim/constants';
import { addPlayer } from '../../src/sim/player/create';
import { SYSTEMS } from '../../src/sim/systems';
import { Tile, TileGrid } from '../../src/sim/tiles';
import { emptyInput, type Entity, type PlayerInput, type PlayerState } from '../../src/sim/types';
import { World } from '../../src/sim/world';

export { Tile, TILE };

/** Closed box level: bedrock border, solid floor from row `floor` down. */
export function boxGrid(w = 80, h = 40, floor = 30): TileGrid {
  const g = new TileGrid(w, h);
  g.fill(0, floor, w - 1, h - 1, Tile.GROUND);
  g.fill(0, 0, w - 1, 0, Tile.BEDROCK);
  g.fill(0, 0, 0, h - 1, Tile.BEDROCK);
  g.fill(w - 1, 0, w - 1, h - 1, Tile.BEDROCK);
  g.fill(0, h - 1, w - 1, h - 1, Tile.BEDROCK);
  return g;
}

export interface WorldOpts {
  players?: number;
  /** Spawn tile column and floor row (spawn = bottom-centre of that tile column on top of `floor`). */
  spawnTx?: number;
  floor?: number;
  isTown?: boolean;
  district?: number;
  seed?: number;
}

/** A world on a hand-made grid with the full system pipeline (no enemies unless spawned). */
export function makeWorld(grid: TileGrid, opts: WorldOpts = {}): World {
  const world = new World(opts.seed ?? 1, SYSTEMS);
  for (let i = 0; i < (opts.players ?? 1); i++) addPlayer(world, { name: `P${i}`, race: 'drifter', hat: '', companion: '' });
  loadTestLevel(world, grid, opts);
  return world;
}

export function loadTestLevel(world: World, grid: TileGrid, opts: WorldOpts = {}): void {
  const floor = opts.floor ?? 30;
  const sx = opts.spawnTx ?? 10;
  world.run.path.push('test');
  world.loadLevel({
    info: { district: opts.district ?? 1, biome: 'test', name: 'Test', isTown: !!opts.isTown, isBoss: false, seed: 1 },
    grid,
    spawn: { x: sx * TILE + TILE / 2, y: floor * TILE },
    exits: [],
    locked: false,
    spawns: [],
    lights: [],
  });
}

export function ent(world: World, i = 0): Entity {
  return world.playerEntity(i)!;
}

export function pl(world: World, i = 0): PlayerState {
  return world.players[i]!;
}

/** Place player i with its feet at pixel row `bottom`, centred on pixel column `cx`. */
export function place(world: World, i: number, cx: number, bottom: number): Entity {
  const e = ent(world, i);
  e.x = cx - e.w / 2;
  e.y = bottom - e.h;
  e.px = e.x;
  e.py = e.y;
  e.vx = 0;
  e.vy = 0;
  return e;
}

export type InputFn = (tick: number) => Partial<PlayerInput>;
type InputSrc = Partial<PlayerInput> | InputFn;

function inputsFor(world: World, t: number, inputs: InputSrc[]): PlayerInput[] {
  const arr: PlayerInput[] = [];
  for (let i = 0; i < world.players.length; i++) {
    const src = inputs[i];
    const part = typeof src === 'function' ? src(t) : (src ?? {});
    arr.push({ ...emptyInput(), ...part });
  }
  return arr;
}

/** Step `n` ticks; `inputs[i]` gives player i's input per tick (relative tick number). */
export function run(world: World, n: number, ...inputs: InputSrc[]): void {
  for (let t = 0; t < n; t++) world.step(inputsFor(world, t, inputs));
}

/** Step until `pred()` holds or `max` ticks pass; returns ticks stepped. */
export function runUntil(world: World, max: number, pred: () => boolean, ...inputs: InputSrc[]): number {
  let t = 0;
  while (t < max && !pred()) {
    world.step(inputsFor(world, t, inputs));
    t++;
  }
  return t;
}

/** Let everyone settle on the ground with no input. */
export function settle(world: World, ticks = 30): void {
  run(world, ticks);
}
