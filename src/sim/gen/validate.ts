import { Content } from '../../content';
import { rectsOverlap, type Rect } from '../../engine/math';
import { TILE } from '../constants';
import { Tile, TILE_PROPS, type TileGrid } from '../tiles';
import type { Level, SpawnSpec } from '../world';

/**
 * Movement capability budget used by the traversability graph (GDD §8; conservative w.r.t. PHYS:
 * single jump apex ≈ 3.4 tiles, double ≈ 5.5, air dash ≈ 5 tiles + run-up). The player body is
 * 1 tile wide and 2 tiles tall (6×11 px hitbox).
 */
export const MOVE = {
  /** Max rise with a single jump. */
  singleJump: 3,
  /** Max rise with the double jump. */
  doubleJump: 5,
  /** Horizontal reach (gap crossing, dash) while rising ≤ singleJump. */
  reachLow: 6,
  /** Horizontal reach at double-jump heights. */
  reachHigh: 4,
  /** Leap out of water (head above the surface). */
  swimJump: 2,
  swimReach: 3,
} as const;

/** Cell class bits. */
const SOLID = 1;
const FREE = 2;
const PLAT = 4;
const LADDER = 8;
const WATER = 16;

export interface Traversal {
  w: number;
  h: number;
  cls: Uint8Array;
  /** cell → node index (-1 if a body can't rest there). */
  node: Int32Array;
  /** node → cell index. */
  cells: Int32Array;
  count: number;
  /** cell → landing cell when falling from it (-1 = blocked / hazard). */
  land: Int32Array;
  /** Forward graph (CSR over nodes). */
  offs: Int32Array;
  dst: Int32Array;
  /** node reachable from the spawn. */
  reach: Uint8Array;
  /** node can reach at least one exit. */
  toExit: Uint8Array;
  spawnNode: number;
  exitNodes: number[][];
  exitReachable: boolean[];
}

function classify(g: TileGrid): Uint8Array {
  const { w, h, fg } = g;
  const cls = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const t = fg[i]!;
    const p = TILE_PROPS[t] ?? TILE_PROPS[Tile.BEDROCK]!;
    if (p.solid) {
      cls[i] = SOLID;
      continue;
    }
    if (p.hazard > 0) continue;
    let c = FREE;
    if (p.oneWay) c |= PLAT;
    if (p.climbable) {
      c |= LADDER;
      // Top rung of a ladder acts as a one-way platform (see physics isPlatformTile).
      if (i < w || fg[i - w] !== Tile.LADDER) c |= PLAT;
    }
    if (p.liquid) c |= WATER;
    cls[i] = c;
  }
  return cls;
}

/** Feet cell → foot-cell index of the first cell below it (inclusive) where a fall stops, or -1. */
function computeLanding(cls: Uint8Array, w: number, h: number, isNode: Uint8Array): Int32Array {
  const land = new Int32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0; y--) {
      const i = y * w + x;
      const c = cls[i]!;
      if (!(c & FREE)) land[i] = -1;
      else if (isNode[i]) land[i] = i;
      else if (y + 1 >= h) land[i] = -1;
      else {
        const b = cls[i + w]!;
        // Support below but no room for the body (or a platform cell sitting on solid): blocked.
        land[i] = b & SOLID || (b & PLAT && !(c & PLAT)) ? -1 : land[i + w]!;
      }
    }
  }
  return land;
}

let edgeBuf = new Int32Array(1 << 16);

/**
 * Build the movement graph of a grid and run reachability from `spawn` (feet cell) forward and
 * from the exits backward. Pure; allocates a few typed arrays per call.
 */
