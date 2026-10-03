import { describe, expect, it } from 'vitest';
import { Content, recipeKey, validateContent } from '../../src/content';
import { ITEMS } from '../../src/content/items';
import { NPCS, SHOPS } from '../../src/content/npcs';
import { RECIPES } from '../../src/content/recipes';
import { Tile } from '../../src/sim/tiles';

/** Canonical ids from GDD §7 that must exist. */
const CANONICAL = (
  'wood stick plank stone flint coal iron_ore iron_bar gold_ore gold_bar diamond voidshard ' +
  'fiber string fabric silk leather hide bone feather slime_gel venom_sac beetle_shell bat_wing ' +
  'frost_crystal ember_core amethyst_shard bog_moss glowcap herb berry ' +
  'raw_meat cooked_meat bread mystery_potion health_potion mana_potion ' +
  'firefly glow_moth stag_beetle ' +
  'wooden_axe wooden_sword wooden_pickaxe wooden_bow arrow torch campfire bomb ladder_kit platform_kit bug_net ' +
  'recipe_scroll repair_kit gold'
).split(' ');

describe('item catalogue', () => {
  it('keeps validateContent() green', () => {
    expect(validateContent()).toEqual([]);
  });

  it('has every GDD canonical id and a Phase-1 sized catalogue', () => {
    for (const id of CANONICAL) expect(Content.items.has(id), id).toBe(true);
    expect(ITEMS.length).toBeGreaterThanOrEqual(150);
    expect(RECIPES.length).toBeGreaterThanOrEqual(150);
  });

  it('has the race start items other workstreams reference', () => {
    for (const id of ['wooden_axe', 'raw_meat', 'buckler', 'spark_wand', 'fire_wand', 'jade_blade']) expect(Content.items.has(id), id).toBe(true);
  });

  it('has tool tiers with tool power 1..5 for axes and pickaxes', () => {
    const powers = (kind: 'axe' | 'pickaxe') =>
      ITEMS.filter((i) => i.tool === kind && !i.tags?.includes('unique'))
        .map((i) => i.toolPower)
        .sort();
    expect(powers('axe')).toEqual([1, 2, 3, 4, 5]);
    expect(powers('pickaxe')).toEqual([1, 2, 3, 4, 5]);
    expect(Content.items.get('bug_net')?.tool).toBe('net');
  });

  it('gives every tool, weapon (except thrown) and armour piece a durability', () => {
    for (const i of ITEMS) {
      const needs = i.category === 'tool' || i.category === 'armor' || (i.category === 'weapon' && i.use !== 'throw');
      if (needs) expect(i.durability, i.id).toBeGreaterThan(0);
      if (i.durability !== undefined) expect(i.maxStack, i.id).toBe(1);
    }
  });

  it('has sane numbers', () => {
    for (const i of ITEMS) {
      expect(i.tier, i.id).toBeGreaterThanOrEqual(1);
      expect(i.tier, i.id).toBeLessThanOrEqual(5);
      expect(i.value, i.id).toBeGreaterThanOrEqual(0);
      expect(i.maxStack, i.id).toBeGreaterThanOrEqual(1);
      expect(i.sprite, i.id).toBe(`item_${i.id}`);
      expect(i.description.length, i.id).toBeGreaterThan(5);
      if (i.use === 'cast') expect(i.manaCost, i.id).toBeGreaterThan(0);
      if (i.equipSlot) expect(['head', 'body', 'accessory1', 'accessory2', 'ammo', 'trinket']).toContain(i.equipSlot);
      if (i.category === 'ammo') expect(i.ammoKind, i.id).toBeTruthy();
    }
    // Balance anchors from the GDD.
    expect(Content.items.get('wooden_sword')?.damage).toBe(2);
    const late = ITEMS.filter((i) => i.tier === 5 && i.category === 'weapon').map((i) => i.damage ?? 0);
    expect(Math.max(...late)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...late)).toBeLessThanOrEqual(60);
  });

  it('every shooter has matching ammo in the catalogue', () => {
    for (const i of ITEMS) {
      if (i.use !== 'shoot') continue;
      expect(ITEMS.some((a) => a.ammoKind === i.ammoType), i.id).toBe(true);
    }
  });

  it('places real tiles', () => {
    expect(Content.items.get('platform_kit')?.places).toBe(Tile.PLATFORM);
    expect(Content.items.get('ladder_kit')?.places).toBe(Tile.LADDER);
    expect(Content.items.get('dirt')?.places).toBe(Tile.GROUND);
    expect(Content.items.get('campfire')?.placesProp).toBe('campfire');
  });

  it('has the biome armour sets', () => {
    for (const id of ['bogscale_hood', 'bogscale_vest', 'frostweave_hood', 'frostweave_robe', 'emberplate_helm', 'emberplate_armor', 'amethyst_circlet', 'amethyst_mail']) {
      expect(Content.items.get(id)?.category, id).toBe('armor');
    }
  });
});

