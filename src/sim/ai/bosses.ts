import { Content } from '../../content';
import type { BossDef } from '../../content/types';
import { approach, rectsOverlap } from '../../engine/math';
import { DT, secs, TILE } from '../constants';
import { fireProjectile } from '../combat/projectiles';
import { enemyScale, scaleSpawnedEnemy } from '../progression/difficulty';
import { Tile } from '../tiles';
import type { AiState, Entity } from '../types';
import type { World } from '../world';
import { aiOf, cxOf, cyOf, nearestPlayer, setState, sign, telegraph, wallAhead } from './common';
import { BOSS_UPDATERS } from './registry';

/**
 * Giant monsters (GDD §7). Every boss shares one frame — dormant until the party arrives, phase
 * changes at HP thresholds (brief invulnerability + roar), the arena door seals once everyone is in
 * — and runs its own pattern: a small state machine of telegraphed moves picked with `world.rng`.
 * All state is plain numbers on `e.ai` (snapshot-safe). Attacks always telegraph ≥ 0.4 s.
 */

/** Boss HP/damage multipliers by depth: tuned at combat district 3; ×2.35 at 6, ×3.7 at 9. */
export function bossDepthScale(level: number): { hp: number; damage: number } {
  const d = Math.max(1, Math.ceil(level / 2)); // combat district number (run.ts combatNumber)
  return { hp: Math.max(0.6, 1 + (d - 3) * 0.45), damage: Math.max(0.75, 1 + (d - 3) * 0.25) };
}

/** Roaming giant monsters (no arena) are weaker than arena guardians. */
export const ROAMING_HP_MUL = 0.6;
/** Final boss co-op HP (GDD §2b.2): flat per extra player instead of the +50% rule. */
export const BLIGHTWALL_HP_PER_PLAYER = 700;
const FINAL = 'blightwall';
/** Max minions a boss keeps alive at once. */
const MINION_CAP = 6;
/** Seconds after activation before the arena seals even if someone is still outside. */
const LOCK_GRACE = 8;

/** Spawn a boss from a def (level load or roaming event): depth/co-op scaling + AI scratch data. */
export function spawnBoss(world: World, def: BossDef, x: number, bottom: number, data: Record<string, number | string> = {}): Entity {
  const e = world.spawnAt('boss', def.id, x, bottom, def.w, def.h, {
    hp: def.hp, maxHp: def.hp, armor: def.def ?? 0, kbResist: def.knockbackResist ?? 0.8, gravityScale: def.flying ? 0 : 1,
    light: def.light ? { radius: def.light.radius, color: def.light.color, intensity: 1 } : undefined,
  });
  const n: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) if (typeof v === 'number') n[k] = v;
  e.ai = { state: 'init', t: 0, target: 0, phase: 0, n };
  if (def.id === FINAL) {
    const extra = Math.max(0, world.players.length - 1);
    const hp = Math.ceil((def.hp + BLIGHTWALL_HP_PER_PLAYER * extra) * (world.run.difficulty === 'madcap' ? 1.6 : 1));
    e.hp = e.maxHp = hp;
    return e;
  }
  const s = bossDepthScale(world.level.info.district);
  const roam = n.roaming ? ROAMING_HP_MUL : 1;
  e.hp = e.maxHp = Math.ceil(def.hp * s.hp * roam);
  n.dealtMul = s.damage;
  scaleSpawnedEnemy(world, e);
  return e;
}

// ------------------------------------------------------------------------------------------------
// Shared frame
// ------------------------------------------------------------------------------------------------

interface Ctx {
  world: World;
  e: Entity;
  a: AiState;
  n: Record<string, number>;
  def: BossDef;
  target: Entity | undefined;
  /** 0-based phase (number of HP thresholds passed). */
  phase: number;
}

function phaseFor(e: Entity, def: BossDef): number {
  const f = e.hp / Math.max(1, e.maxHp);
  let p = 0;
  for (const t of def.phases) if (f <= t) p++;
  return p;
}

function insideArena(world: World, p: Entity): boolean {
  const ar = world.level.arena;
  return !!ar && rectsOverlap(p, ar);
}

