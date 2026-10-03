import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import type { BiomeDef, BossDef } from '../../src/content/types';
import { Rng } from '../../src/engine/rng';
import { createRun } from '../../src/sim';
import { killEntity } from '../../src/sim/combat/damage';
import { progressionSystem } from '../../src/sim/progression/xp';
import { playerInputLatchSystem } from '../../src/sim/player/controller';
import {
  BOSS_DISTRICTS,
  districtKind,
  exitSystem,
  FINAL_DISTRICT,
  LAIR_BIOME,
  nextBiomeOptions,
  PORTAL_COUNTDOWN,
  startBiome,
  travel,
  unsealIfBossless,
  voteExit,
} from '../../src/sim/run';
import type { GameEvent } from '../../src/sim/types';
import type { ExitPortal, PlayerSetup, World } from '../../src/sim/world';
import { arenaLevel, dummy, FLOOR_Y, inp, makeWorld, placePlayer, SETUP } from './helpers';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const B = (id: string, depths: number[]) => ({ id, depths }) as BiomeDef;
/** GDD §8 biome depth table. */
const GDD_BIOMES = [
  B('woods', range(1, 8)), B('fen', range(2, 10)), B('hollow', range(2, 12)), B('rime', range(5, 15)),
  B('amethyst', range(8, 20)), B('cinder', range(11, 20)), B('lair', [21]),
];

const party = (n: number): PlayerSetup[] => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, race: 'drifter', hat: '', companion: '' }));

/** No physics: players stay exactly where tests put them. */
const FLOW_SYSTEMS = [progressionSystem, exitSystem, playerInputLatchSystem];

const EXITS: ExitPortal[] = [
  { x: 400, y: FLOOR_Y - 20, w: 24, h: 20, biome: 'fen' },
  { x: 440, y: FLOOR_Y - 20, w: 24, h: 20, biome: 'hollow' },
  { x: 480, y: FLOOR_Y - 20, w: 24, h: 20, biome: 'rime' },
];

function portalWorld(players: number, locked = false, info = {}): World {
  const w = makeWorld({ players: party(players), systems: FLOW_SYSTEMS, level: arenaLevel(info, EXITS.map((e) => ({ ...e })), locked) });
  for (let i = 0; i < players; i++) placePlayer(w, i, 100 + i * 10);
  return w;
}

function inExit(w: World, player: number, exit: number): void {
  const x = EXITS[exit]!;
  placePlayer(w, player, x.x + x.w / 2);
}

/** Step with player `presser` tapping interact on the first tick; returns all events. */
function stepTicks(w: World, n: number, presser = -1): GameEvent[] {
  const evs: GameEvent[] = [];
  for (let t = 0; t < n; t++) {
    const inputs = w.players.map((_, i) => inp({ interact: t === 0 && i === presser }));
    w.step(inputs);
    evs.push(...w.events);
  }
  return evs;
}

