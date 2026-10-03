import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { SHOPS } from '../../src/content/npcs';
import { Rng } from '../../src/engine/rng';
import { INVENTORY_SIZE } from '../../src/sim/constants';
import { countItem, makeStack } from '../../src/sim/items/inventory';
import { repairCost } from '../../src/sim/items/repair';
import { buyPrice, peekShop, sellPrice, shopStock } from '../../src/sim/items/shop';
import { tierForDistrict } from '../../src/sim/items/tiers';
import { cmd, give, messages, rig, spawnNear } from './helpers';

const tierOf = (id: string) => Content.items.get(id)!.tier;

describe('shop stock', () => {
  it('is a pure function of the rng', () => {
    for (const npc of Object.keys(SHOPS)) {
      for (const d of [1, 5, 11, 19]) {
        expect(shopStock(npc, d, new Rng(42), 'woods')).toEqual(shopStock(npc, d, new Rng(42), 'woods'));
      }
    }
  });

  it('scales with district depth (plus at most one next-tier teaser)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const d of [1, 3, 5, 9, 13, 19]) {
        const tier = tierForDistrict(d);
        for (const npc of ['npc_merchant', 'npc_smith', 'npc_outfitter']) {
          const eligible = new Set(
            SHOPS[npc]!.lines
              .filter((l) => {
                const min = l.minTier ?? tierOf(l.item);
                return tier >= min && tier <= (l.maxTier ?? min + 2);
              })
              .map((l) => l.item),
          );
          const stock = shopStock(npc, d, new Rng(seed));
          expect(stock.length, `${npc}@${d}`).toBeGreaterThan(0);
          expect(new Set(stock.map((s) => s.item)).size, `${npc}@${d} duplicates`).toBe(stock.length);
          const teasers = stock.filter((s) => !eligible.has(s.item));
          expect(teasers.length, `${npc}@${d}`).toBeLessThanOrEqual(1);
          for (const s of teasers) {
            expect(tierOf(s.item), s.item).toBe(tier + 1);
            expect(['weapon', 'tool', 'armor', 'accessory']).toContain(Content.items.get(s.item)!.category);
            expect(s.price).toBeGreaterThan(buyPrice(Content.items.get(s.item)!, d));
          }
          for (const s of stock) expect(s.count, s.item).toBeGreaterThan(0);
        }
      }
    }
  });

  it('old junk drops out of deep shops', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const deep = shopStock('npc_smith', 15, new Rng(seed)).map((s) => s.item);
      for (const id of ['stone_axe', 'stone_pickaxe', 'stone_sword', 'flint_spear']) expect(deep).not.toContain(id);
    }
  });

  it('the merchant always has a recipe scroll', () => {
    for (let seed = 1; seed <= 10; seed++) expect(shopStock('npc_merchant', 1, new Rng(seed)).map((s) => s.item)).toContain('recipe_scroll');
  });

  it('biome traders sell their biome\'s materials', () => {
    const generic = new Set(SHOPS.npc_trader!.lines.filter((l) => !l.biome).map((l) => l.item));
    const cinder = new Set(SHOPS.npc_trader!.lines.filter((l) => l.biome === 'cinder').map((l) => l.item));
    for (let seed = 1; seed <= 20; seed++) {
      for (const s of shopStock('npc_trader', 13, new Rng(seed), 'cinder')) expect(generic.has(s.item) || cinder.has(s.item), s.item).toBe(true);
    }
  });

  it('prices grow with depth', () => {
    const potion = Content.items.get('health_potion')!;
    expect(buyPrice(potion, 1)).toBe(potion.value);
    expect(buyPrice(potion, 11)).toBeGreaterThan(buyPrice(potion, 1));
  });

  it('prices are exact: +3% per district, rounded up only when there is a remainder', () => {
    // 100 g × 1.09 is 109.00000000000001 in floating point; a float formula would charge 110.
    const helm = Content.items.get('gold_helm')!;
    expect(helm.value).toBe(100);
    expect(buyPrice(helm, 4)).toBe(109);
    for (const d of Content.items.values()) {
      for (let district = 1; district <= 21; district++) {
        const pct = 100 + 3 * (district - 1);
        const exact = Math.max(1, Math.floor((d.value * pct + 99) / 100));
        expect(buyPrice(d, district), `${d.id}@${district}`).toBe(exact);
      }
    }
  });

  it('sell and repair prices use exact integer maths', () => {
    const sword = Content.items.get('iron_sword')!; // value 64, durability 160
    const worn = (dur: number) => ({ ...makeStack('iron_sword', 1), durability: dur });
    for (let dur = 0; dur <= sword.durability!; dur++) {
      expect(sellPrice(sword, worn(dur)), `sell@${dur}`).toBe(Math.floor((sword.value * dur) / (2 * sword.durability!)));
      const missing = sword.durability! - dur;
      const repair = missing === 0 ? 0 : Math.max(1, Math.floor((sword.value * missing + 2 * sword.durability! - 1) / (2 * sword.durability!)));
      expect(repairCost(worn(dur)), `repair@${dur}`).toBe(repair);
    }
    // Repairing then selling never beats selling worn (no repair/sell arbitrage).
    for (let dur = 0; dur < sword.durability!; dur++) {
      expect(sellPrice(sword, worn(sword.durability!)) - repairCost(worn(dur))).toBeLessThanOrEqual(sellPrice(sword, worn(dur)));
    }
  });
});

