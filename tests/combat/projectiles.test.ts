import { describe, expect, it } from 'vitest';
import { explode, fireProjectile } from '../../src/sim/combat/projectiles';
import { secs, TILE } from '../../src/sim/constants';
import { Tile } from '../../src/sim/tiles';
import { FLOOR, FLOOR_Y, makeWorld, projectiles, spawnEnemy, step, stepCollect } from './helpers';

describe('projectiles', () => {
  it('pierce: a bolt (pierce 1) hits exactly two enemies in a row', () => {
    const { world, e } = makeWorld();
    const ds = [130, 150, 170].map((x) => spawnEnemy(world, 't_dummy', x, FLOOR_Y, { kbResist: 1 }));
    fireProjectile(world, e, 'bolt', 100, 124, 0, { damage: 5 });
    step(world, 40);
    expect(ds.map((d) => d.hp)).toEqual([95, 95, 100]);
  });

  it('piercing shots keep their pace through targets', () => {
    const { world, e } = makeWorld();
    spawnEnemy(world, 't_dummy', 130, FLOOR_Y, { kbResist: 1 });
    const bolt = fireProjectile(world, e, 'bolt', 100, 124, 0, { damage: 1 })!;
    step(world, 10);
    expect(bolt.dead).toBe(false);
    expect(bolt.x + bolt.w / 2).toBeCloseTo(100 + (380 / 60) * 10, 0);
  });

  it('enemy shots pass through players in dash i-frames', () => {
    const { world, e } = makeWorld();
    const hp = e.hp;
    e.invuln = 30;
    const a = fireProjectile(world, null, 'arrow', 110, 122, Math.PI, { team: 'enemy', damage: 1 })!;
    step(world, 12);
    expect(e.hp).toBe(hp);
    expect(a.x).toBeLessThan(e.x);
  });

  it('bounce: reflects off a wall once, then stops at the next wall', () => {
    const { world } = makeWorld();
    const b = fireProjectile(world, null, 't_bouncer', 360, 100, 0, { team: 'player' })!;
    step(world, 10);
    expect(b.dead).toBe(false);
    expect(b.vx).toBeLessThan(0);
    expect(b.projectile!.bouncesLeft).toBe(0);
  });

  it('never tunnels through a one-tile wall at high speed', () => {
    const { world } = makeWorld();
    world.level.grid.fill(20, FLOOR - 3, 20, FLOOR - 1, Tile.GROUND);
    const shot = fireProjectile(world, null, 't_fast', 100, 120, 0, { team: 'player' })!;
    let maxX = 0;
    for (let i = 0; i < 20; i++) {
      step(world, 1);
      if (!shot.dead) maxX = Math.max(maxX, shot.x + shot.w);
    }
    expect(shot.dead).toBe(true);
    expect(maxX).toBeLessThanOrEqual(20 * TILE + 1);
  });

  it('ghost projectiles pass through walls', () => {
    const { world } = makeWorld();
    world.level.grid.fill(20, FLOOR - 3, 20, FLOOR - 1, Tile.GROUND);
    const orb = fireProjectile(world, null, 'arcane_orb', 100, 120, 0, { team: 'player' })!;
    step(world, 60);
    expect(orb.dead).toBe(false);
    expect(orb.x).toBeGreaterThan(21 * TILE);
  });

  it('homing curves toward a target off the line of fire', () => {
    const { world, e } = makeWorld();
    const d = spawnEnemy(world, 't_dummy', 170, 70, { kbResist: 1, gravityScale: 0 });
    fireProjectile(world, e, 'arcane_orb', 100, 110, 0, { damage: 3 });
    step(world, 90);
    expect(d.hp).toBe(97);
  });

  it('team filtering: enemy shots pass enemies and hit players; player shots pass players', () => {
    const { world, e } = makeWorld({ players: 2 });
    const e2 = world.get(world.players[1]!.entityId)!;
    e2.x = 300;
    const d = spawnEnemy(world, 't_dummy', 120, FLOOR_Y, { kbResist: 1 });
    const hp = e.hp;
    fireProjectile(world, d, 'arrow', 140, 122, Math.PI, { damage: 1 });
    step(world, 30);
    expect(d.hp).toBe(100);
    expect(e.hp).toBe(hp - 1);

    e2.x = 110;
    const hp2 = e2.hp;
    const d2 = spawnEnemy(world, 't_dummy', 160, FLOOR_Y, { kbResist: 1 });
    fireProjectile(world, e, 'arrow', 90, 122, 0, { damage: 2 });
    step(world, 30);
    expect(e2.hp).toBe(hp2);
    expect(d.hp).toBe(98);
    expect(d2.hp).toBe(100); // the first dummy stopped it
  });

  it('enemy-fired projectiles default to the enemy damage and apply its statuses', () => {
    const { world, e } = makeWorld();
    const biter = spawnEnemy(world, 't_biter', 140, FLOOR_Y, { kbResist: 1 });
    const hp = e.hp;
    fireProjectile(world, biter, 'web_shot', 130, 112, Math.PI);
    step(world, 30);
    expect(e.hp).toBe(hp - 1);
    expect(e.status.some((s) => s.id === 'slow')).toBe(true);
  });

  it('explosions damage within radius, break diggable tiles (not bedrock) and splash friendlies lightly', () => {
    const { world, p, e } = makeWorld();
    const near = spawnEnemy(world, 't_dummy', 214, FLOOR_Y, { kbResist: 1 });
    const far = spawnEnemy(world, 't_dummy', 260, FLOOR_Y, { kbResist: 1 });
    world.level.grid.set(25, FLOOR + 1, Tile.BEDROCK);
    e.x = 190;
    const hp = e.hp;
    const bomb = fireProjectile(world, e, 'bomb', 200, 120, Math.PI / 2, { damage: 8, speedMul: 0 })!;
    step(world, 30);
    expect(bomb.dead).toBe(false); // resting on the floor, fuse burning
    expect(bomb.vx).toBe(0);
    expect(bomb.vy).toBe(0);
    const evs = stepCollect(world, secs(1.6));
    expect(bomb.dead).toBe(true);
    expect(evs.some((ev) => ev.type === 'particles' && ev.preset === 'explosion')).toBe(true);
    expect(near.hp).toBeLessThan(100);
    expect(far.hp).toBe(100);
    expect(e.hp).toBe(hp - 1); // friendly splash capped
    expect(p.downed).toBe(false);
    const grid = world.level.grid;
    expect(grid.get(25, FLOOR)).toBe(Tile.AIR);
    expect(grid.get(25, FLOOR + 1)).toBe(Tile.BEDROCK);
    expect(evs.some((ev) => ev.type === 'tileBroken')).toBe(true);
  });

  it('explode() never breaks tiles in towns', () => {
    const { world } = makeWorld({ town: true });
    explode(world, 200, 126, { radius: 20, damage: 5, team: 'player', breaksTiles: true });
    expect(world.level.grid.get(25, FLOOR)).toBe(Tile.GROUND);
  });

  it('water snuffs fireballs', () => {
    const { world } = makeWorld();
    world.level.grid.fill(15, FLOOR - 3, 18, FLOOR - 1, Tile.WATER);
    const fb = fireProjectile(world, null, 'fireball', 100, 115, 0, { team: 'player' })!;
    step(world, 30);
    expect(fb.dead).toBe(true);
    expect(projectiles(world)).toHaveLength(0);
  });
});
