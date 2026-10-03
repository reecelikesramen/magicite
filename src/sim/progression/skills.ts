import { Content } from '../../content';
import type { DamageType, SkillDef } from '../../content/types';
import { approach, rectsOverlap } from '../../engine/math';
import { applyDamage } from '../combat/damage';
import { DT, PHYS, TILE, secs } from '../constants';
import { tileProps } from '../tiles';
import type { AiState, Entity, PlayerInput, PlayerState } from '../types';
import { emptyInput } from '../types';
import type { World } from '../world';
import { addStatus, isActive, isFoe } from './util';

/**
 * Active skills (Z / X / C → PlayerInput.skill 0..2 → p.skillSlots[i]). Activation checks cooldown
 * and mana/stamina, spends them, then runs the effect. Lasting effects (spins, dives, meteors, traps,
 * the hawk…) are plain `effect` entities (def `skill_<id>`, owner = caster entity id, scratch state
 * in `ai`) advanced by `skillEffectSystem`. Damage goes through combat's applyDamage with the caster
 * (or the effect entity, whose `owner` credits the player) as source.
 */

export const SKILL_FX = {
  whirlwind: { ticks: secs(0.75), period: 12, radius: 22, knockback: 90 },
  groundSlam: { radius: 36, diveSpeed: 360, maxDive: secs(1.5), stun: secs(1), knockback: 140 },
  /** Status powers are fractions (combat/status): haste = speed added, weak = damage dealt removed. */
  warCry: { radius: 72, haste: 0.3, weak: 0.4 },
  charge: { speed: 240, ticks: 14, knockback: 220 },
  cleave: { reach: 30, knockback: 160, bleed: secs(3) },
  fireBurst: { speed: 150 },
  frostNova: { radius: 44 },
  chain: { aimRange: 40, firstRange: 96, jumpRange: 56, stun: secs(0.3) },
  blink: { step: 2, iframes: 10 },
  meteor: { fall: 0.6, speed: 260, radius: 34, maxRange: 160, burn: secs(3) },
  multishot: { spread: 0.18, speed: 260 },
  arrowRain: { ticks: secs(1.2), width: 56, height: 110, speed: 280 },
  bearTrap: { life: secs(30), max: 2, snapLinger: 30 },
  smokeBomb: { radius: 48, iframes: secs(0.5), slow: 0.5, haste: 0.4 },
  hawk: { life: secs(6), speed: 190, range: 128, rest: 12, accel: 900 },
  volleyStep: { leap: 170, spread: 0.12, speed: 260, iframes: 12 },
} as const;

type EffectFn = (world: World, p: PlayerState, e: Entity, input: PlayerInput, rank: number, def: SkillDef) => boolean;
type UpdateFn = (world: World, fx: Entity, ai: AiState) => void;

const NO_INPUT = emptyInput();

// ------------------------------------------------------------------------------------------------
// Activation
// ------------------------------------------------------------------------------------------------

/** Power value for a skill at a rank (rank clamped to the table). */
export function skillPower(def: SkillDef, rank: number): number {
  const i = Math.max(1, Math.min(def.power.length, rank)) - 1;
  return def.power[i] ?? 0;
}

/** Tick cooldowns and activate the skill requested by this tick's input (if any). */
export function skillSystem(world: World): void {
  for (const p of world.players) {
    const cds = p.skillCooldowns;
    while (cds.length < p.skillSlots.length) cds.push(0);
    for (let i = 0; i < cds.length; i++) if (cds[i]! > 0) cds[i]!--;
    const input = world.inputs[p.index];
    if (input && input.skill >= 0) tryActivateSkill(world, p, input.skill, input);
  }
}

/** Reset every player's skill cooldowns (GDD §5: on entering a new district). */
export function resetSkillCooldowns(world: World): void {
  for (const p of world.players) p.skillCooldowns.fill(0);
}

