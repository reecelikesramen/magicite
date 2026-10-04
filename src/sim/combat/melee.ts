import { maybeItem } from '../../content';
import type { DamageType, ItemDef } from '../../content/types';
import { secs } from '../constants';
import type { Entity, MeleeSwing, PlayerState } from '../types';
import type { World } from '../world';
import { applyDamage, combatDef, computeDamage, enemyDamage, killEntity, wearStack } from './damage';
import { hitResource } from './harvest';
import { applyStatuses } from './status';
import { COMBAT, type SwingWeight } from './tuning';

/** Sentinels stored in MeleeSwing.hit (entity ids are ≥ 1): durability already paid / pogo already used. */
export const SWING_WORN = -1;
export const SWING_POGO = -2;

/** Light / normal / heavy, from tags ('light' / 'heavy') or the item's cooldown. Fists are light. */
export function swingWeight(def: ItemDef | undefined): SwingWeight {
  if (!def) return 'light';
  if (def.tags?.includes('heavy')) return 'heavy';
  if (def.tags?.includes('light')) return 'light';
  const cd = def.cooldown ?? COMBAT.defaultCooldown.swing;
  return cd >= COMBAT.melee.heavyFrom ? 'heavy' : cd < COMBAT.melee.lightBelow ? 'light' : 'normal';
}

/** Swing length in ticks for a use cooldown of `cdTicks` (always ≤ the cooldown so swings never overlap). */
export function swingDuration(cdTicks: number): number {
  const m = COMBAT.melee;
  const hi = Math.min(m.maxTicks, Math.max(m.minTicks, cdTicks));
  return Math.max(m.minTicks, Math.min(hi, Math.round(cdTicks * m.durationFrac)));
}

/** Windup ticks for a swing of `total` ticks (pure in def + total, so clients/renderers derive it too). */
export function swingWindup(def: ItemDef | undefined, total: number): number {
  return Math.round(total * COMBAT.melee.arc[swingWeight(def)].windup);
}

/** Active (hitting) ticks after the windup. Frames processed are elapsed = 1 … total-1. */
export function swingActive(def: ItemDef | undefined, total: number): number {
  const w = swingWindup(def, total);
  return Math.max(2, Math.min(total - 1 - w, Math.round(total * COMBAT.melee.arc[swingWeight(def)].active)));
}

export type SwingPhase = 'windup' | 'active' | 'recovery';

export function swingPhase(s: MeleeSwing): SwingPhase {
  const def = maybeItem(s.item);
  const elapsed = s.total - s.ticks;
  const w = swingWindup(def, s.total);
  if (elapsed <= w) return 'windup';
  return elapsed <= w + swingActive(def, s.total) ? 'active' : 'recovery';
}

export function isThrust(def: ItemDef | undefined): boolean {
  return def?.use === 'thrust';
}

/** Reach from the attacker's centre along `angle`: weapon range + the attacker's half-extent that way. */
export function swingReach(e: Entity, def: ItemDef | undefined, angle: number): number {
  const range = def ? (def.range ?? COMBAT.melee.defaultRange) : COMBAT.fist.range;
  return range + Math.abs(Math.cos(angle)) * (e.w / 2) + Math.abs(Math.sin(angle)) * (e.h / 2);
}

/**
 * Blade angle at `elapsed` ticks. Swings sweep from overhead/behind (aim − facing·up) through the aim
 * to below it (aim + facing·down), like the original's overhead-to-front arc. Thrusts hold the aim angle.
 */
export function bladeAngle(s: MeleeSwing, def: ItemDef | undefined, facing: number, elapsed: number): number {
  if (isThrust(def)) return s.angle;
  const arc = COMBAT.melee.arc[swingWeight(def)];
  const w = swingWindup(def, s.total);
  const a = swingActive(def, s.total);
  const t = Math.max(0, Math.min(1, (elapsed - w) / a));
  const start = s.angle - facing * arc.up;
  const end = s.angle + facing * arc.down;
  return start + (end - start) * t;
}

/** Thrust extension 0..1 over the active frames (quick jab out, held to the end). */
function thrustExtent(def: ItemDef | undefined, s: MeleeSwing, elapsed: number): number {
  const w = swingWindup(def, s.total);
  const a = swingActive(def, s.total);
  const t = Math.max(0, Math.min(1, ((elapsed - w) / a) * 1.8));
  return COMBAT.melee.thrustStart + (1 - COMBAT.melee.thrustStart) * t;
}