describe('buying and selling', () => {
  it('buys one unit for gold, within reach, while stocked', () => {
    const { w, p, e } = rig();
    const npc = spawnNear(w, e, 'npc', 'npc_merchant');
    cmd(w);
    expect(npc.shop).toBeDefined();
    expect(npc.shop).toEqual(peekShop(w, npc));
    const line = npc.shop!.stock[0]!;
    const stocked = line.count;

    p.gold = line.price - 1;
    cmd(w, { type: 'buy', npc: npc.id, index: 0 });
    expect(countItem(p, line.item)).toBe(0);
    expect(messages(w)).toContain('Not enough gold.');

    p.gold = line.price * (stocked + 1);
    cmd(w, { type: 'buy', npc: npc.id, index: 0 });
    expect(countItem(p, line.item)).toBe(1);
    expect(p.gold).toBe(line.price * stocked);
    expect(line.count).toBe(stocked - 1);

    for (let i = 1; i < stocked; i++) cmd(w, { type: 'buy', npc: npc.id, index: 0 });
    expect(line.count).toBe(0);
    cmd(w, { type: 'buy', npc: npc.id, index: 0 });
    expect(messages(w)).toContain('Sold out.');
    expect(countItem(p, line.item)).toBe(stocked);
    expect(p.gold).toBe(line.price);
  });

  it('refuses when too far away or the pack is full', () => {
    const { w, p, e } = rig();
    const far = spawnNear(w, e, 'npc', 'npc_merchant', 120);
    p.gold = 10_000;
    cmd(w, { type: 'buy', npc: far.id, index: 0 });
    expect(messages(w)).toContain('Too far away.');
    const near = spawnNear(w, e, 'npc', 'npc_smith');
    for (let i = 0; i < INVENTORY_SIZE; i++) give(p, i, 'wooden_sword');
    cmd(w, { type: 'buy', npc: near.id, index: 0 });
    expect(messages(w)).toContain('No room in your pack.');
    expect(p.gold).toBe(10_000);
  });

  it('sells at half value to someone who buys that kind of thing', () => {
    const { w, p, e } = rig();
    spawnNear(w, e, 'npc', 'npc_merchant');
    give(p, 0, 'beetle_shell', 10);
    cmd(w, { type: 'sell', slot: 0, count: 4 });
    expect(messages(w)).toContain('Nobody here buys that.');
    expect(countItem(p, 'beetle_shell')).toBe(10);

    spawnNear(w, e, 'npc', 'npc_outfitter', -6);
    cmd(w, { type: 'sell', slot: 0, count: 4 });
    const each = Math.floor(Content.items.get('beetle_shell')!.value / 2);
    expect(p.gold).toBe(each * 4);
    expect(countItem(p, 'beetle_shell')).toBe(6);
    expect(p.runStats.goldEarned).toBe(each * 4);
  });

  it('the fence buys anything; worn gear sells for less', () => {
    const { w, p, e } = rig();
    spawnNear(w, e, 'npc', 'npc_fence');
    const sword = Content.items.get('iron_sword')!;
    give(p, 0, 'iron_sword');
    p.inventory[0]!.durability = sword.durability! / 4;
    cmd(w, { type: 'sell', slot: 0, count: 1 });
    expect(p.inventory[0]).toBeNull();
    expect(p.gold).toBe(Math.floor((sword.value / 2) * 0.25));
    expect(sellPrice(sword, makeStack('iron_sword', 1))).toBe(Math.floor(sword.value / 2));
    expect(sellPrice(Content.items.get('gold'))).toBe(0);
  });
});

