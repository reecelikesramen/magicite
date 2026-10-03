import { describe, expect, it } from 'vitest';
import { recalcStats } from '../../src/sim/items/stats';
import { cmd, give, rig } from './helpers';

describe('recalcStats with equipment', () => {
  it('armour adds DEF (entity armour) and max HP', () => {
    const { w, p, e } = rig();
    const hp = p.stats.maxHp;
    give(p, 0, 'iron_helm');
    give(p, 1, 'iron_chestplate');
    cmd(w, { type: 'equip', slot: 0 }, { type: 'equip', slot: 1 });
    expect(p.stats.def).toBe(2);
    expect(e.armor).toBe(2);
    expect(p.stats.maxHp).toBe(hp + 3);
    expect(e.maxHp).toBe(hp + 3);
  });

  it('accessories and charms add their mods; resistances stack per type', () => {
    const { w, p } = rig();
    const atk = p.stats.atk;
    give(p, 0, 'ring_of_might');
    give(p, 1, 'bogscale_hood');
    give(p, 2, 'bogscale_vest');
    give(p, 3, 'lucky_charm');
    cmd(w, ...[0, 1, 2, 3].map((slot) => ({ type: 'equip' as const, slot })));
    expect(p.stats.atk).toBe(atk + 2);
    expect(p.mods.resist?.poison).toBeCloseTo(0.5);
    expect(p.mods.goldFind).toBeCloseTo(0.15);
    expect(p.stats.dex).toBe(p.base.dex + 2);
  });

  it('removing gear clamps current HP to the new maximum', () => {
    const { w, p, e } = rig();
    give(p, 0, 'diamond_chestplate');
    cmd(w, { type: 'equip', slot: 0 });
    e.hp = e.maxHp;
    const boosted = e.maxHp;
    cmd(w, { type: 'unequip', slot: 'body' });
    expect(e.maxHp).toBe(boosted - 3);
    expect(e.hp).toBe(e.maxHp);
    expect(p.stats.def).toBe(0);
  });

  it('is idempotent', () => {
    const { w, p, e } = rig();
    give(p, 0, 'amethyst_mail');
    cmd(w, { type: 'equip', slot: 0 });
    const once = JSON.stringify(p.stats);
    recalcStats(p, e);
    recalcStats(p, e);
    expect(JSON.stringify(p.stats)).toBe(once);
  });
});
