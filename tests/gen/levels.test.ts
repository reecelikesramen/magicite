import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { rectsOverlap } from '../../src/engine/math';
import { TILE } from '../../src/sim/constants';
import { checkLevel, generateLevel, gridHash, TOWN_SIZE, type GeneratedLevel, type LevelRequest } from '../../src/sim/gen';
import { SAFE_RADIUS } from '../../src/sim/gen/populate';
import { arenaSize } from '../../src/sim/gen/structures';
import { rectHitsSolid } from '../../src/sim/gen/validate';

/**
 * Generator contract over many seeds per biome & kind: valid (spawn standable, every exit reachable,
 * portals on solid ground and apart, no entity inside solids, no enemies near the spawn), deterministic,
 * sizes in range, and fast.
 */
const SEEDS = 100;
const NEXT = ['woods', 'fen', 'hollow'];
const COMBAT_BIOMES = [...Content.biomes.values()].filter((b) => b.id !== 'lair').map((b) => b.id);
const timings: Record<string, number> = {};

function request(biome: string, kind: LevelRequest['kind'], i: number): LevelRequest {
  const def = Content.biomes.get(biome)!;
  const district = kind === 'lair' ? 21 : def.depths[i % def.depths.length]!;
  return { seed: 7 + i * 7919, district, biome, kind, nextBiomes: kind === 'town' || kind === 'lair' ? [] : NEXT };
}

function fingerprint(l: GeneratedLevel): string {
  return JSON.stringify([gridHash(l.grid), l.spawn, l.exits, l.spawns, l.lights, l.spawnPoints, l.arena ?? null, l.info, l.locked]);
}

function sweep(biome: string, kind: LevelRequest['kind'], check: (l: GeneratedLevel, req: LevelRequest) => void): void {
  let total = 0;
  for (let i = 0; i < SEEDS; i++) {
    const req = request(biome, kind, i);
    const t0 = performance.now();
    const level = generateLevel(req);
    total += performance.now() - t0;
    const rep = checkLevel(level);
    expect(rep.problems, `${biome}/${kind} seed ${req.seed}`).toEqual([]);
    expect(rep.softLocks, `${biome}/${kind} seed ${req.seed} soft-locks`).toBe(0);
    check(level, req);
    // Determinism: regenerate a subset and compare everything.
    if (i % 10 === 0) expect(fingerprint(generateLevel(req))).toBe(fingerprint(level));
  }
  timings[`${biome}/${kind}`] = total / SEEDS;
}

function commonChecks(l: GeneratedLevel): void {
  const g = l.grid;
  // Closed level: bedrock border.
  for (let x = 0; x < g.w; x++) {
    expect(g.get(x, 0)).toBe(3);
    expect(g.get(x, g.h - 1)).toBe(3);
  }
  for (const s of l.spawns) {
    if (s.kind === 'resource') expect(Content.resources.has(s.def), s.def).toBe(true);
    if (s.kind === 'enemy' && s.def !== 'chicken') expect(Content.enemies.has(s.def), s.def).toBe(true);
  }
  for (const p of l.spawnPoints) {
    expect(Math.hypot(p.x - l.spawn.x, p.y - l.spawn.y)).toBeGreaterThanOrEqual(SAFE_RADIUS * TILE - TILE);
    if (p.kind !== 'ceiling') expect(rectHitsSolid(g, { x: p.x - 3, y: p.y - 8, w: 6, h: 8 }), `${p.kind} point inside solid`).toBe(false);
  }
}

function portalChecks(l: GeneratedLevel, req: LevelRequest): void {
  expect(l.exits.map((e) => e.biome)).toEqual(req.nextBiomes);
  for (let i = 0; i < l.exits.length; i++) {
    for (let j = i + 1; j < l.exits.length; j++) {
      const a = l.exits[i]!;
      const b = l.exits[j]!;
      // Spaced: at least one tile of clearance between portals.
      expect(rectsOverlap({ x: a.x - TILE, y: a.y, w: a.w + 2 * TILE, h: a.h }, b), `portals ${i}/${j} too close`).toBe(false);
    }
  }
}

