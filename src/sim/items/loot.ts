import { Content } from '../../content';
import type { ItemDef } from '../../content/types';
import type { ItemStack } from '../types';
import type { World } from '../world';
import { spawnGold, spawnStackPickup } from './drops';
import { makeStack } from './inventory';
import { tierForDistrict } from './tiers';

/** Loot buckets and their weights per chest roll. */
type Bucket = 'material' | 'consumable' | 'ammo' | 'thrown' | 'gear' | 'accessory';

const BUCKET_WEIGHTS: readonly { b: Bucket; w: number }[] = [
  { b: 'material', w: 38 },
  { b: 'consumable', w: 26 },
  { b: 'ammo', w: 10 },
  { b: 'thrown', w: 7 },
  { b: 'gear', w: 13 },
  { b: 'accessory', w: 6 },
];

function excluded(d: ItemDef): boolean {
  return !!d.tags?.some((t) => t === 'no_loot' || t === 'unique' || t === 'trophy' || t === 'legendary' || t === 'currency' || t === 'part');
}

function bucketOf(d: ItemDef): Bucket | null {
  if (excluded(d)) return null;
  switch (d.category) {
    case 'material':
      return 'material';
    case 'consumable':
    case 'placeable':
      return 'consumable';
    case 'ammo':
      return 'ammo';
    case 'accessory':
      return 'accessory';
    case 'weapon':
      return d.use === 'throw' ? 'thrown' : 'gear';
    case 'tool':
    case 'armor':
      return 'gear';
    default:
      return null;
  }
}

/** Tier window per bucket: gear/ammo/materials near the chest tier, cheap stuff anything at or below. */
function inWindow(d: ItemDef, b: Bucket, tier: number): boolean {
  if (d.tier > tier) return false;
  if (b === 'gear' || b === 'ammo' || b === 'material') return d.tier >= tier - 1;
  if (d.tags?.includes('elixir')) return tier >= 4;
  return true;
}

const POOLS = new Map<number, Map<Bucket, string[]>>();

/** Item pools per chest tier (derived once from the immutable catalogue, in catalogue order). */
export function lootPool(tier: number): ReadonlyMap<Bucket, readonly string[]> {
  const t = Math.max(1, Math.min(5, Math.floor(tier)));
  let m = POOLS.get(t);
  if (m) return m;
  m = new Map();
  for (const d of Content.items.values()) {
    const b = bucketOf(d);
    if (!b || !inWindow(d, b, t)) continue;
    let arr = m.get(b);
    if (!arr) m.set(b, (arr = []));
    arr.push(d.id);
  }
  POOLS.set(t, m);
  return m;
}

export interface LootRoll {
  items: ItemStack[];
  gold: number;
}

export interface ChestOpts {
  /** Extra item rolls (iron / golden chests). */
  bonusRolls?: number;
}

function qtyFor(world: World, d: ItemDef, b: Bucket, tier: number): number {
  if (d.maxStack <= 1) return 1;
  switch (b) {
    case 'ammo':
      return world.rng.int(5, 10);
    case 'material':
      return world.rng.int(1, 2 + tier);
    case 'thrown':
      return world.rng.int(1, 3);
    default:
      return world.rng.int(1, 2);
  }
}

/**
 * Roll a chest's contents for loot tier 1..5 (world.rng): 2–3 item rolls (+bonus), a gold purse that
 * grows with tier, and an 8% chance of a recipe scroll. Deterministic for a given world state.
 */
export function rollChestLoot(world: World, tier: number, opts: ChestOpts = {}): LootRoll {
  const t = Math.max(1, Math.min(5, Math.floor(tier)));
  const pool = lootPool(t);
  const items: ItemStack[] = [];
  const rolls = 2 + world.rng.int(0, 1) + (opts.bonusRolls ?? 0);
  for (let i = 0; i < rolls; i++) {
    const usable = BUCKET_WEIGHTS.filter((x) => (pool.get(x.b)?.length ?? 0) > 0);
    if (usable.length === 0) break;
    const b = world.rng.weighted(usable, (x) => x.w).b;
    const id = world.rng.pick(pool.get(b)!);
    const def = Content.items.get(id)!;
    const n = qtyFor(world, def, b, t);
    const same = items.find((s) => s.id === id && s.durability === undefined && def.maxStack > 1);
    if (same) same.count = Math.min(def.maxStack, same.count + n);
    else items.push(makeStack(id, n));
  }
  if (world.rng.chance(0.08)) items.push(makeStack('recipe_scroll', 1));
  const gold = world.rng.int(2 + 3 * t, 6 + 8 * t);
  return { items, gold };
}

