import { describe, expect, it } from 'vitest';
import { fireProjectile } from '../../src/sim/combat/projectiles';
import { swingActive, swingDuration, swingPhase, swingWindup } from '../../src/sim/combat/melee';
import { Content } from '../../src/content';
import { secs } from '../../src/sim/constants';
import { emptyInput } from '../../src/sim/types';
import { FLOOR_Y, give, makeWorld, spawnEnemy, step, stepCollect, tap } from './helpers';

describe('melee swings', () => {
  it('hits an overlapping enemy exactly once per swing', () => {
    const { world, p, e } = makeWorld();
    give(p, 't_sword');
    const dummy = spawnEnemy(world, 't_dummy', 89, FLOOR_Y, { kbResist: 1 });
    const evs = stepCollect(world, 30, tap(110, 122));
    const hits = evs.filter((ev) => ev.type === 'damage' && ev.target === dummy.id);
    expect(hits).toHaveLength(1);
    expect(dummy.hp).toBe(100 - (2 + p.stats.atk)); // weapon + ATK
    expect(e.swing).toBeUndefined();
  });

  it('auto-repeats while attack is held, once per cooldown', () => {
    const { world, p } = makeWorld();
    give(p, 't_sword');
    const dummy = spawnEnemy(world, 't_dummy', 89, FLOOR_Y, { kbResist: 1 });
    const evs = stepCollect(world, secs(0.4) * 3 - 1, { attack: true, aimX: 110, aimY: 122 });
    expect(evs.filter((ev) => ev.type === 'damage' && ev.target === dummy.id)).toHaveLength(3);
  });

  it('runs windup → active → recovery within the cooldown', () => {
    const def = Content.items.get('t_sword');
    const total = swingDuration(secs(0.4));
    expect(total).toBeLessThanOrEqual(secs(0.4));
    const w = swingWindup(def, total);
    const a = swingActive(def, total);
    expect(w).toBeGreaterThan(0);
    expect(w + a).toBeLessThan(total);
    const { world, p, e } = makeWorld();
    give(p, 't_sword');
    const phases: string[] = [];
    for (let i = 0; i < total; i++) {
      step(world, 1, { attack: i === 0, aimX: 120, aimY: 122 });
      if (e.swing) phases.push(swingPhase(e.swing));
    }
    expect(phases[0]).toBe('windup');
    expect(phases).toContain('active');
    expect(phases[phases.length - 1]).toBe('recovery');
  });

  it('aims in 8 directions: up hits above, right misses above and behind', () => {
    const above = () => {
      const t = makeWorld();
      give(t.p, 't_sword');
      const d = spawnEnemy(t.world, 't_dummy', 76, 106, { gravityScale: 0, kbResist: 1 });
      return { ...t, d };
    };
    const a = above();
    step(a.world, 20, tap(a.e.x + 3, 60)); // straight up
    expect(a.d.hp).toBeLessThan(100);
    const b = above();
    step(b.world, 20, tap(140, 122)); // right
    expect(b.d.hp).toBe(100);

    const c = makeWorld();
    give(c.p, 't_sword');
    const behind = spawnEnemy(c.world, 't_dummy', 70, FLOOR_Y, { kbResist: 1 });
    step(c.world, 30, tap(140, 122));
    expect(behind.hp).toBe(100);
    step(c.world, 20, tap(20, 122)); // turn around
    expect(behind.hp).toBeLessThan(100);
    expect(c.e.facing).toBe(-1);
  });

  it('down-swing in the air pogos off an enemy and refunds the air jump', () => {
    const { world, p, e } = makeWorld();
    give(p, 't_sword');
    const d = spawnEnemy(world, 't_dummy', 80, FLOOR_Y, { kbResist: 1 });
    e.y = 102;
    e.vy = 0;
    e.onGround = false;
    p.ctl.airJumpsUsed = 1;
    let bounced = false;
    for (let i = 0; i < 12 && !bounced; i++) {
      step(world, 1, { attack: i === 0, aimX: e.x + 3, aimY: 200 });
      if (d.hp < 100) bounced = e.vy < 0;
    }
    expect(d.hp).toBeLessThan(100);
    expect(bounced).toBe(true);
    expect(p.ctl.airJumpsUsed).toBe(0);
  });

  it('thrusts reach farther than swings', () => {
    const run = (item: string) => {
      const { world, p } = makeWorld();
      give(p, item);
      const d = spawnEnemy(world, 't_dummy', 100, FLOOR_Y, { kbResist: 1 });
      step(world, 30, tap(140, 124));
      return d.hp;
    };
    expect(run('t_sword')).toBe(100);
    expect(run('t_spear')).toBeLessThan(100);
  });

  it('heavy hits trigger hit-stop and shake', () => {
    const { world, p } = makeWorld();
    give(p, 't_great');
    const d = spawnEnemy(world, 't_dummy', 90, FLOOR_Y, { kbResist: 1 });
    let froze = false;
    const evs = stepCollect(world, 50, (i) => {
      if (world.freeze > 0) froze = true;
      return { attack: i === 0, aimX: 140, aimY: 122 };
    });
    expect(d.hp).toBe(100 - (6 + p.stats.atk));
    expect(froze).toBe(true);
    expect(evs.some((ev) => ev.type === 'hitstop')).toBe(true);
    expect(evs.some((ev) => ev.type === 'shake')).toBe(true);
  });

  it('applies the weapon onHit statuses', () => {
    const { world, p } = makeWorld();
    give(p, 't_venom');
    const d = spawnEnemy(world, 't_dummy', 89, FLOOR_Y, { kbResist: 1 });
    step(world, 12, tap(120, 122));
    expect(d.status.some((s) => s.id === 'poison')).toBe(true);
  });

  it('wears durability once per connecting swing (whiffs are free) and breaks the item', () => {
    const { world, p, e } = makeWorld();
    give(p, 't_sword', 1, 0, 2);
    step(world, 30, tap(140, 122)); // whiff
    expect(p.inventory[0]?.durability).toBe(2);
    spawnEnemy(world, 't_dummy', 89, FLOOR_Y, { kbResist: 1 });
    step(world, 30, tap(140, 122));
    expect(p.inventory[0]?.durability).toBe(1);
    const evs = stepCollect(world, 30, tap(140, 122));
    expect(p.inventory[0]).toBeNull();
    expect(evs.some((ev) => ev.type === 'message' && ev.text.includes('broke'))).toBe(true);
    expect(evs.some((ev) => ev.type === 'sfx' && ev.id === 'item_break')).toBe(true);
    step(world, 1);
    expect(e.held).toBeUndefined();
  });

  it('deflects enemy projectiles', () => {
    const { world, p, e } = makeWorld();
    give(p, 't_sword');
    const arrow = fireProjectile(world, null, 'arrow', 92, 122, Math.PI, { team: 'enemy', damage: 1, speedMul: 0.05 })!;
    const hp = e.hp;
    step(world, 20, tap(140, 122));
    expect(arrow.dead).toBe(true);
    expect(e.hp).toBe(hp);
  });

  it('players hit each target once even when two attack at the same moment (co-op)', () => {
    const { world, p } = makeWorld({ players: 2 });
    give(p, 't_sword');
    const p2 = world.players[1]!;
    p2.mods.critChance = -10;
    give(p2, 't_sword');
    const e2 = world.get(p2.entityId)!;
    e2.x = 100;
    const d = spawnEnemy(world, 't_dummy', 92, FLOOR_Y, { kbResist: 1 });
    for (let i = 0; i < 20; i++) {
      world.step([
        { ...emptyInput(), attack: i === 0, aimX: 140, aimY: 122 },
        { ...emptyInput(), attack: i === 0, aimX: 20, aimY: 122 },
      ]);
    }
    expect(d.hp).toBe(100 - 2 * (2 + p.stats.atk));
  });

  it('punches with an empty hand and harvests hand resources', () => {
    const { world, p } = makeWorld();
    const herb = world.spawnAt('resource', 't_herb', 88, FLOOR_Y, 6, 6, { hp: 1, maxHp: 1, gravityScale: 0, collides: false, resource: { def: 't_herb', hitFlash: 0 } });
    step(world, 20, tap(120, 124));
    expect(herb.dead).toBe(true);
    expect(p.runStats.plantsHarvested).toBe(1);
  });

  it('resources need the right tool kind and power', () => {
    const { world, p } = makeWorld();
    give(p, 't_sword');
    const rock = world.spawnAt('resource', 't_rock', 89, FLOOR_Y, 8, 7, { hp: 2, maxHp: 2, gravityScale: 0, collides: false, resource: { def: 't_rock', hitFlash: 0 } });
    const evs = stepCollect(world, 20, tap(120, 124));
    expect(rock.hp).toBe(2);
    expect(evs.some((ev) => ev.type === 'message' && ev.text.includes('pickaxe'))).toBe(true);
    give(p, 't_pick');
    step(world, 30, { attack: true, aimX: 92, aimY: 124 });
    expect(rock.dead).toBe(true);
    expect(p.runStats.oresMined).toBe(1);
  });
});
