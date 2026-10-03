import { DT, PHYS, TILE } from './constants';
import { Tile, tileProps, type TileGrid } from './tiles';
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

/**
 * Tile acts as a one-way platform: PLATFORM tiles, and the top rung of a ladder (a ladder tile with
 * no ladder above it) so you can stand on ladder tops and climb down through them.
 */
export function isPlatformTile(grid: TileGrid, tx: number, ty: number): boolean {
  const id = grid.get(tx, ty);
  if (tileProps(id).oneWay) return true;
  return id === Tile.LADDER && grid.get(tx, ty - 1) !== Tile.LADDER;
}

/** Row blocks downward motion: solid, or a one-way platform whose top we were above. */
function landRow(grid: TileGrid, ty: number, x0: number, x1: number, prevBottom: number, platforms: boolean): boolean {
  const t0 = Math.floor(x0 / TILE);
  const t1 = Math.floor((x1 - EPS) / TILE);
  const above = prevBottom <= ty * TILE + EPS;
  for (let tx = t0; tx <= t1; tx++) {
    if (tileProps(grid.get(tx, ty)).solid) return true;
    if (platforms && above && isPlatformTile(grid, tx, ty)) return true;
  }
  return false;
}

function solidRow(grid: TileGrid, ty: number, x0: number, x1: number): boolean {
  const t0 = Math.floor(x0 / TILE);
  const t1 = Math.floor((x1 - EPS) / TILE);
  for (let tx = t0; tx <= t1; tx++) if (tileProps(grid.get(tx, ty)).solid) return true;
  return false;
}

/** True if the rect overlaps no solid tile (one-way platforms, ladders and liquids don't count). */
export function rectFree(grid: TileGrid, x: number, y: number, w: number, h: number): boolean {
  const tx0 = Math.floor(x / TILE);
  const tx1 = Math.floor((x + w - EPS) / TILE);
  const ty0 = Math.floor(y / TILE);
  const ty1 = Math.floor((y + h - EPS) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) if (tileProps(grid.get(tx, ty)).solid) return false;
  }
  return true;
}

/**
 * Move horizontally, stopping at solid tiles. Returns true if blocked.
 * `nudge` > 0 (players in the air): if the blocking corner overlaps the hitbox by ≤ nudge px at the
 * feet (barely missed a ledge) pop up onto it; when falling, ≤ nudge px at the head slips under a lip.
 */
export function moveX(grid: TileGrid, e: Entity, dx: number, nudge = 0): boolean {
  let remaining = dx;
  while (Math.abs(remaining) > EPS) {
    const step = remaining > 0 ? Math.min(remaining, MAX_STEP) : Math.max(remaining, -MAX_STEP);
    const nx = e.x + step;
    const tx = step > 0 ? Math.floor((nx + e.w - EPS) / TILE) : Math.floor(nx / TILE);
    if (solidCol(grid, tx, e.y, e.y + e.h)) {
      if (nudge > 0 && tryLedgeNudge(grid, e, nx, nudge)) {
        remaining -= step;
        continue;
      }
      e.x = step > 0 ? tx * TILE - e.w : (tx + 1) * TILE;
      return true;
    }
    e.x = nx;
    remaining -= step;
  }
  return false;
}

function tryLedgeNudge(grid: TileGrid, e: Entity, nx: number, max: number): boolean {
  for (let d = 1; d <= max; d++) {
    if (rectFree(grid, nx, e.y - d, e.w, e.h) && rectFree(grid, e.x, e.y - d, e.w, e.h)) {
      e.y -= d;
      e.x = nx;
      return true;
    }
    if (e.vy >= 0 && rectFree(grid, nx, e.y + d, e.w, e.h) && rectFree(grid, e.x, e.y + d, e.w, e.h)) {
      e.y += d;
      e.x = nx;
      return true;
    }
  }
  return false;
}

/**
 * Move vertically, landing on solids/platforms and bonking ceilings. Returns true if blocked.
 * `corner` > 0 (players): when rising into a ceiling corner that overlaps the hitbox by ≤ corner px,
 * slide sideways around it instead of bonking.
 */
export function moveY(grid: TileGrid, e: Entity, dy: number, corner = 0): boolean {
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
      if (solidRow(grid, ty, e.x, e.x + e.w) && !(corner > 0 && tryCornerNudge(grid, e, ny, corner))) {
        e.y = (ty + 1) * TILE;
        return true;
      }
    }
    e.y = ny;
    remaining -= step;
  }
  return false;
}