describe('repairs', () => {
  it('a smith restores full durability for gold', () => {
    const { w, p, e } = rig();
    spawnNear(w, e, 'npc', 'npc_smith');
    const max = Content.items.get('iron_pickaxe')!.durability!;
    p.equipment.head = makeStack('iron_helm', 1);
    p.equipment.head.durability = 5;
    give(p, 0, 'iron_pickaxe');
    p.inventory[0]!.durability = 10;
    const cost = repairCost(p.inventory[0]!);
    expect(cost).toBeGreaterThan(0);
    p.gold = cost - 1;
    cmd(w, { type: 'repair', slot: { kind: 'inv', index: 0 } });
    expect(p.inventory[0]!.durability).toBe(10);
    p.gold = cost + 3;
    cmd(w, { type: 'repair', slot: { kind: 'inv', index: 0 } });
    expect(p.inventory[0]!.durability).toBe(max);
    expect(p.gold).toBe(3);
    p.gold = 1000;
    cmd(w, { type: 'repair', slot: { kind: 'equip', slot: 'head' } });
    expect(p.equipment.head.durability).toBe(Content.items.get('iron_helm')!.durability);
  });

  it('a repair kit restores half anywhere', () => {
    const { w, p } = rig();
    const max = Content.items.get('iron_sword')!.durability!;
    give(p, 0, 'iron_sword');
    p.inventory[0]!.durability = 1;
    cmd(w, { type: 'repair', slot: { kind: 'inv', index: 0 } });
    expect(p.inventory[0]!.durability).toBe(1);
    expect(messages(w)).toContain('Find a smith or a repair kit.');
    give(p, 5, 'repair_kit', 2);
    cmd(w, { type: 'repair', slot: { kind: 'inv', index: 0 } });
    expect(p.inventory[0]!.durability).toBe(1 + Math.ceil(max / 2));
    expect(countItem(p, 'repair_kit')).toBe(1);
  });

  it('falls back to a repair kit when the smith is too expensive', () => {
    const { w, p, e } = rig();
    spawnNear(w, e, 'npc', 'npc_smith');
    const max = Content.items.get('iron_sword')!.durability!;
    give(p, 0, 'iron_sword');
    p.inventory[0]!.durability = 10;
    p.gold = 0;
    cmd(w, { type: 'repair', slot: { kind: 'inv', index: 0 } });
    expect(messages(w)).toContain(`Repair costs ${repairCost(p.inventory[0]!)} gold.`);
    expect(p.inventory[0]!.durability).toBe(10);

    give(p, 4, 'repair_kit', 1);
    cmd(w, { type: 'repair', slot: { kind: 'inv', index: 0 } });
    expect(p.inventory[0]!.durability).toBe(10 + Math.ceil(max / 2));
    expect(countItem(p, 'repair_kit')).toBe(0);
    expect(p.gold).toBe(0);

    // With the gold in hand the smith wins and the kit is kept.
    give(p, 4, 'repair_kit', 1);
    p.gold = 1000;
    cmd(w, { type: 'repair', slot: { kind: 'inv', index: 0 } });
    expect(p.inventory[0]!.durability).toBe(max);
    expect(countItem(p, 'repair_kit')).toBe(1);
  });

  it('refuses unbreakable or pristine items', () => {
    const { w, p } = rig();
    give(p, 0, 'wood', 3);
    give(p, 1, 'iron_sword');
    give(p, 5, 'repair_kit', 1);
    cmd(w, { type: 'repair', slot: { kind: 'inv', index: 0 } }, { type: 'repair', slot: { kind: 'inv', index: 1 } });
    expect(countItem(p, 'repair_kit')).toBe(1);
  });
});

describe('shrine', () => {
  it('takes 500 gold once for a permanent blessing', () => {
    const { w, p, e } = rig();
    const shrine = spawnNear(w, e, 'npc', 'npc_shrine');
    const total = () => p.base.hp + p.base.atk + p.base.dex + p.base.mag + p.base.lck;
    const before = total();
    p.gold = 499;
    cmd(w, { type: 'buy', npc: shrine.id, index: 0 });
    expect(total()).toBe(before);
    p.gold = 1200;
    cmd(w, { type: 'buy', npc: shrine.id, index: 0 });
    expect(p.gold).toBe(700);
    expect(total()).toBeGreaterThan(before);
    cmd(w, { type: 'buy', npc: shrine.id, index: 0 });
    expect(p.gold).toBe(700);
  });
});
