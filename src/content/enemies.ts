import type { EnemyDef } from './types';

export const ENEMIES: EnemyDef[] = [
  {
    id: 'green_slime', name: 'Green Slime', sprite: 'enemy_green_slime', behavior: 'hopper', w: 8, h: 6, hp: 3, damage: 1,
    speed: 40, sight: 80, xp: 1, gold: [0, 2], drops: [{ item: 'meat', chance: 0.1, min: 1, max: 1 }],
    biomes: ['toadvale_forest'], weight: 10, minDepth: 1,
  },
];
