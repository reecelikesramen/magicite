import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/engine/rng';
import { createRun } from '../../src/sim';
import {
  cycleOption,
  dailySeed,
  listRaces,
  listSkills,
  NAME_MAX,
  randomName,
  randomSetup,
  rollStats,
  rollTraits,
  sanitizeName,
  STAT_RULES,
  validStats,
} from '../../src/sim/progression/creation';
import { difficultyMul, runDifficulty } from '../../src/sim/progression/difficulty';

describe('rollStats', () => {
  it('always spends exactly 15 points within HP 4–6 and ATK/DEX/MAG/LCK 2–4', () => {
    for (let seed = 0; seed < 2000; seed++) {
      const s = rollStats(new Rng(seed));
      expect(s.hp + s.atk + s.dex + s.mag + s.lck).toBe(15);
      expect(s.hp).toBeGreaterThanOrEqual(4);
      expect(s.hp).toBeLessThanOrEqual(6);
      for (const k of ['atk', 'dex', 'mag', 'lck'] as const) {
        expect(s[k]).toBeGreaterThanOrEqual(2);
        expect(s[k]).toBeLessThanOrEqual(4);
      }
      expect(validStats(s)).toBe(true);
    }
  });

  it('is deterministic per seed and actually varies', () => {
    expect(rollStats(new Rng(5))).toEqual(rollStats(new Rng(5)));
    const seen = new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(rollStats(new Rng(i)))));
    expect(seen.size).toBeGreaterThan(10);
  });

  it('every stat can roll its extremes', () => {
    const max = { hp: 0, atk: 0, dex: 0, mag: 0, lck: 0 };
    for (let seed = 0; seed < 3000; seed++) {
      const s = rollStats(new Rng(seed));
      for (const k of Object.keys(max) as (keyof typeof max)[]) max[k] = Math.max(max[k], s[k]);
    }
    expect(max).toEqual(STAT_RULES.max);
  });

  it('validStats rejects bad blocks', () => {
    expect(validStats({ hp: 5, atk: 3, dex: 3, mag: 2, lck: 2 })).toBe(true);
    expect(validStats({ hp: 7, atk: 2, dex: 2, mag: 2, lck: 2 })).toBe(false);
    expect(validStats({ hp: 4, atk: 2, dex: 2, mag: 2, lck: 2 })).toBe(false);
    expect(validStats({ hp: 5, atk: 1, dex: 4, mag: 3, lck: 2 })).toBe(false);
  });
});

describe('names, traits and setup helpers', () => {
  it('random names are upper-case letters, 3–10 chars, deterministic', () => {
    for (let seed = 0; seed < 500; seed++) {
      const n = randomName(new Rng(seed));
      expect(n).toMatch(/^[A-Z]{3,10}$/);
      expect(n.length).toBeLessThanOrEqual(NAME_MAX);
    }
    expect(randomName(new Rng(77))).toBe(randomName(new Rng(77)));
    expect(new Set(Array.from({ length: 40 }, (_, i) => randomName(new Rng(i)))).size).toBeGreaterThan(30);
  });

  it('sanitizeName caps length and strips odd characters', () => {
    expect(sanitizeName('  hello world!!  ')).toBe('HELLO WORL');
    expect(sanitizeName('<>')).toBe('DELVER');
  });

  it('rollTraits picks distinct existing traits', () => {
    for (let seed = 0; seed < 100; seed++) {
      const t = rollTraits(new Rng(seed));
      expect(t).toHaveLength(2);
      expect(t[0]).not.toBe(t[1]);
    }
  });

  it('cycleOption wraps both ways', () => {
    const races = listRaces().map((r) => r.id);
    expect(cycleOption(races, races[0]!, -1)).toBe(races[races.length - 1]);
    expect(cycleOption(races, races[races.length - 1]!, 1)).toBe(races[0]);
    expect(cycleOption(races, 'nope', 1)).toBe(races[0]);
    expect(listSkills('mage')).toHaveLength(6);
  });

  it('randomSetup builds a playable hero', () => {
    const s = randomSetup(new Rng(3));
    expect(validStats(s.stats!)).toBe(true);
    const w = createRun(1, [s]);
    expect(w.players[0]!.name).toBe(s.name);
    expect(w.players[0]!.base).toEqual(s.stats);
  });
});

describe('modes', () => {
  it('daily seed is stable per date and differs between dates', () => {
    expect(dailySeed('2026-10-03')).toBe(dailySeed('2026-10-03'));
    expect(dailySeed('2026-10-03')).not.toBe(dailySeed('2026-10-04'));
  });

  it('Madcap is chosen if any player picks it and scales enemy HP at level load', () => {
    expect(runDifficulty([{ name: 'A', race: 'drifter', hat: '', companion: '' }])).toBe('normal');
    expect(runDifficulty([{ name: 'A', race: 'drifter', hat: '', companion: '' }, { name: 'B', race: 'drifter', hat: '', companion: '', difficulty: 'madcap' }])).toBe('madcap');
    const normal = createRun(8, [{ name: 'A', race: 'drifter', hat: '', companion: '' }]);
    const mad = createRun(8, [{ name: 'A', race: 'drifter', hat: '', companion: '', difficulty: 'madcap' }]);
    expect(mad.run.difficulty).toBe('madcap');
    expect(difficultyMul(mad).enemyHp).toBeGreaterThan(1);
    expect(difficultyMul(mad).enemyDamage).toBeGreaterThan(1);
    expect(difficultyMul(normal)).toEqual({ enemyHp: 1, enemyDamage: 1 });
    const hp = (w: typeof normal) => w.entities.filter((e) => e.kind === 'enemy').map((e) => e.maxHp);
    const n = hp(normal);
    const m = hp(mad);
    expect(m).toHaveLength(n.length);
    if (n.length) expect(m.every((v, i) => v > n[i]!)).toBe(true);
  });

  it('the wealthy race starts with gold', () => {
    const w = createRun(2, [{ name: 'A', race: 'highborn', hat: '', companion: '' }]);
    expect(w.players[0]!.gold).toBe(30);
  });
});
