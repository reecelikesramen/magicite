import { Content } from '../../content';
import type { EnemyDef, ResourceDef } from '../../content/types';
import { TILE } from '../constants';
import { Tile } from '../tiles';
import type { SpawnSpec } from '../world';
import { airAt, groundSpot, headroom, IS_LIQUID, IS_SOLID } from './grid';
import { decorPlacement, LANTERN_LIGHT } from './styles';
import { F_CLAIM, F_PROTECT, F_ROUTE, F_SECRET, type GenCtx, type SpawnPoint, type SpawnPointKind } from './types';
import { rectHitsSolid, specRect, type Traversal } from './validate';

/** Enemies never spawn closer than this to the player spawn (tiles). */
export const SAFE_RADIUS = 12;

interface Spot {
  x: number;
  y: number;
  reach: boolean;
  route: boolean;
}

/** Bottom-centre px of a feet cell. */
const px = (tx: number): number => tx * TILE + TILE / 2;
const py = (ty: number): number => (ty + 1) * TILE;

function floorSpots(ctx: GenCtx, t: Traversal): Spot[] {
  const { w, h, grid, flags } = ctx;
  const out: Spot[] = [];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (!groundSpot(grid, x, y)) continue;
      const f = flags[y * w + x]!;
      if (f & (F_PROTECT | F_SECRET)) continue;
      const nd = t.node[y * w + x]!;
      out.push({ x, y, reach: nd >= 0 && t.reach[nd] === 1, route: (f & F_ROUTE) !== 0 });
    }
  }
  return out;
}

const claimed = (ctx: GenCtx, x: number, y: number): boolean => (ctx.flags[y * ctx.w + x]! & (F_CLAIM | F_PROTECT)) !== 0;

function claim(ctx: GenCtx, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) if (x > 0 && x < ctx.w - 1) ctx.flags[y * ctx.w + x]! |= F_CLAIM;
}

/** Can a ground resource/prop of `wpx`×`hpx` stand at feet cell (x,y)? */
function fits(ctx: GenCtx, x: number, y: number, wpx: number, hpx: number, kind: SpawnSpec['kind'], def: string): boolean {
  const { grid } = ctx;
  const half = Math.ceil((wpx / 2 - 4) / TILE);
  for (let xx = x - half; xx <= x + half; xx++) {
    if (claimed(ctx, xx, y) || !airAt(grid, xx, y) || !IS_SOLID[grid.get(xx, y + 1)]) return false;
  }
  const r = specRect({ kind, def, x: px(x), y: py(y) });
  if (rectHitsSolid(grid, r)) return false;
  // No liquid / ladder / platform inside the footprint.
  for (let ty = Math.floor(r.y / TILE); ty <= y; ty++) {
    for (let tx = Math.floor(r.x / TILE); tx <= Math.floor((r.x + r.w - 0.01) / TILE); tx++) {
      const t = grid.get(tx, ty);
      if (t !== Tile.AIR) return false;
    }
  }
  return hpx > 0;
}

function treeFits(ctx: GenCtx, x: number, y: number, d: ResourceDef): boolean {
  const tiles = Math.ceil(d.h / TILE);
  const { grid } = ctx;
  if (headroom(grid, x, y, tiles + 2) < tiles + 1) return false;
  // Crown room: neighbours mostly clear (leaves may brush a wall).
  if (headroom(grid, x - 1, y, tiles) < tiles - 3 || headroom(grid, x + 1, y, tiles) < tiles - 3) return false;
  for (let ty = y - tiles; ty <= y; ty++) for (let tx = x - 1; tx <= x + 1; tx++) if (grid.get(tx, ty) === Tile.PLATFORM || grid.get(tx, ty) === Tile.LADDER) return false;
  return true;
}

function resourceWeight(ctx: GenCtx, d: ResourceDef): number {
  let wt = d.weight;
  // Ore veins get richer the deeper the run goes.
  if (d.id.startsWith('rock_') && d.id !== 'rock_stone') wt *= 1 + Math.max(0, ctx.req.district - d.minDepth) * 0.08;
  return wt;
}

