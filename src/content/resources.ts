import type { DropEntry, ResourceDef } from './types';

/**
 * Harvestable nodes placed by level gen (GDD §8): trees, stone/ore rocks, plants, biome
 * specials, bugs, chests and pots.
 *
 * - Hardness is compared with the tool's `toolPower` (ore ladder: stone 1, iron 2, gold 3,
 *   diamond 4, voidshard 5). Ore weights also grow with depth in src/sim/gen/populate.ts.
 * - Chests and pots have no fixed drops: level gen tags their SpawnSpec with
 *   `data.lootTier` (0 pot · 1 wooden chest · 2 iron chest · +1 in secret pockets, +depth/6)
 *   and the items workstream rolls the loot table from it.
 * - `w`/`h` are hitboxes in px; trees are background props whose `h` is their drawn height,
 *   so gen only places them where the ceiling clears them.
 */
const ALL = ['woods', 'fen', 'hollow', 'rime', 'amethyst', 'cinder'];
const one = (item: string, min = 1, max = min, chance = 1): DropEntry => ({ item, chance, min, max });

const tree = (biome: string, h: number, weight: number, extra: DropEntry[] = []): ResourceDef => ({
  id: `tree_${biome}`,
  name: 'Tree',
  sprite: `res_tree_${biome}`,
  tool: 'axe',
  hardness: 1,
  hp: 4,
  w: 8,
  h,
  drops: [one('wood', 2, 4), one('stick', 1, 2, 0.6), ...extra],
  biomes: [biome],
  placement: 'ground',
  weight,
  minDepth: 1,
  background: true,
});

