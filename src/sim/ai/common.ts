import { Content } from '../../content';
import type { EnemyDef } from '../../content/types';
import { TILE } from '../constants';
import { tileProps } from '../tiles';
import type { AiState, Entity } from '../types';
import type { World } from '../world';

/** Lazily initialised AI scratch state (plain data, snapshot-safe). */
export function aiOf(e: Entity): AiState {
  return (e.ai ??= { state: 'init', t: 0, target: 0, phase: 0, n: {} });
}

export function enemyDef(e: Entity): EnemyDef | undefined {
  return Content.enemies.get(e.def);
}

export function setState(a: AiState, state: string): void {
  a.state = state;
  a.t = 0;
}

export const cxOf = (e: Entity): number => e.x + e.w / 2;
export const cyOf = (e: Entity): number => e.y + e.h / 2;

/** Nearest active (not downed/out) player entity within `range` px, or undefined. */
export function nearestPlayer(world: World, e: Entity, range: number): Entity | undefined {
  let best: Entity | undefined;
  let bestD = range * range;
  const cx = cxOf(e);
  const cy = cyOf(e);
  for (const p of world.players) {
    if (p.downed || p.out) continue;
    const pe = world.get(p.entityId);
    if (!pe || pe.dead) continue;
    const dx = cxOf(pe) - cx;
    const dy = cyOf(pe) - cy;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = pe;
    }
  }
  return best;
}

/** True if no solid tile blocks the segment (tile DDA; cheap for the short ranges AI uses). */
export function lineOfSight(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  const grid = world.level.grid;
  let tx = Math.floor(x0 / TILE);
  let ty = Math.floor(y0 / TILE);
  const ex = Math.floor(x1 / TILE);
  const ey = Math.floor(y1 / TILE);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const tdx = dx === 0 ? Infinity : Math.abs(TILE / dx);
  const tdy = dy === 0 ? Infinity : Math.abs(TILE / dy);
  let tmx = dx === 0 ? Infinity : ((sx > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / Math.abs(dx));
  let tmy = dy === 0 ? Infinity : ((sy > 0 ? (ty + 1) * TILE - y0 : y0 - ty * TILE) / Math.abs(dy));
  for (let i = 0; i < 64; i++) {
    if (tx === ex && ty === ey) return true;
    if (tmx < tmy) {
      tmx += tdx;
      tx += sx;
    } else {
      tmy += tdy;
      ty += sy;
    }
    if (tileProps(grid.get(tx, ty)).solid) return false;
  }
  return true;
}

/** Can `e` see `t` (within range and with a clear line between their centres)? */
export function canSee(world: World, e: Entity, t: Entity, range: number): boolean {
  const dx = cxOf(t) - cxOf(e);
  const dy = cyOf(t) - cyOf(e);
  if (dx * dx + dy * dy > range * range) return false;
  return lineOfSight(world, cxOf(e), cyOf(e), cxOf(t), cyOf(t));
}

/** A solid tile directly in front (within 1 px) at body height. */
export function wallAhead(world: World, e: Entity, dir: number): boolean {
  const grid = world.level.grid;
  const x = dir > 0 ? e.x + e.w + 1 : e.x - 1;
  const tx = Math.floor(x / TILE);
  for (let ty = Math.floor(e.y / TILE); ty <= Math.floor((e.y + e.h - 1) / TILE); ty++) if (grid.isSolid(tx, ty)) return true;
  return false;
}

/** Ground (solid or platform) under the front foot — false means a ledge. */
export function groundAhead(world: World, e: Entity, dir: number): boolean {
  const grid = world.level.grid;
  const x = dir > 0 ? e.x + e.w + 1 : e.x - 1;
  const p = tileProps(grid.get(Math.floor(x / TILE), Math.floor((e.y + e.h + 1) / TILE)));
  return p.solid || p.oneWay;
}

/** True if the obstacle ahead is a single tile tall (a hop clears it). */
export function lowStepAhead(world: World, e: Entity, dir: number): boolean {
  const grid = world.level.grid;
  const tx = Math.floor((dir > 0 ? e.x + e.w + 1 : e.x - 1) / TILE);
  const feet = Math.floor((e.y + e.h - 1) / TILE);
  return grid.isSolid(tx, feet) && !grid.isSolid(tx, feet - 1) && !grid.isSolid(tx, feet - 2);
}

/** Telegraph cue: a warning flash + sound so every attack is readable before it lands. */
export function telegraph(world: World, e: Entity, color = 0xffe080): void {
  world.emit({ type: 'particles', preset: 'spark', x: cxOf(e), y: e.y - 2, count: 4, color });
  world.emit({ type: 'sfx', id: 'enemy_telegraph', x: cxOf(e), y: cyOf(e), volume: 0.6 });
}

export const sign = (v: number): -1 | 1 => (v < 0 ? -1 : 1);
