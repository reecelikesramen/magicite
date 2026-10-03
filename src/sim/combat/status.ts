import type { DamageType, StatusApply, StatusId } from '../../content/types';
import { secs } from '../constants';
import type { Entity, StatusEffect } from '../types';
import type { World } from '../world';
import { applyDamage, combatDef } from './damage';
import { heal } from './vitals';

interface StatusRule {
  /** Power used when a StatusApply has none (DoT/HoT per interval, slow/haste/weak fraction, shield HP). */
  power: number;
  /** DoT / HoT interval in ticks (0 = no periodic effect). */
  every: number;
  dot?: DamageType;
  hot?: boolean;
  /** Freezes AI and player controls. */
  disables?: boolean;
  /** Removed by cleansing effects. */
  harmful: boolean;
}

/**
 * Status effect rules. `StatusEffect.power` meaning per id:
 * burn/poison/bleed = damage per interval · regen = HP per interval · slow = speed fraction removed ·
 * haste = speed fraction added · weak = damage-dealt fraction removed · shield = HP absorbed.
 */
export const STATUS_RULES: Readonly<Record<StatusId, StatusRule>> = {
  burn: { power: 1, every: 60, dot: 'fire', harmful: true },
  poison: { power: 1, every: 60, dot: 'poison', harmful: true },
  bleed: { power: 1, every: 45, dot: 'physical', harmful: true },
  freeze: { power: 0, every: 0, disables: true, harmful: true },
  stun: { power: 0, every: 0, disables: true, harmful: true },
  slow: { power: 0.45, every: 0, harmful: true },
  haste: { power: 0.35, every: 0, harmful: false },
  regen: { power: 1, every: 60, hot: true, harmful: false },
  shield: { power: 2, every: 0, harmful: false },
  weak: { power: 0.4, every: 0, harmful: true },
};

export const STATUS = {
  /** Bosses shrug off freeze/stun: durations are scaled by this (min `bossDisableMin` ticks). */
  bossDisableScale: 0.25,
  bossDisableMin: 6,
  /** Slow can't take an entity below this speed fraction. */
  minSlowMul: 0.15,
  /** Ticks between ambient status particle bursts. */
  particleEvery: 20,
} as const;

/** True if the entity can never receive this status (race specials, enemy tags, element affinity). */
export function statusImmune(world: World, e: Entity, id: StatusId): boolean {
  switch (e.kind) {
    case 'player': {
      const p = world.players[e.playerIndex ?? -1];
      return !!p && p.specials.includes(`${id}_immune`);
    }
    case 'enemy':
    case 'boss': {
      const def = combatDef(e);
      if (!def) return false;
      if (def.tags?.includes(`immune_${id}`)) return true;
      if (id === 'burn') return def.damageType === 'fire';
      if (id === 'freeze') return def.damageType === 'ice';
      if (id === 'poison') return def.damageType === 'poison';
      return false;
    }
    case 'npc':
    case 'companion':
      return false;
    default:
      return true; // resources, pickups, projectiles, props, effects
  }
}

/** Roll `s.chance` with world.rng (no draw when chance is 0 or ≥ 1) and apply. Returns true if applied. */
export function applyStatus(world: World, e: Entity, s: StatusApply, source?: Entity | number): boolean {
  if (e.dead) return false;
  if (!(s.chance >= 1) && !(s.chance > 0 && world.rng.next() < s.chance)) return false;
  const src = typeof source === 'number' ? source : (source?.id ?? 0);
  return addStatus(world, e, s.id, secs(s.duration), s.power, src);
}

/** Apply a list of StatusApply (e.g. an item's or enemy's onHit). Returns how many applied. */
export function applyStatuses(world: World, e: Entity, list: readonly StatusApply[] | undefined, source?: Entity | number): number {
  if (!list) return 0;
  let n = 0;
  for (const s of list) if (applyStatus(world, e, s, source)) n++;
  return n;
}

/**
 * New remaining ticks when a periodic status (DoT/HoT, which fires when `ticks % every === 0`) is
 * refreshed to `want`: the extension is rounded to whole intervals so the phase is kept. A plain
 * `max(old, want)` would reset the phase on every refresh, and a status re-applied faster than its
 * interval (a fire sword hitting every 0.4 s, standing in flames) would never tick at all.
 */
function refreshedTicks(cur: number, want: number, every: number): number {
  if (want <= cur) return cur;
  if (every <= 0) return want;
  return cur + Math.round((want - cur) / every) * every;
}

/**
 * Add (or refresh) a status without a chance roll. Re-applying refreshes: duration and power take the
 * max of old and new (statuses never stack multiplicatively; DoT/HoT keep their tick phase, see
 * refreshedTicks). Returns true if applied.
 */
