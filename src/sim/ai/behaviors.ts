import type { EnemyDef } from '../../content/types';
import { approach } from '../../engine/math';
import { DT, secs, TILE } from '../constants';
import { fireProjectile } from '../combat/projectiles';
import type { Entity } from '../types';
import type { World } from '../world';
import { aiOf, canSee, cxOf, cyOf, groundAhead, lowStepAhead, nearestPlayer, setState, sign, telegraph, wallAhead } from './common';

/**
 * Enemy behaviours (GDD §8). Each is a small state machine on `e.ai` (plain data). `spd` is the
 * status speed multiplier (slow/haste) already folded in by the dispatcher. Every attack has a
 * telegraph of ≥ 0.4 s, and no enemy outruns a dashing player.
 */

const GROUND_ACCEL = 600;
const AIR_ACCEL = 420;
/** Hard cap so charges/swoops stay dodgeable (player air dash is faster). */
const MAX_ATTACK_SPEED = 150;
const HOP_STEP_SPEED = 170;

function moveToward(e: Entity, targetVx: number, accel: number): void {
  e.vx = approach(e.vx, targetVx, accel * DT);
  if (Math.abs(targetVx) > 1) e.facing = targetVx > 0 ? 1 : -1;
}

/** Flying steering toward a point with a max speed. */
function steer(e: Entity, tx: number, ty: number, speed: number, accel: number): void {
  const dx = tx - cxOf(e);
  const dy = ty - cyOf(e);
  const d = Math.hypot(dx, dy) || 1;
  const s = speed * Math.min(1, d / 24);
  e.vx = approach(e.vx, (dx / d) * s, accel * DT);
  e.vy = approach(e.vy, (dy / d) * s, accel * DT);
  if (Math.abs(dx) > 2) e.facing = dx > 0 ? 1 : -1;
}

function cooldownTicks(def: EnemyDef, fallback: number): number {
  return secs(def.attackCooldown ?? fallback);
}

// --------------------------------------------------------------------------------------------------
// Walker: patrol, turn at walls/ledges, hop 1-tile steps, chase when it sees a player.
// --------------------------------------------------------------------------------------------------
export function walker(world: World, e: Entity, def: EnemyDef, spd: number): void {
  const a = aiOf(e);
  if (a.state === 'init') {
    a.n.dir = world.rng.sign();
    setState(a, 'patrol');
  }
  a.t++;
  const target = nearestPlayer(world, e, def.sight);
  const sees = !!target && canSee(world, e, target, def.sight) && Math.abs(cyOf(target) - cyOf(e)) < 48;
  if (sees) {
    a.target = target!.id;
    a.n.lost = 0;
    if (a.state !== 'chase') setState(a, 'chase');
  } else if (a.state === 'chase' && ++a.n.lost! > secs(2)) setState(a, 'patrol');

  let dir = a.n.dir ?? 1;
  let speed = def.speed * 0.5;
  if (a.state === 'chase' && target) {
    const dx = cxOf(target) - cxOf(e);
    if (Math.abs(dx) > 3) dir = sign(dx);
    speed = def.speed;
  }
  if (e.onGround) {
    if (wallAhead(world, e, dir)) {
      if (lowStepAhead(world, e, dir)) e.vy = -HOP_STEP_SPEED;
      else if (a.state === 'patrol') dir = -dir;
    } else if (!groundAhead(world, e, dir)) {
      if (a.state === 'patrol') dir = -dir;
      else speed = 0; // don't walk off ledges while chasing
    }
  }
  a.n.dir = dir;
  moveToward(e, dir * speed * spd, e.onGround ? GROUND_ACCEL : AIR_ACCEL);
  e.anim = !e.onGround ? 'jump' : Math.abs(e.vx) > 2 ? 'run' : 'idle';
}

// --------------------------------------------------------------------------------------------------
// Hopper: squash (telegraph) → hop toward the player; random hops when idle.
// --------------------------------------------------------------------------------------------------
export function hopper(world: World, e: Entity, def: EnemyDef, spd: number): void {
  const a = aiOf(e);
  if (a.state === 'init') {
    a.n.wait = world.rng.int(secs(0.5), secs(1.4));
    setState(a, 'wait');
  }
  a.t++;
  const long = def.tags?.includes('long_hop') ? 1.35 : 1;
  if (!e.onGround) {
    if (e.wallDir !== 0) e.vx = -e.vx * 0.5;
    e.anim = 'jump';
    return;
  }
  e.vx = approach(e.vx, 0, GROUND_ACCEL * DT);
  if (a.state === 'wait') {
    e.anim = 'idle';
    if (a.t >= (a.n.wait ?? 60)) setState(a, 'squash');
  } else if (a.state === 'squash') {
    e.anim = 'charge';
    if (a.t >= secs(0.25)) {
      const target = nearestPlayer(world, e, def.sight);
      const dir = target && canSee(world, e, target, def.sight) ? sign(cxOf(target) - cxOf(e)) : world.rng.sign();
      e.facing = dir;
      e.vx = dir * def.speed * long * Math.max(0.3, spd);
      e.vy = -(target ? 170 : 130) * long;
      if (target) world.emit({ type: 'sfx', id: 'enemy_hop', x: cxOf(e), y: cyOf(e), volume: 0.4 });
      a.n.wait = world.rng.int(secs(0.7), secs(1.5));
      setState(a, 'wait');
    }
  }
}

