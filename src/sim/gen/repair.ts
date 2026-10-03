import { Tile } from '../tiles';
import { carve, IS_HAZARD, IS_SOLID, put } from './grid';
import { F_CLAIM, F_NOHAZ, F_PROTECT, type GenCtx } from './types';
import { analyzeTraversal, type Traversal } from './validate';

/**
 * Make the level traversable: every exit reachable from the spawn and no reachable pit that can't
 * get back to an exit. Fixes are local: a ladder up to the nearest escapable ledge if one exists,
 * otherwise a carved walkway (stairs / ladder shaft / plank bridge) to the nearest good cell.
 * Re-validates after every round. Returns the final analysis.
 */
export function repairTraversal(ctx: GenCtx, maxRounds = 14): Traversal {
  let t = analyze(ctx);
  for (let round = 0; round < maxRounds; round++) {
    let fixed = 0;
    // 1. Unreachable exits: connect from the nearest reachable node.
    for (let e = 0; e < t.exitNodes.length; e++) {
      if (t.exitReachable[e]) continue;
      const targets = t.exitNodes[e]!;
      if (targets.length === 0) continue;
      const target = targets[0]!;
      const from = nearest(t, [target], (k) => t.reach[k] === 1);
      if (from >= 0 && walkway(ctx, t, from, target)) fixed++;
    }
    if (fixed > 0) {
      t = analyze(ctx);
      continue;
    }
    if (t.exitNodes.length === 0) break;
    // 2. Soft-locks: reachable nodes that can't reach an exit.
    const groups = trappedGroups(t, 4);
    if (groups.length === 0) break;
    for (const g of groups) {
      if (ladderOut(ctx, t, g)) fixed++;
      else {
        const sample = g.length > 24 ? g.filter((_, i) => i % Math.ceil(g.length / 24) === 0) : g;
        let best = -1;
        let bestFrom = -1;
        let bestD = Infinity;
        for (const a of sample) {
          const b = nearest(t, [a], (k) => t.toExit[k] === 1);
          if (b < 0) continue;
          const d = dist(t, a, b);
          if (d < bestD) {
            bestD = d;
            best = b;
            bestFrom = a;
          }
        }
        if (best >= 0 && walkway(ctx, t, bestFrom, best)) fixed++;
      }
    }
    if (fixed === 0) break;
    t = analyze(ctx);
  }
  return t;
}

export function analyze(ctx: GenCtx): Traversal {
  return analyzeTraversal(ctx.grid, ctx.spawnTx, ctx.spawnTy, ctx.exits);
}

function dist(t: Traversal, a: number, b: number): number {
  const ca = t.cells[a]!;
  const cb = t.cells[b]!;
  const ax = ca % t.w;
  const bx = cb % t.w;
  const ay = (ca - ax) / t.w;
  const by = (cb - bx) / t.w;
  // Rising is costlier than walking.
  return Math.abs(ax - bx) + (by < ay ? 1.6 : 0.8) * Math.abs(ay - by);
}

/** Nearest node (to any of `from`) satisfying `ok`. */
function nearest(t: Traversal, from: number[], ok: (k: number) => boolean): number {
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < t.count; k++) {
    if (!ok(k)) continue;
    for (const f of from) {
      const d = dist(t, k, f);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
  }
  return best;
}

/** Connected groups (8-neighbourhood over cells) of trapped nodes, largest first. */
function trappedGroups(t: Traversal, max: number): number[][] {
  const { w, h } = t;
  const seen = new Uint8Array(t.count);
  const groups: number[][] = [];
  for (let k = 0; k < t.count; k++) {
    if (seen[k] || !t.reach[k] || t.toExit[k]) continue;
    const group: number[] = [k];
    seen[k] = 1;
    for (let q = 0; q < group.length; q++) {
      const c = t.cells[group[q]!]!;
      const x = c % w;
      const y = (c - x) / w;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const nd = t.node[yy * w + xx]!;
          if (nd >= 0 && !seen[nd] && t.reach[nd] && !t.toExit[nd]) {
            seen[nd] = 1;
            group.push(nd);
          }
        }
      }
    }
    groups.push(group);
  }
  groups.sort((a, b) => b.length - a.length || a[0]! - b[0]!);
  return groups.slice(0, max);
}

