import type { BossDef, DropEntry } from './types';

/**
 * Giant monsters (GDD §7 biome table). One per biome; guarded arenas on combat districts 3/6/9 and a
 * 15% roaming chance elsewhere. Stats are for combat district 3: the spawner scales HP and damage
 * with depth (src/sim/ai/bosses.ts `bossDepthScale`), then co-op/difficulty scaling applies on top.
 * Patterns live in src/sim/ai/bosses.ts (keyed by `pattern`). Sprites: `boss_<id>`.
 */
const drop = (item: string, chance: number, min = 1, max = min): DropEntry => ({ item, chance, min, max });

type Base = Omit<BossDef, 'behavior' | 'sprite' | 'pattern' | 'sight' | 'biomes'> & Partial<Pick<BossDef, 'sight'>> & { biome: string };

function boss({ biome, ...d }: Base): BossDef {
  return { behavior: 'boss', sprite: `boss_${d.id}`, pattern: d.id, sight: 260, biomes: [biome], ...d };
}

export const BOSSES: BossDef[] = [
  boss({
    id: 'gloomjaw', name: 'Gloomjaw', title: 'Gloomjaw, the Acid Maw', biome: 'woods',
    w: 40, h: 18, hp: 260, damage: 1, damageType: 'physical', speed: 46, def: 1, knockbackResist: 0.9,
    projectile: 'acid_glob', phases: [0.5], arena: { w: 56, h: 24 },
    xp: 120, gold: [40, 70], drops: [drop('gloomjaw_fang', 1), drop('hide', 1, 2, 4), drop('iron_ore', 0.8, 2, 4)],
    light: { radius: 20, color: 0xc0ff40 }, tags: ['resist_poison'],
  }),
  boss({
    id: 'bogmother', name: 'Bogmother', title: 'The Bogmother', biome: 'fen',
    w: 40, h: 30, hp: 300, damage: 1, damageType: 'poison', speed: 40, def: 1, knockbackResist: 1,
    projectile: 'slime_ball', phases: [0.6, 0.3], arena: { w: 56, h: 26 },
    xp: 130, gold: [45, 80], drops: [drop('bogmother_heart', 1), drop('bog_moss', 1, 3, 5), drop('slime_gel', 1, 3, 6)],
    tags: ['resist_poison', 'weak_fire'],
  }),
  boss({
    id: 'broodqueen', name: 'Broodqueen', title: 'The Broodqueen', biome: 'hollow',
    w: 34, h: 22, hp: 280, damage: 1, damageType: 'poison', speed: 58, def: 1, knockbackResist: 0.9,
    projectile: 'web_shot', phases: [0.6, 0.3], arena: { w: 54, h: 28 },
    xp: 130, gold: [45, 80], drops: [drop('broodqueen_eye', 1), drop('silk', 1, 3, 6), drop('venom_sac', 1, 1, 3), drop('gold_ore', 0.6, 1, 3)],
    light: { radius: 18, color: 0xff40c0 },
  }),
  boss({
    id: 'frost_matron', name: 'Frost Matron', title: 'The Frost Matron', biome: 'rime',
    w: 18, h: 28, hp: 240, damage: 2, damageType: 'ice', speed: 42, flying: true, knockbackResist: 1,
    projectile: 'ice_shard', phases: [0.6, 0.3], arena: { w: 52, h: 26 },
    xp: 140, gold: [50, 90], drops: [drop('frost_heart', 1), drop('frost_crystal', 1, 3, 6), drop('frostweave', 0.6)],
    light: { radius: 40, color: 0xa0e0ff }, tags: ['immune_ice', 'weak_fire'],
  }),
  boss({
    id: 'shardbound_knight', name: 'Shardbound Knight', title: 'The Shardbound Knight', biome: 'amethyst',
    w: 16, h: 22, hp: 300, damage: 3, damageType: 'physical', speed: 70, def: 3, knockbackResist: 0.8,
    projectile: 'crystal_spike', phases: [0.66, 0.33], arena: { w: 52, h: 24 },
    xp: 160, gold: [60, 100], drops: [drop('shardbound_core', 1), drop('amethyst_shard', 1, 4, 8), drop('diamond', 0.5, 1, 2)],
    light: { radius: 26, color: 0xc070ff }, tags: ['resist_magic'],
  }),
  boss({
    id: 'emberwyrm', name: 'Emberwyrm', title: 'The Emberwyrm', biome: 'cinder',
    w: 36, h: 24, hp: 320, damage: 3, damageType: 'fire', speed: 60, flying: true, knockbackResist: 1,
    projectile: 'fireball', phases: [0.6, 0.3], arena: { w: 60, h: 28 },
    xp: 180, gold: [70, 120], drops: [drop('wyrm_heart', 1), drop('magma_scale', 1, 3, 5), drop('ember_core', 1, 1, 2), drop('fire_gem', 0.5)],
    light: { radius: 44, color: 0xff7020 }, tags: ['immune_fire', 'weak_ice'],
  }),
  // The final boss: a wall of blight flesh spanning the lair. Fixed HP (GDD §2b.2: 4500 + 700 per
  // extra player — `bossDepthScale` leaves it alone and `blightwallHp` adds the co-op term).
  boss({
    id: 'blightwall', name: 'Blightwall', title: 'The Blightwall', biome: 'lair',
    w: 40, h: 160, hp: 4500, damage: 4, damageType: 'magic', speed: 6, knockbackResist: 1, sight: 400,
    projectile: 'blight_bolt', phases: [0.66, 0.33], arena: { w: 90, h: 36 },
    xp: 0, gold: [0, 0], drops: [],
    light: { radius: 60, color: 0xff3cb4 }, tags: ['resist_magic'],
  }),
];