// --------------------------------------------------------------------------------------------------
// Flyer: hover/bob; when it sees a player it circles above, telegraphs, then swoops in a straight
// line and recovers — clear dodge windows (fixes the original's "flyers are a chore").
// --------------------------------------------------------------------------------------------------
export function flyer(world: World, e: Entity, def: EnemyDef, spd: number): void {
  const a = aiOf(e);
  if (a.state === 'init') {
    a.n.homeX = cxOf(e);
    a.n.homeY = cyOf(e);
    a.n.side = world.rng.sign();
    setState(a, 'idle');
  }
  a.t++;
  e.gravityScale = 0;
  const target = nearestPlayer(world, e, def.sight);
  const speed = def.speed * spd;
  switch (a.state) {
    case 'idle': {
      const bx = a.n.homeX! + Math.sin((world.tick + e.id * 13) * 0.04) * 12;
      const by = a.n.homeY! + Math.cos((world.tick + e.id * 7) * 0.06) * 6;
      steer(e, bx, by, speed * 0.5, AIR_ACCEL);
      if (target && canSee(world, e, target, def.sight)) {
        a.target = target.id;
        setState(a, 'hover');
      }
      break;
    }
    case 'hover': {
      const t = world.get(a.target);
      if (!t || t.dead || !canSee(world, e, t, def.sight * 1.3)) {
        if (a.t > secs(3)) setState(a, 'idle');
        steer(e, a.n.homeX!, a.n.homeY!, speed * 0.6, AIR_ACCEL);
        break;
      }
      if (a.t % secs(2.5) === 0) a.n.side = -(a.n.side ?? 1);
      steer(e, cxOf(t) + (a.n.side ?? 1) * 30, cyOf(t) - 28, speed, AIR_ACCEL);
      if (a.t >= cooldownTicks(def, 1.8)) {
        setState(a, 'windup');
        telegraph(world, e);
      }
      break;
    }
    case 'windup': {
      e.vx *= 0.9;
      e.vy = approach(e.vy, -20, 200 * DT);
      e.anim = 'charge';
      const t = world.get(a.target);
      if (t) {
        a.n.aimX = cxOf(t);
        a.n.aimY = cyOf(t);
      }
      if (a.t >= secs(0.45)) {
        const dx = (a.n.aimX ?? cxOf(e)) - cxOf(e);
        const dy = (a.n.aimY ?? cyOf(e)) - cyOf(e);
        const d = Math.hypot(dx, dy) || 1;
        const s = Math.min(MAX_ATTACK_SPEED, speed * 2.6);
        e.vx = (dx / d) * s;
        e.vy = (dy / d) * s;
        e.facing = dx > 0 ? 1 : -1;
        world.emit({ type: 'sfx', id: 'enemy_swoop', x: cxOf(e), y: cyOf(e), volume: 0.5 });
        setState(a, 'swoop');
      }
      break;
    }
    case 'swoop':
      e.anim = 'attack';
      if (a.t >= secs(0.6) || e.wallDir !== 0 || e.hitCeiling || e.onGround) setState(a, 'recover');
      break;
    case 'recover':
      e.vx *= 0.92;
      e.vy = approach(e.vy, -speed * 0.8, AIR_ACCEL * DT);
      if (a.t >= secs(0.7)) setState(a, target ? 'hover' : 'idle');
      break;
  }
  if (a.state !== 'windup' && a.state !== 'swoop') e.anim = 'fly';
}

