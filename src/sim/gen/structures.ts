import { Content } from '../../content';
import { clamp } from '../../engine/math';
import { TILE } from '../constants';
import { Tile, Wall } from '../tiles';
import type { ExitPortal } from '../world';
import { carve, put } from './grid';
import { makeNoise, noise01 } from './noise';
import type { RouteProfile } from './district';
import { F_CLAIM, F_NOHAZ, F_PROTECT, type GenCtx, type TRect } from './types';

/** Portal footprint in tiles (32×24 px stone arch). */
export const PORTAL_W = 4;
export const PORTAL_H = 3;
/** Columns reserved at the right end of a normal district for the exit terraces. */
export const EXIT_W = 30;

/** Portal standing on floor row `floorRow`, left column `x`. Protects its footprint. */
export function placePortal(ctx: GenCtx, x: number, floorRow: number, biome: string): ExitPortal {
  const { w, flags } = ctx;
  for (let xx = x; xx < x + PORTAL_W; xx++) {
    for (let y = floorRow - PORTAL_H; y < floorRow; y++) {
      carve(ctx, xx, y);
      flags[y * w + xx]! |= F_PROTECT | F_CLAIM | F_NOHAZ;
    }
    if (ctx.grid.get(xx, floorRow) !== Tile.BEDROCK) put(ctx, xx, floorRow, Tile.GROUND);
    flags[floorRow * w + xx]! |= F_PROTECT;
  }
  return { x: x * TILE, y: (floorRow - PORTAL_H) * TILE, w: PORTAL_W * TILE, h: PORTAL_H * TILE, biome };
}

/**
 * Exit terraces at the right end of a district: one terrace per destination biome, each ≤ 3 tiles
 * above/below the previous (single-jump steps), a portal centred on each.
 */
export function buildExitTerraces(ctx: GenCtx, p: RouteProfile, biomes: string[]): void {
  const { rng, w, h, flags } = ctx;
  const n = Math.max(1, biomes.length);
  const tw = 7;
  const xEnd = w - 2;
  const xStart = xEnd - n * tw + 1;
  const lead = p.floor[xStart - 1]!;
  const rows: number[] = [];
  let f = lead;
  for (let i = 0; i < n; i++) {
    f = clamp(f + (i === 0 ? rng.int(-1, 1) : rng.int(-3, 3)), 14, h - 6);
    if (i > 0 && rows[i - 1]! - f > 3) f = rows[i - 1]! - 3;
    rows.push(f);
  }
  const top = Math.min(...rows, lead) - 8;
  for (let i = 0; i < n; i++) {
    const fr = rows[i]!;
    for (let x = xStart + i * tw; x < xStart + (i + 1) * tw && x <= xEnd; x++) {
      p.floor[x] = fr;
      for (let y = Math.max(2, top); y < fr; y++) {
        carve(ctx, x, y);
        flags[y * w + x]! |= F_NOHAZ;
      }
      for (let y = fr; y <= fr + 2 && y < h - 1; y++) put(ctx, x, y, Tile.GROUND);
    }
  }
  // Lead-in: open the columns between the route and the first terrace.
  for (let x = xStart - 8; x < xStart; x++) {
    for (let y = Math.max(2, top); y < p.floor[x]!; y++) carve(ctx, x, y);
  }
  ctx.floor.set(p.floor);
  for (let i = 0; i < biomes.length || i === 0; i++) {
    const x = xStart + i * tw + 1 + (i === n - 1 ? 1 : rng.int(0, 1));
    ctx.exits.push(placePortal(ctx, Math.min(x, xEnd - PORTAL_W + 1), rows[i]!, biomes[i] ?? ''));
  }
}

export interface ArenaSpec {
  w: number;
  h: number;
}

export function arenaSize(bossId: string): ArenaSpec {
  const d = Content.bosses.get(bossId);
  const a = d?.arena ?? { w: 60, h: 30 };
  return { w: clamp(a.w, 40, 90), h: clamp(a.h, 18, 36) };
}

/**
 * Bedrock-walled boss arena whose left door opens at `floorRow` on column `x0` (the arena's outer
 * left wall). Interior is `size`; one-way platforms for dodging; exit ledge with the portals on the
 * right. Returns the interior rect (tiles).
 */