/** Place a ladder from a trapped standing cell up to where a side step reaches an escapable node. */
function ladderOut(ctx: GenCtx, t: Traversal, group: number[]): boolean {
  const { w, grid } = ctx;
  let bestCost = Infinity;
  let bx = -1;
  let by0 = -1;
  let by1 = -1;
  for (const k of group) {
    const c = t.cells[k]!;
    const x = c % w;
    const y = (c - x) / w;
    if (x <= 1 || x >= w - 2) continue;
    const below = grid.get(x, y + 1);
    if (!IS_SOLID[below] && below !== Tile.LADDER) continue; // ladders start on firm ground
    for (let up = 1; up <= 40 && up < bestCost; up++) {
      const yy = y - up;
      if (yy < 2) break;
      const cell = grid.get(x, yy);
      if (cell !== Tile.AIR && cell !== Tile.LADDER) break;
      if (ctx.flags[yy * w + x]! & F_PROTECT) break;
      if (IS_SOLID[grid.get(x, yy - 1)]) break;
      let ok = false;
      for (let dir = -1; dir <= 1 && !ok; dir += 2) {
        const j = yy * w + x + dir;
        const l = t.land[j]!;
        if (l >= 0 && t.node[l]! >= 0 && t.toExit[t.node[l]!]) ok = true;
      }
      if (ok) {
        bestCost = up;
        bx = x;
        by0 = yy;
        by1 = y;
        break;
      }
    }
  }
  if (bx < 0) return false;
  for (let y = by0; y <= by1; y++) {
    put(ctx, bx, y, Tile.LADDER);
    ctx.flags[y * w + bx]! |= F_CLAIM | F_NOHAZ;
  }
  return true;
}

/**
 * Carve a walkable connection from node a to node b: a ladder shaft for the part of the climb
 * stairs can't cover, then 1:1 stairs / slope with 3 tiles of headroom; missing footing becomes
 * plank (over air) or rock (over hazards/liquid).
 */
function walkway(ctx: GenCtx, t: Traversal, a: number, b: number): boolean {
  const { w, grid, flags } = ctx;
  const ca = t.cells[a]!;
  const cb = t.cells[b]!;
  let x = ca % w;
  let y = (ca - x) / w;
  const bx = cb % w;
  const by = (cb - bx) / w;
  const dir = Math.sign(bx - x);
  const needUp = y - by - Math.abs(bx - x);
  const mark = (xx: number, yy: number): void => {
    if (xx > 0 && yy > 0 && xx < w - 1 && yy < ctx.h - 1) flags[yy * w + xx]! |= F_NOHAZ;
  };
  let changed = false;
  if (needUp > 0) {
    for (let yy = y; yy >= y - needUp; yy--) {
      carve(ctx, x, yy - 1);
      carve(ctx, x, yy - 2);
      if (grid.get(x, yy) !== Tile.LADDER) changed = put(ctx, x, yy, Tile.LADDER) || changed;
      mark(x, yy);
    }
    y -= needUp;
  }
  while (x !== bx) {
    x += dir;
    if (y > by) y--;
    else if (y < by) y++;
    for (let k = 0; k <= 2; k++) {
      const before = grid.get(x, y - k);
      carve(ctx, x, y - k);
      if (grid.get(x, y - k) !== before) changed = true;
      mark(x, y - k);
    }
    const s = grid.get(x, y + 1);
    if (!IS_SOLID[s] && s !== Tile.PLATFORM && s !== Tile.LADDER) {
      changed = put(ctx, x, y + 1, s === Tile.AIR ? Tile.PLATFORM : Tile.ROCK) || changed;
    } else if (IS_HAZARD[s]) changed = put(ctx, x, y + 1, Tile.ROCK) || changed;
  }
  // Drop the rest of the way down if b is lower.
  for (let yy = y; yy <= by; yy++) {
    for (let k = 0; k <= 1; k++) {
      const before = grid.get(bx, yy - k);
      carve(ctx, bx, yy - k);
      if (grid.get(bx, yy - k) !== before) changed = true;
    }
  }
  return changed;
}