// --------------------------------------------------------------------------------------------------
// Shooter (ground or flying) and turret: keep range, aim (telegraph), fire a projectile.
// --------------------------------------------------------------------------------------------------
function shootLogic(world: World, e: Entity, def: EnemyDef, target: Entity | undefined): void {
  const a = aiOf(e);
  a.n.cd = Math.max(0, (a.n.cd ?? secs(1)) - 1);
  if (a.n.aim) {
    a.n.aim--;
    e.anim = 'charge';
    if (a.n.aim === 0) {
      const t = world.get(a.target);
      if (t && !t.dead && def.projectile) {
        const ang = Math.atan2(cyOf(t) - cyOf(e), cxOf(t) - cxOf(e));
        e.facing = Math.cos(ang) >= 0 ? 1 : -1;
        fireProjectile(world, e, def.projectile, cxOf(e) + e.facing * (e.w / 2), cyOf(e) - 1, ang);
        world.emit({ type: 'sfx', id: def.damageType === 'fire' ? 'enemy_spit' : 'enemy_shoot', x: cxOf(e), y: cyOf(e), volume: 0.6 });
      }
      a.n.cd = cooldownTicks(def, 2.4);
    }
    return;
  }
  if (target && a.n.cd === 0 && canSee(world, e, target, def.sight)) {
    a.target = target.id;
    a.n.aim = secs(0.5);
    telegraph(world, e, def.light?.color ?? 0xffe080);
  }
}

export function shooter(world: World, e: Entity, def: EnemyDef, spd: number): void {
  const a = aiOf(e);
  if (a.state === 'init') {
    a.n.homeX = cxOf(e);
    a.n.homeY = cyOf(e);
    setState(a, 'act');
  }
  a.t++;
  const target = nearestPlayer(world, e, def.sight);
  const speed = def.speed * spd;
  if (def.flying) {
    e.gravityScale = 0;
    if (target) {
      const side = sign(cxOf(e) - cxOf(target));
      steer(e, cxOf(target) + side * 70, cyOf(target) - 36 + Math.sin((world.tick + e.id * 9) * 0.05) * 8, a.n.aim ? speed * 0.2 : speed, AIR_ACCEL);
    } else steer(e, a.n.homeX!, a.n.homeY! + Math.sin((world.tick + e.id) * 0.04) * 6, speed * 0.5, AIR_ACCEL);
    if (!a.n.aim) e.anim = 'fly';
  } else {
    let want = 0;
    if (target && !a.n.aim) {
      const dx = cxOf(target) - cxOf(e);
      const dist = Math.abs(dx);
      if (dist < 48) want = -sign(dx);
      else if (dist > 100) want = sign(dx);
      e.facing = sign(dx);
    }
    if (want !== 0 && e.onGround && (wallAhead(world, e, want) || !groundAhead(world, e, want))) want = 0;
    moveToward(e, want * speed, GROUND_ACCEL);
    if (want !== 0) e.facing = sign(target ? cxOf(target) - cxOf(e) : want);
    if (!a.n.aim) e.anim = Math.abs(e.vx) > 2 ? 'run' : 'idle';
  }
  shootLogic(world, e, def, target);
}

export function turret(world: World, e: Entity, def: EnemyDef): void {
  const a = aiOf(e);
  a.t++;
  e.vx = approach(e.vx, 0, GROUND_ACCEL * DT);
  const target = nearestPlayer(world, e, def.sight);
  if (target && !a.n.aim) e.facing = sign(cxOf(target) - cxOf(e));
  if (!a.n.aim) e.anim = 'idle';
  shootLogic(world, e, def, target);
}

