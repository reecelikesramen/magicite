import { hash01 } from '../../engine/rng';
import { TILE } from '../../sim/constants';
import { CHUNK, Tile, TILE_PROPS, Wall } from '../../sim/tiles';
import { blue, green, ramp, red, shade } from '../color';
import type { BiomeStyle } from '../style';
import { patterns, type PatternSet } from './pattern';

/**
 * Procedural tile painter (pure, DOM-free): fills RGBA buffers for one 32×32-tile chunk from
 * the TileGrid + biome style. Every pixel is a function of its tile and the 8 neighbours, so a
 * region can be repainted after a tile edit (dirty rect = changed tiles ± 1).
 *
 * Two outputs per chunk:
 *  - `rgba`: back wall + terrain (drawn under the lightmap, so it is darkened by lighting);
 *  - `glow`: emissive pixels only (lava, glowing crust/crystal/cracks) drawn after the lightmap.
 */
export interface GridView {
  readonly w: number;
  readonly h: number;
  get(tx: number, ty: number): number;
  getWall(tx: number, ty: number): number;
}

export const CHUNK_PX = CHUNK * TILE;

export interface ChunkBuffers {
  /** Buffer edge in px (CHUNK_PX). */
  size: number;
  rgba: Uint8ClampedArray;
  glow: Uint8ClampedArray;
}

export function makeChunkBuffers(): ChunkBuffers {
  return { size: CHUNK_PX, rgba: new Uint8ClampedArray(CHUNK_PX * CHUNK_PX * 4), glow: new Uint8ClampedArray(CHUNK_PX * CHUNK_PX * 4) };
}

/** A light-emitting surface run (merged lava/crust/crystal tiles), in world px. */
export interface Emitter {
  x: number;
  y: number;
  /** Run length in px (0 = point). */
  w: number;
  color: number;
  intensity: number;
  radius: number;
}

/** Liquid surface run (for the animated surface overlay), in tiles. */
export interface Surface {
  tx0: number;
  tx1: number;
  ty: number;
  kind: 'water' | 'lava';
}

export interface ChunkMeta {
  emitters: Emitter[];
  surfaces: Surface[];
  /** CHUNK×CHUNK, 1 = open sky (no wall, not solid) → lightmap stays neutral there. */
  sky: Uint8Array;
  skyCount: number;
}

const SOLID = new Uint8Array(256);
for (const p of TILE_PROPS) SOLID[p.id] = p.solid ? 1 : 0;
for (let i = TILE_PROPS.length; i < 256; i++) SOLID[i] = 1;

const isNatural = (id: number): boolean => id === Tile.GROUND || id === Tile.ROCK || id === Tile.BEDROCK || id === Tile.SPECIAL;
/** Tiles fringe (grass etc.) can grow into. */
const fringeOpen = (id: number): boolean => id === Tile.AIR || id === Tile.LADDER;
const isLiquid = (id: number): boolean => id === Tile.WATER || id === Tile.LAVA;

// Scratch outputs (avoid allocations in the hot loop).
let outA = 255;
let outGlow = 0;

/** Grass / fringe blade height (0..3 px) poking above a top face at world column gx. */
export function bladeHeight(st: BiomeStyle, gx: number): number {
  switch (st.fringe) {
    case 'grass': {
      const a = hash01(gx >> 1, 3, 77);
      const b = hash01(gx, 5, 78);
      const h = Math.floor(a * 2.4 + b * 1.3);
      return h > 3 ? 3 : h;
    }
    case 'snow': {
      const q = gx >> 2;
      const f = (gx & 3) / 4;
      const n = hash01(q, 1, 81) * (1 - f) + hash01(q + 1, 1, 81) * f;
      return n < 0.35 ? 1 : n < 0.85 ? 2 : 3;
    }
    case 'crust':
      return hash01(gx, 2, 82) < 0.35 ? 1 : 0;
    case 'crystal': {
      const r = hash01(gx, 4, 83);
      if (r < 0.16) return 1 + Math.floor(hash01(gx, 5, 84) * 3);
      return r < 0.55 ? 1 : 0;
    }
    case 'moss': {
      const r = hash01(gx, 6, 85);
      return r < 0.3 ? 1 : r < 0.4 ? 2 : 0;
    }
    case 'blight': {
      const r = hash01(gx, 7, 86);
      return r < 0.22 ? 1 + (r < 0.08 ? 1 : 0) : 0;
    }
  }
}

