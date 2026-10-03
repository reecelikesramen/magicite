import { TILE } from '../constants';
import { Tile, Wall } from '../tiles';
import { airAt, carve, groundSpot, headroom, IS_SOLID, isTerrain, put, solidAt } from './grid';
import { fbm, makeNoise } from './noise';
import { F_CLAIM, F_NOHAZ, F_PROTECT, F_ROUTE, F_SECRET, type GenCtx } from './types';

/**
 * Terrain dressing after the layout is final: liquid basins and pools, spikes, biome special
 * tiles (ice / mud floors, glowing crystal clusters, ice shelves), one-way platforms in tall
 * spaces, rock pockets, back-wall windows and sealed secret pockets.
 */

const liquidTile = (ctx: GenCtx): number => (ctx.biome.gen.liquid === 'lava' ? Tile.LAVA : Tile.WATER);

const okCell = (ctx: GenCtx, x: number, y: number, mask = F_NOHAZ | F_PROTECT | F_CLAIM): boolean =>
  x > 1 && y > 1 && x < ctx.w - 2 && y < ctx.h - 2 && (ctx.flags[y * ctx.w + x]! & mask) === 0;

/** Liquid basins dug into flat stretches of the main route (fen bogs, cinder lava lakes). */
export function routeBasins(ctx: GenCtx, x0: number, x1: number): void {
  const { rng, style, biome } = ctx;
  if (biome.gen.liquid === 'none') return;
  const liquid = liquidTile(ctx);
  const target = Math.round(((style.basins * (x1 - x0)) / 100) * (0.5 + biome.gen.liquidAmount * 2));
  let placed = 0;
  for (let tries = 0; tries < target * 8 && placed < target; tries++) {
    const bw = rng.int(style.basinW[0], style.basinW[1]);
    const bx = rng.int(x0, x1 - bw - 1);
    const f = ctx.floor[bx]!;
    let flat = f >= 0;
    for (let x = bx - 1; x <= bx + bw && flat; x++) {
      if (ctx.floor[x] !== f || !okCell(ctx, x, f - 1) || !okCell(ctx, x, f)) flat = false;
      if (flat && !airAt(ctx.grid, x, f - 1)) flat = false;
    }
    if (!flat) continue;
    const depth = rng.int(style.basinDepth[0], style.basinDepth[1]);
    for (let x = bx; x < bx + bw; x++) {
      const edge = x === bx || x === bx + bw - 1;
      const d = edge ? Math.max(1, depth - 1) : depth;
      for (let y = f; y < f + d; y++) put(ctx, x, y, liquid);
      for (let y = f + d; y <= f + d + 1; y++) if (!solidAt(ctx.grid, x, y)) put(ctx, x, y, Tile.GROUND);
      ctx.flags[(f - 1) * ctx.w + x]! |= F_CLAIM;
    }
    // Lava lakes wider than a comfortable jump get basalt stepping pillars.
    if (liquid === Tile.LAVA && (bw > 5 || style.pillars)) {
      for (let x = bx + 2 + rng.int(0, 1); x < bx + bw - 2; x += rng.int(3, 4)) {
        const top = f - (rng.chance(0.4) ? 1 : 0);
        for (let y = top; y < f + depth; y++) put(ctx, x, y, Tile.ROCK);
        if (top < f) carve(ctx, x, top - 1);
      }
    }
    if (liquid === Tile.LAVA) lightRun(ctx, bx, bw, f);
    placed++;
  }
}

function lightRun(ctx: GenCtx, bx: number, bw: number, row: number): void {
  if (ctx.lights.length >= 90) return;
  ctx.lights.push({ x: (bx + bw / 2) * TILE, y: row * TILE, radius: 18 + bw * 3, color: 0xff6010, intensity: 0.9 });
}