describe('recipes', () => {
  it('have no duplicate pairs and never produce one of their inputs', () => {
    const seen = new Set<string>();
    for (const r of RECIPES) {
      const k = recipeKey(r.a, r.b);
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
      expect(r.result, k).not.toBe(r.a);
      expect(r.result, k).not.toBe(r.b);
      expect(r.count, k).toBeGreaterThanOrEqual(1);
      expect(r.hint, k).toBeTruthy();
    }
  });

  it('follow the GDD idioms', () => {
    const res = (a: string, b: string) => Content.recipes.get(recipeKey(a, b))?.result;
    expect(res('wood', 'wood')).toBe('plank');
    expect(res('wood', 'stone')).toBe('stick');
    expect(res('fiber', 'fiber')).toBe('string');
    expect(res('string', 'string')).toBe('fabric');
    expect(res('hide', 'hide')).toBe('leather');
    expect(res('stick', 'string')).toBe('wooden_bow');
    expect(res('stick', 'flint')).toBe('arrow');
    expect(Content.recipes.get(recipeKey('stick', 'flint'))?.count).toBe(5);
    expect(res('herb', 'glowcap')).toBe('mystery_potion');
    expect(res('iron_bar', 'iron_bar')).toBe('iron_blade');
    expect(res('iron_bar', 'stone')).toBe('iron_pick_head');
    expect(res('iron_bar', 'plank')).toBe('iron_axe_head');
    expect(res('iron_pick_head', 'stick')).toBe('iron_pickaxe');
    expect(Content.recipes.get(recipeKey('raw_meat', 'raw_meat'))?.station).toBe('campfire');
    expect(Content.recipes.get(recipeKey('iron_ore', 'iron_ore'))?.station).toBe('forge');
  });

  it('give armour from the forge and cooking at a campfire only', () => {
    for (const r of RECIPES) {
      const out = Content.items.get(r.result)!;
      if (r.station === 'campfire') expect(out.category, r.result).toBe('consumable');
      if (out.tags?.includes('food') && out.id !== 'raw_meat' && ['cooked_meat', 'bread', 'hearty_stew', 'berry_pie', 'omelette'].includes(out.id)) {
        expect(r.station, r.result).toBe('campfire');
      }
    }
  });
});

describe('npcs', () => {
  it('defines every GDD shop npc with dialogue', () => {
    for (const id of ['npc_merchant', 'npc_trader', 'npc_smith', 'npc_outfitter', 'npc_fence', 'npc_shrine']) {
      const n = Content.npcs.get(id);
      expect(n, id).toBeDefined();
      expect(n!.dialogue.length, id).toBeGreaterThanOrEqual(3);
      expect(SHOPS[id], id).toBeDefined();
    }
    for (const n of NPCS) if (n.role !== 'flavor') expect(SHOPS[n.id], n.id).toBeDefined();
    expect(Content.npcs.get('chicken')?.role).toBe('flavor');
    expect(Content.npcs.get('npc_smith')!.dialogue.some((d) => d.startsWith('Tip:'))).toBe(true);
  });

  it('shop lines reference real items with sane quantities', () => {
    for (const [id, shop] of Object.entries(SHOPS)) {
      for (const l of shop.lines) {
        expect(Content.items.has(l.item), `${id}:${l.item}`).toBe(true);
        expect(l.qty[0], `${id}:${l.item}`).toBeGreaterThanOrEqual(1);
        expect(l.qty[1], `${id}:${l.item}`).toBeGreaterThanOrEqual(l.qty[0]);
        if (l.biome) expect(['woods', 'fen', 'hollow', 'rime', 'amethyst', 'cinder', 'lair']).toContain(l.biome);
      }
    }
  });
});
