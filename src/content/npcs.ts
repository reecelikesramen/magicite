import type { ItemCategory, NpcDef } from './types';

/**
 * Town NPCs (GDD §9) and their shop tables. The town generator spawns them as SpawnSpecs
 * `{ kind: 'npc', def: '<npc id>' }`; src/sim/items/shop.ts rolls each one's stock once from the level
 * seed (`shopStock(npcId, district, rng, biome)`), scaled to the district tier.
 */

/** One possible shop line. Eligible while minTier ≤ district tier ≤ maxTier. */
export interface ShopLine {
  item: string;
  /** Relative pick weight. */
  weight: number;
  /** Units stocked (inclusive range). */
  qty: [number, number];
  /** Defaults to the item's tier. */
  minTier?: number;
  /** Defaults to minTier + 2 (old junk drops out of deep shops). */
  maxTier?: number;
  /** Biome traders only: line is offered in towns themed to this biome. */
  biome?: string;
  /** Always stocked when eligible (ignores weight; still counts toward `slots`). */
  always?: boolean;
}

export interface ShopDef {
  /** Number of stock lines rolled. */
  slots: number;
  lines: ShopLine[];
  /** Add one "teaser" line: a random weapon/armour one tier above the district, at a premium. */
  teaser?: boolean;
  /** What this NPC buys back (at floor(value / 2)): item categories, `#tag`s, or 'all'. */
  buys: 'all' | (ItemCategory | `#${string}`)[];
  /** Repairs worn gear for gold. */
  repairs?: boolean;
  /** Shrine: a single prayer for `prayerCost` gold. */
  prayerCost?: number;
}

const L = (item: string, weight: number, qty: [number, number], extra: Partial<ShopLine> = {}): ShopLine => ({ item, weight, qty, ...extra });