describe('district sequence', () => {
  it('boss districts are 3/6/9/12/15/18 and the lair is 21', () => {
    for (let d = 1; d <= 21; d++) {
      expect(districtKind(d)).toBe(d === FINAL_DISTRICT ? 'lair' : BOSS_DISTRICTS.includes(d) ? 'boss' : 'normal');
    }
  });

  it('next-biome options: up to 3 distinct biomes allowed at that depth, never the lair', () => {
    for (let d = 2; d <= 20; d++) {
      const allowed = GDD_BIOMES.filter((b) => b.id !== 'lair' && b.depths.includes(d)).map((b) => b.id);
      for (let s = 0; s < 5; s++) {
        const opts = nextBiomeOptions(new Rng(d * 100 + s), d, GDD_BIOMES);
        expect(opts).toHaveLength(Math.min(3, allowed.length));
        expect(new Set(opts).size).toBe(opts.length);
        for (const o of opts) expect(allowed).toContain(o);
      }
    }
    expect(nextBiomeOptions(new Rng(1), 20, GDD_BIOMES)).toHaveLength(2); // amethyst + cinder only
    expect(nextBiomeOptions(new Rng(1), 21, GDD_BIOMES)).toEqual([LAIR_BIOME]);
    // Options vary with the seed.
    const seen = new Set(range(1, 30).map((s) => nextBiomeOptions(new Rng(s), 9, GDD_BIOMES).join(',')));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('district 1 is always woods', () => {
    expect(startBiome(GDD_BIOMES)).toBe('woods');
    expect(startBiome([B('fen', [2, 3]), B('woods', [1])])).toBe('woods');
  });

  it('D1 → town → D2 → … with towns between districts, boss districts locked, no town before the lair', () => {
    const w = createRun(42, [SETUP]);
    const seq: string[] = [];
    for (let guard = 0; guard < 60; guard++) {
      const { info, exits, locked } = w.level;
      seq.push(info.isTown ? `T${info.district}` : info.district === FINAL_DISTRICT ? 'LAIR' : info.isBoss ? `B${info.district}` : `D${info.district}`);
      if (info.district === FINAL_DISTRICT) {
        expect(exits).toHaveLength(0);
        break;
      }
      if (info.isTown) expect(exits).toHaveLength(1);
      else expect(exits.length).toBeGreaterThanOrEqual(1);
      // Boss districts are sealed while a boss can appear (no BossDefs yet on a bare branch → unsealed).
      expect(info.isBoss).toBe(BOSS_DISTRICTS.includes(info.district) && !info.isTown);
      expect(locked).toBe(info.isBoss && w.level.spawns.some((s) => s.kind === 'boss' && Content.bosses.has(s.def)));
      expect(w.level.request?.district).toBe(info.district);
      if (info.district === 20 && !info.isTown) expect(exits.map((e) => e.biome)).toEqual([LAIR_BIOME]);
      const chosen = exits[exits.length - 1]!.biome;
      travel(w, exits.length - 1);
      if (!info.isTown && w.level.info.isTown) expect(w.level.info.biome).toBe(chosen);
      if (info.isTown) expect(w.level.info.biome).toBe(info.biome);
    }
    const expected: string[] = [];
    for (let d = 1; d <= 20; d++) {
      expected.push(BOSS_DISTRICTS.includes(d) ? `B${d}` : `D${d}`);
      if (d < 20) expected.push(`T${d}`);
    }
    expected.push('LAIR');
    expect(seq).toEqual(expected);
    expect(w.run.path).toHaveLength(21);
    expect(w.players[0]!.runStats.districtsCleared).toBe(20);
    expect(w.players[0]!.runStats.district).toBe(21);
  });

  it('is deterministic: same seed and choices → same portals', () => {
    const route = (seed: number) => {
      const w = createRun(seed, [SETUP]);
      const out: string[] = [];
      for (let i = 0; i < 8; i++) {
        out.push(w.level.exits.map((e) => e.biome).join('|'));
        travel(w, 0);
      }
      return out.join(';');
    };
    expect(route(9)).toBe(route(9));
  });
});

describe('portals', () => {
  it('solo: interact inside a portal transitions immediately to the town of that biome', () => {
    const w = portalWorld(1);
    inExit(w, 0, 1);
    stepTicks(w, 1, 0);
    expect(w.level.info.isTown).toBe(true);
    expect(w.level.info.biome).toBe('hollow');
    expect(w.players[0]!.runStats.districtsCleared).toBe(1);
  });

  it('interact outside any portal does nothing', () => {
    const w = portalWorld(1);
    stepTicks(w, 2, 0);
    expect(w.level.info.isTown).toBe(false);
    expect(w.run.portalTimer).toBe(0);
  });

  it('co-op: a 5 s countdown with a message each second, then the whole party moves', () => {
    const w = portalWorld(2);
    inExit(w, 0, 0);
    const evs = stepTicks(w, PORTAL_COUNTDOWN, 0);
    expect(w.level.info.isTown).toBe(false);
    expect(w.run.portalTimer).toBe(1);
    const texts = evs.filter((e) => e.type === 'message').map((e) => (e as { text: string }).text);
    expect(texts[0]).toMatch(/P0 opened a portal\. Leaving in 5/);
    expect(texts.slice(1)).toEqual(['Leaving in 4...', 'Leaving in 3...', 'Leaving in 2...', 'Leaving in 1...']);
    stepTicks(w, 1);
    expect(w.level.info.isTown).toBe(true);
    expect(w.level.info.biome).toBe('fen');
    for (const p of w.players) expect(p.runStats.districtsCleared).toBe(1);
  });

  it('majority vote picks the portal most players stand in', () => {
    const w = portalWorld(3);
    inExit(w, 0, 0);
    stepTicks(w, 1, 0);
    inExit(w, 1, 2);
    inExit(w, 2, 2);
    expect(voteExit(w)).toBe(2);
    stepTicks(w, PORTAL_COUNTDOWN);
    expect(w.level.info.biome).toBe('rime');
  });

  it('ties go to the portal that started the countdown', () => {
    const w = portalWorld(2);
    inExit(w, 1, 2);
    stepTicks(w, 1, 1);
    inExit(w, 0, 0);
    expect(voteExit(w)).toBe(2);
    stepTicks(w, PORTAL_COUNTDOWN);
    expect(w.level.info.biome).toBe('rime');
  });

  it('downed players do not vote', () => {
    const w = portalWorld(3);
    inExit(w, 0, 0);
    stepTicks(w, 1, 0);
    inExit(w, 1, 1);
    inExit(w, 2, 1);
    w.players[1]!.downed = true;
    w.players[2]!.downed = true;
    expect(voteExit(w)).toBe(0);
  });

  it('a locked (boss) level refuses portal use until its boss dies', () => {
    const w = portalWorld(1, true, { district: 3, isBoss: true });
    const boss = dummy(w, 300, FLOOR_Y - 20, 100, 'boss', 'test_boss');
    inExit(w, 0, 0);
    const evs = stepTicks(w, 1, 0);
    expect(w.level.info.isTown).toBe(false);
    expect(evs.some((e) => e.type === 'message' && /sealed/.test(e.text))).toBe(true);
    expect(w.run.bossSeen).toBe(true);
    killEntity(w, boss);
    const evs2 = stepTicks(w, 1);
    expect(w.level.locked).toBe(false);
    expect(evs2.some((e) => e.type === 'message' && /portals awaken/.test(e.text))).toBe(true);
    stepTicks(w, 1, 0);
    expect(w.level.info.isTown).toBe(true);
  });
});

describe('boss seal guard', () => {
  it('a sealed level whose boss can never appear is unsealed instead of soft-locking the run', () => {
    const w = portalWorld(1, true, { district: 3, isBoss: true });
    unsealIfBossless(w);
    expect(w.level.locked).toBe(false);
    // An unknown boss def in the spawn specs can't spawn either.
    const w2 = portalWorld(1, true, { district: 3, isBoss: true });
    w2.level.spawns.push({ kind: 'boss', def: 'no_such_boss', x: 300, y: FLOOR_Y });
    unsealIfBossless(w2);
    expect(w2.level.locked).toBe(false);
  });

  it('stays sealed while a boss is present or still to spawn', () => {
    const w = portalWorld(1, true, { district: 3, isBoss: true });
    dummy(w, 300, FLOOR_Y - 20, 100, 'boss', 'test_boss');
    unsealIfBossless(w);
    expect(w.level.locked).toBe(true);
    const bosses = Content.bosses as Map<string, BossDef>;
    bosses.set('test_boss', { id: 'test_boss' } as BossDef);
    try {
      const w2 = portalWorld(1, true, { district: 3, isBoss: true });
      w2.level.spawns.push({ kind: 'boss', def: 'test_boss', x: 300, y: FLOOR_Y });
      unsealIfBossless(w2);
      expect(w2.level.locked).toBe(true);
    } finally {
      bosses.delete('test_boss');
    }
  });
});

describe('transitions', () => {
  it('downed / out players come back at 1 HP; skill cooldowns reset; per-level state resets', () => {
    const w = portalWorld(3);
    const p1 = w.players[1]!;
    const p2 = w.players[2]!;
    p1.downed = true;
    w.playerEntity(1)!.hp = 0;
    p2.out = true;
    w.playerEntity(2)!.hp = 0;
    w.players[0]!.skillCooldowns = [500, 20];
    w.run.levelTicks = 999;
    w.run.wraithStage = 3;
    travel(w, 0);
    for (const p of [p1, p2]) {
      expect(p.downed).toBe(false);
      expect(p.out).toBe(false);
      expect(w.playerEntity(p.index)!.hp).toBe(1);
    }
    expect(w.players[0]!.skillCooldowns).toEqual([0, 0]);
    expect(w.run.levelTicks).toBe(0);
    expect(w.run.wraithStage).toBe(0);
    expect(w.events.some((e) => e.type === 'revived' && e.player === 1)).toBe(true);
  });
});

describe('run end', () => {
  it('killing the Blightwall in the lair wins the run', () => {
    const w = makeWorld({ systems: FLOW_SYSTEMS, level: arenaLevel({ district: FINAL_DISTRICT, biome: 'lair' }) });
    const wall = dummy(w, 300, FLOOR_Y - 30, 400, 'boss', 'blightwall');
    stepTicks(w, 2);
    expect(w.run.over).toBe(false);
    killEntity(w, wall, 0);
    const evs = stepTicks(w, 1);
    expect(w.run.victory).toBe(true);
    expect(w.run.over).toBe(true);
    expect(evs.filter((e) => e.type === 'runOver')).toEqual([{ type: 'runOver', victory: true }]);
    // No further run-over events.
    expect(stepTicks(w, 3).some((e) => e.type === 'runOver')).toBe(false);
  });

  it('a boss-kind minion dying in the lair does not win while the Blightwall lives', () => {
    const w = makeWorld({ systems: FLOW_SYSTEMS, level: arenaLevel({ district: FINAL_DISTRICT, biome: 'lair', isBoss: true }, [], true) });
    const wall = dummy(w, 300, FLOOR_Y - 30, 400, 'boss', 'blightwall');
    const head = dummy(w, 340, FLOOR_Y - 60, 20, 'boss', 'blight_head');
    stepTicks(w, 1);
    killEntity(w, head, 0);
    stepTicks(w, 2);
    expect(w.run.over).toBe(false);
    killEntity(w, wall, 0);
    stepTicks(w, 1);
    expect(w.run.victory).toBe(true);
  });

  it('in the lair, every boss gone (once seen) also wins (final boss under another id)', () => {
    const w = makeWorld({ systems: FLOW_SYSTEMS, level: arenaLevel({ district: FINAL_DISTRICT, biome: 'lair' }) });
    const b = dummy(w, 300, FLOOR_Y - 30, 400, 'boss', 'heart_of_blight');
    stepTicks(w, 1);
    killEntity(w, b, 0);
    stepTicks(w, 2);
    expect(w.run.victory).toBe(true);
  });

  it('other bosses dying outside the lair do not end the run', () => {
    const w = makeWorld({ systems: FLOW_SYSTEMS, level: arenaLevel({ district: 6, isBoss: true }, [], true) });
    const boss = dummy(w, 300, FLOOR_Y - 30, 100, 'boss', 'gloomjaw');
    stepTicks(w, 1);
    killEntity(w, boss, 0);
    stepTicks(w, 1);
    expect(w.run.over).toBe(false);
    expect(w.level.locked).toBe(false);
  });

  it('the run is lost when every player is down or out', () => {
    const w = portalWorld(2);
    w.players[0]!.downed = true;
    stepTicks(w, 1);
    expect(w.run.over).toBe(false);
    w.players[1]!.out = true;
    const evs = stepTicks(w, 1);
    expect(w.run.over).toBe(true);
    expect(w.run.victory).toBe(false);
    expect(evs.filter((e) => e.type === 'runOver')).toEqual([{ type: 'runOver', victory: false }]);
  });

  it('nothing moves on after the run is over', () => {
    const w = portalWorld(1);
    w.run.over = true;
    inExit(w, 0, 0);
    stepTicks(w, 1, 0);
    expect(w.level.info.isTown).toBe(false);
  });
});
