import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { createRun, emptyInput } from '../../src/sim';
import { HOTBAR_SIZE, INVENTORY_SIZE } from '../../src/sim/constants';
import { DROP_DELAY } from '../../src/sim/items/commands';
import { spawnPickup } from '../../src/sim/items/drops';
import { addItem, countItem, makeStack, roomFor } from '../../src/sim/items/inventory';
import { cmd, give, idle, rig, SETUP } from './helpers';

const maxDur = (id: string) => Content.items.get(id)!.durability!;

describe('stacks and durability', () => {
  it('new durable stacks start at full durability; others carry none', () => {
    expect(makeStack('iron_pickaxe', 1)).toEqual({ id: 'iron_pickaxe', count: 1, durability: maxDur('iron_pickaxe') });
    expect(makeStack('leather_cap', 1).durability).toBe(maxDur('leather_cap'));
    expect(makeStack('wood', 5)).toEqual({ id: 'wood', count: 5 });
  });

  it('starting items get durability too', () => {
    const w = createRun(3, [SETUP]);
    const p = w.players[0]!;
    for (const s of p.inventory) {
      if (!s) continue;
      expect(s.durability, s.id).toBe(Content.items.get(s.id)!.durability);
    }
  });

  it('addItem tops up existing stacks, then fills empty slots hotbar-first', () => {
    const { p } = rig();
    give(p, 3, 'wood', 97);
    expect(addItem(p, 'wood', 5)).toBe(0);
    expect(p.inventory[3]).toEqual({ id: 'wood', count: 99 });
    expect(p.inventory[0]).toEqual({ id: 'wood', count: 3 });
  });

  it('addItem returns what does not fit', () => {
    const { p } = rig();
    for (let i = 0; i < INVENTORY_SIZE; i++) give(p, i, 'stone', 99);
    p.inventory[4] = makeStack('stone', 90);
    expect(roomFor(p, 'stone')).toBe(9);
    expect(addItem(p, 'stone', 12)).toBe(3);
    expect(addItem(p, 'wood', 1)).toBe(1);
  });

  it('durable items never merge', () => {
    const { p } = rig();
    addItem(p, 'iron_sword', 1);
    addItem(p, 'iron_sword', 1);
    expect(p.inventory.filter((s) => s?.id === 'iron_sword')).toHaveLength(2);
    expect(roomFor(p, 'iron_sword')).toBe(INVENTORY_SIZE - 2);
  });
});

describe('swap', () => {
  it('moves, exchanges and merges inventory slots', () => {
    const { w, p } = rig();
    give(p, 0, 'wood', 60);
    give(p, 1, 'stone', 3);
    cmd(w, { type: 'swap', from: { kind: 'inv', index: 0 }, to: { kind: 'inv', index: 9 } });
    expect(p.inventory[0]).toBeNull();
    expect(p.inventory[9]).toEqual({ id: 'wood', count: 60 });
    cmd(w, { type: 'swap', from: { kind: 'inv', index: 1 }, to: { kind: 'inv', index: 9 } });
    expect(p.inventory[1]).toEqual({ id: 'wood', count: 60 });
    expect(p.inventory[9]).toEqual({ id: 'stone', count: 3 });
    give(p, 2, 'wood', 50);
    cmd(w, { type: 'swap', from: { kind: 'inv', index: 2 }, to: { kind: 'inv', index: 1 } });
    expect(p.inventory[1]).toEqual({ id: 'wood', count: 99 });
    expect(p.inventory[2]).toEqual({ id: 'wood', count: 11 });
  });

  it('equipment slots only accept matching items', () => {
    const { w, p } = rig();
    give(p, 0, 'wooden_sword');
    give(p, 1, 'leather_cap');
    give(p, 2, 'fang_necklace');
    cmd(w, { type: 'swap', from: { kind: 'inv', index: 0 }, to: { kind: 'equip', slot: 'head' } });
    expect(p.equipment.head).toBeNull();
    cmd(w, { type: 'swap', from: { kind: 'inv', index: 1 }, to: { kind: 'equip', slot: 'body' } });
    expect(p.equipment.body).toBeNull();
    cmd(w, { type: 'swap', from: { kind: 'inv', index: 1 }, to: { kind: 'equip', slot: 'head' } });
    expect(p.equipment.head?.id).toBe('leather_cap');
    expect(p.inventory[1]).toBeNull();
    // Either accessory slot takes a necklace.
    cmd(w, { type: 'swap', from: { kind: 'inv', index: 2 }, to: { kind: 'equip', slot: 'accessory2' } });
    expect(p.equipment.accessory2?.id).toBe('fang_necklace');
    // Swapping the cap back onto a sword would put the sword on your head: refused.
    cmd(w, { type: 'swap', from: { kind: 'equip', slot: 'head' }, to: { kind: 'inv', index: 0 } });
    expect(p.equipment.head?.id).toBe('leather_cap');
    expect(p.inventory[0]?.id).toBe('wooden_sword');
    // ...but onto another helmet it is a straight exchange.
    give(p, 3, 'iron_helm');
    cmd(w, { type: 'swap', from: { kind: 'equip', slot: 'head' }, to: { kind: 'inv', index: 3 } });
    expect(p.equipment.head?.id).toBe('iron_helm');
    expect(p.inventory[3]?.id).toBe('leather_cap');
  });

  it('moves accessories between the two accessory slots', () => {
    const { w, p } = rig();
    p.equipment.accessory1 = makeStack('ring_of_might', 1);
    cmd(w, { type: 'swap', from: { kind: 'equip', slot: 'accessory1' }, to: { kind: 'equip', slot: 'accessory2' } });
    expect(p.equipment.accessory1).toBeNull();
    expect(p.equipment.accessory2?.id).toBe('ring_of_might');
    cmd(w, { type: 'swap', from: { kind: 'equip', slot: 'accessory2' }, to: { kind: 'equip', slot: 'head' } });
    expect(p.equipment.accessory2?.id).toBe('ring_of_might');
  });
});

