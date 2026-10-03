import { clamp, lerp } from '../../engine/math';
import { Tile, Wall } from '../tiles';
import { carve, IS_SOLID, put } from './grid';
import { fbm, makeNoise, noise01 } from './noise';
import { F_CLAIM, F_NOHAZ, F_PROTECT, F_ROUTE, type GenCtx } from './types';

/**
 * District terrain: a left→right main route (zones with terraces, big stepped height changes made
 * climbable with stairs / platform stacks / ladders), noise caverns smoothed by cellular automata,
 * extra corridors above/below the route joined by ladder shafts, and a final pass that connects
 * (or fills) every isolated air pocket.
 */

export const ENTRANCE_W = 16;

export interface Cliff {
  x: number;
  /** Floor rows below/above the cliff. */
  low: number;
  high: number;
  kind: 'platforms' | 'ladder';
}

export interface RouteProfile {
  /** Floor row per column (first solid row), -1 outside the route. */
  floor: Int16Array;
  /** Ceiling row per column (first air row), -1 outside. */
  ceil: Int16Array;
  cliffs: Cliff[];
  x0: number;
  x1: number;
}

/** Fill the whole grid with ground, bedrock border, cave back wall. */
export function initGrid(ctx: GenCtx): void {
  const { grid, w, h } = ctx;
  grid.fg.fill(Tile.GROUND);
  grid.bg.fill(Wall.CAVE);
  for (let x = 0; x < w; x++) {
    grid.fg[x] = Tile.BEDROCK;
    grid.fg[(h - 1) * w + x] = Tile.BEDROCK;
  }
  for (let y = 0; y < h; y++) {
    grid.fg[y * w] = Tile.BEDROCK;
    grid.fg[y * w + w - 1] = Tile.BEDROCK;
  }
}

function floorBand(ctx: GenCtx): [number, number] {
  const { style, h } = ctx;
  const hi = h - 7;
  let lo = style.clearance[1] + 5;
  if (hi - lo < 12) lo = Math.max(style.clearance[0] + 3, hi - 12);
  return [lo, hi];
}

/**
 * Route floor profile over [1, x1). `endFloor` steers the last zone (boss arena entrance);
 * `endFlat` columns at the right end stay flat (exit chamber / arena lead-in).
 */
