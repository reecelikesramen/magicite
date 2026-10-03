import { Content, maybeItem } from '../../content';
import type { ItemDef, UseStyle } from '../../content/types';
import { secs, TILE } from '../constants';
import { pressed } from '../player/controller';
import type { Entity, ItemStack, PlayerInput, PlayerState } from '../types';
import type { World } from '../world';
import { consumeFromSlot, placeFromSlot, takeOne } from './consume';
import { computeDamage, wearStack } from './damage';
import { mineTile } from './harvest';
import { startSwing, swingWeight, SWING_WORN } from './melee';
import { fireProjectile, projDef } from './projectiles';
import { isDisabled } from './status';
import { COMBAT } from './tuning';

type ActiveStyle = Exclude<UseStyle, 'none'>;

/** Held fire repeats for melee, bows, spells and placing; consumables and thrown items need a fresh press. Tags 'auto' / 'semi' override. */
export function isAuto(def: ItemDef | undefined): boolean {
  if (!def) return true;
  if (def.tags?.includes('auto')) return true;
  if (def.tags?.includes('semi')) return false;
  switch (def.use) {
    case 'consume':
    case 'throw':
      return false;
    default:
      return true;
  }
}

/** Use cooldown in ticks. Weapon styles are sped up by StatMods.attackSpeed (0.25 = 25% faster). */
export function useCooldownTicks(p: PlayerState, def: ItemDef | undefined, style: ActiveStyle | 'fist'): number {
  const base = style === 'fist' ? COMBAT.fist.cooldown : (def?.cooldown ?? COMBAT.defaultCooldown[style]);
  const scaled = style === 'consume' || style === 'place' ? 1 : Math.max(0.25, 1 + (p.mods.attackSpeed ?? 0));
  return Math.max(4, Math.round(secs(base) / scaled));
}

/** Snap an angle to the nearest of 8 directions. */
export function snap8(angle: number): number {
  return Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
}

/** ItemDef.range on ranged items is a projectile speed scale when it's a small number (≤ 4); otherwise ignored. */
function rangedSpeedMul(def: ItemDef): number {
  return def.range !== undefined && def.range > 0 && def.range <= 4 ? def.range : 1;
}

export interface AmmoRef {
  /** Inventory index, or -1 for the equipped ammo slot. */
  slot: number;
  stack: ItemStack;
  def: ItemDef;
}

function ammoMatches(def: ItemDef | undefined, ammoType: string): def is ItemDef {
  return !!def && (def.ammoKind === ammoType || (def.ammoKind === undefined && def.category === 'ammo' && def.id === ammoType));
}

/** Ammo for a weapon: the equipped ammo slot first, then the inventory (hotbar → backpack). */
export function findAmmo(p: PlayerState, ammoType: string | undefined): AmmoRef | null {
  if (!ammoType) return null;
  const eq = p.equipment.ammo;
  const eqDef = maybeItem(eq?.id);
  if (eq && eq.count > 0 && ammoMatches(eqDef, ammoType)) return { slot: -1, stack: eq, def: eqDef };
  for (let i = 0; i < p.inventory.length; i++) {
    const s = p.inventory[i];
    if (!s || s.count <= 0) continue;
    const d = maybeItem(s.id);
    if (ammoMatches(d, ammoType)) return { slot: i, stack: s, def: d };
  }
  return null;
}

function spendAmmo(p: PlayerState, a: AmmoRef): void {
  if (a.slot >= 0) takeOne(p, a.slot);
  else {
    a.stack.count--;
    if (a.stack.count <= 0) p.equipment.ammo = null;
  }
}

/** Spawn point for shots: a few px toward the aim, or the centre if that point is inside rock. */
function muzzle(world: World, e: Entity, angle: number, out: { x: number; y: number }): void {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const mx = cx + Math.cos(angle) * COMBAT.muzzle;
  const my = cy + Math.sin(angle) * COMBAT.muzzle;
  const solid = world.level.grid.solidAt(mx, my);
  out.x = solid ? cx : mx;
  out.y = solid ? cy : my;
}

