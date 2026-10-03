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
  creationStats,
  inferBias,
  rollBias,
  rollStats,
  rollTraits,
  sanitizeName,
  validBias,
  validStats,
} from '../../src/sim/progression/creation';
import { levelGains, xpForLevel } from '../../src/sim/progression/xp';
import { staminaForLevel } from '../../src/sim/items/stats';
import { difficultyMul, runDifficulty } from '../../src/sim/progression/difficulty';

describe('creation picks (GDD §2b.3)', () => {
  it('every stat starts at 3 (HP 5), two good +1, one bad -1, LCK 3', () => {
    expect(creationStats({ good: ['atk', 'mag'], bad: 'hp' })).toEqual({ hp: 4, atk: 4, dex: 3, mag: 4, lck: 3 });
    expect(creationStats({ good: ['hp', 'dex'], bad: null })).toEqual({ hp: 6, atk: 3, dex: 4, mag: 3, lck: 3 });
  });

  it('rollBias is legal, deterministic per seed and varies', () => {
    for (let seed = 0; seed < 100; seed++) expect(validBias(rollBias(new Rng(seed)))).toBe(true);
    expect(rollBias(new Rng(5))).toEqual(rollBias(new Rng(5)));
    const seen = new Set(Array.from({ length: 300 }, (_, i) => JSON.stringify(rollBias(new Rng(i)))));
    expect(seen.size).toBe(12); // C(4,2) good pairs × 2 remaining bad picks
  });

  it('validBias rejects duplicates, unknown stats and a bad stat that is also good', () => {
    expect(validBias({ good: ['atk', 'atk'], bad: 'mag' })).toBe(false);
    expect(validBias({ good: ['atk', 'lck' as never], bad: null })).toBe(false);
    expect(validBias({ good: ['atk', 'dex'], bad: 'dex' })).toBe(false);
    expect(validBias({ good: ['atk'], bad: null } as never)).toBe(false);
  });

  it('validStats accepts exactly the blocks some pick produces; inferBias round-trips', () => {
    expect(validStats(creationStats({ good: ['dex', 'mag'], bad: 'atk' }))).toBe(true);
    expect(validStats({ hp: 9, atk: 3, dex: 3, mag: 3, lck: 3 })).toBe(false);
    expect(validStats(rollStats(new Rng(1)))).toBe(true);
    const bias = { good: ['hp', 'mag'] as ('hp' | 'mag')[], bad: 'atk' as const };
    expect(creationStats(inferBias(creationStats(bias)))).toEqual(creationStats(bias));
  });

  it('level-ups follow the cadence: good every 2, neutral every 3, bad every 4 levels', () => {
    const bias = { good: ['atk', 'dex'] as ('atk' | 'dex')[], bad: 'mag' as const };
    expect(levelGains(2, bias)).toEqual(['atk', 'dex']);
    expect(levelGains(3, bias)).toEqual(['hp']);
    expect(levelGains(4, bias)).toEqual(['atk', 'dex', 'mag']);
    expect(levelGains(5, bias)).toEqual([]);
    expect(levelGains(6, bias)).toEqual(['hp', 'atk', 'dex']);
  });

  it('XP curve is L² + 3L + 4 (8 at Lv1, 92 at Lv8) and stamina follows the level (4 → cap 12)', () => {
    expect(xpForLevel(1)).toBe(8);
    expect(xpForLevel(8)).toBe(92);
    expect([1, 3, 4, 7, 12, 30].map(staminaForLevel)).toEqual([4, 4, 4, 7, 12, 12]);
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
    expect(validBias(s.bias)).toBe(true);
    const w = createRun(1, [s]);
    expect(w.players[0]!.name).toBe(s.name);
    expect(w.players[0]!.base).toEqual(creationStats(s.bias));
    expect(w.players[0]!.bias).toEqual(s.bias);
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