/** Colour of a fringe blade pixel `k` px below its tip (k=0 tip), for blade height h. */
function bladeColor(st: BiomeStyle, gx: number, k: number, h: number): number {
  const f = st.pal.fringe;
  outGlow = 0;
  switch (st.fringe) {
    case 'grass':
      if (k === 0) return h >= 2 ? ramp(f, 3) : ramp(f, 2);
      return k === 1 ? ramp(f, 2) : ramp(f, 1);
    case 'snow':
      return k === 0 ? ramp(f, 3) : ramp(f, 2);
    case 'crust':
      outGlow = 255;
      return ramp(f, 2);
    case 'crystal':
      if (h >= 2 || hash01(gx, 8, 87) < 0.3) {
        outGlow = k === 0 ? 255 : 200;
        return k === 0 ? ramp(f, 3) : ramp(f, 2);
      }
      return ramp(f, 1);
    case 'moss':
      return k === 0 ? ramp(f, 2) : ramp(f, 1);
    case 'blight':
      outGlow = 220;
      return k === 0 ? ramp(f, 3) : ramp(f, 2);
  }
}

/** Back-wall colour (or -1 = none) with ambient occlusion near solid tiles. */
function wallColor(st: BiomeStyle, pat: PatternSet, wall: number, gx: number, gy: number, ao: number): number {
  if (wall === Wall.NONE) return -1;
  const w = st.pal.wall;
  if (wall === Wall.BRICK) {
    const row = gy >> 2;
    const mortar = (gy & 3) === 3 || ((gx + (row & 1) * 4) & 7) === 7;
    const c = mortar ? ramp(w, 0) : (gy & 3) === 0 ? ramp(w, 3) : hash01(((gx + (row & 1) * 4) >> 3), row, 61) < 0.4 ? ramp(w, 1) : ramp(w, 2);
    return ao ? shade(c, 0.7) : c;
  }
  if (wall === Wall.WOOD) {
    const gap = (gy & 3) === 3 || ((gx + 5 * (gy >> 2)) & 15) === 0;
    const wd = st.wood;
    const c = gap ? shade(ramp(wd, 0), 0.6) : shade(hash01(gx >> 2, gy >> 2, 62) < 0.5 ? ramp(wd, 1) : ramp(wd, 0), 0.75);
    return ao ? shade(c, 0.7) : c;
  }
  const p = pat.wall;
  const o = (gy & p.mask) * p.size + (gx & p.mask);
  const lv = p.level[o]!;
  const cv = p.cell[o]!;
  let i = lv === 0 ? 0 : lv === 1 ? 1 : lv === 3 ? 3 : (cv & 3) === 0 ? 1 : 2;
  i -= ao;
  return i < 0 ? shade(w[0]!, 0.7) : ramp(w, i);
}

