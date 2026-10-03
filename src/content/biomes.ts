import type { BiomeDef } from './types';

export const BIOMES: BiomeDef[] = [
  {
    id: 'woods',
    name: 'Mossgrave Woods',
    palette: {
      wall: [0x0a0806, 0x141009, 0x1f170e, 0x2a1f14],
      ground: [0x1c140c, 0x2a1f14, 0x3b2a1a, 0x4e3822],
      fringe: [0x2e7a26, 0x3f8f2a, 0x5fb83a, 0x8fdc5a],
      rock: [0x2a2a2e, 0x3e3e44, 0x5a5a60, 0x7a7a80],
      accent: [0x9cff3a, 0x4caf3a, 0x8fd65a, 0x7a4a24],
      ambient: 0x1a1410,
      ambientLevel: 0.12,
      sky: 0x050403,
      playerLight: 0xffb060,
    },
    size: { w: [140, 180], h: [70, 90] },
    gen: { openness: 0.55, verticality: 0.4, platformDensity: 0.3, liquid: 'water', liquidAmount: 0.1, hazardDensity: 0.05, specialTileDensity: 0 },
    enemyDensity: 1,
    resourceDensity: 1,
    ambientParticles: 'fireflies',
    music: 'forest',
    depths: [1, 2],
    boss: '',
    decor: [],
  },
];