// --------------------------------------------------------------------------------------------------
// Charger: patrol; when a player is level with it: wind-up (telegraph) → charge → stunned on walls.
// --------------------------------------------------------------------------------------------------
export function charger(world: World, e: Entity, def: EnemyDef, spd: number): void {
  const a = aiOf(e);
  if (a.state === 'init') {
    a.n.dir = world.rng.sign();
    a.n.cd = secs(1);
    setState(a, 'patrol');
  }
  a.t++;
  a.n.cd = Math.max(0, (a.n.cd ?? 0) - 1);
  const target = nearestPlayer(world, e, def.sight);
  switch (a.state) {
    case 'patrol': {
      let dir = a.n.dir ?? 1;
      if (e.onGround && (wallAhead(world, e, dir) || !groundAhead(world, e, dir))) dir = -dir;
      a.n.dir = dir;
      moveToward(e, dir * def.speed * 0.4 * spd, GROUND_ACCEL);
      e.anim = Math.abs(e.vx) > 2 ? 'run' : 'idle';
      if (target && a.n.cd === 0 && e.onGround && Math.abs(cyOf(target) - cyOf(e)) < 18 && canSee(world, e, target, def.sight)) {
        a.target = target.id;
        const dir = sign(cxOf(target) - cxOf(e));
        a.n.dir = dir;
        e.facing = dir;
        telegraph(world, e);
        world.emit({ type: 'particles', preset: 'dust_puff', x: cxOf(e), y: e.y + e.h, count: 3 });
        setState(a, 'windup');
      }
      break;
    }
    case 'windup':
      e.vx = approach(e.vx, 0, GROUND_ACCEL * 2 * DT);
      e.anim = 'charge';
      if (a.t >= secs(0.6)) {
        world.emit({ type: 'sfx', id: 'enemy_charge', x: cxOf(e), y: cyOf(e), volume: 0.6 });
        setState(a, 'charge');
      }
      break;
    case 'charge': {
      const dir = sign(a.n.dir ?? 1);
      e.vx = dir * Math.min(MAX_ATTACK_SPEED, def.speed * 2.8) * spd;
      e.facing = dir;
      e.anim = 'attack';
      if (a.t % 6 === 0) world.emit({ type: 'particles', preset: 'dust_puff', x: cxOf(e) - dir * e.w * 0.5, y: e.y + e.h, count: 1 });
      if (e.wallDir !== 0) {
        world.emit({ type: 'sfx', id: 'enemy_stun', x: cxOf(e), y: cyOf(e) });
        world.emit({ type: 'shake', amount: 2, ticks: 6 });
        e.vx = -dir * 40;
        e.vy = -90;
        setState(a, 'stunned');
      } else if ((e.onGround && !groundAhead(world, e, dir)) || a.t >= secs(1.2)) setState(a, 'recover');
      break;
    }
    case 'stunned':
      e.anim = 'hurt';
      e.vx = approach(e.vx, 0, GROUND_ACCEL * DT);
      if (a.t >= secs(1.1)) {
        a.n.cd = cooldownTicks(def, 2);
        setState(a, 'patrol');
      }
      break;
    case 'recover':
      e.vx = approach(e.vx, 0, GROUND_ACCEL * 1.5 * DT);
      e.anim = 'idle';
      if (a.t >= secs(0.5)) {
        a.n.cd = cooldownTicks(def, 2);
        setState(a, 'patrol');
      }
      break;
  }
}

// --------------------------------------------------------------------------------------------------
// Dropper: clings to the ceiling above its spawn, shakes when a player passes beneath, drops, then
// walks like a walker.
// --------------------------------------------------------------------------------------------------
export function dropper(world: World, e: Entity, def: EnemyDef, spd: number): void {
  const a = aiOf(e);
  if (a.state === 'init') {
    const grid = world.level.grid;
    const tx = Math.floor(cxOf(e) / TILE);
    let ty = Math.floor(e.y / TILE);
    let found = false;
    for (let i = 0; i < 12 && ty > 0; i++) {
      if (grid.isSolid(tx, ty - 1)) {
        found = true;
        break;
      }
      ty--;
    }
    if (found) {
      e.y = ty * TILE;
      e.vy = 0;
      e.gravityScale = 0;
      setState(a, 'cling');
    } else setState(a, 'walk');
  }
  a.t++;
  if (a.state === 'cling') {
    e.vx = 0;
    e.vy = 0;
    e.anim = 'idle';
    const t = nearestPlayer(world, e, def.sight);
    if (t && cyOf(t) > cyOf(e) && Math.abs(cxOf(t) - cxOf(e)) < 16 && canSee(world, e, t, def.sight)) {
      telegraph(world, e);
      setState(a, 'shake');
    }
    return;
  }
  if (a.state === 'shake') {
    e.anim = 'charge';
    e.vx = a.t % 4 < 2 ? 12 : -12;
    if (a.t >= secs(0.4)) {
      e.vx = 0;
      e.gravityScale = 1;
      world.emit({ type: 'sfx', id: 'enemy_drop', x: cxOf(e), y: cyOf(e), volume: 0.5 });
      setState(a, 'fall');
    }
    return;
  }
  if (a.state === 'fall') {
    e.anim = 'jump';
    if (e.onGround) setState(a, 'walk');
    return;
  }
  walker(world, e, def, spd);
  a.state = a.state === 'init' ? 'walk' : a.state;
}

// --------------------------------------------------------------------------------------------------
// Critter: harmless, wanders and flees from players (catch with a bug net).
// --------------------------------------------------------------------------------------------------
export function critter(world: World, e: Entity, def: EnemyDef, spd: number): void {
  const a = aiOf(e);
  a.t++;
  const t = nearestPlayer(world, e, 56);
  let dir = a.n.dir ?? 1;
  if (t) dir = -sign(cxOf(t) - cxOf(e));
  else if (a.t % secs(2) === 0) dir = world.rng.sign();
  if (e.onGround && (wallAhead(world, e, dir) || !groundAhead(world, e, dir))) dir = -dir;
  a.n.dir = dir;
  moveToward(e, dir * def.speed * (t ? 1 : 0.4) * spd, GROUND_ACCEL);
  e.anim = Math.abs(e.vx) > 2 ? 'run' : 'idle';
}

