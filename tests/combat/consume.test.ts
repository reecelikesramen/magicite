import { describe, expect, it } from 'vitest';
import { consumeFromSlot } from '../../src/sim/combat/consume';
import { TILE } from '../../src/sim/constants';
import { Tile } from '../../src/sim/tiles';
import { FLOOR, FLOOR_Y, give, makeWorld, spawnEnemy, step, stepCollect, tap } from './helpers';

describe('consume', () => {
  it('potions heal and restore mana, and are used up', () => {
    const { world, p, e } = makeWorld();
    give(p, 't_potion', 2);
    e.hp = 1;
    p.mana = 0;
    const evs = stepCollect(world, 1, tap(0, 0));
    expect(e.hp).toBe(Math.min(e.maxHp, 4));
    expect(p.mana).toBe(2);
    expect(p.inventory[0]?.count).toBe(1);
    expect(evs.some((ev) => ev.type === 'heal')).toBe(true);
    expect(evs.some((ev) => ev.type === 'sfx' && ev.id === 'drink')).toBe(true);
  });

  it('food restores hunger and stamina; holding attack eats only one', () => {
    const { world, p } = makeWorld();
    give(p, 't_food', 3);
    p.hunger = 1;
    p.stamina = 0;
    const hold = { attack: true, aimX: 0, aimY: 0 };
    step(world, 1, hold);
    expect(p.hunger).toBe(4);
    expect(p.stamina).toBe(1); // checked right away: meters regenerate stamina over time
    step(world, 119, hold);
    expect(p.hunger).toBe(4);
    expect(p.inventory[0]?.count).toBe(2);
  });

  it('permanent effects raise base stats; statuses apply', () => {
    const { world, p, e } = makeWorld();
    give(p, 't_elixir', 1);
    const atk = p.stats.atk;
    const maxHp = e.maxHp;
    step(world, 1, tap(0, 0));
    expect(p.stats.atk).toBe(atk + 1);
    expect(e.maxHp).toBe(maxHp + 1);
    expect(e.hp).toBe(e.maxHp);
    expect(e.status.some((s) => s.id === 'haste')).toBe(true);
    expect(p.inventory[0]).toBeNull();
  });

  it('consumables with a special this module does not implement are not wasted', () => {
    const { world, p } = makeWorld();
    give(p, 't_scroll', 2);
    step(world, 1, tap(0, 0));
    expect(p.inventory[0]?.count).toBe(2);
    expect(consumeFromSlot(world, p, 0)).toBe(false);
  });

  it('consumeFromSlot works from any slot (UI "use" command)', () => {
    const { world, p, e } = makeWorld();
    p.inventory[12] = { id: 't_potion', count: 1 };
    e.hp = 1;
    expect(consumeFromSlot(world, p, 12)).toBe(true);
    expect(p.inventory[12]).toBeNull();
    expect(consumeFromSlot(world, p, 12)).toBe(false);
  });
});

describe('place', () => {
  it('places a tile at the aimed empty cell within reach and consumes one', () => {
    const { world, p } = makeWorld();
    give(p, 't_block', 5);
    step(world, 1, tap(12 * TILE + 4, (FLOOR - 1) * TILE + 4));
    expect(world.level.grid.get(12, FLOOR - 1)).toBe(Tile.WOOD);
    expect(p.inventory[0]?.count).toBe(4);
  });

  it('refuses occupied cells, entities, and far cells', () => {
    const { world, p } = makeWorld();
    give(p, 't_block', 5);
    step(world, 10, tap(11 * TILE + 4, FLOOR * TILE + 4)); // solid floor
    step(world, 10, tap(10 * TILE + 4, (FLOOR - 1) * TILE + 4)); // the player's own cell
    spawnEnemy(world, 't_dummy', 13 * TILE + 4, FLOOR_Y, { kbResist: 1 });
    step(world, 10, tap(13 * TILE + 4, (FLOOR - 1) * TILE + 4)); // enemy's cell
    expect(p.inventory[0]?.count).toBe(5);
  });

  it('aiming beyond reach places the nearest open tile toward the aim (facing aim)', () => {
    const { world, p } = makeWorld();
    give(p, 't_block', 5);
    step(world, 10, tap(30 * TILE + 4, (FLOOR - 1) * TILE + 4));
    const placed = [...Array(30).keys()].filter((x) => world.level.grid.get(x, FLOOR - 1) !== Tile.AIR);
    expect(placed.length).toBeGreaterThan(0);
    expect(p.inventory[0]?.count).toBe(5 - placed.length);
    for (const x of placed) expect(x).toBeLessThanOrEqual(14); // within reach, never at the far aim
  });

  it('towns take props but no tiles (they could never be dug out again)', () => {
    const { world, p } = makeWorld({ town: true });
    give(p, 't_block', 5);
    step(world, 10, tap(12 * TILE + 4, (FLOOR - 1) * TILE + 4));
    expect(world.level.grid.get(12, FLOOR - 1)).toBe(Tile.AIR);
    expect(p.inventory[0]?.count).toBe(5);
    give(p, 't_torch', 1);
    step(world, 1, tap(12 * TILE + 4, (FLOOR - 1) * TILE + 4));
    expect(world.entities.some((x) => x.kind === 'prop' && x.def === 'torch')).toBe(true);
  });

  it('places props (torches) that glow', () => {
    const { world, p } = makeWorld();
    give(p, 't_torch', 2);
    step(world, 1, tap(12 * TILE + 4, (FLOOR - 2) * TILE + 4));
    const torch = world.entities.find((x) => x.kind === 'prop' && x.def === 'torch');
    expect(torch).toBeDefined();
    expect(torch!.light?.radius).toBeGreaterThan(0);
    step(world, 20, tap(12 * TILE + 4, (FLOOR - 2) * TILE + 4)); // same cell: refused
    expect(p.inventory[0]?.count).toBe(1);
  });
});
