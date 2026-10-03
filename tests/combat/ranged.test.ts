import { describe, expect, it } from 'vitest';
import { secs } from '../../src/sim/constants';
import { FLOOR_Y, give, makeWorld, projectiles, spawnEnemy, step, stepCollect, tap } from './helpers';

describe('shoot (bows)', () => {
  it('consumes ammo from the equipped ammo slot first, then the inventory', () => {
    const { world, p } = makeWorld();
    give(p, 't_bow');
    p.equipment.ammo = { id: 't_arrow2', count: 2 };
    p.inventory[3] = { id: 't_arrow', count: 5 };
    const cd = secs(0.5) + 1;
    step(world, cd, tap(200, 122));
    expect(p.equipment.ammo?.count).toBe(1);
    step(world, cd, tap(200, 122));
    expect(p.equipment.ammo).toBeNull();
    step(world, cd, tap(200, 122));
    expect(p.inventory[3]?.count).toBe(4);
  });

  it('does nothing without ammo and says so', () => {
    const { world, p } = makeWorld();
    give(p, 't_bow');
    const evs = stepCollect(world, 5, tap(200, 122));
    expect(projectiles(world)).toHaveLength(0);
    expect(evs.some((ev) => ev.type === 'message' && ev.text.startsWith('Out of'))).toBe(true);
  });

  it('arrow damage = weapon + ammo + DEX', () => {
    const { world, p } = makeWorld();
    give(p, 't_bow');
    p.inventory[1] = { id: 't_arrow2', count: 3 };
    const d = spawnEnemy(world, 't_dummy', 160, FLOOR_Y, { kbResist: 1 });
    step(world, 40, tap(200, 124));
    expect(d.hp).toBe(100 - (1 + 3 + p.stats.dex));
  });

  it('arrows stick into walls and can be recovered as pickups', () => {
    const { world, p } = makeWorld();
    give(p, 't_sticky_bow');
    p.inventory[1] = { id: 't_arrow', count: 1 };
    step(world, 90, tap(400, 122));
    expect(p.inventory[1]).toBeNull();
    expect(projectiles(world)).toHaveLength(0);
    const stuck = world.entities.find((x) => x.kind === 'pickup' && x.pickup?.item.id === 't_arrow');
    expect(stuck).toBeDefined();
    expect(stuck!.gravityScale).toBe(0);
    expect(stuck!.x).toBeGreaterThan(360);
    expect(stuck!.x + stuck!.w).toBeLessThanOrEqual(47 * 8);
  });
});

describe('cast (spells)', () => {
  it('costs mana, scales with MAG and fails without mana', () => {
    const { world, p } = makeWorld();
    give(p, 't_wand');
    p.mana = 3;
    const d = spawnEnemy(world, 't_dummy', 140, FLOOR_Y, { kbResist: 1 });
    step(world, 40, tap(200, 124));
    expect(p.mana).toBe(1);
    expect(d.hp).toBe(100 - (2 + p.stats.mag));
    const evs = stepCollect(world, 40, tap(200, 124));
    expect(p.mana).toBe(1);
    expect(evs.some((ev) => ev.type === 'message' && ev.text.includes('mana'))).toBe(true);
    expect(projectiles(world)).toHaveLength(0);
  });

  it('fire spells burn, and immune targets shrug them off', () => {
    const { world, p } = makeWorld();
    give(p, 't_wand');
    p.mana = 4;
    const golem = spawnEnemy(world, 't_golem', 140, FLOOR_Y, { kbResist: 1 });
    step(world, 40, tap(200, 124));
    expect(golem.hp).toBe(100);
  });

  it('lightning strikes from the ceiling above the aim point and hits multiple targets', () => {
    const { world, p } = makeWorld();
    give(p, 't_storm');
    p.mana = 4;
    const low = spawnEnemy(world, 't_dummy', 150, FLOOR_Y, { kbResist: 1 });
    const high = spawnEnemy(world, 't_dummy', 150, FLOOR_Y - 30, { kbResist: 1, gravityScale: 0 });
    step(world, 1, tap(150, 124));
    const bolt = projectiles(world)[0]!;
    expect(bolt.y).toBeLessThan(FLOOR_Y - 80); // spawned high above (ceiling or strike cap)
    expect(bolt.vy).toBeGreaterThan(0);
    step(world, 40);
    expect(low.hp).toBe(100 - (3 + p.stats.mag));
    expect(high.hp).toBe(100 - (3 + p.stats.mag));
  });
});

describe('throw', () => {
  it('consumes the item and arcs under gravity', () => {
    const { world, p } = makeWorld();
    give(p, 't_knife', 3);
    step(world, 1, tap(200, 100));
    expect(p.inventory[0]?.count).toBe(2);
    const k = projectiles(world)[0]!;
    const vy0 = k.vy;
    step(world, 10);
    expect(k.vy).toBeGreaterThan(vy0);
  });

  it('thrown items need a fresh press (no hold-to-repeat)', () => {
    const { world, p } = makeWorld();
    give(p, 't_knife', 5);
    step(world, 120, { attack: true, aimX: 200, aimY: 100 });
    expect(p.inventory[0]?.count).toBe(4);
  });

  it('bombs bounce, rest, then explode on their fuse', () => {
    const { world, p } = makeWorld();
    give(p, 't_bomb', 2);
    const evs = stepCollect(world, secs(1.6) + 5, tap(140, 110));
    expect(p.inventory[0]?.count).toBe(1);
    expect(evs.some((ev) => ev.type === 'particles' && ev.preset === 'explosion')).toBe(true);
    expect(projectiles(world)).toHaveLength(0);
  });
});
