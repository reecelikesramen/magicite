import type { ItemDef } from './types';

/** Placeholder seed content — the items workstream replaces this with the full catalogue. */
export const ITEMS: ItemDef[] = [
  { id: 'wood', name: 'Wood', category: 'material', description: 'A sturdy log.', sprite: 'item_wood', maxStack: 99, value: 2, tier: 1 },
  { id: 'stone', name: 'Stone', category: 'material', description: 'A chunk of rock.', sprite: 'item_stone', maxStack: 99, value: 2, tier: 1 },
  { id: 'dirt', name: 'Dirt', category: 'material', description: 'Mostly dirt.', sprite: 'item_dirt', maxStack: 99, value: 0, tier: 1 },
  { id: 'plank', name: 'Plank', category: 'material', description: 'Wood + Wood.', sprite: 'item_plank', maxStack: 99, value: 5, tier: 1 },
  {
    id: 'axe', name: 'Axe', category: 'tool', description: 'Chops trees. Hits things.', sprite: 'item_axe', maxStack: 1, value: 10, tier: 1,
    use: 'swing', damage: 1, cooldown: 0.4, range: 12, knockback: 80, tool: 'axe', toolPower: 1,
  },
  {
    id: 'meat', name: 'Raw Meat', category: 'consumable', description: 'Edible. Barely.', sprite: 'item_meat', maxStack: 20, value: 3, tier: 1,
    use: 'consume', consume: { food: 2 },
  },
];
