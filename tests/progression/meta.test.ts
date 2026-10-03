import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { UNLOCKS } from '../../src/content/unlocks';
import {
  applyRun,
  availableCompanions,
  availableHats,
  availableRaces,
  describeUnlock,
  emptyMeta,
  evaluateUnlocks,
  finishRun,
  loadMeta,
  META_KEY,
  META_VERSION,
  normalizeMeta,
  saveMeta,
  todayString,
  unlockTargets,
  type KeyValueStore,
  type RunOutcome,
} from '../../src/game/meta';
import { createRun } from '../../src/sim';
import { emptyRunStats } from '../../src/sim/player/create';
import type { RunStats } from '../../src/sim/types';

const LOSS: RunOutcome = { victory: false, district: 4, level: 6, difficulty: 'normal', ticks: 60 * 60 * 20 };
const WIN: RunOutcome = { victory: true, district: 21, level: 18, difficulty: 'normal', ticks: 60 * 60 * 90 };

function stats(over: Partial<RunStats> = {}): RunStats {
  return { ...emptyRunStats(), ...over } as RunStats;
}

function memStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('unlock content mapping', () => {
  it('every locked race/hat/companion points at an existing unlock, and every unlock grants something', () => {
    const ids = new Set(UNLOCKS.map((u) => u.id));
    for (const r of Content.races.values()) if (!r.unlockedByDefault) expect(ids.has(r.unlock!)).toBe(true);
    for (const h of Content.hats.values()) expect(ids.has(h.unlock)).toBe(true);
    for (const c of Content.companions.values()) expect(ids.has(c.unlock)).toBe(true);
    for (const u of UNLOCKS) {
      const t = unlockTargets(u.id);
      expect(t.races.length + t.hats.length + t.companions.length).toBeGreaterThan(0);
      expect(u.chance).toBeGreaterThan(0);
      expect(u.chance).toBeLessThanOrEqual(1);
    }
    expect(describeUnlock('unlock_highborn')).toBe('New race: Highborn');
  });

  it('a fresh save only offers the default race and no hats/companions', () => {
    const m = emptyMeta();
    expect(availableRaces(m).map((r) => r.id)).toEqual(['drifter']);
    expect(availableHats(m)).toEqual([]);
    expect(availableCompanions(m)).toEqual([]);
    const m2 = { ...m, unlocked: ['unlock_cyclorc', 'unlock_wizard_hat', 'unlock_ember_bat'] };
    expect(availableRaces(m2).map((r) => r.id)).toEqual(['drifter', 'cyclorc']);
    expect(availableHats(m2).map((h) => h.id)).toEqual(['wizard_hat']);
    expect(availableCompanions(m2).map((c) => c.id)).toEqual(['ember_bat']);
  });
});

