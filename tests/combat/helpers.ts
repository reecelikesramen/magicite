/**
 * Combat test kit: a tiny hand-built level, fixture items/enemies/resources/projectiles registered into
 * the (readonly-typed) Content maps, and input helpers. Fixture ids start with `t_` so they never clash
 * with real content.
 */
import { Content } from '../../src/content';
import type { CombatProjectileDef } from '../../src/content/projectiles';
import type { EnemyDef, ItemDef, ResourceDef } from '../../src/content/types';
import { aiSystem } from '../../src/sim/ai';
import { TILE } from '../../src/sim/constants';
import { addPlayer } from '../../src/sim/player/create';
import { SYSTEMS } from '../../src/sim/systems';
import { Tile, TileGrid } from '../../src/sim/tiles';
import { emptyInput, type Entity, type PlayerInput, type PlayerState } from '../../src/sim/types';
import { World, type Level } from '../../src/sim/world';

function register<T extends { id: string }>(map: ReadonlyMap<string, T>, defs: readonly T[]): void {
  for (const d of defs) (map as Map<string, T>).set(d.id, d);
}

const base = { description: 'test', sprite: 'item_test', value: 1, tier: 1 } as const;

export const FIXTURE_ITEMS: ItemDef[] = [
  { ...base, id: 't_sword', name: 'Test Sword', category: 'weapon', maxStack: 1, use: 'swing', damage: 2, cooldown: 0.4, range: 10, knockback: 80 },
  { ...base, id: 't_dagger', name: 'Test Dagger', category: 'weapon', maxStack: 1, use: 'swing', damage: 1, cooldown: 0.25, range: 8 },
  { ...base, id: 't_great', name: 'Test Greataxe', category: 'weapon', maxStack: 1, use: 'swing', damage: 6, cooldown: 0.8, range: 12, tags: ['heavy'] },
  { ...base, id: 't_spear', name: 'Test Spear', category: 'weapon', maxStack: 1, use: 'thrust', damage: 2, cooldown: 0.45, range: 22 },
  { ...base, id: 't_venom', name: 'Venom Blade', category: 'weapon', maxStack: 1, use: 'swing', damage: 1, cooldown: 0.4, range: 10, onHit: [{ id: 'poison', duration: 3, chance: 1, power: 1 }] },
  { ...base, id: 't_pick', name: 'Test Pick', category: 'tool', maxStack: 1, use: 'swing', damage: 1, cooldown: 0.2, range: 10, tool: 'pickaxe', toolPower: 1 },
  { ...base, id: 't_pick2', name: 'Test Pick II', category: 'tool', maxStack: 1, use: 'swing', damage: 1, cooldown: 0.2, range: 10, tool: 'pickaxe', toolPower: 2 },
  { ...base, id: 't_axe', name: 'Test Axe', category: 'tool', maxStack: 1, use: 'swing', damage: 1, cooldown: 0.4, range: 10, tool: 'axe', toolPower: 1 },
  { ...base, id: 't_bow', name: 'Test Bow', category: 'weapon', maxStack: 1, use: 'shoot', damage: 1, cooldown: 0.5, projectile: 'arrow', ammoType: 't_arrow' },
  { ...base, id: 't_sticky_bow', name: 'Sticky Bow', category: 'weapon', maxStack: 1, use: 'shoot', damage: 1, cooldown: 0.5, projectile: 't_sticky', ammoType: 't_arrow' },
  { ...base, id: 't_arrow', name: 'Test Arrow', category: 'ammo', maxStack: 99, damage: 1, ammoKind: 't_arrow' },
  { ...base, id: 't_arrow2', name: 'Heavy Arrow', category: 'ammo', maxStack: 99, damage: 3, ammoKind: 't_arrow' },
  { ...base, id: 't_wand', name: 'Test Wand', category: 'weapon', maxStack: 1, use: 'cast', damage: 2, cooldown: 0.5, manaCost: 2, projectile: 'fireball' },
  { ...base, id: 't_storm', name: 'Storm Rod', category: 'weapon', maxStack: 1, use: 'cast', damage: 3, cooldown: 0.5, manaCost: 1, projectile: 'lightning' },
  { ...base, id: 't_bomb', name: 'Test Bomb', category: 'consumable', maxStack: 10, use: 'throw', damage: 5, projectile: 'bomb' },
  { ...base, id: 't_knife', name: 'Test Knife', category: 'weapon', maxStack: 20, use: 'throw', damage: 2, projectile: 'throwing_knife' },
  { ...base, id: 't_potion', name: 'Test Potion', category: 'consumable', maxStack: 10, use: 'consume', consume: { heal: 3, mana: 2 } },
  { ...base, id: 't_food', name: 'Test Food', category: 'consumable', maxStack: 10, use: 'consume', consume: { food: 3, stamina: 1 } },
  {
    ...base, id: 't_elixir', name: 'Test Elixir', category: 'consumable', maxStack: 10, use: 'consume',
    consume: { permanent: { atk: 1, maxHp: 1 }, status: [{ id: 'haste', duration: 3, chance: 1 }] },
  },
  { ...base, id: 't_block', name: 'Test Block', category: 'placeable', maxStack: 99, use: 'place', places: Tile.WOOD },
  { ...base, id: 't_torch', name: 'Test Torch', category: 'placeable', maxStack: 99, use: 'place', placesProp: 'torch' },
  { ...base, id: 't_shield', name: 'Test Shield', category: 'accessory', maxStack: 1, equipSlot: 'trinket', tags: ['shield'] },
];

