import { describe, expect, it } from 'vitest';
import { PHYS, secs } from '../../src/sim/constants';
import { hazardSystem, HAZARD } from '../../src/sim/combat/hazards';
import { physicsSystem } from '../../src/sim/physics';
import { tileProps } from '../../src/sim/tiles';
import { boxGrid, ent, makeWorld, pl, place, run, settle, Tile, TILE } from './helpers';

describe('spikes', () => {
  it('hurt on touch and knock the player upward; i-frames prevent instant repeats', () => {
    const g = boxGrid(80, 40, 30);
    g.fill(20, 29, 22, 29, Tile.SPIKES);
    const w = makeWorld(g);
    settle(w, 5);
    const e = ent(w);
    place(w, 0, 21 * TILE, 30 * TILE - 4);
    const hp0 = e.hp;
    run(w, 1);
    expect(e.hp).toBe(hp0 - tileProps(Tile.SPIKES).hazard);
    run(w, 1);
    expect(e.vy).toBeLessThan(-HAZARD.spikeKnock * 0.8);
    run(w, 20);
    expect(e.hp).toBe(hp0 - 1);
  });

  it('the harmless tip band does not hurt (walking past the very top)', () => {
    const g = boxGrid(80, 40, 30);
    g.fill(20, 29, 22, 29, Tile.SPIKES);
    const w = makeWorld(g);
    settle(w, 5);
    const e = ent(w);
    place(w, 0, 21 * TILE, 29 * TILE + HAZARD.spikeInset - 0.5);
    e.vy = 0;
    hazardSystem(w);
    expect(e.hp).toBe(e.maxHp);
  });

  it('dash i-frames let you dash over spikes unharmed', () => {
    const g = boxGrid(80, 40, 30);
    g.fill(12, 29, 12, 29, Tile.SPIKES);
    const w = makeWorld(g, { spawnTx: 10 });
    settle(w, 5);
    const e = ent(w);
    place(w, 0, 11 * TILE - 2, 30 * TILE);
    run(w, 2);
    run(w, 6, (t) => ({ dash: t < 2 ? 1 : 0 }));
    expect(e.x).toBeGreaterThan(12 * TILE);
    expect(e.hp).toBe(e.maxHp);
  });
});

describe('lava', () => {
  function lavaWorld() {
    const g = boxGrid(80, 40, 34);
    g.fill(1, 26, 9, 33, Tile.GROUND);
    g.fill(10, 30, 30, 33, Tile.LAVA);
    g.fill(10, 26, 30, 29, Tile.AIR);
    g.fill(31, 26, 60, 33, Tile.GROUND);
    const w = makeWorld(g, { spawnTx: 5, floor: 26 });
    settle(w, 5);
    return w;
  }

  it('burns: damage over time (gated by i-frames), burn status, pop upward', () => {
    const w = lavaWorld();
    const e = ent(w);
    place(w, 0, 20 * TILE, 33 * TILE);
    const hp0 = e.hp;
    run(w, 1);
    expect(e.hp).toBe(hp0 - tileProps(Tile.LAVA).hazard);
    expect(e.status.some((s) => s.id === 'burn')).toBe(true);
    run(w, 1);
    expect(e.vy).toBeLessThan(0);
    run(w, secs(0.5));
    expect(e.hp).toBe(hp0 - 2); // still invulnerable
  });

  it('slows movement heavily', () => {
    const w = lavaWorld();
    const e = ent(w);
    pl(w).specials.push('burn_immune');
    place(w, 0, 15 * TILE, 33 * TILE);
    e.invuln = 9999; // no damage pops: measure pure wading speed
    run(w, 20, { moveX: 1 });
    expect(e.inLiquid).toBe(true);
    expect(Math.abs(e.vx)).toBeLessThanOrEqual(PHYS.walkSpeed * PHYS.lavaSpeedMul + 0.01);
    expect(e.status.some((s) => s.id === 'burn')).toBe(false);
  });
});

describe('water & falling', () => {
  it('deep water never drowns you', () => {
    const g = boxGrid(80, 40, 38);
    g.fill(1, 20, 78, 37, Tile.WATER);
    const w = makeWorld(g, { floor: 20 });
    const e = ent(w);
    place(w, 0, 30 * TILE, 37 * TILE);
    run(w, secs(60));
    expect(e.hp).toBe(e.maxHp);
    expect(e.inLiquid).toBe(true);
  });
});