export const SHOPS: Readonly<Record<string, ShopDef>> = {
  npc_merchant: {
    slots: 6,
    teaser: true,
    buys: ['consumable', 'placeable', 'ammo'],
    lines: [
      L('recipe_scroll', 1, [1, 2], { always: true, maxTier: 99 }),
      L('bread', 5, [2, 4], { maxTier: 99 }),
      L('cooked_meat', 4, [2, 4], { maxTier: 99 }),
      L('berry_pie', 2, [1, 2], { maxTier: 99 }),
      L('hearty_stew', 3, [1, 3], { maxTier: 99 }),
      L('health_potion', 6, [1, 3], { maxTier: 99 }),
      L('mana_potion', 4, [1, 3], { maxTier: 99 }),
      L('stamina_tonic', 3, [1, 2], { maxTier: 99 }),
      L('antidote', 3, [1, 2], { minTier: 2, maxTier: 99 }),
      L('mystery_potion', 2, [1, 2], { maxTier: 99 }),
      L('greater_health_potion', 4, [1, 2], { maxTier: 99 }),
      L('greater_mana_potion', 3, [1, 2], { maxTier: 99 }),
      L('phoenix_draught', 1, [1, 1], { maxTier: 99 }),
      L('torch', 5, [4, 10], { maxTier: 99 }),
      L('lantern', 2, [1, 3], { maxTier: 99 }),
      L('campfire', 3, [1, 2], { maxTier: 99 }),
      L('arrow', 5, [15, 30], { maxTier: 3 }),
      L('iron_arrow', 4, [10, 20]),
      L('gold_arrow', 3, [10, 20]),
      L('diamond_arrow', 2, [8, 15]),
      L('bolt', 3, [10, 20]),
      L('bomb', 3, [2, 4], { maxTier: 99 }),
      L('platform_kit', 2, [4, 8], { maxTier: 99 }),
      L('ladder_kit', 2, [4, 8], { maxTier: 99 }),
      L('repair_kit', 2, [1, 2], { maxTier: 99 }),
      L('elixir_of_vigor', 1, [1, 1], { minTier: 4, maxTier: 99 }),
      L('elixir_of_might', 1, [1, 1], { minTier: 4, maxTier: 99 }),
      L('elixir_of_finesse', 1, [1, 1], { minTier: 4, maxTier: 99 }),
      L('elixir_of_wisdom', 1, [1, 1], { minTier: 4, maxTier: 99 }),
    ],
  },
  npc_trader: {
    slots: 5,
    buys: ['material'],
    lines: [
      // Everywhere
      L('hide', 3, [3, 6], { maxTier: 99 }),
      L('bone', 2, [3, 6], { maxTier: 99 }),
      L('feather', 2, [3, 6], { maxTier: 99 }),
      L('fiber', 2, [5, 10], { maxTier: 99 }),
      L('egg', 2, [2, 4], { maxTier: 99 }),
      // woods
      L('fang', 4, [2, 4], { biome: 'woods', maxTier: 99 }),
      L('slime_gel', 4, [3, 6], { biome: 'woods', maxTier: 99 }),
      L('firefly', 3, [2, 4], { biome: 'woods', maxTier: 99 }),
      L('herb', 3, [3, 6], { biome: 'woods', maxTier: 99 }),
      L('raw_meat', 3, [2, 5], { biome: 'woods', maxTier: 99 }),
      // fen
      L('bog_moss', 5, [3, 6], { biome: 'fen', minTier: 1, maxTier: 99 }),
      L('wisp_essence', 3, [1, 3], { biome: 'fen', minTier: 1, maxTier: 99 }),
      L('slime_gel', 3, [3, 6], { biome: 'fen', maxTier: 99 }),
      L('glow_moth', 3, [2, 4], { biome: 'fen', minTier: 1, maxTier: 99 }),
      L('venom_sac', 2, [1, 3], { biome: 'fen', minTier: 1, maxTier: 99 }),
      // hollow
      L('iron_ore', 5, [3, 6], { biome: 'hollow', minTier: 1, maxTier: 99 }),
      L('coal', 4, [4, 8], { biome: 'hollow', maxTier: 99 }),
      L('gold_ore', 3, [2, 4], { biome: 'hollow', minTier: 2, maxTier: 99 }),
      L('silk', 3, [2, 5], { biome: 'hollow', minTier: 1, maxTier: 99 }),
      L('bat_wing', 3, [2, 4], { biome: 'hollow', maxTier: 99 }),
      L('stag_beetle', 2, [1, 3], { biome: 'hollow', minTier: 1, maxTier: 99 }),
      // rime
      L('frost_crystal', 5, [2, 5], { biome: 'rime', minTier: 1, maxTier: 99 }),
      L('glow_moth', 3, [2, 4], { biome: 'rime', minTier: 1, maxTier: 99 }),
      L('beetle_shell', 2, [2, 4], { biome: 'rime', maxTier: 99 }),
      L('frostweave', 2, [1, 2], { biome: 'rime', minTier: 2, maxTier: 99 }),
      // amethyst
      L('amethyst_shard', 5, [2, 4], { biome: 'amethyst', minTier: 2, maxTier: 99 }),
      L('wisp_essence', 3, [1, 3], { biome: 'amethyst', minTier: 2, maxTier: 99 }),
      L('beetle_shell', 3, [2, 4], { biome: 'amethyst', maxTier: 99 }),
      L('diamond', 1, [1, 2], { biome: 'amethyst', minTier: 3, maxTier: 99 }),
      // cinder
      L('ember_core', 5, [1, 3], { biome: 'cinder', minTier: 3, maxTier: 99 }),
      L('magma_scale', 4, [1, 3], { biome: 'cinder', minTier: 3, maxTier: 99 }),
      L('coal', 3, [5, 10], { biome: 'cinder', maxTier: 99 }),
      L('gold_ore', 3, [2, 5], { biome: 'cinder', minTier: 2, maxTier: 99 }),
      // lair approach (deep towns)
      L('voidshard', 1, [1, 1], { minTier: 5, maxTier: 99 }),
    ],
  },
  npc_smith: {
    slots: 6,
    repairs: true,
    teaser: true,
    buys: ['weapon', 'tool', '#ore', '#bar', '#part'],
    lines: [
      L('iron_bar', 6, [2, 4], { minTier: 1, maxTier: 99 }),
      L('gold_bar', 4, [1, 3], { minTier: 3, maxTier: 99 }),
      L('coal', 3, [4, 8], { maxTier: 99 }),
      L('repair_kit', 3, [1, 2], { maxTier: 99 }),
      L('stone_axe', 3, [1, 1], { maxTier: 2 }),
      L('stone_pickaxe', 4, [1, 1], { maxTier: 2 }),
      L('stone_sword', 3, [1, 1], { maxTier: 2 }),
      L('flint_spear', 2, [1, 1], { maxTier: 2 }),
      L('iron_axe', 3, [1, 1]),
      L('iron_pickaxe', 4, [1, 1]),
      L('iron_sword', 3, [1, 1]),
      L('iron_greatsword', 2, [1, 1]),
      L('iron_spear', 2, [1, 1]),
      L('iron_dagger', 2, [1, 1]),
      L('iron_bow', 2, [1, 1]),
      L('iron_crossbow', 1, [1, 1]),
      L('gold_axe', 2, [1, 1]),
      L('gold_pickaxe', 3, [1, 1]),
      L('gold_sword', 3, [1, 1]),
      L('gold_greatsword', 2, [1, 1]),
      L('gold_spear', 2, [1, 1]),
      L('gold_bow', 2, [1, 1]),
      L('diamond_pickaxe', 2, [1, 1]),
      L('diamond_sword', 2, [1, 1]),
      L('diamond_greatsword', 1, [1, 1]),
      L('diamond_crossbow', 1, [1, 1]),
      L('throwing_knife', 2, [5, 10], { maxTier: 99 }),
    ],
  },
  npc_outfitter: {
    slots: 5,
    teaser: true,
    buys: ['armor', 'accessory', '#monster'],
    lines: [
      L('string', 3, [3, 6], { maxTier: 99 }),
      L('fabric', 3, [2, 4], { maxTier: 99 }),
      L('leather', 4, [2, 4], { maxTier: 99 }),
      L('leather_cap', 4, [1, 1], { maxTier: 3 }),
      L('leather_tunic', 4, [1, 1], { maxTier: 3 }),
      L('cloth_hood', 3, [1, 1], { maxTier: 3 }),
      L('cloth_robe', 3, [1, 1], { maxTier: 3 }),
      L('buckler', 3, [1, 1], { maxTier: 3 }),
      L('bogscale_hood', 2, [1, 1]),
      L('bogscale_vest', 2, [1, 1]),
      L('frostweave_hood', 2, [1, 1]),
      L('frostweave_robe', 2, [1, 1]),
      L('iron_helm', 2, [1, 1]),
      L('iron_chestplate', 2, [1, 1]),
      L('gold_helm', 1, [1, 1]),
      L('gold_chestplate', 1, [1, 1]),
      L('feather_charm', 2, [1, 1], { maxTier: 4 }),
      L('glow_charm', 2, [1, 1], { maxTier: 4 }),
      L('fang_necklace', 2, [1, 1], { maxTier: 3 }),
      L('shell_amulet', 2, [1, 1], { maxTier: 3 }),
      L('wing_charm', 1, [1, 1]),
      L('ring_of_vigor', 1, [1, 1]),
      L('ring_of_aim', 1, [1, 1]),
    ],
  },
  npc_fence: {
    slots: 3,
    buys: 'all',
    lines: [
      L('mystery_potion', 3, [1, 3], { maxTier: 99 }),
      L('bomb', 3, [1, 3], { maxTier: 99 }),
      L('sticky_bomb', 2, [1, 3], { maxTier: 99 }),
      L('throwing_knife', 2, [4, 8], { maxTier: 99 }),
      L('venom_knife', 2, [3, 6], { maxTier: 99 }),
      L('lucky_charm', 2, [1, 1], { maxTier: 99 }),
      L('recipe_scroll', 2, [1, 2], { maxTier: 99 }),
      L('ring_of_precision', 1, [1, 1], { maxTier: 99 }),
      L('ring_of_fortune', 1, [1, 1], { maxTier: 99 }),
      L('ring_of_haste', 1, [1, 1], { maxTier: 99 }),
    ],
  },
  npc_shrine: {
    slots: 0,
    buys: [],
    lines: [],
    prayerCost: 500,
  },
};

