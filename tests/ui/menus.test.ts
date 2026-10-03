import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { Rng } from '../../src/engine/rng';
import { addPlayer } from '../../src/sim/player/create';
import { validBias } from '../../src/sim/progression/creation';
import { World } from '../../src/sim/world';
import {
  badOptions,
  biasOf,
  creationItems,
  cycleCreation,
  formatRoomCode,
  GOOD_PAIRS,
  moveFocus,
  randomCreation,
  setupFromCreation,
  statLine,
  type MenuModel,
} from '../../src/ui/menus/model';

const races = [...Content.races.keys()];
const opts = { races, hats: [] as string[], companions: [] as string[] };

describe('menu navigation', () => {
  const m: MenuModel = {
    title: 't',
    focus: 0,
    items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', disabled: true }, { id: 'c', label: 'C' }],
  };

  it('skips disabled items and wraps', () => {
    expect(moveFocus(m, 1)).toBe(2);
    expect(moveFocus({ ...m, focus: 2 }, 1)).toBe(0);
    expect(moveFocus(m, -1)).toBe(2);
  });

  it('keeps focus when everything is disabled', () => {
    const all = { ...m, focus: 1, items: m.items.map((i) => ({ ...i, disabled: true })) };
    expect(moveFocus(all, 1)).toBe(1);
  });
});

describe('character creation model', () => {
  it('has 6 good pairs and 2 bad options each', () => {
    expect(GOOD_PAIRS.length).toBe(6);
    for (let i = 0; i < GOOD_PAIRS.length; i++) {
      const bads = badOptions(i);
      expect(bads.length).toBe(2);
      for (const b of bads) expect(GOOD_PAIRS[i]).not.toContain(b);
    }
  });

  it('every combination yields a valid bias', () => {
    for (let g = 0; g < GOOD_PAIRS.length; g++) {
      for (let b = 0; b < 2; b++) {
        const c = randomCreation(new Rng(1), races);
        c.goodPair = g;
        c.bad = b;
        expect(validBias(biasOf(c))).toBe(true);
      }
    }
  });

  it('cycling stays within legal choices and never duplicates traits', () => {
    const c = randomCreation(new Rng(7), races);
    for (let k = 0; k < 40; k++) {
      cycleCreation(c, 'good', 1, opts);
      cycleCreation(c, 'bad', k % 2 ? 1 : -1, opts);
      cycleCreation(c, 'trait1', 1, opts);
      cycleCreation(c, 'trait2', -1, opts);
      cycleCreation(c, 'race', 1, opts);
      expect(validBias(biasOf(c))).toBe(true);
      if (c.traits[0]) expect(c.traits[0]).not.toBe(c.traits[1]);
      expect(races).toContain(c.race);
    }
    cycleCreation(c, 'difficulty', 1, opts);
    expect(c.difficulty).toBe('madcap');
  });

  it('produces a setup the sim accepts', () => {
    const c = randomCreation(new Rng(3), races);
    c.name = '  <b>Hero!!  ';
    const setup = setupFromCreation(c);
    expect(setup.name.length).toBeGreaterThan(0);
    expect(validBias(setup.bias)).toBe(true);
    const p = addPlayer(new World(42, []), setup);
    expect(p.bias).toEqual(biasOf(c));
  });

  it('builds items with start/back and a stat line', () => {
    const c = randomCreation(new Rng(5), races);
    const items = creationItems(c, { ...opts, startLabel: 'Begin' });
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(['name', 'race', 'good', 'bad', 'start', 'back']));
    expect(statLine(c)).toMatch(/HP \d+ {2}ATK \d+ {2}DEX \d+ {2}MAG \d+ {2}LCK \d+/);
  });
});

describe('room codes', () => {
  it('formats as ABC-123 and strips junk', () => {
    expect(formatRoomCode('abc123')).toBe('ABC-123');
    expect(formatRoomCode('a-b')).toBe('AB');
    expect(formatRoomCode('ab c1 23 99')).toBe('ABC-123');
  });
});