describe('safety nets', () => {
  it('out-of-bounds players return to their last safe spot', () => {
    const w = makeWorld(boxGrid());
    settle(w, 10);
    const e = ent(w);
    const safe = { x: e.x, y: e.y };
    e.x = -100;
    e.y = 9999;
    run(w, 1);
    expect(Math.abs(e.x - safe.x)).toBeLessThan(2);
    expect(Math.abs(e.y - safe.y)).toBeLessThan(2);
    expect(e.hp).toBe(e.maxHp);
  });

  it('recovery cancels in-flight movement state (no dive slam / air dash carried to the safe spot)', () => {
    const w = makeWorld(boxGrid());
    settle(w, 10);
    const e = ent(w);
    const c = pl(w).ctl;
    c.diving = true;
    c.dashT = 3;
    c.dashDir = 1;
    c.dashAir = true;
    e.gravityScale = 0;
    e.y = 9999;
    run(w, 1);
    expect([c.diving, c.dashT, c.dashDir, c.dashAir]).toEqual([false, 0, 0, false]);
    run(w, 10);
    expect(e.onGround).toBe(true);
    expect(w.events.some((ev) => ev.type === 'sfx' && ev.id === 'slam')).toBe(false);
  });

  it('players embedded in a new solid tile are pushed out', () => {
    const w = makeWorld(boxGrid());
    settle(w, 10);
    const e = ent(w);
    const tx = Math.floor((e.x + e.w / 2) / TILE);
    w.level.grid.set(tx, Math.floor((e.y + e.h - 1) / TILE), Tile.GROUND);
    run(w, 1);
    const g = w.level.grid;
    for (let ty = Math.floor(e.y / TILE); ty <= Math.floor((e.y + e.h - 0.01) / TILE); ty++) {
      for (let x = Math.floor(e.x / TILE); x <= Math.floor((e.x + e.w - 0.01) / TILE); x++) expect(g.isSolid(x, ty)).toBe(false);
    }
    expect(e.hp).toBe(e.maxHp);
  });

  it('crushed with nowhere to go: back to the safe spot and 1 damage', () => {
    const w = makeWorld(boxGrid());
    settle(w, 10);
    const e = ent(w);
    const safe = { x: e.x, y: e.y };
    // Teleport deep inside the floor (solid all around).
    e.y = 35 * TILE;
    run(w, 1);
    expect(Math.abs(e.y - safe.y)).toBeLessThan(2);
    expect(e.hp).toBe(e.maxHp - HAZARD.crushDamage);
  });
});

describe('enemies share physics and hazards', () => {
  it('a non-player entity falls, lands and stops at walls via integrate()', () => {
    const w = makeWorld(boxGrid(40, 40, 30));
    const en = w.spawn('enemy', 'test_dummy', 20 * TILE, 10 * TILE, { w: 8, h: 6, hp: 10, maxHp: 10 });
    for (let i = 0; i < 120; i++) physicsSystem(w);
    expect(en.onGround).toBe(true);
    expect(en.y + en.h).toBe(30 * TILE);
    en.vx = 200;
    for (let i = 0; i < 120; i++) physicsSystem(w);
    expect(en.x + en.w).toBe(39 * TILE);
    expect(en.wallDir).toBe(0); // vx was zeroed on impact, so the next ticks don't push
  });

  it('enemies take spike damage; flying enemies (gravityScale 0) do not', () => {
    const g = boxGrid(40, 40, 30);
    g.fill(10, 29, 12, 29, Tile.SPIKES);
    const w = makeWorld(g);
    const walker = w.spawn('enemy', 'test_dummy', 10 * TILE, 30 * TILE - 6, { w: 8, h: 6, hp: 10, maxHp: 10 });
    const flyer = w.spawn('enemy', 'test_dummy', 11 * TILE, 30 * TILE - 6, { w: 8, h: 6, hp: 10, maxHp: 10, gravityScale: 0 });
    hazardSystem(w);
    expect(walker.hp).toBe(9);
    expect(flyer.hp).toBe(10);
  });

  it('enemies that fall out of the world are removed (but not non-colliding wall-phasers)', () => {
    const w = makeWorld(boxGrid(40, 40, 30));
    const en = w.spawn('enemy', 'test_dummy', 20 * TILE, 99 * TILE, { w: 8, h: 6 });
    const ghost = w.spawn('enemy', 'test_ghost', -4 * TILE, 10 * TILE, { w: 8, h: 6, collides: false, gravityScale: 0 });
    hazardSystem(w);
    expect(en.dead).toBe(true);
    expect(ghost.dead).toBe(false);
  });
});
