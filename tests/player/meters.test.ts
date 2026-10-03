import { describe, expect, it } from 'vitest';
import { PHYS, secs } from '../../src/sim/constants';
import { feed, heal, hungerTicks, manaRegenTicks, METERS, refillMeters, restoreMana, restoreStamina, spendMana, spendStamina } from '../../src/sim/player/meters';
import { recalcStats } from '../../src/sim/items/stats';
import { boxGrid, ent, makeWorld, pl, run, settle } from './helpers';

function world(opts: { isTown?: boolean } = {}) {
  const w = makeWorld(boxGrid(80, 40, 30), opts);
  settle(w, 5);
  return w;
}

describe('stamina', () => {
  it('starts full, max = 2 + floor(DEX/2), regenerates one charge per 1.2 s', () => {
    const w = world();
    const p = pl(w);
    expect(p.stats.maxStamina).toBe(2 + Math.floor(p.stats.dex / 2));
    expect(p.stamina).toBe(p.stats.maxStamina);
    expect(spendStamina(p, 2)).toBe(true);
    const low = p.stamina;
    run(w, METERS.staminaRegenTicks - 1);
    expect(p.stamina).toBe(low);
    run(w, 1);
    expect(p.stamina).toBe(low + 1);
    run(w, METERS.staminaRegenTicks * 5);
    expect(p.stamina).toBe(p.stats.maxStamina);
  });

  it('cannot spend more than you have', () => {
    const w = world();
    const p = pl(w);
    p.stamina = 1;
    expect(spendStamina(p, 2)).toBe(false);
    expect(p.stamina).toBe(1);
  });

  it('higher DEX raises max stamina', () => {
    const w = world();
    const p = pl(w);
    const before = p.stats.maxStamina;
    p.base.dex += 4;
    recalcStats(p, ent(w));
    expect(p.stats.maxStamina).toBe(before + 2);
  });

  it('dashes cost a charge each and respect the cooldown (presses during cooldown are buffered briefly)', () => {
    const w = world();
    const p = pl(w);
    p.stats.maxStamina = p.stamina = 6;
    const s0 = p.stamina;
    let dashes = 0;
    let prevDir = 0;
    const starts: number[] = [];
    for (let t = 0; t < 120; t++) {
      // Mash dash right every 4 ticks (press 2 ticks, release 2 ticks).
      const dash = t % 4 < 2 ? 1 : 0;
      run(w, 1, { dash: dash as 0 | 1 });
      if (p.ctl.dashDir !== 0 && prevDir === 0) {
        dashes++;
        starts.push(t);
      }
      prevDir = p.ctl.dashDir;
    }
    expect(dashes).toBeGreaterThan(1);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(PHYS.dashGroundTicks + PHYS.dashCooldownTicks);
    expect(p.stamina).toBeLessThanOrEqual(s0 - dashes + Math.floor(120 / METERS.staminaRegenTicks));
  });

  it('a dash with no stamina does nothing', () => {
    const w = world();
    const p = pl(w);
    const e = ent(w);
    p.stamina = 0;
    p.ctl.staminaT = -100000;
    const x0 = e.x;
    run(w, 20, (t) => ({ dash: t < 2 ? 1 : 0 }));
    expect(e.x).toBe(x0);
    expect(p.ctl.dashT).toBe(0);
  });
});

describe('mana', () => {
  it('regenerates faster with more MAG', () => {
    const w = world();
    const p = pl(w);
    p.base.mag = 2;
    recalcStats(p, ent(w));
    const slow = manaRegenTicks(p);
    p.base.mag = 10;
    recalcStats(p, ent(w));
    const fast = manaRegenTicks(p);
    expect(fast).toBeLessThan(slow);
    expect(p.stats.maxMana).toBe(2 + 10);
    p.mana = 0;
    run(w, fast * 3);
    expect(p.mana).toBe(3);
  });

  it('spendMana / restoreMana clamp to the pool', () => {
    const w = world();
    const p = pl(w);
    p.mana = 1;
    expect(spendMana(p, 2)).toBe(false);
    expect(spendMana(p, 1)).toBe(true);
    expect(restoreMana(p, 100)).toBe(p.stats.maxMana);
    expect(p.mana).toBe(p.stats.maxMana);
  });
});

