import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { EQUIP_SLOTS } from '../../src/ui/layout';
import { GHOST_ART, HUD_ART, ITEM_ART, OUTLINE, SKILL_ART, artPixels, getPx, iconKind, itemIconPixels, makeBuf, materialTri, opaqueCount, outline, paint } from '../../src/ui/iconArt';

/** Canonical material & key item ids from the GDD (§7). */
const GDD_IDS = `wood stick plank stone flint coal iron_ore iron_bar gold_ore gold_bar diamond voidshard
fiber string fabric silk leather hide bone feather slime_gel venom_sac beetle_shell bat_wing
frost_crystal ember_core amethyst_shard bog_moss glowcap herb berry
raw_meat cooked_meat bread mystery_potion health_potion mana_potion
firefly glow_moth stag_beetle
wooden_axe wooden_sword wooden_pickaxe wooden_bow arrow torch campfire bomb ladder_kit platform_kit bug_net
recipe_scroll repair_kit gold`.split(/\s+/);

describe('procedural item icons', () => {
  it('every art pattern is 10x10', () => {
    for (const [kind, rows] of Object.entries(ITEM_ART)) {
      expect(rows, kind).toHaveLength(10);
      for (const r of rows) expect(r.length, kind).toBe(10);
    }
  });

  it('draws a non-empty, outlined 10x10 icon for every canonical GDD id (no placeholder)', () => {
    for (const id of GDD_IDS) {
      const kind = iconKind(Content.items.get(id), id);
      expect(kind, id).not.toBe('unknown');
      const b = itemIconPixels(Content.items.get(id), id);
      expect(b.w).toBe(10);
      expect(b.h).toBe(10);
      expect(opaqueCount(b), id).toBeGreaterThan(8);
      expect([...b.data].some((v) => (v & 0xffffff) === OUTLINE), id).toBe(true);
    }
  });

  it('picks sensible pictograms from ids, tool kinds and categories', () => {
    const k = (id: string) => iconKind(Content.items.get(id), id);
    expect(k('wood')).toBe('log');
    expect(k('plank')).toBe('plank');
    expect(k('stick')).toBe('stick');
    expect(k('iron_ore')).toBe('ore');
    expect(k('gold_bar')).toBe('bar');
    expect(k('diamond')).toBe('gem');
    expect(k('wooden_pickaxe')).toBe('pickaxe');
    expect(k('wooden_axe')).toBe('axe');
    expect(k('axe')).toBe('axe');
    expect(k('wooden_bow')).toBe('bow');
    expect(k('arrow')).toBe('arrow');
    expect(k('health_potion')).toBe('potion');
    expect(k('meat')).toBe('meat');
    expect(k('gold')).toBe('coin');
    expect(k('iron_pick_head')).toBe('head');
    expect(k('iron_blade')).toBe('blade');
    expect(k('bug_net')).toBe('net');
    expect(k('beetle_shell')).toBe('shell');
    expect(k('stag_beetle')).toBe('bug');
    expect(iconKind({ id: 'x', name: 'X', category: 'tool', tool: 'pickaxe', description: '', sprite: '', maxStack: 1, value: 0, tier: 1 }, 'thing')).toBe('pickaxe');
    expect(iconKind({ id: 'x', name: 'X', category: 'weapon', use: 'cast', projectile: 'fireball', description: '', sprite: '', maxStack: 1, value: 0, tier: 1 }, 'ember_focus')).toBe('wand');
    expect(iconKind(undefined, 'qqq')).toBe('unknown');
  });

  it('tints by material keyword, else by tier', () => {
    expect(materialTri('iron_sword')).not.toEqual(materialTri('gold_sword'));
    expect(materialTri('zzz', 1)).not.toEqual(materialTri('zzz', 4));
  });

  it('is deterministic', () => {
    const a = itemIconPixels(Content.items.get('axe'), 'axe');
    const b = itemIconPixels(Content.items.get('axe'), 'axe');
    expect([...a.data]).toEqual([...b.data]);
  });
});

describe('HUD glyphs, ghosts and skill pictograms', () => {
  it('meter icons are 7x7 and non-empty', () => {
    for (const id of ['heart', 'gem', 'drumstick', 'boot']) {
      const a = HUD_ART[id]!;
      const b = artPixels(a.rows, a.pal);
      expect(b.w, id).toBe(7);
      expect(b.h, id).toBe(7);
      expect(opaqueCount(b), id).toBeGreaterThan(10);
    }
  });

  it('every equipment slot has a ghost silhouette', () => {
    for (const s of EQUIP_SLOTS) {
      const rows = GHOST_ART[s]!;
      expect(rows, s).toHaveLength(10);
      expect(opaqueCount(artPixels(rows, { g: 0xffffff })), s).toBeGreaterThan(5);
    }
  });

  it('every skill path (and the unknown fallback) has a pictogram', () => {
    for (const p of ['warrior', 'mage', 'ranger', 'unknown']) expect(SKILL_ART[p], p).toHaveLength(10);
  });

  it('outline() rings opaque pixels with the outline colour', () => {
    const b = makeBuf(3, 3);
    paint(b, ['...', '.x.', '...'], { x: 0xffffff });
    outline(b);
    expect(getPx(b, 1, 0) & 0xffffff).toBe(OUTLINE);
    expect(getPx(b, 0, 0)).toBe(0);
    expect(getPx(b, 1, 1) & 0xffffff).toBe(0xffffff);
  });
});
