import { describe, expect, it } from 'vitest';
import { AudioManager } from '../../src/audio/audio';
import { composeTrack } from '../../src/audio/music/compose';
import { absoluteStep, LOOKAHEAD, noteTime } from '../../src/audio/music/sequencer';
import type { GameEvent } from '../../src/sim/types';
import { asAudioContext, FakeAudioContext, type FakeNode } from './fake-audio';

const ALL_EVENTS: GameEvent[] = [
  { type: 'sfx', id: 'jump', x: 1, y: 2 },
  { type: 'particles', preset: 'p', x: 0, y: 0 },
  { type: 'damage', target: 1, amount: 1, x: 0, y: 0, crit: true, damageType: 'physical', toPlayer: false },
  { type: 'heal', target: 1, amount: 1, x: 0, y: 0 },
  { type: 'death', entity: 1, kind: 'boss', def: 'gloomjaw', x: 0, y: 0 },
  { type: 'shake', amount: 1, ticks: 1 },
  { type: 'hitstop', ticks: 1 },
  { type: 'pickup', player: 0, item: 'wood', count: 1 },
  { type: 'craft', player: 0, a: 'wood', b: 'wood', result: 'plank', count: 1, discovered: true },
  { type: 'levelUp', player: 0, level: 2 },
  { type: 'downed', player: 0 },
  { type: 'revived', player: 0 },
  { type: 'message', text: 'm' },
  { type: 'tileBroken', tx: 1, ty: 1, tile: 1 },
  { type: 'resourceHit', entity: 1, def: 'tree_woods', broken: true },
  { type: 'levelEnter', district: 1, biome: 'woods', name: 'w', isTown: false, isBoss: false },
  { type: 'bossPhase', entity: 1, phase: 1 },
  { type: 'runOver', victory: false },
];

function setup(): { fake: FakeAudioContext; am: AudioManager; made: () => number } {
  const fake = new FakeAudioContext();
  let made = 0;
  const am = new AudioManager({
    createContext: () => {
      made++;
      return asAudioContext(fake);
    },
    timer: false,
  });
  return { fake, am, made: () => made };
}

/** Advance the fake clock in frame-sized steps, letting the manager schedule each frame. */
function advance(fake: FakeAudioContext, am: AudioManager, secs: number, frame = 1 / 30): void {
  const end = fake.currentTime + secs;
  while (fake.currentTime < end - 1e-9) {
    fake.currentTime = Math.min(end, fake.currentTime + frame);
    am.handleEvents([]);
  }
}

describe('AudioManager without WebAudio', () => {
  it('every public method is a safe no-op', () => {
    expect((globalThis as { AudioContext?: unknown }).AudioContext).toBeUndefined();
    const am = new AudioManager({ timer: false });
    expect(() => {
      am.unlock();
      am.setListener(10, 20);
      am.setLocalPlayer(0);
      am.handleEvents(ALL_EVENTS);
      am.playMusic('boss');
      am.setVolumes({ master: 0.5, music: 2, sfx: -1 });
      am.unlock();
      am.stopMusic();
      am.dispose();
    }).not.toThrow();
    expect(am.running).toBe(false);
    expect(am.playSfx('hit')).toBe(false);
    expect(am.getVolumes()).toEqual({ master: 0.5, music: 1, sfx: 0 });
  });

  it('still tracks which music the game wants', () => {
    const am = new AudioManager({ timer: false });
    am.handleEvents([{ type: 'levelEnter', district: 2, biome: 'hollow', name: 'h', isTown: true, isBoss: false }]);
    expect(am.currentTrack).toBe('town');
  });

  it('a throwing context factory disables audio instead of crashing', () => {
    const am = new AudioManager({
      timer: false,
      createContext: () => {
        throw new Error('no audio device');
      },
    });
    expect(() => am.unlock()).not.toThrow();
    expect(am.running).toBe(false);
  });
});

