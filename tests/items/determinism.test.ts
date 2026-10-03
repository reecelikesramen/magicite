import { describe, expect, it } from 'vitest';
import { emptyInput, type PlayerCommand } from '../../src/sim';
import { openChest } from '../../src/sim/items/loot';
import { give, rig, spawnNear } from './helpers';

/** A scripted session touching every items command, including the rng-driven ones. */
function session(seed: number) {
  const { w, p, e } = rig(seed);
  const merchant = spawnNear(w, e, 'npc', 'npc_merchant');
  spawnNear(w, e, 'npc', 'npc_fence', -6);
  spawnNear(w, e, 'prop', 'campfire', 4);
  p.gold = 500;
  give(p, 0, 'wood', 9);
  give(p, 1, 'stone', 4);
  give(p, 2, 'mystery_potion', 3);
  give(p, 3, 'raw_meat', 4);
  give(p, 4, 'recipe_scroll', 2);
  give(p, 6, 'leather_cap');
  const script: PlayerCommand[][] = [
    [{ type: 'craft', a: 0, b: 1 }],
    [{ type: 'craft', a: 0, b: 0 }, { type: 'use', slot: 2 }],
    [{ type: 'use', slot: 2 }, { type: 'use', slot: 4 }],
    [{ type: 'craft', a: 3, b: 3 }, { type: 'buy', npc: merchant.id, index: 1 }],
    [{ type: 'equip', slot: 6 }, { type: 'split', slot: 3 }],
    [{ type: 'sell', slot: 1, count: 1 }, { type: 'sort' }],
    [{ type: 'use', slot: 4 }, { type: 'use', slot: 2 }],
    [{ type: 'drop', slot: { kind: 'equip', slot: 'head' }, count: 1 }],
  ];
  for (const commands of script) w.step([{ ...emptyInput(), commands }]);
  openChest(w, 'chest_wood', e.x + 16, e.y + e.h, { player: 0, lootTier: 1 });
  for (let i = 0; i < 120; i++) w.step([emptyInput()]);
  return JSON.stringify({
    inv: p.inventory,
    eq: p.equipment,
    gold: p.gold,
    known: p.knownRecipes,
    stats: p.stats,
    base: p.base,
    status: e.status,
    hp: e.hp,
    shop: merchant.shop,
    pickups: w.entities.filter((o) => o.kind === 'pickup').map((o) => [o.x, o.y, o.pickup]),
    rng: w.rng.getState(),
  });
}

describe('items determinism', () => {
  it('the same seed and command stream gives the same state', () => {
    expect(session(21)).toEqual(session(21));
    expect(session(22)).toEqual(session(22));
  });

  it('different seeds diverge somewhere (the rng is actually used)', () => {
    expect(session(21)).not.toEqual(session(22));
  });
});