const mz = { x: 0, y: 0 };

function fail(world: World, p: PlayerState, e: Entity, press: boolean, text: string, sfx: string): void {
  p.useCooldown = secs(COMBAT.failCooldown);
  if (!press) return;
  world.emit({ type: 'message', text, player: p.index });
  world.emit({ type: 'sfx', id: sfx, x: e.x + e.w / 2, y: e.y });
}

function useMelee(world: World, p: PlayerState, e: Entity, def: ItemDef | undefined, angle: number, input: PlayerInput): void {
  const style = def?.use === 'thrust' ? 'thrust' : def?.use === 'swing' ? 'swing' : 'fist';
  const cd = useCooldownTicks(p, def, style);
  const s = startSwing(e, def?.use === 'swing' || def?.use === 'thrust' ? def.id : '', snap8(angle), cd);
  p.useCooldown = cd;
  const heavy = swingWeight(def) === 'heavy';
  world.emit({ type: 'sfx', id: style === 'thrust' ? 'thrust' : heavy ? 'swing_heavy' : 'swing', x: e.x + e.w / 2, y: e.y });
  if (def?.tool) {
    const r = mineTile(world, p, e, def, input.aimX, input.aimY);
    if (r === 'hit' || r === 'broken') {
      s.hit.push(SWING_WORN);
      wearStack(world, p, { inv: p.selected });
    }
  }
}

function useShoot(world: World, p: PlayerState, e: Entity, def: ItemDef, angle: number, press: boolean): void {
  const ammo = findAmmo(p, def.ammoType);
  if (!ammo) {
    fail(world, p, e, press, `Out of ${def.ammoType ?? 'ammo'}!`, 'empty');
    return;
  }
  const projId = ammo.def.projectile && Content.projectiles.has(ammo.def.projectile) ? ammo.def.projectile : def.projectile;
  if (!projId || !projDef(projId)) return;
  spendAmmo(p, ammo);
  const type = def.damageType ?? projDef(projId)!.damageType;
  const roll = computeDamage(world, p, def, (def.damage ?? 0) + (ammo.def.damage ?? 0), type, { attacker: e, stat: 'dex', noCrit: true });
  muzzle(world, e, angle, mz);
  fireProjectile(world, e, projId, mz.x, mz.y, angle, { damage: roll.amount, speedMul: rangedSpeedMul(def), sourceItem: ammo.def.id });
  p.useCooldown = useCooldownTicks(p, def, 'shoot');
  world.emit({ type: 'sfx', id: projId === 'bolt' ? 'shoot_crossbow' : 'shoot_bow', x: mz.x, y: mz.y });
  wearStack(world, p, { inv: p.selected });
}

function useCast(world: World, p: PlayerState, e: Entity, def: ItemDef, angle: number, input: PlayerInput, press: boolean): void {
  const pd = def.projectile ? projDef(def.projectile) : undefined;
  if (!pd) return;
  const cost = def.manaCost ?? 1;
  if (p.mana < cost) {
    fail(world, p, e, press, 'Not enough mana', 'fizzle');
    world.emit({ type: 'particles', preset: 'fizzle', x: e.x + e.w / 2, y: e.y + e.h / 2, count: 3 });
    return;
  }
  p.mana -= cost;
  const roll = computeDamage(world, p, def, def.damage ?? 0, def.damageType ?? pd.damageType, { attacker: e, stat: 'mag', noCrit: true });
  const opts = { damage: roll.amount, speedMul: rangedSpeedMul(def), sourceItem: def.id };
  if (pd.fromAbove) {
    // Strikes the aim point (horizontally limited to ~12 tiles).
    const cx = e.x + e.w / 2;
    const tx = cx + Math.max(-12 * TILE, Math.min(12 * TILE, input.aimX - cx));
    fireProjectile(world, e, pd.id, tx, input.aimY, Math.PI / 2, opts);
  } else {
    muzzle(world, e, angle, mz);
    fireProjectile(world, e, pd.id, mz.x, mz.y, angle, opts);
  }
  p.useCooldown = useCooldownTicks(p, def, 'cast');
  world.emit({ type: 'sfx', id: 'cast', x: e.x + e.w / 2, y: e.y });
  world.emit({ type: 'particles', preset: 'cast', x: e.x + e.w / 2 + e.facing * 4, y: e.y + e.h / 2, count: 4 });
  wearStack(world, p, { inv: p.selected });
}