describe('AudioManager music', () => {
  it('starts music requested before the unlock gesture', () => {
    const { fake, am, made } = setup();
    am.handleEvents([{ type: 'levelEnter', district: 1, biome: 'woods', name: 'w', isTown: false, isBoss: false }]);
    expect(made()).toBe(0); // no context before a gesture
    am.unlock();
    am.unlock();
    expect(made()).toBe(1);
    expect(am.running).toBe(true);
    expect(am.musicDebug()).toEqual({ playing: 'forest', players: 1 });
    advance(fake, am, 0.5);
    const oscs = fake.startedBetween('osc', 0, 10);
    expect(oscs.length).toBeGreaterThan(3);
    for (const o of oscs) expect(o.startAt!).toBeLessThanOrEqual(fake.currentTime + LOOKAHEAD + 1e-9);
  });

  it('loops seamlessly: the loop restarts exactly one loop length later', () => {
    const { fake, am } = setup();
    am.unlock();
    am.playMusic('forest');
    const comp = composeTrack('forest');
    const loopSecs = comp.lengthSteps * comp.stepDur;
    const firstTimes = fake.starts.filter((s) => s.kind === 'osc').map((s) => s.startAt!);
    const t0 = Math.min(...firstTimes);
    advance(fake, am, loopSecs + 1);
    const times = fake.starts.filter((s) => s.kind === 'osc').map((s) => s.startAt!);
    const firstNote = comp.notes.find((n) => n.ch !== 3)!;
    const expected = t0 + noteTime(comp, firstNote, 1) - noteTime(comp, firstNote, 0);
    expect(times.some((t) => Math.abs(t - expected) < 1e-6)).toBe(true);
    // Nothing is ever scheduled in the past of the frame that scheduled it (> small late tolerance).
    const sorted = [...times].sort((a, b) => a - b);
    expect(sorted[0]!).toBeGreaterThanOrEqual(0);
  });

  it('crossfades between tracks and cleans up the old one', () => {
    const { fake, am } = setup();
    am.unlock();
    am.playMusic('forest');
    advance(fake, am, 1);
    am.playMusic('cave');
    expect(am.musicDebug()).toEqual({ playing: 'cave', players: 2 });
    am.playMusic('cave'); // same track: no restart
    expect(am.musicDebug().players).toBe(2);
    advance(fake, am, 3);
    expect(am.musicDebug()).toEqual({ playing: 'cave', players: 1 });
  });

  it('biome ids are accepted as track ids', () => {
    const { am } = setup();
    am.unlock();
    am.playMusic('cinder');
    expect(am.musicDebug().playing).toBe('volcano');
    expect(am.currentTrack).toBe('volcano');
  });

  it('a non-looping track ends and is disposed', () => {
    const { fake, am } = setup();
    am.unlock();
    am.playMusic('gameover');
    const comp = composeTrack('gameover');
    advance(fake, am, comp.lengthSteps * comp.stepDur + 3, 0.1);
    expect(am.musicDebug().players).toBe(0);
  });

  it('stopMusic fades to silence', () => {
    const { fake, am } = setup();
    am.unlock();
    am.playMusic('town');
    am.stopMusic(0.5);
    expect(am.currentTrack).toBe('');
    advance(fake, am, 1);
    expect(am.musicDebug()).toEqual({ playing: null, players: 0 });
  });
});

