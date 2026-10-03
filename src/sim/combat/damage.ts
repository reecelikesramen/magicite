import { scaleEnemyDamage } from '../progression/difficulty';
import { Content, maybeItem } from '../../content';
import type { BossDef, DamageType, EnemyDef, ItemDef } from '../../content/types';
import { spawnDrops, spawnGold } from '../items/drops';
import { recalcStats } from '../items/stats';
import { grantXp } from '../progression/xp';
import type { Entity, PlayerState } from '../types';
import type { World } from '../world';
import { absorbShield, damageDealtMul, isDisabled } from './status';
import { COMBAT } from './tuning';
import { heal, spendStamina } from './vitals';

export interface HitOpts {
  /** Attacker entity (for knockback direction, kill credit). */
  source?: Entity;
  type?: DamageType;
  knockback?: number;
  /** Override knockback direction (-1/1). */
  dir?: number;
  crit?: boolean;
  /** Invulnerability ticks granted to the target (players get more). */
  iframes?: number;
  /** Damage-over-time tick: ignores i-frames and armour, grants none, no knockback/stagger/shield/block. */
  dot?: boolean;
  /** Can't be blocked with a shield (explosions, hazards). */
  unblockable?: boolean;
  /**
   * Hit even if the target has i-frames (player attacks on enemies: swings/projectiles already hit each
   * target once, so co-op partners and multishot volleys must not cancel each other out).
   */
  ignoreIframes?: boolean;
}

/** Which player stat scales an attack. */
export type ScaleStat = 'atk' | 'dex' | 'mag' | 'none';

export interface DamageRoll {
  amount: number;
  crit: boolean;
  type: DamageType;
}

export interface DamageCalcOpts {
  /** Stat that scales the hit (default: from the item's use style). */
  stat?: ScaleStat;
  /** Fraction of the stat added (default 1). */
  statMul?: number;
  /** The attacking entity (applies its `weak` status). */
  attacker?: Entity;
  /** Disable crits (DoTs, splash). */
  noCrit?: boolean;
}

/** Content def of an enemy/boss entity. */
export function combatDef(e: Entity): EnemyDef | BossDef | undefined {
  if (e.kind === 'enemy') return Content.enemies.get(e.def);
  if (e.kind === 'boss') return Content.bosses.get(e.def);
  return undefined;
}

/** The player behind an entity: itself, or the owner of a projectile / summon / companion. */
export function playerOf(world: World, e: Entity | undefined): PlayerState | undefined {
  if (!e) return undefined;
  if (e.kind === 'player') return world.players[e.playerIndex ?? -1];
  const owner = e.projectile?.owner ?? e.owner;
  if (!owner) return undefined;
  const o = world.get(owner);
  return o?.kind === 'player' ? world.players[o.playerIndex ?? -1] : undefined;
}

/** Which stat scales an item: melee → ATK, bows & thrown → DEX, spells → MAG. */
export function scaleStatFor(item: ItemDef | null | undefined): ScaleStat {
  switch (item?.use) {
    case 'shoot':
    case 'throw':
      return 'dex';
    case 'cast':
      return 'mag';
    default:
      return 'atk';
  }
}

/** Crit chance of a player: (base + LCK) × (1 + StatMods.luck) + StatMods.critChance. */
export function critChance(p: PlayerState): number {
  return (COMBAT.crit.base + COMBAT.crit.perLck * p.stats.lck) * (1 + (p.mods.luck ?? 0)) + (p.mods.critChance ?? 0);
}

/**
 * Damage formula (GDD §6): base (weapon [+ ammo]) + scaling stat, × weak, crit roll (world.rng) for
 * player attackers. Target-side resistances/armour/shields are applied by applyDamage.
 */
export function computeDamage(
  world: World,
  attacker: PlayerState | null | undefined,
  item: ItemDef | null | undefined,
  base: number,
  type: DamageType,
  opts: DamageCalcOpts = {},
): DamageRoll {
  let amount = base;
  if (attacker) {
    const stat = opts.stat ?? scaleStatFor(item);
    if (stat !== 'none') amount += attacker.stats[stat] * (opts.statMul ?? 1);
  }
  amount *= damageDealtMul(opts.attacker);
  let crit = false;
  if (attacker && !opts.noCrit) {
    const chance = critChance(attacker);
    if (chance > 0 && world.rng.next() < chance) crit = true;
  }
  let out = Math.max(1, Math.round(amount));
  if (crit) out = Math.max(out + 1, Math.round(amount * COMBAT.crit.mult));
  return { amount: out, crit, type };
}

/** Outgoing damage for non-player attackers (enemy contact / projectiles): base × weak × difficulty/co-op. */
export function enemyDamage(world: World, e: Entity, base: number): number {
  const scaled = e.kind === 'enemy' || e.kind === 'boss' ? scaleEnemyDamage(world, base) : base;
  return Math.max(1, Math.round(scaled * damageDealtMul(e)));
}