function useThrow(world: World, p: PlayerState, e: Entity, def: ItemDef, angle: number, input: PlayerInput): void {
  const pd = def.projectile ? projDef(def.projectile) : undefined;
  if (!pd) return;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  // Throw strength follows the aim distance; a little loft makes lobs land near the cursor.
  const d = Math.hypot(input.aimX - cx, input.aimY - cy);
  const power = Math.max(COMBAT.throwPower.min, Math.min(1, d / COMBAT.throwPower.fullAt));
  const loft = pd.gravity > 0 ? (Math.cos(angle) >= 0 ? -0.12 : 0.12) : 0;
  const roll = computeDamage(world, p, def, def.damage ?? 0, def.damageType ?? pd.damageType, { attacker: e, stat: 'dex', noCrit: true });
  takeOne(p, p.selected);
  muzzle(world, e, angle, mz);
  fireProjectile(world, e, pd.id, mz.x, mz.y, angle + loft, { damage: roll.amount, speedMul: power * rangedSpeedMul(def), sourceItem: def.id });
  p.useCooldown = useCooldownTicks(p, def, 'throw');
  world.emit({ type: 'sfx', id: 'throw', x: cx, y: cy });
}

/** Use the held item once (the dispatcher behind the attack button). */
export function useHeld(world: World, p: PlayerState, e: Entity, input: PlayerInput, press: boolean): void {
  const def = maybeItem(p.inventory[p.selected]?.id);
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const dx = input.aimX - cx;
  const dy = input.aimY - cy;
  const angle = dx * dx + dy * dy < 4 ? (e.facing > 0 ? 0 : Math.PI) : Math.atan2(dy, dx);
  const c = Math.cos(angle);
  if (Math.abs(c) > 0.2) e.facing = c >= 0 ? 1 : -1;
  switch (def?.use) {
    case 'swing':
    case 'thrust':
      useMelee(world, p, e, def, angle, input);
      return;
    case 'shoot':
      useShoot(world, p, e, def, angle, press);
      return;
    case 'cast':
      useCast(world, p, e, def, angle, input, press);
      return;
    case 'throw':
      useThrow(world, p, e, def, angle, input);
      return;
    case 'consume':
      if (consumeFromSlot(world, p, p.selected)) p.useCooldown = useCooldownTicks(p, def, 'consume');
      return;
    case 'place':
      if (placeFromSlot(world, p, e, p.selected, input.aimX, input.aimY)) p.useCooldown = useCooldownTicks(p, def, 'place');
      else p.useCooldown = 4;
      return;
    default:
      // Empty hand / materials: a quick punch (also harvests 'hand' resources like plants).
      useMelee(world, p, e, undefined, angle, input);
  }
}

/**
 * Item use (GDD §6): the attack button uses the selected hotbar item — swing/thrust (melee + tile mining),
 * shoot (ammo, DEX), cast (mana, MAG), throw (consumes the item), consume, place. Held attack repeats
 * for auto items; cooldowns scale with attack speed. Frozen/stunned/downed players can't act.
 */
export function playerActionSystem(world: World): void {
  if (world.freeze > 0) return;
  for (const p of world.players) {
    const e = world.get(p.entityId);
    if (!e || e.dead) continue;
    if (p.useCooldown > 0) p.useCooldown--;
    const stack = p.inventory[p.selected];
    e.held = stack ? stack.id : undefined;
    if (p.downed || p.out || isDisabled(e)) continue;
    const input = world.inputs[p.index];
    if (!input?.attack || p.useCooldown > 0) continue;
    const press = pressed(p, input, 'attack');
    if (!press && !isAuto(maybeItem(stack?.id))) continue;
    useHeld(world, p, e, input, press);
  }
}