describe('evaluateUnlocks', () => {
  it('is pure and deterministic', () => {
    const m = emptyMeta();
    const s = stats({ kills: 40, oresMined: 25, plantsHarvested: 12 });
    const a = evaluateUnlocks(m, s, LOSS, 1234);
    expect(evaluateUnlocks(m, s, LOSS, 1234)).toEqual(a);
    expect(m).toEqual(emptyMeta());
  });

  it('guaranteed milestones unlock; unmet conditions never do', () => {
    const m = emptyMeta();
    const win = evaluateUnlocks(m, stats({ treesChopped: 3 }), WIN, 1);
    expect(win).toContain('unlock_wraithkin');
    expect(win).toContain('unlock_ember_bat');
    expect(win).toContain('unlock_mend_sprite'); // reached district 15+
    expect(win).not.toContain('unlock_floaty_slime'); // chopped trees
    expect(win).not.toContain('unlock_gizmo_drone'); // not madcap
    const clean = evaluateUnlocks(m, stats(), { ...WIN, difficulty: 'madcap' }, 1);
    expect(clean).toContain('unlock_floaty_slime');
    expect(clean).toContain('unlock_gizmo_drone');
    const loss = evaluateUnlocks(m, stats({ kills: 3 }), LOSS, 1);
    expect(loss).toEqual([]);
  });

  it('chance unlocks roll near their probability across seeds', () => {
    const m = emptyMeta();
    const s = stats({ kills: 15 });
    let hits = 0;
    for (let seed = 0; seed < 2000; seed++) if (evaluateUnlocks(m, s, LOSS, seed).includes('unlock_highborn')) hits++;
    expect(hits / 2000).toBeGreaterThan(0.15);
    expect(hits / 2000).toBeLessThan(0.25);
  });

  it('skips what is already unlocked and unlocks nothing in practice', () => {
    const m = { ...emptyMeta(), unlocked: ['unlock_wraithkin'] };
    const res = evaluateUnlocks(m, stats(), WIN, 5);
    expect(res).not.toContain('unlock_wraithkin');
    expect(res).toContain('unlock_ember_bat');
    expect(evaluateUnlocks(emptyMeta(), stats(), { ...WIN, practice: true }, 5)).toEqual([]);
  });

  it('lifetime conditions count this run on top of previous ones', () => {
    let meta = emptyMeta();
    for (let i = 0; i < 4; i++) meta = applyRun(meta, stats({ kills: 70 }), LOSS, i).meta;
    expect(meta.unlocked).not.toContain('unlock_boarfolk');
    expect(meta.lifetime.kills).toBe(280);
    const fifth = applyRun(meta, stats({ kills: 30 }), LOSS, 99);
    expect(fifth.unlocked).toContain('unlock_boarfolk'); // 5 runs
    expect(fifth.unlocked).toContain('unlock_skull_mask'); // 310 lifetime kills
    expect(fifth.meta.runs).toBe(5);
    expect(fifth.meta.lifetime.kills).toBe(310);
  });
});

describe('applyRun / persistence', () => {
  it('accumulates lifetime stats, best values and wins', () => {
    const r1 = applyRun(emptyMeta(), stats({ kills: 5, goldEarned: 40 }), LOSS, 1).meta;
    const r2 = applyRun(r1, stats({ kills: 7 }), WIN, 2).meta;
    expect(r2.runs).toBe(2);
    expect(r2.wins).toBe(1);
    expect(r2.lifetime.kills).toBe(12);
    expect(r2.lifetime.goldEarned).toBe(40);
    expect(r2.bestDistrict).toBe(21);
    expect(r2.bestLevel).toBe(18);
    expect(r2.lifetime.level).toBe(18); // max, not sum
    expect(new Set(r2.unlocked).size).toBe(r2.unlocked.length);
  });

  it('saves and loads a versioned JSON blob, tolerating junk and storage errors', () => {
    const store = memStore();
    const meta = applyRun(emptyMeta(), stats({ kills: 20 }), WIN, 3).meta;
    expect(saveMeta(meta, store)).toBe(true);
    expect(JSON.parse(store.data.get(META_KEY)!).version).toBe(META_VERSION);
    expect(loadMeta(store)).toEqual(meta);
    store.data.set(META_KEY, '{not json');
    expect(loadMeta(store)).toEqual(emptyMeta());
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadMeta(broken)).toEqual(emptyMeta());
    expect(saveMeta(meta, broken)).toBe(false);
    expect(loadMeta(undefined)).toEqual(emptyMeta());
    expect(normalizeMeta({ version: 1, unlocked: ['a', 'a', 3], runs: -4, lifetime: { kills: 'x', bugs: 2 } })).toEqual({
      ...emptyMeta(),
      unlocked: ['a'],
      lifetime: { bugs: 2 },
    });
  });

  it('finishRun records a real world run end-to-end', () => {
    const store = memStore();
    const w = createRun(5, [{ name: 'A', race: 'drifter', hat: '', companion: '' }]);
    w.players[0]!.runStats.kills = 12;
    const res = finishRun(w, 0, { store });
    expect(res.meta.runs).toBe(1);
    expect(loadMeta(store).lifetime.kills).toBe(12);
    const practice = finishRun(w, 0, { store, practice: true });
    expect(practice.unlocked).toEqual([]);
    expect(loadMeta(store).runs).toBe(1);
  });

  it('todayString formats YYYY-MM-DD', () => {
    expect(todayString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