/**
 * Multiplier on damage taken by `target` for a damage type (0 = immune). Players: StatMods.resist.
 * Enemies/bosses: tags `immune_<type>` ×0, `resist_<type>` ×0.5, `weak_<type>` ×1.5, and creatures of an
 * element resist it (×0.5). AI hooks (plain data on `ai.n`): `takenMul` scales everything (boss armour
 * phases, co-op scaling — see partyDamageScale), `invulnerable` > 0 blocks all damage.
 */
export function damageTakenMul(world: World, target: Entity, type: DamageType): number {
  let m = 1;
  if (target.kind === 'player') {
    const p = world.players[target.playerIndex ?? -1];
    const r = p?.mods.resist?.[type] ?? 0;
    m *= 1 - Math.min(1, r);
  } else {
    const def = combatDef(target);
    const tags = def?.tags;
    if (tags) {
      if (tags.includes(`immune_${type}`)) return 0;
      if (tags.includes(`resist_${type}`)) m *= 0.5;
      if (tags.includes(`weak_${type}`)) m *= 1.5;
    }
    if (def && type !== 'physical' && def.damageType === type) m *= 0.5;
  }
  const n = target.ai?.n;
  if (n) {
    if ((n.invulnerable ?? 0) > 0) return 0;
    if (n.takenMul !== undefined) m *= n.takenMul;
  }
  return Math.max(0, m);
}

/** Suggested boss `ai.n.takenMul` for co-op: bosses take less damage per hit with more active players. */
export function partyDamageScale(world: World): number {
  const n = world.activePlayers().length;
  return n <= 1 ? 1 : 1 / (1 + 0.6 * (n - 1));
}

type EquipKey = keyof PlayerState['equipment'];

/** Where the player's shield is (held item first, then equipment), or null. */
function findShield(p: PlayerState): { inv?: number; equip?: EquipKey } | null {
  if (maybeItem(p.inventory[p.selected]?.id)?.tags?.includes('shield')) return { inv: p.selected };
  for (const k of Object.keys(p.equipment) as EquipKey[]) {
    const s = p.equipment[k];
    if (s && maybeItem(s.id)?.tags?.includes('shield')) return { equip: k };
  }
  return null;
}

/**
 * Shield block (GDD §6 extension): holding Secondary with a shield negates a hit coming from the
 * facing side for 1 stamina and wears the shield. Uses this tick's input, so it's deterministic and
 * needs no extra state.
 */
function tryBlock(world: World, p: PlayerState, target: Entity, src: Entity | undefined): boolean {
  const input = world.inputs[p.index];
  if (!input?.alt || !src || isDisabled(target)) return false;
  const shield = findShield(p);
  if (!shield) return false;
  const fromX = src.x + src.w / 2 - (target.x + target.w / 2);
  if (fromX * target.facing < 0) return false; // hit from behind
  if (!spendStamina(p, COMBAT.shield.staminaCost)) return false;
  wearStack(world, p, shield);
  target.invuln = COMBAT.shield.iframes;
  target.vx = -target.facing * COMBAT.shield.knockback;
  const cx = target.x + target.w / 2 + target.facing * 4;
  world.emit({ type: 'particles', preset: 'block', x: cx, y: target.y + target.h / 2, count: 6, dirX: target.facing });
  world.emit({ type: 'sfx', id: 'block', x: cx, y: target.y });
  if (src.kind === 'projectile') world.kill(src);
  else if (src.kind === 'enemy') src.vx = target.facing * COMBAT.shield.knockback * (1 - src.kbResist);
  return true;
}

/** Remove one durability from the stack at inventory index `slot` (or an equipment slot). Breaks at 0. */
export function wearStack(world: World, p: PlayerState, where: { inv?: number; equip?: EquipKey }, amount = 1): void {
  const stack = where.inv !== undefined ? p.inventory[where.inv] : where.equip ? p.equipment[where.equip] : null;
  if (!stack || amount <= 0) return;
  const def = Content.items.get(stack.id);
  // Lazily initialise from an optional ItemDef.durability (items workstream) when the stack has none.
  if (stack.durability === undefined) {
    const max = (def as (ItemDef & { durability?: number }) | undefined)?.durability;
    if (max === undefined) return;
    stack.durability = max;
  }
  if (p.specials.includes('durable') && world.rng.chance(0.5)) return;
  stack.durability -= amount;
  if (stack.durability > 0) return;
  if (where.inv !== undefined) p.inventory[where.inv] = null;
  else if (where.equip) p.equipment[where.equip] = null;
  const e = world.get(p.entityId);
  const x = e ? e.x + e.w / 2 : 0;
  const y = e ? e.y : 0;
  world.emit({ type: 'message', text: `${def?.name ?? stack.id} broke!`, color: 0xff6040, player: p.index });
  world.emit({ type: 'sfx', id: 'item_break', x, y });
  world.emit({ type: 'particles', preset: 'item_break', x, y: y + 4, count: 8 });
  if (where.equip) recalcStats(p, e);
  if (e && where.inv === p.selected) e.held = undefined;
}

