import type { DropEntry, EnemyDef } from './types';

/**
 * Enemy roster (GDD §8). Damage is in small integer hit points (player HP starts ≈ 5); stats rise
 * with the biome's depth band (`minDepth` / biome `depths` are run levels 1–21). Sprite keys follow
 * 'enemy_<id>'. Behaviours are implemented in src/sim/ai; every attack is telegraphed.
 */

const drop = (item: string, chance: number, min = 1, max = min): DropEntry => ({ item, chance, min, max });

type Base = Omit<EnemyDef, 'sprite' | 'gold' | 'drops' | 'weight' | 'minDepth' | 'biomes'> &
  Partial<Pick<EnemyDef, 'gold' | 'drops' | 'weight' | 'minDepth'>> & { biomes: string[] };

function enemy(d: Base): EnemyDef {
  return { gold: [0, 1], drops: [], weight: 5, minDepth: 1, sprite: `enemy_${d.id}`, ...d };
}

export const ENEMIES: EnemyDef[] = [
  // --- Mossgrave Woods (levels 1–8) ---------------------------------------------------------------
  enemy({ id: 'green_slime', name: 'Green Slime', behavior: 'hopper', w: 8, h: 6, hp: 3, damage: 1, speed: 40, sight: 70, xp: 2, gold: [0, 2], drops: [drop('slime_gel', 0.5)], biomes: ['woods'], weight: 10 }),
  enemy({ id: 'toad', name: 'Mire Toad', behavior: 'hopper', w: 9, h: 7, hp: 4, damage: 1, speed: 60, sight: 90, xp: 3, gold: [0, 2], drops: [drop('raw_meat', 0.35), drop('egg', 0.15)], biomes: ['woods', 'fen'], weight: 6, tags: ['long_hop'] }),
  enemy({ id: 'boar', name: 'Tusk Boar', behavior: 'charger', w: 12, h: 8, hp: 6, damage: 2, speed: 45, sight: 100, attackCooldown: 2.2, xp: 4, gold: [1, 3], drops: [drop('raw_meat', 0.8, 1, 2), drop('hide', 0.6)], biomes: ['woods'], weight: 6, knockbackResist: 0.3 }),
  enemy({ id: 'forest_beetle', name: 'Bark Beetle', behavior: 'walker', w: 9, h: 6, hp: 5, def: 1, damage: 1, speed: 22, sight: 60, xp: 3, gold: [0, 2], drops: [drop('beetle_shell', 0.5), drop('stag_beetle', 0.08)], biomes: ['woods'], weight: 6 }),
  enemy({ id: 'thorn_wasp', name: 'Thorn Wasp', behavior: 'flyer', w: 7, h: 6, hp: 2, damage: 1, speed: 50, sight: 110, flying: true, attackCooldown: 2, onHit: [{ id: 'poison', duration: 3, chance: 0.4, power: 1 }], xp: 3, gold: [0, 2], drops: [drop('venom_sac', 0.25)], biomes: ['woods'], weight: 4, minDepth: 3 }),

  // --- Fenmire (2–10) -------------------------------------------------------------------------------
  enemy({ id: 'hex_totem', name: 'Hex Totem', behavior: 'turret', w: 8, h: 12, hp: 6, damage: 1, damageType: 'magic', speed: 0, sight: 140, projectile: 'magic_orb', attackCooldown: 2.4, xp: 5, gold: [1, 3], drops: [drop('wisp_essence', 0.3), drop('wood', 0.5, 1, 2)], biomes: ['fen'], weight: 5, knockbackResist: 1, light: { radius: 22, color: 0x40ffff } }),
  enemy({ id: 'glimmer_bat', name: 'Glimmer Bat', behavior: 'flyer', w: 8, h: 6, hp: 3, damage: 1, speed: 60, sight: 120, flying: true, attackCooldown: 1.8, xp: 3, gold: [0, 2], drops: [drop('bat_wing', 0.5)], biomes: ['fen'], weight: 6, light: { radius: 14, color: 0x8060ff } }),
  enemy({ id: 'wisp_lynx', name: 'Wisp Lynx', behavior: 'charger', w: 10, h: 7, hp: 5, damage: 2, damageType: 'magic', speed: 55, sight: 120, attackCooldown: 1.8, xp: 5, gold: [1, 3], drops: [drop('wisp_essence', 0.4), drop('hide', 0.3)], biomes: ['fen'], weight: 4, minDepth: 4, light: { radius: 18, color: 0x40e0ff } }),
  enemy({ id: 'bog_slime', name: 'Bog Slime', behavior: 'hopper', w: 9, h: 7, hp: 5, damage: 1, damageType: 'poison', speed: 40, sight: 80, onHit: [{ id: 'poison', duration: 3, chance: 0.5, power: 1 }], xp: 3, gold: [0, 2], drops: [drop('slime_gel', 0.6), drop('bog_moss', 0.3)], biomes: ['fen'], weight: 8 }),

  // --- Hollow Deep (2–12) ---------------------------------------------------------------------------
  enemy({ id: 'cave_bat', name: 'Cave Bat', behavior: 'flyer', w: 7, h: 5, hp: 2, damage: 1, speed: 65, sight: 110, flying: true, attackCooldown: 1.6, xp: 2, gold: [0, 1], drops: [drop('bat_wing', 0.5)], biomes: ['hollow'], weight: 8 }),
  enemy({ id: 'bone_miner', name: 'Bone Miner', behavior: 'walker', w: 8, h: 12, hp: 7, damage: 2, speed: 30, sight: 90, xp: 5, gold: [1, 4], drops: [drop('bone', 0.6), drop('iron_ore', 0.2), drop('coal', 0.3)], biomes: ['hollow'], weight: 6 }),
  enemy({ id: 'rock_crawler', name: 'Rock Crawler', behavior: 'walker', w: 11, h: 6, hp: 9, def: 1, damage: 1, speed: 18, sight: 60, xp: 4, gold: [0, 2], drops: [drop('stone', 0.8, 1, 3), drop('iron_ore', 0.25)], biomes: ['hollow'], weight: 5, knockbackResist: 0.6 }),
  enemy({ id: 'cave_spider', name: 'Cave Spider', behavior: 'dropper', w: 9, h: 6, hp: 4, damage: 1, speed: 45, sight: 70, onHit: [{ id: 'poison', duration: 3, chance: 0.4, power: 1 }], xp: 4, gold: [0, 2], drops: [drop('silk', 0.6), drop('venom_sac', 0.3)], biomes: ['hollow'], weight: 6 }),

  // --- Rimefrost (5–15) -----------------------------------------------------------------------------
  enemy({ id: 'frostling', name: 'Frostling', behavior: 'shooter', w: 9, h: 10, hp: 8, damage: 2, damageType: 'ice', speed: 28, sight: 130, projectile: 'ice_shard', attackCooldown: 2.6, xp: 6, gold: [1, 4], drops: [drop('hide', 0.4), drop('frost_crystal', 0.3)], biomes: ['rime'], weight: 6 }),
  enemy({ id: 'ice_wolf', name: 'Ice Wolf', behavior: 'charger', w: 12, h: 8, hp: 9, damage: 2, speed: 55, sight: 120, attackCooldown: 1.8, xp: 6, gold: [1, 3], drops: [drop('hide', 0.6), drop('fang', 0.4)], biomes: ['rime'], weight: 6 }),
  enemy({ id: 'snow_owl', name: 'Snow Owl', behavior: 'flyer', w: 9, h: 8, hp: 5, damage: 2, speed: 55, sight: 130, flying: true, attackCooldown: 2, xp: 5, gold: [0, 3], drops: [drop('feather', 0.7, 1, 2)], biomes: ['rime'], weight: 5 }),
  enemy({ id: 'ice_slime', name: 'Rime Slime', behavior: 'hopper', w: 9, h: 7, hp: 7, damage: 1, damageType: 'ice', speed: 40, sight: 80, onHit: [{ id: 'slow', duration: 2, chance: 0.5, power: 0.4 }], xp: 4, gold: [0, 2], drops: [drop('slime_gel', 0.5), drop('frost_crystal', 0.3)], biomes: ['rime'], weight: 6 }),

  // --- Amethyst Hollows (8–20) ----------------------------------------------------------------------
  enemy({ id: 'shard_beetle', name: 'Shard Beetle', behavior: 'charger', w: 12, h: 8, hp: 14, def: 2, damage: 3, speed: 50, sight: 120, attackCooldown: 2, xp: 9, gold: [2, 5], drops: [drop('beetle_shell', 0.6), drop('amethyst_shard', 0.4)], biomes: ['amethyst'], weight: 6, knockbackResist: 0.5 }),
  enemy({ id: 'void_imp', name: 'Void Imp', behavior: 'shooter', w: 8, h: 8, hp: 8, damage: 2, damageType: 'magic', speed: 45, sight: 140, flying: true, projectile: 'magic_orb', attackCooldown: 2.4, xp: 8, gold: [1, 4], drops: [drop('amethyst_shard', 0.3), drop('wisp_essence', 0.3)], biomes: ['amethyst'], weight: 6, light: { radius: 16, color: 0xc060ff } }),
  enemy({ id: 'crystal_spider', name: 'Crystal Spider', behavior: 'dropper', w: 10, h: 7, hp: 10, damage: 3, speed: 50, sight: 80, xp: 8, gold: [1, 4], drops: [drop('silk', 0.5), drop('amethyst_shard', 0.3)], biomes: ['amethyst'], weight: 5, light: { radius: 10, color: 0xff60ff } }),
  enemy({ id: 'gem_golem', name: 'Gem Golem', behavior: 'walker', w: 14, h: 16, hp: 30, def: 3, damage: 4, speed: 16, sight: 90, xp: 15, gold: [3, 8], drops: [drop('amethyst_shard', 0.8, 1, 3), drop('diamond', 0.1)], biomes: ['amethyst'], weight: 3, minDepth: 10, knockbackResist: 0.85, light: { radius: 14, color: 0xd080ff } }),

  // --- Cinderdeep (11–20) ---------------------------------------------------------------------------
  enemy({ id: 'magma_slime', name: 'Magma Slime', behavior: 'hopper', w: 10, h: 8, hp: 14, damage: 3, damageType: 'fire', speed: 45, sight: 90, onHit: [{ id: 'burn', duration: 2, chance: 0.5, power: 1 }], xp: 9, gold: [1, 4], drops: [drop('magma_scale', 0.4), drop('ember_core', 0.2)], biomes: ['cinder'], weight: 7, light: { radius: 18, color: 0xff7020 }, tags: ['resist_fire'] }),
  enemy({ id: 'flame_boar', name: 'Cinder Boar', behavior: 'charger', w: 14, h: 9, hp: 18, damage: 4, damageType: 'fire', speed: 50, sight: 120, attackCooldown: 2, onHit: [{ id: 'burn', duration: 2, chance: 0.5, power: 1 }], xp: 12, gold: [2, 5], drops: [drop('raw_meat', 0.7, 1, 2), drop('hide', 0.5), drop('magma_scale', 0.3)], biomes: ['cinder'], weight: 5, knockbackResist: 0.4, light: { radius: 16, color: 0xff6010 }, tags: ['resist_fire'] }),
  enemy({ id: 'ember_imp', name: 'Ember Imp', behavior: 'shooter', w: 8, h: 8, hp: 10, damage: 3, damageType: 'fire', speed: 45, sight: 140, flying: true, projectile: 'fire_spit', attackCooldown: 2.2, xp: 10, gold: [1, 4], drops: [drop('ember_core', 0.3)], biomes: ['cinder'], weight: 6, light: { radius: 18, color: 0xff8030 }, tags: ['immune_fire'] }),
  enemy({ id: 'salamander', name: 'Salamander', behavior: 'shooter', w: 12, h: 6, hp: 16, damage: 3, damageType: 'fire', speed: 30, sight: 120, projectile: 'fire_spit', attackCooldown: 2.8, xp: 11, gold: [1, 4], drops: [drop('magma_scale', 0.5)], biomes: ['cinder'], weight: 5, tags: ['resist_fire'] }),

  // --- Blight Lair (21) -----------------------------------------------------------------------------
  enemy({ id: 'blight_head', name: 'Blight Head', behavior: 'shooter', w: 10, h: 10, hp: 20, damage: 4, damageType: 'magic', speed: 35, sight: 160, flying: true, projectile: 'magic_orb', attackCooldown: 2.2, xp: 15, gold: [2, 6], drops: [drop('voidshard', 0.15)], biomes: ['lair'], weight: 6, minDepth: 21, light: { radius: 20, color: 0xff40c0 } }),
  enemy({ id: 'blight_spawn', name: 'Blight Spawn', behavior: 'walker', w: 9, h: 9, hp: 18, damage: 4, speed: 34, sight: 120, xp: 12, gold: [1, 4], drops: [drop('voidshard', 0.08)], biomes: ['lair'], weight: 8, minDepth: 21 }),

  // --- The Blight Wraith: run-flow hunter (src/sim/progression/wraith.ts moves it) ------------------
  {
    id: 'blight_wraith', name: 'Blight Wraith', sprite: 'enemy_blight_wraith', behavior: 'flyer', w: 12, h: 14, hp: 9999, damage: 4,
    damageType: 'magic', speed: 0, sight: 9999, flying: true, xp: 0, gold: [0, 0], drops: [], biomes: [], weight: 0, minDepth: 99,
    light: { radius: 40, color: 0xff3cb4 }, tags: ['wraith'],
  },
];
