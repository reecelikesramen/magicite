import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim';
import { TILE } from '../../src/sim/constants';
import { placeTarget } from '../../src/sim/combat/consume';
import { Tile, TileGrid, Wall } from '../../src/sim/tiles';
import type { Level, World } from '../../src/sim/world';

const HERO = { name: 'T', race: 'drifter', hat: '', companion: '' };

/** Flat floor at row 18; the hero stands at tile x=10. */
function room(): World {
  const w = createRun(1, [HERO]);
  const g = new TileGrid(40, 24);
  g.fillWall(0, 0, 39, 23, Wall.CAVE);
  g.fill(0, 18, 39, 23, Tile.GROUND);
  const level: Level = {
    info: { district: 1, biome: 'woods', name: 'T', isTown: false, isBoss: false, seed: 1 },
    grid: g, spawn: { x: 10 * TILE + 4, y: 18 * TILE }, exits: [], locked: false, spawns: [], lights: [],
  };
  w.loadLevel(level);
  return w;
}

describe('facing-aim placement', () => {
  it('places in front of the hero at body height when aiming 48 px ahead', () => {
    const w = room();
    const e = w.playerEntity(0)!;
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const t = placeTarget(w, e, cx + 48, cy)!;
    expect(t.tx).toBe(Math.floor((e.x + e.w) / TILE) + (Math.floor((e.x + e.w) / TILE) * TILE < e.x + e.w ? 1 : 0));
    expect(t.ty).toBe(Math.floor(cy / TILE));
  });

  it('bridges a gap ahead-and-below when tilted down', () => {
    const w = room();
    const g = w.level.grid;
    const e = w.playerEntity(0)!;
    const front = Math.floor((e.x + e.w) / TILE) + 1;
    g.set(front, 18, Tile.AIR);
    const t = placeTarget(w, e, e.x + e.w / 2 + 48, e.y + e.h / 2 + 29)!;
    expect(t).toEqual({ tx: front, ty: 18 });
  });

  it('keeps exact pointer placement when the aimed tile is open and in reach', () => {
    const w = room();
    const e = w.playerEntity(0)!;
    expect(placeTarget(w, e, 12 * TILE + 3, 16 * TILE + 3)).toEqual({ tx: 12, ty: 16 });
  });

  it('refuses to place into a wall', () => {
    const w = room();
    const g = w.level.grid;
    const e = w.playerEntity(0)!;
    for (let y = 0; y < 18; y++) g.set(Math.floor((e.x + e.w) / TILE) + 1, y, Tile.GROUND);
    g.set(Math.floor((e.x + e.w) / TILE), Math.floor((e.y + e.h / 2) / TILE), Tile.GROUND);
    expect(placeTarget(w, e, e.x + e.w / 2 + 48, e.y + e.h / 2)).toBeNull();
  });
});