export function buildProfile(ctx: GenCtx, x1: number, endFlat: number, endFloor?: number): RouteProfile {
  const { rng, style, w } = ctx;
  const [lo, hi] = floorBand(ctx);
  const floor = new Int16Array(w).fill(-1);
  const ceil = new Int16Array(w).fill(-1);
  const cliffs: Cliff[] = [];
  let cur = Math.round(lerp(lo, hi, rng.range(0.3, 0.7)));
  for (let x = 1; x < ENTRANCE_W; x++) floor[x] = cur;
  const zEnd = x1 - endFlat;
  const vert = ctx.biome.gen.verticality;
  let x = ENTRANCE_W;
  const climbKinds = (['stairs', 'platforms', 'ladder'] as const).filter((k) => style.climb[k] > 0);
  while (x < zEnd) {
    let zw = rng.int(style.zoneW[0], style.zoneW[1]);
    if (x + zw > zEnd - 12) zw = zEnd - x;
    const last = x + zw >= zEnd;
    let target = cur;
    if (endFloor !== undefined && (last || zEnd - x < style.zoneW[1] * 1.5)) target = endFloor;
    else if (rng.chance(0.2 + 0.65 * vert)) {
      let mag = rng.int(style.shift[0], style.shift[1]);
      let dir = rng.sign();
      if (cur + dir * mag < lo || cur + dir * mag > hi) dir = -dir as 1 | -1;
      mag = Math.min(mag, dir < 0 ? cur - lo : hi - cur);
      target = cur + dir * Math.max(0, mag);
    } else target = clamp(cur + rng.int(-2, 2), lo, hi);
    const xe = x + zw;
    // --- transition into the zone ---
    if (target < cur - 3) {
      const kind = rng.weighted(climbKinds, (k) => style.climb[k]);
      if (kind === 'stairs') {
        let y = cur;
        while (y > target && x < xe - 2) {
          y = Math.max(target, y - rng.int(2, 3));
          const sw = rng.int(2, 4);
          for (let i = 0; i < sw && x < xe; i++) floor[x++] = y;
        }
        cur = y;
      } else {
        cliffs.push({ x, low: cur, high: target, kind });
        cur = target;
      }
    } else if (target > cur + 3) {
      if (rng.chance(0.5)) {
        let y = cur;
        while (y < target && x < xe - 2) {
          y = Math.min(target, y + rng.int(2, 4));
          const sw = rng.int(2, 3);
          for (let i = 0; i < sw && x < xe; i++) floor[x++] = y;
        }
        cur = y;
      } else cur = target;
    } else cur = target;
    // --- terraces inside the zone ---
    // The first segment stays at the transition height: cliff structures and stairs end exactly
    // there, and a step on top of a ≤3 transition could stack into an unjumpable wall.
    const base = cur;
    let first = true;
    while (x < xe) {
      const sw = rng.int(style.segW[0], style.segW[1]);
      if (rng.chance(style.stepChance) && !first) cur = clamp(cur + rng.int(-style.stepMax, style.stepMax), Math.max(lo, base - 4), Math.min(hi, base + 4));
      first = false;
      if (last && endFloor !== undefined) cur = endFloor;
      for (let i = 0; i < sw && x < xe; i++) floor[x++] = cur;
    }
  }
  for (; x < x1; x++) floor[x] = cur;

  // Ceiling: headroom from smooth noise, never below the highest floor nearby.
  const noise = makeNoise(rng);
  for (let cx = 1; cx < x1; cx++) {
    let m = floor[cx]!;
    for (let k = -3; k <= 3; k++) {
      const f = floor[clamp(cx + k, 1, x1 - 1)]!;
      if (f >= 0 && f < m) m = f;
    }
    const cl = Math.round(lerp(style.clearance[0], style.clearance[1], noise01(noise, cx * 0.07, 1)));
    ceil[cx] = Math.max(2, m - (cx < ENTRANCE_W ? Math.max(cl, 6) : cl));
  }
  for (const c of cliffs) {
    for (let cx = Math.max(1, c.x - 12); cx <= Math.min(x1 - 1, c.x + 3); cx++) ceil[cx] = Math.max(2, Math.min(ceil[cx]!, c.high - 6));
  }
  return { floor, ceil, cliffs, x0: 1, x1 };
}

/** Noise caverns + CA smoothing over columns [x0, x1). */
export function carveCaverns(ctx: GenCtx, x0: number, x1: number): void {
  const { w, h, style, rng } = ctx;
  const noise = makeNoise(rng);
  const sy = style.cavernScale;
  const sx = sy * style.cavernStretch;
  const thr = 0.62 - 0.6 * ctx.biome.gen.openness;
  const ox = rng.range(0, 1000);
  const oy = rng.range(0, 1000);
  let a = new Uint8Array(w * h);
  let b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < x0 || x >= x1 || y < 3 || y >= h - 3) {
        a[i] = 1;
        continue;
      }
      // Fewer caverns near the top/bottom border and the entrance / end of the range.
      const edge = Math.min(y - 3, h - 4 - y, x - x0, x1 - 1 - x);
      const fall = edge < 6 ? (6 - edge) * 0.06 : 0;
      a[i] = fbm(noise, ox + x / sx, oy + y / sy, 3) - fall > thr ? 0 : 1;
    }
  }
  for (let it = 0; it < 2; it++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x < x0 || x >= x1 || y < 1 || y >= h - 1) {
          b[i] = 1;
          continue;
        }
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += a[i + dy * w + dx]!;
        b[i] = n >= 5 ? 1 : 0;
      }
    }
    const t = a;
    a = b;
    b = t;
  }
  for (let i = 0; i < w * h; i++) {
    if (a[i]) continue;
    const x = i % w;
    put(ctx, x, (i - x) / w, Tile.AIR);
  }
}