/** Dormant → active, phase changes, invulnerability window, arena lock. Returns null while dormant. */
function frame(world: World, e: Entity, def: BossDef): Ctx | null {
  const a = aiOf(e);
  const n = a.n;
  if (a.state === 'init') {
    n.homeX = cxOf(e);
    n.homeY = cyOf(e);
    setState(a, 'dormant');
  }
  if (a.state === 'dormant') {
    // Arena guardians wake when anyone sets foot in the arena (the lair is wider than any sight
    // range); roaming giants and arena-less bosses when someone comes close.
    const arena = !n.roaming && world.level.arena;
    const woken = e.hp < e.maxHp || (arena ? world.activePlayers().some((p) => insideArena(world, p)) : !!nearestPlayer(world, e, n.roaming ? 140 : def.sight));
    if (!woken) {
      e.vx = approach(e.vx, 0, 600 * DT);
      e.anim = 'idle';
      return null;
    }
    n.active = 1;
    n.activeAt = world.tick;
    world.emit({ type: 'bossPhase', entity: e.id, phase: 0 });
    world.emit({ type: 'message', text: def.title, color: 0xffc040 });
    world.emit({ type: 'sfx', id: 'boss_roar', x: cxOf(e), y: cyOf(e) });
    world.emit({ type: 'shake', amount: 3, ticks: 20 });
    rest(a, secs(1.2));
  }
  a.t++;
  if ((n.invulnerable ?? 0) > 0) n.invulnerable!--;
  const phase = phaseFor(e, def);
  if (phase > a.phase) {
    a.phase = phase;
    n.invulnerable = secs(0.8);
    world.emit({ type: 'bossPhase', entity: e.id, phase });
    world.emit({ type: 'sfx', id: 'boss_roar', x: cxOf(e), y: cyOf(e), pitch: 1 + phase * 0.1 });
    world.emit({ type: 'shake', amount: 4, ticks: 24 });
    world.emit({ type: 'particles', preset: 'burst', x: cxOf(e), y: cyOf(e), count: 24, color: def.light?.color ?? 0xffffff });
    rest(a, secs(0.9));
  }
  lockArena(world, n);
  const target = nearestPlayer(world, e, 600);
  if (target) a.target = target.id;
  return { world, e, a, n, def, target, phase: a.phase };
}

/** Seal the arena door once every active player is inside (or after a grace period). */
function lockArena(world: World, n: Record<string, number>): void {
  if (n.locked || n.doorX0 === undefined || n.roaming) return;
  const players = world.activePlayers();
  const allIn = players.length > 0 && players.every((p) => insideArena(world, p));
  if (!allIn && world.tick - (n.activeAt ?? world.tick) < secs(LOCK_GRACE)) return;
  const grid = world.level.grid;
  for (let ty = n.doorY0!; ty <= n.doorY1!; ty++) {
    for (let tx = n.doorX0!; tx <= n.doorX1!; tx++) {
      const cell = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
      if (players.some((p) => rectsOverlap(p, cell))) continue;
      if (grid.get(tx, ty) === Tile.AIR) grid.set(tx, ty, Tile.BEDROCK);
    }
  }
  n.locked = 1;
  world.emit({ type: 'sfx', id: 'arena_lock', x: n.doorX0! * TILE, y: n.doorY1! * TILE });
  world.emit({ type: 'shake', amount: 2, ticks: 12 });
}

/** Re-open a sealed arena door (called by the run flow when the guardian falls). */
export function unsealArenaDoor(world: World): void {
  const spec = world.level.spawns.find((s) => s.kind === 'boss');
  const d = spec?.data;
  if (!d || typeof d.doorX0 !== 'number') return;
  const grid = world.level.grid;
  for (let ty = d.doorY0 as number; ty <= (d.doorY1 as number); ty++) {
    for (let tx = d.doorX0; tx <= (d.doorX1 as number); tx++) if (grid.get(tx, ty) === Tile.BEDROCK) grid.set(tx, ty, Tile.AIR);
  }
}

// ------------------------------------------------------------------------------------------------
// Move helpers
// ------------------------------------------------------------------------------------------------

function rest(a: AiState, ticks: number): void {
  setState(a, 'rest');
  a.n.rest = ticks;
}

/** Rest between moves; shorter in later phases. */
function restFor(c: Ctx, base: number): void {
  rest(c.a, secs(base * (1 - 0.18 * c.phase)));
}