export function populate(ctx: GenCtx, t: Traversal, secretChests: { x: number; y: number }[]): void {
  const { rng, biome, w } = ctx;
  const spots = floorSpots(ctx, t);
  const reachSpots = spots.filter((s) => s.reach);
  const sx = ctx.spawnTx;
  const sy = ctx.spawnTy;
  const far = (s: { x: number; y: number }, r: number): boolean => Math.hypot(s.x - sx, s.y - sy) >= r;

  // --- Containers ---
  const tierBase = Math.floor(ctx.req.district / 6);
  for (const c of secretChests) {
    ctx.spawns.push({ kind: 'resource', def: 'chest_iron', x: px(c.x), y: py(c.y), data: { lootTier: 3 + tierBase, secret: 1 } });
    claim(ctx, c.x - 1, c.x + 1, c.y);
  }
  const offRoute = rng.shuffle(reachSpots.filter((s) => !s.route && far(s, 10)));
  const anyReach = rng.shuffle(reachSpots.filter((s) => far(s, 8)));
  const chestCount = Math.max(1, Math.round((ctx.style.chests * w) / 100));
  let chests = 0;
  for (const s of [...offRoute, ...anyReach]) {
    if (chests >= chestCount) break;
    const iron = rng.chance(0.12 + ctx.depth * 0.35);
    const def = iron ? 'chest_iron' : 'chest_wood';
    if (!fits(ctx, s.x, s.y, 10, 8, 'resource', def)) continue;
    ctx.spawns.push({ kind: 'resource', def, x: px(s.x), y: py(s.y), data: { lootTier: (iron ? 2 : 1) + tierBase } });
    claim(ctx, s.x - 2, s.x + 2, s.y);
    chests++;
  }
  const potGroups = Math.round((ctx.style.pots * w) / 100);
  let pots = 0;
  for (const s of offRoute) {
    if (pots >= potGroups) break;
    const n = rng.int(1, 3);
    let placed = 0;
    for (let k = 0; k < n; k++) {
      if (!fits(ctx, s.x + k, s.y, 6, 7, 'resource', 'pot')) break;
      ctx.spawns.push({ kind: 'resource', def: 'pot', x: px(s.x + k), y: py(s.y), data: { lootTier: 0 } });
      claim(ctx, s.x + k, s.x + k, s.y);
      placed++;
    }
    if (placed) pots++;
  }

  // --- Harvestables ---
  const defs = [...Content.resources.values()].filter((d) => d.weight > 0 && d.biomes.includes(biome.id) && d.minDepth <= ctx.req.district);
  const ground = defs.filter((d) => d.placement === 'ground');
  const air = defs.filter((d) => d.placement === 'air');
  const ceiling = defs.filter((d) => d.placement === 'ceiling');
  const groundCount = Math.round(reachSpots.length * 0.085 * biome.resourceDensity);
  let placed = 0;
  if (ground.length) {
    for (const s of rng.shuffle(reachSpots.slice())) {
      if (placed >= groundCount) break;
      if (!far(s, 3)) continue;
      for (let attempt = 0; attempt < 3; attempt++) {
        const d = rng.weighted(ground, (r) => resourceWeight(ctx, r));
        const tree = d.background === true;
        if (tree && !treeFits(ctx, s.x, s.y, d)) continue;
        if (!fits(ctx, s.x, s.y, d.w, d.h, 'resource', d.id)) continue;
        ctx.spawns.push({ kind: 'resource', def: d.id, x: px(s.x), y: py(s.y) });
        claim(ctx, s.x - (tree ? 2 : 1), s.x + (tree ? 2 : 1), s.y);
        placed++;
        break;
      }
    }
  }
  if (air.length) {
    const bugCount = Math.max(1, Math.round(groundCount * 0.12));
    let bugs = 0;
    for (const s of rng.shuffle(reachSpots.slice())) {
      if (bugs >= bugCount) break;
      const lift = rng.int(2, 4);
      const ay = s.y - lift;
      if (!airAt(ctx.grid, s.x, ay) || !airAt(ctx.grid, s.x, ay - 1) || headroom(ctx.grid, s.x, s.y) < lift + 2) continue;
      if (claimed(ctx, s.x, ay)) continue;
      const d = rng.weighted(air, (r) => r.weight);
      ctx.spawns.push({ kind: 'resource', def: d.id, x: px(s.x), y: py(ay) });
      claim(ctx, s.x, s.x, ay);
      bugs++;
    }
  }
  if (ceiling.length) {
    const want = Math.round(groundCount * 0.1);
    let n = 0;
    for (const s of rng.shuffle(reachSpots.slice())) {
      if (n >= want) break;
      const room = headroom(ctx.grid, s.x, s.y);
      if (room < 4 || room > 14) continue;
      const cy = s.y - room + 1;
      if (!IS_SOLID[ctx.grid.get(s.x, cy - 1)] || claimed(ctx, s.x, cy)) continue;
      const d = rng.weighted(ceiling, (r) => r.weight);
      ctx.spawns.push({ kind: 'resource', def: d.id, x: px(s.x), y: cy * TILE });
      claim(ctx, s.x, s.x, cy);
      n++;
    }
  }

  // --- Enemy spawn points & enemies ---
  enemySpawns(ctx, reachSpots);

  // --- Decor & lanterns ---
  decor(ctx, reachSpots, spots);
}