/** Carve the main corridor and restore a 2-tile solid floor under it. */
export function carveRoute(ctx: GenCtx, p: RouteProfile): void {
  const { w, flags } = ctx;
  for (let x = p.x0; x < p.x1; x++) {
    const f = p.floor[x]!;
    const c = p.ceil[x]!;
    if (f < 0) continue;
    for (let y = c; y < f; y++) {
      carve(ctx, x, y);
      flags[y * w + x]! |= F_ROUTE;
    }
    for (let y = f; y <= f + 1; y++) if (!IS_SOLID[ctx.grid.get(x, y)]) put(ctx, x, y, Tile.GROUND);
  }
  ctx.floor.set(p.floor);
}

/** Platform stacks / ladders that make big up-steps climbable. */
export function buildCliffs(ctx: GenCtx, p: RouteProfile): void {
  const { rng, w, flags } = ctx;
  for (const c of p.cliffs) {
    const mark = (x: number, y: number): void => {
      flags[y * w + x]! |= F_NOHAZ;
    };
    for (let x = c.x - 9; x <= c.x + 2; x++) for (let y = c.high - 6; y <= c.low; y++) if (x > 0 && x < w - 1 && y > 0 && y < ctx.h - 1) mark(x, y);
    if (c.kind === 'ladder') {
      const lx = c.x - 1;
      for (let y = c.high; y <= c.low - 1; y++) {
        put(ctx, lx, y, Tile.LADDER);
        flags[y * w + lx]! |= F_CLAIM;
      }
      carve(ctx, lx, c.high - 1);
      carve(ctx, lx, c.high - 2);
      continue;
    }
    // Platform stack: tiers every ≤ 3 rows, zig-zagging in front of the cliff.
    const tiers: number[] = [];
    for (let y = c.low; y - c.high > 3; ) {
      y -= 3;
      tiers.push(y);
    }
    tiers.forEach((ty, i) => {
      const top = i === tiers.length - 1;
      const pw = rng.int(3, 5);
      const right = top || (tiers.length - 1 - i) % 2 === 0;
      const xe = right ? c.x - 1 : c.x - 1 - rng.int(3, 4);
      for (let x = xe - pw + 1; x <= xe; x++) {
        if (ctx.grid.get(x, ty) === Tile.AIR) {
          put(ctx, x, ty, Tile.PLATFORM);
          flags[ty * w + x]! |= F_CLAIM;
        }
        carve(ctx, x, ty - 1);
        carve(ctx, x, ty - 2);
      }
    });
  }
}

/**
 * Extra corridors above/below the main route, each joined to it by 1–2 ladder shafts whose top
 * rung sits flush with the upper floor.
 */
