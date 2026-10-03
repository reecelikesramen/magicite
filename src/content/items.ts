import type { ItemCategory, ItemDef } from './types';

/**
 * The Phase-1 item catalogue (GDD §7). Pure data; behaviour lives in src/sim/items (inventory,
 * crafting, shops, consumables) and src/sim/combat (using held items).
 *
 * Balance anchors: player HP 4–6 early, ATK/DEX/MAG ≈ 3. Damage = weapon + ATK (melee), weapon +
 * ammo + DEX (ranged), spell + MAG (magic). Tier-1 sword ≈ 2, late weapons 30–60.
 * Tiers track depth: T1 wood/stone (D1–4) · T2 iron (D3–8) · T3 gold (D7–13) · T4 diamond (D12–18) ·
 * T5 voidshard / legendary (D17+). Tool power: wooden 1 · stone 2 · iron 3 · gold 4 · diamond 5, so ore
 * rocks should use hardness rock_stone 1 · rock_iron 2 · rock_gold 3 · rock_diamond 4 · rock_voidshard 5.
 *
 * Tags with meaning in the sim:
 *  - `batch`   crafting produces min(A,B) × count (materials and ammo always batch; GDD §2b.5)
 *  - `light` / `heavy` swing weight · `shield` blocks with Secondary · `drink` drink sfx (combat)
 *  - `food` / `potion` / `elixir` consumable families · `trophy` boss drop (see BOSS_TROPHIES)
 *  - `no_loot` never rolled by chests · `unique` not expected to be obtainable (legacy ids only)
 *  - `gem` `ore` `bar` `bug` `monster` `biome` `part` informational groupings (shops / loot / UI)
 */

/** Tile ids for `places` (mirrors src/sim/tiles.ts `Tile`; content must not import the sim). */
const TILE_GROUND = 1;
const TILE_PLATFORM = 4;
const TILE_LADDER = 5;

type Extra = Partial<Omit<ItemDef, 'id' | 'name' | 'category' | 'tier' | 'value' | 'description'>>;

function item(category: ItemCategory, id: string, name: string, tier: number, value: number, description: string, extra: Extra = {}): ItemDef {
  const gear = category === 'weapon' || category === 'tool' || category === 'armor' || category === 'accessory';
  return { id, name, category, description, sprite: `item_${id}`, maxStack: gear ? 1 : 99, value, tier, ...extra };
}

const mat = (id: string, name: string, tier: number, value: number, description: string, extra: Extra = {}) =>
  item('material', id, name, tier, value, description, extra);

/** Crafting part (blade / axe head / pick head): a stackable material. */
const part = (id: string, name: string, tier: number, value: number, description: string) =>
  item('material', id, name, tier, value, description, { tags: ['part'] });

const food = (id: string, name: string, tier: number, value: number, description: string, extra: Extra = {}) =>
  item('consumable', id, name, tier, value, description, { use: 'consume', maxStack: 20, ...extra, tags: ['food', ...(extra.tags ?? [])] });

const potion = (id: string, name: string, tier: number, value: number, description: string, extra: Extra = {}) =>
  item('consumable', id, name, tier, value, description, { use: 'consume', maxStack: 10, ...extra, tags: ['potion', 'drink', ...(extra.tags ?? [])] });

/** Melee weapon: swords / great swords / spears / daggers / clubs. */
function melee(id: string, name: string, tier: number, value: number, description: string, o: {
  damage: number; cooldown: number; range: number; knockback: number; durability: number; use?: 'swing' | 'thrust'; tags?: string[];
} & Extra): ItemDef {
  return item('weapon', id, name, tier, value, description, { use: 'swing', damageType: 'physical', ...o });
}

function axe(id: string, name: string, tier: number, value: number, power: number, damage: number, durability: number, description: string): ItemDef {
  return item('tool', id, name, tier, value, description, {
    use: 'swing', tool: 'axe', toolPower: power, damage, damageType: 'physical', cooldown: 0.45, range: 11, knockback: 90, durability,
  });
}

function pick(id: string, name: string, tier: number, value: number, power: number, damage: number, durability: number, description: string): ItemDef {
  return item('tool', id, name, tier, value, description, {
    use: 'swing', tool: 'pickaxe', toolPower: power, damage, damageType: 'physical', cooldown: 0.4, range: 11, knockback: 60, durability,
  });
}

function bow(id: string, name: string, tier: number, value: number, damage: number, cooldown: number, durability: number, description: string, extra: Extra = {}): ItemDef {
  return item('weapon', id, name, tier, value, description, {
    use: 'shoot', projectile: 'arrow', ammoType: 'arrow', damage, cooldown, durability, knockback: 60, ...extra,
  });
}

function crossbow(id: string, name: string, tier: number, value: number, damage: number, cooldown: number, durability: number, description: string): ItemDef {
  return item('weapon', id, name, tier, value, description, {
    use: 'shoot', projectile: 'bolt', ammoType: 'bolt', damage, cooldown, durability, knockback: 100,
  });
}

function spell(id: string, name: string, tier: number, value: number, projectile: string, damage: number, manaCost: number, cooldown: number, durability: number, description: string, extra: Extra = {}): ItemDef {
  const damageType = projectile === 'fireball' ? 'fire' : projectile === 'ice_shard' ? 'ice' : projectile === 'lightning' ? 'lightning' : 'magic';
  return item('weapon', id, name, tier, value, description, { use: 'cast', projectile, damage, manaCost, cooldown, durability, damageType, ...extra });
}

function ammo(id: string, name: string, tier: number, value: number, kind: 'arrow' | 'bolt', damage: number, description: string, extra: Extra = {}): ItemDef {
  return item('ammo', id, name, tier, value, description, {
    ammoKind: kind, projectile: kind, damage, equipSlot: 'ammo', maxStack: 99, ...extra, tags: [kind, ...(extra.tags ?? [])],
  });
}

function armor(id: string, name: string, tier: number, value: number, slot: 'head' | 'body', durability: number, mods: ItemDef['mods'], description: string, extra: Extra = {}): ItemDef {
  return item('armor', id, name, tier, value, description, { equipSlot: slot, durability, mods, ...extra });
}

function shield(id: string, name: string, tier: number, value: number, durability: number, mods: ItemDef['mods'], description: string): ItemDef {
  return item('armor', id, name, tier, value, description, { equipSlot: 'trinket', durability, mods, tags: ['shield'] });
}