/** Segment (x0,y0)→(x1,y1) vs rect expanded by `pad` (slab test, allocation-free). */
function segmentHitsRect(x0: number, y0: number, x1: number, y1: number, t: Entity, pad: number): boolean {
  const rx0 = t.x - pad;
  const ry0 = t.y - pad;
  const rx1 = t.x + t.w + pad;
  const ry1 = t.y + t.h + pad;
  let lo = 0;
  let hi = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < rx0 || x0 > rx1) return false;
  } else {
    const ta = (rx0 - x0) / dx;
    const tb = (rx1 - x0) / dx;
    lo = Math.max(lo, Math.min(ta, tb));
    hi = Math.min(hi, Math.max(ta, tb));
    if (lo > hi) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y0 < ry0 || y0 > ry1) return false;
  } else {
    const ta = (ry0 - y0) / dy;
    const tb = (ry1 - y0) / dy;
    lo = Math.max(lo, Math.min(ta, tb));
    hi = Math.min(hi, Math.max(ta, tb));
    if (lo > hi) return false;
  }
  return true;
}

/** Does the blade, swept from angle a0 to a1 this tick, touch `t`? */
function bladeSweepHits(e: Entity, def: ItemDef | undefined, ext: number, a0: number, a1: number, t: Entity, pad: number): boolean {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const r0 = COMBAT.melee.innerRadius;
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / COMBAT.melee.angleStep));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r1 = swingReach(e, def, a) * ext;
    if (segmentHitsRect(cx + c * r0, cy + s * r0, cx + c * r1, cy + s * r1, t, pad)) return true;
  }
  return false;
}

/** Valid melee targets: players hit enemies/bosses/resources/enemy projectiles; enemies hit players. */
function isMeleeTarget(world: World, attacker: Entity, t: Entity): boolean {
  if (attacker.team === 'player') {
    if (t.kind === 'enemy' || t.kind === 'boss') return t.team !== 'player';
    if (t.kind === 'resource') return attacker.kind === 'player';
    return t.kind === 'projectile' && t.projectile?.team === 'enemy';
  }
  if (attacker.team === 'enemy' && t.kind === 'player') {
    const p = world.players[t.playerIndex ?? -1];
    return !!p && !p.downed && !p.out;
  }
  return false;
}

/** Freeze the world briefly on heavy hits (scaled down in co-op since it pauses everyone). */
export function hitstop(world: World, ticks: number): void {
  const n = world.activePlayers().length > 1 ? Math.round(ticks * COMBAT.hitstop.coopScale) : ticks;
  if (n <= 0) return;
  if (n > world.freeze) world.freeze = n;
  world.emit({ type: 'hitstop', ticks: n });
}

function payDurability(world: World, p: PlayerState | undefined, s: MeleeSwing): void {
  if (!p || s.hit.includes(SWING_WORN)) return;
  s.hit.push(SWING_WORN);
  if (p.inventory[p.selected]?.id === s.item) wearStack(world, p, { inv: p.selected });
}

function hitCombatant(world: World, e: Entity, p: PlayerState | undefined, def: ItemDef | undefined, t: Entity, angle: number): void {
  const type: DamageType = def?.damageType ?? combatDef(e)?.damageType ?? 'physical';
  const weight = swingWeight(def);
  let amount: number;
  let crit = false;
  if (p) {
    const roll = def
      ? computeDamage(world, p, def, def.damage ?? 0, type, { attacker: e, stat: 'atk' })
      : computeDamage(world, p, null, COMBAT.fist.damage, type, { attacker: e, stat: 'atk', statMul: COMBAT.fist.statMul });
    amount = roll.amount;
    crit = roll.crit;
  } else {
    amount = enemyDamage(world, e, def?.damage ?? combatDef(e)?.damage ?? 1);
  }
  const kb = (def?.knockback ?? COMBAT.melee.defaultKnockback) * (weight === 'heavy' ? 1.3 : 1);
  const dir = Math.sign(t.x + t.w / 2 - (e.x + e.w / 2)) || e.facing;
  const dealt = applyDamage(world, t, amount, { source: e, knockback: kb, type, crit, dir, ignoreIframes: !!p });
  if (dealt <= 0) return;
  const hx = e.x + e.w / 2 + Math.cos(angle) * Math.min(swingReach(e, def, angle), Math.abs(t.x + t.w / 2 - (e.x + e.w / 2)) + 2);
  world.emit({ type: 'particles', preset: crit ? 'hit_crit' : 'hit', x: hx, y: t.y + t.h / 2, count: crit ? 8 : 4, dirX: dir });
  applyStatuses(world, t, p ? def?.onHit : combatDef(e)?.onHit, e);
  if (t.dead) hitstop(world, t.kind === 'boss' ? COMBAT.hitstop.bossKill : COMBAT.hitstop.kill);
  else if (weight === 'heavy') hitstop(world, COMBAT.hitstop.heavy);
  else if (crit) hitstop(world, COMBAT.hitstop.crit);
  if (weight === 'heavy' || crit) world.emit({ type: 'shake', amount: weight === 'heavy' ? 2 : 1, ticks: 6 });
}

function deflect(world: World, e: Entity, t: Entity): void {
  world.emit({ type: 'particles', preset: 'deflect', x: t.x + t.w / 2, y: t.y + t.h / 2, count: 5, dirX: e.facing });
  world.emit({ type: 'sfx', id: 'deflect', x: t.x, y: t.y });
  killEntity(world, t);
}

