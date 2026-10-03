import { Content } from '../content';
import { StringTable } from './codec';

/**
 * Static strings known to every peer of the same build: content ids, enum values and the keys of
 * common plain-data shapes. Anything missing still works (it is sent as a dynamic definition the
 * first time it is used); this list only makes the common case 1–2 bytes.
 *
 * IMPORTANT: both peers must build the identical list (same code + content). `Hello` carries the
 * table hash so mismatched builds are rejected instead of silently decoding garbage.
 */
const FIXED: readonly string[] = [
  // Entity kinds / teams
  'player', 'enemy', 'boss', 'projectile', 'pickup', 'resource', 'npc', 'prop', 'companion', 'effect', 'neutral',
  // Animation hints (render/ai workstreams may add more; they become dynamic strings)
  'idle', 'run', 'walk', 'jump', 'fall', 'climb', 'swim', 'attack', 'hurt', 'dead', 'downed', 'fly', 'windup',
  'charge', 'dash', 'crawl', 'cast', 'shoot', 'throw', 'land', 'stun', 'sleep', 'alert', 'flee',
  // Status / damage types
  'burn', 'poison', 'freeze', 'slow', 'bleed', 'regen', 'haste', 'shield', 'weak',
  'physical', 'fire', 'ice', 'magic', 'lightning',
  // GameEvent types and keys
  'type', 'sfx', 'particles', 'damage', 'heal', 'death', 'shake', 'hitstop', 'craft', 'levelUp', 'revived',
  'message', 'tileBroken', 'resourceHit', 'levelEnter', 'bossPhase', 'runOver',
  'id', 'x', 'y', 'volume', 'pitch', 'preset', 'count', 'color', 'dirX', 'dirY', 'target', 'amount', 'crit',
  'damageType', 'toPlayer', 'entity', 'kind', 'def', 'ticks', 'item', 'a', 'b', 'result', 'discovered',
  'level', 'text', 'tx', 'ty', 'tile', 'broken', 'district', 'biome', 'name', 'isTown', 'isBoss', 'phase', 'victory',
  // Common sfx / particle presets
  'swing', 'hit', 'player_hurt', 'coin', 'chop', 'mine', 'clink', 'craft_fail', 'airjump', 'wood_chips', 'rock_chips',
  // PlayerCommand
  'swap', 'drop', 'use', 'equip', 'unequip', 'chooseSkill', 'buy', 'sell', 'sort', 'from', 'to', 'slot', 'index',
  'inv', 'path', 'npc',
  // PlayerState / ItemStack / stats keys
  'entityId', 'race', 'hat', 'traits', 'base', 'stats', 'mods', 'specials', 'mana', 'hunger', 'stamina', 'xp',
  'xpToNext', 'skillPicks', 'skillOffer', 'skills', 'skillSlots', 'skillCooldowns', 'gold', 'inventory',
  'equipment', 'selected', 'useCooldown', 'reviveProgress', 'out', 'ctl', 'prev', 'knownRecipes', 'runStats',
  'craftPick', 'durability', 'hp', 'atk', 'dex', 'mag', 'lck', 'maxHp', 'maxMana', 'maxHunger', 'maxStamina',
  'head', 'body', 'accessory1', 'accessory2', 'ammo', 'trinket', 'equip',
  'moveSpeed', 'attackSpeed', 'critChance', 'lifeSteal', 'manaRegen', 'hungerRate', 'luck', 'airJumps',
  'lightRadius', 'goldFind', 'resist',
  // RunStats
  'kills', 'bossKills', 'damageDealt', 'damageTaken', 'itemsCrafted', 'recipesDiscovered', 'treesChopped',
  'oresMined', 'bugsCaught', 'plantsHarvested', 'goldEarned', 'deaths', 'revives', 'districtsCleared', 'ticksPlayed',
  // Level / run
  'seed', 'nextBiomes', 'normal', 'town', 'lair', 'info', 'spawn', 'exits', 'locked', 'arena', 'lights', 'w', 'h',
  'radius', 'intensity', 'over', 'exited', 'run', 'difficulty', 'madcap', 'companionId',
];

let cached: readonly string[] | null = null;

/** The ordered static string list (fixed strings + every content id). */
export function staticStrings(): readonly string[] {
  if (cached) return cached;
  const out: string[] = [...FIXED];
  const maps = [
    Content.items, Content.enemies, Content.bosses, Content.resources, Content.projectiles, Content.npcs,
    Content.biomes, Content.races, Content.hats, Content.companions, Content.skills, Content.traits,
  ] as const;
  for (const m of maps) for (const id of m.keys()) out.push(id);
  for (const r of Content.recipeList) out.push(r.result);
  cached = out;
  return out;
}

/** A fresh table seeded with the static strings (one per session: dynamic ids are per host). */
export function createStringTable(): StringTable {
  return new StringTable(staticStrings());
}
