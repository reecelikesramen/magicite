import { describe, expect, it } from 'vitest';
import { Content, recipeKey } from '../../src/content';
import { BOSS_TROPHIES, ITEMS, WORLD_MATERIALS } from '../../src/content/items';
import { SHOPS } from '../../src/content/npcs';
import { RECIPES } from '../../src/content/recipes';
import type { ItemDef } from '../../src/content/types';

/**
 * The crafting tech tree as a graph: sources are what the world hands out (resource drops, enemy /
 * boss drops, the canonical world materials, boss trophies, shop stock, starting items); every
 * recipe whose inputs are obtainable makes its result obtainable.
 */
function closure(sources: Iterable<string>): Set<string> {
  const have = new Set(sources);
  const ok = (side: string) =>
    side.startsWith('#') ? [...have].some((id) => Content.items.get(id)?.tags?.includes(side.slice(1))) : have.has(side);
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of RECIPES) {
      if (have.has(r.result) || !ok(r.a) || !ok(r.b)) continue;
      have.add(r.result);
      changed = true;
    }
  }
  return have;
}

function worldSources(): Set<string> {
  const s = new Set<string>(WORLD_MATERIALS);
  for (const id of Object.values(BOSS_TROPHIES)) s.add(id);
  for (const r of Content.resources.values()) for (const d of r.drops) s.add(d.item);
  for (const e of Content.enemies.values()) for (const d of e.drops) s.add(d.item);
  for (const b of Content.bosses.values()) for (const d of b.drops) s.add(d.item);
  for (const r of Content.races.values()) for (const st of r.startItems) s.add(st.item);
  for (const c of Content.companions.values()) for (const st of c.startItems ?? []) s.add(st.item);
  return s;
}

function shopSources(): Set<string> {
  const s = new Set<string>();
  for (const shop of Object.values(SHOPS)) for (const l of shop.lines) s.add(l.item);
  return s;
}

/** Items nobody is meant to obtain through play (currency pickups, legacy scaffold ids). */
const exempt = (d: ItemDef) => !!d.tags?.some((t) => t === 'unique' || t === 'currency');

describe('recipe graph', () => {
  it('every non-unique item is obtainable (gather, drop, buy or craft)', () => {
    const have = closure([...worldSources(), ...shopSources()]);
    const missing = ITEMS.filter((d) => !exempt(d) && !have.has(d.id)).map((d) => d.id);
    expect(missing).toEqual([]);
  });

  it('every craftable item is reachable from the world alone (shops are a shortcut, never a gate)', () => {
    const have = closure(worldSources());
    const missing = RECIPES.filter((r) => !have.has(r.result) && !exempt(Content.items.get(r.result)!)).map((r) => r.result);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('every recipe input can be obtained, so no recipe is dead', () => {
    const have = closure([...worldSources(), ...shopSources()]);
    for (const r of RECIPES) {
      expect(have.has(r.a), `${r.a} in ${r.a}+${r.b}`).toBe(true);
      expect(have.has(r.b), `${r.b} in ${r.a}+${r.b}`).toBe(true);
    }
  });

  it('no recipe produces one of its own inputs, and no pair is defined twice', () => {
    const seen = new Set<string>();
    for (const r of RECIPES) {
      const k = recipeKey(r.a, r.b);
      expect(seen.has(k), `duplicate ${k}`).toBe(false);
      seen.add(k);
      expect([r.a, r.b], k).not.toContain(r.result);
    }
  });

  it('every gathered material feeds at least one recipe (or is useful on its own)', () => {
    const used = new Set<string>();
    for (const r of RECIPES) used.add(r.a).add(r.b);
    for (const id of WORLD_MATERIALS) {
      const d = Content.items.get(id)!;
      expect(used.has(id) || !!d.use, id).toBe(true);
    }
  });

  it('tiers climb along the tree: a crafted item is never more than one tier below its inputs', () => {
    for (const r of RECIPES) {
      const out = Content.items.get(r.result)!.tier;
      const inTier = Math.max(Content.items.get(r.a)!.tier, Content.items.get(r.b)!.tier);
      expect(out, `${r.a}+${r.b}=${r.result}`).toBeGreaterThanOrEqual(inTier - 1);
    }
  });

  it('each metal tier has a full tool and weapon line', () => {
    const res = (a: string, b: string) => Content.recipes.get(recipeKey(a, b))?.result;
    for (const [m, prefix] of [['iron_bar', 'iron'], ['gold_bar', 'gold'], ['diamond', 'diamond']] as const) {
      expect(res(m, m)).toBe(`${prefix}_blade`);
      expect(res(`${prefix}_blade`, 'stick')).toBe(`${prefix}_sword`);
      expect(res(`${prefix}_great_blade`, 'stick')).toBe(`${prefix}_greatsword`);
      expect(res(`${prefix}_axe_head`, 'stick')).toBe(`${prefix}_axe`);
      expect(res(`${prefix}_pick_head`, 'stick')).toBe(`${prefix}_pickaxe`);
      expect(res(`${prefix}_blade`, 'shaft')).toBe(`${prefix}_spear`);
    }
  });
});
