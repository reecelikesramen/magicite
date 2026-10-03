import { Content, recipeKey } from '../../content';
import type { ItemDef, StatMods, StatusId } from '../../content/types';
import { secs } from '../constants';
import type { Entity, ItemStack, PlayerState } from '../types';
import type { World } from '../world';
import { equipFromInventory, naturalSlot } from './equip';
import { takeFromSlot } from './inventory';
import { recalcStats } from './stats';
import { tierForDistrict } from './tiers';

/*
 * Inventory click-use (GDD §7): eat / drink / read from the inventory panel, or equip wearables.
 * NOTE for the lead: src/sim/combat/consume.ts (combat workstream) applies ConsumeEffects when the
 * *held* item is used with the attack button. `applyConsume` here is the items-side twin (adds the
 * race/hat food specials, mystery potions, recipe scrolls and repair kits). Dedupe by having combat's
 * consumeFromSlot call `applyConsume` (or vice versa) and keep one status helper.
 */

const HARMFUL: readonly StatusId[] = ['burn', 'poison', 'bleed', 'slow', 'weak', 'freeze', 'stun'];

/** Add or refresh a status (longest duration wins, strongest power wins). */
export function giveStatus(e: Entity, id: StatusId, ticks: number, power = 1, source = 0): void {
  for (const s of e.status) {
    if (s.id !== id) continue;
    s.ticks = Math.max(s.ticks, ticks);
    s.power = Math.max(s.power, power);
    return;
  }
  e.status.push({ id, ticks, power, source });
}

export function healEntity(world: World, e: Entity, amount: number): number {
  const n = Math.max(0, Math.min(amount, e.maxHp - e.hp));
  if (n <= 0) return 0;
  e.hp += n;
  world.emit({ type: 'heal', target: e.id, amount: n, x: e.x + e.w / 2, y: e.y });
  return n;
}

function say(world: World, p: PlayerState, text: string, color?: number): void {
  world.emit({ type: 'message', text, player: p.index, ...(color !== undefined ? { color } : {}) });
}

const GOOD = 0x80ff80;
const BAD = 0xff8080;
const INFO = 0xffe080;

const PERMANENT: readonly [keyof StatMods, keyof PlayerState['base'], string][] = [
  ['maxHp', 'hp', 'max HP'],
  ['atk', 'atk', 'ATK'],
  ['dex', 'dex', 'DEX'],
  ['mag', 'mag', 'MAG'],
  ['lck', 'lck', 'LCK'],
];

/** Permanent stat gains go into the rolled base stats (survive recalcStats). */
export function applyPermanent(world: World, p: PlayerState, e: Entity, mods: StatMods): void {
  let hp = 0;
  for (const [mod, base, label] of PERMANENT) {
    const v = mods[mod];
    if (typeof v !== 'number' || v === 0) continue;
    p.base[base] += v;
    if (base === 'hp') hp += v;
    say(world, p, `${v > 0 ? '+' : ''}${v} ${label}`, v > 0 ? GOOD : BAD);
  }
  recalcStats(p, e);
  if (hp > 0) healEntity(world, e, hp);
}

// ------------------------------------------------------------------------------------------------
// Mystery potion
// ------------------------------------------------------------------------------------------------

type MysteryId = 'heal' | 'mana' | 'haste' | 'regen' | 'shield' | 'feast' | 'gift' | 'poison' | 'slow' | 'weak' | 'hurt';

/** Outcome table (weights). Roughly 2/3 good, 1/3 bad. */
export const MYSTERY_TABLE: readonly { id: MysteryId; weight: number }[] = [
  { id: 'heal', weight: 18 },
  { id: 'mana', weight: 14 },
  { id: 'haste', weight: 10 },
  { id: 'regen', weight: 10 },
  { id: 'shield', weight: 8 },
  { id: 'feast', weight: 6 },
  { id: 'gift', weight: 3 },
  { id: 'poison', weight: 12 },
  { id: 'slow', weight: 8 },
  { id: 'weak', weight: 6 },
  { id: 'hurt', weight: 5 },
];