/** Rings and amulets: either accessory slot. */
const trinketA = (id: string, name: string, tier: number, value: number, mods: ItemDef['mods'], description: string) =>
  item('accessory', id, name, tier, value, description, { equipSlot: 'accessory1', mods });

/** Charms: the trinket slot (shared with shields). */
const charm = (id: string, name: string, tier: number, value: number, mods: ItemDef['mods'], description: string) =>
  item('accessory', id, name, tier, value, description, { equipSlot: 'trinket', mods, tags: ['charm'] });

export const ITEMS: ItemDef[] = [
  // ------------------------------------------------------------------------------------------------
  // Currency
  // ------------------------------------------------------------------------------------------------
  item('key', 'gold', 'Gold', 1, 1, 'Vault coin. Spend it in town.', { maxStack: 9999, tags: ['currency', 'no_loot'] }),

  // ------------------------------------------------------------------------------------------------
  // Basic materials (gathered: trees, rocks, plants, tiles)
  // ------------------------------------------------------------------------------------------------
  mat('wood', 'Wood', 1, 2, 'A sturdy log. Two of them make planks.', { tags: ['fuel'] }),
  mat('stick', 'Stick', 1, 1, 'Handle, shaft or kindling. Comes with every tree.'),
  mat('plank', 'Plank', 1, 4, 'Split and smoothed. Wood + Wood.'),
  mat('shaft', 'Long Shaft', 1, 3, 'Two sticks lashed end to end. For spears, bolts and nets.'),
  mat('stone', 'Stone', 1, 2, 'A fist-sized rock. Good for grinding, better for slinging.', { ammoKind: 'stone' }),
  mat('cut_stone', 'Cut Stone', 1, 5, 'A squared-off block. Stone + Stone.'),
  item('material', 'dirt', 'Dirt', 1, 0, 'Mostly dirt. Pack it into a gap to make a foothold.', { use: 'place', places: TILE_GROUND, tags: ['no_loot'] }),
  mat('flint', 'Flint', 1, 3, 'Knaps to a wicked edge. Sparks when struck.'),
  mat('coal', 'Coal', 1, 4, 'Burns hot and long. Smelters love it.', { tags: ['fuel', 'ore'] }),
  mat('fiber', 'Plant Fiber', 1, 1, 'Tough cave grass. Twist two into string.'),
  mat('string', 'String', 1, 3, 'Fiber + Fiber. Ties the world together.'),
  mat('fabric', 'Fabric', 1, 8, 'String + String, woven tight.'),
  mat('flour', 'Flour', 1, 3, 'Grass seed ground under a stone. Bakes into bread.'),
  mat('blackpowder', 'Blast Powder', 1, 8, 'Coal dust and flint grit. Keep away from campfires.'),

  // Monster parts (enemy drops)
  mat('hide', 'Hide', 1, 4, 'A rough pelt. Two of them tan into leather.', { tags: ['monster'] }),
  mat('leather', 'Leather', 1, 10, 'Tanned hide. Supple, tough, smells awful.'),
  mat('bone', 'Bone', 1, 3, 'Picked clean. Someone was hungry.', { tags: ['monster'] }),
  mat('feather', 'Feather', 1, 3, 'Light and stiff. Fletching, charms, trinkets.', { tags: ['monster'] }),
  mat('fang', 'Fang', 1, 4, 'Still sharp. Wear it to look fierce.', { tags: ['monster'] }),
  mat('slime_gel', 'Slime Gel', 1, 3, 'Wobbly, sticky, faintly glowing.', { tags: ['monster'] }),
  mat('bat_wing', 'Bat Wing', 1, 4, 'Leathery and twitchy, even now.', { tags: ['monster'] }),
  mat('beetle_shell', 'Beetle Shell', 1, 5, 'A hard, glossy carapace.', { tags: ['monster'] }),
  mat('venom_sac', 'Venom Sac', 2, 6, 'Handle with gloves. Or at all, really.', { tags: ['monster'] }),
  mat('silk', 'Spider Silk', 2, 5, 'Stronger than string, if you can unstick it.', { tags: ['monster'] }),
  mat('wisp_essence', 'Wisp Essence', 2, 12, 'A cold blue flicker trapped in a drop of dew.', { tags: ['monster', 'biome'] }),
  mat('magma_scale', 'Magma Scale', 4, 30, 'Shed by fire-lizards. Never quite cools.', { tags: ['monster', 'biome'] }),

  // Bugs (caught with a bug net)
  mat('firefly', 'Firefly', 1, 8, 'A warm little light. Two fuse into a fire gem.', { tags: ['bug'] }),
  mat('glow_moth', 'Glow Moth', 2, 10, 'Its wings are cold to the touch.', { tags: ['bug'] }),
  mat('stag_beetle', 'Stag Beetle', 2, 12, 'Its shell crackles with static.', { tags: ['bug'] }),

  // Ores, bars, gems
  mat('iron_ore', 'Iron Ore', 2, 8, 'Rusty rock. Smelt it at a town forge.', { tags: ['ore'] }),
  mat('iron_bar', 'Iron Bar', 2, 18, 'Honest metal for honest tools.', { tags: ['bar'] }),
  mat('gold_ore', 'Gold Ore', 3, 18, 'Glittering flecks in dark stone.', { tags: ['ore'] }),
  mat('gold_bar', 'Gold Bar', 3, 40, 'Soft, heavy and very persuasive.', { tags: ['bar'] }),
  mat('diamond', 'Diamond', 4, 60, 'Harder than anything down here. Almost.', { tags: ['gem', 'ore'] }),
  mat('voidshard', 'Voidshard', 5, 120, 'A sliver of the dark between stars. It hums.', { tags: ['gem', 'ore'] }),

  // Biome materials
  mat('bog_moss', 'Bog Moss', 2, 5, 'Spongy fen moss. Shrugs off rot.', { tags: ['biome'] }),
  mat('frost_crystal', 'Frost Crystal', 2, 12, 'Never melts. Frosts your fingers.', { tags: ['biome', 'gem'] }),
  mat('amethyst_shard', 'Amethyst Shard', 3, 20, 'Violet crystal that sings when struck.', { tags: ['biome', 'gem'] }),
  mat('ember_core', 'Ember Core', 4, 35, 'A coal that remembers being a volcano.', { tags: ['biome', 'gem'] }),
  mat('bogscale', 'Bogscale', 2, 14, 'Moss pressed in slime until it hardens into scales.'),
  mat('frostweave', 'Frostweave', 3, 30, 'Fabric threaded with frost crystal. Crunches.'),
  mat('emberplate', 'Emberplate', 4, 80, 'Ember core hammered into magma scale. Warm forever.'),

  // Magic gems
  mat('fire_gem', 'Fire Gem', 2, 20, 'Two fireflies, fused. Hot to hold.', { tags: ['gem'] }),
  mat('frost_gem', 'Frost Gem', 2, 24, 'Two glow moths, frozen together.', { tags: ['gem'] }),
  mat('storm_gem', 'Storm Gem', 2, 28, 'Two stag beetles worth of static.', { tags: ['gem'] }),
  mat('arcane_gem', 'Arcane Gem', 3, 45, 'Cut amethyst. Thinks when you are not looking.', { tags: ['gem'] }),
  mat('grimoire', 'Blank Grimoire', 4, 75, 'Diamond-bound pages, waiting for a spell.'),

  // Crafting parts: <M>+<M> = blade · <M>+plank = axe head · <M>+stone = pick head · blade+blade = great blade
  part('wooden_blade', 'Wooden Blade', 1, 8, 'Plank + Plank. Add a stick for a sword.'),
  part('wooden_axe_head', 'Wooden Axe Head', 1, 6, 'Plank + Wood. Needs a stick.'),
  part('wooden_pick_head', 'Wooden Pick Head', 1, 6, 'Plank + Stick. Needs another stick.'),
  part('stone_blade', 'Stone Blade', 1, 12, 'Two cut stones, ground sharp.'),
  part('stone_axe_head', 'Stone Axe Head', 1, 10, 'Cut stone wedged into a plank.'),
  part('stone_pick_head', 'Stone Pick Head', 1, 8, 'Cut stone + Stone.'),
  part('stone_great_blade', 'Stone Great Blade', 1, 26, 'Two stone blades. Heavy. Very heavy.'),
  part('iron_blade', 'Iron Blade', 2, 38, 'Iron Bar + Iron Bar.'),
  part('iron_axe_head', 'Iron Axe Head', 2, 24, 'Iron Bar + Plank.'),
  part('iron_pick_head', 'Iron Pick Head', 2, 22, 'Iron Bar + Stone.'),
  part('iron_great_blade', 'Iron Great Blade', 2, 80, 'Two iron blades forged into one.'),
  part('gold_blade', 'Gold Blade', 3, 85, 'Gold Bar + Gold Bar.'),
  part('gold_axe_head', 'Gold Axe Head', 3, 46, 'Gold Bar + Plank.'),
  part('gold_pick_head', 'Gold Pick Head', 3, 44, 'Gold Bar + Stone.'),
  part('gold_great_blade', 'Gold Great Blade', 3, 175, 'Two gold blades forged into one.'),
  part('diamond_blade', 'Diamond Blade', 4, 125, 'Diamond + Diamond.'),
  part('diamond_axe_head', 'Diamond Axe Head', 4, 66, 'Diamond + Plank.'),
  part('diamond_pick_head', 'Diamond Pick Head', 4, 64, 'Diamond + Stone.'),
  part('diamond_great_blade', 'Diamond Great Blade', 4, 260, 'Two diamond blades forged into one.'),
  part('voidshard_blade', 'Voidshard Blade', 5, 250, 'Voidshard + Voidshard. Edges blur.'),
  part('voidshard_great_blade', 'Voidshard Great Blade', 5, 520, 'It is hard to say where it ends.'),

  // Boss trophies (dropped by giant monsters; see BOSS_TROPHIES)
  mat('gloomjaw_fang', 'Gloomjaw Fang', 2, 80, 'Still dripping acid. Pairs well with iron.', { maxStack: 5, tags: ['trophy', 'no_loot'] }),
  mat('bogmother_heart', 'Bogmother Heart', 2, 90, 'It keeps beating. Slowly. Wetly.', { maxStack: 5, tags: ['trophy', 'no_loot'] }),
  mat('broodqueen_eye', 'Broodqueen Eye', 2, 90, 'Eight facets, all of them staring.', { maxStack: 5, tags: ['trophy', 'no_loot'] }),
  mat('frost_heart', 'Frost Heart', 3, 120, 'The Matron\'s cold, cold heart.', { maxStack: 5, tags: ['trophy', 'no_loot'] }),
  mat('shardbound_core', 'Shardbound Core', 4, 160, 'The crystal that animated the knight.', { maxStack: 5, tags: ['trophy', 'no_loot'] }),
  mat('wyrm_heart', 'Wyrm Heart', 4, 200, 'A furnace the size of a fist.', { maxStack: 5, tags: ['trophy', 'no_loot'] }),

  // ------------------------------------------------------------------------------------------------
  // Tools (toolPower 1..5) and the bug net
  // ------------------------------------------------------------------------------------------------
  axe('wooden_axe', 'Wooden Axe', 1, 12, 1, 1, 60, 'Chops trees. Hits things. Barely.'),
  axe('stone_axe', 'Stone Axe', 1, 24, 2, 2, 90, 'A proper edge. Fells trees twice as fast.'),
  axe('iron_axe', 'Iron Axe', 2, 60, 3, 4, 160, 'Bites deep into any trunk.'),
  axe('gold_axe', 'Gold Axe', 3, 130, 4, 7, 240, 'Heavy, gleaming, wasteful. Wonderful.'),
  axe('diamond_axe', 'Diamond Axe', 4, 200, 5, 12, 400, 'Splits crystal trees like kindling.'),
  pick('wooden_pickaxe', 'Wooden Pickaxe', 1, 12, 1, 1, 60, 'Digs dirt and soft stone.'),
  pick('stone_pickaxe', 'Stone Pickaxe', 1, 22, 2, 2, 90, 'Breaks rock and iron ore.'),
  pick('iron_pickaxe', 'Iron Pickaxe', 2, 58, 3, 3, 160, 'Strong enough for gold veins.'),
  pick('gold_pickaxe', 'Gold Pickaxe', 3, 125, 4, 6, 240, 'Strong enough for diamonds.'),
  pick('diamond_pickaxe', 'Diamond Pickaxe', 4, 195, 5, 10, 400, 'Cuts through voidshard. Mind your fingers.'),
  item('tool', 'bug_net', 'Bug Net', 1, 14, 'Swing it at fireflies, moths and beetles.', {
    use: 'swing', tool: 'net', toolPower: 1, damage: 0, cooldown: 0.35, range: 13, knockback: 10, durability: 80, tags: ['light'],
  }),

  // ------------------------------------------------------------------------------------------------
  // Melee weapons
  // ------------------------------------------------------------------------------------------------
  // Swords: balanced swing.
  melee('wooden_sword', 'Wooden Sword', 1, 14, 'Splintery, but it beats bare hands.', { damage: 2, cooldown: 0.4, range: 12, knockback: 80, durability: 60 }),
  melee('stone_sword', 'Stone Sword', 1, 26, 'Heavy for its size. Hits like a rock.', { damage: 3, cooldown: 0.42, range: 12, knockback: 90, durability: 90 }),
  melee('iron_sword', 'Iron Sword', 2, 64, 'A soldier\'s blade. Reliable.', { damage: 6, cooldown: 0.4, range: 13, knockback: 90, durability: 160 }),
  melee('gold_sword', 'Gold Sword', 3, 140, 'Soft metal, sharp edge, heavy swing.', { damage: 11, cooldown: 0.4, range: 13, knockback: 100, durability: 240 }),
  melee('diamond_sword', 'Diamond Sword', 4, 210, 'Rings like a bell on every hit.', { damage: 20, cooldown: 0.38, range: 14, knockback: 100, durability: 400 }),
  melee('voidshard_sword', 'Voidshard Sword', 5, 420, 'Cuts the light around it.', { damage: 32, cooldown: 0.38, range: 14, knockback: 110, durability: 600 }),
  // Great swords: slow, wide, about twice the damage.
  melee('stone_greatsword', 'Stone Greatsword', 1, 45, 'Less a sword than a slab with intent.', { damage: 6, cooldown: 0.85, range: 16, knockback: 150, durability: 110, tags: ['heavy'] }),
  melee('iron_greatsword', 'Iron Greatsword', 2, 130, 'Two hands, one swing, no survivors.', { damage: 13, cooldown: 0.85, range: 17, knockback: 160, durability: 180, tags: ['heavy'] }),
  melee('gold_greatsword', 'Gold Greatsword', 3, 280, 'Heavy enough to anchor a boat.', { damage: 24, cooldown: 0.85, range: 17, knockback: 170, durability: 260, tags: ['heavy'] }),
  melee('diamond_greatsword', 'Diamond Greatsword', 4, 420, 'A wall of edge.', { damage: 40, cooldown: 0.82, range: 18, knockback: 180, durability: 420, tags: ['heavy'] }),
  melee('voidshard_greatsword', 'Voidshard Greatsword', 5, 800, 'Each swing leaves a hole in the dark.', { damage: 60, cooldown: 0.82, range: 18, knockback: 190, durability: 650, tags: ['heavy'] }),
  // Spears: long forward thrust.
  melee('flint_spear', 'Flint Spear', 1, 14, 'A sharp rock on a long stick. Classic.', { use: 'thrust', damage: 3, cooldown: 0.5, range: 20, knockback: 60, durability: 70 }),
  melee('iron_spear', 'Iron Spear', 2, 66, 'Keeps trouble at arm\'s length. Plus some.', { use: 'thrust', damage: 7, cooldown: 0.5, range: 21, knockback: 70, durability: 160 }),
  melee('gold_spear', 'Gold Spear', 3, 145, 'A gilded lance for a gilded fool.', { use: 'thrust', damage: 13, cooldown: 0.5, range: 22, knockback: 80, durability: 240 }),
  melee('diamond_spear', 'Diamond Spear', 4, 215, 'Pierces scale, shell and excuses.', { use: 'thrust', damage: 22, cooldown: 0.48, range: 22, knockback: 85, durability: 400 }),
  melee('voidshard_spear', 'Voidshard Spear', 5, 430, 'Its point is somewhere slightly ahead of it.', { use: 'thrust', damage: 34, cooldown: 0.48, range: 23, knockback: 90, durability: 600 }),
  // Daggers: fast, short.
  melee('flint_dagger', 'Flint Dagger', 1, 10, 'Quick little stabs. Grass-wrapped grip.', { damage: 1, cooldown: 0.22, range: 8, knockback: 30, durability: 50, tags: ['light'] }),
  melee('bone_dagger', 'Bone Dagger', 1, 10, 'Light, nasty, surprisingly sharp.', { damage: 2, cooldown: 0.24, range: 8, knockback: 30, durability: 60, tags: ['light'] }),
  melee('iron_dagger', 'Iron Dagger', 2, 40, 'Fast enough to hit twice before they blink.', { damage: 4, cooldown: 0.22, range: 9, knockback: 35, durability: 150, tags: ['light'] }),
  melee('gold_dagger', 'Gold Dagger', 3, 90, 'An assassin\'s heirloom.', { damage: 8, cooldown: 0.22, range: 9, knockback: 35, durability: 220, tags: ['light'] }),
  melee('diamond_dagger', 'Diamond Dagger', 4, 140, 'A sliver of starlight with a handle.', { damage: 14, cooldown: 0.2, range: 9, knockback: 40, durability: 360, tags: ['light'] }),
  // Oddities
  melee('bone_club', 'Bone Club', 1, 12, 'Two bones, one purpose.', { damage: 4, cooldown: 0.8, range: 12, knockback: 160, durability: 70, tags: ['heavy'] }),
  melee('jade_blade', 'Jade Blade', 2, 90, 'A keen green sword from the warm fens.', { damage: 5, cooldown: 0.35, range: 13, knockback: 90, durability: 220, tags: ['starter'] }),
  // Legendary trophy weapons
  melee('acidfang', 'Acidfang', 3, 300, 'Forged around the Gloomjaw\'s tooth. Wounds fester.', {
    damage: 10, cooldown: 0.4, range: 14, knockback: 100, durability: 320, onHit: [{ id: 'poison', duration: 3, chance: 0.5, power: 1 }], tags: ['legendary', 'no_loot'],
  }),
  melee('mirelance', 'Mirelance', 3, 320, 'Bogmother\'s heart beats in the haft. Targets get bogged down.', {
    use: 'thrust', damage: 12, cooldown: 0.48, range: 28, knockback: 80, durability: 320, onHit: [{ id: 'slow', duration: 2, chance: 0.6, power: 0.4 }], tags: ['legendary', 'no_loot'],
  }),
  melee('shardbound_edge', 'Shardbound Edge', 4, 700, 'The fallen knight\'s crystal, still loyal to the swing.', {
    damage: 45, cooldown: 0.8, range: 20, knockback: 200, durability: 600, onHit: [{ id: 'stun', duration: 0.5, chance: 0.25 }], tags: ['heavy', 'legendary', 'no_loot'],
  }),

  // ------------------------------------------------------------------------------------------------
  // Ranged weapons (DEX) and ammo
  // ------------------------------------------------------------------------------------------------
  item('weapon', 'sling', 'Sling', 1, 10, 'Hurls stones from your pack. Cheap and cheerful.', {
    use: 'shoot', projectile: 'pebble', ammoType: 'stone', damage: 1, cooldown: 0.45, durability: 80, knockback: 50,
  }),
  bow('wooden_bow', 'Wooden Bow', 1, 16, 1, 0.5, 80, 'Stick + String. Point the pointy end away.'),
  bow('iron_bow', 'Iron Bow', 2, 55, 3, 0.48, 150, 'Iron-limbed. Pulls hard, shoots harder.'),
  bow('gold_bow', 'Gold Bow', 3, 120, 6, 0.45, 220, 'A hunter\'s pride, a merchant\'s envy.'),
  bow('diamond_bow', 'Diamond Bow', 4, 200, 11, 0.42, 350, 'The string sings a high, clear note.'),
  bow('widowbow', 'Widowbow', 3, 340, 8, 0.42, 320, 'Strung with Broodqueen silk. Arrows leave webs behind.', {
    onHit: [{ id: 'slow', duration: 2.5, chance: 0.6, power: 0.5 }], tags: ['legendary', 'no_loot'],
  }),
  crossbow('iron_crossbow', 'Iron Crossbow', 2, 80, 6, 0.9, 160, 'Slow to load, rude to receive.'),
  crossbow('gold_crossbow', 'Gold Crossbow', 3, 170, 11, 0.85, 240, 'A siege engine you can carry.'),
  crossbow('diamond_crossbow', 'Diamond Crossbow', 4, 260, 19, 0.8, 380, 'Bolts punch clean through.'),
  ammo('arrow', 'Arrow', 1, 1, 'arrow', 1, 'Flint-tipped. Recoverable if you\'re lucky.'),
  ammo('fire_arrow', 'Fire Arrow', 2, 3, 'arrow', 2, 'Tar-dipped and lit on release.', { onHit: [{ id: 'burn', duration: 2, chance: 0.6, power: 1 }] }),
  ammo('frost_arrow', 'Frost Arrow', 2, 4, 'arrow', 2, 'Crystal-tipped. Chills on impact.', { onHit: [{ id: 'slow', duration: 2, chance: 0.8, power: 0.4 }] }),
  ammo('iron_arrow', 'Iron Arrow', 2, 3, 'arrow', 3, 'Heavier head, deeper hit.'),
  ammo('gold_arrow', 'Gold Arrow', 3, 7, 'arrow', 6, 'Expensive to lose. Try not to.'),
  ammo('diamond_arrow', 'Diamond Arrow', 4, 11, 'arrow', 10, 'Pierces anything that holds still.'),
  ammo('bolt', 'Iron Bolt', 2, 4, 'bolt', 3, 'Stubby crossbow ammunition.'),
  ammo('gold_bolt', 'Gold Bolt', 3, 9, 'bolt', 7, 'Heavy, gleaming crossbow bolts.'),
  ammo('diamond_bolt', 'Diamond Bolt', 4, 14, 'bolt', 12, 'Bolts that do not stop.'),

  // ------------------------------------------------------------------------------------------------
  // Magic (MAG; costs mana): wands T1–3 · staves T3 · tomes T4 · void staff T5
  // ------------------------------------------------------------------------------------------------
  spell('spark_wand', 'Spark Wand', 1, 18, 'spark', 1, 1, 0.35, 80, 'A glowcap on a stick. Spits sparks.'),
  spell('fire_wand', 'Fire Wand', 2, 40, 'fireball', 2, 1, 0.6, 100, 'Lobs little fireballs. Sets things alight.'),
  spell('frost_wand', 'Frost Wand', 2, 44, 'ice_shard', 2, 1, 0.6, 100, 'Flings ice shards that slow their target.'),
  spell('storm_wand', 'Storm Wand', 2, 48, 'lightning', 3, 2, 0.8, 100, 'Calls a bolt down on whatever you point at.'),
  spell('arcane_wand', 'Arcane Wand', 3, 80, 'arcane_orb', 4, 2, 0.7, 120, 'Its orbs wander toward the nearest foe.'),
  spell('fire_staff', 'Fire Staff', 3, 110, 'fireball', 8, 1, 0.55, 220, 'A gold-shod staff with a fire gem heart.'),
  spell('frost_staff', 'Frost Staff', 3, 115, 'ice_shard', 7, 1, 0.55, 220, 'Breath fogs around it.'),
  spell('storm_staff', 'Storm Staff', 3, 120, 'lightning', 9, 2, 0.75, 220, 'The air tastes of copper when you hold it.'),
  spell('arcane_staff', 'Arcane Staff', 3, 160, 'arcane_orb', 10, 2, 0.65, 240, 'Hums a tune nobody taught it.'),
  spell('fire_tome', 'Tome of Embers', 4, 260, 'fireball', 16, 2, 0.5, 320, 'Every page is warm.'),
  spell('frost_tome', 'Tome of Frost', 4, 265, 'ice_shard', 14, 2, 0.5, 320, 'The ink froze mid-sentence.'),
  spell('storm_tome', 'Tome of Storms', 4, 270, 'lightning', 18, 3, 0.65, 320, 'Do not read it outdoors.'),
  spell('arcane_tome', 'Tome of Secrets', 4, 300, 'arcane_orb', 20, 3, 0.6, 320, 'It reads you back.'),
  spell('void_staff', 'Void Staff', 5, 600, 'arcane_orb', 30, 3, 0.6, 500, 'A voidshard crown on an arcane staff. Orbs of hungry dark.'),
  spell('rimecaller', 'Rimecaller', 4, 380, 'ice_shard', 16, 1, 0.45, 400, 'The Frost Matron\'s heart, still giving orders.', {
    onHit: [{ id: 'freeze', duration: 0.8, chance: 0.25 }], tags: ['legendary', 'no_loot'],
  }),
  spell('wyrmfire_tome', 'Wyrmfire Tome', 5, 650, 'fireball', 30, 2, 0.45, 450, 'Bound in wyrm hide around a still-burning heart.', {
    onHit: [{ id: 'burn', duration: 3, chance: 0.8, power: 2 }], tags: ['legendary', 'no_loot'],
  }),
  // Race start items
  // (spark_wand: wraithkin · fire_wand: ifrit · jade_blade: saurian · buckler: templar)

  // ------------------------------------------------------------------------------------------------
  // Thrown (consumed on use)
  // ------------------------------------------------------------------------------------------------
  item('weapon', 'bomb', 'Bomb', 2, 12, 'Light fuse, throw, cover ears. Breaks rock.', {
    use: 'throw', projectile: 'bomb', damage: 8, damageType: 'physical', cooldown: 0.5, maxStack: 20, tags: ['thrown', 'batch'],
  }),
  item('weapon', 'sticky_bomb', 'Sticky Bomb', 2, 16, 'Slimed so it stays where it lands.', {
    use: 'throw', projectile: 'bomb', damage: 8, damageType: 'physical', cooldown: 0.5, maxStack: 20, tags: ['thrown', 'batch', 'sticky'],
  }),
  item('weapon', 'mega_bomb', 'Mega Bomb', 3, 34, 'Two bombs and a bad idea.', {
    use: 'throw', projectile: 'bomb', damage: 18, damageType: 'physical', cooldown: 0.6, maxStack: 10, tags: ['thrown', 'batch'],
  }),
  item('weapon', 'throwing_knife', 'Throwing Knife', 2, 4, 'Balanced with a feather. Throw, then go find it.', {
    use: 'throw', projectile: 'throwing_knife', damage: 2, damageType: 'physical', cooldown: 0.3, maxStack: 30, tags: ['thrown', 'batch'],
  }),
  item('weapon', 'venom_knife', 'Venom Knife', 2, 6, 'A throwing knife with a nasty coat.', {
    use: 'throw', projectile: 'throwing_knife', damage: 2, damageType: 'physical', cooldown: 0.3, maxStack: 30,
    onHit: [{ id: 'poison', duration: 4, chance: 0.9, power: 1 }], tags: ['thrown', 'batch'],
  }),

  // ------------------------------------------------------------------------------------------------
  // Armour (head / body) and shields (trinket slot, block with Secondary)
  // ------------------------------------------------------------------------------------------------
  armor('leather_cap', 'Leather Cap', 1, 20, 'head', 40, { maxHp: 1 }, 'Keeps the drips off.'),
  armor('leather_tunic', 'Leather Tunic', 1, 26, 'body', 50, { def: 1 }, 'Stiff, creaky, better than nothing.'),
  armor('cloth_hood', 'Cloth Hood', 1, 22, 'head', 30, { mag: 1 }, 'Every apprentice\'s first hood.'),
  armor('cloth_robe', 'Cloth Robe', 1, 28, 'body', 35, { mag: 1, maxMana: 1 }, 'Loose sleeves, loose spells.'),
  armor('iron_helm', 'Iron Helm', 2, 50, 'head', 70, { def: 1, maxHp: 1 }, 'Riveted plates over a leather cap.'),
  armor('iron_chestplate', 'Iron Chestplate', 2, 60, 'body', 90, { def: 1, maxHp: 2 }, 'Heavy, honest protection.'),
  armor('gold_helm', 'Gold Helm', 3, 100, 'head', 100, { def: 1, maxHp: 2, atk: 1 }, 'Shines in the dark. Enemies notice.'),
  armor('gold_chestplate', 'Gold Chestplate', 3, 120, 'body', 130, { def: 2, maxHp: 2, atk: 1 }, 'Soft metal, thick plates.'),
  armor('diamond_helm', 'Diamond Helm', 4, 150, 'head', 160, { def: 2, maxHp: 2 }, 'Facets scatter your lantern-light.'),
  armor('diamond_chestplate', 'Diamond Chestplate', 4, 180, 'body', 200, { def: 3, maxHp: 3 }, 'Nearly unscratchable.'),
  armor('voidshard_helm', 'Voidshard Helm', 5, 300, 'head', 240, { def: 3, maxHp: 3 }, 'You hear whispers. They are on your side.'),
  armor('voidshard_plate', 'Voidshard Plate', 5, 360, 'body', 300, { def: 4, maxHp: 4 }, 'Blows seem to land somewhere else.'),
  // Biome sets
  armor('bogscale_hood', 'Bogscale Hood', 2, 50, 'head', 80, { def: 1, dex: 1, resist: { poison: 0.25 } }, 'Fen-scale hood. Smells like a swamp, sheds poison.'),
  armor('bogscale_vest', 'Bogscale Vest', 2, 60, 'body', 100, { def: 1, dex: 1, maxHp: 1, resist: { poison: 0.25 } }, 'Light scales for quick feet.'),
  armor('frostweave_hood', 'Frostweave Hood', 3, 90, 'head', 80, { mag: 2, maxMana: 1, resist: { ice: 0.3 } }, 'A mage\'s hood that crackles with frost.'),
  armor('frostweave_robe', 'Frostweave Robe', 3, 110, 'body', 100, { def: 1, mag: 2, maxMana: 2, resist: { ice: 0.3 } }, 'Cold to wear, colder to cross.'),
  armor('emberplate_helm', 'Emberplate Helm', 4, 170, 'head', 180, { def: 2, atk: 1, resist: { fire: 0.3 } }, 'Glows dull red along the seams.'),
  armor('emberplate_armor', 'Emberplate Armor', 4, 200, 'body', 220, { def: 3, atk: 2, maxHp: 2, resist: { fire: 0.3 } }, 'Forged in a dragon\'s backyard.'),
  armor('amethyst_circlet', 'Amethyst Circlet', 4, 160, 'head', 150, { def: 1, mag: 3, lck: 1 }, 'A ring of singing crystal.'),
  armor('amethyst_mail', 'Amethyst Mail', 4, 190, 'body', 180, { def: 2, mag: 2, lck: 1, maxMana: 2 }, 'Violet links that hum with power.'),
  shield('buckler', 'Buckler', 1, 22, 50, { maxHp: 1 }, 'A small round shield. Hold Secondary to block.'),
  shield('iron_shield', 'Iron Shield', 2, 60, 100, { def: 1, maxHp: 1 }, 'Dents but does not break. Usually.'),
  shield('gold_shield', 'Gold Shield', 3, 130, 140, { def: 1, maxHp: 2 }, 'Blinding in the right light.'),
  shield('diamond_shield', 'Diamond Shield', 4, 200, 220, { def: 2, maxHp: 3 }, 'A clear wall between you and trouble.'),

  // ------------------------------------------------------------------------------------------------
  // Accessories: rings & amulets (accessory slots), charms (trinket slot)
  // ------------------------------------------------------------------------------------------------
  trinketA('fang_necklace', 'Fang Necklace', 1, 18, { atk: 1 }, 'A string of fangs. +1 ATK.'),
  trinketA('shell_amulet', 'Shell Amulet', 1, 20, { maxHp: 1, resist: { physical: 0.1 } }, 'A beetle shell on a cord. Takes the edge off.'),
  trinketA('bog_amulet', 'Bog Amulet', 2, 30, { resist: { poison: 0.4 } }, 'Moss that eats venom for breakfast.'),
  trinketA('frost_amulet', 'Frost Amulet', 2, 40, { resist: { ice: 0.4 } }, 'Cold on your chest, so the cold stays out.'),
  trinketA('ember_amulet', 'Ember Amulet', 4, 90, { resist: { fire: 0.4 }, atk: 1 }, 'Warm as a hearth. Fire forgets you.'),
  trinketA('ring_of_might', 'Ring of Might', 3, 90, { atk: 2 }, 'A fire gem set in gold. +2 ATK.'),
  trinketA('ring_of_focus', 'Ring of Focus', 3, 95, { mag: 2, maxMana: 1 }, 'A frost gem set in gold. Clears the mind.'),
  trinketA('ring_of_aim', 'Ring of Aim', 3, 90, { dex: 2 }, 'A feather pressed in gold. Steady hands.'),
  trinketA('ring_of_vigor', 'Ring of Vigor', 3, 95, { maxHp: 2 }, 'Beetle-shell inlay. You feel sturdier.'),
  trinketA('ring_of_haste', 'Ring of Haste', 3, 100, { moveSpeed: 0.1, attackSpeed: 0.08 }, 'A bat wing in gold. Everything feels slower. Except you.'),
  trinketA('ring_of_precision', 'Ring of Precision', 3, 100, { critChance: 0.08 }, 'A storm gem that finds the weak spot.'),
  trinketA('ring_of_fortune', 'Ring of Fortune', 4, 160, { lck: 2, goldFind: 0.25 }, 'A diamond in gold. Money attracts money.'),
  trinketA('ring_of_fury', 'Ring of Fury', 4, 170, { atk: 4, maxHp: -1 }, 'Burns with an ember core. So do you.'),
  trinketA('ring_of_balance', 'Ring of Balance', 5, 350, { maxHp: 1, atk: 1, dex: 1, mag: 1, lck: 1 }, 'Light and dark in perfect agreement.'),
  charm('feather_charm', 'Feather Charm', 1, 14, { jump: 0.12 }, 'Jump a little higher.'),
  charm('glow_charm', 'Glow Charm', 1, 16, { lightRadius: 0.4 }, 'A firefly in a knot of string. Brighter light.'),
  charm('wing_charm', 'Wing Charm', 2, 18, { moveSpeed: 0.08 }, 'A bat wing on a cord. Quick feet.'),
  charm('wisp_charm', 'Wisp Charm', 2, 30, { manaRegen: 0.5, maxMana: 1 }, 'A trapped wisp feeds you mana.'),
  charm('lucky_charm', 'Lucky Charm', 2, 30, { lck: 1, goldFind: 0.15 }, 'A gold nugget on a string. Feels lucky.'),

  // ------------------------------------------------------------------------------------------------
  // Food (hunger max 8) and potions
  // ------------------------------------------------------------------------------------------------
  food('raw_meat', 'Raw Meat', 1, 3, 'Edible. Barely. Cook it at a campfire.', { consume: { food: 1 } }),
  food('cooked_meat', 'Cooked Meat', 1, 8, 'Charred outside, juicy inside.', { consume: { food: 3 } }),
  food('berry', 'Berries', 1, 2, 'Tart cave berries.', { consume: { food: 1 } }),
  food('herb', 'Herb', 1, 3, 'Bitter leaves. Brewed, they heal.', { consume: { food: 1 } }),
  food('glowcap', 'Glowcap', 1, 4, 'A glowing mushroom. Tingles going down.', { consume: { mana: 1 } }),
  food('egg', 'Egg', 1, 3, 'Fresh from a town chicken. Do not ask which.', { consume: { food: 1 } }),
  food('bread', 'Bread', 1, 6, 'Flour baked over a campfire. Filling.', { consume: { food: 2 } }),
  food('omelette', 'Omelette', 1, 9, 'Egg and herb, fried on a flat stone.', { consume: { food: 3, stamina: 1 } }),
  food('hearty_stew', 'Hearty Stew', 2, 16, 'Meat and herbs, simmered. Warms your bones.', { consume: { food: 5, heal: 1 } }),
  food('berry_pie', 'Berry Pie', 2, 14, 'Sticky, sweet and full of energy.', { consume: { food: 4, stamina: 2 } }),
  potion('healing_salve', 'Healing Salve', 1, 12, 'Herb paste in slime. Slowly closes wounds.', {
    consume: { heal: 1, status: [{ id: 'regen', duration: 4, chance: 1, power: 1 }] }, tags: ['salve'],
  }),
  potion('health_potion', 'Health Potion', 1, 20, 'Herb + Herb, steeped. Restores 2 HP.', { consume: { heal: 2 } }),
  potion('greater_health_potion', 'Greater Health Potion', 3, 55, 'Two potions reduced to one. Restores 5 HP.', { consume: { heal: 5 } }),
  potion('mana_potion', 'Mana Potion', 1, 20, 'Glowcap broth. Restores 3 mana.', { consume: { mana: 3 } }),
  potion('greater_mana_potion', 'Greater Mana Potion', 3, 55, 'Thick and blue. Restores 7 mana.', { consume: { mana: 7 } }),
  potion('mystery_potion', 'Mystery Potion', 1, 15, 'Herb and glowcap. Could be anything. Probably fine.', { consume: { special: 'mystery' } }),
  potion('stamina_tonic', 'Stamina Tonic', 1, 18, 'Berry fizz. Refills stamina and quickens your step.', {
    consume: { stamina: 4, status: [{ id: 'haste', duration: 5, chance: 1, power: 0.2 }] },
  }),
  potion('antidote', 'Antidote', 1, 16, 'Venom cures venom. Clears poison and burns.', { consume: { special: 'cleanse' } }),
  potion('phoenix_draught', 'Phoenix Draught', 4, 150, 'Everything, all at once: health, mana, stamina, food.', { consume: { special: 'full_restore' } }),
  potion('elixir_of_vigor', 'Elixir of Vigor', 4, 300, 'Permanently +1 max HP.', { consume: { permanent: { maxHp: 1 } }, tags: ['elixir'] }),
  potion('elixir_of_might', 'Elixir of Might', 4, 300, 'Permanently +1 ATK.', { consume: { permanent: { atk: 1 } }, tags: ['elixir'] }),
  potion('elixir_of_finesse', 'Elixir of Finesse', 4, 300, 'Permanently +1 DEX.', { consume: { permanent: { dex: 1 } }, tags: ['elixir'] }),
  potion('elixir_of_wisdom', 'Elixir of Wisdom', 4, 300, 'Permanently +1 MAG.', { consume: { permanent: { mag: 1 } }, tags: ['elixir'] }),
  potion('elixir_of_fortune', 'Elixir of Fortune', 5, 320, 'Permanently +1 LCK.', { consume: { permanent: { lck: 1 } }, tags: ['elixir'] }),

  // ------------------------------------------------------------------------------------------------
  // Placeables
  // ------------------------------------------------------------------------------------------------
  item('placeable', 'torch', 'Torch', 1, 2, 'Place on a wall or floor. Pushes back the dark.', { use: 'place', placesProp: 'torch', tags: ['batch'] }),
  item('placeable', 'lantern', 'Lantern', 2, 12, 'An iron lantern. Brighter and steadier than a torch.', { use: 'place', placesProp: 'lantern', maxStack: 20, tags: ['batch'] }),
  item('placeable', 'campfire', 'Campfire', 1, 8, 'Place it to cook food. Warm light, too.', { use: 'place', placesProp: 'campfire', maxStack: 10 }),
  item('placeable', 'platform_kit', 'Platform Kit', 1, 2, 'Places a one-way wooden platform.', { use: 'place', places: TILE_PLATFORM, tags: ['batch'] }),
  item('placeable', 'ladder_kit', 'Ladder Kit', 1, 2, 'Places a ladder segment. Climb with up/down.', { use: 'place', places: TILE_LADDER, tags: ['batch'] }),

  // ------------------------------------------------------------------------------------------------
  // Misc
  // ------------------------------------------------------------------------------------------------
  item('consumable', 'recipe_scroll', 'Recipe Scroll', 1, 25, 'Read it to learn a recipe you have not found yet.', {
    use: 'consume', maxStack: 10, consume: { special: 'reveal_recipe' }, tags: ['scroll'],
  }),
  item('consumable', 'repair_kit', 'Repair Kit', 2, 30, 'Use to restore half the durability of your most worn item.', {
    use: 'consume', maxStack: 10, consume: { special: 'repair' },
  }),

  // ------------------------------------------------------------------------------------------------
  // Legacy scaffold ids (still referenced by the scaffold's placeholder race/enemy defs). Remove once
  // those reference the canonical wooden_axe / raw_meat.
  // ------------------------------------------------------------------------------------------------
  { ...axe('axe', 'Old Axe', 1, 10, 1, 1, 60, 'A battered axe. (legacy id)'), tags: ['unique', 'no_loot'] },
  food('meat', 'Raw Meat', 1, 3, 'Edible. Barely. (legacy id)', { consume: { food: 1 }, tags: ['unique', 'no_loot'] }),
];

