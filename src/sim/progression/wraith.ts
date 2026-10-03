import { Content } from '../../content';
import { approach } from '../../engine/math';
import { DT, secs } from '../constants';
import type { Entity } from '../types';
import type { World } from '../world';
import { isActive, WRAITH_DEF } from './util';

/** District number of the Blight Lair (final level). Mirrors run.ts FINAL_DISTRICT. */
const LAIR_DISTRICT = 21;

/**
 * The Blight Wraith (GDD §3): linger in a district and an unkillable flying hunter comes for the
 * party, phasing through walls. Warnings 90 s and 30 s before it arrives (3:30 / 4:30 for the
 * usual 5:00). Spawns at 5:00, 10:00 in district 1, 2:00 on Madcap. Never in towns or the lair;
 * never in boss districts on Normal (Madcap: arenas too).
 *
 * The wraith is a plain enemy entity (def 'blight_wraith'; contact damage comes from its EnemyDef)
 * that this module moves itself every tick — AI dispatch should skip it.
 */
export const WRAITH = {
  def: WRAITH_DEF,
  spawnSecs: 300,
  firstDistrictSecs: 600,
  madcapSecs: 120,
  /** Seconds before the spawn at which each warning appears. */
  warnLeadSecs: [90, 30] as readonly number[],
  warnings: ['A chill creeps into the air...', 'Something is hunting you. Find a portal!'] as readonly string[],
  spawnText: 'The Blight Wraith has come!',
  color: 0xc070ff,
  /** px/s at spawn, gained per second alive, and cap (players run ≈ 60 px/s, dash 165–270). */
  baseSpeed: 28,
  speedPerSec: 2.2,
  maxSpeed: 112,
  /** Steering acceleration px/s² per axis. */
  steer: 260,
  /** Spawn this far behind (left of) the rearmost player. */
  spawnBehind: 168,
  spawnAbove: 40,
  invuln: 1_000_000,
  hp: 9999,
} as const;

/** Ticks since the current level was entered (real time: keeps running through hit-stop). */
export function levelTime(world: World): number {
  return world.run.ticks - world.run.levelStart;
}

/** Level time (ticks, see levelTime) at which the wraith spawns in this level, or -1 if it never does. */
export function wraithSpawnTick(world: World): number {
  const info = world.level.info;
  const madcap = world.run.difficulty === 'madcap';
  if (info.isTown || info.district >= LAIR_DISTRICT) return -1;
  if (info.isBoss && !madcap) return -1;
  return secs(madcap ? WRAITH.madcapSecs : info.district <= 1 ? WRAITH.firstDistrictSecs : WRAITH.spawnSecs);
}

/** The live wraith entity, if any. */
export function wraithEntity(world: World): Entity | undefined {
  const w = world.run.wraith ? world.get(world.run.wraith) : undefined;
  return w && !w.dead ? w : undefined;
}

/** Spawn the wraith behind the party (ignores terrain). */
export function spawnWraith(world: World): Entity {
  const d = Content.enemies.get(WRAITH.def);
  let rear: Entity | undefined;
  for (const p of world.players) {
    if (!isActive(p)) continue;
    const e = world.get(p.entityId);
    if (e && (!rear || e.x < rear.x)) rear = e;
  }
  const w = d?.w ?? 12;
  const h = d?.h ?? 14;
  const rx = rear ? rear.x : world.level.spawn.x;
  const maxX = world.level.grid.pixelWidth - w - 4;
  // Behind (left of) the rearmost player; if the level edge is too close, come from ahead instead.
  let x = rx - WRAITH.spawnBehind;
  if (x < 4) x = Math.min(maxX, rx + WRAITH.spawnBehind);
  const y = Math.max(4, (rear ? rear.y : world.level.spawn.y - h) - WRAITH.spawnAbove);
  const e = world.spawn('enemy', WRAITH.def, x, y, {
    w,
    h,
    hp: WRAITH.hp,
    maxHp: WRAITH.hp,
    gravityScale: 0,
    collides: false,
    usesPlatforms: false,
    kbResist: 1,
    invuln: WRAITH.invuln,
    anim: 'fly',
    light: { radius: d?.light?.radius ?? 44, color: d?.light?.color ?? WRAITH.color, intensity: 1, flicker: 0.25 },
    // `invulnerable` is combat's explicit immunity hook (player attacks may ignore i-frames).
    ai: { state: 'hunt', t: 0, target: 0, phase: 0, n: { invulnerable: 1, wvx: 0, wvy: 0 } },
  });
  world.run.wraith = e.id;
  world.emit({ type: 'message', text: WRAITH.spawnText, color: WRAITH.color });
  world.emit({ type: 'sfx', id: 'wraith_spawn', x: x + w / 2, y: y + h / 2 });
  world.emit({ type: 'shake', amount: 3, ticks: 30 });
  world.emit({ type: 'particles', preset: 'wraith_spawn', x: x + w / 2, y: y + h / 2, count: 30, color: WRAITH.color });
  return e;
}