/** Armour wears when its wearer is hit. */
function wearArmor(world: World, p: PlayerState): void {
  if (p.equipment.head) wearStack(world, p, { equip: 'head' });
  if (p.equipment.body) wearStack(world, p, { equip: 'body' });
}

/** Deal damage with resistances, shields, armour, i-frames, knockback, events, death → drops/xp. Returns damage dealt. */
export function applyDamage(world: World, target: Entity, amount: number, opts: HitOpts = {}): number {
  if (target.dead || amount <= 0) return 0;
  const dot = !!opts.dot;
  if (!dot && !opts.ignoreIframes && target.invuln > 0) return 0;
  const isPlayer = target.kind === 'player';
  const p = isPlayer ? world.players[target.playerIndex ?? -1] : undefined;
  if (isPlayer && (!p || p.downed || p.out)) return 0;
  const type = opts.type ?? 'physical';
  const src = opts.source;
  const cx = target.x + target.w / 2;

  const mul = damageTakenMul(world, target, type);
  if (mul <= 0) {
    if (!dot) {
      target.invuln = opts.iframes ?? COMBAT.enemyIframes;
      world.emit({ type: 'particles', preset: 'immune', x: cx, y: target.y, count: 3 });
      world.emit({ type: 'sfx', id: 'clink', x: cx, y: target.y });
    }
    return 0;
  }
  if (p && !dot && !opts.unblockable && tryBlock(world, p, target, src)) return 0;

  let dmg = Math.max(1, Math.round(amount * mul - (dot ? 0 : target.armor)));
  if (!dot) {
    dmg = absorbShield(target, dmg);
    if (dmg <= 0) {
      target.invuln = opts.iframes ?? (isPlayer ? COMBAT.playerIframes : COMBAT.enemyIframes);
      world.emit({ type: 'particles', preset: 'status_shield', x: cx, y: target.y + target.h / 2, count: 6 });
      world.emit({ type: 'sfx', id: 'shield_hit', x: cx, y: target.y });
      return 0;
    }
  }
  // Poison never finishes off a player on its own (permadeath is harsh enough).
  if (dot && isPlayer && type === 'poison' && dmg >= target.hp) {
    dmg = target.hp - 1;
    if (dmg <= 0) return 0;
  }

  target.hp -= dmg;
  if (!dot) {
    target.hurt = 10;
    target.invuln = opts.iframes ?? (isPlayer ? COMBAT.playerIframes : COMBAT.enemyIframes);
    const dir = opts.dir ?? (src ? Math.sign(cx - (src.x + src.w / 2)) || 1 : 0);
    const kb = (opts.knockback ?? 60) * (1 - target.kbResist);
    if (kb > 0 && dir !== 0) {
      target.vx = dir * kb;
      target.vy = Math.min(target.vy, -kb * 0.6);
    }
  }
  world.emit({ type: 'damage', target: target.id, amount: dmg, x: cx, y: target.y, crit: !!opts.crit, damageType: type, toPlayer: isPlayer });
  if (!dot) {
    world.emit({ type: 'sfx', id: isPlayer ? 'player_hurt' : opts.crit ? 'crit' : 'hit', x: cx, y: target.y });
    if (isPlayer) world.emit({ type: 'shake', amount: 3, ticks: 8 });
  }

  const attacker = playerOf(world, src);
  if (attacker && !isPlayer) {
    attacker.runStats.damageDealt += dmg;
    const ls = attacker.mods.lifeSteal ?? 0;
    if (ls > 0 && !dot && target.kind !== 'resource') {
      const raw = dmg * ls;
      const whole = Math.floor(raw);
      const healAmt = whole + (world.rng.chance(raw - whole) ? 1 : 0);
      const ae = world.get(attacker.entityId);
      if (ae && healAmt > 0) heal(world, ae, healAmt);
    }
  }
  if (p) {
    p.runStats.damageTaken += dmg;
    if (!dot) wearArmor(world, p);
  }

  if (target.hp <= 0) {
    target.hp = 0;
    if (p) {
      p.downed = true;
      p.reviveProgress = 0;
      world.emit({ type: 'downed', player: p.index });
    } else {
      killEntity(world, target, attacker?.index);
    }
  }
  return dmg;
}

/** Kill a non-player entity: drops, xp, gold, stats, events. */
export function killEntity(world: World, e: Entity, killerPlayer?: number): void {
  if (e.dead) return;
  world.kill(e);
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  world.emit({ type: 'death', entity: e.id, kind: e.kind, def: e.def, x: cx, y: cy });
  if (e.kind === 'enemy' || e.kind === 'boss') {
    const def = combatDef(e);
    if (def) {
      spawnDrops(world, def.drops, cx, cy);
      spawnGold(world, world.rng.int(def.gold[0], def.gold[1]), cx, cy);
      for (const p of world.players) if (!p.out) grantXp(world, p, def.xp);
    }
    const kp = killerPlayer !== undefined ? world.players[killerPlayer] : undefined;
    if (kp) {
      kp.runStats.kills++;
      if (e.kind === 'boss') kp.runStats.bossKills++;
    }
  }
}
