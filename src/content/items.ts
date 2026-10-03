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
  // stub: replaced by items workstream (canonical material ids referenced by resource drops, level gen)
  { id: 'stick', name: 'Stick', category: 'material', description: 'A sturdy twig.', sprite: 'item_stick', maxStack: 99, value: 2, tier: 1 },
  { id: 'flint', name: 'Flint', category: 'material', description: 'Sharp-edged stone.', sprite: 'item_flint', maxStack: 99, value: 3, tier: 1 },
  { id: 'coal', name: 'Coal', category: 'material', description: 'Burns hot and long.', sprite: 'item_coal', maxStack: 99, value: 4, tier: 1 },
  { id: 'iron_ore', name: 'Iron Ore', category: 'material', description: 'Rust-flecked rock.', sprite: 'item_iron_ore', maxStack: 99, value: 15, tier: 2 },
  { id: 'gold_ore', name: 'Gold Ore', category: 'material', description: 'Glittering rock.', sprite: 'item_gold_ore', maxStack: 99, value: 30, tier: 3 },
  { id: 'diamond', name: 'Diamond', category: 'material', description: 'A brilliant cyan gem.', sprite: 'item_diamond', maxStack: 99, value: 70, tier: 4 },
  { id: 'voidshard', name: 'Voidshard', category: 'material', description: 'A sliver of humming dark crystal.', sprite: 'item_voidshard', maxStack: 99, value: 120, tier: 5 },
  { id: 'fiber', name: 'Fiber', category: 'material', description: 'Tough plant strands.', sprite: 'item_fiber', maxStack: 99, value: 1, tier: 1 },
  { id: 'herb', name: 'Herb', category: 'material', description: 'A fragrant leaf.', sprite: 'item_herb', maxStack: 99, value: 3, tier: 1 },
  { id: 'glowcap', name: 'Glowcap', category: 'material', description: 'A faintly glowing mushroom.', sprite: 'item_glowcap', maxStack: 99, value: 5, tier: 1 },
  { id: 'berry', name: 'Berry', category: 'material', description: 'Small and sweet.', sprite: 'item_berry', maxStack: 99, value: 2, tier: 1 },
  { id: 'frost_crystal', name: 'Frost Crystal', category: 'material', description: 'Cold enough to sting.', sprite: 'item_frost_crystal', maxStack: 99, value: 20, tier: 2 },
  { id: 'ember_core', name: 'Ember Core', category: 'material', description: 'A coal that never cools.', sprite: 'item_ember_core', maxStack: 99, value: 25, tier: 3 },
  { id: 'amethyst_shard', name: 'Amethyst Shard', category: 'material', description: 'A violet crystal shard.', sprite: 'item_amethyst_shard', maxStack: 99, value: 25, tier: 3 },
  { id: 'bog_moss', name: 'Bog Moss', category: 'material', description: 'Damp, springy moss.', sprite: 'item_bog_moss', maxStack: 99, value: 4, tier: 1 },
  { id: 'firefly', name: 'Firefly', category: 'material', description: 'A blinking bug in a jar.', sprite: 'item_firefly', maxStack: 99, value: 10, tier: 1 },
  { id: 'glow_moth', name: 'Glow Moth', category: 'material', description: 'Its wings shed light.', sprite: 'item_glow_moth', maxStack: 99, value: 12, tier: 1 },
  { id: 'stag_beetle', name: 'Stag Beetle', category: 'material', description: 'Pinchy.', sprite: 'item_stag_beetle', maxStack: 99, value: 12, tier: 1 },
];