/** Pixel of a natural/man-made solid tile. Returns -1 to show what's behind (eroded edge). */
function solidColor(
  st: BiomeStyle,
  pat: PatternSet,
  id: number,
  gx: number,
  gy: number,
  px: number,
  py: number,
  eT: boolean,
  eB: boolean,
  eL: boolean,
  eR: boolean,
  fT: boolean,
  fL: boolean,
  fR: boolean,
): number {
  outGlow = 0;
  const pal = st.pal;
  // Rounded outer corners.
  if (isNatural(id)) {
    if ((eT && eL && px + py < 2) || (eT && eR && 7 - px + py < 2) || (eB && eL && px + 7 - py < 2) || (eB && eR && 14 - px - py < 2)) return -1;
  }
  if (id === Tile.BRICK) {
    const row = gy >> 2;
    const b = st.brick;
    if ((gy & 3) === 3 || ((gx + (row & 1) * 4) & 7) === 7) return ramp(b, 0);
    if ((gy & 3) === 0) return ramp(b, 3);
    return hash01((gx + (row & 1) * 4) >> 3, row, 63) < 0.35 ? ramp(b, 1) : ramp(b, 2);
  }
  if (id === Tile.WOOD) {
    const wd = st.wood;
    if ((gy & 3) === 3 || ((gx + 5 * (gy >> 2)) & 15) === 0) return ramp(wd, 0);
    if ((gy & 3) === 0) return ramp(wd, 3);
    return hash01(gx >> 1, gy, 64) < 0.15 ? ramp(wd, 1) : ramp(wd, 2);
  }

  const dT = eT ? py : 99;
  const dB = eB ? 7 - py : 99;
  const dL = eL ? px : 99;
  const dR = eR ? 7 - px : 99;

  // --- Fringe mat on exposed top / side faces ------------------------------------------
  if (id !== Tile.SPECIAL || st.special === 'mud') {
    const f = pal.fringe;
    if (fT) {
      switch (st.fringe) {
        case 'grass': {
          let depth = 2 + (hash01(gx, 4, 90) < 0.45 ? 1 : 0);
          if (hash01(gx >> 1, 9, 91) < 0.14) depth += 2;
          if (py < depth) return py === 0 ? (hash01(gx, 1, 92) < 0.35 ? ramp(f, 3) : ramp(f, 2)) : py === 1 ? ramp(f, 1) : ramp(f, 0);
          break;
        }
        case 'snow': {
          const depth = 2 + (hash01(gx >> 1, 2, 93) < 0.5 ? 1 : 0);
          if (py < depth) return py === 0 ? ramp(f, 3) : ramp(f, 2);
          if (py === depth && hash01(gx, 3, 94) < 0.4) return ramp(f, 1);
          break;
        }
        case 'crust': {
          if (py < 2 || (py === 2 && hash01(gx, 5, 95) < 0.4)) {
            outGlow = py === 0 ? 255 : py === 1 ? 235 : 160;
            return py === 0 ? ramp(f, 3) : py === 1 ? ramp(f, 2) : ramp(f, 1);
          }
          break;
        }
        case 'crystal': {
          if (py === 0 && hash01(gx, 6, 96) < 0.8) {
            outGlow = 170;
            return ramp(f, 1);
          }
          if (py === 1 && hash01(gx, 7, 97) < 0.3) return ramp(f, 0);
          break;
        }
        case 'moss': {
          if (py === 0 && hash01(gx, 8, 98) < 0.65) return ramp(f, 1);
          if (py === 1 && hash01(gx, 9, 99) < 0.25) return ramp(f, 0);
          break;
        }
        case 'blight': {
          if (py === 0 && hash01(gx, 10, 100) < 0.6) {
            outGlow = 150;
            return ramp(f, 1);
          }
          break;
        }
      }
    }
    if ((st.fringe === 'grass' || st.fringe === 'moss') && ((fL && px < 2) || (fR && px > 5))) {
      const col = fL && px < 2 ? px : 7 - px;
      const r = hash01(gy, fL && px < 2 ? 11 : 12, gx >> 3);
      if (col === 0 && r < (st.fringe === 'grass' ? 0.5 : 0.3)) return ramp(f, r < 0.15 ? 2 : 1);
      if (col === 1 && r < 0.18) return ramp(f, 0);
    }
    if (st.fringe === 'snow' && fT && ((fL && px === 0) || (fR && px === 7)) && py < 5 && hash01(gy, 13, 101) < 0.5) return ramp(f, 2);
  }

  // --- Body ----------------------------------------------------------------------------
  let p = pat.ground;
  let rmp = pal.ground;
  if (id === Tile.ROCK) {
    p = pat.rock;
    rmp = pal.rock;
  } else if (id === Tile.BEDROCK) p = pat.bedrock;
  else if (id === Tile.SPECIAL) p = st.special === 'ice' ? pat.wall : st.special === 'mud' ? pat.ground : pat.rock;
  const o = (gy & p.mask) * p.size + (gx & p.mask);
  const lv = p.level[o]!;
  const cv = p.cell[o]!;
  const dEdge = Math.min(dT, dB, dL, dR);
  // Lumpy silhouette: crevices on the outermost pixel of an exposed face are cut out.
  if (dEdge === 0 && lv === 0 && !(fT && dT === 0)) return -1;

  let c: number;
  if (id === Tile.BEDROCK) {
    const r = pal.rock;
    c = lv === 0 ? shade(r[0]!, 0.55) : lv === 1 ? shade(r[0]!, 0.8) : lv === 3 ? ramp(r, 1) : (cv & 3) === 0 ? ramp(r, 1) : ramp(r, 0);
  } else if (id === Tile.SPECIAL) {
    c = specialColor(st, lv, cv, gx, gy, dT);
  } else {
    let i = lv === 0 ? 0 : lv === 1 ? 1 : lv === 3 ? 3 : (cv & 7) === 1 ? 3 : (cv & 3) === 0 ? 1 : 2;
    if (id === Tile.ROCK && lv === 3) i = 3;
    c = ramp(rmp, i);
    if (id === Tile.GROUND && lv === 0 && st.crackGlow && (cv & 3) !== 3 && dEdge > 0) {
      outGlow = (cv & 4) ? 210 : 150;
      return st.crackGlow[(cv >> 3) & 1] ?? st.crackGlow[0]!;
    }
  }
  // Exposed rims: darker underside / sides, lighter tops (when no fringe covers them).
  if (dB === 0 || dL === 0 || dR === 0) c = shade(c, 0.78);
  else if (dT === 0 && !fT) c = shade(c, 1.25);
  return c;
}

