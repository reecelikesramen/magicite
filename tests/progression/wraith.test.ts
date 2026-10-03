import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { applyDamage } from '../../src/sim/combat/damage';
import { contactDamageSystem } from '../../src/sim/combat/contact';
import { secs } from '../../src/sim/constants';
import { physicsSystem } from '../../src/sim/physics';
import { playerInputLatchSystem } from '../../src/sim/player/controller';
import { statusSystem } from '../../src/sim/combat/status';
import { WRAITH, wraithEntity, wraithSpawnTick, wraithSpeed } from '../../src/sim/progression/wraith';
import { progressionSystem } from '../../src/sim/progression/xp';
import { exitSystem } from '../../src/sim/run';
import { Tile } from '../../src/sim/tiles';
import type { GameEvent } from '../../src/sim/types';
import type { LevelInfo, World } from '../../src/sim/world';
import { arenaLevel, FLOOR_Y, inp, makeWorld, placePlayer, run } from './helpers';

function world(info: Partial<LevelInfo> = {}, madcap = false, contact = false): World {
  const systems = contact
    ? [physicsSystem, contactDamageSystem, statusSystem, progressionSystem, exitSystem, playerInputLatchSystem]
    : [physicsSystem, statusSystem, progressionSystem, exitSystem, playerInputLatchSystem];
  const w = makeWorld({ systems, level: arenaLevel(info) });
  if (madcap) w.run.difficulty = 'madcap';
  placePlayer(w, 0, 400);
  return w;
}

/** Fast-forward the level timer to just before `tick`, then step across it collecting events. */
function crossTick(w: World, tick: number): GameEvent[] {
  w.run.levelTicks = tick - 2;
  const evs: GameEvent[] = [];
  for (let i = 0; i < 3; i++) {
    w.step([inp()]);
    evs.push(...w.events);
  }
  return evs;
}

const msgs = (evs: GameEvent[]) => evs.filter((e) => e.type === 'message').map((e) => (e as { text: string }).text);

describe('Blight Wraith timing', () => {
  it('spawns at 5:00, 10:00 in district 1, 2:00 on Madcap', () => {
    expect(wraithSpawnTick(world({ district: 2 }))).toBe(secs(300));
    expect(wraithSpawnTick(world({ district: 7 }))).toBe(secs(300));
    expect(wraithSpawnTick(world({ district: 1 }))).toBe(secs(600));
    expect(wraithSpawnTick(world({ district: 1 }, true))).toBe(secs(120));
    expect(wraithSpawnTick(world({ district: 9 }, true))).toBe(secs(120));
  });

  it('never in towns or the lair; boss districts only on Madcap', () => {
    expect(wraithSpawnTick(world({ district: 4, isTown: true }))).toBe(-1);
    expect(wraithSpawnTick(world({ district: 4, isTown: true }, true))).toBe(-1);
    expect(wraithSpawnTick(world({ district: 21 }))).toBe(-1);
    expect(wraithSpawnTick(world({ district: 21 }, true))).toBe(-1);
    expect(wraithSpawnTick(world({ district: 3, isBoss: true }))).toBe(-1);
    expect(wraithSpawnTick(world({ district: 3, isBoss: true }, true))).toBe(secs(120));
  });

  it('warns at 3:30 and 4:30, then spawns at 5:00', () => {
    const w = world({ district: 2 });
    expect(msgs(crossTick(w, secs(210)))).toEqual([WRAITH.warnings[0]]);
    expect(wraithEntity(w)).toBeUndefined();
    expect(msgs(crossTick(w, secs(270)))).toEqual([WRAITH.warnings[1]]);
    expect(wraithEntity(w)).toBeUndefined();
    expect(msgs(crossTick(w, secs(300)))).toEqual([WRAITH.spawnText]);
    expect(wraithEntity(w)).toBeDefined();
    // Only one wraith per level.
    run(w, 30, inp());
    expect(w.entities.filter((e) => e.def === WRAITH.def)).toHaveLength(1);
  });

  it('the level timer runs from level entry (stepping in real time)', () => {
    const w = world({ district: 2 }, true);
    run(w, secs(30) - 1, inp());
    expect(w.run.wraithStage).toBe(0);
    run(w, 1, inp());
    expect(w.run.wraithStage).toBe(1);
    run(w, secs(90), inp());
    expect(w.run.wraithStage).toBe(3);
    expect(wraithEntity(w)).toBeDefined();
  });

  it('nothing happens in a town however long you stay', () => {
    const w = world({ district: 5, isTown: true }, true);
    const evs = crossTick(w, secs(900));
    expect(msgs(evs)).toEqual([]);
    expect(wraithEntity(w)).toBeUndefined();
  });
});