export const FIXTURE_ENEMIES: EnemyDef[] = [
  { id: 't_dummy', name: 'Dummy', sprite: 'x', behavior: 'walker', w: 8, h: 8, hp: 100, damage: 0, speed: 0, sight: 0, xp: 0, gold: [0, 0], drops: [], biomes: [], weight: 0, minDepth: 99 },
  { id: 't_biter', name: 'Biter', sprite: 'x', behavior: 'walker', w: 8, h: 8, hp: 20, damage: 1, speed: 0, sight: 0, xp: 1, gold: [0, 0], drops: [], biomes: [], weight: 0, minDepth: 99, onHit: [{ id: 'slow', duration: 1, chance: 1 }] },
  { id: 't_imp', name: 'Fire Imp', sprite: 'x', behavior: 'walker', w: 8, h: 8, hp: 100, damage: 1, damageType: 'fire', speed: 0, sight: 0, xp: 0, gold: [0, 0], drops: [], biomes: [], weight: 0, minDepth: 99 },
  { id: 't_golem', name: 'Golem', sprite: 'x', behavior: 'walker', w: 8, h: 8, hp: 100, damage: 0, speed: 0, sight: 0, xp: 0, gold: [0, 0], drops: [], biomes: [], weight: 0, minDepth: 99, tags: ['immune_fire', 'weak_ice'] },
];

export const FIXTURE_RESOURCES: ResourceDef[] = [
  { id: 't_rock', name: 'Rock', sprite: 'x', tool: 'pickaxe', hardness: 1, hp: 2, w: 8, h: 7, drops: [{ item: 'stone', chance: 1, min: 1, max: 1 }], biomes: [], placement: 'ground', weight: 0, minDepth: 99 },
  { id: 't_herb', name: 'Herb', sprite: 'x', tool: 'hand', hardness: 0, hp: 1, w: 6, h: 6, drops: [], biomes: [], placement: 'ground', weight: 0, minDepth: 99 },
];

export const FIXTURE_PROJECTILES: CombatProjectileDef[] = [
  { id: 't_sticky', sprite: 'x', speed: 300, gravity: 0, size: 3, life: 2, pierce: 0, damageType: 'physical', recoverItem: 't_arrow', recoverChance: 1 },
  { id: 't_bouncer', sprite: 'x', speed: 200, gravity: 0, size: 3, life: 3, pierce: 0, bounces: 1, damageType: 'magic' },
  { id: 't_fast', sprite: 'x', speed: 900, gravity: 0, size: 2, life: 1, pierce: 0, damageType: 'physical' },
];

register(Content.items, FIXTURE_ITEMS);
register(Content.enemies, FIXTURE_ENEMIES);
register(Content.resources, FIXTURE_RESOURCES);
register(Content.projectiles, FIXTURE_PROJECTILES);