const BEHAVIOR_POINT: Record<string, SpawnPointKind> = {
  walker: 'ground',
  hopper: 'ground',
  charger: 'ground',
  shooter: 'ground',
  burrower: 'ground',
  critter: 'ground',
  flyer: 'air',
  dropper: 'ceiling',
  turret: 'turret',
};

function enemySpawns(ctx: GenCtx, reachSpots: Spot[]): void {
  const { rng, w, h, grid, biome } = ctx;
  const sx = ctx.spawnTx;
  const sy = ctx.spawnTy;
  const dist = (x: number, y: number): number => Math.hypot(x - sx, y - sy);
  const arena = ctx.arena;
  const inArena = (x: number, y: number): boolean => !!arena && x >= arena.x0 - 2 && x <= arena.x1 + 2 && y >= arena.y0 - 2 && y <= arena.y1 + 2;
  const points: SpawnPoint[] = [];
  const taken = new Uint8Array(w * h);
  const spaced = (x: number, y: number, r: number): boolean => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (taken[(y + dy) * w + x + dx]) return false;
    return true;
  };
  const take = (x: number, y: number): void => {
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) taken[y * w + x] = 1;
  };
  const shuffled = rng.shuffle(reachSpots.slice());
  for (const s of shuffled) {
    const d = dist(s.x, s.y);
    if (d < SAFE_RADIUS || inArena(s.x, s.y) || s.x < 3 || s.x > w - 4 || s.y < 4 || s.y > h - 4) continue;
    if (!spaced(s.x, s.y, 3)) continue;
    const room = headroom(grid, s.x, s.y, 16);
    if (room < 3) continue;
    const flatL = groundSpotRun(ctx, s.x, s.y, -1);
    const flatR = groundSpotRun(ctx, s.x, s.y, 1);
    // Turrets want a ledge with a view; walkers want room to patrol.
    if (flatL + flatR >= 3) {
      const turret = room >= 5 && flatL + flatR <= 6 && rng.chance(0.3);
      points.push({ kind: turret ? 'turret' : 'ground', x: px(s.x), y: py(s.y), dist: d });
      take(s.x, s.y);
    }
    // Flyers hover a few tiles above the floor.
    if (room >= 7 && rng.chance(0.35)) {
      const ay = s.y - rng.int(3, Math.min(6, room - 3));
      if (dist(s.x, ay) >= SAFE_RADIUS && spaced(s.x, ay, 3)) {
        points.push({ kind: 'air', x: px(s.x), y: py(ay), dist: dist(s.x, ay) });
        take(s.x, ay);
      }
    }
    // Droppers cling to a ceiling with a clear fall below.
    if (room >= 5 && room <= 12 && rng.chance(0.25)) {
      const cy = s.y - room + 1;
      const above = grid.get(s.x, cy - 1);
      if (IS_SOLID[above] && above !== Tile.BEDROCK && spaced(s.x, cy, 3) && dist(s.x, cy) >= SAFE_RADIUS) {
        points.push({ kind: 'ceiling', x: px(s.x), y: cy * TILE, dist: dist(s.x, cy) });
        take(s.x, cy);
      }
    }
  }
  // A big flat arena-like spot for a roaming giant monster (run flow decides whether to use it).
  let giant: SpawnPoint | null = null;
  let bestRun = 0;
  for (const s of shuffled) {
    const d = dist(s.x, s.y);
    if (d < 40 || inArena(s.x, s.y)) continue;
    const run = groundSpotRun(ctx, s.x, s.y, -1) + groundSpotRun(ctx, s.x, s.y, 1);
    if (run > bestRun && headroom(grid, s.x, s.y, 10) >= 6) {
      bestRun = run;
      giant = { kind: 'giant', x: px(s.x), y: py(s.y), dist: d };
    }
  }
  if (giant && bestRun >= 8) points.push(giant);
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  ctx.points = points;

  // Choose enemies for a density-scaled subset of points.
  if (ctx.req.kind === 'town' || biome.enemyDensity <= 0) return;
  const pool = [...Content.enemies.values()].filter((e) => e.weight > 0 && e.biomes.includes(biome.id) && e.minDepth <= ctx.req.district);
  if (pool.length === 0) return;
  const byKind = new Map<SpawnPointKind, EnemyDef[]>();
  for (const e of pool) {
    const k = BEHAVIOR_POINT[e.behavior] ?? 'ground';
    const list = byKind.get(k) ?? [];
    list.push(e);
    byKind.set(k, list);
  }
  const want = Math.round((w / 9) * biome.enemyDensity * (1 + 0.6 * ctx.depth));
  const candidates = rng.shuffle(points.filter((p) => p.kind !== 'giant'));
  let made = 0;
  for (const p of candidates) {
    if (made >= want) break;
    let list = byKind.get(p.kind);
    if (!list && p.kind === 'turret') list = byKind.get('ground');
    if (!list || list.length === 0) continue;
    const e = rng.weighted(list, (d) => d.weight);
    const y = p.kind === 'ceiling' ? p.y + e.h : p.y;
    const spec: SpawnSpec = { kind: 'enemy', def: e.id, x: p.x, y, data: { point: p.kind } };
    if (rectHitsSolid(ctx.grid, specRect(spec))) continue;
    ctx.spawns.push(spec);
    made++;
  }
}