/** Pots only hold cheap consumables (snacks, basic potions, torches), never elixirs. */
const POT_MAX_VALUE = 30;
const POT_POOLS = new Map<number, readonly string[]>();

function potPool(tier: number): readonly string[] {
  let pool = POT_POOLS.get(tier);
  if (!pool) {
    pool = (lootPool(tier).get('consumable') ?? []).filter((id) => (Content.items.get(id)?.value ?? 0) <= POT_MAX_VALUE);
    POT_POOLS.set(tier, pool);
  }
  return pool;
}

/** Breakable pots: a few coins and sometimes a snack or potion. */
export function rollPotLoot(world: World, tier: number): LootRoll {
  const t = Math.max(1, Math.min(5, Math.floor(tier)));
  const items: ItemStack[] = [];
  if (world.rng.chance(0.25)) {
    const pool = potPool(t);
    if (pool.length) items.push(makeStack(world.rng.pick(pool), 1));
  }
  return { items, gold: world.rng.chance(0.6) ? world.rng.int(1, 2 + t) : 0 };
}

/** What a container resource rolls: pot loot, or a chest's item tier and extra rolls. */
export interface ContainerRoll {
  pot: boolean;
  /** Item tier 1..5 for rollChestLoot. */
  tier: number;
  bonusRolls: number;
}

/**
 * Decide a container's loot. Chest grade: 0 wooden · 1 iron · 2 secret-pocket chest. Item tier = the
 * district's tier (+1 for iron/secret chests, max 5); each grade adds one item roll.
 * `lootTier` is level gen's `SpawnSpec.data.lootTier` convention (0 pot · 1 wooden · 2 iron · 3 secret,
 * each + floor(district / 6)); without it the grade comes from the resource id.
 */
export function containerRoll(resourceId: string, district: number, lootTier?: number): ContainerRoll {
  const base = tierForDistrict(district);
  if (resourceId === 'pot' || lootTier === 0) return { pot: true, tier: base, bonusRolls: 0 };
  const grade =
    typeof lootTier === 'number' && Number.isFinite(lootTier)
      ? Math.max(0, Math.min(2, Math.floor(lootTier) - Math.floor(district / 6) - 1))
      : resourceId === 'chest_iron' || resourceId === 'chest_gold' ? 1 : 0;
  return { pot: false, tier: Math.min(5, base + (grade >= 1 ? 1 : 0)), bonusRolls: grade };
}

/** Loot tier of a chest resource in a district: iron (and golden) chests are one tier richer. */
export function chestTier(resourceId: string, district: number): number {
  return containerRoll(resourceId, district).tier;
}

/** Spawn a loot roll as pickups popping out of (x, y) (bottom-centre of the chest). */
export function spawnLoot(world: World, loot: LootRoll, x: number, y: number): void {
  for (const s of loot.items) spawnStackPickup(world, s, x, y - 4, { vx: world.rng.range(-60, 60), vy: world.rng.range(-170, -110), delay: 20 });
  if (loot.gold > 0) spawnGold(world, loot.gold, x, y - 4);
}

export interface OpenOpts {
  /** Player who opened it (for run stats). */
  player?: number;
  /** Level gen's `SpawnSpec.data.lootTier`, if the entity kept it. */
  lootTier?: number;
}

/**
 * Open (break) a container resource — `chest_wood`, `chest_iron`, `pot` — at (x, y) bottom-centre:
 * roll by its def, the current district and gen's lootTier, spawn the loot, count it.
 * (Lead: call from the resource-break path for containers instead of their empty `drops`.)
 */
export function openChest(world: World, chestDef: string, x: number, y: number, opts: OpenOpts = {}): LootRoll {
  const district = world.level?.info.district ?? 1;
  const c = containerRoll(chestDef, district, opts.lootTier);
  const loot = c.pot ? rollPotLoot(world, c.tier) : rollChestLoot(world, c.tier, { bonusRolls: c.bonusRolls });
  spawnLoot(world, loot, x, y);
  world.emit({ type: 'particles', preset: c.pot ? 'pot_break' : 'chest_open', x, y: y - 6, count: c.pot ? 6 : 12 });
  world.emit({ type: 'sfx', id: c.pot ? 'pot_break' : 'chest_open', x, y });
  const p = opts.player !== undefined ? world.players[opts.player] : undefined;
  if (p) {
    const key = c.pot ? 'potsBroken' : 'chestsOpened';
    p.runStats[key] = (p.runStats[key] ?? 0) + 1;
  }
  return loot;
}
