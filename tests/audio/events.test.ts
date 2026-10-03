import { describe, expect, it } from 'vitest';
import { beginBatch, createAudioEventState, mapGameEvent, resourceBreakSfx, trackForBiome, trackForLevel, type CueSink } from '../../src/audio/events';
import { Content } from '../../src/content';
import type { GameEvent } from '../../src/sim/types';

interface Cue {
  kind: 'sfx' | 'music';
  id: string;
  x?: number;
  y?: number;
  spatial?: boolean;
  volume?: number;
  pitch?: number;
}

function run(events: GameEvent[], localPlayer = -1, st = createAudioEventState(localPlayer)): Cue[] {
  const cues: Cue[] = [];
  const sink: CueSink = {
    sfx: (id, x, y, spatial, volume, pitch) => cues.push({ kind: 'sfx', id, x, y, spatial, volume, pitch }),
    music: (track) => cues.push({ kind: 'music', id: track }),
  };
  beginBatch(st);
  for (const ev of events) mapGameEvent(ev, st, sink);
  return cues;
}

const enter = (biome: string, isTown = false, isBoss = false): GameEvent => ({ type: 'levelEnter', district: 1, biome, name: 'x', isTown, isBoss });

describe('GameEvent → sound mapping', () => {
  it('passes sfx events through with position, volume and pitch', () => {
    const cues = run([{ type: 'sfx', id: 'jump', x: 10, y: 20, pitch: 1.3 }]);
    expect(cues).toEqual([{ kind: 'sfx', id: 'jump', x: 10, y: 20, spatial: true, volume: 1, pitch: 1.3 }]);
  });

  it('non-positional presets are flagged as such', () => {
    const [c] = run([{ type: 'sfx', id: 'portal_unlock', x: 0, y: 0 }]);
    expect(c!.spatial).toBe(false);
  });

  it('ignores positionless raw sfx for event-driven sounds and plays them from the semantic event instead', () => {
    const cues = run(
      [
        { type: 'sfx', id: 'craft', x: 0, y: 0 },
        { type: 'craft', player: 0, a: 'wood', b: 'wood', result: 'plank', count: 1, discovered: true },
        { type: 'sfx', id: 'level_up', x: 0, y: 0 },
        { type: 'levelUp', player: 0, level: 2 },
      ],
      0,
    );
    expect(cues.map((c) => c.id)).toEqual(['craft', 'discover', 'levelup']);
    expect(cues.every((c) => c.spatial === false)).toBe(true);
  });

  it('positioned raw sfx of event-driven sounds play spatially (e.g. a craft failing for want of a station)', () => {
    // items: `craft_fail` at the crafter, with only a message (no `craft` event) when no station is near.
    const cues = run([{ type: 'sfx', id: 'craft_fail', x: 40, y: 8 }], 0);
    expect(cues).toEqual([{ kind: 'sfx', id: 'craft_fail', x: 40, y: 8, spatial: true, volume: 1, pitch: 1 }]);
    // A teammate's level-up: the semantic event is filtered, the positioned raw sfx is spatialised.
    const mate = run([{ type: 'levelUp', player: 1, level: 3 }, { type: 'sfx', id: 'level_up', x: 300, y: 8 }], 0);
    expect(mate.map((c) => [c.id, c.spatial])).toEqual([['level_up', true]]);
  });

  it('personal sounds are spatialised only when the sim gives them a position', () => {
    const cues = run([
      { type: 'sfx', id: 'buy', x: 120, y: 64 },
      { type: 'sfx', id: 'denied', x: 0, y: 0 },
      { type: 'sfx', id: 'wraith_spawn', x: 120, y: 64 },
    ]);
    expect(cues.filter((c) => c.kind === 'sfx').map((c) => [c.id, c.spatial])).toEqual([
      ['buy', true],
      ['denied', false],
      ['wraith_spawn', false], // global alert: never attenuated
    ]);
  });

  it("doesn't play teammates' crafting or level-ups", () => {
    const cues = run(
      [
        { type: 'craft', player: 1, a: 'wood', b: 'stone', result: null, count: 0, discovered: false },
        { type: 'levelUp', player: 1, level: 3 },
      ],
      0,
    );
    expect(cues).toEqual([]);
  });

  it('failed crafts buzz', () => {
    const cues = run([{ type: 'craft', player: 0, a: 'wood', b: 'stone', result: null, count: 0, discovered: false }]);
    expect(cues.map((c) => c.id)).toEqual(['craft_fail']);
  });

  it('downed/revived alert everyone without spatialisation', () => {
    const cues = run([{ type: 'downed', player: 2 }, { type: 'revived', player: 2 }], 0);
    expect(cues.map((c) => [c.id, c.spatial])).toEqual([
      ['downed', false],
      ['revive', false],
    ]);
  });

  it('crits, heals, deaths and broken tiles get positional sounds', () => {
    const cues = run([
      { type: 'damage', target: 3, amount: 5, x: 1, y: 2, crit: true, damageType: 'physical', toPlayer: false },
      { type: 'damage', target: 3, amount: 1, x: 1, y: 2, crit: false, damageType: 'physical', toPlayer: false },
      { type: 'heal', target: 1, amount: 2, x: 3, y: 4 },
      { type: 'death', entity: 9, kind: 'enemy', def: 'green_slime', x: 5, y: 6 },
      { type: 'death', entity: 10, kind: 'player', def: 'player', x: 5, y: 6 },
      { type: 'tileBroken', tx: 2, ty: 3, tile: 1 },
    ]);
    expect(cues.map((c) => [c.id, c.x, c.y, c.spatial])).toEqual([
      ['crit', 1, 2, true],
      ['heal', 3, 4, true],
      ['death_enemy', 5, 6, true],
      ['tile_break', 20, 28, true],
    ]);
  });

  it('broken resources sound by type at the last harvest position', () => {
    const cues = run([
      { type: 'sfx', id: 'chop', x: 40, y: 50 },
      { type: 'resourceHit', entity: 4, def: 'tree_woods', broken: true },
      { type: 'resourceHit', entity: 4, def: 'tree_woods', broken: false },
    ]);
    expect(cues.map((c) => [c.id, c.x, c.y, c.spatial])).toEqual([
      ['chop', 40, 50, true],
      ['tree_fall', 40, 50, true],
    ]);
    // Without a preceding hit sfx it falls back to non-positional.
    const [c] = run([{ type: 'resourceHit', entity: 4, def: 'rock_iron', broken: true }]);
    expect([c!.id, c!.spatial]).toEqual(['rock_break', false]);
    expect(resourceBreakSfx('chest_wood')).toBe('chest_open');
    expect(resourceBreakSfx('plant_fiber')).toBe('harvest');
    expect(resourceBreakSfx('pot')).toBe('break');
    // Content defs decide by their harvesting tool, whatever the id looks like.
    for (const def of Content.resources.values()) {
      if (def.id.startsWith('chest_') || def.id === 'pot' || def.id.startsWith('pot_')) continue; // containers: checked above
      const want = def.tool === 'axe' ? 'tree_fall' : def.tool === 'pickaxe' || def.tool === 'hammer' ? 'rock_break' : def.tool === 'net' ? 'pickup' : 'harvest';
      expect(resourceBreakSfx(def.id), def.id).toBe(want);
    }
  });

  it('picks level music: biome → track, towns, boss arenas, the Lair', () => {
    expect(trackForBiome('woods')).toBe('forest');
    expect(trackForBiome('cinder')).toBe('volcano');
    expect(trackForBiome('woods')).toBe('forest'); // BiomeDef.music
    expect(trackForLevel({ biome: 'hollow', isTown: false, isBoss: false })).toBe('cave');
    expect(trackForLevel({ biome: 'hollow', isTown: true, isBoss: false })).toBe('town');
    expect(trackForLevel({ biome: 'rime', isTown: false, isBoss: true })).toBe('boss');
    expect(trackForLevel({ biome: 'lair', isTown: false, isBoss: true })).toBe('lair');
    const cues = run([enter('fen')]);
    expect(cues).toContainEqual({ kind: 'music', id: 'swamp' });
    expect(cues.find((c) => c.id === 'portal')!.spatial).toBe(false);
  });

  it('returns to the biome theme when a giant monster dies', () => {
    const st = createAudioEventState();
    expect(run([enter('amethyst', false, true)], -1, st)).toContainEqual({ kind: 'music', id: 'boss' });
    const cues = run([{ type: 'death', entity: 77, kind: 'boss', def: 'shardbound_knight', x: 0, y: 0 }], -1, st);
    expect(cues).toEqual([
      { kind: 'sfx', id: 'boss_death', x: 0, y: 0, spatial: false, volume: 1, pitch: 1 },
      { kind: 'music', id: 'crystal' },
    ]);
  });

  it('a giant monster dying during a Wraith invasion keeps the invasion theme', () => {
    const st = createAudioEventState();
    run([enter('woods', false, true)], -1, st);
    expect(run([{ type: 'sfx', id: 'wraith_spawn', x: 1, y: 1 }], -1, st)).toContainEqual({ kind: 'music', id: 'invasion' });
    const cues = run([{ type: 'death', entity: 7, kind: 'boss', def: 'gloomjaw', x: 0, y: 0 }], -1, st);
    expect(cues.filter((c) => c.kind === 'music')).toEqual([]);
    // …and the Lair's own theme is never replaced by the biome fallback either.
    const lair = createAudioEventState();
    run([enter('lair', false, true)], -1, lair);
    expect(run([{ type: 'death', entity: 8, kind: 'boss', def: 'blightwall', x: 0, y: 0 }], -1, lair).filter((c) => c.kind === 'music')).toEqual([]);
  });

  it('a roaming giant monster waking up switches to boss music once', () => {
    const st = createAudioEventState();
    run([enter('woods')], -1, st);
    const a = run([{ type: 'bossPhase', entity: 5, phase: 1 }], -1, st);
    expect(a).toContainEqual({ kind: 'music', id: 'boss' });
    const b = run([{ type: 'bossPhase', entity: 5, phase: 2 }], -1, st);
    expect(b.filter((c) => c.kind === 'music')).toEqual([]);
    expect(b.map((c) => c.id)).toEqual(['boss_roar']);
  });

  it('the Blight Wraith arriving starts the invasion theme', () => {
    const st = createAudioEventState();
    run([enter('woods')], -1, st);
    const cues = run([{ type: 'sfx', id: 'wraith_spawn', x: 100, y: 100 }], -1, st);
    expect(cues.map((c) => c.id)).toEqual(['wraith_spawn', 'invasion']);
    expect(run([{ type: 'sfx', id: 'wraith_spawn', x: 100, y: 100 }], -1, st).map((c) => c.id)).toEqual(['wraith_spawn']);
  });

  it('run end plays a sting and the victory / game-over music', () => {
    expect(run([{ type: 'runOver', victory: true }])).toEqual([
      { kind: 'sfx', id: 'run_win', x: 0, y: 0, spatial: false, volume: 1, pitch: 1 },
      { kind: 'music', id: 'victory' },
    ]);
    expect(run([{ type: 'runOver', victory: false }]).map((c) => c.id)).toEqual(['run_lose', 'gameover']);
  });

  it('ignores purely visual events', () => {
    expect(
      run([
        { type: 'particles', preset: 'x', x: 0, y: 0 },
        { type: 'shake', amount: 2, ticks: 3 },
        { type: 'hitstop', ticks: 2 },
        { type: 'message', text: 'hi' },
        { type: 'pickup', player: 0, item: 'wood', count: 1 },
      ]),
    ).toEqual([]);
  });
});
