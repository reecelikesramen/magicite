import { Content } from '../../content';
import { SHOPS, type ShopDef, type ShopLine } from '../../content/npcs';
import type { ItemDef } from '../../content/types';
import { hashSeed, Rng } from '../../engine/rng';
import type { Entity, ItemStack, PlayerState, ShopComp, ShopEntry } from '../types';
import type { World } from '../world';
import { applyPermanent, healEntity } from './consume';
import { makeStack, addStack, roomFor, validInv } from './inventory';
import { pricePercent, tierForDistrict } from './tiers';

/** Max distance (px, centre to centre) to trade with an NPC. */
export const SHOP_RANGE = 40;
/** Teaser lines cost this much more than list price. */
export const TEASER_MARKUP = 1.5;

export function shopDef(npcId: string): ShopDef | undefined {
  return SHOPS[npcId];
}

/**
 * Gold to buy one `def` in a town at `district`: ceil(value × (100 + 3 × (district − 1)) / 100).
 * Integer arithmetic on purpose: `value * 1.06` is 106.00000000000001 in floating point, which
 * would round a 100 g item up to 107 g.
 */
export function buyPrice(def: ItemDef, district: number): number {
  return Math.max(1, Math.ceil((def.value * pricePercent(district)) / 100));
}

/** Gold paid for one unit when selling: floor(value / 2), scaled by remaining durability (integer math). */
export function sellPrice(def: ItemDef | undefined, stack?: ItemStack | null): number {
  if (!def || def.value <= 0 || def.tags?.includes('currency')) return 0;
  const max = def.durability;
  if (stack?.durability === undefined || !max) return Math.floor(def.value / 2);
  const dur = Math.max(0, Math.min(max, stack.durability));
  return Math.floor((def.value * dur) / (2 * max));
}

/** Does this NPC buy this item? (category / #tag lists; the fence buys anything). */
export function npcBuys(npcId: string, def: ItemDef | undefined): boolean {
  const shop = SHOPS[npcId];
  if (!shop || !def) return false;
  if (shop.buys === 'all') return true;
  for (const b of shop.buys) {
    if (b.startsWith('#') ? !!def.tags?.includes(b.slice(1)) : b === def.category) return true;
  }
  return false;
}

function lineEligible(l: ShopLine, tier: number, biome: string | undefined): boolean {
  if (l.biome && l.biome !== biome) return false;
  const min = l.minTier ?? Content.items.get(l.item)?.tier ?? 1;
  const max = l.maxTier ?? min + 2;
  return tier >= min && tier <= max;
}

/** Teaser pool: gear one tier above the district (never legendary / trophy / unique). */
function teaserPool(npcId: string, tier: number): ItemDef[] {
  const cats = npcId === 'npc_outfitter' ? ['armor', 'accessory'] : npcId === 'npc_smith' ? ['weapon', 'tool'] : ['weapon'];
  const out: ItemDef[] = [];
  for (const d of Content.items.values()) {
    if (d.tier !== tier + 1 || !cats.includes(d.category) || d.use === 'throw') continue;
    if (d.tags?.some((t) => t === 'legendary' || t === 'no_loot' || t === 'unique' || t === 'trophy')) continue;
    out.push(d);
  }
  return out;
}

/**
 * Roll a shop's stock for a town at `district` (GDD §9: shops scale with depth). Pure in `rng`:
 * `always` lines first, then weighted picks without repeats up to `slots`, plus an optional teaser
 * (one piece of next-tier gear at a markup). `biome` selects the biome trader's specialities.
 */