export function carveCorridors(ctx: GenCtx, p: RouteProfile, xMin: number, xMax: number): void {
  const { rng, style, h, w, flags } = ctx;
  const n = rng.int(style.corridors[0], style.corridors[1]);
  for (let i = 0; i < n; i++) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const len = rng.int(style.corridorLen[0], style.corridorLen[1]);
      if (xMax - xMin - len < 8) break;
      const cx0 = rng.int(xMin + 4, xMax - len - 4);
      const cx1 = cx0 + len;
      const mid = p.floor[(cx0 + cx1) >> 1]!;
      const above = rng.chance(0.5);
      const off = rng.int(12, 22);
      const base = above ? mid - off : mid + off;
      const floor = new Int16Array(len + 1);
      const clr = new Int16Array(len + 1);
      let y = base;
      let ok = true;
      for (let k = 0; k <= len; k++) {
        if (k % 6 === 0 && rng.chance(0.35)) y = clamp(y + rng.int(-1, 1), base - 2, base + 2);
        floor[k] = y;
        clr[k] = rng.int(style.corridorClearance[0], style.corridorClearance[1]);
        const x = cx0 + k;
        const top = y - clr[k]!;
        if (top < 3 || y + 2 >= h - 1) ok = false;
        else if (above && y + 3 >= p.ceil[x]!) ok = false;
        else if (!above && top - 3 <= p.floor[x]!) ok = false;
        if (!ok) break;
      }
      if (!ok) continue;
      for (let k = 0; k <= len; k++) {
        const x = cx0 + k;
        for (let yy = floor[k]! - clr[k]!; yy < floor[k]!; yy++) carve(ctx, x, yy);
        for (let yy = floor[k]!; yy <= floor[k]! + 1; yy++) if (!IS_SOLID[ctx.grid.get(x, yy)]) put(ctx, x, yy, Tile.GROUND);
      }
      // Shafts.
      const shafts = len > 50 ? 2 : 1;
      for (let s = 0; s < shafts; s++) {
        const k = s === 0 ? rng.int(2, Math.min(10, len - 2)) : rng.int(Math.max(2, len - 10), len - 2);
        const x = cx0 + k;
        const upper = above ? floor[k]! : p.floor[x]!;
        const lower = above ? p.floor[x]! : floor[k]!;
        if (lower - upper < 4) continue;
        for (let yy = upper + 2; yy < lower; yy++) for (let dx = -1; dx <= 1; dx++) carve(ctx, x + dx, yy);
        for (let yy = upper; yy < lower; yy++) {
          put(ctx, x, yy, Tile.LADDER);
          flags[yy * w + x]! |= F_CLAIM | F_NOHAZ;
          flags[yy * w + x - 1]! |= F_NOHAZ;
          flags[yy * w + x + 1]! |= F_NOHAZ;
        }
        carve(ctx, x, upper - 1);
        carve(ctx, x, upper - 2);
      }
      break;
    }
  }
}

/**
 * Label air pockets; connect sizeable ones to the spawn's pocket with a tunnel (ladder in vertical
 * runs), fill tiny ones. Pockets too far away stay sealed (diggers' reward).
 */