/** Count of consecutive standing spots at the same height in a direction (max 8). */
function groundSpotRun(ctx: GenCtx, x: number, y: number, dir: number): number {
  let n = 0;
  for (let k = 1; k <= 8; k++) {
    const xx = x + dir * k;
    if (!groundSpot(ctx.grid, xx, y)) break;
    n++;
  }
  return n;
}

function decor(ctx: GenCtx, reachSpots: Spot[], spots: Spot[]): void {
  const { rng, biome, style, w, grid } = ctx;
  const keys = biome.decor;
  // Hanging lanterns (with a static light) along tunnels.
  const lanterns = Math.round((style.lanterns * w) / 100);
  let lit = 0;
  for (const s of rng.shuffle(reachSpots.slice())) {
    if (lit >= lanterns || ctx.lights.length >= 100) break;
    const room = headroom(grid, s.x, s.y, 12);
    if (room < 4 || room > 10) continue;
    const cy = s.y - room + 1;
    if (!IS_SOLID[grid.get(s.x, cy - 1)] || claimed(ctx, s.x, cy)) continue;
    let near = false;
    for (const l of ctx.lights) if (Math.abs(l.x - px(s.x)) < 14 * TILE && Math.abs(l.y - cy * TILE) < 8 * TILE) near = true;
    if (near) continue;
    ctx.spawns.push({ kind: 'prop', def: 'decor_lantern', x: px(s.x), y: (cy + 1) * TILE, data: { hang: 1, decor: 1 } });
    ctx.lights.push({ x: px(s.x), y: cy * TILE + 6, radius: LANTERN_LIGHT.radius, color: LANTERN_LIGHT.color, intensity: LANTERN_LIGHT.intensity });
    claim(ctx, s.x, s.x, cy);
    lit++;
  }
  if (keys.length === 0) return;
  const floorKeys = keys.filter((k) => decorPlacement(k) === 'floor' && k !== 'decor_lantern');
  const ceilKeys = keys.filter((k) => decorPlacement(k) === 'ceiling' && k !== 'decor_lantern');
  const count = Math.round((style.decor * w) / 100);
  let n = 0;
  const pool = rng.shuffle(spots.slice());
  for (const s of pool) {
    if (n >= count) break;
    const hang = ceilKeys.length > 0 && (floorKeys.length === 0 || rng.chance(0.4));
    if (hang) {
      const room = headroom(grid, s.x, s.y, 20);
      if (room < 4) continue;
      const cy = s.y - room + 1;
      const above = grid.get(s.x, cy - 1);
      if (!IS_SOLID[above] || above === Tile.BEDROCK || claimed(ctx, s.x, cy) || IS_LIQUID[grid.get(s.x, cy)]) continue;
      ctx.spawns.push({ kind: 'prop', def: rng.pick(ceilKeys), x: px(s.x), y: (cy + 1) * TILE, data: { hang: 1, decor: 1 } });
      claim(ctx, s.x, s.x, cy);
    } else {
      if (claimed(ctx, s.x, s.y) || !airAt(grid, s.x, s.y)) continue;
      ctx.spawns.push({ kind: 'prop', def: rng.pick(floorKeys), x: px(s.x), y: py(s.y), data: { decor: 1 } });
      claim(ctx, s.x, s.x, s.y);
    }
    n++;
  }
}
