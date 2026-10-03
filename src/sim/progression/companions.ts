import { Content } from '../../content';
import type { CompanionDef } from '../../content/types';
import { applyDamage } from '../combat/damage';
import { secs } from '../constants';
import type { Entity, PlayerState } from '../types';
import type { World } from '../world';
import { addStatus, hasStatus, healEntity, isActive, isFoe } from './util';

/**
 * Companions (GDD §10): a small flying helper per player (kind 'companion', def = companion id,
 * owner = player entity id). Spawned at run start and on every level load (loadLevel discards
 * non-player entities). No tile collision; follows its owner smoothly; behaviour by role.
 */
export const COMPANION = {
  w: 6,
  h: 6,
  /** Hover offset behind / above the owner's centre. */
  offsetX: 9,
  offsetY: 11,
  /** Fraction of the remaining distance covered per tick. */
  follow: 0.12,
  /** Snap to the owner if further than this (teleports, level edges). */
  teleport: 160,
  attackRange: 64,
  attackPeriod: secs(1.5),
  healPeriod: secs(30),
  shieldPeriod: secs(20),
  shieldTicks: secs(20),
  pullSpeed: 140,
  /** Small glow so every companion is visible in the dark. */
  glow: 18,
  /** Effectively invulnerable (refreshed every tick). */
  invuln: 1_000_000,
} as const;

const ROLE_COLOR: Record<CompanionDef['role'], number> = {
  attack: 0xff7040,
  light: 0xfff0b0,
  collect: 0x90e070,
  heal: 0x70ff90,
  shield: 0x80c0ff,
};

/** The companion entity following player `p`, if any. */
export function companionOf(world: World, p: PlayerState): Entity | undefined {
  for (const e of world.entities) if (e.kind === 'companion' && !e.dead && e.owner === p.entityId) return e;
  return undefined;
}

/** Spawn one companion entity for every player that has one (skips players that already do). */
export function spawnCompanions(world: World): void {
  for (const p of world.players) {
    const def = Content.companions.get(p.companion);
    const owner = world.get(p.entityId);
    if (!def || !owner || companionOf(world, p)) continue;
    const cx = owner.x + owner.w / 2 - owner.facing * COMPANION.offsetX;
    const cy = owner.y + owner.h / 2 - COMPANION.offsetY;
    const light = def.role === 'light' ? def.power : COMPANION.glow;
    world.spawn('companion', def.id, cx - COMPANION.w / 2, cy - COMPANION.h / 2, {
      w: COMPANION.w,
      h: COMPANION.h,
      gravityScale: 0,
      collides: false,
      usesPlatforms: false,
      owner: owner.id,
      facing: owner.facing,
      invuln: COMPANION.invuln,
      kbResist: 1,
      anim: 'fly',
      light: { radius: light, color: ROLE_COLOR[def.role], intensity: def.role === 'light' ? 1 : 0.7, flicker: 0.05 },
      ai: { state: def.role, t: 0, target: 0, phase: 0, n: {} },
    });
  }
}

/** Move toward the hover point behind the owner (smooth, deterministic bob). */
function followOwner(world: World, c: Entity, o: Entity): void {
  const bob = Math.sin((world.tick + c.id * 17) * 0.08) * 2;
  const tx = o.x + o.w / 2 - o.facing * COMPANION.offsetX - c.w / 2;
  const ty = o.y + o.h / 2 - COMPANION.offsetY + bob - c.h / 2;
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx * dx + dy * dy > COMPANION.teleport * COMPANION.teleport) {
    c.x = tx;
    c.y = ty;
    c.px = tx;
    c.py = ty;
  } else {
    c.x += dx * COMPANION.follow;
    c.y += dy * COMPANION.follow;
  }
  c.vx = 0;
  c.vy = 0;
  if (Math.abs(dx) > 1) c.facing = dx > 0 ? 1 : -1;
}