/** Pools that settle in cavern dips: flood upward from a floor cell while the pool stays small. */
export function cavernPools(ctx: GenCtx): void {
  const { rng, biome, w, h, grid } = ctx;
  if (biome.gen.liquid === 'none' || biome.gen.liquidAmount <= 0) return;
  const liquid = liquidTile(ctx);
  const target = Math.round((biome.gen.liquidAmount * w) / 9);
  const maxCells = liquid === Tile.LAVA ? 70 : 90;
  const region: number[] = [];
  const best: number[] = [];
  const stamp = new Int32Array(w * h).fill(-1);
  let stampId = 0;
  let placed = 0;
  for (let tries = 0; tries < target * 12 && placed < target; tries++) {
    const sx = rng.int(4, w - 5);
    const sy = rng.int(4, h - 5);
    // Drop to the floor of whatever air we hit.
    let y = sy;
    if (!airAt(grid, sx, y)) continue;
    while (y < h - 2 && airAt(grid, sx, y + 1)) y++;
    if (!solidAt(grid, sx, y + 1)) continue;
    if (!okCell(ctx, sx, y)) continue;
    if (liquid === Tile.LAVA && ctx.flags[y * w + sx]! & F_ROUTE) continue;
    best.length = 0;
    for (let level = y; level >= y - 5; level--) {
      region.length = 0;
      stampId++;
      region.push(y * w + sx);
      stamp[y * w + sx] = stampId;
      let bad = false;
      for (let q = 0; q < region.length && !bad; q++) {
        const c = region[q]!;
        const cx = c % w;
        const cy = (c - cx) / w;
        for (let k = 0; k < 4; k++) {
          const nx = cx + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const ny = cy + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (ny < level) continue;
          const d = ny * w + nx;
          if (stamp[d] === stampId || !airAt(grid, nx, ny)) continue;
          if (!okCell(ctx, nx, ny) || (liquid === Tile.LAVA && ctx.flags[d]! & F_ROUTE)) {
            bad = true;
            break;
          }
          stamp[d] = stampId;
          region.push(d);
          if (region.length > maxCells) bad = true;
        }
      }
      if (bad) break;
      best.length = 0;
      for (const c of region) best.push(c);
      if (level <= y - 1 && region.length >= 6) continue;
    }
    if (best.length < 6) continue;
    let minY = h;
    for (const c of best) minY = Math.min(minY, Math.floor(c / w));
    if (y - minY < 1) continue;
    let minX = w;
    let maxX = 0;
    for (const c of best) {
      const x = c % w;
      put(ctx, x, (c - x) / w, liquid);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    if (liquid === Tile.LAVA) lightRun(ctx, minX, maxX - minX + 1, minY);
    placed++;
  }
}

/** Spike clusters on floors (never near the spawn, climb structures or portals). */
export function spikes(ctx: GenCtx): void {
  const { rng, w, h, grid, biome } = ctx;
  const count = Math.round(biome.gen.hazardDensity * w * 0.5 * (0.6 + ctx.depth));
  let placed = 0;
  for (let tries = 0; tries < count * 15 && placed < count; tries++) {
    const x = rng.int(3, w - 4);
    let y = rng.int(3, h - 4);
    if (!airAt(grid, x, y)) continue;
    while (y < h - 2 && airAt(grid, x, y + 1)) y++;
    if (!groundSpot(grid, x, y) || !okCell(ctx, x, y)) continue;
    const len = rng.int(1, 3);
    let ok = true;
    for (let k = -1; k <= len && ok; k++) {
      const xx = x + k;
      if (!okCell(ctx, xx, y) || !solidAt(grid, xx, y + 1)) ok = false;
      if (k >= 0 && k < len && (!airAt(grid, xx, y) || !airAt(grid, xx, y - 1) || !airAt(grid, xx, y - 2))) ok = false;
    }
    if (!ok) continue;
    for (let k = 0; k < len; k++) {
      put(ctx, x + k, y, Tile.SPIKES);
      ctx.flags[y * w + x + k]! |= F_CLAIM;
    }
    placed++;
  }
}

/** Biome special tile: floor patches (ice, mud), glowing clusters (crystal, obsidian, blight), ice shelves. */
export function specialTiles(ctx: GenCtx): void {
  const { rng, style, biome, w, h, grid } = ctx;
  const density = biome.gen.specialTileDensity;
  if (density <= 0 || style.special === 'none') return;
  if (style.special === 'floor') {
    const patches = Math.round((density * w) / 2.2);
    let placed = 0;
    for (let tries = 0; tries < patches * 10 && placed < patches; tries++) {
      const x0 = rng.int(3, w - 12);
      let y = rng.int(3, h - 4);
      if (!airAt(grid, x0, y)) continue;
      while (y < h - 2 && airAt(grid, x0, y + 1)) y++;
      if (!groundSpot(grid, x0, y) || ctx.flags[y * w + x0]! & F_PROTECT) continue;
      const len = rng.int(3, 10);
      for (let x = x0; x < x0 + len; x++) {
        const t = grid.get(x, y + 1);
        if (!isTerrain(t) || !airAt(grid, x, y) || ctx.flags[(y + 1) * w + x]! & F_PROTECT) break;
        put(ctx, x, y + 1, Tile.SPECIAL);
      }
      placed++;
    }
  } else {
    const clusters = Math.round((density * w) / 3);
    let placed = 0;
    for (let tries = 0; tries < clusters * 10 && placed < clusters; tries++) {
      const x = rng.int(4, w - 5);
      const y = rng.int(4, h - 5);
      if (!isTerrain(grid.get(x, y)) || ctx.flags[y * w + x]! & F_PROTECT) continue;
      // Must touch air so it can be seen.
      if (!airAt(grid, x + 1, y) && !airAt(grid, x - 1, y) && !airAt(grid, x, y - 1) && !airAt(grid, x, y + 1)) continue;
      const r = rng.int(1, 2);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r + 1) continue;
          if (isTerrain(grid.get(x + dx, y + dy)) && !(ctx.flags[(y + dy) * w + x + dx]! & F_PROTECT)) put(ctx, x + dx, y + dy, Tile.SPECIAL);
        }
      }
      if (style.specialLight && ctx.lights.length < 90) {
        ctx.lights.push({ x: x * TILE + 4, y: y * TILE + 4, radius: style.specialLight.radius, color: style.specialLight.color, intensity: 0.8 });
      }
      placed++;
    }
  }
  // Floating shelves of the special tile (rime ice ledges) in open spaces.
  for (let k = 0, tries = 0; k < style.specialLedges && tries < 60; tries++) {
    const x = rng.int(20, w - 30);
    let y = rng.int(4, h - 6);
    if (!airAt(grid, x, y)) continue;
    while (y < h - 2 && airAt(grid, x, y + 1)) y++;
    if (!groundSpot(grid, x, y)) continue;
    const ly = y - rng.int(3, 4);
    const len = rng.int(3, 6);
    let ok = headroom(grid, x, ly - 1) >= 3;
    for (let xx = x - 1; xx <= x + len && ok; xx++) if (!airAt(grid, xx, ly) || !airAt(grid, xx, ly - 1) || !airAt(grid, xx, ly + 1) || !okCell(ctx, xx, ly)) ok = false;
    if (!ok) continue;
    for (let xx = x; xx < x + len; xx++) put(ctx, xx, ly, Tile.SPECIAL);
    k++;
  }
}