/** Roll and apply a mystery potion effect (world.rng). Returns the outcome id. */
export function drinkMystery(world: World, p: PlayerState, e: Entity): MysteryId {
  const roll = world.rng.weighted(MYSTERY_TABLE, (o) => o.weight).id;
  switch (roll) {
    case 'heal':
      healEntity(world, e, 3);
      say(world, p, 'You feel much better!', GOOD);
      break;
    case 'mana':
      p.mana = p.stats.maxMana;
      say(world, p, 'Your mind clears. Mana restored!', GOOD);
      break;
    case 'haste':
      giveStatus(e, 'haste', secs(8), 0.25);
      say(world, p, 'Your feet feel light!', GOOD);
      break;
    case 'regen':
      giveStatus(e, 'regen', secs(6), 1);
      say(world, p, 'A warm glow spreads through you.', GOOD);
      break;
    case 'shield':
      giveStatus(e, 'shield', secs(8), 1);
      say(world, p, 'Your skin hardens like bark.', GOOD);
      break;
    case 'feast':
      p.hunger = Math.min(p.stats.maxHunger, p.hunger + 4);
      say(world, p, 'Tastes like a roast dinner!', GOOD);
      break;
    case 'gift': {
      const pick = world.rng.pick(PERMANENT);
      applyPermanent(world, p, e, { [pick[0]]: 1 });
      say(world, p, 'Something inside you changes for good.', GOOD);
      break;
    }
    case 'poison':
      giveStatus(e, 'poison', secs(5), 1);
      say(world, p, 'Ugh... that was poison!', BAD);
      break;
    case 'slow':
      giveStatus(e, 'slow', secs(5), 0.4);
      say(world, p, 'Your legs turn to lead.', BAD);
      break;
    case 'weak':
      giveStatus(e, 'weak', secs(10), 0.5);
      say(world, p, 'You feel feeble.', BAD);
      break;
    case 'hurt':
      if (e.hp > 1) {
        e.hp -= 1;
        world.emit({ type: 'damage', target: e.id, amount: 1, x: e.x + e.w / 2, y: e.y, crit: false, damageType: 'poison', toPlayer: true });
      }
      say(world, p, 'It burns going down!', BAD);
      break;
  }
  world.emit({ type: 'particles', preset: 'mystery', x: e.x + e.w / 2, y: e.y + 3, count: 8 });
  return roll;
}

// ------------------------------------------------------------------------------------------------
// Recipe scroll & repair kit
// ------------------------------------------------------------------------------------------------

/**
 * Reveal a random recipe the player doesn't know (GDD §7 hints): prefers recipes whose result is no
 * more than one tier above the current district. Adds its key to knownRecipes. Returns the key.
 */
export function revealRecipe(world: World, p: PlayerState): string | null {
  const maxTier = tierForDistrict(world.level?.info.district ?? 1) + 1;
  const near: string[] = [];
  const any: string[] = [];
  for (const r of Content.recipeList) {
    const key = recipeKey(r.a, r.b);
    if (p.knownRecipes.includes(key) || any.includes(key)) continue;
    any.push(key);
    if ((Content.items.get(r.result)?.tier ?? 1) <= maxTier) near.push(key);
  }
  const pool = near.length ? near : any;
  if (pool.length === 0) return null;
  const key = world.rng.pick(pool);
  p.knownRecipes.push(key);
  p.runStats.recipesRevealed = (p.runStats.recipesRevealed ?? 0) + 1;
  const r = Content.recipes.get(key);
  if (r) {
    const n = (id: string) => Content.items.get(id)?.name ?? id;
    say(world, p, `Learned: ${n(r.a)} + ${n(r.b)} = ${n(r.result)}`, INFO);
  }
  return key;
}

export interface WornRef {
  stack: ItemStack;
  max: number;
}

/** The most worn durable item (equipment first, then inventory), or null if nothing is damaged. */
export function mostWorn(p: PlayerState): WornRef | null {
  let best: WornRef | null = null;
  let bestFrac = 1;
  const consider = (s: ItemStack | null) => {
    if (!s || s.durability === undefined) return;
    const max = Content.items.get(s.id)?.durability;
    if (!max || s.durability >= max) return;
    const f = s.durability / max;
    if (f < bestFrac) {
      bestFrac = f;
      best = { stack: s, max };
    }
  };
  for (const s of Object.values(p.equipment)) consider(s);
  for (const s of p.inventory) consider(s);
  return best;
}

/** Repair kits restore this fraction of max durability. */
export const KIT_REPAIR = 0.5;

/** Restore part of a stack's durability; returns points restored. */
export function restoreDurability(stack: ItemStack, frac: number): number {
  const max = Content.items.get(stack.id)?.durability;
  if (!max || stack.durability === undefined) return 0;
  const before = stack.durability;
  stack.durability = Math.min(max, stack.durability + Math.ceil(max * frac));
  return stack.durability - before;
}

// ------------------------------------------------------------------------------------------------
// Consuming
// ------------------------------------------------------------------------------------------------

/** Is this item "just food" (refused at full hunger)? */
function foodOnly(def: ItemDef): boolean {
  const c = def.consume;
  if (!c) return true;
  return !!c.food && !c.heal && !c.mana && !c.stamina && !c.status?.length && !c.permanent && !c.special;
}

function hasSpecial(p: PlayerState, s: string): boolean {
  return p.specials.includes(s);
}

/**
 * Apply an item's ConsumeEffect (+ race/hat specials). Returns false (nothing consumed) when it is
 * refused: food at full hunger, a scroll with nothing left to learn, a repair kit with nothing worn.
 * `eats_anything` (boarfolk) lets any material be eaten for +1 food.
 */