function pick(world: World, moves: readonly [string, number][]): string {
  return world.rng.weighted(moves.filter((m) => m[1] > 0), (m) => m[1])[0];
}

function groundMove(e: Entity, vx: number, accel = 700): void {
  e.vx = approach(e.vx, vx, accel * DT);
  if (Math.abs(vx) > 1) e.facing = vx > 0 ? 1 : -1;
}

function hover(e: Entity, tx: number, ty: number, speed: number): void {
  const dx = tx - cxOf(e);
  const dy = ty - cyOf(e);
  const d = Math.hypot(dx, dy) || 1;
  const s = speed * Math.min(1, d / 30);
  e.vx = approach(e.vx, (dx / d) * s, 420 * DT);
  e.vy = approach(e.vy, (dy / d) * s, 420 * DT);
  if (Math.abs(dx) > 3) e.facing = dx > 0 ? 1 : -1;
}

function angleTo(e: Entity, t: Entity): number {
  return Math.atan2(cyOf(t) - cyOf(e), cxOf(t) - cxOf(e));
}

function shoot(c: Ctx, proj: string, angle: number, opts: { x?: number; y?: number; speedMul?: number } = {}): void {
  const { world, e } = c;
  fireProjectile(world, e, proj, opts.x ?? cxOf(e) + Math.cos(angle) * (e.w / 2), opts.y ?? cyOf(e), angle, { speedMul: opts.speedMul });
}

/** Ground shockwaves running left and right from the boss's feet. */
function shockwaves(c: Ctx): void {
  const { world, e } = c;
  const y = e.y + e.h - 4;
  fireProjectile(world, e, 'shockwave', e.x - 2, y, Math.PI);
  fireProjectile(world, e, 'shockwave', e.x + e.w + 2, y, 0);
  world.emit({ type: 'shake', amount: 4, ticks: 16 });
  world.emit({ type: 'particles', preset: 'dust', x: cxOf(e), y: e.y + e.h, count: 16 });
  world.emit({ type: 'sfx', id: 'boss_slam', x: cxOf(e), y: e.y + e.h });
}

function spawnMinions(c: Ctx, def: string, count: number): void {
  const { world, e } = c;
  const d = Content.enemies.get(def);
  if (!d) return;
  let alive = 0;
  for (const o of world.entities) if (!o.dead && o.kind === 'enemy' && o.def === def) alive++;
  const n = Math.min(count, MINION_CAP - alive);
  for (let i = 0; i < n; i++) {
    const m = world.spawnAt('enemy', d.id, cxOf(e) + (i - (n - 1) / 2) * 8, e.y + e.h, d.w, d.h, {
      hp: d.hp, maxHp: d.hp, gravityScale: d.flying ? 0 : 1,
      light: d.light ? { radius: d.light.radius, color: d.light.color, intensity: 1 } : undefined,
    });
    m.vx = (i - (n - 1) / 2) * 60;
    m.vy = -120;
    scaleSpawnedEnemy(world, m);
  }
  if (n > 0) world.emit({ type: 'particles', preset: 'burst', x: cxOf(e), y: cyOf(e), count: 10, color: 0xa0ff80 });
}

/** Leap toward x (ground bosses). */
function leap(e: Entity, toX: number, height: number): void {
  const dx = toX - cxOf(e);
  e.vy = -Math.sqrt(2 * 600 * height);
  e.vx = Math.max(-170, Math.min(170, dx * 1.1));
  e.onGround = false;
}

function restTick(c: Ctx, chase: (c: Ctx) => void, choose: (c: Ctx) => string): void {
  chase(c);
  if (--c.n.rest! <= 0) {
    setState(c.a, choose(c));
    c.n.step = 0;
  }
}

// ------------------------------------------------------------------------------------------------
// Patterns
// ------------------------------------------------------------------------------------------------

