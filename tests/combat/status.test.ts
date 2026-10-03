import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat/damage';
import { addStatus, applyStatus, damageDealtMul, isDisabled, speedMul, STATUS_RULES } from '../../src/sim/combat/status';
import { secs } from '../../src/sim/constants';
import { FLOOR_Y, give, makeWorld, spawnEnemy, step } from './helpers';

describe('status effects', () => {
  it('burn ticks damage on its interval and expires', () => {
    const { world } = makeWorld();
    const d = spawnEnemy(world, 't_dummy', 200);
    addStatus(world, d, 'burn', secs(2), 1);
    step(world, 59);
    expect(d.hp).toBe(100);
    step(world, 1);
    expect(d.hp).toBe(99);
    step(world, 60);
    expect(d.hp).toBe(98);
    expect(d.status).toHaveLength(0);
    step(world, 120);
    expect(d.hp).toBe(98);
  });

  it('DoT ignores i-frames and grants none', () => {
    const { world } = makeWorld();
    const d = spawnEnemy(world, 't_dummy', 200);
    d.invuln = 1000;
    addStatus(world, d, 'bleed', STATUS_RULES.bleed.every, 2);
    step(world, STATUS_RULES.bleed.every);
    expect(d.hp).toBe(98);
    expect(d.invuln).toBeGreaterThan(900);
  });

  it('chance is respected (0 never, 1 always) and deterministic per seed', () => {
    const { world } = makeWorld();
    const d = spawnEnemy(world, 't_dummy', 200);
    expect(applyStatus(world, d, { id: 'slow', duration: 1, chance: 0 })).toBe(false);
    expect(applyStatus(world, d, { id: 'slow', duration: 1, chance: 1 })).toBe(true);
    const roll = (seed: number) => {
      const t = makeWorld({ seed });
      const x = spawnEnemy(t.world, 't_dummy', 200);
      const out: boolean[] = [];
      for (let i = 0; i < 16; i++) {
        x.status.length = 0;
        out.push(applyStatus(t.world, x, { id: 'weak', duration: 1, chance: 0.5 }));
      }
      return out;
    };
    expect(roll(3)).toEqual(roll(3));
    expect(roll(3).filter(Boolean).length).toBeGreaterThan(0);
    expect(roll(3).filter(Boolean).length).toBeLessThan(16);
  });

  it('a DoT re-applied faster than its interval keeps ticking (refresh keeps the phase)', () => {
    const { world } = makeWorld();
    const d = spawnEnemy(world, 't_dummy', 200);
    // A fire weapon re-applying a 2 s burn every 24 ticks for 4 s, then stopping.
    for (let i = 0; i < 10; i++) {
      addStatus(world, d, 'burn', secs(2), 1);
      step(world, 24);
    }
    expect(d.hp).toBe(96); // one tick per second, never starved by the refreshes
    step(world, secs(3));
    expect(d.status).toHaveLength(0);
    expect(d.hp).toBeLessThanOrEqual(95);
    expect(d.hp).toBeGreaterThanOrEqual(94); // ~2 s of burn left after the last refresh
  });

  it('re-applying refreshes instead of stacking', () => {
    const { world } = makeWorld();
    const d = spawnEnemy(world, 't_dummy', 200);
    addStatus(world, d, 'poison', 60, 1);
    addStatus(world, d, 'poison', 30, 3);
    expect(d.status).toHaveLength(1);
    expect(d.status[0]).toMatchObject({ id: 'poison', ticks: 60, power: 3 });
  });

  it('freeze/stun disable; slow/haste scale speed; weak scales damage dealt', () => {
    const { world, p, e } = makeWorld();
    const d = spawnEnemy(world, 't_dummy', 200);
    expect(isDisabled(d)).toBe(false);
    addStatus(world, d, 'slow', 60, 0.5);
    expect(speedMul(d)).toBeCloseTo(0.5);
    addStatus(world, d, 'haste', 60, 0.5);
    expect(speedMul(d)).toBeCloseTo(0.75);
    addStatus(world, d, 'freeze', 60);
    expect(isDisabled(d)).toBe(true);
    expect(speedMul(d)).toBe(0);
    addStatus(world, d, 'weak', 60, 0.5);
    expect(damageDealtMul(d)).toBeCloseTo(0.5);

    // A frozen player can't use items.
    give(p, 't_sword');
    addStatus(world, e, 'stun', 30);
    step(world, 5, { attack: true, aimX: 200, aimY: 122 });
    expect(e.swing).toBeUndefined();
    step(world, 30);
    step(world, 1, { attack: true, aimX: 200, aimY: 122 });
    expect(e.swing).toBeDefined();
  });

  it('frozen enemies deal no contact damage; thawed ones do (with their onHit)', () => {
    const { world, e } = makeWorld();
    const biter = spawnEnemy(world, 't_biter', 82, FLOOR_Y, { kbResist: 1 });
    const hp = e.hp;
    addStatus(world, biter, 'freeze', 30);
    step(world, 10);
    expect(e.hp).toBe(hp);
    step(world, 30);
    expect(e.hp).toBe(hp - 1);
    expect(e.status.some((s) => s.id === 'slow')).toBe(true);
  });

  it('shields absorb hits; regen heals over time', () => {
    const { world, e } = makeWorld();
    addStatus(world, e, 'shield', 600, 2);
    expect(applyDamage(world, e, 1)).toBe(0);
    e.invuln = 0;
    expect(applyDamage(world, e, 3)).toBe(2);
    expect(e.status.some((s) => s.id === 'shield')).toBe(false);
    const hp = e.hp;
    addStatus(world, e, 'regen', secs(2), 1);
    step(world, secs(2));
    expect(e.hp).toBe(Math.min(e.maxHp, hp + 2));
  });

  it('poison never finishes off a player', () => {
    const { world, p, e } = makeWorld();
    e.hp = 2;
    addStatus(world, e, 'poison', secs(10), 5);
    step(world, secs(10));
    expect(e.hp).toBe(1);
    expect(p.downed).toBe(false);
  });

  it('immunities: race specials, element affinity, enemy tags; bosses shrug off disables', () => {
    const { world, p, e } = makeWorld();
    p.specials.push('burn_immune');
    expect(addStatus(world, e, 'burn', 60)).toBe(false);
    const imp = spawnEnemy(world, 't_imp', 200);
    expect(addStatus(world, imp, 'burn', 60)).toBe(false);
    expect(addStatus(world, imp, 'slow', 60)).toBe(true);
    const boss = world.spawn('boss', 't_boss', 300, 100, { w: 16, h: 16, hp: 50, maxHp: 50 });
    addStatus(world, boss, 'freeze', 120);
    expect(boss.status[0]!.ticks).toBe(30);
  });

  it('statuses pause during hit-stop', () => {
    const { world } = makeWorld();
    const d = spawnEnemy(world, 't_dummy', 200);
    addStatus(world, d, 'slow', 60);
    world.freeze = 10;
    step(world, 5);
    expect(d.status[0]!.ticks).toBe(60);
  });
});
