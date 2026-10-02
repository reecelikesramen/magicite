import { DT, PHYS, TILE } from './constants';
import { tileProps, type TileGrid } from './tiles';
import type { Entity } from './types';
import type { World } from './world';

const EPS = 1e-4;
/** Max sub-step in px so fast things never tunnel through 8px tiles. */
const MAX_STEP = 3;

function solidCol(grid: TileGrid, tx: number, y0: number, y1: number): boolean {
  const t0 = Math.floor(y0 / TILE);
  const t1 = Math.floor((y1 - EPS) / TILE);
  for (let ty = t0; ty <= t1; ty++) if (tileProps(grid.get(tx, ty)).solid) return true;
  return false;
}

/** Row blocks downward motion: solid, or a one-way platform whose top we were above. */
function landRow(grid: TileGrid, ty: number, x0: number, x1: number, prevBottom: number, platforms: boolean): boolean {
  const t0 = Math.floor(x0 / TILE);
  const t1 = Math.floor((x1 - EPS) / TILE);
  for (let tx = t0; tx <= t1; tx++) {
    const p = tileProps(grid.get(tx, ty));
    if (p.solid) return true;
    if (platforms && p.oneWay && prevBottom <= ty * TILE + EPS) return true;
  }
  return false;
}

function solidRow(grid: TileGrid, ty: number, x0: number, x1: number): boolean {
  const t0 = Math.floor(x0 / TILE);
  const t1 = Math.floor((x1 - EPS) / TILE);
  for (let tx = t0; tx <= t1; tx++) if (tileProps(grid.get(tx, ty)).solid) return true;
  return false;
}

/** Move horizontally, stopping at solid tiles. Returns true if blocked. */
export function moveX(grid: TileGrid, e: Entity, dx: number): boolean {
  let remaining = dx;
  while (Math.abs(remaining) > EPS) {
    const step = remaining > 0 ? Math.min(remaining, MAX_STEP) : Math.max(remaining, -MAX_STEP);
    const nx = e.x + step;
    if (step > 0) {
      const tx = Math.floor((nx + e.w - EPS) / TILE);
      if (solidCol(grid, tx, e.y, e.y + e.h)) {
        e.x = tx * TILE - e.w;
        return true;
      }
    } else {
      const tx = Math.floor(nx / TILE);
      if (solidCol(grid, tx, e.y, e.y + e.h)) {
        e.x = (tx + 1) * TILE;
        return true;
      }
    }
    e.x = nx;
    remaining -= step;
  }
  return false;
}

/** Move vertically, landing on solids/platforms and bonking ceilings. Returns true if blocked. */
export function moveY(grid: TileGrid, e: Entity, dy: number): boolean {
  let remaining = dy;
  while (Math.abs(remaining) > EPS) {
    const step = remaining > 0 ? Math.min(remaining, MAX_STEP) : Math.max(remaining, -MAX_STEP);
    const ny = e.y + step;
    if (step > 0) {
      const prevBottom = e.y + e.h;
      const ty = Math.floor((ny + e.h - EPS) / TILE);
      if (landRow(grid, ty, e.x, e.x + e.w, prevBottom, e.usesPlatforms)) {
        e.y = ty * TILE - e.h;
        return true;
      }
    } else {
      const ty = Math.floor(ny / TILE);
      if (solidRow(grid, ty, e.x, e.x + e.w)) {
        e.y = (ty + 1) * TILE;
        return true;
      }
    }
    e.y = ny;
    remaining -= step;
  }
  return false;
}

/** True if something walkable is directly under the entity's feet. */
export function groundBelow(grid: TileGrid, e: Entity): boolean {
  const bottom = e.y + e.h;
  const ty = Math.floor((bottom + 0.5) / TILE);
  if (Math.abs(bottom - ty * TILE) > 0.5) return false;
  return landRow(grid, ty, e.x, e.x + e.w, bottom, e.usesPlatforms);
}

/** Probe a tile property over the entity's centre column. */
export function overlapsTile(grid: TileGrid, e: Entity, pred: (id: number) => boolean): boolean {
  const cx = Math.floor((e.x + e.w / 2) / TILE);
  const t0 = Math.floor(e.y / TILE);
  const t1 = Math.floor((e.y + e.h - EPS) / TILE);
  for (let ty = t0; ty <= t1; ty++) if (pred(grid.get(cx, ty))) return true;
  return false;
}

/** Integrate velocity (with gravity) and resolve tile collisions for one entity. */
export function integrate(world: World, e: Entity): void {
  const grid = world.level.grid;
  e.inLiquid = overlapsTile(grid, e, (id) => tileProps(id).liquid);
  e.onLadder = overlapsTile(grid, e, (id) => tileProps(id).climbable);

  if (e.gravityScale !== 0) {
    const g = PHYS.gravity * e.gravityScale * (e.inLiquid ? PHYS.swimGravityScale : 1);
    e.vy += g * DT;
    const maxFall = e.inLiquid ? PHYS.swimMaxFall : PHYS.maxFall;
    if (e.vy > maxFall) e.vy = maxFall;
  }

  if (!e.collides) {
    e.x += e.vx * DT;
    e.y += e.vy * DT;
    e.onGround = false;
    e.wallDir = 0;
    e.hitCeiling = false;
    return;
  }

  e.wallDir = 0;
  if (moveX(grid, e, e.vx * DT)) {
    e.wallDir = e.vx > 0 ? 1 : -1;
    e.vx = 0;
  }
  const falling = e.vy >= 0;
  e.hitCeiling = false;
  if (moveY(grid, e, e.vy * DT)) {
    if (falling) e.vy = 0;
    else {
      e.hitCeiling = true;
      e.vy = 0;
    }
  }
  e.onGround = e.vy >= 0 && groundBelow(grid, e);
}

/** Physics system: integrates every mobile entity. Static entities set gravityScale 0 and zero velocity. */
export function physicsSystem(world: World): void {
  if (world.freeze > 0) return;
  for (const e of world.entities) {
    if (e.dead) continue;
    if (e.gravityScale === 0 && e.vx === 0 && e.vy === 0) {
      e.onGround = e.collides && groundBelow(world.level.grid, e);
      continue;
    }
    integrate(world, e);
  }
}
