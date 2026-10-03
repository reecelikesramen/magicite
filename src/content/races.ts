import type { RaceDef } from './types';

/**
 * Playable races (GDD §10). Mods stack on top of the rolled creation stats; `special` flags are
 * handled by name in the sim:
 *  - `wealthy`       start the run with RACE_START_GOLD gold (src/sim/progression/runstart.ts)
 *  - `herb_heal`     herbs heal +1 HP when eaten (items workstream)
 *  - `eats_anything` any material can be eaten for +1 food; food restores +1 extra (items workstream)
 *  - `burn_immune`   ignores the burn status (combat status workstream)
 */
export const RACES: RaceDef[] = [
  {
    id: 'drifter', name: 'Drifter', sprite: 'player_drifter', unlockedByDefault: true,
    description: 'Hardy wanderers of the Undervault. +1 HP.',
    mods: { maxHp: 1 },
    startItems: [{ item: 'wooden_axe', count: 1 }, { item: 'raw_meat', count: 2 }],
  },
  {
    id: 'highborn', name: 'Highborn', sprite: 'player_highborn', unlockedByDefault: false, unlock: 'unlock_highborn',
    description: 'Heirs of the drowned surface courts. +2 LCK, starts with 30 gold.',
    mods: { lck: 2 },
    special: 'wealthy',
    startItems: [{ item: 'wooden_axe', count: 1 }, { item: 'raw_meat', count: 1 }],
  },
  {
    id: 'cyclorc', name: 'Cyclorc', sprite: 'player_cyclorc', unlockedByDefault: false, unlock: 'unlock_cyclorc',
    description: 'One-eyed brutes from the deep quarries. +2 ATK, -1 HP.',
    mods: { atk: 2, maxHp: -1 },
    startItems: [{ item: 'wooden_axe', count: 1 }, { item: 'raw_meat', count: 2 }],
  },
  {
    id: 'stoutling', name: 'Stoutling', sprite: 'player_stoutling', unlockedByDefault: false, unlock: 'unlock_stoutling',
    description: 'Small, quick and sure-footed. +4 DEX, -1 HP.',
    mods: { dex: 4, maxHp: -1 },
    startItems: [{ item: 'wooden_axe', count: 1 }, { item: 'raw_meat', count: 2 }],
  },
  {
    id: 'templar', name: 'Templar', sprite: 'player_templar', unlockedByDefault: false, unlock: 'unlock_templar',
    description: 'Oath-bound wardens of the vault gates. +1 ATK, +1 DEF, starts with a buckler.',
    mods: { atk: 1, def: 1 },
    startItems: [{ item: 'wooden_axe', count: 1 }, { item: 'buckler', count: 1 }, { item: 'raw_meat', count: 1 }],
  },
  {
    id: 'wraithkin', name: 'Wraithkin', sprite: 'player_wraithkin', unlockedByDefault: false, unlock: 'unlock_wraithkin',
    description: 'Touched by the Blight and lived. +4 MAG, -1 HP, starts with a spark wand.',
    mods: { mag: 4, maxHp: -1 },
    startItems: [{ item: 'wooden_axe', count: 1 }, { item: 'spark_wand', count: 1 }],
  },
  {
    id: 'mosskin', name: 'Mosskin', sprite: 'player_mosskin', unlockedByDefault: false, unlock: 'unlock_mosskin',
    description: 'Grown, not born, in the root caves. +1 ATK, +1 MAG; herbs heal.',
    mods: { atk: 1, mag: 1 },
    special: 'herb_heal',
    startItems: [{ item: 'wooden_axe', count: 1 }, { item: 'raw_meat', count: 2 }],
  },
  {
    id: 'boarfolk', name: 'Boarfolk', sprite: 'player_boarfolk', unlockedByDefault: false, unlock: 'unlock_boarfolk',
    description: 'Always hungry, never picky. -1 to every stat, no axe; eats anything.',
    mods: { maxHp: -1, atk: -1, dex: -1, mag: -1, lck: -1 },
    special: 'eats_anything',
    startItems: [{ item: 'raw_meat', count: 3 }],
  },
  {
    id: 'saurian', name: 'Saurian', sprite: 'player_saurian', unlockedByDefault: false, unlock: 'unlock_saurian',
    description: 'Scaled hunters of the warm fens. +1 ATK, +3 DEX, +1 MAG, starts with a jade blade.',
    mods: { atk: 1, dex: 3, mag: 1 },
    startItems: [{ item: 'wooden_axe', count: 1 }, { item: 'jade_blade', count: 1 }],
  },
  {
    id: 'ifrit', name: 'Ifrit', sprite: 'player_ifrit', unlockedByDefault: false, unlock: 'unlock_ifrit',
    description: 'Living cinders from the magma vents. +3 MAG, immune to burning, starts with a fire wand.',
    mods: { mag: 3, resist: { fire: 0.25 } },
    special: 'burn_immune',
    startItems: [{ item: 'wooden_axe', count: 1 }, { item: 'fire_wand', count: 1 }],
  },
];

/** Gold granted at run start by the `wealthy` race special. */
export const RACE_START_GOLD = 30;