describe('hunger', () => {
  it('drains 1 per 50 s in districts and 3x slower in towns', () => {
    const w = world();
    const p = pl(w);
    expect(p.hunger).toBe(p.stats.maxHunger);
    expect(hungerTicks(p, false)).toBe(secs(50));
    expect(hungerTicks(p, true)).toBe(secs(150));
    run(w, secs(50));
    expect(p.hunger).toBe(p.stats.maxHunger - 1);

    const town = world({ isTown: true });
    run(town, secs(100));
    expect(pl(town).hunger).toBe(pl(town).stats.maxHunger);
    run(town, secs(50));
    expect(pl(town).hunger).toBe(pl(town).stats.maxHunger - 1);
  });

  it('mods.hungerRate speeds up the drain', () => {
    const w = world();
    const p = pl(w);
    p.mods.hungerRate = 1; // twice as fast
    expect(hungerTicks(p, false)).toBe(secs(25));
  });

  it('starving deals 1 damage every 15 s; eating stops it', () => {
    const w = world();
    const p = pl(w);
    const e = ent(w);
    p.hunger = 0;
    const hp0 = e.hp;
    run(w, secs(15) - 2);
    expect(e.hp).toBe(hp0);
    run(w, 3);
    expect(e.hp).toBe(hp0 - 1);
    run(w, secs(15));
    expect(e.hp).toBe(hp0 - 2);
    expect(feed(p, 3)).toBe(3);
    run(w, secs(20));
    expect(e.hp).toBe(hp0 - 2);
    expect(p.hunger).toBe(3);
  });

  it('towns are safe: no starvation damage there', () => {
    const w = world({ isTown: true });
    const p = pl(w);
    const e = ent(w);
    p.hunger = 0;
    run(w, secs(40));
    expect(e.hp).toBe(e.maxHp);
  });

  it('starvation can down a solo player and end the run', () => {
    const w = world();
    const p = pl(w);
    const e = ent(w);
    p.hunger = 0;
    e.hp = 1;
    run(w, secs(15) + 2);
    expect(p.downed).toBe(true);
    expect(w.run.over).toBe(true);
  });
});

describe('helpers', () => {
  it('heal clamps to max HP and emits a heal event; feed clamps to max hunger', () => {
    const w = world();
    const p = pl(w);
    const e = ent(w);
    e.hp = 1;
    expect(heal(w, e, 2)).toBe(2);
    expect(w.events.some((ev) => ev.type === 'heal' && ev.amount === 2)).toBe(true);
    expect(heal(w, e, 100)).toBe(e.maxHp - 3);
    expect(e.hp).toBe(e.maxHp);
    p.hunger = p.stats.maxHunger - 1;
    expect(feed(p, 5)).toBe(1);
    p.stamina = 0;
    expect(restoreStamina(p, 1)).toBe(1);
  });

  it('heal never lowers HP that is above max (e.g. after maxHp dropped)', () => {
    const w = world();
    const e = ent(w);
    e.hp = e.maxHp + 2;
    expect(heal(w, e, 1)).toBe(0);
    expect(e.hp).toBe(e.maxHp + 2);
  });

  it('heal does nothing to a downed player', () => {
    const w = makeWorld(boxGrid(), { players: 2 });
    settle(w, 5);
    const p = pl(w);
    const e = ent(w);
    p.downed = true;
    e.hp = 0;
    expect(heal(w, e, 3)).toBe(0);
    expect(e.hp).toBe(0);
  });

  it('refillMeters tops everything up', () => {
    const w = world();
    const p = pl(w);
    const e = ent(w);
    p.stamina = 0;
    p.mana = 0;
    p.hunger = 1;
    e.hp = 1;
    refillMeters(p, e);
    expect([p.stamina, p.mana, p.hunger, e.hp]).toEqual([p.stats.maxStamina, p.stats.maxMana, p.stats.maxHunger, e.maxHp]);
  });

  it('counts ticks played', () => {
    const w = world();
    const t0 = pl(w).runStats.ticksPlayed;
    run(w, 100);
    expect(pl(w).runStats.ticksPlayed).toBe(t0 + 100);
  });
});