/** Gloomjaw — acid-maw crocodile: lunge, acid spit arcs, wall-to-wall charge (phase 2). */
function gloomjaw(c: Ctx): void {
  const { world, e, a, target } = c;
  const dir = target ? sign(cxOf(target) - cxOf(e)) : e.facing;
  switch (a.state) {
    case 'rest':
      return restTick(c, () => groundMove(e, target ? dir * c.def.speed * 0.6 : 0), () =>
        pick(world, [['lunge', 3], ['spit', 3], ['charge', c.phase >= 1 ? 3 : 0]]));
    case 'lunge':
      if (a.t === 1) telegraph(world, e, 0xc0ff40);
      if (a.t < secs(0.5)) {
        groundMove(e, 0);
        e.anim = 'charge';
        return;
      }
      if (a.t === secs(0.5)) e.vx = e.facing * 170;
      e.anim = 'attack';
      if (a.t > secs(0.95)) restFor(c, 1.1);
      return;
    case 'spit':
      groundMove(e, 0);
      if (a.t === 1) telegraph(world, e, 0xc0ff40);
      if (target && a.t >= secs(0.5) && a.t % 8 === 0 && c.n.step! < 3 + c.phase) {
        const dx = cxOf(target) - cxOf(e);
        shoot(c, 'acid_glob', dx > 0 ? -0.9 + c.n.step! * 0.12 : Math.PI + 0.9 - c.n.step! * 0.12, { speedMul: 0.8 + Math.min(1.2, Math.abs(dx) / 160) });
        c.n.step!++;
      }
      if (a.t > secs(1.4)) restFor(c, 1.0);
      return;
    case 'charge':
      if (a.t === 1) {
        telegraph(world, e, 0xff4040);
        e.facing = dir;
      }
      if (a.t < secs(0.7)) {
        groundMove(e, 0);
        e.anim = 'charge';
        return;
      }
      groundMove(e, e.facing * 150, 900);
      e.anim = 'run';
      if (wallAhead(world, e, e.facing) || a.t > secs(3)) {
        world.emit({ type: 'shake', amount: 5, ticks: 20 });
        world.emit({ type: 'sfx', id: 'enemy_stun', x: cxOf(e), y: cyOf(e) });
        e.vx = -e.facing * 60;
        setState(a, 'stunned');
      }
      return;
    case 'stunned':
      groundMove(e, 0);
      e.anim = 'hurt';
      if (a.t > secs(1.4)) restFor(c, 0.6);
      return;
    default:
      rest(a, 30);
  }
}

/** Bogmother — giant toad: belly-flop shockwaves, slime spit, tadpole swarm, tongue pull. */
function bogmother(c: Ctx): void {
  const { world, e, a, target } = c;
  switch (a.state) {
    case 'rest':
      return restTick(c, () => groundMove(e, 0), () =>
        pick(world, [['flop', 4], ['spit', 3], ['brood', c.phase >= 1 ? 2 : 1], ['tongue', 2]]));
    case 'flop':
      if (a.t === 1) telegraph(world, e, 0x80c040);
      if (a.t < secs(0.6)) {
        groundMove(e, 0);
        e.anim = 'charge';
        return;
      }
      if (a.t === secs(0.6)) leap(e, target ? cxOf(target) : cxOf(e), 70);
      e.anim = 'jump';
      if (a.t > secs(0.7) && e.onGround) {
        shockwaves(c);
        if (c.phase >= 2) spawnMinions(c, 'tadpole', 1);
        restFor(c, 1.2);
      }
      if (a.t > secs(3)) restFor(c, 1);
      return;
    case 'spit':
      groundMove(e, 0);
      if (a.t === 1) telegraph(world, e, 0x80ff60);
      if (target && a.t === secs(0.5)) {
        const base = angleTo(e, target) - 0.35;
        for (let i = 0; i < 3 + c.phase; i++) shoot(c, 'slime_ball', base - 0.25 + i * (0.6 / (2 + c.phase)), { speedMul: 1.3 });
      }
      if (a.t > secs(1)) restFor(c, 1);
      return;
    case 'brood':
      groundMove(e, 0);
      if (a.t === 1) telegraph(world, e, 0xa0ff80);
      if (a.t === secs(0.6)) spawnMinions(c, 'tadpole', 2 + c.phase);
      if (a.t > secs(1)) restFor(c, 1.2);
      return;
    case 'tongue':
      groundMove(e, 0);
      if (a.t === 1) {
        telegraph(world, e, 0xff80a0);
        if (target) e.facing = sign(cxOf(target) - cxOf(e));
      }
      e.anim = a.t < secs(0.55) ? 'charge' : 'attack';
      if (a.t >= secs(0.55) && a.t < secs(0.85)) {
        // Players in front at mouth height get reeled in (dash out of the line to dodge).
        for (const p of world.activePlayers()) {
          const dx = cxOf(p) - cxOf(e);
          if (sign(dx) === e.facing && Math.abs(dx) < 130 && Math.abs(cyOf(p) - (e.y + e.h * 0.4)) < 22) p.vx = approach(p.vx, -e.facing * 220, 2400 * DT);
        }
      }
      if (a.t > secs(1.1)) restFor(c, 0.9);
      return;
    default:
      rest(a, 30);
  }
}