export function connectPockets(ctx: GenCtx, minKeep = 30, maxTunnel = 28): void {
  const { w, h, grid, flags } = ctx;
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const firsts: number[] = [];
  const queue = new Int32Array(n);
  const passable = (i: number): boolean => !IS_SOLID[grid.fg[i]!];
  let comps = 0;
  for (let i = 0; i < n; i++) {
    if (label[i]! >= 0 || !passable(i)) continue;
    let qh = 0;
    let qt = 0;
    queue[qt++] = i;
    label[i] = comps;
    while (qh < qt) {
      const c = queue[qh++]!;
      const x = c % w;
      for (let k = 0; k < 4; k++) {
        const d = k === 0 ? (x > 0 ? c - 1 : -1) : k === 1 ? (x < w - 1 ? c + 1 : -1) : k === 2 ? c - w : c + w;
        if (d < 0 || d >= n || label[d]! >= 0 || !passable(d)) continue;
        label[d] = comps;
        queue[qt++] = d;
      }
    }
    sizes.push(qt);
    firsts.push(i);
    comps++;
  }
  const main = label[ctx.spawnTy * w + ctx.spawnTx]!;
  if (main < 0) return;
  const isMain = new Uint8Array(comps);
  isMain[main] = 1;
  const parent = new Int32Array(n);
  const seen = new Int32Array(n).fill(-1);
  const dist = new Int16Array(n);
  for (let cid = 0; cid < comps; cid++) {
    if (isMain[cid]) continue;
    const cells: number[] = [];
    for (let i = firsts[cid]!; i < n && cells.length < sizes[cid]!; i++) if (label[i] === cid) cells.push(i);
    if (sizes[cid]! < minKeep) {
      for (const c of cells) {
        const x = c % w;
        put(ctx, x, (c - x) / w, Tile.GROUND);
      }
      continue;
    }
    // Multi-source BFS through solid ground toward any main-connected cell.
    let qh = 0;
    let qt = 0;
    for (const c of cells) {
      seen[c] = cid;
      parent[c] = -1;
      dist[c] = 0;
      queue[qt++] = c;
    }
    let hit = -1;
    while (qh < qt && hit < 0) {
      const c = queue[qh++]!;
      const x = c % w;
      const y = (c - x) / w;
      if (dist[c]! >= maxTunnel) continue;
      for (let k = 0; k < 4; k++) {
        const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (xx < 2 || yy < 2 || xx >= w - 2 || yy >= h - 2) continue;
        const d = yy * w + xx;
        if (seen[d] === cid) continue;
        seen[d] = cid;
        const lb = label[d]!;
        if (lb >= 0 && isMain[lb]) {
          parent[d] = c;
          hit = d;
          break;
        }
        if (flags[d]! & F_PROTECT || grid.fg[d] === Tile.BEDROCK) continue;
        parent[d] = c;
        dist[d] = dist[c]! + 1;
        queue[qt++] = d;
      }
    }
    if (hit < 0) {
      if (sizes[cid]! < minKeep * 3) for (const c of cells) put(ctx, c % w, Math.floor(c / w), Tile.GROUND);
      continue;
    }
    // Walk back from the hit to the pocket, carving a 3-wide tunnel; ladders on vertical runs.
    const path: number[] = [];
    for (let c = parent[hit]!; c >= 0 && label[c] !== cid; c = parent[c]!) path.push(c);
    for (const c of path) {
      const x = c % w;
      const y = (c - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) carve(ctx, x + dx, y + dy);
    }
    let run: number[] = [];
    const flush = (): void => {
      if (run.length >= 3) ladderColumn(ctx, run);
      run = [];
    };
    for (let k = 0; k < path.length; k++) {
      const c = path[k]!;
      if (run.length === 0 || Math.abs(c - run[run.length - 1]!) === w) run.push(c);
      else {
        flush();
        run.push(c);
      }
    }
    flush();
    isMain[cid] = 1;
  }
}

/** Ladder along a vertical run of cells, extended down to the floor below the run. */
function ladderColumn(ctx: GenCtx, run: number[]): void {
  const { w, grid, flags } = ctx;
  const x = run[0]! % w;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const c of run) {
    const y = (c - x) / w;
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  while (y1 + 1 < ctx.h - 1 && grid.get(x, y1 + 1) === Tile.AIR) y1++;
  // Top rung flush with whatever floor surrounds the top of the shaft.
  if (IS_SOLID[grid.get(x - 1, y0 - 1)] || IS_SOLID[grid.get(x + 1, y0 - 1)]) y0--;
  for (let y = y0; y <= y1; y++) {
    const t = grid.get(x, y);
    if (t === Tile.AIR || IS_SOLID[t]) {
      put(ctx, x, y, Tile.LADDER);
      flags[y * w + x]! |= F_CLAIM | F_NOHAZ;
    }
  }
  carve(ctx, x, y0 - 1);
  carve(ctx, x, y0 - 2);
}

/** Entrance: flat pad, headroom, protected spawn cell. */
export function buildEntrance(ctx: GenCtx, p: RouteProfile): void {
  const { w, flags } = ctx;
  const sx = 4;
  const f = p.floor[sx]!;
  ctx.spawnTx = sx;
  ctx.spawnTy = f - 1;
  for (let x = 1; x < ENTRANCE_W + 4 && x < w - 1; x++) {
    for (let y = f - 6; y <= f + 2; y++) if (y > 0 && y < ctx.h - 1) flags[y * w + x]! |= F_NOHAZ;
  }
  for (let x = 2; x <= 7; x++) for (let y = f - 4; y <= f - 1; y++) carve(ctx, x, y);
  for (let x = 2; x <= 7; x++) for (let y = f - 3; y <= f; y++) flags[y * w + x]! |= F_PROTECT;
}