/** One-way platforms in tall open spaces so caverns are climbable. */
export function platforms(ctx: GenCtx): void {
  const { rng, biome, w, h, grid } = ctx;
  const count = Math.round((biome.gen.platformDensity * w) / 5);
  let placed = 0;
  for (let tries = 0; tries < count * 12 && placed < count; tries++) {
    const x = rng.int(14, w - 14);
    let y = rng.int(4, h - 5);
    if (!airAt(grid, x, y)) continue;
    while (y < h - 2 && airAt(grid, x, y + 1)) y++;
    if (!solidAt(grid, x, y + 1)) continue;
    const room = headroom(grid, x, y);
    if (room < 8) continue;
    // Route platforms are rarer (they get in the way of trees).
    if (ctx.flags[y * w + x]! & F_ROUTE && rng.chance(0.6)) continue;
    let ty = y + 1 - rng.int(3, 4);
    const pw = rng.int(3, 6);
    let x0 = x - (pw >> 1);
    for (let tier = 0; tier < 3; tier++) {
      let ok = true;
      for (let xx = x0 - 1; xx <= x0 + pw && ok; xx++) {
        if (!airAt(grid, xx, ty) || !airAt(grid, xx, ty - 1) || !airAt(grid, xx, ty - 2) || !okCell(ctx, xx, ty)) ok = false;
      }
      if (!ok) break;
      for (let xx = x0; xx < x0 + pw; xx++) {
        put(ctx, xx, ty, Tile.PLATFORM);
        ctx.flags[ty * w + xx]! |= F_CLAIM;
      }
      if (headroom(grid, x0 + (pw >> 1), ty - 1) < 7 || rng.chance(0.4)) break;
      ty -= rng.int(3, 3);
      x0 += rng.sign() * rng.int(2, 4);
    }
    placed++;
  }
}