/** Broodqueen — spider queen: web volleys, climb + ceiling drop, spiderling broods. */
function broodqueen(c: Ctx): void {
  const { world, e, a, target } = c;
  const dir = target ? sign(cxOf(target) - cxOf(e)) : e.facing;
  switch (a.state) {
    case 'rest':
      e.gravityScale = 1;
      return restTick(c, () => groundMove(e, target ? dir * c.def.speed * 0.7 : 0), () =>
        pick(world, [['web', 3], ['climb', 3], ['brood', c.phase >= 1 ? 2 : 1]]));
    case 'web':
      groundMove(e, 0);
      if (a.t === 1) telegraph(world, e, 0xe0e0ff);
      if (target && a.t >= secs(0.45) && a.t % 10 === 0 && c.n.step! < 3 + c.phase) {
        shoot(c, 'web_shot', angleTo(e, target) - 0.15 + c.n.step! * 0.1, { speedMul: 1.4 });
        c.n.step!++;
      }
      if (a.t > secs(1.4)) restFor(c, 1);
      return;
    case 'climb': {
      // Up to the ceiling, track the target, telegraph, drop with a slam.
      const ar = world.level.arena;
      const top = ar ? ar.y + 4 : n0(c, 'homeY') - 90;
      e.gravityScale = 0;
      if (c.n.step === 0) {
        e.vx = approach(e.vx, 0, 600 * DT);
        e.vy = -160;
        e.anim = 'jump';
        if (e.y <= top || a.t > secs(1.5)) {
          c.n.step = 1;
          a.t = 0;
        }
        return;
      }
      if (c.n.step === 1) {
        e.vy = 0;
        hover(e, target ? cxOf(target) : cxOf(e), top + e.h / 2, 120);
        e.vy = 0;
        if (a.t === secs(0.9)) telegraph(world, e, 0xff40c0);
        if (a.t > secs(1.4)) {
          c.n.step = 2;
          e.vx = 0;
          e.gravityScale = 2;
        }
        return;
      }
      if (e.onGround) {
        e.gravityScale = 1;
        shockwaves(c);
        restFor(c, 1.3);
      }
      return;
    }
    case 'brood':
      groundMove(e, 0);
      if (a.t === 1) telegraph(world, e, 0xff80ff);
      if (a.t === secs(0.6)) spawnMinions(c, 'spiderling', 2 + c.phase);
      if (a.t > secs(1)) restFor(c, 1.1);
      return;
    default:
      rest(a, 30);
  }
}

