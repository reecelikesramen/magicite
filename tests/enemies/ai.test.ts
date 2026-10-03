import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { createRun, emptyInput } from '../../src/sim';
import { TILE } from '../../src/sim/constants';
import { generateLevel } from '../../src/sim/gen';
import { districtRequest } from '../../src/sim/run';
import { spawnFromSpec } from '../../src/sim/spawn';
import { Tile, TileGrid, Wall } from '../../src/sim/tiles';
import type { Entity, GameEvent } from '../../src/sim/types';
import type { Level, World } from '../../src/sim/world';

const HERO = { name: 'T', race: 'drifter', hat: '', companion: '' };

/** A closed 64x24 room with a flat floor at row 18; the player stands at x=8 tiles. */
function arena(): World {
  const w = createRun(5, [HERO]);
  const g = new TileGrid(64, 24);
  g.fillWall(0, 0, 63, 23, Wall.CAVE);
  g.fill(0, 0, 63, 0, Tile.BEDROCK);
  g.fill(0, 18, 63, 23, Tile.BEDROCK);
  g.fill(0, 0, 0, 23, Tile.BEDROCK);
  g.fill(63, 0, 63, 23, Tile.BEDROCK);
  const level: Level = {
    info: { district: 3, biome: 'woods', name: 'Test', isTown: false, isBoss: false, seed: 1 },
    grid: g, spawn: { x: 8 * TILE, y: 18 * TILE }, exits: [], locked: false, spawns: [], lights: [],
  };
  w.loadLevel(level);
  for (const e of w.entities) if (e.kind !== 'player') w.kill(e);
  const p = w.playerEntity(0)!;
  p.invuln = 1e9; // observe behaviour without the hero dying
  return w;
}

function spawn(w: World, def: string, tx: number, bottomTy = 18): Entity {
  const before = new Set(w.entities.map((e) => e.id));
  spawnFromSpec(w, { kind: 'enemy', def, x: tx * TILE + 4, y: bottomTy * TILE });
  return w.entities.find((e) => !before.has(e.id))!;
}

function step(w: World, n: number, log?: GameEvent[]): void {
  for (let i = 0; i < n; i++) {
    w.step([emptyInput()]);
    if (log) log.push(...w.events);
  }
}