/** Current hunting speed for a wraith that has been alive `ticks` ticks. */
export function wraithSpeed(ticks: number): number {
  return Math.min(WRAITH.maxSpeed, WRAITH.baseSpeed + (WRAITH.speedPerSec * ticks) / 60);
}

function moveWraith(world: World, w: Entity): void {
  // Invulnerable and immune to everything.
  w.invuln = WRAITH.invuln;
  w.hp = w.maxHp;
  w.hurt = 0;
  w.status.length = 0;
  const ai = (w.ai ??= { state: 'hunt', t: 0, target: 0, phase: 0, n: {} });
  const n = ai.n;
  n.invulnerable = 1;
  // The wraith keeps its own velocity: AI dispatch, knockback or a freeze status writing vx/vy this
  // tick can't steer or stall it.
  let vx = n.wvx ?? w.vx;
  let vy = n.wvy ?? w.vy;
  // Time alive comes from Entity.age (advanced only by World), not ai.t, which AI code may touch.
  const alive = w.age;
  const cx = w.x + w.w / 2;
  const cy = w.y + w.h / 2;
  let target: Entity | undefined;
  let best = Infinity;
  for (const p of world.players) {
    if (!isActive(p)) continue;
    const e = world.get(p.entityId);
    if (!e) continue;
    const dx = e.x + e.w / 2 - cx;
    const dy = e.y + e.h / 2 - cy;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      target = e;
    }
  }
  if (target) {
    ai.target = target.id;
    const dx = target.x + target.w / 2 - cx;
    const dy = target.y + target.h / 2 - cy;
    const d = Math.sqrt(best) || 1;
    const speed = wraithSpeed(alive);
    vx = approach(vx, (dx / d) * speed, WRAITH.steer * DT);
    vy = approach(vy, (dy / d) * speed, WRAITH.steer * DT);
  } else {
    ai.target = 0;
    vx *= 0.95;
    vy *= 0.95;
  }
  n.wvx = vx;
  n.wvy = vy;
  w.vx = vx;
  w.vy = vy;
  // Authoritative integration from the start-of-tick position: overrides anything AI/physics did.
  w.x = w.px + w.vx * DT;
  w.y = w.py + w.vy * DT;
  if (Math.abs(w.vx) > 1) w.facing = w.vx > 0 ? 1 : -1;
  w.anim = 'fly';
  if (alive % 4 === 0) world.emit({ type: 'particles', preset: 'wraith', x: cx, y: cy, count: 2, color: WRAITH.color, dirX: -w.vx, dirY: -w.vy });
}

/** Level timer, warnings, spawn and movement. Called from progressionSystem every tick. */
export function wraithSystem(world: World): void {
  const run = world.run;
  if (run.over || !world.level) return;
  const at = wraithSpawnTick(world);
  if (at < 0) return;
  const t = levelTime(world);
  while (run.wraithStage < WRAITH.warnLeadSecs.length && t >= at - secs(WRAITH.warnLeadSecs[run.wraithStage]!)) {
    world.emit({ type: 'message', text: WRAITH.warnings[run.wraithStage]!, color: WRAITH.color });
    world.emit({ type: 'sfx', id: 'wraith_warning', x: 0, y: 0, volume: 0.6 + 0.2 * run.wraithStage });
    run.wraithStage++;
  }
  if (run.wraithStage === WRAITH.warnLeadSecs.length && t >= at) {
    run.wraithStage++;
    spawnWraith(world);
  }
  const w = wraithEntity(world);
  if (w) moveWraith(world, w);
}