/** Frost Matron — floats through walls: shard rings, aimed volleys, blizzard, blink (phase 2+). */
function frostMatron(c: Ctx): void {
  const { world, e, a, target } = c;
  e.collides = false;
  e.gravityScale = 0;
  const bob = Math.sin((world.tick + e.id * 13) * 0.05) * 6;
  const orbit = () => {
    if (!target) return hover(e, n0(c, 'homeX'), n0(c, 'homeY') + bob, 40);
    const side = sign(cxOf(e) - cxOf(target));
    hover(e, cxOf(target) + side * 80, cyOf(target) - 46 + bob, c.def.speed);
  };
  switch (a.state) {
    case 'rest':
      return restTick(c, orbit, () => pick(world, [['ring', 3], ['volley', 3], ['blizzard', c.phase >= 1 ? 2 : 0], ['blink', c.phase >= 2 ? 2 : 0]]));
    case 'ring': {
      e.vx = approach(e.vx, 0, 300 * DT);
      e.vy = approach(e.vy, 0, 300 * DT);
      if (a.t === 1) telegraph(world, e, 0xa0ffff);
      if (a.t === secs(0.6)) {
        const k = 8 + c.phase * 2;
        const off = world.rng.next() * Math.PI;
        for (let i = 0; i < k; i++) shoot(c, 'ice_shard', off + (i / k) * Math.PI * 2, { x: cxOf(e), y: cyOf(e), speedMul: 0.7 });
      }
      if (a.t > secs(1.1)) restFor(c, 1.1);
      return;
    }
    case 'volley':
      orbit();
      if (a.t === 1) telegraph(world, e, 0xa0ffff);
      if (target && a.t >= secs(0.5) && a.t % 9 === 0 && c.n.step! < 3 + c.phase) {
        shoot(c, 'ice_shard', angleTo(e, target), { x: cxOf(e), y: cyOf(e) });
        c.n.step!++;
      }
      if (a.t > secs(1.5)) restFor(c, 1);
      return;
    case 'blizzard':
      orbit();
      if (a.t === 1) {
        telegraph(world, e, 0xffffff);
        world.emit({ type: 'message', text: 'The air turns to knives…', color: 0xa0e0ff });
      }
      if (target && a.t >= secs(0.6) && a.t % 6 === 0) {
        const x = cxOf(target) + (world.rng.next() - 0.5) * 140;
        shoot(c, 'ice_shard', Math.PI / 2 + (world.rng.next() - 0.5) * 0.2, { x, y: cyOf(target) - 100, speedMul: 0.8 });
      }
      if (a.t > secs(2.6)) restFor(c, 1.3);
      return;
    case 'blink':
      if (a.t === 1 && target) {
        c.n.bx = cxOf(target) - sign(cxOf(e) - cxOf(target)) * 50;
        c.n.by = cyOf(target) - 30;
        world.emit({ type: 'particles', preset: 'burst', x: c.n.bx, y: c.n.by, count: 12, color: 0xa0ffff });
        world.emit({ type: 'sfx', id: 'enemy_telegraph', x: c.n.bx, y: c.n.by });
      }
      e.vx = approach(e.vx, 0, 600 * DT);
      e.vy = approach(e.vy, 0, 600 * DT);
      if (a.t === secs(0.5) && c.n.bx !== undefined) {
        e.x = c.n.bx - e.w / 2;
        e.y = c.n.by! - e.h / 2;
        setState(a, 'ring');
        a.t = secs(0.5);
      }
      return;
    default:
      rest(a, 30);
  }
}

/** Shardbound Knight — dash combos, crystal spike rain, blink-strike behind the target (phase 2+). */
function shardboundKnight(c: Ctx): void {
  const { world, e, a, target } = c;
  const dir = target ? sign(cxOf(target) - cxOf(e)) : e.facing;
  switch (a.state) {
    case 'rest':
      return restTick(c, () => {
        const dist = target ? Math.abs(cxOf(target) - cxOf(e)) : 0;
        groundMove(e, target && dist > 40 ? dir * c.def.speed * 0.5 : 0);
      }, () => pick(world, [['combo', 4], ['rain', 3], ['blink', c.phase >= 1 ? 3 : 0]]));
    case 'combo': {
      // Three dashes, each telegraphed; the knight's body is the blade (contact damage).
      const cycle = secs(0.75);
      const k = Math.floor(a.t / cycle);
      const t = a.t % cycle;
      if (k >= 2 + Math.min(2, c.phase)) return restFor(c, 1.1);
      if (t === 0) {
        e.facing = dir;
        telegraph(world, e, 0xc070ff);
      }
      if (t < secs(0.35)) {
        groundMove(e, 0);
        e.anim = 'charge';
        return;
      }
      if (t === secs(0.35)) {
        e.vx = e.facing * 175;
        world.emit({ type: 'sfx', id: 'swing', x: cxOf(e), y: cyOf(e) });
      }
      e.anim = 'attack';
      return;
    }
    case 'rain':
      groundMove(e, 0);
      if (a.t === 1) {
        telegraph(world, e, 0xc070ff);
        // Mark strike columns around each player.
        let i = 0;
        for (const p of world.activePlayers()) {
          for (let j = -1; j <= 1 + Math.min(1, c.phase); j++) {
            const x = cxOf(p) + j * 22 + (world.rng.next() - 0.5) * 8;
            c.n[`rx${i}`] = x;
            c.n[`ry${i}`] = cyOf(p);
            world.emit({ type: 'particles', preset: 'spark', x, y: p.y + p.h, count: 5, color: 0xc070ff });
            i++;
          }
        }
        c.n.rn = i;
      }
      if (a.t === secs(0.7)) for (let i = 0; i < (c.n.rn ?? 0); i++) shoot(c, 'crystal_spike', Math.PI / 2, { x: c.n[`rx${i}`], y: c.n[`ry${i}`] });
      if (a.t > secs(1.1)) restFor(c, 1);
      return;
    case 'blink':
      groundMove(e, 0);
      if (a.t === 1 && target) {
        c.n.bx = cxOf(target) - target.facing * 26;
        world.emit({ type: 'particles', preset: 'burst', x: c.n.bx, y: target.y + target.h - 6, count: 12, color: 0xc070ff });
        world.emit({ type: 'sfx', id: 'enemy_telegraph', x: c.n.bx, y: cyOf(target) });
      }
      if (a.t === secs(0.55) && c.n.bx !== undefined && target) {
        const nx = c.n.bx - e.w / 2;
        const ny = target.y + target.h - e.h;
        if (!solidRect(world, nx, ny, e.w, e.h)) {
          e.x = nx;
          e.y = ny;
        }
        e.facing = sign(cxOf(target) - cxOf(e));
        e.vx = e.facing * 160;
        e.anim = 'attack';
      }
      if (a.t > secs(0.9)) restFor(c, 1);
      return;
    default:
      rest(a, 30);
  }
}

