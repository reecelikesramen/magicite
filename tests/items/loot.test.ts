import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { containerRoll, lootPool, openChest, rollChestLoot, rollPotLoot } from '../../src/sim/items/loot';
import { tierForDistrict } from '../../src/sim/items/tiers';
import { rig } from './helpers';

const BANNED = ['no_loot', 'unique', 'trophy', 'legendary', 'currency', 'part'];

describe('chest loot tables', () => {
  it('is deterministic for a given world state', () => {
    const roll = () => {
      const { w } = rig(11);
      return [1, 2, 3, 4, 5].map((t) => rollChestLoot(w, t));
    };
    expect(roll()).toEqual(roll());
  });

  it('stays inside the tier window and never rolls trophies, legendaries or parts', () => {
    const { w } = rig(3);
    for (let t = 1; t <= 5; t++) {
      const golds: number[] = [];
      for (let i = 0; i < 150; i++) {
        const loot = rollChestLoot(w, t);
        golds.push(loot.gold);
        expect(loot.items.length).toBeGreaterThanOrEqual(1); // 2–3 rolls; repeats merge into one stack
        for (const s of loot.items) {
          const d = Content.items.get(s.id)!;
          expect(d.tier, s.id).toBeLessThanOrEqual(t);
          if (s.id !== 'recipe_scroll') expect(d.tags?.some((x) => BANNED.includes(x)) ?? false, s.id).toBe(false);
          if (d.category === 'weapon' && d.use !== 'throw') expect(d.tier, s.id).toBeGreaterThanOrEqual(t - 1);
          if (d.tags?.includes('elixir')) expect(t).toBeGreaterThanOrEqual(4);
          expect(s.count, s.id).toBeGreaterThanOrEqual(1);
          expect(s.count, s.id).toBeLessThanOrEqual(d.maxStack);
          expect(s.durability, s.id).toBe(d.durability);
        }
      }
      expect(Math.min(...golds)).toBeGreaterThanOrEqual(2 + 3 * t);
      expect(Math.max(...golds)).toBeLessThanOrEqual(6 + 8 * t);
    }
  });

  it('has something in every bucket at every tier', () => {
    for (let t = 1; t <= 5; t++) {
      const pool = lootPool(t);
      for (const b of ['material', 'consumable', 'gear', 'accessory'] as const) expect(pool.get(b)?.length ?? 0, `${b}@${t}`).toBeGreaterThan(0);
    }
  });

  it('pots hold a little gold and only cheap consumables', () => {
    const { w } = rig(4);
    let any = 0;
    for (let i = 0; i < 300; i++) {
      const loot = rollPotLoot(w, 4);
      for (const s of loot.items) {
        any++;
        expect(Content.items.get(s.id)!.value, s.id).toBeLessThanOrEqual(30);
      }
      expect(loot.gold).toBeLessThanOrEqual(6);
    }
    expect(any).toBeGreaterThan(0);
  });
});

describe('containers', () => {
  it('decodes level gen lootTier: grade and item tier follow the district', () => {
    // District 1: tierBase 0 → wooden 1, iron 2, secret 3.
    expect(containerRoll('chest_wood', 1, 1)).toEqual({ pot: false, tier: 1, bonusRolls: 0 });
    expect(containerRoll('chest_iron', 1, 2)).toEqual({ pot: false, tier: 2, bonusRolls: 1 });
    expect(containerRoll('chest_iron', 1, 3)).toEqual({ pot: false, tier: 2, bonusRolls: 2 });
    // District 13: tierBase 2.
    expect(containerRoll('chest_wood', 13, 3)).toEqual({ pot: false, tier: tierForDistrict(13), bonusRolls: 0 });
    expect(containerRoll('chest_iron', 13, 5)).toEqual({ pot: false, tier: Math.min(5, tierForDistrict(13) + 1), bonusRolls: 2 });
    expect(containerRoll('chest_iron', 19, 99).tier).toBe(5);
    // Pots, and chests without gen data.
    expect(containerRoll('pot', 7, 0).pot).toBe(true);
    expect(containerRoll('chest_wood', 7)).toEqual({ pot: false, tier: tierForDistrict(7), bonusRolls: 0 });
    expect(containerRoll('chest_iron', 7)).toEqual({ pot: false, tier: tierForDistrict(7) + 1, bonusRolls: 1 });
  });

  it('opening a chest spawns its loot as pickups and counts it', () => {
    const { w, p, e } = rig(8);
    const before = w.entities.filter((o) => o.kind === 'pickup').length;
    const loot = openChest(w, 'chest_iron', e.x + 20, e.y + e.h, { player: 0, lootTier: 2 });
    const pickups = w.entities.filter((o) => o.kind === 'pickup');
    const goldCoins = pickups.filter((o) => o.pickup!.gold > 0);
    expect(pickups.length - before).toBe(loot.items.length + goldCoins.length);
    expect(goldCoins.reduce((n, o) => n + o.pickup!.gold, 0)).toBe(loot.gold);
    expect(p.runStats.chestsOpened).toBe(1);
    expect(loot.items.length).toBeGreaterThanOrEqual(1);
  });
});