/** Level geometry (tiles): 48×24, bedrock border, solid GROUND floor from row FLOOR down. */
export const LW = 48;
export const LH = 24;
export const FLOOR = 16;
/** Floor top in px. */
export const FLOOR_Y = FLOOR * TILE;

export function makeLevel(town = false): Level {
  const grid = new TileGrid(LW, LH);
  grid.fill(0, FLOOR, LW - 1, LH - 1, Tile.GROUND);
  grid.fill(0, 0, LW - 1, 0, Tile.BEDROCK);
  grid.fill(0, LH - 1, LW - 1, LH - 1, Tile.BEDROCK);
  grid.fill(0, 0, 0, LH - 1, Tile.BEDROCK);
  grid.fill(LW - 1, 0, LW - 1, LH - 1, Tile.BEDROCK);
  return {
    info: { district: 1, biome: 'test', name: 'Test', isTown: town, isBoss: false, seed: 1 },
    grid,
    spawn: { x: 10 * TILE, y: FLOOR_Y },
    exits: [{ x: 40 * TILE, y: FLOOR_Y - 16, w: 16, h: 16, biome: '' }],
    locked: false,
    spawns: [],
    lights: [],
  };
}

const NO_AI = SYSTEMS.filter((s) => s !== aiSystem);

export interface TestWorld {
  world: World;
  p: PlayerState;
  e: Entity;
}

/** A world with one (or more) players standing on the floor at x ≈ 80 px. AI is off unless asked. */
export function makeWorld(opts: { players?: number; town?: boolean; ai?: boolean; seed?: number } = {}): TestWorld {
  const world = new World(opts.seed ?? 7, opts.ai ? SYSTEMS : NO_AI);
  for (let i = 0; i < (opts.players ?? 1); i++) addPlayer(world, { name: `P${i}`, race: '', hat: '', companion: '' });
  world.loadLevel(makeLevel(opts.town));
  const p = world.players[0]!;
  const e = world.get(p.entityId)!;
  e.y = FLOOR_Y - e.h;
  e.onGround = true;
  noCrits(p);
  return { world, p, e };
}

/** Crits off (negative chance → no RNG draw, no crit). */
export function noCrits(p: PlayerState): void {
  p.mods.critChance = -10;
}

/** Put an item in a hotbar slot and select it. */
export function give(p: PlayerState, id: string, count = 1, slot = 0, durability?: number): void {
  p.inventory[slot] = durability === undefined ? { id, count } : { id, count, durability };
  p.selected = slot;
}

export function center(e: Entity): { x: number; y: number } {
  return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
}

/** Spawn a fixture enemy with its bottom-centre at (cx, bottom). */
export function spawnEnemy(world: World, def: string, cx: number, bottom = FLOOR_Y, init: Partial<Entity> = {}): Entity {
  const d = Content.enemies.get(def)!;
  return world.spawnAt('enemy', def, cx, bottom, d.w, d.h, { hp: d.hp, maxHp: d.hp, armor: d.def ?? 0, ...init });
}

export type InputFn = (tick: number) => Partial<PlayerInput>;

/** Step `n` ticks; player 0 gets `input` (object or per-tick function), others idle. */
export function step(world: World, n: number, input: Partial<PlayerInput> | InputFn = {}): void {
  for (let i = 0; i < n; i++) {
    const inp = { ...emptyInput(), ...(typeof input === 'function' ? input(i) : input) };
    world.step([inp]);
  }
}

/** Input that presses attack on the first tick only, aiming at (x, y). */
export function tap(x: number, y: number): InputFn {
  return (i) => ({ attack: i === 0, aimX: x, aimY: y });
}

export function damageEvents(world: World, target: number): number {
  let n = 0;
  for (const ev of world.events) if (ev.type === 'damage' && ev.target === target) n++;
  return n;
}

/** Step while collecting all events (world.events is cleared each tick). */
export function stepCollect(world: World, n: number, input: Partial<PlayerInput> | InputFn = {}): World['events'] {
  const out: World['events'] = [];
  for (let i = 0; i < n; i++) {
    step(world, 1, typeof input === 'function' ? () => input(i) : input);
    out.push(...world.events);
  }
  return out;
}

export function projectiles(world: World): Entity[] {
  return world.entities.filter((x) => x.kind === 'projectile' && !x.dead);
}