function specialColor(st: BiomeStyle, lv: number, cv: number, gx: number, gy: number, dT: number): number {
  switch (st.special) {
    case 'mud': {
      if (dT === 0 && hash01(gx, 14, 102) < 0.45) return 0x6a5a3a;
      if (lv === 2 && hash01(gx, gy, 103) < 0.025) return 0x7a6a4a;
      return lv === 0 ? 0x140e08 : lv === 1 ? 0x22160c : lv === 3 ? 0x4a3820 : (cv & 1) ? 0x2e2012 : 0x382816;
    }
    case 'ice': {
      if (dT === 0) return 0xe8f8ff;
      if (lv >= 2 && ((gx + gy) & 15) < 2) return 0xd8f4ff;
      return lv === 0 ? 0x3a6a9a : lv === 1 ? 0x5a98cc : lv === 3 ? 0xb8e4fa : 0x80c0e8;
    }
    case 'crystal': {
      if (lv === 3 || (lv === 2 && (cv & 3) === 0)) {
        outGlow = lv === 3 ? 255 : 170;
        return lv === 3 ? 0xffa0ff : 0xc040ff;
      }
      return lv === 0 ? 0x2a1440 : lv === 1 ? 0x502078 : 0x7a30a0;
    }
    case 'obsidian': {
      if (lv === 0 && (cv & 1)) {
        outGlow = 200;
        return 0xff6020;
      }
      return lv === 0 ? 0x0a0606 : lv === 1 ? 0x16100e : lv === 3 ? 0x3a2c2a : 0x241a18;
    }
    case 'blight': {
      if (lv === 0) {
        outGlow = 190;
        return 0xff60b0;
      }
      return lv === 1 ? 0x2a0818 : lv === 3 ? 0x801850 : 0x4a1030;
    }
  }
}

function writePx(buf: ChunkBuffers, o: number, c: number, a: number, glow: number): void {
  const d = buf.rgba;
  const gbuf = buf.glow;
  if (c < 0) {
    d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0;
    gbuf[o] = gbuf[o + 1] = gbuf[o + 2] = gbuf[o + 3] = 0;
    return;
  }
  d[o] = red(c);
  d[o + 1] = green(c);
  d[o + 2] = blue(c);
  d[o + 3] = a;
  if (glow > 0) {
    // Straight (non-premultiplied) alpha, like canvas ImageData; Pixi premultiplies on upload.
    gbuf[o] = red(c);
    gbuf[o + 1] = green(c);
    gbuf[o + 2] = blue(c);
    gbuf[o + 3] = glow;
  } else gbuf[o] = gbuf[o + 1] = gbuf[o + 2] = gbuf[o + 3] = 0;
}

/**
 * Paint tiles [tx0..tx1]×[ty0..ty1] (absolute tile coords, clamped to chunk cx,cy) into `buf`.
 */
export function paintRegion(grid: GridView, st: BiomeStyle, cx: number, cy: number, tx0: number, ty0: number, tx1: number, ty1: number, buf: ChunkBuffers): void {
  const pat = patterns();
  const bx = cx * CHUNK;
  const by = cy * CHUNK;
  const x0 = Math.max(tx0, bx);
  const y0 = Math.max(ty0, by);
  const x1 = Math.min(tx1, bx + CHUNK - 1);
  const y1 = Math.min(ty1, by + CHUNK - 1);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) paintTile(grid, st, pat, tx, ty, bx * TILE, by * TILE, buf);
}