export function analyzeTraversal(g: TileGrid, spawnTx: number, spawnTy: number, exits: readonly Rect[]): Traversal {
  const { w, h } = g;
  const n = w * h;
  const cls = classify(g);
  const isNode = new Uint8Array(n);
  const node = new Int32Array(n).fill(-1);
  let count = 0;
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = cls[i]!;
      if (!(c & FREE) || !(cls[i - w]! & FREE)) continue;
      if (c & PLAT && !(c & LADDER)) continue; // inside a one-way platform: only in passing
      const below = y + 1 < h ? cls[i + w]! : SOLID;
      if (c & (LADDER | WATER) || below & (SOLID | PLAT)) {
        isNode[i] = 1;
        node[i] = count++;
      }
    }
  }
  const cells = new Int32Array(count);
  for (let i = 0; i < n; i++) if (node[i]! >= 0) cells[node[i]!] = i;
  const land = computeLanding(cls, w, h, isNode);

  // --- Edges (forward CSR) ---
  const offs = new Int32Array(count + 1);
  const stamp = new Int32Array(count).fill(-1);
  let ne = 0;
  const add = (from: number, cell: number): void => {
    if (cell < 0) return;
    const t = node[cell]!;
    if (t < 0 || t === from || stamp[t] === from) return;
    stamp[t] = from;
    if (ne >= edgeBuf.length) {
      const nb = new Int32Array(edgeBuf.length * 2);
      nb.set(edgeBuf);
      edgeBuf = nb;
    }
    edgeBuf[ne++] = t;
  };
  for (let k = 0; k < count; k++) {
    offs[k] = ne;
    const i = cells[k]!;
    const x = i % w;
    const y = (i - x) / w;
    const c = cls[i]!;
    const climbing = (c & LADDER) !== 0;
    const swimming = (c & WATER) !== 0;
    // Sideways step (walk, swim, let go of a ladder sideways).
    for (let dir = -1; dir <= 1; dir += 2) {
      const xx = x + dir;
      if (xx < 0 || xx >= w) continue;
      const j = i + dir;
      if (cls[j]! & FREE && cls[j - w]! & FREE) add(k, land[j]!);
    }
    // Down: climb / swim down, let go, or drop through a platform / ladder top.
    if (y + 1 < h) {
      const j = i + w;
      if (climbing || swimming) {
        if (cls[j]! & FREE) add(k, land[j]!);
      } else if (cls[j]! & PLAT) {
        add(k, cls[j]! & LADDER ? j : land[j]!);
      }
    }
    // Up: climb / swim up.
    if ((climbing || swimming) && y >= 2) {
      const j = i - w;
      if (cls[j]! & FREE && cls[j - w]! & FREE && isNode[j]) add(k, j);
    }
    // Jumps: rise r tiles straight up, then travel horizontally at that height, then fall.
    let rmax: number = MOVE.doubleJump;
    let reachLow: number = MOVE.reachLow;
    let reachHigh: number = MOVE.reachHigh;
    if (swimming) {
      if (cls[i - w]! & WATER) rmax = -1; // fully submerged: swim moves only
      else {
        rmax = MOVE.swimJump;
        reachLow = MOVE.swimReach;
        reachHigh = MOVE.swimReach;
      }
    }
    for (let r = 0; r <= rmax; r++) {
      const fy = y - r;
      if (r > 0) {
        if (fy - 1 < 0 || !(cls[i - (r + 1) * w]! & FREE)) break;
        add(k, land[i - r * w]!);
      }
      const fr = i - r * w;
      const reach = r <= MOVE.singleJump ? reachLow : reachHigh;
      for (let dir = -1; dir <= 1; dir += 2) {
        for (let d = 1; d <= reach; d++) {
          const xx = x + dir * d;
          if (xx < 0 || xx >= w) break;
          const j = fr + dir * d;
          if (!(cls[j]! & FREE) || !(cls[j - w]! & FREE)) break;
          add(k, land[j]!);
        }
      }
    }
  }
  offs[count] = ne;
  const dst = edgeBuf.slice(0, ne);

  // --- Reverse CSR ---
  const roffs = new Int32Array(count + 1);
  for (let e = 0; e < ne; e++) roffs[dst[e]! + 1]!++;
  for (let k = 0; k < count; k++) roffs[k + 1]! += roffs[k]!;
  const rsrc = new Int32Array(ne);
  const fill = roffs.slice(0, count);
  for (let k = 0; k < count; k++) {
    for (let e = offs[k]!; e < offs[k + 1]!; e++) rsrc[fill[dst[e]!]!++] = k;
  }

  const queue = new Int32Array(Math.max(1, count));
  const reach = new Uint8Array(count);
  const spawnCell = spawnTy * w + spawnTx;
  const spawnNode = spawnTx >= 0 && spawnTy >= 0 && spawnTx < w && spawnTy < h ? node[spawnCell]! : -1;
  if (spawnNode >= 0) {
    let qh = 0;
    let qt = 0;
    queue[qt++] = spawnNode;
    reach[spawnNode] = 1;
    while (qh < qt) {
      const a = queue[qh++]!;
      for (let e = offs[a]!; e < offs[a + 1]!; e++) {
        const b = dst[e]!;
        if (!reach[b]) {
          reach[b] = 1;
          queue[qt++] = b;
        }
      }
    }
  }

  const exitNodes: number[][] = [];
  const toExit = new Uint8Array(count);
  let qh = 0;
  let qt = 0;
  for (const ex of exits) {
    const list: number[] = [];
    const tx0 = Math.floor(ex.x / TILE);
    const tx1 = Math.floor((ex.x + ex.w - 1) / TILE);
    const ty0 = Math.floor(ex.y / TILE);
    const ty1 = Math.floor((ex.y + ex.h - 1) / TILE);
    for (let ty = Math.max(1, ty0); ty <= Math.min(h - 1, ty1); ty++) {
      for (let tx = Math.max(0, tx0); tx <= Math.min(w - 1, tx1); tx++) {
        const nd = node[ty * w + tx]!;
        if (nd >= 0) {
          list.push(nd);
          if (!toExit[nd]) {
            toExit[nd] = 1;
            queue[qt++] = nd;
          }
        }
      }
    }
    exitNodes.push(list);
  }
  while (qh < qt) {
    const b = queue[qh++]!;
    for (let e = roffs[b]!; e < roffs[b + 1]!; e++) {
      const a = rsrc[e]!;
      if (!toExit[a]) {
        toExit[a] = 1;
        queue[qt++] = a;
      }
    }
  }
  const exitReachable = exitNodes.map((l) => l.some((nd) => reach[nd] === 1));
  return { w, h, cls, node, cells, count, land, offs, dst, reach, toExit, spawnNode, exitNodes, exitReachable };
}