export function addStatus(world: World, e: Entity, id: StatusId, ticks: number, power?: number, source = 0): boolean {
  if (e.dead || ticks <= 0 || statusImmune(world, e, id)) return false;
  const rule = STATUS_RULES[id];
  if (rule.disables && e.kind === 'boss') ticks = Math.max(STATUS.bossDisableMin, Math.round(ticks * STATUS.bossDisableScale));
  const pw = power ?? rule.power;
  let found = false;
  for (const st of e.status) {
    if (st.id !== id) continue;
    st.ticks = refreshedTicks(st.ticks, ticks, rule.every);
    if (pw > st.power) st.power = pw;
    if (source) st.source = source;
    found = true;
    break;
  }
  if (!found) e.status.push({ id, ticks, power: pw, source });
  if (rule.disables && !found) {
    e.vx = 0;
    if (e.gravityScale === 0) e.vy = 0;
  }
  world.emit({ type: 'particles', preset: `status_${id}`, x: e.x + e.w / 2, y: e.y + e.h / 2, count: 6 });
  return true;
}

export function statusOf(e: Entity, id: StatusId): StatusEffect | undefined {
  for (const s of e.status) if (s.id === id) return s;
  return undefined;
}

export function hasStatus(e: Entity, id: StatusId): boolean {
  for (const s of e.status) if (s.id === id) return true;
  return false;
}

/** Frozen or stunned: AI must idle and player controls/item use are ignored. */
export function isDisabled(e: Entity): boolean {
  for (const s of e.status) if (s.id === 'freeze' || s.id === 'stun') return true;
  return false;
}

/**
 * Movement speed multiplier from statuses (slow/haste; 0 while disabled). Controllers and AI multiply
 * their target speeds by this.
 */
export function speedMul(e: Entity): number {
  let m = 1;
  for (const s of e.status) {
    if (s.id === 'freeze' || s.id === 'stun') return 0;
    if (s.id === 'slow') m *= Math.max(STATUS.minSlowMul, 1 - s.power);
    else if (s.id === 'haste') m *= 1 + s.power;
  }
  return m;
}

/** Outgoing damage multiplier from statuses (weak). */
export function damageDealtMul(e: Entity | undefined): number {
  if (!e) return 1;
  let m = 1;
  for (const s of e.status) if (s.id === 'weak') m *= Math.max(0, 1 - s.power);
  return m;
}

/** Soak damage with a shield status. Returns the damage left over (shield removed when spent). */
export function absorbShield(e: Entity, dmg: number): number {
  for (let i = 0; i < e.status.length; i++) {
    const s = e.status[i]!;
    if (s.id !== 'shield') continue;
    const soak = Math.min(s.power, dmg);
    s.power -= soak;
    if (s.power <= 0) e.status.splice(i, 1);
    return dmg - soak;
  }
  return dmg;
}

/** Remove harmful statuses (or all with `all`). */
export function clearStatuses(e: Entity, all = false): void {
  let w = 0;
  for (const s of e.status) if (!all && !STATUS_RULES[s.id].harmful) e.status[w++] = s;
  e.status.length = w;
}

function tickStatuses(world: World, e: Entity): void {
  if (e.kind === 'player') {
    const p = world.players[e.playerIndex ?? -1];
    if (!p || p.downed || p.out) {
      e.status.length = 0;
      return;
    }
  }
  const list = e.status;
  let w = 0;
  for (let r = 0; r < list.length; r++) {
    const s = list[r]!;
    s.ticks--;
    const rule = STATUS_RULES[s.id];
    if (rule.every > 0 && s.ticks % rule.every === 0) {
      if (rule.dot) applyDamage(world, e, Math.max(1, Math.round(s.power)), { source: world.get(s.source), type: rule.dot, dot: true, knockback: 0 });
      else if (rule.hot) heal(world, e, Math.max(1, Math.round(s.power)));
      if (e.dead || e.status !== list) return;
      if (e.kind === 'player' && world.players[e.playerIndex ?? -1]?.downed) {
        list.length = 0;
        return;
      }
    }
    if (rule.disables && e.kind !== 'player') {
      e.vx = 0;
      if (e.gravityScale === 0) e.vy = 0;
    }
    if (s.ticks > 0 && s.ticks % STATUS.particleEvery === 0) {
      world.emit({ type: 'particles', preset: `status_${s.id}`, x: e.x + e.w / 2, y: e.y + e.h / 2, count: 2 });
    }
    if (s.ticks > 0) list[w++] = s;
  }
  list.length = w;
}

/**
 * Ticks i-frames / hurt flash / resource shake, then every status effect: DoT & HoT on their interval,
 * disabled non-players held still, expiry. Statuses pause during hit-stop.
 */
export function statusSystem(world: World): void {
  const paused = world.freeze > 0;
  for (const e of world.entities) {
    if (e.invuln > 0) e.invuln--;
    if (e.hurt > 0) e.hurt--;
    if (e.resource && e.resource.hitFlash > 0) e.resource.hitFlash--;
    if (paused || e.dead || e.status.length === 0) continue;
    tickStatuses(world, e);
  }
}