/** Giant monster → trophy item it drops (bosses workstream: add `{ item, chance: 1, min: 1, max: 1 }`). */
export const BOSS_TROPHIES: Readonly<Record<string, string>> = {
  gloomjaw: 'gloomjaw_fang',
  bogmother: 'bogmother_heart',
  broodqueen: 'broodqueen_eye',
  frost_matron: 'frost_heart',
  shardbound_knight: 'shardbound_core',
  emberwyrm: 'wyrm_heart',
};

/**
 * Items the world itself provides (resource nodes, tiles, enemy / critter drops). Used by the
 * recipe-graph test as crafting sources; the gen and enemies workstreams should make each of these
 * droppable somewhere (suggested sources in comments).
 */
export const WORLD_MATERIALS: readonly string[] = [
  // trees / tiles / rocks
  'wood', 'stick', 'stone', 'dirt', 'flint', 'coal', 'iron_ore', 'gold_ore', 'diamond', 'voidshard',
  // plants
  'fiber', 'herb', 'glowcap', 'berry',
  // biome nodes: bog_moss_patch · frost_crystal_node · amethyst_cluster · ember_vent
  'bog_moss', 'frost_crystal', 'amethyst_shard', 'ember_core',
  // bugs (bug_firefly · bug_moth · bug_beetle)
  'firefly', 'glow_moth', 'stag_beetle',
  // creatures: boar/toad → raw_meat, hide, fang · bats → bat_wing · beetles → beetle_shell · slimes → slime_gel ·
  // spiders → silk, venom_sac · owls → feather · skeletons → bone · wisps/imps → wisp_essence ·
  // salamanders → magma_scale · town chickens → egg, feather, raw_meat
  'raw_meat', 'hide', 'bone', 'feather', 'fang', 'slime_gel', 'bat_wing', 'beetle_shell', 'venom_sac', 'silk',
  'wisp_essence', 'magma_scale', 'egg',
];
