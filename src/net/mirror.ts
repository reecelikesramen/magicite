import { Content } from '../content';
import { TileGrid, Tile } from '../sim/tiles';
import type { Entity } from '../sim/types';
import type { Level, World } from '../sim/world';

/**
 * Helpers for a client's *mirror* World: a World that is never stepped, whose entities are
 * created/removed by the netcode with host-assigned ids. World keeps its id index private (the sim
 * never needs to insert foreign ids), so the mirror reaches it through a narrow, checked cast
 * (covered by the mirror test in tests/net/snapshot.test.ts so a rename in world.ts fails loudly).
 */
interface WorldInternals {
  byId: Map<number, Entity>;
}

function index(world: World): Map<number, Entity> {
  const m = (world as unknown as WorldInternals).byId;
  if (!(m instanceof Map)) throw new Error('net/mirror: World.byId missing (world.ts changed?)');
  return m;
}

/** Insert an entity with its host id. */
export function mirrorAdd(world: World, e: Entity): void {
  world.entities.push(e);
  index(world).set(e.id, e);
}

/** Remove entities for which `drop(e)` is true (keeps order of the rest). */
export function mirrorRemoveWhere(world: World, drop: (e: Entity) => boolean): void {
  const ents = world.entities;
  const byId = index(world);
  let w = 0;
  for (let r = 0; r < ents.length; r++) {
    const e = ents[r]!;
    if (drop(e)) {
      if (byId.get(e.id) === e) byId.delete(e.id);
      continue;
    }
    ents[w++] = e;
  }
  ents.length = w;
}

/** Drop every entity. */
export function mirrorClear(world: World): void {
  world.entities.length = 0;
  index(world).clear();
}

/** A blank entity shell (fields are filled from snapshot rows). */
export function blankEntity(id: number): Entity {
  return {
    id, kind: 'prop', def: '', team: 'neutral', x: 0, y: 0, w: 8, h: 8, vx: 0, vy: 0, px: 0, py: 0, facing: 1,
    onGround: false, wallDir: 0, hitCeiling: false, inLiquid: false, onLadder: false, gravityScale: 1, collides: true,
    usesPlatforms: true, hp: 1, maxHp: 1, armor: 0, invuln: 0, hurt: 0, dead: false, age: 0, anim: 'idle', animT: 0,
    status: [], kbResist: 0,
  };
}

/** Small dark room shown while connecting (so renderers always have a level to draw). */
export function connectingLevel(): Level {
  const w = 48;
  const h = 27;
  const g = new TileGrid(w, h);
  g.fill(0, h - 2, w - 1, h - 1, Tile.BEDROCK);
  const biome = Content.biomes.keys().next().value ?? '';
  return {
    info: { district: 0, biome, name: 'Connecting…', isTown: true, isBoss: false, seed: 0 },
    grid: g,
    spawn: { x: (w * 8) / 2, y: (h - 2) * 8 },
    exits: [],
    locked: false,
    spawns: [],
    lights: [],
  };
}