/** Try to use skill slot `slot`. Returns true if it fired (cost + cooldown applied). */
export function tryActivateSkill(world: World, p: PlayerState, slot: number, input: PlayerInput = world.inputs[p.index] ?? NO_INPUT): boolean {
  if (!isActive(p) || world.run.over) return false;
  const id = p.skillSlots[slot];
  const def = id ? Content.skills.get(id) : undefined;
  const e = world.get(p.entityId);
  if (!def || !e || e.dead) return false;
  const cx = e.x + e.w / 2;
  if ((p.skillCooldowns[slot] ?? 0) > 0) {
    world.emit({ type: 'sfx', id: 'skill_not_ready', x: cx, y: e.y });
    return false;
  }
  const mana = def.manaCost ?? 0;
  const stamina = def.staminaCost ?? 0;
  if (p.mana < mana || p.stamina < stamina) {
    world.emit({ type: 'message', text: p.mana < mana ? 'Not enough mana!' : 'Too tired!', color: 0xa0a0c0, player: p.index });
    world.emit({ type: 'sfx', id: 'skill_fail', x: cx, y: e.y });
    return false;
  }
  const fn = EFFECTS[def.effect];
  if (!fn || !fn(world, p, e, input, Math.max(1, p.skills[def.id] ?? 1), def)) {
    world.emit({ type: 'sfx', id: 'skill_fail', x: cx, y: e.y });
    return false;
  }
  p.mana -= mana;
  p.stamina -= stamina;
  while (p.skillCooldowns.length <= slot) p.skillCooldowns.push(0);
  p.skillCooldowns[slot] = secs(def.cooldown);
  world.emit({ type: 'sfx', id: `skill_${def.id}`, x: cx, y: e.y });
  return true;
}

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

const AIM = { x: 1, y: 0, dist: 0 };

/** Normalised aim direction from the caster's centre (module scratch; read immediately). */
function aimFrom(e: Entity, input: PlayerInput): typeof AIM {
  const dx = input.aimX - (e.x + e.w / 2);
  const dy = input.aimY - (e.y + e.h / 2);
  const d = Math.hypot(dx, dy);
  if (d < 1e-3) {
    AIM.x = e.facing;
    AIM.y = 0;
    AIM.dist = 0;
  } else {
    AIM.x = dx / d;
    AIM.y = dy / d;
    AIM.dist = d;
  }
  return AIM;
}

function hDir(e: Entity, input: PlayerInput): 1 | -1 {
  const dx = input.aimX - (e.x + e.w / 2);
  return Math.abs(dx) < 0.5 ? e.facing : dx > 0 ? 1 : -1;
}

function strike(world: World, src: Entity, target: Entity, dmg: number, type: DamageType, knockback: number, dir?: number): number {
  return applyDamage(world, target, dmg, { source: src, type, knockback, dir });
}

/** Call `fn` for each foe whose centre is within `r` px of (cx, cy). */
function foesInRadius(world: World, cx: number, cy: number, r: number, fn: (f: Entity) => void): number {
  let n = 0;
  const r2 = r * r;
  const list = world.entities;
  for (let i = 0; i < list.length; i++) {
    const f = list[i]!;
    if (!isFoe(f)) continue;
    const dx = f.x + f.w / 2 - cx;
    const dy = f.y + f.h / 2 - cy;
    if (dx * dx + dy * dy > r2) continue;
    fn(f);
    n++;
  }
  return n;
}