describe('AudioManager sfx', () => {
  async function ready(): Promise<{ fake: FakeAudioContext; am: AudioManager }> {
    const s = setup();
    s.am.unlock();
    expect(await s.am.whenReady()).toBe(true);
    s.am.setListener(0, 0);
    return s;
  }

  const sources = (fake: FakeAudioContext): FakeNode[] => fake.starts.filter((s) => s.kind === 'source');

  it('plays sfx events through the sfx bus', async () => {
    const { fake, am } = await ready();
    am.handleEvents([{ type: 'sfx', id: 'coin', x: 4, y: 0 }]);
    expect(sources(fake).length).toBe(1);
  });

  it('limits a burst of identical hits in one frame to a single voice', async () => {
    const { fake, am } = await ready();
    const burst: GameEvent[] = Array.from({ length: 20 }, () => ({ type: 'sfx', id: 'hit', x: 10, y: 0 }));
    am.handleEvents(burst);
    expect(sources(fake).length).toBe(1);
  });

  it('caps overlapping voices of one id', async () => {
    const { fake, am } = await ready();
    for (let i = 0; i < 12; i++) {
      am.handleEvents([{ type: 'sfx', id: 'explosion', x: 0, y: 0 }]);
      fake.currentTime += 0.07;
    }
    expect(sources(fake).length).toBe(3); // explosion: 3 voices, each ~0.85 s long
  });

  it('drops sounds far from the listener and pans by side', async () => {
    const { fake, am } = await ready();
    am.handleEvents([{ type: 'sfx', id: 'chop', x: 5000, y: 0 }]);
    expect(sources(fake).length).toBe(0);
    am.handleEvents([{ type: 'sfx', id: 'chop', x: -120, y: 0 }]);
    expect(sources(fake).length).toBe(1);
    const panner = fake.created.filter((n) => n.kind === 'panner').pop() as unknown as { pan: { value: number } };
    expect(panner.pan.value).toBeLessThan(0);
  });

  it('non-positional sounds ignore distance', async () => {
    const { fake, am } = await ready();
    am.setListener(10000, 10000);
    am.handleEvents([{ type: 'levelUp', player: 0, level: 2 }]);
    expect(sources(fake).length).toBe(1);
  });

  it("a far teammate's positioned shop/craft sounds fade with distance; positionless and global ones don't", async () => {
    const { fake, am } = await ready();
    am.handleEvents([
      { type: 'sfx', id: 'buy', x: 5000, y: 0 },
      { type: 'sfx', id: 'craft_fail', x: 5000, y: 0 },
    ]);
    expect(sources(fake).length).toBe(0);
    am.handleEvents([{ type: 'sfx', id: 'denied', x: 0, y: 0 }]);
    expect(sources(fake).length).toBe(1);
    expect(am.playSfx('sell')).toBe(true); // UI call, no position
    expect(am.playSfx('boss_roar', 5000, 0)).toBe(true); // global alert ignores distance
    expect(am.playSfx('equip', 5000, 0)).toBe(false); // personal + far away
  });

  it('dispose() then unlock() starts clean on a new context (no stale voices from the old clock)', async () => {
    const fakes: FakeAudioContext[] = [];
    const am = new AudioManager({
      timer: false,
      createContext: () => {
        const f = new FakeAudioContext();
        fakes.push(f);
        return asAudioContext(f);
      },
    });
    am.unlock();
    expect(await am.whenReady()).toBe(true);
    am.setListener(0, 0);
    fakes[0]!.currentTime = 500;
    for (let i = 0; i < 3; i++) {
      am.handleEvents([{ type: 'sfx', id: 'explosion', x: 0, y: 0 }]);
      fakes[0]!.currentTime += 0.07;
    }
    expect(sources(fakes[0]!).length).toBe(3);
    am.dispose();
    expect(fakes[0]!.state).toBe('closed');
    am.unlock();
    expect(await am.whenReady()).toBe(true);
    expect(fakes.length).toBe(2);
    am.handleEvents([{ type: 'sfx', id: 'explosion', x: 0, y: 0 }]);
    expect(sources(fakes[1]!).length).toBe(1);
  });

  it('is silent while the context is suspended, and unlock resumes it', async () => {
    const { fake, am } = await ready();
    fake.state = 'suspended';
    expect(am.playSfx('ui_click')).toBe(false);
    am.unlock();
    await Promise.resolve();
    expect(fake.state).toBe('running');
    expect(am.playSfx('ui_click')).toBe(true);
  });

  it('applies volume settings to the buses', () => {
    const { fake, am } = setup();
    am.unlock();
    am.setVolumes({ master: 0.25 });
    const gains = fake.created.filter((n) => n.kind === 'gain') as unknown as { gain: { value: number } }[];
    expect(gains.some((g) => Math.abs(g.gain.value - 0.25) < 1e-9)).toBe(true);
  });
});

describe('sequencer timing', () => {
  it('maps loop passes to absolute steps after the intro', () => {
    const boss = composeTrack('boss');
    expect(boss.loopStart).toBe(16);
    expect(absoluteStep(boss, 20, 0)).toBe(20);
    const body = boss.lengthSteps - boss.loopStart;
    expect(absoluteStep(boss, 16, 1)).toBe(boss.lengthSteps);
    expect(absoluteStep(boss, 20, 2)).toBe(boss.lengthSteps + body + 4);
  });

  it('swings odd steps only', () => {
    const swamp = composeTrack('swamp');
    expect(swamp.swing).toBeGreaterThan(0);
    const even = { step: 4, ch: 0 as const, note: 60, len: 1, vel: 1 };
    const odd = { ...even, step: 5 };
    expect(noteTime(swamp, even, 0)).toBeCloseTo(4 * swamp.stepDur, 9);
    expect(noteTime(swamp, odd, 0)).toBeCloseTo((5 + swamp.swing) * swamp.stepDur, 9);
  });
});
