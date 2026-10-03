import { statusSystem } from '../../src/sim/combat/status';
import { TILE } from '../../src/sim/constants';
import { physicsSystem } from '../../src/sim/physics';
import { playerInputLatchSystem } from '../../src/sim/player/controller';
import { addPlayer } from '../../src/sim/player/create';
import { progressionSystem } from '../../src/sim/progression/xp';
import { exitSystem } from '../../src/sim/run';
import { Tile, TileGrid } from '../../src/sim/tiles';
import { emptyInput, type Entity, type PlayerInput, type PlayerState } from '../../src/sim/types';
import { World, type ExitPortal, type Level, type LevelInfo, type PlayerSetup, type System } from '../../src/sim/world';

export const SETUP: PlayerSetup = { name: 'TEST', race: 'drifter', hat: '', companion: '' };

/** Floor surface y (px) of the test arena. */
export const FLOOR_Y = 30 * TILE;

/**
 * Flat test arena (80×40 tiles, floor at row 30, bedrock borders). No generator involved, so these
 * tests don't depend on level-gen output.
 */
export function arenaLevel(info: Partial<LevelInfo> = {}, exits: ExitPortal[] = [], locked = false): Level {
  const w = 80;
  const h = 40;
  const g = new TileGrid(w, h);
  g.fill(0, 30, w - 1, h - 1, Tile.GROUND);
  g.fill(0, 0, w - 1, 0, Tile.BEDROCK);
  g.fill(0, 0, 0, h - 1, Tile.BEDROCK);
  g.fill(w - 1, 0, w - 1, h - 1, Tile.BEDROCK);
  return {
    info: { district: 2, biome: 'toadvale_forest', name: 'Test Arena', isTown: false, isBoss: false, seed: 1, ...info },
    grid: g,
    spawn: { x: 10 * TILE, y: FLOOR_Y },
    exits,
    locked,
    spawns: [],
    lights: [],
  };
}

/** Physics + statuses + progression + run flow: enough to exercise this workstream in isolation. */
export const TEST_SYSTEMS: readonly System[] = [physicsSystem, statusSystem, progressionSystem, exitSystem, playerInputLatchSystem];

export function makeWorld(opts: { seed?: number; players?: PlayerSetup[]; systems?: readonly System[]; level?: Level } = {}): World {
  const world = new World(opts.seed ?? 7, opts.systems ?? TEST_SYSTEMS);
  for (const s of opts.players ?? [SETUP]) addPlayer(world, s);
  world.loadLevel(opts.level ?? arenaLevel());
  world.run.path.push(world.level.info.biome);
  return world;
}

export function inp(over: Partial<PlayerInput> = {}): PlayerInput {
  return { ...emptyInput(), ...over };
}

/** Step `n` ticks with the same inputs (array per player or one input for player 0). */
export function run(world: World, n: number, inputs: PlayerInput[] | PlayerInput = []): void {
  const arr = Array.isArray(inputs) ? inputs : [inputs];
  for (let i = 0; i < n; i++) world.step(arr);
}

/** Put player `i`'s entity standing on the floor with its centre at x. */
export function placePlayer(world: World, i: number, cx: number, bottom = FLOOR_Y): Entity {
  const e = world.playerEntity(i)!;
  e.x = cx - e.w / 2;
  e.y = bottom - e.h;
  e.px = e.x;
  e.py = e.y;
  e.vx = 0;
  e.vy = 0;
  e.onGround = bottom === FLOOR_Y;
  return e;
}

/** A floating, inert enemy target (no AI moves it: gravity off, no collisions). */
export function dummy(world: World, cx: number, cy: number, hp = 50, kind: 'enemy' | 'boss' = 'enemy', def = 'test_dummy'): Entity {
  return world.spawn(kind, def, cx - 4, cy - 4, { w: 8, h: 8, hp, maxHp: hp, gravityScale: 0, collides: false });
}

/** Give player `p` skill `id` in the next free slot at `rank`, with full meters. */
export function giveSkill(p: PlayerState, id: string, rank = 1): number {
  p.skills[id] = rank;
  p.skillSlots.push(id);
  p.skillCooldowns.push(0);
  p.mana = 99;
  p.stamina = 99;
  return p.skillSlots.length - 1;
}

export function statusOf(e: Entity, id: string): number {
  return e.status.find((s) => s.id === id)?.ticks ?? 0;
}

export function count(world: World, pred: (e: Entity) => boolean): number {
  return world.entities.filter((e) => !e.dead && pred(e)).length;
}

export function messages(world: World): string[] {
  return world.events.filter((e) => e.type === 'message').map((e) => (e as { text: string }).text);
}