describe('equip / unequip', () => {
  it('equips into the natural slot and swaps out the previous piece', () => {
    const { w, p } = rig();
    give(p, 0, 'leather_tunic');
    give(p, 1, 'iron_chestplate');
    cmd(w, { type: 'equip', slot: 0 });
    expect(p.equipment.body?.id).toBe('leather_tunic');
    expect(p.inventory[0]).toBeNull();
    cmd(w, { type: 'equip', slot: 1 });
    expect(p.equipment.body?.id).toBe('iron_chestplate');
    expect(p.inventory[1]?.id).toBe('leather_tunic');
  });

  it('fills accessory slots in order, then replaces the first', () => {
    const { w, p } = rig();
    give(p, 0, 'ring_of_might');
    give(p, 1, 'ring_of_aim');
    give(p, 2, 'ring_of_vigor');
    cmd(w, { type: 'equip', slot: 0 }, { type: 'equip', slot: 1 }, { type: 'equip', slot: 2 });
    expect(p.equipment.accessory1?.id).toBe('ring_of_vigor');
    expect(p.equipment.accessory2?.id).toBe('ring_of_aim');
    expect(p.inventory[2]?.id).toBe('ring_of_might');
  });

  it('charms and shields share the trinket slot', () => {
    const { w, p } = rig();
    give(p, 0, 'buckler');
    give(p, 1, 'feather_charm');
    cmd(w, { type: 'equip', slot: 0 });
    expect(p.equipment.trinket?.id).toBe('buckler');
    cmd(w, { type: 'equip', slot: 1 });
    expect(p.equipment.trinket?.id).toBe('feather_charm');
    expect(p.inventory[1]?.id).toBe('buckler');
  });

  it('equipping more of the same ammo tops up the ammo slot', () => {
    const { w, p } = rig();
    give(p, 0, 'arrow', 30);
    give(p, 1, 'arrow', 20);
    cmd(w, { type: 'equip', slot: 0 }, { type: 'equip', slot: 1 });
    expect(p.equipment.ammo).toEqual({ id: 'arrow', count: 50 });
    expect(p.inventory[0]).toBeNull();
    expect(p.inventory[1]).toBeNull();
  });

  it('refuses things that cannot be worn', () => {
    const { w, p } = rig();
    give(p, 0, 'wood', 3);
    cmd(w, { type: 'equip', slot: 0 });
    expect(p.inventory[0]).toEqual({ id: 'wood', count: 3 });
    expect(Object.values(p.equipment).every((s) => s === null)).toBe(true);
  });

  it('unequips into the pack, and keeps it on when the pack is full', () => {
    const { w, p } = rig();
    p.equipment.head = makeStack('iron_helm', 1);
    p.equipment.head.durability = 7;
    cmd(w, { type: 'unequip', slot: 'head' });
    expect(p.equipment.head).toBeNull();
    expect(p.inventory[0]).toEqual({ id: 'iron_helm', count: 1, durability: 7 });

    p.equipment.body = makeStack('leather_tunic', 1);
    for (let i = 0; i < INVENTORY_SIZE; i++) give(p, i, 'stone', 99);
    cmd(w, { type: 'unequip', slot: 'body' });
    expect(p.equipment.body?.id).toBe('leather_tunic');
  });
});

