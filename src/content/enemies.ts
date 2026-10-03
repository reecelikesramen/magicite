import type { EnemyDef } from './types';

export const ENEMIES: EnemyDef[] = [
  {
    id: 'green_slime', name: 'Green Slime', sprite: 'enemy_green_slime', behavior: 'hopper', w: 8, h: 6, hp: 3, damage: 1,
    speed: 40, sight: 80, xp: 1, gold: [0, 2], drops: [{ item: 'meat', chance: 0.1, min: 1, max: 1 }],
    biomes: ['toadvale_forest'], weight: 10, minDepth: 1,
  },
  // Run-flow hunter (progression workstream): spawned by src/sim/progression/wraith.ts, which also
  // moves it — AI dispatch should skip 'blight_wraith'. Never placed by level gen (no biomes, weight 0).
  {
    id: 'blight_wraith', name: 'Blight Wraith', sprite: 'enemy_blight_wraith', behavior: 'flyer', w: 12, h: 14, hp: 9999, damage: 4,
    damageType: 'magic', speed: 40, sight: 4096, knockbackResist: 1, flying: true, xp: 0, gold: [0, 0], drops: [],
    biomes: [], weight: 0, minDepth: 99, light: { radius: 44, color: 0xc050ff }, tags: ['wraith', 'invulnerable'],
  },
];