function paintTile(g: GridView, st: BiomeStyle, pat: PatternSet, tx: number, ty: number, ox: number, oy: number, buf: ChunkBuffers): void {
  const inside = tx >= 0 && ty >= 0 && tx < g.w && ty < g.h;
  if (!inside) {
    // Chunk area beyond the level edge stays transparent.
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) writePx(buf, ((ty * TILE + py - oy) * buf.size + (tx * TILE + px - ox)) * 4, -1, 0, 0);
    }
    return;
  }
  const id = g.get(tx, ty);
  const wall = g.getWall(tx, ty);
  const up = g.get(tx, ty - 1);
  const dn = g.get(tx, ty + 1);
  const lf = g.get(tx - 1, ty);
  const rt = g.get(tx + 1, ty);
  const solid = SOLID[id] === 1;
  // Exposed faces (neighbour not solid) and fringe-able faces (neighbour open air/ladder).
  const eT = !SOLID[up];
  const eB = !SOLID[dn];
  const eL = !SOLID[lf];
  const eR = !SOLID[rt];
  const nat = isNatural(id);
  const fT = nat && fringeOpen(up) && ty > 0;
  const fL = nat && fringeOpen(lf);
  const fR = nat && fringeOpen(rt);
  // For non-solid tiles: what grows into this tile from neighbours.
  const fromBelow = !solid && fringeOpen(id) && isNatural(dn) && SOLID[dn] === 1 && (dn !== Tile.SPECIAL || st.special === 'mud');
  const fromAbove = !solid && fringeOpen(id) && isNatural(up) && SOLID[up] === 1 && st.ceiling !== 'none';
  const sideL = !solid && fringeOpen(id) && isNatural(lf) && SOLID[lf] === 1 && (st.fringe === 'grass' || st.fringe === 'moss');
  const sideR = !solid && fringeOpen(id) && isNatural(rt) && SOLID[rt] === 1 && (st.fringe === 'grass' || st.fringe === 'moss');
  const aoUp = SOLID[up] === 1;
  const aoDn = SOLID[dn] === 1;
  const aoL = SOLID[lf] === 1;
  const aoR = SOLID[rt] === 1;
  const size = buf.size;
  const pal = st.pal;

  for (let py = 0; py < TILE; py++) {
    const gy = ty * TILE + py;
    for (let px = 0; px < TILE; px++) {
      const gx = tx * TILE + px;
      const o = ((gy - oy) * size + (gx - ox)) * 4;
      outA = 255;
      outGlow = 0;
      let c = -1;
      let glow = 0;
      if (solid) {
        c = solidColor(st, pat, id, gx, gy, px, py, eT, eB, eL, eR, fT, fL, fR);
        glow = outGlow;
      } else {
        // Overlays that live in non-solid tiles.
        switch (id) {
          case Tile.PLATFORM: {
            const wd = st.wood;
            if (py === 0) c = (gx & 7) === 0 ? ramp(wd, 2) : ramp(wd, 3);
            else if (py === 1) c = (gx & 7) === 0 ? ramp(wd, 0) : (gx & 7) === 2 && hash01(gx, ty, 3) < 0.5 ? ramp(wd, 3) : ramp(wd, 2);
            else if (py === 2) c = ramp(wd, 1);
            else {
              const endL = lf !== Tile.PLATFORM;
              const endR = rt !== Tile.PLATFORM;
              if (SOLID[dn] && (px === 1 || px === 6) && (endL || endR || (tx % 4 === 0))) c = ramp(wd, 1);
              else if (endL && !endR && px === py - 2 && py <= 6) c = ramp(wd, 1);
              else if (endR && !endL && 7 - px === py - 2 && py <= 6) c = ramp(wd, 1);
              else if (!endL && !endR && tx % 3 === 0 && py === 3 && (px === 3 || px === 4)) c = ramp(wd, 0);
            }
            break;
          }
          case Tile.LADDER: {
            const wd = st.wood;
            if (px === 1) c = ramp(wd, 2);
            else if (px === 6) c = ramp(wd, 1);
            else if ((py === 2 || py === 6) && px > 1 && px < 6) c = ramp(wd, 3);
            else if ((py === 3 || py === 7) && px > 1 && px < 6) c = ramp(wd, 0);
            break;
          }
          case Tile.SPIKES: {
            const upward = SOLID[dn] === 1 || !SOLID[up];
            const local = px & 3;
            const tall = local === 1 || local === 2;
            const hgt = tall ? 7 : 3;
            const k = upward ? 7 - py : py;
            if (k < hgt) {
              const sp = st.spikes;
              const fromTip = hgt - 1 - k;
              c = fromTip <= 1 && tall ? ramp(sp, 2) : local === 1 ? ramp(sp, 1) : ramp(sp, 0);
              if (fromTip === 0 && tall && local === 2) c = ramp(sp, 1);
            }
            break;
          }
          case Tile.WATER: {
            const w = st.water;
            const surf = !isLiquid(up) && !SOLID[up];
            const depth = surf ? py : 8 + py;
            let wc = depth <= 0 ? w.surface : depth < 3 ? w.body : depth > 20 ? w.deep : w.body;
            if (depth > 6 && depth <= 20 && ((gx + gy * 3) & 31) === 0) wc = w.surface;
            const back = wallColor(st, pat, wall, gx, gy, 0);
            const a = depth <= 0 ? 0.85 : w.alpha;
            if (back >= 0) {
              c = mixRgb(back, wc, a);
            } else {
              c = wc;
              outA = Math.round(a * 255);
            }
            break;
          }
          case Tile.LAVA: {
            const lv = st.lava;
            const surf = !isLiquid(up);
            const p = pat.lava;
            const po = (gy & p.mask) * p.size + ((gx + (gy >> 1)) & p.mask);
            const l = p.level[po]!;
            if (surf && py === 0) c = ramp(lv.glow, 3);
            else if (surf && py === 1) c = ramp(lv.glow, 2);
            else if (l === 0) c = ramp(lv.glow, surf && py < 4 ? 2 : 1);
            else if (l === 3) c = ramp(lv.crust, 3);
            else c = ramp(lv.crust, l === 1 ? 1 : 2);
            glow = 255;
            break;
          }
        }
        if (c < 0 && fromBelow) {
          const h = bladeHeight(st, gx);
          if (h > 0 && py >= TILE - h) {
            c = bladeColor(st, gx, py - (TILE - h), h);
            glow = outGlow;
          }
        }
        if (c < 0 && fromAbove) c = hangerColor(st, gx, py);
        if (c < 0 && sideL && px === 0 && hash01(gy, 21, tx) < 0.22) c = ramp(pal.fringe, 1);
        if (c < 0 && sideR && px === 7 && hash01(gy, 22, tx) < 0.22) c = ramp(pal.fringe, 1);
        if (c < 0) {
          const ao = (aoUp && py < 2) || (aoDn && py > 5) || (aoL && px < 2) || (aoR && px > 5) ? 1 : 0;
          c = wallColor(st, pat, wall, gx, gy, ao);
        }
      }
      if (c === -1 && solid) {
        // Eroded solid edge: show the wall behind it if any.
        c = wallColor(st, pat, wall, gx, gy, 1);
      }
      writePx(buf, o, c, outA, glow);
    }
  }
}

