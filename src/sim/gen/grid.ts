import { Tile, TILE_PROPS, type TileGrid } from '../tiles';
import { F_PROTECT, type GenCtx } from './types';

/** Per tile id lookups (avoid object property chains in hot loops). */
const N = TILE_PROPS.length;
export const IS_SOLID = new Uint8Array(N);
export const IS_HAZARD = new Uint8Array(N);
export const IS_LIQUID = new Uint8Array(N);
for (const p of TILE_PROPS) {
  IS_SOLID[p.id] = p.solid ? 1 : 0;
  IS_HAZARD[p.id] = p.hazard > 0 ? 1 : 0;
  IS_LIQUID[p.id] = p.liquid ? 1 : 0;
}

export const solidAt = (g: TileGrid, x: number, y: number): boolean => IS_SOLID[g.get(x, y)] === 1;
/** A body may occupy the cell (not solid, not a hazard). Out of bounds = bedrock. */
export const freeAt = (g: TileGrid, x: number, y: number): boolean => {
  const t = g.get(x, y);
  return IS_SOLID[t] === 0 && IS_HAZARD[t] === 0;
};
export const airAt = (g: TileGrid, x: number, y: number): boolean => g.get(x, y) === Tile.AIR;

/** Natural terrain the generator may carve or reshape. */
export const isTerrain = (t: number): boolean => t === Tile.GROUND || t === Tile.ROCK || t === Tile.SPECIAL;

/** Set a tile unless the cell is protected or bedrock. */
export function put(ctx: GenCtx, x: number, y: number, tile: number): boolean {
  if (x <= 0 || y <= 0 || x >= ctx.w - 1 || y >= ctx.h - 1) return false;
  const i = y * ctx.w + x;
  if (ctx.flags[i]! & F_PROTECT) return false;
  if (ctx.grid.fg[i] === Tile.BEDROCK) return false;
  ctx.grid.fg[i] = tile;
  return true;
}

/** Carve to air (keeps liquids/ladders/platforms; only removes solids and hazards). */
export function carve(ctx: GenCtx, x: number, y: number): void {
  const t = ctx.grid.get(x, y);
  if (IS_SOLID[t] || IS_HAZARD[t]) put(ctx, x, y, Tile.AIR);
}

export function carveRect(ctx: GenCtx, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) carve(ctx, x, y);
}

export function fillRect(ctx: GenCtx, x0: number, y0: number, x1: number, y1: number, tile: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(ctx, x, y, tile);
}

/** Cell is a standing spot: body (2 tall) fits and something solid is underfoot. */
export function groundSpot(g: TileGrid, x: number, y: number): boolean {
  return airAt(g, x, y) && airAt(g, x, y - 1) && solidAt(g, x, y + 1) && g.get(x, y + 1) !== Tile.BEDROCK;
}

/** Number of consecutive air cells above (x,y) inclusive, capped. */
export function headroom(g: TileGrid, x: number, y: number, cap = 64): number {
  let n = 0;
  while (n < cap && airAt(g, x, y - n)) n++;
  return n;
}

/** FNV-1a over both tile layers — used by tests to compare generated grids. */
export function gridHash(g: TileGrid): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < g.fg.length; i++) {
    h = Math.imul(h ^ g.fg[i]!, 16777619);
    h = Math.imul(h ^ g.bg[i]!, 16777619);
  }
  return h >>> 0;
}