/** Feet cell of a bottom-centre spawn position. */
export function feetCell(x: number, y: number): { tx: number; ty: number } {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) - 1 };
}

/** Number of nodes reachable from the spawn that can never get to an exit (pits, dead ends). */
export function softLockCount(t: Traversal): number {
  if (t.exitNodes.length === 0) return 0;
  let n = 0;
  for (let k = 0; k < t.count; k++) if (t.reach[k] && !t.toExit[k]) n++;
  return n;
}

/** Hitbox of a SpawnSpec once instantiated (mirrors src/sim/spawn.ts conventions). */
export function specRect(s: SpawnSpec): Rect {
  let w = 8;
  let h = 8;
  let top = s.y - h;
  switch (s.kind) {
    case 'enemy': {
      const d = Content.enemies.get(s.def);
      if (d) ({ w, h } = d);
      top = s.y - h;
      break;
    }
    case 'boss': {
      const d = Content.bosses.get(s.def);
      if (d) ({ w, h } = d);
      top = s.y - h;
      break;
    }
    case 'resource': {
      const d = Content.resources.get(s.def);
      if (d) ({ w, h } = d);
      top = d?.placement === 'ceiling' ? s.y : s.y - h;
      break;
    }
    case 'npc':
      h = 12;
      top = s.y - h;
      break;
    default:
      break;
  }
  return { x: s.x - w / 2, y: top, w, h };
}

