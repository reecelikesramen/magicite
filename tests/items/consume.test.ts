import { describe, expect, it } from 'vitest';
import { Content, recipeKey } from '../../src/content';
import { secs } from '../../src/sim/constants';
import { applyConsume, drinkMystery, mostWorn, MYSTERY_TABLE, revealRecipe } from '../../src/sim/items/consume';
import { makeStack } from '../../src/sim/items/inventory';
import { countItem } from '../../src/sim/items/inventory';
import { recalcStats } from '../../src/sim/items/stats';
import { tierForDistrict } from '../../src/sim/items/tiers';
import { cmd, give, messages, rig } from './helpers';

describe('inventory click-use', () => {
  it('eats food, and refuses plain food when full', () => {
    const { w, p } = rig();
    give(p, 0, 'cooked_meat', 3);
    p.hunger = 2;
    cmd(w, { type: 'use', slot: 0 });
    expect(p.hunger).toBe(5);
    expect(p.inventory[0]!.count).toBe(2);
    p.hunger = p.stats.maxHunger;
    cmd(w, { type: 'use', slot: 0 });
    expect(p.inventory[0]!.count).toBe(2);
    expect(messages(w)).toContain("You're full.");
  });

  it('drinks potions: heal, mana, stamina + haste', () => {
    const { w, p, e } = rig();
    give(p, 0, 'health_potion', 1);
    give(p, 1, 'mana_potion', 1);
    give(p, 2, 'stamina_tonic', 1);
    e.hp = 1;
    p.mana = 0;
    p.stamina = 0;
    cmd(w, { type: 'use', slot: 0 }, { type: 'use', slot: 1 }, { type: 'use', slot: 2 });
    expect(e.hp).toBe(Math.min(e.maxHp, 3));
    expect(p.mana).toBe(Math.min(p.stats.maxMana, 3));
    expect(p.stamina).toBeGreaterThan(0);
    expect(e.status.some((s) => s.id === 'haste')).toBe(true);
    expect(p.inventory.slice(0, 3)).toEqual([null, null, null]);
  });

  it('elixirs raise base stats permanently', () => {
    const { w, p } = rig();
    const atk = p.stats.atk;
    give(p, 0, 'elixir_of_might', 1);
    cmd(w, { type: 'use', slot: 0 });
    expect(p.stats.atk).toBe(atk + 1);
    recalcStats(p, w.get(p.entityId));
    expect(p.stats.atk).toBe(atk + 1);
  });

  it('antidote clears harmful statuses but keeps buffs', () => {
    const { w, p, e } = rig();
    e.status.push({ id: 'poison', ticks: secs(5), power: 1, source: 0 }, { id: 'haste', ticks: secs(5), power: 0.2, source: 0 });
    give(p, 0, 'antidote', 1);
    cmd(w, { type: 'use', slot: 0 });
    expect(e.status.map((s) => s.id)).toEqual(['haste']);
  });

  it('wearables are equipped on use', () => {
    const { w, p } = rig();
    give(p, 0, 'leather_cap');
    give(p, 1, 'arrow', 12);
    cmd(w, { type: 'use', slot: 0 }, { type: 'use', slot: 1 });
    expect(p.equipment.head?.id).toBe('leather_cap');
    expect(p.equipment.ammo).toEqual({ id: 'arrow', count: 12 });
  });

  it('weapons and plain materials do nothing on use', () => {
    const { w, p } = rig();
    give(p, 0, 'iron_sword');
    give(p, 1, 'wood', 2);
    cmd(w, { type: 'use', slot: 0 }, { type: 'use', slot: 1 });
    expect(p.inventory[0]?.id).toBe('iron_sword');
    expect(p.inventory[1]).toEqual({ id: 'wood', count: 2 });
  });

  it('an omnivore race special lets materials be eaten', () => {
    const { w, p } = rig();
    p.specials.push('eats_anything');
    p.hunger = 1;
    give(p, 0, 'wood', 2);
    cmd(w, { type: 'use', slot: 0 });
    expect(p.hunger).toBe(2);
    expect(p.inventory[0]!.count).toBe(1);
  });

  it('downed players cannot use items', () => {
    const { w, p } = rig();
    p.downed = true;
    p.hunger = 1;
    give(p, 0, 'bread', 1);
    cmd(w, { type: 'use', slot: 0 });
    expect(p.inventory[0]!.count).toBe(1);
  });
});