function stockOf(id: string): string[] {
  const shop = SHOPS[id];
  if (!shop) return [];
  const out: string[] = [];
  for (const l of shop.lines) if (!out.includes(l.item)) out.push(l.item);
  return out;
}

export const NPCS: NpcDef[] = [
  {
    id: 'npc_merchant', name: 'Merchant', sprite: 'npc_merchant', role: 'shop', stock: stockOf('npc_merchant'),
    dialogue: [
      'Fresh bread, cold potions, warm torches!',
      'Coin first, questions never.',
      'You look like someone who needs a torch.',
      'Everything here is mostly legal.',
      'Scrolls! Learn a recipe without blowing anything up.',
      'Tip: herb and glowcap brew a potion. Which potion? Exciting, isn\'t it?',
      'Tip: raw meat keeps you alive. Cooked meat keeps you happy. Find a campfire.',
    ],
  },
  {
    id: 'npc_trader', name: 'Trader', sprite: 'npc_trader', role: 'shop', stock: stockOf('npc_trader'),
    dialogue: [
      'Got things from the deep you\'ve never smelled.',
      'Pelts, shells, glowing bits. Fair prices, mostly.',
      'Don\'t ask where I found it. Or what it was.',
      'I\'ll take your scraps, too. One creature\'s leftovers...',
      'Tip: two hides tan into leather. Leather and string make a cap.',
      'Tip: catch two fireflies and squeeze. Gently. You get a fire gem.',
    ],
  },
  {
    id: 'npc_smith', name: 'Smith', sprite: 'npc_smith', role: 'smith', stock: stockOf('npc_smith'),
    dialogue: [
      'Bring me ore and I\'ll bring you an edge.',
      'That blade\'s seen better days. Let me fix it.',
      'Iron remembers every strike.',
      'Forge is hot. Smelt your ore while you\'re in town.',
      'Tip: two bars make a blade. Blade and stick make a sword.',
      'Tip: bar and stone make a pick head. Better picks crack harder veins.',
    ],
  },
  {
    id: 'npc_outfitter', name: 'Outfitter', sprite: 'npc_outfitter', role: 'shop', stock: stockOf('npc_outfitter'),
    dialogue: [
      'Leather, cloth, and a little bit of luck.',
      'You\'ll want something between you and the teeth.',
      'Measured twice, stitched once.',
      'Rings? Charms? Fashion is survival down here.',
      'Tip: hang a fang on a string and wear it with pride.',
      'Tip: set a gem in gold and you\'ve got yourself a ring.',
    ],
  },
  {
    id: 'npc_fence', name: 'Fence', sprite: 'npc_fence', role: 'shop', stock: stockOf('npc_fence'),
    dialogue: [
      'I buy anything. Anything.',
      'Half price, no questions, no receipts.',
      'Shh. Business is business.',
      'Found something you can\'t use? I can.',
    ],
  },
  {
    id: 'npc_shrine', name: 'Old Shrine', sprite: 'npc_shrine', role: 'healer',
    dialogue: [
      'A hum, low and old, asks for an offering.',
      'Five hundred gold. The stone remembers generosity.',
      'Kneel, and be changed.',
    ],
  },
  // Town critter (GDD §8). Level gen spawns it as an npc when no 'chicken' enemy def exists.
  {
    id: 'chicken', name: 'Chicken', sprite: 'npc_chicken', role: 'flavor',
    dialogue: ['Bawk.', 'Bawk bawk?', '...bawk.'],
  },
];