export function shopStock(npcId: string, district: number, rng: Rng, biome?: string): ShopEntry[] {
  const shop = SHOPS[npcId];
  if (!shop) return [];
  const tier = tierForDistrict(district);
  const pool = shop.lines.filter((l) => lineEligible(l, tier, biome) && Content.items.has(l.item));
  const out: ShopEntry[] = [];
  const has = (id: string) => out.some((s) => s.item === id);
  const add = (l: ShopLine) => {
    const def = Content.items.get(l.item)!;
    out.push({ item: l.item, count: rng.int(l.qty[0], l.qty[1]), price: buyPrice(def, district) });
  };
  for (const l of pool) if (l.always && !has(l.item) && out.length < shop.slots) add(l);
  const rest = pool.filter((l) => !l.always);
  while (out.length < shop.slots) {
    const cands = rest.filter((l) => !has(l.item));
    if (cands.length === 0) break;
    add(rng.weighted(cands, (l) => l.weight));
  }
  if (shop.teaser && tier < 5) {
    const t = teaserPool(npcId, tier);
    if (t.length > 0) {
      const def = rng.pick(t);
      if (!has(def.id)) out.push({ item: def.id, count: 1, price: Math.ceil(buyPrice(def, district) * TEASER_MARKUP) });
    }
  }
  return out;
}

/** Ordinal of this NPC among same-def NPCs (stable per level; keeps stock independent of position). */
function npcOrdinal(world: World, npc: Entity): number {
  let n = 0;
  for (const o of world.entities) if (o.kind === 'npc' && o.def === npc.def && o.id < npc.id) n++;
  return n;
}

/** The seeded generator for an NPC's stock (same on every peer). */
export function shopRng(world: World, npc: Entity): Rng {
  const info = world.level.info;
  return new Rng(hashSeed(`shop:${info.seed}:${info.district}:${info.biome}:${npc.def}:${npcOrdinal(world, npc)}`));
}

/** Stock for an NPC *without* mutating the sim (UI preview). */
export function peekShop(world: World, npc: Entity): ShopComp | undefined {
  if (npc.shop) return npc.shop;
  if (!SHOPS[npc.def]) return undefined;
  const info = world.level.info;
  return { stock: shopStock(npc.def, info.district, shopRng(world, npc), info.biome) };
}

/** Create the NPC's shop component on first use (sim side). */
export function ensureShop(world: World, npc: Entity): ShopComp | undefined {
  if (npc.shop) return npc.shop;
  const s = peekShop(world, npc);
  if (s) npc.shop = s;
  return s;
}

/** Give every shop NPC in the level its stock (called once per level by the command system). */
export function initShops(world: World): void {
  for (const e of world.entities) if (e.kind === 'npc' && !e.dead && !e.shop && SHOPS[e.def]) ensureShop(world, e);
}

function dist2(a: Entity, b: Entity): number {
  const dx = a.x + a.w / 2 - (b.x + b.w / 2);
  const dy = a.y + a.h / 2 - (b.y + b.h / 2);
  return dx * dx + dy * dy;
}

export function inShopRange(a: Entity, b: Entity): boolean {
  return dist2(a, b) <= SHOP_RANGE * SHOP_RANGE;
}