describe('enemy roster', () => {
  it('every combat biome spawns at least 3 kinds of enemies at its depths', () => {
    for (const b of Content.biomes.values()) {
      if (b.id === 'lair') continue; // boss arena only (its foes come from the Blightwall)
      const kinds = new Set<string>();
      for (const level of b.depths.filter((d) => d % 2 === 1).slice(0, 3)) {
        for (let s = 0; s < 4; s++) {
          const w = createRun(100 + s, [HERO]);
          const l = generateLevel(districtRequest(w, level, b.id));
          for (const sp of l.spawns) if (sp.kind === 'enemy') kinds.add(sp.def);
        }
      }
      expect(kinds.size, `${b.id}: ${[...kinds].join(', ')}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('every enemy has a sprite key, positive hp/speed rules and valid behaviour', () => {
    for (const d of Content.enemies.values()) {
      expect(d.sprite).toBe(`enemy_${d.id}`);
      expect(d.hp).toBeGreaterThan(0);
      if (d.behavior === 'shooter' || d.behavior === 'turret') expect(Content.projectiles.has(d.projectile ?? ''), d.id).toBe(true);
    }
  });
});

describe('behaviours', () => {
  it('chargers telegraph for ≥ 0.4 s before charging, and are stunned by walls', () => {
    const w = arena();
    const boar = spawn(w, 'boar', 15);
    const log: GameEvent[] = [];
    let windupAt = -1;
    let chargeAt = -1;
    let stunned = false;
    for (let i = 0; i < 600 && !stunned; i++) {
      step(w, 1, log);
      if (boar.ai?.state === 'windup' && windupAt < 0) windupAt = i;
      if (boar.ai?.state === 'charge' && chargeAt < 0) chargeAt = i;
      if (boar.ai?.state === 'stunned') stunned = true;
    }
    expect(windupAt).toBeGreaterThanOrEqual(0);
    expect(chargeAt - windupAt).toBeGreaterThanOrEqual(24);
    expect(log.some((e) => e.type === 'sfx' && e.id === 'enemy_telegraph')).toBe(true);
    expect(stunned).toBe(true); // the hero is invulnerable, so the boar runs into the far wall
  });

  it('flyers hover, telegraph, then swoop; never faster than 150 px/s', () => {
    const w = arena();
    const bat = spawn(w, 'cave_bat', 16, 12);
    let swooped = false;
    let maxSpeed = 0;
    for (let i = 0; i < 600; i++) {
      step(w, 1);
      if (bat.ai?.state === 'swoop') swooped = true;
      maxSpeed = Math.max(maxSpeed, Math.hypot(bat.vx, bat.vy));
    }
    expect(swooped).toBe(true);
    expect(maxSpeed).toBeLessThanOrEqual(150.5);
  });

  it('shooters aim (telegraph) and then fire a projectile', () => {
    const w = arena();
    spawn(w, 'frostling', 22);
    const log: GameEvent[] = [];
    let fired = false;
    for (let i = 0; i < 600 && !fired; i++) {
      step(w, 1, log);
      fired = w.entities.some((e) => e.kind === 'projectile' && e.projectile?.def === 'ice_shard');
    }
    expect(fired).toBe(true);
    expect(log.some((e) => e.type === 'sfx' && e.id === 'enemy_telegraph')).toBe(true);
  });

  it('droppers cling to the ceiling and drop when the hero passes beneath', () => {
    const w = arena();
    w.level.grid.fill(5, 10, 12, 10, Tile.BEDROCK); // a low overhang above the hero
    const sp = spawn(w, 'cave_spider', 8, 13);
    step(w, 2);
    expect(['cling', 'shake']).toContain(sp.ai?.state); // the hero is right below: it may already be shaking
    expect(sp.y).toBe(11 * TILE); // hangs right under the overhang
    let landed = false;
    for (let i = 0; i < 300 && !landed; i++) {
      step(w, 1);
      landed = sp.ai?.state === 'walk' && sp.onGround;
    }
    expect(landed).toBe(true);
  });

  it('walkers patrol and turn around at walls instead of pushing into them', () => {
    const w = arena();
    const p = w.playerEntity(0)!;
    p.x = 60 * TILE; // far away: pure patrol
    const beetle = spawn(w, 'forest_beetle', 2);
    const dirs = new Set<number>();
    for (let i = 0; i < 6000; i++) {
      step(w, 1);
      if (Math.abs(beetle.vx) > 1) dirs.add(Math.sign(beetle.vx));
    }
    expect(dirs.size).toBe(2);
  });
});

describe('robustness', () => {
  it('enemies never leave the level and runs are deterministic', () => {
    const sim = (seed: number) => {
      const w = createRun(seed, [HERO]);
      w.playerEntity(0)!.invuln = 1e9;
      for (let i = 0; i < 900; i++) w.step([emptyInput()]);
      for (const e of w.entities) {
        if (e.kind !== 'enemy' || e.def === 'blight_wraith') continue;
        expect(e.x).toBeGreaterThanOrEqual(0);
        expect(e.x + e.w).toBeLessThanOrEqual(w.level.grid.pixelWidth);
        expect(e.y + e.h).toBeLessThanOrEqual(w.level.grid.pixelHeight);
        expect(Number.isFinite(e.x) && Number.isFinite(e.y)).toBe(true);
      }
      return w.entities.filter((e) => e.kind === 'enemy').map((e) => `${e.def}:${e.x.toFixed(2)},${e.y.toFixed(2)}`).join('|');
    };
    expect(sim(77)).toBe(sim(77));
  });
});