/** Resolve one swing for the current tick. */
function resolveSwing(world: World, e: Entity, s: MeleeSwing): void {
  const def = maybeItem(s.item);
  const elapsed = s.total - s.ticks;
  const w = swingWindup(def, s.total);
  const a = swingActive(def, s.total);
  if (elapsed <= w || elapsed > w + a) return;
  const p = e.kind === 'player' ? world.players[e.playerIndex ?? -1] : undefined;
  if (p && (p.downed || p.out)) return;
  const thrust = isThrust(def);
  const a0 = thrust ? s.angle : bladeAngle(s, def, e.facing, elapsed - 1);
  const a1 = thrust ? s.angle : bladeAngle(s, def, e.facing, elapsed);
  const ext = thrust ? thrustExtent(def, s, elapsed) : 1;
  const pad = (thrust ? COMBAT.melee.thrustThickness : COMBAT.melee.arc[swingWeight(def)].thickness) / 2;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const maxReach = swingReach(e, def, 0) + swingReach(e, def, Math.PI / 2);
  for (const t of world.entities) {
    if (t === e || t.dead || !isMeleeTarget(world, e, t) || s.hit.includes(t.id)) continue;
    const dx = t.x + t.w / 2 - cx;
    const dy = t.y + t.h / 2 - cy;
    const rr = maxReach + t.w + t.h;
    if (dx * dx + dy * dy > rr * rr) continue;
    if (!bladeSweepHits(e, def, ext, a0, a1, t, pad)) continue;
    s.hit.push(t.id);
    if (t.kind === 'resource') {
      if (hitResource(world, e, t, def)) payDurability(world, p, s);
      continue;
    }
    if (t.kind === 'projectile') {
      deflect(world, e, t);
      continue;
    }
    hitCombatant(world, e, p, def, t, a1);
    payDurability(world, p, s);
    // Pogo: a downward strike in the air bounces the attacker (and refunds the air jump).
    if (p && !e.onGround && Math.sin(s.angle) > 0.7 && !s.hit.includes(SWING_POGO)) {
      s.hit.push(SWING_POGO);
      e.vy = -COMBAT.melee.pogoSpeed;
      p.ctl.airJumpsUsed = 0;
      world.emit({ type: 'particles', preset: 'pogo', x: cx, y: e.y + e.h, count: 5 });
    }
  }
}

/**
 * Enemies/bosses `e`'s swing touches this tick, with no side effects (no damage, no `s.hit`
 * bookkeeping). Net clients use it to play hit feedback at once instead of waiting a round trip.
 */
export function swingContacts(world: World, e: Entity, s: MeleeSwing, out: Entity[]): Entity[] {
  out.length = 0;
  const def = maybeItem(s.item);
  const elapsed = s.total - s.ticks;
  const w = swingWindup(def, s.total);
  const a = swingActive(def, s.total);
  if (elapsed <= w || elapsed > w + a) return out;
  const thrust = isThrust(def);
  const a0 = thrust ? s.angle : bladeAngle(s, def, e.facing, elapsed - 1);
  const a1 = thrust ? s.angle : bladeAngle(s, def, e.facing, elapsed);
  const ext = thrust ? thrustExtent(def, s, elapsed) : 1;
  const pad = (thrust ? COMBAT.melee.thrustThickness : COMBAT.melee.arc[swingWeight(def)].thickness) / 2;
  for (const t of world.entities) {
    if (t === e || t.dead || (t.kind !== 'enemy' && t.kind !== 'boss') || !isMeleeTarget(world, e, t)) continue;
    if (bladeSweepHits(e, def, ext, a0, a1, t, pad)) out.push(t);
  }
  return out;
}

/** Advances active swings (windup → active → recovery) and resolves hits during active frames. */
export function meleeSystem(world: World): void {
  if (world.freeze > 0) return;
  for (const e of world.entities) {
    const s = e.swing;
    if (!s) continue;
    if (e.dead) {
      e.swing = undefined;
      continue;
    }
    s.ticks--;
    if (s.ticks <= 0) {
      e.swing = undefined;
      continue;
    }
    resolveSwing(world, e, s);
  }
}

/** Start a melee swing/thrust on an entity (players via use.ts; AI may call this for armed enemies). */
export function startSwing(e: Entity, item: string, angle: number, cooldownTicks: number): MeleeSwing {
  const total = swingDuration(cooldownTicks);
  const s: MeleeSwing = { ticks: total, total, angle, hit: [], item };
  e.swing = s;
  return s;
}

/** Swing duration for an item at its base cooldown (handy for AI / tests). */
export function baseSwingTicks(def: ItemDef | undefined): number {
  return swingDuration(secs(def?.cooldown ?? COMBAT.fist.cooldown));
}