/** Things hanging from an exposed ceiling into the tile below it. -1 = nothing. */
function hangerColor(st: BiomeStyle, gx: number, py: number): number {
  const r = hash01(gx, 31, 7);
  switch (st.ceiling) {
    case 'roots': {
      if (r >= 0.22) return -1;
      const len = 1 + Math.floor(hash01(gx, 32, 7) * 4);
      return py < len ? (py === len - 1 ? ramp(st.pal.ground, 2) : ramp(st.pal.ground, 1)) : -1;
    }
    case 'vines': {
      if (r >= 0.2) return -1;
      const len = 2 + Math.floor(hash01(gx, 33, 7) * 6);
      if (py >= len) return -1;
      if (py === len - 1 && hash01(gx, 34, 7) < 0.35) return ramp(st.pal.accent, 3);
      return py % 3 === 2 ? ramp(st.pal.fringe, 2) : ramp(st.pal.fringe, 1);
    }
    case 'icicles': {
      if (r >= 0.3) return -1;
      const len = 1 + Math.floor(hash01(gx, 35, 7) * 4);
      return py < len ? (py === len - 1 ? 0xffffff : py === 0 ? 0x6ab0e0 : 0x9ad8f0) : -1;
    }
    case 'drips': {
      if (r >= 0.1) return -1;
      const len = 1 + Math.floor(hash01(gx, 36, 7) * 2);
      return py < len ? ramp(st.pal.rock, 1) : -1;
    }
    case 'none':
      return -1;
  }
}