describe.each(COMBAT_BIOMES)('level gen: %s', (biome) => {
  const def = Content.biomes.get(biome)!;

  it(`normal districts (${SEEDS} seeds)`, { timeout: 120_000 }, () => {
    sweep(biome, 'normal', (l, req) => {
      commonChecks(l);
      portalChecks(l, req);
      expect(l.grid.w).toBeGreaterThanOrEqual(def.size.w[0]);
      expect(l.grid.w).toBeLessThanOrEqual(def.size.w[1]);
      expect(l.grid.h).toBeGreaterThanOrEqual(def.size.h[0]);
      expect(l.grid.h).toBeLessThanOrEqual(def.size.h[1]);
      expect(l.locked).toBe(false);
      expect(l.arena).toBeUndefined();
      expect(l.info.isTown).toBe(false);
      // Exits at the far right, spawn at the far left.
      for (const e of l.exits) expect(e.x).toBeGreaterThan(l.grid.pixelWidth * 0.8);
      expect(l.spawn.x).toBeLessThan(l.grid.pixelWidth * 0.1);
      expect(l.spawns.filter((s) => s.kind === 'boss')).toEqual([]);
      expect(l.spawns.some((s) => s.kind === 'resource' && s.def.startsWith('chest_'))).toBe(true);
      expect(l.spawnPoints.length).toBeGreaterThan(10);
    });
  });

  it(`boss districts (${SEEDS} seeds)`, { timeout: 120_000 }, () => {
    const a = arenaSize(def.boss);
    sweep(biome, 'boss', (l, req) => {
      commonChecks(l);
      portalChecks(l, req);
      expect(l.locked).toBe(true);
      expect(l.info.isBoss).toBe(true);
      const arena = l.arena!;
      expect(arena).toBeDefined();
      expect(arena.w).toBe(a.w * TILE);
      expect(arena.x + arena.w).toBeLessThanOrEqual(l.grid.pixelWidth);
      const bosses = l.spawns.filter((s) => s.kind === 'boss');
      expect(bosses.map((b) => b.def)).toEqual([def.boss]);
      // Exits are inside the arena (sealed until the boss dies).
      for (const e of l.exits) expect(rectsOverlap(e, arena)).toBe(true);
      // No regular enemies inside the arena.
      for (const s of l.spawns) if (s.kind === 'enemy') expect(s.x < arena.x - TILE || s.x > arena.x + arena.w + TILE).toBe(true);
    });
  });

  it(`towns (${SEEDS} seeds)`, { timeout: 60_000 }, () => {
    sweep(biome, 'town', (l) => {
      commonChecks(l);
      expect(l.info.isTown).toBe(true);
      expect(l.grid.w).toBeGreaterThanOrEqual(TOWN_SIZE.w[0]);
      expect(l.grid.w).toBeLessThanOrEqual(TOWN_SIZE.w[1]);
      expect(l.grid.h).toBe(TOWN_SIZE.h);
      expect(l.exits).toHaveLength(1);
      expect(l.exits[0]!.biome).toBe('');
      expect(l.exits[0]!.x).toBeGreaterThan(l.grid.pixelWidth * 0.8);
      const npcs = l.spawns.filter((s) => s.kind === 'npc').map((s) => s.def);
      for (const role of ['npc_merchant', 'npc_trader', 'npc_smith', 'npc_outfitter', 'npc_fence']) expect(npcs).toContain(role);
      expect(l.spawns.filter((s) => s.kind === 'enemy' && s.def !== 'chicken')).toEqual([]);
      expect(l.spawns.filter((s) => s.def === 'chicken').length).toBeGreaterThan(0);
      expect(l.lights.length).toBeGreaterThan(3);
      // Brick / wood facades with back walls.
      let built = 0;
      for (const t of l.grid.fg) if (t === 9 || t === 10) built++;
      expect(built).toBeGreaterThan(20);
    });
  });
});

describe('level gen: lair', () => {
  it(`final lair (${SEEDS} seeds)`, { timeout: 60_000 }, () => {
    sweep('lair', 'lair', (l) => {
      commonChecks(l);
      expect(l.exits).toEqual([]);
      expect(l.locked).toBe(true);
      expect(l.arena).toBeDefined();
      expect(l.spawns.filter((s) => s.kind === 'boss').map((s) => s.def)).toEqual(['blightwall']);
      expect(l.spawns.filter((s) => s.kind === 'enemy')).toEqual([]);
      expect(l.info.name).toBe('The Blight Lair');
    });
  });
});

describe('level gen: misc', () => {
  it('is a pure function of the request', () => {
    const req: LevelRequest = { seed: 99, district: 7, biome: 'rime', kind: 'normal', nextBiomes: ['fen', 'amethyst', 'hollow'] };
    const a = generateLevel(req);
    generateLevel({ ...req, seed: 100 });
    generateLevel({ ...req, biome: 'cinder' });
    expect(fingerprint(generateLevel({ ...req }))).toBe(fingerprint(a));
    expect(gridHash(generateLevel({ ...req, seed: 100 }).grid)).not.toBe(gridHash(a.grid));
  });

  it('supports 1 or 2 portal options and unknown biomes', () => {
    for (const nextBiomes of [['fen'], ['fen', 'rime']]) {
      const l = generateLevel({ seed: 5, district: 9, biome: 'hollow', kind: 'normal', nextBiomes });
      expect(checkLevel(l).problems).toEqual([]);
      expect(l.exits.map((e) => e.biome)).toEqual(nextBiomes);
    }
    const l = generateLevel({ seed: 5, district: 3, biome: 'nope', kind: 'normal', nextBiomes: NEXT });
    expect(checkLevel(l).problems).toEqual([]);
  });

  it('names districts by combat-district count', () => {
    expect(generateLevel({ seed: 1, district: 1, biome: 'woods', kind: 'normal', nextBiomes: NEXT }).info.name).toBe('District 1: Mossgrave Woods');
    expect(generateLevel({ seed: 1, district: 5, biome: 'fen', kind: 'boss', nextBiomes: NEXT }).info.name).toBe('District 3: Fenmire');
  });

  it('scales enemy density with depth and keeps them away from the spawn', () => {
    let shallow = 0;
    let deep = 0;
    for (let i = 0; i < 10; i++) {
      const a = generateLevel({ seed: i, district: 1, biome: 'woods', kind: 'normal', nextBiomes: NEXT });
      const b = generateLevel({ seed: i, district: 7, biome: 'woods', kind: 'normal', nextBiomes: NEXT });
      shallow += a.spawns.filter((s) => s.kind === 'enemy').length / a.grid.w;
      deep += b.spawns.filter((s) => s.kind === 'enemy').length / b.grid.w;
      for (const s of [...a.spawns, ...b.spawns]) if (s.kind === 'enemy') expect(Math.hypot(s.x - a.spawn.x, s.y - a.spawn.y) > 0).toBe(true);
    }
    expect(shallow).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(shallow);
  });

  it('generates within the time budget', () => {
    const keys = Object.keys(timings);
    // eslint-disable-next-line no-console
    console.log('gen avg ms/level:', keys.map((k) => `${k}=${timings[k]!.toFixed(1)}`).join(' '));
    for (const k of keys) expect(timings[k]!, k).toBeLessThan(40);
  });
});
