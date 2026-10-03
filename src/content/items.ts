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
  // stub: replaced by items workstream (canonical ids referenced by race start items)
  {
    id: 'wooden_axe', name: 'Wooden Axe', category: 'tool', description: 'Chops trees. Hits things.', sprite: 'item_wooden_axe', maxStack: 1, value: 10, tier: 1,
    use: 'swing', damage: 1, cooldown: 0.4, range: 12, knockback: 80, tool: 'axe', toolPower: 1,
  },
  // stub: replaced by items workstream
  {
    id: 'raw_meat', name: 'Raw Meat', category: 'consumable', description: 'Edible. Barely.', sprite: 'item_raw_meat', maxStack: 20, value: 3, tier: 1,
    use: 'consume', consume: { food: 1 },
  },
  // stub: replaced by items workstream (templar start item)
  { id: 'buckler', name: 'Buckler', category: 'armor', description: 'A small round shield.', sprite: 'item_buckler', maxStack: 1, value: 30, tier: 1, equipSlot: 'accessory1', mods: { def: 1 } },
  // stub: replaced by items workstream (wraithkin start item; should cast a projectile)
  { id: 'spark_wand', name: 'Spark Wand', category: 'weapon', description: 'Crackles with stray magic.', sprite: 'item_spark_wand', maxStack: 1, value: 60, tier: 1 },
  // stub: replaced by items workstream (ifrit start item; should cast fireballs)
  { id: 'fire_wand', name: 'Fire Wand', category: 'weapon', description: 'Warm to the touch.', sprite: 'item_fire_wand', maxStack: 1, value: 60, tier: 1 },
  // stub: replaced by items workstream (saurian start item)
  {
    id: 'jade_blade', name: 'Jade Blade', category: 'weapon', description: 'A keen green sword.', sprite: 'item_jade_blade', maxStack: 1, value: 80, tier: 2,
    use: 'swing', damage: 3, cooldown: 0.35, range: 14, knockback: 90,
  },
];
