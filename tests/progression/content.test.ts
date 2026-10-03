import { describe, expect, it } from 'vitest';
import { Content, validateContent } from '../../src/content';
import { createRun } from '../../src/sim';
import { countItem } from '../../src/sim/items/inventory';

/** Canonical ids from docs/design/gdd.md §10. */
const GDD = {
  races: ['drifter', 'highborn', 'cyclorc', 'stoutling', 'templar', 'wraithkin', 'mosskin', 'boarfolk', 'saurian', 'ifrit'],
  traits: ['aggressive', 'defensive', 'healthy', 'swift', 'gatherer', 'artisan', 'glutton', 'lucky', 'bookworm', 'nimble'],
  hats: ['forager_band', 'miner_lamp', 'berserker_scarf', 'ranger_cap', 'wizard_hat', 'bunny_ears', 'bat_wings', 'tiki_mask', 'skull_mask', 'gilded_crown', 'shroom_cap', 'dragon_mask'],
  companions: ['mend_sprite', 'ember_bat', 'lantern_wisp', 'haste_beetle', 'floaty_slime', 'gizmo_drone'],
  warrior: ['whirlwind', 'ground_slam', 'war_cry', 'charge', 'iron_skin', 'cleave'],
  mage: ['fire_burst', 'frost_nova', 'chain_lightning', 'blink', 'arcane_ward', 'meteor'],
  ranger: ['multishot', 'arrow_rain', 'bear_trap', 'smoke_bomb', 'hawk', 'volley_step'],
};

describe('progression content', () => {
  it('validates', () => {
    expect(validateContent()).toEqual([]);
  });

  it('uses the canonical GDD ids', () => {
    expect([...Content.races.keys()]).toEqual(GDD.races);
    expect([...Content.traits.keys()]).toEqual(GDD.traits);
    expect([...Content.hats.keys()]).toEqual(GDD.hats);
    expect([...Content.companions.keys()]).toEqual(GDD.companions);
    for (const path of ['warrior', 'mage', 'ranger'] as const) {
      expect([...Content.skills.values()].filter((s) => s.path === path).map((s) => s.id)).toEqual(GDD[path]);
    }
    expect([...Content.skillPaths.values()].map((p) => [p.id, p.color])).toEqual([['warrior', 0xd04040], ['mage', 0x4070e0], ['ranger', 0x40b040]]);
  });

  it('every skill has 3 ranks of rising power, a cooldown and a cost type', () => {
    for (const s of Content.skills.values()) {
      expect(s.power).toHaveLength(3);
      expect(s.power[2]!).toBeGreaterThan(s.power[0]!);
      expect(s.cooldown).toBeGreaterThan(0);
      expect(s.effect).toBe(s.id);
    }
  });

  it('race mods follow the GDD (e.g. cyclorc ATK+2 HP-1, boarfolk all -1, no axe)', () => {
    expect(Content.races.get('drifter')!.mods).toEqual({ maxHp: 1 });
    expect(Content.races.get('cyclorc')!.mods).toEqual({ atk: 2, maxHp: -1 });
    expect(Content.races.get('stoutling')!.mods).toEqual({ dex: 4, maxHp: -1 });
    expect(Content.races.get('wraithkin')!.mods).toEqual({ mag: 4, maxHp: -1 });
    expect(Content.races.get('saurian')!.mods).toEqual({ atk: 1, dex: 3, mag: 1 });
    const boar = Content.races.get('boarfolk')!;
    expect(boar.startItems).toEqual([{ item: 'raw_meat', count: 3 }]);
    expect(Object.values(boar.mods!).every((v) => v === -1)).toBe(true);
    expect(Content.races.get('ifrit')!.special).toBe('burn_immune');
    expect([...Content.races.values()].filter((r) => r.unlockedByDefault).map((r) => r.id)).toEqual(['drifter']);
  });

  it('every race can start a run with its start items', () => {
    for (const r of Content.races.values()) {
      const w = createRun(1, [{ name: 'A', race: r.id, hat: '', companion: '' }]);
      const p = w.players[0]!;
      for (const s of r.startItems) expect(countItem(p, s.item)).toBe(s.count);
      expect(w.playerEntity(0)!.maxHp).toBeGreaterThanOrEqual(1);
    }
  });

  it('hats and traits apply through recalcStats', () => {
    const w = createRun(1, [{ name: 'A', race: 'drifter', hat: 'bunny_ears', companion: '', traits: ['lucky', 'healthy'] }]);
    const p = w.players[0]!;
    expect(p.mods.airJumps).toBe(1);
    expect(p.specials).toContain('triple_jump');
    expect(p.stats.lck).toBe(p.base.lck + 2);
    expect(p.stats.maxHp).toBe(p.base.hp + 1 + 2);
  });
});