describe('mystery potion', () => {
  it('rolls from the world rng: same seed, same outcome', () => {
    const outcome = () => {
      const { w, p, e } = rig(99);
      give(p, 0, 'mystery_potion', 1);
      cmd(w, { type: 'use', slot: 0 });
      return { msgs: messages(w), hp: e.hp, status: e.status.map((s) => s.id), rng: w.rng.getState() };
    };
    expect(outcome()).toEqual(outcome());
  });

  it('can help or harm', () => {
    const { w, p, e } = rig(5);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      e.hp = e.maxHp;
      e.status.length = 0;
      seen.add(drinkMystery(w, p, e));
    }
    expect(seen.has('heal')).toBe(true);
    expect(seen.has('poison')).toBe(true);
    for (const id of seen) expect(MYSTERY_TABLE.some((o) => o.id === id)).toBe(true);
  });
});

describe('recipe scrolls and repair kits', () => {
  it('a recipe scroll teaches an unknown recipe near the current tier', () => {
    const { w, p } = rig();
    give(p, 0, 'recipe_scroll', 2);
    cmd(w, { type: 'use', slot: 0 });
    expect(p.knownRecipes).toHaveLength(1);
    expect(p.inventory[0]!.count).toBe(1);
    const r = Content.recipes.get(p.knownRecipes[0]!)!;
    expect(Content.items.get(r.result)!.tier).toBeLessThanOrEqual(tierForDistrict(w.level.info.district) + 1);
    expect(messages(w).some((m) => m.startsWith('Learned:'))).toBe(true);
  });

  it('a scroll is kept when there is nothing left to learn', () => {
    const { w, p, e } = rig();
    for (const r of Content.recipeList) p.knownRecipes.push(recipeKey(r.a, r.b));
    expect(revealRecipe(w, p)).toBeNull();
    expect(applyConsume(w, p, e, Content.items.get('recipe_scroll')!)).toBe(false);
  });

  it('a repair kit fixes the most worn item, and is kept when nothing is worn', () => {
    const { w, p } = rig();
    give(p, 0, 'repair_kit', 1);
    cmd(w, { type: 'use', slot: 0 });
    expect(countItem(p, 'repair_kit')).toBe(1);
    give(p, 1, 'iron_sword');
    give(p, 2, 'wooden_sword');
    p.inventory[1]!.durability = 100;
    p.inventory[2]!.durability = 6;
    cmd(w, { type: 'use', slot: 0 });
    expect(countItem(p, 'repair_kit')).toBe(0);
    expect(p.inventory[2]!.durability).toBe(6 + Math.ceil(Content.items.get('wooden_sword')!.durability! / 2));
    expect(p.inventory[1]!.durability).toBe(100);
  });

  it('mostWorn prefers the lowest durability fraction, equipment before pack on ties, in slot order', () => {
    const { p } = rig();
    const half = (id: string) => {
      const st = makeStack(id, 1);
      st.durability = Content.items.get(id)!.durability! / 2;
      return st;
    };
    p.inventory[0] = half('iron_sword');
    p.equipment.trinket = half('buckler');
    p.equipment.body = half('leather_tunic');
    expect(mostWorn(p)?.stack.id).toBe('leather_tunic'); // body comes before trinket in EQUIP_SLOTS
    // Rebuilding the equipment record in another key order (as a decoded snapshot might) changes nothing.
    const eq = p.equipment;
    p.equipment = { trinket: eq.trinket, ammo: eq.ammo, accessory2: eq.accessory2, accessory1: eq.accessory1, body: eq.body, head: eq.head };
    expect(mostWorn(p)?.stack.id).toBe('leather_tunic');
    p.inventory[0]!.durability = 1;
    expect(mostWorn(p)?.stack.id).toBe('iron_sword');
  });
});