export function buildArena(ctx: GenCtx, x0: number, floorRow: number, size: ArenaSpec, exitBiomes: string[] | null): TRect {
  const { w, h, rng, flags, grid } = ctx;
  const ix0 = x0 + 2;
  const ix1 = ix0 + size.w - 1;
  const iy1 = floorRow - 1;
  const iy0 = Math.max(3, floorRow - size.h);
  const ox1 = Math.min(w - 1, ix1 + 2);
  for (let y = Math.max(0, iy0 - 2); y <= Math.min(h - 1, floorRow + 2); y++) {
    for (let x = x0; x <= ox1; x++) {
      grid.fg[y * w + x] = Tile.BEDROCK;
      grid.bg[y * w + x] = Wall.CAVE;
      flags[y * w + x]! |= F_PROTECT | F_NOHAZ;
    }
  }
  for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) grid.fg[y * w + x] = Tile.AIR;
  for (let x = ix0; x <= ix1; x++) grid.fg[floorRow * w + x] = Tile.GROUND;
  // Door in the left wall.
  for (let x = x0; x < ix0; x++) {
    for (let y = floorRow - 4; y < floorRow; y++) grid.fg[y * w + x] = Tile.AIR;
    grid.fg[floorRow * w + x] = Tile.GROUND;
  }
  ctx.arenaDoor = { x0, y0: floorRow - 4, x1: ix0 - 1, y1: floorRow - 1 };
  // Exit ledge (3 tiles up) with the portals, against the right wall.
  let fightX1 = ix1;
  if (exitBiomes) {
    const n = Math.max(1, exitBiomes.length);
    const lw = n * 6 + 2;
    const lx0 = ix1 - lw + 1;
    const ledge = floorRow - 3;
    for (let x = lx0; x <= ix1; x++) for (let y = ledge; y < floorRow; y++) grid.fg[y * w + x] = Tile.GROUND;
    for (let i = 0; i < n; i++) {
      const px = lx0 + 2 + i * 6;
      for (let xx = px; xx < px + PORTAL_W; xx++) for (let y = ledge - PORTAL_H; y < ledge; y++) flags[y * w + xx]! |= F_CLAIM;
      ctx.exits.push({ x: px * TILE, y: (ledge - PORTAL_H) * TILE, w: PORTAL_W * TILE, h: PORTAL_H * TILE, biome: exitBiomes[i] ?? '' });
    }
    fightX1 = lx0 - 1;
  }
  // Dodging platforms: tiers 4 rows apart (double-jump escapes; bosses fit under the first),
  // fewer and narrower the higher they are (flying bosses get the upper air).
  const span = fightX1 - ix0;
  const tiers = size.h >= 24 ? [floorRow - 5, floorRow - 9, floorRow - 13] : size.h >= 14 ? [floorRow - 5, floorRow - 9] : [floorRow - 5];
  tiers.forEach((ty, ti) => {
    if (ty <= iy0 + 2) return;
    const count = ti === 0 ? 2 + (span > 40 ? 1 : 0) : 2;
    for (let k = 0; k < count; k++) {
      const pw = ti === 2 ? rng.int(3, 5) : rng.int(4, 7);
      const cx = ix0 + Math.round(((k + 1) / (count + 1)) * span) + (ti >= 1 ? rng.int(-3, 3) : 0);
      for (let x = cx - (pw >> 1); x < cx - (pw >> 1) + pw; x++) if (x > ix0 && x < fightX1) grid.fg[ty * w + x] = Tile.PLATFORM;
    }
  });
  return { x0: ix0, y0: iy0, x1: ix1, y1: iy1 };
}

/** The final lair: the whole level is one bedrock-walled arena, spawn on the left. */
export function buildLair(ctx: GenCtx): TRect {
  const { w, h, grid, flags, rng } = ctx;
  grid.fg.fill(Tile.BEDROCK);
  grid.bg.fill(Wall.CAVE);
  const floorRow = h - 5;
  const ix0 = 2;
  const ix1 = w - 3;
  const iy0 = 3;
  for (let y = iy0; y < floorRow; y++) for (let x = ix0; x <= ix1; x++) grid.fg[y * w + x] = Tile.AIR;
  for (let x = ix0; x <= ix1; x++) {
    grid.fg[floorRow * w + x] = Tile.GROUND;
    grid.fg[(floorRow + 1) * w + x] = Tile.GROUND;
  }
  // Uneven ceiling with hanging blight growths (bedrock stays the shell), low blight mounds on the
  // floor (≤ 1 tile, never in the spawn pad).
  const noise = makeNoise(rng);
  for (let x = ix0; x <= ix1; x++) {
    const hang = Math.max(0, Math.round(noise01(noise, x * 0.18, 1) * 7 - 2.5));
    for (let y = iy0; y < iy0 + hang; y++) grid.fg[y * w + x] = Tile.GROUND;
    if (x > 10 && x < ix1 - 2 && noise01(noise, x * 0.25, 7) > 0.68) grid.fg[(floorRow - 1) * w + x] = Tile.GROUND;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) flags[y * w + x]! |= F_NOHAZ;
  for (const ty of [floorRow - 5, floorRow - 10]) {
    if (ty <= iy0 + 3) continue;
    for (let k = 0; k < 4; k++) {
      const cx = ix0 + 14 + Math.round((k / 3) * (ix1 - ix0 - 28)) + rng.int(-2, 2);
      const pw = rng.int(4, 6);
      for (let x = cx - 2; x < cx - 2 + pw; x++) grid.fg[ty * w + x] = Tile.PLATFORM;
    }
  }
  ctx.spawnTx = 5;
  ctx.spawnTy = floorRow - 1;
  for (let x = 2; x <= 8; x++) for (let y = floorRow - 3; y <= floorRow; y++) flags[y * w + x]! |= F_PROTECT;
  return { x0: ix0, y0: iy0, x1: ix1, y1: floorRow - 1 };
}