function nearestFoeTo(world: World, cx: number, cy: number, r: number): Entity | undefined {
  let best: Entity | undefined;
  let bestD = r * r;
  for (const f of world.entities) {
    if (!isFoe(f)) continue;
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

function attack(world: World, c: Entity, p: PlayerState, def: CompanionDef): void {
  const ai = c.ai!;
  if (ai.t < COMPANION.attackPeriod) {
    ai.t++;
    return;
  }
  if (!isActive(p)) return;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  const f = nearestFoeTo(world, cx, cy, COMPANION.attackRange);
  if (!f) return;
  ai.t = 0;
  ai.target = f.id;
  const tx = f.x + f.w / 2;
  const ty = f.y + f.h / 2;
  applyDamage(world, f, def.power + Math.floor(p.level / 5), { source: c, type: 'fire', knockback: 40 });
  world.emit({ type: 'particles', preset: 'zap', x: tx, y: ty, count: 6, color: ROLE_COLOR.attack, dirX: cx - tx, dirY: cy - ty });
  world.emit({ type: 'sfx', id: 'companion_zap', x: cx, y: cy });
  c.facing = tx > cx ? 1 : -1;
}

function collect(world: World, o: Entity, def: CompanionDef): void {
  const ocx = o.x + o.w / 2;
  const ocy = o.y + o.h / 2;
  const r2 = def.power * def.power;
  for (const e of world.entities) {
    const pk = e.pickup;
    if (!pk || e.dead || pk.delay > 0) continue;
    const dx = ocx - (e.x + e.w / 2);
    const dy = ocy - (e.y + e.h / 2);
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 < 16) continue;
    const d = Math.sqrt(d2);
    e.vx = (dx / d) * COMPANION.pullSpeed;
    e.vy = (dy / d) * COMPANION.pullSpeed;
  }
}

function heal(world: World, c: Entity, o: Entity, p: PlayerState, def: CompanionDef): void {
  const ai = c.ai!;
  if (ai.t < COMPANION.healPeriod) {
    ai.t++;
    return;
  }
  if (!isActive(p) || o.hp >= o.maxHp) return;
  if (healEntity(world, o, def.power) > 0) {
    ai.t = 0;
    world.emit({ type: 'particles', preset: 'heal', x: o.x + o.w / 2, y: o.y + o.h / 2, count: 8, color: ROLE_COLOR.heal });
    world.emit({ type: 'sfx', id: 'companion_heal', x: o.x + o.w / 2, y: o.y });
  }
}

function shield(world: World, c: Entity, o: Entity, p: PlayerState, def: CompanionDef): void {
  const ai = c.ai!;
  if (ai.t < COMPANION.shieldPeriod) {
    ai.t++;
    return;
  }
  if (!isActive(p) || hasStatus(o, 'shield')) return;
  ai.t = 0;
  addStatus(o, 'shield', COMPANION.shieldTicks, def.power, c.id);
  world.emit({ type: 'particles', preset: 'shield', x: o.x + o.w / 2, y: o.y + o.h / 2, count: 10, color: ROLE_COLOR.shield });
  world.emit({ type: 'sfx', id: 'companion_shield', x: o.x + o.w / 2, y: o.y });
}

/** Per-tick companion behaviour. */
export function companionSystem(world: World): void {
  const list = world.entities;
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    if (c.kind !== 'companion' || c.dead) continue;
    const o = world.get(c.owner ?? 0);
    const p = o ? world.players[o.playerIndex ?? -1] : undefined;
    const def = Content.companions.get(c.def);
    if (!o || !p || !def) {
      world.kill(c);
      continue;
    }
    c.invuln = COMPANION.invuln;
    c.status.length = 0;
    c.ai ??= { state: def.role, t: 0, target: 0, phase: 0, n: {} };
    followOwner(world, c, o);
    switch (def.role) {
      case 'attack':
        attack(world, c, p, def);
        break;
      case 'collect':
        if (isActive(p)) collect(world, o, def);
        break;
      case 'heal':
        heal(world, c, o, p, def);
        break;
      case 'shield':
        shield(world, c, o, p, def);
        break;
      case 'light':
        if (c.light) c.light.radius = def.power;
        break;
    }
  }
}
