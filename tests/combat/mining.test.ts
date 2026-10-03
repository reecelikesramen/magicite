import { describe, expect, it } from 'vitest';
import { secs, TILE } from '../../src/sim/constants';
import { Tile } from '../../src/sim/tiles';
import { FLOOR, give, makeWorld, step, stepCollect } from './helpers';

/** Aim at the centre of tile (tx, ty). */
const at = (tx: number, ty: number) => ({ aimX: tx * TILE + 4, aimY: ty * TILE + 4 });

describe('tile mining', () => {
  it('a pickaxe accumulates damage on the aimed tile, then breaks it into AIR with a drop', () => {
    const { world, p } = makeWorld();
    give(p, 't_pick'); // 0.2 s cooldown × power 1 = 12 dmg per swing; GROUND mineTime 24
    const grid = world.level.grid;
    const i = FLOOR * grid.w + 10;
    step(world, 1, { attack: true, ...at(10, FLOOR) });
    expect(grid.get(10, FLOOR)).toBe(Tile.GROUND);
    expect(grid.dmg[i]).toBe(secs(0.2));
    expect(p.ctl.mineX).toBe(10);
    const evs = stepCollect(world, secs(0.2), { attack: true, ...at(10, FLOOR) });
    expect(grid.get(10, FLOOR)).toBe(Tile.AIR);
    expect(grid.dmg[i]).toBe(0);
    expect(evs.some((ev) => ev.type === 'tileBroken' && ev.tx === 10 && ev.ty === FLOOR)).toBe(true);
    expect(world.entities.some((x) => x.kind === 'pickup' && x.pickup?.item.id === 'dirt')).toBe(true);
  });

  it('wrong tools do nothing to ground; axes chop wooden tiles', () => {
    for (const item of ['t_axe', 't_sword']) {
      const { world, p } = makeWorld();
      give(p, item);
      step(world, 60, { attack: true, ...at(10, FLOOR) });
      expect(world.level.grid.get(10, FLOOR)).toBe(Tile.GROUND);
      expect(world.level.grid.dmg[FLOOR * world.level.grid.w + 10]).toBe(0);
    }
    const { world, p } = makeWorld();
    give(p, 't_axe');
    world.level.grid.set(11, FLOOR, Tile.WOOD);
    step(world, 1, { attack: true, ...at(11, FLOOR) });
    expect(world.level.grid.get(11, FLOOR)).toBe(Tile.AIR);
  });

  it('hardness above tool power clinks; a stronger pick digs it', () => {
    const weak = makeWorld();
    give(weak.p, 't_pick');
    weak.world.level.grid.set(11, FLOOR, Tile.ROCK);
    const evs = stepCollect(weak.world, 60, { attack: true, ...at(11, FLOOR) });
    expect(weak.world.level.grid.get(11, FLOOR)).toBe(Tile.ROCK);
    expect(evs.some((ev) => ev.type === 'sfx' && ev.id === 'clink')).toBe(true);

    const strong = makeWorld();
    give(strong.p, 't_pick2'); // 12 × 2 = 24 per swing; ROCK mineTime 48
    strong.world.level.grid.set(11, FLOOR, Tile.ROCK);
    step(strong.world, 1, { attack: true, ...at(11, FLOOR) });
    expect(strong.world.level.grid.get(11, FLOOR)).toBe(Tile.ROCK);
    step(strong.world, secs(0.2), { attack: true, ...at(11, FLOOR) });
    expect(strong.world.level.grid.get(11, FLOOR)).toBe(Tile.AIR);
  });

  it('bedrock never breaks', () => {
    const { world, p } = makeWorld();
    give(p, 't_pick2');
    world.level.grid.set(11, FLOOR, Tile.BEDROCK);
    step(world, 300, { attack: true, ...at(11, FLOOR) });
    expect(world.level.grid.get(11, FLOOR)).toBe(Tile.BEDROCK);
  });

  it('tiles out of reach are not mined', () => {
    const { world, p } = makeWorld();
    give(p, 't_pick2');
    world.level.grid.set(16, 12, Tile.GROUND);
    step(world, 60, { attack: true, ...at(16, 12) });
    expect(world.level.grid.get(16, 12)).toBe(Tile.GROUND);
    expect(world.level.grid.dmg[12 * world.level.grid.w + 16]).toBe(0);
  });

  it('towns cannot be dug', () => {
    const { world, p } = makeWorld({ town: true });
    give(p, 't_pick2');
    step(world, 60, { attack: true, ...at(10, FLOOR) });
    expect(world.level.grid.get(10, FLOOR)).toBe(Tile.GROUND);
  });

  it('mining wears the tool once per swing', () => {
    const { world, p } = makeWorld();
    give(p, 't_pick', 1, 0, 5);
    step(world, 1, { attack: true, ...at(10, FLOOR) });
    expect(p.inventory[0]?.durability).toBe(4);
  });
});