export const RESOURCES: ResourceDef[] = [
  // Trees — one look per biome; heights tuned so they read as tall puff trees in open woods
  // and stubbier growths in tunnels.
  tree('woods', 72, 30),
  tree('fen', 56, 20, [one('fiber', 1, 2, 0.3)]),
  tree('hollow', 40, 6, [one('glowcap', 1, 1, 0.25)]),
  tree('rime', 64, 22),
  tree('amethyst', 64, 16, [one('amethyst_shard', 1, 1, 0.25)]),
  tree('cinder', 48, 9, [one('coal', 1, 2, 0.4)]),
  tree('lair', 56, 6, [one('voidshard', 1, 1, 0.08)]),

  // Rocks and ores.
  {
    id: 'rock_stone', name: 'Rock', sprite: 'res_rock_stone', tool: 'pickaxe', hardness: 1, hp: 3, w: 10, h: 8,
    drops: [one('stone', 1, 3), one('flint', 1, 1, 0.25), one('coal', 1, 1, 0.15)],
    biomes: [...ALL, 'lair'], placement: 'ground', weight: 14, minDepth: 1,
  },
  {
    id: 'rock_iron', name: 'Iron Vein', sprite: 'res_rock_iron', tool: 'pickaxe', hardness: 2, hp: 4, w: 10, h: 8,
    drops: [one('iron_ore', 1, 2), one('stone', 1, 2), one('coal', 1, 1, 0.2)],
    biomes: ALL, placement: 'ground', weight: 6, minDepth: 1,
  },
  {
    id: 'rock_gold', name: 'Gold Vein', sprite: 'res_rock_gold', tool: 'pickaxe', hardness: 3, hp: 5, w: 10, h: 8,
    drops: [one('gold_ore', 1, 2), one('stone', 1, 1)],
    biomes: ALL, placement: 'ground', weight: 3, minDepth: 3,
  },
  {
    id: 'rock_diamond', name: 'Diamond Vein', sprite: 'res_rock_diamond', tool: 'pickaxe', hardness: 4, hp: 6, w: 10, h: 8,
    drops: [one('diamond', 1, 1), one('stone', 1, 1)],
    biomes: ['hollow', 'rime', 'amethyst', 'cinder'], placement: 'ground', weight: 1.5, minDepth: 7,
    light: { radius: 10, color: 0x60e0ff },
  },
  {
    id: 'rock_voidshard', name: 'Voidshard Vein', sprite: 'res_rock_voidshard', tool: 'pickaxe', hardness: 5, hp: 7, w: 10, h: 8,
    drops: [one('voidshard', 1, 1), one('stone', 1, 1)],
    biomes: ['amethyst', 'cinder', 'lair'], placement: 'ground', weight: 1, minDepth: 13,
    light: { radius: 14, color: 0xb050ff },
  },

  // Plants (any tool, even bare hands).
  {
    id: 'plant_fiber', name: 'Fiber Grass', sprite: 'res_plant_fiber', tool: 'hand', hardness: 0, hp: 1, w: 8, h: 8,
    drops: [one('fiber', 1, 3)], biomes: ['woods', 'fen', 'hollow', 'rime', 'amethyst'], placement: 'ground', weight: 8, minDepth: 1,
  },
  {
    id: 'plant_herb', name: 'Herb', sprite: 'res_plant_herb', tool: 'hand', hardness: 0, hp: 1, w: 8, h: 8,
    drops: [one('herb', 1, 2)], biomes: ['woods', 'fen', 'rime', 'amethyst'], placement: 'ground', weight: 5, minDepth: 1,
  },
  {
    id: 'plant_glowcap', name: 'Glowcap', sprite: 'res_plant_glowcap', tool: 'hand', hardness: 0, hp: 1, w: 8, h: 8,
    drops: [one('glowcap', 1, 2)], biomes: ['fen', 'hollow', 'amethyst', 'lair'], placement: 'ground', weight: 4, minDepth: 1,
    light: { radius: 18, color: 0x40ffff },
  },
  {
    id: 'bush_berry', name: 'Berry Bush', sprite: 'res_bush_berry', tool: 'hand', hardness: 0, hp: 1, w: 10, h: 8,
    drops: [one('berry', 1, 3)], biomes: ['woods', 'fen', 'rime'], placement: 'ground', weight: 5, minDepth: 1,
  },

  // Biome specials.
  {
    id: 'frost_crystal_node', name: 'Frost Crystal', sprite: 'res_frost_crystal_node', tool: 'pickaxe', hardness: 1, hp: 3, w: 8, h: 10,
    drops: [one('frost_crystal', 1, 2)], biomes: ['rime'], placement: 'ground', weight: 5, minDepth: 1,
    light: { radius: 18, color: 0x80f0ff },
  },
  {
    id: 'ember_vent', name: 'Ember Vent', sprite: 'res_ember_vent', tool: 'pickaxe', hardness: 1, hp: 3, w: 10, h: 6,
    drops: [one('ember_core', 1, 1), one('coal', 1, 2, 0.5)], biomes: ['cinder'], placement: 'ground', weight: 5, minDepth: 1,
    light: { radius: 24, color: 0xff8020 },
  },
  {
    id: 'amethyst_cluster', name: 'Amethyst Cluster', sprite: 'res_amethyst_cluster', tool: 'pickaxe', hardness: 2, hp: 4, w: 10, h: 10,
    drops: [one('amethyst_shard', 1, 3)], biomes: ['amethyst'], placement: 'ground', weight: 6, minDepth: 1,
    light: { radius: 24, color: 0xe274ee },
  },
  {
    id: 'bog_moss_patch', name: 'Bog Moss', sprite: 'res_bog_moss_patch', tool: 'hand', hardness: 0, hp: 1, w: 10, h: 6,
    drops: [one('bog_moss', 1, 2)], biomes: ['fen'], placement: 'ground', weight: 5, minDepth: 1,
  },

  // Ceiling growths (placement 'ceiling': SpawnSpec y = the ceiling surface, they hang below it).
  {
    id: 'vine_hanging', name: 'Hanging Vine', sprite: 'res_vine_hanging', tool: 'hand', hardness: 0, hp: 1, w: 6, h: 16,
    drops: [one('fiber', 1, 2), one('herb', 1, 1, 0.15)], biomes: ['woods', 'fen', 'hollow', 'amethyst'], placement: 'ceiling', weight: 5, minDepth: 1,
  },
  {
    id: 'icicle_cluster', name: 'Icicles', sprite: 'res_icicle_cluster', tool: 'pickaxe', hardness: 1, hp: 2, w: 8, h: 12,
    drops: [one('frost_crystal', 1, 1)], biomes: ['rime'], placement: 'ceiling', weight: 5, minDepth: 1,
    light: { radius: 10, color: 0x80f0ff },
  },
  {
    id: 'crystal_stalactite', name: 'Crystal Stalactite', sprite: 'res_crystal_stalactite', tool: 'pickaxe', hardness: 2, hp: 3, w: 8, h: 12,
    drops: [one('amethyst_shard', 1, 2)], biomes: ['amethyst', 'lair'], placement: 'ceiling', weight: 3, minDepth: 1,
    light: { radius: 16, color: 0xe274ee },
  },

  // Bugs (caught with a net; they flit around their spot).
  {
    id: 'bug_firefly', name: 'Firefly', sprite: 'res_bug_firefly', tool: 'net', hardness: 1, hp: 1, w: 4, h: 4,
    drops: [one('firefly')], biomes: ['woods', 'fen', 'amethyst'], placement: 'air', weight: 3, minDepth: 1,
    light: { radius: 10, color: 0x9cff3a }, critter: true,
  },
  {
    id: 'bug_moth', name: 'Glow Moth', sprite: 'res_bug_moth', tool: 'net', hardness: 1, hp: 1, w: 4, h: 4,
    drops: [one('glow_moth')], biomes: ['fen', 'hollow', 'rime', 'amethyst', 'lair'], placement: 'air', weight: 3, minDepth: 1,
    light: { radius: 10, color: 0xd0c0ff }, critter: true,
  },
  {
    id: 'bug_beetle', name: 'Stag Beetle', sprite: 'res_bug_beetle', tool: 'net', hardness: 1, hp: 1, w: 6, h: 4,
    drops: [one('stag_beetle')], biomes: ['woods', 'hollow', 'cinder'], placement: 'ground', weight: 2, minDepth: 1, critter: true,
  },

  // Containers (placed by the chest/pot pass, not the weighted resource pass). Loot comes from
  // SpawnSpec.data.lootTier — see the header comment.
  {
    id: 'chest_wood', name: 'Wooden Chest', sprite: 'res_chest_wood', tool: 'hand', hardness: 0, hp: 2, w: 10, h: 8,
    drops: [], biomes: [...ALL, 'lair'], placement: 'ground', weight: 0, minDepth: 1,
  },
  {
    id: 'chest_iron', name: 'Iron Chest', sprite: 'res_chest_iron', tool: 'hand', hardness: 0, hp: 3, w: 10, h: 8,
    drops: [], biomes: [...ALL, 'lair'], placement: 'ground', weight: 0, minDepth: 1,
  },
  {
    id: 'pot', name: 'Clay Pot', sprite: 'res_pot', tool: 'hand', hardness: 0, hp: 1, w: 6, h: 7,
    drops: [], biomes: [...ALL, 'lair'], placement: 'ground', weight: 0, minDepth: 1,
  },
];