export function applyConsume(world: World, p: PlayerState, e: Entity, def: ItemDef): boolean {
  const c = def.consume;
  const omnivore = hasSpecial(p, 'eats_anything');
  if (!c) {
    if (!(omnivore && def.category === 'material')) return false;
    if (p.hunger >= p.stats.maxHunger) return refuse(world, p, "You're full.");
    p.hunger = Math.min(p.stats.maxHunger, p.hunger + 1);
    return true;
  }
  const isFood = !!def.tags?.includes('food');
  if (foodOnly(def) && c.food && p.hunger >= p.stats.maxHunger && !(def.id === 'herb' && hasSpecial(p, 'herb_heal'))) {
    return refuse(world, p, "You're full.");
  }
  // Specials that can refuse go first so nothing else is applied on refusal.
  if (c.special === 'reveal_recipe') {
    if (!revealRecipe(world, p)) return refuse(world, p, 'You already know every recipe.');
  } else if (c.special === 'repair') {
    const w = mostWorn(p);
    if (!w) return refuse(world, p, 'Nothing needs repairing.');
    restoreDurability(w.stack, KIT_REPAIR);
    say(world, p, `Repaired ${Content.items.get(w.stack.id)?.name ?? w.stack.id}.`, INFO);
    world.emit({ type: 'sfx', id: 'repair', x: e.x + e.w / 2, y: e.y });
  }
  let heal = c.heal ?? 0;
  if (def.id === 'herb' && hasSpecial(p, 'herb_heal')) heal += 1;
  if (def.id === 'glowcap' && hasSpecial(p, 'shroom_heal')) heal += 1;
  if (heal > 0) healEntity(world, e, heal);
  if (c.mana) p.mana = Math.max(0, Math.min(p.stats.maxMana, p.mana + c.mana));
  if (c.food) p.hunger = Math.max(0, Math.min(p.stats.maxHunger, p.hunger + c.food + (omnivore && isFood ? 1 : 0)));
  if (c.stamina) p.stamina = Math.max(0, Math.min(p.stats.maxStamina, p.stamina + c.stamina));
  for (const s of c.status ?? []) {
    if (s.chance < 1 && !world.rng.chance(s.chance)) continue;
    giveStatus(e, s.id, secs(s.duration), s.power ?? 1, e.id);
  }
  if (c.permanent) applyPermanent(world, p, e, c.permanent);
  switch (c.special) {
    case 'mystery':
      drinkMystery(world, p, e);
      break;
    case 'cleanse':
      e.status = e.status.filter((s) => !HARMFUL.includes(s.id));
      say(world, p, 'You feel clean.', GOOD);
      break;
    case 'full_restore':
      healEntity(world, e, e.maxHp);
      p.mana = p.stats.maxMana;
      p.stamina = p.stats.maxStamina;
      p.hunger = p.stats.maxHunger;
      say(world, p, 'Fully restored!', GOOD);
      break;
    default:
      break;
  }
  if (isFood) p.runStats.foodsEaten = (p.runStats.foodsEaten ?? 0) + 1;
  if (def.tags?.includes('potion')) p.runStats.potionsDrunk = (p.runStats.potionsDrunk ?? 0) + 1;
  return true;
}

function refuse(world: World, p: PlayerState, text: string): false {
  say(world, p, text);
  world.emit({ type: 'sfx', id: 'denied', x: 0, y: 0 });
  return false;
}

/**
 * Inventory click-use: equipables are equipped, consumables are eaten/drunk/read (one unit).
 * Returns true if anything happened. Downed/out players can't use items.
 */
export function useItemFromInventory(world: World, p: PlayerState, slot: number): boolean {
  const stack = p.inventory[slot];
  const def = stack ? Content.items.get(stack.id) : undefined;
  const e = world.get(p.entityId);
  if (!stack || !def || !e || p.downed || p.out) return false;
  if (naturalSlot(def) && def.use !== 'consume') return equipFromInventory(world, p, slot);
  if (!def.consume && !(def.category === 'material' && hasSpecial(p, 'eats_anything'))) return false;
  if (!applyConsume(world, p, e, def)) return false;
  // A repair kit may have repaired itself out of existence? No: kits have no durability. Take one.
  if (p.inventory[slot] === stack) takeFromSlot(p, slot, 1);
  const drink = !!def.tags?.includes('drink');
  const cx = e.x + e.w / 2;
  world.emit({ type: 'sfx', id: drink ? 'drink' : def.tags?.includes('scroll') ? 'scroll' : 'eat', x: cx, y: e.y });
  world.emit({ type: 'particles', preset: drink ? 'drink' : 'eat', x: cx, y: e.y + 3, count: 5 });
  return true;
}
