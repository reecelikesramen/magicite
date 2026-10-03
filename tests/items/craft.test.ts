import { describe, expect, it } from 'vitest';
import { Content, recipeKey } from '../../src/content';
import { INVENTORY_SIZE } from '../../src/sim/constants';
import { craft, findRecipe, STATION_RANGE } from '../../src/sim/items/craft';
import { countItem } from '../../src/sim/items/inventory';
import { cmd, eventsOf, give, messages, rig, spawnNear } from './helpers';

describe('two-item crafting', () => {
  it('is unordered: A+B and B+A give the same result', () => {
    for (const [a, b] of [['wood', 'stone'], ['stone', 'wood']] as const) {
      const { w, p } = rig();
      give(p, 0, a);
      give(p, 1, b);
      cmd(w, { type: 'craft', a: 0, b: 1 });
      // Inputs are used up; the result lands in the first free slot.
      expect(p.inventory[0]).toEqual({ id: 'stick', count: 2 });
      expect(p.inventory[1]).toBeNull();
    }
    expect(findRecipe('stone', 'wood')).toBe(findRecipe('wood', 'stone'));
  });

  it('batches material recipes: min(A, B) × count from both stacks', () => {
    const { w, p } = rig();
    give(p, 0, 'wood', 3);
    give(p, 1, 'stone', 5);
    cmd(w, { type: 'craft', a: 0, b: 1 });
    expect(p.inventory[0]).toEqual({ id: 'stick', count: 6 });
    expect(p.inventory[1]).toEqual({ id: 'stone', count: 2 });
  });

  it('pairs a stack with itself: floor(n / 2) × count, leaving the odd one', () => {
    const { w, p } = rig();
    give(p, 0, 'wood', 5);
    cmd(w, { type: 'craft', a: 0, b: 0 });
    expect(countItem(p, 'plank')).toBe(2);
    expect(p.inventory[0]).toEqual({ id: 'wood', count: 1 });
  });

  it('a single item cannot be combined with itself', () => {
    const { w, p } = rig();
    give(p, 0, 'wood', 1);
    cmd(w, { type: 'craft', a: 0, b: 0 });
    expect(p.inventory[0]).toEqual({ id: 'wood', count: 1 });
    expect(countItem(p, 'plank')).toBe(0);
    expect(messages(w).some((m) => m.startsWith('Need two'))).toBe(true);
  });

  it('two separate stacks of the same item combine too', () => {
    const { w, p } = rig();
    give(p, 0, 'fiber', 2);
    give(p, 7, 'fiber', 4);
    cmd(w, { type: 'craft', a: 7, b: 0 });
    expect(countItem(p, 'string')).toBe(2);
    expect(countItem(p, 'fiber')).toBe(2);
  });

  it('crafts gear one at a time, at full durability', () => {
    const { w, p } = rig();
    give(p, 0, 'iron_blade', 2);
    give(p, 1, 'stick', 3);
    cmd(w, { type: 'craft', a: 0, b: 1 });
    const swords = p.inventory.filter((s) => s?.id === 'iron_sword');
    expect(swords).toHaveLength(1);
    expect(swords[0]!.durability).toBe(Content.items.get('iron_sword')!.durability);
    expect(countItem(p, 'iron_blade')).toBe(1);
    expect(countItem(p, 'stick')).toBe(2);
  });

  it('unknown pairs change nothing and report a failed craft', () => {
    const { w, p } = rig();
    give(p, 0, 'wood', 2);
    give(p, 1, 'berry', 2);
    cmd(w, { type: 'craft', a: 0, b: 1 });
    expect(p.inventory[0]).toEqual({ id: 'wood', count: 2 });
    expect(p.inventory[1]).toEqual({ id: 'berry', count: 2 });
    const ev = eventsOf(w, 'craft');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.result).toBeNull();
  });

  it('ignores empty or out-of-range slots and garbled commands', () => {
    const { w, p } = rig();
    give(p, 0, 'wood', 2);
    cmd(w, { type: 'craft', a: 0, b: 3 }, { type: 'craft', a: -1, b: 0 }, { type: 'craft', a: INVENTORY_SIZE, b: 0 });
    cmd(w, { type: 'craft', a: 'x', b: null } as never);
    expect(p.inventory[0]).toEqual({ id: 'wood', count: 2 });
  });

  it('records discoveries once per recipe', () => {
    const { w, p } = rig();
    give(p, 0, 'fiber', 4);
    cmd(w, { type: 'craft', a: 0, b: 0 });
    expect(p.knownRecipes).toEqual([recipeKey('fiber', 'fiber')]);
    expect(eventsOf(w, 'craft')[0]).toMatchObject({ result: 'string', count: 2, discovered: true });
    give(p, 0, 'fiber', 2);
    cmd(w, { type: 'craft', a: 0, b: 0 });
    expect(eventsOf(w, 'craft')[0]).toMatchObject({ result: 'string', count: 1, discovered: false });
    expect(p.knownRecipes).toHaveLength(1);
    expect(p.runStats.recipesDiscovered).toBe(1);
    expect(p.runStats.itemsCrafted).toBe(3);
  });

  it('drops results that do not fit at the crafter\'s feet', () => {
    const { w, p } = rig();
    for (let i = 0; i < INVENTORY_SIZE; i++) give(p, i, 'wooden_sword');
    give(p, 0, 'iron_bar', 20);
    give(p, 1, 'feather', 20);
    const before = w.entities.filter((o) => o.kind === 'pickup').length;
    cmd(w, { type: 'craft', a: 0, b: 1 });
    // 20 pairs × 4 knives = 80; two freed slots hold 2 × 30, the rest pops out as a pickup.
    expect(countItem(p, 'throwing_knife')).toBe(60);
    const drops = w.entities.filter((o) => o.kind === 'pickup');
    expect(drops.length).toBe(before + 1);
    expect(drops.at(-1)!.pickup!.item).toEqual({ id: 'throwing_knife', count: 20 });
  });
});

