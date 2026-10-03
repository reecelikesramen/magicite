import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { PUNCH_TREE_MAX_HARDNESS } from '../../src/sim/combat/harvest';

/**
 * No race may be soft-locked out of progression: from its starting kit plus what level 1 (woods)
 * offers, it must be able to craft its first pickaxe without a town (no stations).
 */
function reachableItems(start: string[]): Set<string> {
  const have = new Set(start);
  const hasTool = (kind: string, power: number) =>
    [...have].some((id) => {
      const d = Content.items.get(id);
      return d?.tool === kind && (d.toolPower ?? 0) >= power;
    });
  for (let changed = true; changed; ) {
    changed = false;
    const add = (id: string) => {
      if (!have.has(id)) {
        have.add(id);
        changed = true;
      }
    };
    for (const r of Content.resources.values()) {
      if (!r.biomes.includes('woods') || r.minDepth > 1) continue;
      const ok =
        r.tool === 'hand' ||
        hasTool(r.tool, r.hardness) ||
        (r.tool === 'axe' && r.hardness <= PUNCH_TREE_MAX_HARDNESS); // bare-hand tree punching
      if (ok) for (const d of r.drops) if (d.chance > 0) add(d.item);
    }
    for (const rec of Content.recipeList) {
      if (rec.station) continue;
      if (have.has(rec.a) && have.has(rec.b)) add(rec.result);
    }
  }
  return have;
}

describe('progression softlocks', () => {
  for (const race of Content.races.values()) {
    it(`${race.id} can reach a pickaxe from its start kit on level 1`, () => {
      const items = reachableItems(race.startItems.map((s) => s.item));
      const pick = [...items].find((id) => Content.items.get(id)?.tool === 'pickaxe');
      expect(pick, `${race.id} reachable: ${[...items].join(', ')}`).toBeDefined();
    });
  }
});