describe('split, sort, drop', () => {
  it('split moves half (rounded down) into the first empty backpack slot', () => {
    const { w, p } = rig();
    give(p, 2, 'wood', 7);
    cmd(w, { type: 'split', slot: 2 });
    expect(p.inventory[2]).toEqual({ id: 'wood', count: 4 });
    expect(p.inventory[HOTBAR_SIZE]).toEqual({ id: 'wood', count: 3 });
    give(p, 3, 'iron_sword');
    cmd(w, { type: 'split', slot: 3 });
    expect(p.inventory.filter((s) => s?.id === 'iron_sword')).toHaveLength(1);
  });

  it('sort merges and orders the backpack but leaves the hotbar alone', () => {
    const { w, p } = rig();
    give(p, 0, 'wood', 5);
    give(p, 6, 'wood', 40);
    give(p, 9, 'health_potion', 1);
    give(p, 11, 'wood', 70);
    give(p, 14, 'iron_sword');
    give(p, 17, 'wooden_sword');
    cmd(w, { type: 'sort' });
    expect(p.inventory[0]).toEqual({ id: 'wood', count: 5 });
    const pack = p.inventory.slice(HOTBAR_SIZE).map((s) => s && `${s.id}x${s.count}`);
    expect(pack.slice(0, 5)).toEqual(['iron_swordx1', 'wooden_swordx1', 'health_potionx1', 'woodx99', 'woodx11']);
    expect(pack.slice(5).every((s) => s === null)).toBe(true);
  });

  it('drop tosses a pickup forward that keeps durability and cannot be grabbed back at once', () => {
    const { w, p, e } = rig();
    give(p, 0, 'iron_sword');
    p.inventory[0]!.durability = 12;
    give(p, 1, 'wood', 10);
    const cx = e.x + e.w / 2;
    cmd(w, { type: 'drop', slot: { kind: 'inv', index: 0 }, count: 1 }, { type: 'drop', slot: { kind: 'inv', index: 1 }, count: 3 });
    expect(p.inventory[0]).toBeNull();
    expect(p.inventory[1]).toEqual({ id: 'wood', count: 7 });
    const drops = w.entities.filter((o) => o.kind === 'pickup');
    const sword = drops.find((o) => o.pickup!.item.id === 'iron_sword')!;
    const wood = drops.find((o) => o.pickup!.item.id === 'wood')!;
    expect(sword.pickup!.item).toEqual({ id: 'iron_sword', count: 1, durability: 12 });
    expect(wood.pickup!.item).toEqual({ id: 'wood', count: 3 });
    expect(Math.sign(sword.x + sword.w / 2 - cx)).toBe(e.facing);
    expect(sword.pickup!.delay).toBeGreaterThan(DROP_DELAY - 5);

    // Bring it back under the player once the delay has passed: it is collected intact.
    idle(w, DROP_DELAY);
    sword.x = e.x;
    sword.y = e.y + e.h - sword.h;
    sword.vx = sword.vy = 0;
    w.step([emptyInput()]);
    expect(countItem(p, 'iron_sword')).toBe(1);
    expect(p.inventory.find((s) => s?.id === 'iron_sword')!.durability).toBe(12);
  });

  it('dropping worn armour updates stats', () => {
    const { w, p, e } = rig();
    give(p, 0, 'iron_chestplate');
    cmd(w, { type: 'equip', slot: 0 });
    expect(p.stats.def).toBe(1);
    expect(e.armor).toBe(1);
    cmd(w, { type: 'drop', slot: { kind: 'equip', slot: 'body' }, count: 1 });
    expect(p.equipment.body).toBeNull();
    expect(p.stats.def).toBe(0);
    expect(e.armor).toBe(0);
  });
});

describe('pickups', () => {
  /** Put a pickup right under the player, ready to be collected next tick. */
  const under = (w: ReturnType<typeof rig>['w'], e: ReturnType<typeof rig>['e'], id: string, count: number, gold = 0) => {
    const pk = spawnPickup(w, id, count, e.x + e.w / 2, e.y + e.h, gold);
    pk.pickup!.delay = 0;
    pk.x = e.x + e.w / 2 - pk.w / 2;
    pk.y = e.y + e.h / 2 - pk.h / 2;
    pk.vx = pk.vy = 0;
    pk.gravityScale = 0;
    return pk;
  };

  it('coins go to the wallet, scaled by goldFind', () => {
    const { w, p, e } = rig();
    p.gold = 0;
    under(w, e, 'gold', 5, 5);
    idle(w, 1);
    expect(p.gold).toBe(5);
    give(p, 0, 'ring_of_fortune'); // goldFind +0.25
    cmd(w, { type: 'equip', slot: 0 });
    expect(p.mods.goldFind).toBeCloseTo(0.25);
    under(w, e, 'gold', 4, 4);
    idle(w, 1);
    expect(p.gold).toBe(5 + 5); // 4 × 1.25
    // Fractions are paid by a world.rng roll: one coin is worth 1 or 2, never anything else.
    for (let i = 0; i < 20; i++) {
      const before = p.gold;
      under(w, e, 'gold', 1, 1);
      idle(w, 1);
      expect([1, 2]).toContain(p.gold - before);
    }
    expect(countItem(p, 'gold')).toBe(0);
  });

  it('a drop of the gold currency id never lands in the pack as an item', () => {
    const { w, p, e } = rig();
    p.gold = 0;
    under(w, e, 'gold', 3);
    idle(w, 1);
    expect(p.gold).toBe(3);
    expect(countItem(p, 'gold')).toBe(0);
  });
});