describe('crafting stations', () => {
  it('cooking needs a campfire within ~3 tiles', () => {
    const { w, p, e } = rig();
    give(p, 0, 'raw_meat', 2);
    cmd(w, { type: 'craft', a: 0, b: 0 });
    expect(countItem(p, 'cooked_meat')).toBe(0);
    expect(messages(w).some((m) => m.includes('campfire'))).toBe(true);

    const far = spawnNear(w, e, 'prop', 'campfire', STATION_RANGE + 20);
    cmd(w, { type: 'craft', a: 0, b: 0 });
    expect(countItem(p, 'cooked_meat')).toBe(0);
    w.kill(far);

    spawnNear(w, e, 'prop', 'campfire', 6);
    cmd(w, { type: 'craft', a: 0, b: 0 });
    expect(countItem(p, 'cooked_meat')).toBe(2);
    expect(countItem(p, 'raw_meat')).toBe(0);
  });

  it('smelting and metal armour need a forge: any town counts', () => {
    const { w, p } = rig();
    give(p, 0, 'iron_ore', 4);
    give(p, 1, 'iron_bar', 1);
    give(p, 2, 'leather_cap', 1);
    cmd(w, { type: 'craft', a: 0, b: 0 }, { type: 'craft', a: 1, b: 2 });
    expect(countItem(p, 'iron_bar')).toBe(1);
    expect(countItem(p, 'iron_helm')).toBe(0);

    w.level.info.isTown = true;
    cmd(w, { type: 'craft', a: 0, b: 0 }, { type: 'craft', a: 1, b: 2 });
    expect(countItem(p, 'iron_helm')).toBe(1);
    expect(countItem(p, 'iron_bar')).toBe(1 + 2 - 1);
  });

  it('a placed forge prop works outside town', () => {
    const { w, p, e } = rig();
    give(p, 0, 'gold_ore', 2);
    spawnNear(w, e, 'prop', 'forge', 4);
    cmd(w, { type: 'craft', a: 0, b: 0 });
    expect(countItem(p, 'gold_bar')).toBe(1);
  });

  it('the craft() helper reports why it failed', () => {
    const { w, p } = rig();
    give(p, 0, 'flour', 2);
    expect(craft(w, p, 0, 0)).toMatchObject({ ok: false, reason: 'station' });
    give(p, 1, 'stone', 1);
    expect(craft(w, p, 1, 1)).toMatchObject({ ok: false, reason: 'count' });
    give(p, 2, 'berry', 1);
    expect(craft(w, p, 1, 2)).toMatchObject({ ok: false, reason: 'no_recipe' });
    expect(craft(w, p, 5, 6)).toMatchObject({ ok: false, reason: 'invalid' });
  });
});