function mixRgb(a: number, b: number, t: number): number {
  const r = red(a) + (red(b) - red(a)) * t;
  const g = green(a) + (green(b) - green(a)) * t;
  const bl = blue(a) + (blue(b) - blue(a)) * t;
  return ((r | 0) << 16) | ((g | 0) << 8) | (bl | 0);
}

/** Paint a whole chunk. */
export function paintChunk(grid: GridView, st: BiomeStyle, cx: number, cy: number, buf: ChunkBuffers): void {
  paintRegion(grid, st, cx, cy, cx * CHUNK, cy * CHUNK, cx * CHUNK + CHUNK - 1, cy * CHUNK + CHUNK - 1, buf);
}

const MAX_RUN = 6;

/** Scan a chunk for light emitters, liquid surfaces and open-sky tiles. */
export function scanChunk(grid: GridView, st: BiomeStyle, cx: number, cy: number): ChunkMeta {
  const emitters: Emitter[] = [];
  const surfaces: Surface[] = [];
  const sky = new Uint8Array(CHUNK * CHUNK);
  let skyCount = 0;
  const bx = cx * CHUNK;
  const by = cy * CHUNK;
  const fringeGlow = st.fringeEmissive ? ramp(st.pal.fringe, 2) : 0;
  const specialGlow = st.special === 'crystal' ? 0xc040ff : st.special === 'obsidian' ? 0xff6020 : st.special === 'blight' ? 0xff40a0 : 0;
  for (let ty = by; ty < by + CHUNK && ty < grid.h; ty++) {
    // Kinds: 1 lava surface, 2 glowing fringe top, 3 glowing special.
    let runKind = 0;
    let runStart = 0;
    const flush = (end: number) => {
      if (runKind === 0) return;
      const x0 = runStart * TILE;
      const w = (end - runStart + 1) * TILE;
      if (runKind === 1) emitters.push({ x: x0 + w / 2, y: ty * TILE + 2, w, color: 0xff8a30, intensity: 0.95, radius: 30 });
      else if (runKind === 2) emitters.push({ x: x0 + w / 2, y: ty * TILE, w, color: fringeGlow, intensity: 0.4, radius: 18 });
      else emitters.push({ x: x0 + w / 2, y: ty * TILE + 4, w, color: specialGlow, intensity: 0.45, radius: 18 });
      runKind = 0;
    };
    let surfKind: 'water' | 'lava' | null = null;
    let surfStart = 0;
    for (let tx = bx; tx < bx + CHUNK && tx < grid.w; tx++) {
      const id = grid.get(tx, ty);
      const up = grid.get(tx, ty - 1);
      if (!SOLID[id] && grid.getWall(tx, ty) === Wall.NONE) {
        sky[(ty - by) * CHUNK + (tx - bx)] = 1;
        skyCount++;
      }
      let k = 0;
      if (id === Tile.LAVA && !isLiquid(up)) k = 1;
      else if (fringeGlow && isNatural(id) && id !== Tile.SPECIAL && fringeOpen(up)) k = 2;
      else if (specialGlow && id === Tile.SPECIAL && (!SOLID[up] || !SOLID[grid.get(tx - 1, ty)] || !SOLID[grid.get(tx + 1, ty)] || !SOLID[grid.get(tx, ty + 1)])) k = 3;
      if (k !== runKind || (k !== 0 && tx - runStart >= MAX_RUN)) {
        flush(tx - 1);
        if (k !== 0) {
          runKind = k;
          runStart = tx;
        }
      }
      const sk = (id === Tile.WATER || id === Tile.LAVA) && !isLiquid(up) && !SOLID[up] ? (id === Tile.WATER ? 'water' : 'lava') : null;
      if (sk !== surfKind) {
        if (surfKind) surfaces.push({ tx0: surfStart, tx1: tx - 1, ty, kind: surfKind });
        surfKind = sk;
        surfStart = tx;
      }
    }
    flush(Math.min(bx + CHUNK, grid.w) - 1);
    if (surfKind) surfaces.push({ tx0: surfStart, tx1: Math.min(bx + CHUNK, grid.w) - 1, ty, kind: surfKind });
  }
  return { emitters, surfaces, sky, skyCount };
}