/** Harder rock pockets inside the ground, more of them deeper down the run. */
export function rockPockets(ctx: GenCtx): void {
  const { w, h, grid } = ctx;
  const noise = makeNoise(ctx.rng);
  const thr = 0.42 - ctx.depth * 0.18;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (grid.fg[i] !== Tile.GROUND || ctx.flags[i]! & F_PROTECT) continue;
      // Keep exposed surfaces earthy (grass fringe); rock shows inside walls and on cave ceilings.
      if (airAt(grid, x, y - 1)) continue;
      if (fbm(noise, x / 7, y / 6, 2) > thr) grid.fg[i] = Tile.ROCK;
    }
  }
}

/** Back wall everywhere except a few windows onto the far background in big open spaces. */
export function backWalls(ctx: GenCtx): void {
  const { w, h, grid, style } = ctx;
  if (style.wallWindows <= 0) return;
  const noise = makeNoise(ctx.rng);
  // Large, smooth windows only (speckled single-tile holes read as noise).
  const thr = 1 - style.wallWindows * 4;
  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < w - 3; x++) {
      const i = y * w + x;
      if (grid.fg[i] !== Tile.AIR) continue;
      if (fbm(noise, x / 26, y / 15, 2) > thr && airAt(grid, x, y - 3) && airAt(grid, x, y + 3) && airAt(grid, x - 3, y) && airAt(grid, x + 3, y)) {
        grid.bg[i] = Wall.NONE;
      }
    }
  }
}

/**
 * Sealed pockets 2–4 tiles inside solid ground next to reachable space, holding an iron chest
 * (terrain is diggable). Returns the chest positions (feet cells).
 */
export function secretPockets(ctx: GenCtx): { x: number; y: number }[] {
  const { rng, style, w, h, grid, flags } = ctx;
  const out: { x: number; y: number }[] = [];
  const want = rng.int(style.secrets[0], style.secrets[1]);
  for (let tries = 0; tries < 80 && out.length < want; tries++) {
    const pw = rng.int(5, 8);
    const ph = rng.int(3, 4);
    const x0 = rng.int(20, w - pw - 20);
    const y0 = rng.int(4, h - ph - 5);
    let ok = true;
    for (let y = y0 - 2; y <= y0 + ph + 1 && ok; y++) {
      for (let x = x0 - 2; x <= x0 + pw + 1 && ok; x++) {
        const t = grid.get(x, y);
        if (!isTerrain(t) || flags[y * w + x]! & (F_PROTECT | F_SECRET)) ok = false;
      }
    }
    if (!ok) continue;
    // Close to open space: some air within 4 tiles of the pocket's sides.
    let near = false;
    for (let d = 3; d <= 5 && !near; d++) {
      for (let y = y0; y < y0 + ph && !near; y++) if (airAt(grid, x0 - d, y) || airAt(grid, x0 + pw - 1 + d, y)) near = true;
      for (let x = x0; x < x0 + pw && !near; x++) if (airAt(grid, x, y0 - d) || airAt(grid, x, y0 + ph - 1 + d)) near = true;
    }
    if (!near) continue;
    for (let y = y0; y < y0 + ph; y++) {
      for (let x = x0; x < x0 + pw; x++) {
        grid.fg[y * w + x] = Tile.AIR;
        grid.bg[y * w + x] = Wall.BRICK;
        flags[y * w + x]! |= F_SECRET | F_NOHAZ;
      }
    }
    for (let x = x0; x < x0 + pw; x++) if (!IS_SOLID[grid.get(x, y0 + ph)]) grid.fg[(y0 + ph) * w + x] = Tile.GROUND;
    out.push({ x: x0 + (pw >> 1), y: y0 + ph - 1 });
  }
  return out;
}