function tryCornerNudge(grid: TileGrid, e: Entity, ny: number, max: number): boolean {
  // Prefer the side we're already drifting toward; ties go right (deterministic).
  const first = e.vx < 0 ? -1 : 1;
  for (let d = 1; d <= max; d++) {
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? first : -first;
      const nx = e.x + s * d;
      if (rectFree(grid, nx, ny, e.w, e.h) && rectFree(grid, nx, e.y, e.w, e.h)) {
        e.x = nx;
        return true;
      }
    }
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

/**
 * Distance in px (≤ max) the entity can fall before landing, or `max` if nothing is within reach.
 * Used for "smart" double jumps (don't burn stamina a few px above the floor).
 */
export function dropDistance(grid: TileGrid, e: Entity, max: number): number {
  const bottom = e.y + e.h;
  const ty0 = Math.floor((bottom + EPS) / TILE);
  const ty1 = Math.floor((bottom + max) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    if (landRow(grid, ty, e.x, e.x + e.w, bottom, e.usesPlatforms)) return Math.min(max, Math.max(0, ty * TILE - bottom));
  }
  return max;
}

/** Probe a tile property over the entity's centre column. */
export function overlapsTile(grid: TileGrid, e: Entity, pred: (id: number) => boolean): boolean {
  const cx = Math.floor((e.x + e.w / 2) / TILE);
  const t0 = Math.floor(e.y / TILE);
  const t1 = Math.floor((e.y + e.h - EPS) / TILE);
  for (let ty = t0; ty <= t1; ty++) if (pred(grid.get(cx, ty))) return true;
  return false;
}

/** Liquid over the entity's centre column: Tile.LAVA wins over Tile.WATER; 0 = dry. Allocation-free. */
export function liquidAt(grid: TileGrid, e: Entity): number {
  const cx = Math.floor((e.x + e.w / 2) / TILE);
  const t0 = Math.floor(e.y / TILE);
  const t1 = Math.floor((e.y + e.h - EPS) / TILE);
  let found = 0;
  for (let ty = t0; ty <= t1; ty++) {
    const id = grid.get(cx, ty);
    if (id === Tile.LAVA) return Tile.LAVA;
    if (tileProps(id).liquid) found = id;
  }
  return found;
}

/** Ladder tile overlapping the entity's centre column. */
export function ladderAt(grid: TileGrid, e: Entity): boolean {
  const cx = Math.floor((e.x + e.w / 2) / TILE);
  const t0 = Math.floor(e.y / TILE);
  const t1 = Math.floor((e.y + e.h - EPS) / TILE);
  for (let ty = t0; ty <= t1; ty++) if (tileProps(grid.get(cx, ty)).climbable) return true;
  return false;
}

/** Standing on top of a ladder (ladder tile right under the feet at the centre column). */
export function ladderBelow(grid: TileGrid, e: Entity): boolean {
  const bottom = e.y + e.h;
  const ty = Math.floor((bottom + 0.5) / TILE);
  if (Math.abs(bottom - ty * TILE) > 0.5) return false;
  return tileProps(grid.get(Math.floor((e.x + e.w / 2) / TILE), ty)).climbable;
}

/**
 * Nearest position (hitbox top-left) where `e` overlaps no solid tile, searching outward up to
 * `maxPx` (up first, then sideways, then down). Returns false if none was found (e untouched).
 */
export function pushOutOfSolids(grid: TileGrid, e: Entity, maxPx = 2 * TILE): boolean {
  if (rectFree(grid, e.x, e.y, e.w, e.h)) return true;
  for (let d = 1; d <= maxPx; d++) {
    if (rectFree(grid, e.x, e.y - d, e.w, e.h)) {
      e.y -= d;
      return true;
    }
    if (rectFree(grid, e.x - d, e.y, e.w, e.h)) {
      e.x -= d;
      return true;
    }
    if (rectFree(grid, e.x + d, e.y, e.w, e.h)) {
      e.x += d;
      return true;
    }
    if (rectFree(grid, e.x, e.y + d, e.w, e.h)) {
      e.y += d;
      return true;
    }
  }
  return false;
}

/** Integrate velocity (with gravity) and resolve tile collisions for one entity. */
export function integrate(world: World, e: Entity): void {
  const grid = world.level.grid;
  const isPlayer = e.kind === 'player';

  if (e.gravityScale !== 0) {
    const liquid = e.inLiquid ? liquidAt(grid, e) : 0;
    const vy0 = e.vy;
    let g = PHYS.gravity * e.gravityScale;
    let maxFall: number = PHYS.maxFall;
    if (liquid === Tile.LAVA) {
      g *= PHYS.lavaGravityScale;
      maxFall = PHYS.lavaMaxFall;
    } else if (liquid !== 0) {
      g *= PHYS.swimGravityScale;
      maxFall = PHYS.swimMaxFall;
    } else if (e.vy > 0) g *= PHYS.fallGravity;
    e.vy += g * DT;
    if (e.vy > maxFall) {
      // Liquids brake hard falls smoothly; in air, something already faster than terminal
      // velocity (a dive, a slam) keeps its speed instead of being clamped.
      if (liquid !== 0) e.vy = Math.max(maxFall, vy0 - PHYS.liquidDrag * DT);
      else e.vy = Math.max(maxFall, Math.min(e.vy, vy0));
    }
  }

  if (!e.collides) {
    e.x += e.vx * DT;
    e.y += e.vy * DT;
    e.onGround = false;
    e.wallDir = 0;
    e.hitCeiling = false;
    e.inLiquid = false;
    e.onLadder = false;
    return;
  }

  e.wallDir = 0;
  if (moveX(grid, e, e.vx * DT, isPlayer && !e.onGround ? PHYS.ledgeNudge : 0)) {
    e.wallDir = e.vx > 0 ? 1 : -1;
    e.vx = 0;
  }
  const falling = e.vy >= 0;
  e.hitCeiling = false;
  if (moveY(grid, e, e.vy * DT, isPlayer ? PHYS.cornerCorrect : 0)) {
    if (falling) e.vy = 0;
    else {
      e.hitCeiling = true;
      e.vy = 0;
    }
  }
  e.onGround = e.vy >= 0 && groundBelow(grid, e);
  // Contact flags describe the post-move position so the next controller tick sees fresh state.
  e.inLiquid = liquidAt(grid, e) !== 0;
  e.onLadder = ladderAt(grid, e);
}

/** One entity's physics tick (what physicsSystem does per entity; also used by client prediction). */
export function stepBody(world: World, e: Entity): void {
  if (e.gravityScale === 0 && e.vx === 0 && e.vy === 0) {
    e.onGround = e.collides && groundBelow(world.level.grid, e);
    return;
  }
  integrate(world, e);
}

/** Physics system: integrates every mobile entity. Static entities set gravityScale 0 and zero velocity. */
export function physicsSystem(world: World): void {
  if (world.freeze > 0) return;
  for (const e of world.entities) if (!e.dead) stepBody(world, e);
}