/** Emberwyrm — 3-stream fireball volleys, swoops, flame breath (phase 2+). */
function emberwyrm(c: Ctx): void {
  const { world, e, a, target } = c;
  e.gravityScale = 0;
  const perch = () => {
    if (!target) return hover(e, n0(c, 'homeX'), n0(c, 'homeY') - 30, 40);
    const side = sign(cxOf(e) - cxOf(target));
    hover(e, cxOf(target) + side * 90, cyOf(target) - 60 + Math.sin(world.tick * 0.04) * 8, c.def.speed);
  };
  switch (a.state) {
    case 'rest':
      return restTick(c, perch, () => pick(world, [['volley', 4], ['swoop', 3], ['breath', c.phase >= 1 ? 3 : 0]]));
    case 'volley':
      perch();
      if (a.t === 1) telegraph(world, e, 0xff8020);
      if (target && a.t >= secs(0.5) && (a.t - secs(0.5)) % 15 === 0 && c.n.step! < 3) {
        const base = angleTo(e, target);
        for (let s = -1; s <= 1; s++) shoot(c, 'fireball', base + s * 0.28, { x: cxOf(e) + e.facing * (e.w / 2), y: cyOf(e) + 4 });
        world.emit({ type: 'sfx', id: 'enemy_spit', x: cxOf(e), y: cyOf(e) });
        c.n.step!++;
      }
      if (a.t > secs(1.6)) restFor(c, 1.1);
      return;
    case 'swoop':
      if (a.t === 1) {
        telegraph(world, e, 0xff4020);
        if (target) {
          c.n.sx = cxOf(target);
          c.n.sy = cyOf(target);
        }
      }
      if (a.t < secs(0.6)) return perch();
      if (a.t < secs(1.6)) {
        hover(e, c.n.sx ?? cxOf(e), (c.n.sy ?? cyOf(e)) + 6, 150);
        e.anim = 'attack';
        if (Math.abs(cxOf(e) - (c.n.sx ?? 0)) < 10 && Math.abs(cyOf(e) - (c.n.sy ?? 0)) < 14) a.t = secs(1.6);
        return;
      }
      e.vy = approach(e.vy, -120, 600 * DT);
      if (a.t > secs(2.2)) restFor(c, 1);
      return;
    case 'breath':
      perch();
      if (a.t === 1) telegraph(world, e, 0xffc040);
      if (target && a.t >= secs(0.6) && a.t % 4 === 0 && a.t < secs(1.9)) {
        const ang = angleTo(e, target) + Math.sin(a.t * 0.2) * 0.25;
        shoot(c, 'fire_spit', ang, { x: cxOf(e) + e.facing * (e.w / 2), y: cyOf(e) + 4, speedMul: 1.6 });
      }
      if (a.t > secs(2.2)) restFor(c, 1.2);
      return;
    default:
      rest(a, 30);
  }
}