/** Nearest shop NPC within SHOP_RANGE that satisfies `pred`. */
export function nearestNpc(world: World, e: Entity, pred: (npc: Entity, def: ShopDef) => boolean): Entity | undefined {
  let best: Entity | undefined;
  let bd = Infinity;
  for (const o of world.entities) {
    if (o.kind !== 'npc' || o.dead) continue;
    const def = SHOPS[o.def];
    if (!def || !pred(o, def)) continue;
    const d = dist2(o, e);
    if (d <= SHOP_RANGE * SHOP_RANGE && d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

function deny(world: World, p: PlayerState, text: string): false {
  world.emit({ type: 'message', text, player: p.index });
  world.emit({ type: 'sfx', id: 'denied', x: 0, y: 0 });
  return false;
}

function bump(p: PlayerState, key: string, n: number): void {
  p.runStats[key] = (p.runStats[key] ?? 0) + n;
}

/** Buy one unit of stock line `index` from NPC entity `npcId` (or pray at a shrine). */
export function buy(world: World, p: PlayerState, npcId: number, index: number): boolean {
  const e = world.get(p.entityId);
  const npc = typeof npcId === 'number' ? world.get(npcId) : undefined;
  if (!e || !npc || npc.kind !== 'npc' || npc.dead || p.downed || p.out) return false;
  const def = SHOPS[npc.def];
  if (!def) return false;
  if (!inShopRange(e, npc)) return deny(world, p, 'Too far away.');
  if (def.prayerCost !== undefined) return pray(world, p, e, npc, def.prayerCost);
  const shop = ensureShop(world, npc)!;
  const line = typeof index === 'number' && Number.isInteger(index) ? shop.stock[index] : undefined;
  if (!line || line.count <= 0) return deny(world, p, 'Sold out.');
  if (p.gold < line.price) return deny(world, p, 'Not enough gold.');
  if (roomFor(p, line.item) < 1) return deny(world, p, 'No room in your pack.');
  p.gold -= line.price;
  line.count--;
  addStack(p, makeStack(line.item, 1));
  bump(p, 'itemsBought', 1);
  bump(p, 'goldSpent', line.price);
  world.emit({ type: 'sfx', id: 'buy', x: e.x + e.w / 2, y: e.y });
  world.emit({ type: 'pickup', player: p.index, item: line.item, count: 1 });
  return true;
}

/** Sell `count` from inventory `slot` to the nearest NPC that buys it. */
export function sell(world: World, p: PlayerState, slot: number, count: number): boolean {
  const e = world.get(p.entityId);
  if (!e || !validInv(p, slot) || p.downed || p.out) return false;
  const stack = p.inventory[slot];
  if (!stack) return false;
  const def = Content.items.get(stack.id);
  const npc = nearestNpc(world, e, (o) => npcBuys(o.def, def));
  if (!npc) return deny(world, p, 'Nobody here buys that.');
  const each = sellPrice(def, stack);
  if (each <= 0) return deny(world, p, 'That is worthless.');
  const n = Math.max(1, Math.min(stack.count, Number.isInteger(count) ? count : 1));
  const gold = each * n;
  stack.count -= n;
  if (stack.count <= 0) p.inventory[slot] = null;
  p.gold += gold;
  p.runStats.goldEarned += gold;
  bump(p, 'itemsSold', n);
  world.emit({ type: 'sfx', id: 'sell', x: e.x + e.w / 2, y: e.y });
  world.emit({ type: 'message', text: `+${gold} gold`, color: 0xffd040, player: p.index });
  return true;
}

/** Shrine blessings (GDD §9, Phase-1 subset): a random major boon for `prayerCost` gold. */
export const BLESSINGS = ['vigor', 'might', 'finesse', 'wisdom', 'fortune', 'renewal'] as const;

function pray(world: World, p: PlayerState, e: Entity, npc: Entity, cost: number): boolean {
  const shop = ensureShop(world, npc) ?? (npc.shop = { stock: [] });
  if (shop.used) return deny(world, p, 'The shrine is silent now.');
  if (p.gold < cost) return deny(world, p, `The shrine asks for ${cost} gold.`);
  p.gold -= cost;
  shop.used = true;
  bump(p, 'goldSpent', cost);
  const b = world.rng.pick(BLESSINGS);
  switch (b) {
    case 'vigor':
      applyPermanent(world, p, e, { maxHp: 2 });
      break;
    case 'might':
      applyPermanent(world, p, e, { atk: 2 });
      break;
    case 'finesse':
      applyPermanent(world, p, e, { dex: 2 });
      break;
    case 'wisdom':
      applyPermanent(world, p, e, { mag: 2 });
      break;
    case 'fortune':
      applyPermanent(world, p, e, { lck: 2 });
      break;
    case 'renewal':
      applyPermanent(world, p, e, { maxHp: 1, atk: 1, dex: 1, mag: 1, lck: 1 });
      healEntity(world, e, e.maxHp);
      break;
  }
  bump(p, 'blessings', 1);
  world.emit({ type: 'message', text: 'The shrine glows. You feel blessed.', color: 0xc0a0ff, player: p.index });
  world.emit({ type: 'sfx', id: 'blessing', x: npc.x + npc.w / 2, y: npc.y });
  world.emit({ type: 'particles', preset: 'blessing', x: e.x + e.w / 2, y: e.y, count: 16 });
  return true;
}
