import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import type { EnemyDef } from '../../src/content/types';
import { TILE } from '../../src/sim/constants';
import { checkLevel, generateLevel, type GeneratedLevel } from '../../src/sim/gen';
import { SAFE_RADIUS } from '../../src/sim/gen/populate';
import { TILE_PROPS } from '../../src/sim/tiles';

/**
 * Enemy selection against a temporary roster added next to the real one: defs are
 * filtered by biome, minDepth and weight, and each lands on the spawn-point type its movement needs.
 * The defs are registered for this file only (vitest isolates test files) and removed afterwards.
 */
const base = { name: 'Test', sprite: 'enemy_test', hp: 3, damage: 1, speed: 40, sight: 80, xp: 1, gold: [0, 1] as [number, number], drops: [] };
const ROSTER: EnemyDef[] = [
  { ...base, id: 't_bat', behavior: 'flyer', flying: true, w: 8, h: 6, biomes: ['hollow'], weight: 10, minDepth: 1 },
  { ...base, id: 't_imp', behavior: 'shooter', flying: true, w: 8, h: 8, biomes: ['hollow'], weight: 10, minDepth: 1 },
  { ...base, id: 't_spider', behavior: 'dropper', w: 8, h: 8, biomes: ['hollow'], weight: 10, minDepth: 1 },
  { ...base, id: 't_totem', behavior: 'turret', w: 8, h: 12, biomes: ['hollow'], weight: 10, minDepth: 1 },
  { ...base, id: 't_crawler', behavior: 'walker', w: 8, h: 6, biomes: ['hollow'], weight: 10, minDepth: 1 },
  { ...base, id: 't_deep', behavior: 'walker', w: 8, h: 6, biomes: ['hollow'], weight: 10, minDepth: 15 },
  { ...base, id: 't_never', behavior: 'walker', w: 8, h: 6, biomes: ['hollow'], weight: 0, minDepth: 1 },
  { ...base, id: 't_elsewhere', behavior: 'walker', w: 8, h: 6, biomes: ['cinder'], weight: 10, minDepth: 1 },
];
/** Spawn-point kind a def's movement needs (fixtures and the real roster alike). */
const pointFor = (d: EnemyDef): string => (d.flying ? 'air' : d.behavior === 'dropper' ? 'ceiling' : d.behavior === 'turret' ? 'turret' : 'ground');
const enemies = Content.enemies as Map<string, EnemyDef>;

beforeAll(() => {
  for (const d of ROSTER) enemies.set(d.id, d);
});
afterAll(() => {
  for (const d of ROSTER) enemies.delete(d.id);
});

function levels(district: number, n = 12): GeneratedLevel[] {
  const out: GeneratedLevel[] = [];
  for (let i = 0; i < n; i++) out.push(generateLevel({ seed: 11 + i * 6151, district, biome: 'hollow', kind: 'normal', nextBiomes: ['fen', 'rime'] }));
  return out;
}

const solid = (l: GeneratedLevel, tx: number, ty: number): boolean => TILE_PROPS[l.grid.get(tx, ty)]!.solid;

describe('enemy placement', () => {
  it('picks defs by biome, depth and weight, each on the spawn point its movement needs', () => {
    const seen = new Set<string>();
    for (const l of levels(3)) {
      expect(checkLevel(l).problems).toEqual([]);
      for (const s of l.spawns) {
        if (s.kind !== 'enemy') continue;
        seen.add(s.def);
        expect(['t_never', 't_elsewhere', 't_deep', 'green_slime'], s.def).not.toContain(s.def);
        expect(s.data?.point, s.def).toBe(pointFor(Content.enemies.get(s.def)!));
        const dx = (s.x - l.spawn.x) / TILE;
        const dy = (s.y - l.spawn.y) / TILE;
        expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(SAFE_RADIUS * SAFE_RADIUS);
        const d = Content.enemies.get(s.def)!;
        const tx = Math.floor(s.x / TILE);
        if (s.data?.point === 'ceiling') {
          // Hangs from the ceiling: hitbox top flush with a solid tile.
          expect((s.y - d.h) % TILE).toBe(0);
          expect(solid(l, tx, (s.y - d.h) / TILE - 1), `${s.def} at ${s.x},${s.y}`).toBe(true);
        } else if (s.data?.point !== 'air') {
          expect(solid(l, tx, s.y / TILE), `${s.def} floating at ${s.x},${s.y}`).toBe(true);
        }
      }
    }
    for (const id of ['t_bat', 't_imp', 't_spider', 't_totem', 't_crawler']) expect(seen, id).toContain(id);
  });

  it('admits deeper defs once the run reaches their depth', () => {
    expect(levels(17).some((l) => l.spawns.some((s) => s.def === 't_deep'))).toBe(true);
  });
});