/** Blightwall — the final wall: bolt fans, blight heads, slow advance (phase 1+), orb spray. */
function blightwall(c: Ctx): void {
  const { world, e, a, target } = c;
  e.gravityScale = 0;
  e.vy = 0;
  // Creep toward the party in later phases, never more than ~15 tiles from its start.
  const minX = n0(c, 'homeX') - 15 * TILE;
  e.vx = c.phase >= 1 && cxOf(e) > minX ? -c.def.speed * c.phase : 0;
  const mouths = [e.y + e.h * 0.2, e.y + e.h * 0.5, e.y + e.h * 0.8];
  switch (a.state) {
    case 'rest':
      return restTick(c, () => {}, () => pick(world, [['fan', 4], ['heads', 2], ['spray', c.phase >= 1 ? 3 : 1]]));
    case 'fan':
      if (a.t === 1) telegraph(world, e, 0xff3cb4);
      if (target && a.t === secs(0.6)) {
        for (const y of mouths) {
          const ang = Math.atan2(cyOf(target) - y, cxOf(target) - e.x);
          for (let s = -1; s <= 1; s++) shoot(c, 'blight_bolt', ang + s * 0.3, { x: e.x - 4, y });
        }
      }
      if (a.t > secs(1.1)) restFor(c, 1.5);
      return;
    case 'heads':
      if (a.t === 1) telegraph(world, e, 0xff40c0);
      if (a.t === secs(0.6)) {
        const d = Content.enemies.get('blight_head');
        let alive = 0;
        for (const o of world.entities) if (!o.dead && o.def === 'blight_head') alive++;
        for (let i = 0; d && i < Math.min(1 + c.phase, 4 - alive); i++) {
          const m = world.spawnAt('enemy', d.id, e.x - 8, mouths[i % 3]! + d.h / 2, d.w, d.h, { hp: d.hp, maxHp: d.hp, gravityScale: 0 });
          m.vx = -80;
          scaleSpawnedEnemy(world, m);
        }
      }
      if (a.t > secs(1)) restFor(c, 1.6);
      return;
    case 'spray':
      if (a.t === 1) telegraph(world, e, 0xff80d0);
      if (a.t >= secs(0.6) && a.t % 6 === 0 && a.t < secs(2)) {
        const y = mouths[(a.t / 6) % 3 | 0]!;
        shoot(c, 'magic_orb', Math.PI + (world.rng.next() - 0.5) * 0.9, { x: e.x - 4, y, speedMul: 1.2 });
      }
      if (a.t > secs(2.3)) restFor(c, 1.4);
      return;
    default:
      rest(a, 30);
  }
}

// ------------------------------------------------------------------------------------------------

function n0(c: Ctx, key: string): number {
  return c.n[key] ?? 0;
}

function solidRect(world: World, x: number, y: number, w: number, h: number): boolean {
  const g = world.level.grid;
  for (let ty = Math.floor(y / TILE); ty <= Math.floor((y + h - 1) / TILE); ty++) {
    for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + w - 1) / TILE); tx++) if (g.isSolid(tx, ty)) return true;
  }
  return false;
}

const PATTERNS: Record<string, (c: Ctx) => void> = {
  gloomjaw,
  bogmother,
  broodqueen,
  frost_matron: frostMatron,
  shardbound_knight: shardboundKnight,
  emberwyrm,
  blightwall,
};

/** Register every content boss with the AI dispatcher (idempotent; called at module load). */
export function registerBosses(): void {
  for (const def of Content.bosses.values()) {
    const pattern = PATTERNS[def.pattern];
    if (!pattern) continue;
    BOSS_UPDATERS[def.id] = (world, e) => {
      const c = frame(world, e, def);
      if (c) pattern(c);
    };
  }
}

registerBosses();

/** Patterns implemented here (tests check every boss def has one). */
export const BOSS_PATTERNS: readonly string[] = Object.keys(PATTERNS);

/** Hostile scaling a party faces from bosses right now (debug/tests). */
export function bossScaleFor(world: World): { hp: number; damage: number } {
  const s = bossDepthScale(world.level.info.district);
  const p = enemyScale(world);
  return { hp: s.hp * p.hp, damage: s.damage * p.damage };
}