/** True if any solid tile overlaps the px rect. */
export function rectHitsSolid(g: TileGrid, r: Rect): boolean {
  const tx0 = Math.floor(r.x / TILE);
  const tx1 = Math.floor((r.x + r.w - 0.001) / TILE);
  const ty0 = Math.floor(r.y / TILE);
  const ty1 = Math.floor((r.y + r.h - 0.001) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (TILE_PROPS[g.get(tx, ty)]!.solid) return true;
  return false;
}

export interface LevelReport {
  problems: string[];
  softLocks: number;
  reachableNodes: number;
  nodes: number;
}

/**
 * Check a generated level against the gen contract: spawn valid, every exit reachable, portals on
 * solid ground and not overlapping, no entity inside solid tiles, no enemies near the spawn,
 * boss arena consistency. `problems` empty = valid.
 */
export function checkLevel(level: Level): LevelReport {
  const problems: string[] = [];
  const g = level.grid;
  const { tx, ty } = feetCell(level.spawn.x, level.spawn.y);
  const t = analyzeTraversal(g, tx, ty, level.exits);
  if (t.spawnNode < 0) problems.push(`spawn (${tx},${ty}) is not a standable cell`);
  t.exitReachable.forEach((ok, i) => {
    if (!ok) problems.push(`exit ${i} (${level.exits[i]!.biome || 'gate'}) unreachable from spawn`);
  });
  for (let i = 0; i < level.exits.length; i++) {
    const e = level.exits[i]!;
    if (e.x < 0 || e.y < 0 || e.x + e.w > g.pixelWidth || e.y + e.h > g.pixelHeight) problems.push(`exit ${i} out of bounds`);
    if (rectHitsSolid(g, e)) problems.push(`exit ${i} overlaps solid tiles`);
    const by = Math.floor((e.y + e.h) / TILE);
    for (let x = Math.floor(e.x / TILE); x <= Math.floor((e.x + e.w - 1) / TILE); x++) {
      if (!TILE_PROPS[g.get(x, by)]!.solid) {
        problems.push(`exit ${i} not on solid ground at column ${x}`);
        break;
      }
    }
    for (let j = i + 1; j < level.exits.length; j++) if (rectsOverlap(e, level.exits[j]!)) problems.push(`exits ${i} and ${j} overlap`);
  }
  const sx = level.spawn.x;
  const sy = level.spawn.y;
  for (const s of level.spawns) {
    const r = specRect(s);
    if (r.x < 0 || r.y < 0 || r.x + r.w > g.pixelWidth || r.y + r.h > g.pixelHeight) problems.push(`${s.kind} ${s.def} out of bounds at ${s.x},${s.y}`);
    else if (rectHitsSolid(g, r)) problems.push(`${s.kind} ${s.def} inside solid at ${s.x},${s.y}`);
    if (s.kind === 'enemy' && Math.hypot(s.x - sx, s.y - sy) < 12 * TILE) problems.push(`enemy ${s.def} within 12 tiles of spawn`);
  }
  if (level.info.isBoss) {
    if (!level.arena) problems.push('boss level without arena');
    const boss = level.spawns.find((s) => s.kind === 'boss');
    if (!boss) problems.push('boss level without boss spawn');
    if (level.arena && boss && !(boss.x > level.arena.x && boss.x < level.arena.x + level.arena.w && boss.y > level.arena.y && boss.y <= level.arena.y + level.arena.h))
      problems.push('boss spawn outside arena');
    if (!level.locked) problems.push('boss level not locked');
  }
  let reachable = 0;
  for (let k = 0; k < t.count; k++) reachable += t.reach[k]!;
  return { problems, softLocks: softLockCount(t), reachableNodes: reachable, nodes: t.count };
}
