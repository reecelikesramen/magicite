import { describe, expect, it } from 'vitest';
import { SKILL_LEVELS } from '../../src/content/skills';
import { grantXp, totalXpForLevel, xpForLevel } from '../../src/sim/progression/xp';
import { makeWorld } from './helpers';

const baseSum = (b: { hp: number; atk: number; dex: number; mag: number; lck: number }) => b.hp + b.atk + b.dex + b.mag + b.lck;

describe('XP curve', () => {
  it('needs 8 XP at Lv1 and ~92 at Lv8, strictly increasing', () => {
    expect(xpForLevel(1)).toBe(8);
    expect(xpForLevel(8)).toBeGreaterThanOrEqual(88);
    expect(xpForLevel(8)).toBeLessThanOrEqual(96);
    for (let l = 1; l < 40; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(3)).toBe(xpForLevel(1) + xpForLevel(2));
  });

  it('a fresh player starts at Lv1 needing xpForLevel(1)', () => {
    const w = makeWorld();
    expect(w.players[0]!.level).toBe(1);
    expect(w.players[0]!.xpToNext).toBe(xpForLevel(1));
  });
});

describe('level-ups', () => {
  it('apply the good/neutral/bad cadence, recalc stats and refill HP + meters', () => {
    const w = makeWorld();
    const p = w.players[0]!;
    const e = w.playerEntity(0)!;
    const before = { ...p.base };
    e.hp = 1;
    p.mana = 0;
    p.stamina = 0;
    p.hunger = 1;
    grantXp(w, p, 8);
    expect(p.level).toBe(2);
    expect(p.xp).toBe(0);
    expect(p.xpToNext).toBe(xpForLevel(2));
    // Level 2: only the two good stats grow (every 2 levels).
    expect(baseSum(p.base)).toBe(baseSum(before) + 2);
    for (const k of p.bias.good) expect(p.base[k]).toBe(before[k] + 1);
    expect(e.hp).toBe(e.maxHp);
    expect(p.mana).toBe(p.stats.maxMana);
    expect(p.stamina).toBe(p.stats.maxStamina);
    expect(p.hunger).toBe(p.stats.maxHunger);
    expect(w.events.some((ev) => ev.type === 'levelUp' && ev.level === 2)).toBe(true);
  });

  it('carries overflow XP and handles several levels in one grant', () => {
    const w = makeWorld();
    const p = w.players[0]!;
    grantXp(w, p, totalXpForLevel(4) + 3);
    expect(p.level).toBe(4);
    expect(p.xp).toBe(3);
    expect(p.runStats.level).toBe(4);
  });

  it('stat gains are deterministic (no rng) and depend only on the creation picks', () => {
    const grow = (seed: number) => {
      const w = makeWorld({ seed });
      const p = w.players[0]!;
      grantXp(w, p, totalXpForLevel(12));
      return { ...p.base };
    };
    expect(grow(11)).toEqual(grow(99));
  });

  it('downed players gain levels but are not revived by the refill', () => {
    const w = makeWorld({ players: [{ name: 'A', race: 'drifter', hat: '', companion: '' }, { name: 'B', race: 'drifter', hat: '', companion: '' }] });
    const p = w.players[1]!;
    const e = w.playerEntity(1)!;
    p.downed = true;
    e.hp = 0;
    grantXp(w, p, 8);
    expect(p.level).toBe(2);
    expect(e.hp).toBe(0);
  });

  it('skill picks are granted only at levels 5/10/15/20/25', () => {
    const w = makeWorld();
    const p = w.players[0]!;
    for (let target = 2; target <= 26; target++) {
      grantXp(w, p, p.xpToNext - p.xp);
      expect(p.level).toBe(target);
      const expected = SKILL_LEVELS.filter((l) => l <= target).length;
      expect(p.skillPicks).toBe(expected);
    }
  });

  it('the Bookworm trait grants +25% XP (exact over time)', () => {
    const w = makeWorld({ players: [{ name: 'A', race: 'drifter', hat: '', companion: '', traits: ['bookworm'] }] });
    const p = w.players[0]!;
    for (let i = 0; i < 16; i++) grantXp(w, p, 1);
    // 16 base XP → 20 effective.
    expect(totalXpForLevel(p.level) + p.xp).toBe(20);
  });
});
