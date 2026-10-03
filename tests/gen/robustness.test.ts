import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import type { BiomeDef } from '../../src/content/types';
import { checkLevel, generateLevel } from '../../src/sim/gen';

/**
 * Content is data: biomes authored later (phase-2 biomes, sparse decor lists) must not crash the
 * generator. Temporary biome defs are registered for this file only and removed afterwards.
 */
const biomes = Content.biomes as Map<string, BiomeDef>;
const woods = Content.biomes.get('woods')!;
const TEMP: BiomeDef[] = [
  // Only hanging lanterns as decor (lanterns are placed by their own pass, not the decor pass).
  { ...woods, id: 't_lanterns', decor: ['decor_lantern'] },
  // No decor, no liquid, no special tiles, no style entry in src/sim/gen/styles.ts.
  { ...woods, id: 't_bare', decor: [], gen: { ...woods.gen, liquid: 'none', liquidAmount: 0, specialTileDensity: 0, hazardDensity: 0 } },
];

beforeAll(() => {
  for (const b of TEMP) biomes.set(b.id, b);
});
afterAll(() => {
  for (const b of TEMP) biomes.delete(b.id);
});

describe('generator robustness to new content', () => {
  it('handles biomes with sparse decor and no style entry', () => {
    for (const b of TEMP) {
      for (const kind of ['normal', 'boss', 'town'] as const) {
        for (let seed = 0; seed < 4; seed++) {
          const l = generateLevel({ seed, district: 3, biome: b.id, kind, nextBiomes: kind === 'town' ? [] : ['woods', 'fen'] });
          expect(l.info.biome).toBe(b.id);
          const rep = checkLevel(l);
          expect(rep.problems, `${b.id}/${kind}/${seed}`).toEqual([]);
          expect(rep.softLocks).toBe(0);
        }
      }
    }
  });
});