/** Nearest foe to (cx, cy) within `r` px, skipping ids in `skip`. */
function nearestFoe(world: World, cx: number, cy: number, r: number, skip?: readonly number[]): Entity | undefined {
  let best: Entity | undefined;
  let bestD = r * r;
  for (const f of world.entities) {
    if (!isFoe(f) || (skip && skip.includes(f.id))) continue;
    const dx = f.x + f.w / 2 - cx;
    const dy = f.y + f.h / 2 - cy;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

function rectHitsSolid(world: World, x: number, y: number, w: number, h: number): boolean {
  const g = world.level.grid;
  const tx0 = Math.floor(x / TILE);
  const tx1 = Math.floor((x + w - 1e-4) / TILE);
  const ty0 = Math.floor(y / TILE);
  const ty1 = Math.floor((y + h - 1e-4) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (tileProps(g.get(tx, ty)).solid) return true;
  return false;
}

/**
 * Spawn a player-team projectile entity in the ProjectileComp shape. The combat workstream adds a
 * `fireProjectile` helper in parallel; the lead may route this through it.
 */
export function spawnSkillProjectile(world: World, owner: Entity, def: string, x: number, y: number, vx: number, vy: number, damage: number, skill: string): Entity {
  const pd = Content.projectiles.get(def);
  const size = pd?.size ?? 4;
  return world.spawn('projectile', def, x - size / 2, y - size / 2, {
    w: size,
    h: size,
    vx,
    vy,
    team: 'player',
    owner: owner.id,
    facing: vx < 0 ? -1 : 1,
    gravityScale: pd ? pd.gravity / PHYS.gravity : 0,
    usesPlatforms: false,
    light: pd?.light ? { radius: pd.light.radius, color: pd.light.color, intensity: 1 } : undefined,
    projectile: {
      def,
      owner: owner.id,
      team: 'player',
      damage,
      life: secs(pd?.life ?? 1.5),
      pierceLeft: pd?.pierce ?? 0,
      bouncesLeft: pd?.bounces ?? 0,
      hit: [],
      sourceItem: `skill:${skill}`,
    },
  });
}

function projSpeed(def: string, fallback: number): number {
  return Content.projectiles.get(def)?.speed ?? fallback;
}

/** Spawn a skill effect entity centred on (cx, cy). */
function spawnEffect(world: World, kind: string, owner: Entity, cx: number, cy: number, w: number, h: number, life: number, rank: number, n: Record<string, number> = {}): Entity {
  n.life = life;
  return world.spawn('effect', `skill_${kind}`, cx - w / 2, cy - h / 2, {
    w,
    h,
    team: 'player',
    owner: owner.id,
    facing: owner.facing,
    gravityScale: 0,
    collides: false,
    usesPlatforms: false,
    ai: { state: kind, t: 0, target: 0, phase: rank, n },
  });
}

function follow(fx: Entity, o: Entity): void {
  fx.x = o.x + o.w / 2 - fx.w / 2;
  fx.y = o.y + o.h / 2 - fx.h / 2;
  fx.facing = o.facing;
}

/** Owner entity of an effect if its player can still act; otherwise undefined. */
function activeOwner(world: World, fx: Entity): Entity | undefined {
  const o = world.get(fx.owner ?? 0);
  if (!o || o.dead) return undefined;
  if (o.kind === 'player') {
    const p = world.players[o.playerIndex ?? -1];
    if (!p || !isActive(p)) return undefined;
  }
  return o;
}

function ownerPlayer(world: World, fx: Entity): PlayerState | undefined {
  const o = world.get(fx.owner ?? 0);
  return o ? world.players[o.playerIndex ?? -1] : undefined;
}

// ------------------------------------------------------------------------------------------------
// Warrior
// ------------------------------------------------------------------------------------------------

const whirlwind: EffectFn = (world, p, e, _input, rank, def) => {
  const T = SKILL_FX.whirlwind;
  spawnEffect(world, 'whirlwind', e, e.x + e.w / 2, e.y + e.h / 2, T.radius * 2, T.radius * 2, T.ticks, rank, { dmg: skillPower(def, rank) + p.stats.atk });
  return true;
};

const updWhirlwind: UpdateFn = (world, fx, ai) => {
  const o = activeOwner(world, fx);
  if (!o) return world.kill(fx);
  follow(fx, o);
  if (ai.t % SKILL_FX.whirlwind.period !== 0) return;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const r2 = SKILL_FX.whirlwind.radius ** 2;
  for (const f of world.entities) {
    if (!isFoe(f)) continue;
    const dx = f.x + f.w / 2 - cx;
    const dy = f.y + f.h / 2 - cy;
    if (dx * dx + dy * dy > r2) continue;
    strike(world, o, f, ai.n.dmg!, 'physical', SKILL_FX.whirlwind.knockback);
  }
  world.emit({ type: 'particles', preset: 'whirlwind', x: cx, y: cy, count: 10 });
};

function slamExplode(world: World, o: Entity, dmg: number): void {
  const T = SKILL_FX.groundSlam;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h;
  foesInRadius(world, cx, cy - 4, T.radius, (f) => {
    strike(world, o, f, dmg, 'physical', T.knockback);
    addStatus(f, 'stun', T.stun, 1, o.id);
  });
  world.emit({ type: 'shake', amount: 4, ticks: 12 });
  world.emit({ type: 'particles', preset: 'slam', x: cx, y: cy, count: 24 });
  world.emit({ type: 'sfx', id: 'slam', x: cx, y: cy });
}

const groundSlam: EffectFn = (world, p, e, _input, rank, def) => {
  const dmg = skillPower(def, rank) + p.stats.atk;
  if (e.onGround) {
    slamExplode(world, e, dmg);
    return true;
  }
  const T = SKILL_FX.groundSlam;
  e.vy = Math.max(e.vy, T.diveSpeed);
  e.vx *= 0.3;
  e.invuln = Math.max(e.invuln, 6);
  spawnEffect(world, 'ground_slam', e, e.x + e.w / 2, e.y + e.h / 2, 12, 16, T.maxDive, rank, { dmg });
  return true;
};

const updGroundSlam: UpdateFn = (world, fx, ai) => {
  const o = activeOwner(world, fx);
  if (!o) return world.kill(fx);
  follow(fx, o);
  if (o.onGround || o.inLiquid) {
    slamExplode(world, o, ai.n.dmg!);
    world.kill(fx);
    return;
  }
  o.vy = Math.max(o.vy, SKILL_FX.groundSlam.diveSpeed);
  o.invuln = Math.max(o.invuln, 2);
};

const warCry: EffectFn = (world, _p, e, _input, rank, def) => {
  const ticks = secs(skillPower(def, rank));
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const r2 = SKILL_FX.warCry.radius ** 2;
  for (const q of world.players) {
    if (!isActive(q)) continue;
    const a = world.get(q.entityId);
    if (!a) continue;
    const dx = a.x + a.w / 2 - cx;
    const dy = a.y + a.h / 2 - cy;
    if (dx * dx + dy * dy <= r2) addStatus(a, 'haste', ticks, SKILL_FX.warCry.haste, e.id);
  }
  foesInRadius(world, cx, cy, SKILL_FX.warCry.radius, (f) => addStatus(f, 'weak', ticks, SKILL_FX.warCry.weak, e.id));
  spawnEffect(world, 'war_cry', e, cx, cy, SKILL_FX.warCry.radius * 2, SKILL_FX.warCry.radius * 2, 20, rank);
  world.emit({ type: 'particles', preset: 'war_cry', x: cx, y: cy, count: 20, color: 0xff5040 });
  world.emit({ type: 'shake', amount: 2, ticks: 8 });
  return true;
};

const updFollowOwner: UpdateFn = (world, fx) => {
  const o = world.get(fx.owner ?? 0);
  if (o) follow(fx, o);
};

const charge: EffectFn = (world, p, e, input, rank, def) => {
  const T = SKILL_FX.charge;
  const dir = hDir(e, input);
  e.facing = dir;
  e.vx = dir * T.speed;
  e.invuln = Math.max(e.invuln, T.ticks + 2);
  spawnEffect(world, 'charge', e, e.x + e.w / 2, e.y + e.h / 2, e.w + 8, e.h + 4, T.ticks, rank, { dmg: skillPower(def, rank) + p.stats.atk, dir });
  world.emit({ type: 'particles', preset: 'dash', x: e.x + e.w / 2, y: e.y + e.h, count: 8, dirX: -dir, dirY: 0 });
  return true;
};

const updCharge: UpdateFn = (world, fx, ai) => {
  const o = activeOwner(world, fx);
  if (!o) return world.kill(fx);
  const T = SKILL_FX.charge;
  const dir = ai.n.dir! < 0 ? -1 : 1;
  o.vx = dir * T.speed;
  o.facing = dir;
  o.invuln = Math.max(o.invuln, 2);
  follow(fx, o);
  for (const f of world.entities) {
    if (!isFoe(f) || !rectsOverlap(fx, f)) continue;
    const key = `h${f.id}`;
    if (ai.n[key]) continue;
    ai.n[key] = 1;
    strike(world, o, f, ai.n.dmg!, 'physical', T.knockback, dir);
    world.emit({ type: 'hitstop', ticks: 2 });
  }
  if (ai.t % 3 === 0) world.emit({ type: 'particles', preset: 'dash', x: o.x + o.w / 2, y: o.y + o.h, count: 3, dirX: -dir, dirY: 0 });
};

const ironSkin: EffectFn = (world, _p, e, _input, rank, def) => {
  addStatus(e, 'shield', secs(skillPower(def, rank)), rank, e.id);
  world.emit({ type: 'particles', preset: 'iron_skin', x: e.x + e.w / 2, y: e.y + e.h / 2, count: 14, color: 0xb0b8c8 });
  return true;
};

const cleave: EffectFn = (world, p, e, input, rank, def) => {
  const T = SKILL_FX.cleave;
  const dir = hDir(e, input);
  e.facing = dir;
  const box = { x: dir > 0 ? e.x + e.w - 2 : e.x + 2 - T.reach, y: e.y - 6, w: T.reach, h: e.h + 8 };
  const dmg = skillPower(def, rank) + p.stats.atk * 2;
  for (const f of world.entities) {
    if (!isFoe(f) || !rectsOverlap(box, f)) continue;
    strike(world, e, f, dmg, 'physical', T.knockback, dir);
    addStatus(f, 'bleed', T.bleed, 1, e.id);
  }
  spawnEffect(world, 'cleave', e, box.x + box.w / 2, box.y + box.h / 2, box.w, box.h, 8, rank);
  world.emit({ type: 'particles', preset: 'slash', x: box.x + box.w / 2, y: box.y + box.h / 2, count: 10, dirX: dir, dirY: 0 });
  world.emit({ type: 'shake', amount: 2, ticks: 6 });
  return true;
};

// ------------------------------------------------------------------------------------------------
// Mage
// ------------------------------------------------------------------------------------------------

const fireBurst: EffectFn = (world, p, e, _input, rank, def) => {
  const n = 4 + 2 * rank;
  const speed = projSpeed('fireball', SKILL_FX.fireBurst.speed);
  const dmg = skillPower(def, rank) + p.stats.mag;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    spawnSkillProjectile(world, e, 'fireball', cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, dmg, def.id);
  }
  world.emit({ type: 'particles', preset: 'fire_burst', x: cx, y: cy, count: 16, color: 0xff8030 });
  return true;
};

const frostNova: EffectFn = (world, p, e, _input, rank, def) => {
  const T = SKILL_FX.frostNova;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const dmg = skillPower(def, rank) + Math.floor(p.stats.mag / 2);
  const freeze = secs(1 + 0.5 * rank);
  foesInRadius(world, cx, cy, T.radius, (f) => {
    strike(world, e, f, dmg, 'ice', 40);
    addStatus(f, 'freeze', freeze, 1, e.id);
  });
  spawnEffect(world, 'frost_nova', e, cx, cy, T.radius * 2, T.radius * 2, 14, rank);
  world.emit({ type: 'particles', preset: 'frost_nova', x: cx, y: cy, count: 24, color: 0x9fe8ff });
  return true;
};

const CHAIN_HIT: number[] = [];

const chainLightning: EffectFn = (world, p, e, input, rank, def) => {
  const T = SKILL_FX.chain;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  let target = nearestFoe(world, input.aimX, input.aimY, T.aimRange);
  if (target && Math.hypot(target.x + target.w / 2 - cx, target.y + target.h / 2 - cy) > T.firstRange * 1.5) target = undefined;
  target ??= nearestFoe(world, cx, cy, T.firstRange);
  if (!target) {
    world.emit({ type: 'message', text: 'No target in range', color: 0xa0a0c0, player: p.index });
    return false;
  }
  const dmg = skillPower(def, rank) + p.stats.mag;
  const jumps = 2 + rank;
  CHAIN_HIT.length = 0;
  let fromX = cx;
  let fromY = cy;
  for (let i = 0; i < jumps && target; i++) {
    CHAIN_HIT.push(target.id);
    const tx = target.x + target.w / 2;
    const ty = target.y + target.h / 2;
    strike(world, e, target, dmg, 'lightning', 50);
    addStatus(target, 'stun', T.stun, 1, e.id);
    world.emit({ type: 'particles', preset: 'lightning', x: tx, y: ty, count: 8, color: 0xc0e0ff, dirX: fromX - tx, dirY: fromY - ty });
    fromX = tx;
    fromY = ty;
    target = nearestFoe(world, tx, ty, T.jumpRange, CHAIN_HIT);
  }
  world.emit({ type: 'shake', amount: 2, ticks: 6 });
  return true;
};

const blink: EffectFn = (world, _p, e, input, rank, def) => {
  const T = SKILL_FX.blink;
  const aim = aimFrom(e, input);
  const max = Math.min(skillPower(def, rank), aim.dist > 0 ? Math.max(aim.dist, T.step) : skillPower(def, rank));
  const ax = aim.x;
  const ay = aim.y;
  let d = 0;
  for (let s = T.step; s <= max; s += T.step) {
    if (rectHitsSolid(world, e.x + ax * s, e.y + ay * s, e.w, e.h)) break;
    d = s;
  }
  if (d < 4) return false;
  const ox = e.x + e.w / 2;
  const oy = e.y + e.h / 2;
  e.x += ax * d;
  e.y += ay * d;
  e.px = e.x;
  e.py = e.y;
  e.vy = Math.min(e.vy, 0) * 0.3;
  e.invuln = Math.max(e.invuln, T.iframes);
  world.emit({ type: 'particles', preset: 'blink', x: ox, y: oy, count: 12, color: 0xa080ff });
  world.emit({ type: 'particles', preset: 'blink', x: e.x + e.w / 2, y: e.y + e.h / 2, count: 12, color: 0xa080ff });
  return true;
};

const arcaneWard: EffectFn = (world, _p, e, _input, rank, def) => {
  addStatus(e, 'shield', secs(skillPower(def, rank)), rank, e.id);
  world.emit({ type: 'particles', preset: 'arcane_ward', x: e.x + e.w / 2, y: e.y + e.h / 2, count: 16, color: 0x80a0ff });
  return true;
};

const meteor: EffectFn = (world, p, e, input, rank, def) => {
  const T = SKILL_FX.meteor;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const aim = aimFrom(e, input);
  const reach = Math.min(aim.dist, T.maxRange);
  const tx = cx + aim.x * reach;
  const ty = cy + aim.y * reach;
  const fall = T.speed * T.fall;
  const startX = tx - e.facing * fall * 0.25;
  const fx = spawnEffect(world, 'meteor', e, startX, ty - fall, 10, 10, secs(T.fall * 3), rank, { dmg: skillPower(def, rank) + p.stats.mag * 2, tx, ty });
  fx.vx = (tx - startX) / T.fall;
  fx.vy = T.speed;
  fx.light = { radius: 28, color: 0xff7020, intensity: 1, flicker: 0.2 };
  return true;
};

const updMeteor: UpdateFn = (world, fx, ai) => {
  if (ai.t % 2 === 0) world.emit({ type: 'particles', preset: 'ember_trail', x: fx.x + fx.w / 2, y: fx.y + fx.h / 2, count: 2, color: 0xff8030 });
  const done = fx.y + fx.h / 2 >= ai.n.ty! || ai.t + 1 >= ai.n.life!;
  if (!done) return;
  const T = SKILL_FX.meteor;
  const src = world.get(fx.owner ?? 0) ?? fx;
  const x = ai.n.tx!;
  const y = ai.n.ty!;
  foesInRadius(world, x, y, T.radius, (f) => {
    strike(world, src, f, ai.n.dmg!, 'fire', 160);
    addStatus(f, 'burn', T.burn, 1, src.id);
  });
  world.emit({ type: 'particles', preset: 'explosion', x, y, count: 30, color: 0xff6020 });
  world.emit({ type: 'shake', amount: 5, ticks: 14 });
  world.emit({ type: 'sfx', id: 'explosion', x, y });
  world.kill(fx);
};

// ------------------------------------------------------------------------------------------------
// Ranger
// ------------------------------------------------------------------------------------------------

function fan(world: World, e: Entity, aimX: number, aimY: number, n: number, spread: number, dmg: number, skill: string): void {
  const speed = projSpeed('arrow', SKILL_FX.multishot.speed);
  const base = Math.atan2(aimY, aimX);
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2 - 1;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * spread;
    spawnSkillProjectile(world, e, 'arrow', cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, dmg, skill);
  }
}

const multishot: EffectFn = (world, p, e, input, rank, def) => {
  const aim = aimFrom(e, input);
  e.facing = aim.x < 0 ? -1 : 1;
  fan(world, e, aim.x, aim.y, 2 + rank, SKILL_FX.multishot.spread, skillPower(def, rank) + p.stats.dex, def.id);
  return true;
};

const arrowRain: EffectFn = (world, p, e, input, rank, def) => {
  const T = SKILL_FX.arrowRain;
  const tx = input.aimX;
  const ty = input.aimY;
  // Arrows appear just below the ceiling above the target (or T.height above it in the open).
  let top = ty - T.height;
  for (let y = ty - TILE; y > ty - T.height; y -= TILE) {
    if (world.level.grid.solidAt(tx, y)) {
      top = (Math.floor(y / TILE) + 1) * TILE + 2;
      break;
    }
  }
  spawnEffect(world, 'arrow_rain', e, tx, ty, T.width, 8, T.ticks, rank, {
    dmg: skillPower(def, rank) + p.stats.dex, tx, top, count: 5 + 3 * rank, spawned: 0,
  });
  return true;
};

const updArrowRain: UpdateFn = (world, fx, ai) => {
  const owner = world.get(fx.owner ?? 0);
  if (!owner) return world.kill(fx);
  const T = SKILL_FX.arrowRain;
  const n = ai.n;
  const due = Math.floor(((ai.t + 1) * n.count!) / T.ticks);
  while (n.spawned! < due) {
    n.spawned!++;
    const x = n.tx! + world.rng.range(-T.width / 2, T.width / 2);
    spawnSkillProjectile(world, owner, 'arrow', x, n.top!, world.rng.range(-12, 12), T.speed, n.dmg!, 'arrow_rain');
  }
};

const bearTrap: EffectFn = (world, p, e, _input, rank, def) => {
  const T = SKILL_FX.bearTrap;
  // Keep at most T.max traps per caster: remove the oldest.
  let count = 0;
  let oldest: Entity | undefined;
  for (const f of world.entities) {
    if (f.dead || f.kind !== 'effect' || f.def !== 'skill_bear_trap' || f.owner !== e.id) continue;
    count++;
    if (!oldest || f.id < oldest.id) oldest = f;
  }
  if (count >= T.max && oldest) world.kill(oldest);
  const trap = spawnEffect(world, 'bear_trap', e, e.x + e.w / 2, e.y + e.h - 2, 10, 4, T.life, rank, {
    dmg: skillPower(def, rank) + p.stats.dex, hold: secs(1.5 + 0.5 * rank),
  });
  trap.gravityScale = 1;
  trap.collides = true;
  trap.usesPlatforms = true;
  trap.anim = 'armed';
  return true;
};

const updBearTrap: UpdateFn = (world, fx, ai) => {
  if (ai.phase < 0) return; // snapped: linger until life ends
  const src = world.get(fx.owner ?? 0) ?? fx;
  for (const f of world.entities) {
    if (!isFoe(f) || !rectsOverlap(fx, f)) continue;
    strike(world, src, f, ai.n.dmg!, 'physical', 0);
    addStatus(f, 'stun', ai.n.hold!, 1, src.id);
    f.vx = 0;
    ai.phase = -1;
    ai.n.life = ai.t + SKILL_FX.bearTrap.snapLinger;
    fx.anim = 'snapped';
    world.emit({ type: 'particles', preset: 'trap_snap', x: fx.x + fx.w / 2, y: fx.y, count: 8 });
    world.emit({ type: 'sfx', id: 'trap_snap', x: fx.x + fx.w / 2, y: fx.y });
    return;
  }
};

const smokeBomb: EffectFn = (world, _p, e, _input, rank, def) => {
  const T = SKILL_FX.smokeBomb;
  const dur = secs(skillPower(def, rank));
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  foesInRadius(world, cx, cy, T.radius, (f) => {
    addStatus(f, 'stun', Math.ceil(dur / 2), 1, e.id);
    addStatus(f, 'slow', dur, T.slow, e.id);
  });
  addStatus(e, 'haste', dur, T.haste, e.id);
  e.invuln = Math.max(e.invuln, T.iframes);
  spawnEffect(world, 'smoke_bomb', e, cx, cy, T.radius * 2, T.radius, dur, rank);
  world.emit({ type: 'particles', preset: 'smoke', x: cx, y: cy, count: 30, color: 0x808080 });
  return true;
};

const hawk: EffectFn = (world, p, e, _input, rank, def) => {
  const fx = spawnEffect(world, 'hawk', e, e.x + e.w / 2, e.y - 6, 8, 6, SKILL_FX.hawk.life, rank, {
    dmg: skillPower(def, rank) + p.stats.dex, strikes: 2 + rank, rest: 0,
  });
  fx.vy = -60;
  return true;
};

const updHawk: UpdateFn = (world, fx, ai) => {
  const T = SKILL_FX.hawk;
  const owner = world.get(fx.owner ?? 0);
  if (!owner) return world.kill(fx);
  const n = ai.n;
  const ocx = owner.x + owner.w / 2;
  const ocy = owner.y + owner.h / 2;
  let target = ai.target ? world.get(ai.target) : undefined;
  if (n.rest! > 0) {
    n.rest!--;
    target = undefined;
  } else if (!target || !isFoe(target)) {
    target = nearestFoe(world, ocx, ocy, T.range);
    ai.target = target?.id ?? 0;
  }
  const tx = target ? target.x + target.w / 2 : ocx - owner.facing * 6;
  const ty = target ? target.y + target.h / 2 : owner.y - 10;
  const dx = tx - (fx.x + fx.w / 2);
  const dy = ty - (fx.y + fx.h / 2);
  const d = Math.hypot(dx, dy) || 1;
  const speed = target ? T.speed : Math.min(T.speed, d * 4);
  fx.vx = approach(fx.vx, (dx / d) * speed, T.accel * DT);
  fx.vy = approach(fx.vy, (dy / d) * speed, T.accel * DT);
  fx.facing = fx.vx < 0 ? -1 : 1;
  if (target && Math.abs(dx) < (target.w + fx.w) / 2 + 2 && Math.abs(dy) < (target.h + fx.h) / 2 + 2) {
    strike(world, fx, target, n.dmg!, 'physical', 70, fx.facing);
    world.emit({ type: 'particles', preset: 'feathers', x: tx, y: ty, count: 5, color: 0xc8a070 });
    n.strikes!--;
    n.rest = T.rest;
    ai.target = 0;
    fx.vy = -120;
    if (n.strikes! <= 0) world.kill(fx);
  }
};

const volleyStep: EffectFn = (world, p, e, input, rank, def) => {
  const T = SKILL_FX.volleyStep;
  const aim = aimFrom(e, input);
  const away = aim.x < 0 ? 1 : -1;
  const ax = aim.x;
  const ay = aim.y;
  e.facing = (away > 0 ? -1 : 1) as 1 | -1;
  e.vx = away * T.leap;
  e.vy = -T.leap;
  e.onGround = false;
  e.invuln = Math.max(e.invuln, T.iframes);
  fan(world, e, ax, ay, 1 + rank, T.spread, skillPower(def, rank) + p.stats.dex, def.id);
  world.emit({ type: 'particles', preset: 'dash', x: e.x + e.w / 2, y: e.y + e.h, count: 6, dirX: away, dirY: 0 });
  return true;
};

// ------------------------------------------------------------------------------------------------
// Dispatch
// ------------------------------------------------------------------------------------------------

/** Effect implementations keyed by SkillDef.effect. */
export const EFFECTS: Readonly<Record<string, EffectFn>> = {
  whirlwind,
  ground_slam: groundSlam,
  war_cry: warCry,
  charge,
  iron_skin: ironSkin,
  cleave,
  fire_burst: fireBurst,
  frost_nova: frostNova,
  chain_lightning: chainLightning,
  blink,
  arcane_ward: arcaneWard,
  meteor,
  multishot,
  arrow_rain: arrowRain,
  bear_trap: bearTrap,
  smoke_bomb: smokeBomb,
  hawk,
  volley_step: volleyStep,
};

/** Per-tick updates for lasting effect entities, keyed by entity def. */
const UPDATES: Readonly<Record<string, UpdateFn>> = {
  skill_whirlwind: updWhirlwind,
  skill_ground_slam: updGroundSlam,
  skill_war_cry: updFollowOwner,
  skill_charge: updCharge,
  skill_frost_nova: updFollowOwner,
  skill_meteor: updMeteor,
  skill_arrow_rain: updArrowRain,
  skill_bear_trap: updBearTrap,
  skill_hawk: updHawk,
};

/** Advance every skill effect entity; expire them when their life runs out. */
export function skillEffectSystem(world: World): void {
  const list = world.entities;
  for (let i = 0; i < list.length; i++) {
    const fx = list[i]!;
    if (fx.kind !== 'effect' || fx.dead || !fx.ai || !fx.def.startsWith('skill_')) continue;
    const ai = fx.ai;
    UPDATES[fx.def]?.(world, fx, ai);
    if (fx.dead) continue;
    ai.t++;
    if (ai.t >= (ai.n.life ?? 0)) world.kill(fx);
  }
}

/** For tests / UI: the PlayerState that cast a skill effect entity. */
export function effectCaster(world: World, fx: Entity): PlayerState | undefined {
  return ownerPlayer(world, fx);
}
