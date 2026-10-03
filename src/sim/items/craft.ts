import { Content, recipeKey } from '../../content';
import type { RecipeDef } from '../../content/types';
import { TILE } from '../constants';
import type { Entity, PlayerState } from '../types';
import type { World } from '../world';
import { spawnStackPickup } from './drops';
import { addStack, isBatch, makeStack, validInv } from './inventory';

/** A placed campfire (or forge prop) counts within this many px of the crafter (centre to centre). */
export const STATION_RANGE = 3 * TILE + 4;

const TAG_RECIPES: readonly RecipeDef[] = Content.recipeList.filter((r) => r.a.startsWith('#') || r.b.startsWith('#'));

function sideMatches(side: string, id: string): boolean {
  if (side === id) return true;
  if (!side.startsWith('#')) return false;
  return !!Content.items.get(id)?.tags?.includes(side.slice(1));
}

/** Recipe for an unordered pair: exact ids first, then `#tag` recipes (in definition order). */
export function findRecipe(a: string, b: string): RecipeDef | undefined {
  const exact = Content.recipes.get(recipeKey(a, b));
  if (exact) return exact;
  for (const r of TAG_RECIPES) {
    if ((sideMatches(r.a, a) && sideMatches(r.b, b)) || (sideMatches(r.a, b) && sideMatches(r.b, a))) return r;
  }
  return undefined;
}

function propNear(world: World, e: Entity, def: string): boolean {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  for (const o of world.entities) {
    if (o.dead || o.kind !== 'prop' || o.def !== def) continue;
    const dx = o.x + o.w / 2 - cx;
    const dy = o.y + o.h / 2 - cy;
    if (dx * dx + dy * dy <= STATION_RANGE * STATION_RANGE) return true;
  }
  return false;
}

/** Is the crafting station for a recipe available to this player right now? */
export function stationAvailable(world: World, e: Entity, station: RecipeDef['station']): boolean {
  if (!station) return true;
  if (station === 'campfire') return propNear(world, e, 'campfire');
  return !!world.level?.info.isTown || propNear(world, e, 'forge');
}

export interface CraftOutcome {
  ok: boolean;
  result: string | null;
  count: number;
  discovered: boolean;
  /** Why nothing was crafted: 'invalid' | 'no_recipe' | 'station' | 'count'. */
  reason?: string;
}

const FAIL = (reason: string): CraftOutcome => ({ ok: false, result: null, count: 0, discovered: false, reason });

/**
 * Two-item crafting (GDD §7, §2b.5): inventory slots `a` and `b`, unordered. The same slot twice
 * pairs a stack with itself (needs ≥ 2). Material / ammo / `batch` results craft min(A,B) × count
 * (self: floor(n/2) × count); everything else crafts one at a time. Station recipes need a
 * campfire within STATION_RANGE or a town forge. New recipes are added to knownRecipes.
 */
export function craft(world: World, p: PlayerState, a: number, b: number): CraftOutcome {
  if (!validInv(p, a) || !validInv(p, b)) return FAIL('invalid');
  const sa = p.inventory[a];
  const sb = p.inventory[b];
  const e = world.get(p.entityId);
  if (!sa || !sb || !e) return FAIL('invalid');
  const self = a === b;
  const fx = e.x + e.w / 2;
  if (self && sa.count < 2) {
    world.emit({ type: 'message', text: 'Need two of those to craft.', player: p.index });
    return FAIL('count');
  }
  const recipe = findRecipe(sa.id, sb.id);
  if (!recipe) {
    world.emit({ type: 'craft', player: p.index, a: sa.id, b: sb.id, result: null, count: 0, discovered: false });
    world.emit({ type: 'sfx', id: 'craft_fail', x: fx, y: e.y });
    return FAIL('no_recipe');
  }
  if (!stationAvailable(world, e, recipe.station)) {
    const text = recipe.station === 'campfire' ? 'Needs a campfire nearby.' : 'Needs a forge. Try it in town.';
    world.emit({ type: 'message', text, player: p.index, color: 0xffc060 });
    world.emit({ type: 'sfx', id: 'craft_fail', x: fx, y: e.y });
    return FAIL('station');
  }
  const out = Content.items.get(recipe.result);
  const batch = isBatch(out);
  const pairs = self ? (batch ? Math.floor(sa.count / 2) : 1) : batch ? Math.min(sa.count, sb.count) : 1;
  const aId = sa.id;
  const bId = sb.id;
  // Consume inputs.
  if (self) {
    sa.count -= pairs * 2;
    if (sa.count <= 0) p.inventory[a] = null;
  } else {
    sa.count -= pairs;
    sb.count -= pairs;
    if (sa.count <= 0) p.inventory[a] = null;
    if (sb.count <= 0) p.inventory[b] = null;
  }
  // Produce (durable gear comes out at full durability); overflow drops at the crafter's feet.
  const total = pairs * recipe.count;
  const left = addStack(p, makeStack(recipe.result, total));
  if (left > 0) spawnStackPickup(world, makeStack(recipe.result, left), fx, e.y + e.h - 2, { vx: 0, vy: -60, delay: 30 });

  const key = recipeKey(recipe.a, recipe.b);
  const discovered = !p.knownRecipes.includes(key);
  if (discovered) {
    p.knownRecipes.push(key);
    p.runStats.recipesDiscovered++;
  }
  p.runStats.itemsCrafted += total;
  world.emit({ type: 'craft', player: p.index, a: aId, b: bId, result: recipe.result, count: total, discovered });
  world.emit({ type: 'sfx', id: discovered ? 'discover' : 'craft', x: fx, y: e.y });
  world.emit({ type: 'particles', preset: discovered ? 'discover' : 'craft', x: fx, y: e.y + 2, count: discovered ? 10 : 5 });
  return { ok: true, result: recipe.result, count: total, discovered };
}
