import type { ResourceDef } from './types';

export const RESOURCES: ResourceDef[] = [
  {
    id: 'tree_forest', name: 'Tree', sprite: 'res_tree_forest', tool: 'axe', hardness: 1, hp: 4, w: 8, h: 48,
    drops: [{ item: 'wood', chance: 1, min: 2, max: 4 }], biomes: ['woods'], placement: 'ground', weight: 10, minDepth: 1, background: true,
  },
  {
    id: 'rock_stone', name: 'Rock', sprite: 'res_rock_stone', tool: 'pickaxe', hardness: 1, hp: 4, w: 8, h: 7,
    drops: [{ item: 'stone', chance: 1, min: 1, max: 3 }], biomes: ['woods'], placement: 'ground', weight: 6, minDepth: 1,
  },
];