describe('Blight Wraith behaviour', () => {
  function spawned(contact = false): World {
    const w = world({ district: 2 }, false, contact);
    crossTick(w, secs(300));
    return w;
  }

  it('is an invulnerable, tile-ignoring enemy with a light', () => {
    const w = spawned();
    const wr = wraithEntity(w)!;
    expect(wr.kind).toBe('enemy');
    expect(wr.w).toBe(12);
    expect(wr.h).toBe(14);
    expect(wr.collides).toBe(false);
    expect(wr.gravityScale).toBe(0);
    expect(wr.light).toBeDefined();
    expect(applyDamage(w, wr, 999)).toBe(0);
    expect(wr.dead).toBe(false);
    expect(Content.enemies.get('blight_wraith')!.damage).toBeGreaterThanOrEqual(3);
  });

  it('spawns behind the party and flies through walls toward the nearest player', () => {
    const w = spawned();
    const wr = wraithEntity(w)!;
    const pe = w.playerEntity(0)!;
    expect(wr.x).toBeLessThan(pe.x);
    // Wall of bedrock between them.
    const tx = Math.floor((pe.x - 40) / 8);
    w.level.grid.fill(tx, 1, tx + 1, 29, Tile.BEDROCK);
    const d0 = Math.hypot(wr.x - pe.x, wr.y - pe.y);
    run(w, secs(4), inp());
    const d1 = Math.hypot(wr.x - pe.x, wr.y - pe.y);
    expect(d1).toBeLessThan(d0 - 40);
    run(w, secs(6), inp());
    expect(Math.hypot(wr.x + wr.w / 2 - (pe.x + pe.w / 2), wr.y + wr.h / 2 - (pe.y + pe.h / 2))).toBeLessThan(16);
  });

  it('never spawns on top of a player lingering at the level edge', () => {
    const w = world({ district: 2 });
    const pe = placePlayer(w, 0, 20);
    crossTick(w, secs(300));
    const wr = wraithEntity(w)!;
    expect(Math.abs(wr.x - pe.x)).toBeGreaterThan(100);
  });

  it('accelerates over time up to a cap', () => {
    expect(wraithSpeed(0)).toBe(WRAITH.baseSpeed);
    expect(wraithSpeed(secs(10))).toBeGreaterThan(wraithSpeed(secs(5)));
    expect(wraithSpeed(secs(600))).toBe(WRAITH.maxSpeed);
  });

  it('deals heavy contact damage', () => {
    const w = spawned(true);
    const pe = w.playerEntity(0)!;
    const wr = wraithEntity(w)!;
    const hp0 = pe.hp;
    wr.x = pe.x;
    wr.y = pe.y - 2;
    wr.px = wr.x;
    wr.py = wr.y;
    run(w, 2, inp());
    expect(hp0 - pe.hp).toBeGreaterThanOrEqual(Math.min(hp0, 4));
  });

  it('is gone after the party changes level', () => {
    const w = spawned();
    expect(wraithEntity(w)).toBeDefined();
    w.loadLevel(arenaLevel({ district: 3 }));
    expect(wraithEntity(w)).toBeUndefined();
    expect(w.entities.some((e) => e.def === WRAITH.def)).toBe(false);
  });

  it('player Y stays put while the wraith hunts (sanity)', () => {
    const w = spawned();
    run(w, 10, inp());
    expect(w.playerEntity(0)!.y + w.playerEntity(0)!.h).toBeCloseTo(FLOOR_Y, 0);
  });
});
