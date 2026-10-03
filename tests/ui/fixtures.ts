/**
 * Shared fixtures for UI tests. Registers a few `test_`-prefixed item defs (wearables, a tool, food…)
 * in the global content maps for the duration of a test file. Tests use these instead of the seed
 * catalogue's placeholder items so they keep passing when the items workstream replaces it.
 * Vitest isolates test files, so nothing leaks into other suites.
 */
import { afterAll, beforeAll } from 'vitest';
import { Content } from '../../src/content';
import type { EquipSlot, ItemDef } from '../../src/content/types';
import { INVENTORY_SIZE } from '../../src/sim/constants';
import type { ItemStack } from '../../src/sim/types';
import type { InvView } from '../../src/ui/interaction';

const base = { description: 'Test item.', sprite: 'item_test', maxStack: 1, value: 10, tier: 2 } as const;

export const TEST_ITEMS: ItemDef[] = [
  { ...base, id: 'test_helmet', name: 'Test Helmet', category: 'armor', equipSlot: 'head', mods: { def: 1 } },
  { ...base, id: 'test_tunic', name: 'Test Tunic', category: 'armor', equipSlot: 'body', mods: { def: 2, moveSpeed: 0.1 } },
  { ...base, id: 'test_ring', name: 'Test Ring', category: 'accessory', mods: { lck: 1 } },
  { ...base, id: 'test_robe', name: 'Test Robe', category: 'armor', mods: { mag: 1 } },
  { ...base, id: 'test_arrow', name: 'Test Arrow', category: 'ammo', maxStack: 99, ammoKind: 'arrow' },
  { ...base, id: 'test_potion', name: 'Test Potion', category: 'consumable', maxStack: 10, use: 'consume', consume: { heal: 2 } },
  { ...base, id: 'test_food', name: 'Test Jerky', category: 'consumable', maxStack: 20, tier: 1, use: 'consume', consume: { food: 2 } },
  {
    ...base,
    id: 'test_axe',
    name: 'Test Hatchet',
    category: 'tool',
    description: 'Chops trees. Hits things.',
    tier: 1,
    use: 'swing',
    damage: 1,
    cooldown: 0.4,
    tool: 'axe',
    toolPower: 1,
  },
  {
    ...base,
    id: 'test_sword',
    name: 'Test Sword',
    category: 'weapon',
    use: 'swing',
    damage: 3,
    cooldown: 0.5,
    tier: 3,
    onHit: [{ id: 'bleed', duration: 2, chance: 0.25 }],
    durability: 80,
  } as ItemDef,
];

/** Register TEST_ITEMS for the current test file. */
export function useTestItems(): void {
  const items = Content.items as Map<string, ItemDef>;
  beforeAll(() => {
    for (const d of TEST_ITEMS) items.set(d.id, d);
  });
  afterAll(() => {
    for (const d of TEST_ITEMS) items.delete(d.id);
  });
}

type InvSpec = Record<number, [string, number] | [string, number, number]>;

/** Build an inventory/equipment view: `inv({ 0: ['wood', 3] }, { head: ['test_helmet', 1] })`. */
export function view(inv: InvSpec = {}, equip: Partial<Record<EquipSlot, [string, number]>> = {}): InvView {
  const inventory: (ItemStack | null)[] = new Array(INVENTORY_SIZE).fill(null);
  for (const [k, v] of Object.entries(inv)) inventory[Number(k)] = v[2] !== undefined ? { id: v[0], count: v[1], durability: v[2] } : { id: v[0], count: v[1] };
  const equipment: Record<EquipSlot, ItemStack | null> = { head: null, body: null, accessory1: null, accessory2: null, ammo: null, trinket: null };
  for (const [k, v] of Object.entries(equip)) if (v) equipment[k as EquipSlot] = { id: v[0], count: v[1] };
  return { inventory, equipment };
}
