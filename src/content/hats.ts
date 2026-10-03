import type { HatDef } from './types';

/**
 * Unlockable hats (GDD §10): a small stat mod plus one special effect, handled by name in the sim:
 *  - `forager`      +1 drop from plants and bugs (items/combat harvest)
 *  - `miner`        mine tiles and ore 30% faster (combat/use)
 *  - `berserk`      +50% melee damage while at 1 HP (combat/damage)
 *  - `arrow_saver`  25% chance not to consume ammo (combat/use)
 *  - `mana_refund`  25% chance a spell costs no mana (combat/use)
 *  - `triple_jump`  flavour flag; the extra jump itself comes from mods.airJumps
 *  - `slow_fall`    holding jump while falling halves fall speed (player controller)
 *  - `thorns`       attackers touching you take 1 damage (combat/contact)
 *  - `life_steal`   flavour flag; healing comes from mods.lifeSteal (combat/damage)
 *  - `double_gold`  gold pickups are worth double (items/pickups)
 *  - `shroom_heal`  glowcaps and mushrooms heal +1 HP (items/use)
 *  - `burn_immune`  ignores the burn status (combat/status)
 */
export const HATS: HatDef[] = [
  {
    id: 'forager_band', name: 'Forager Band', sprite: 'hat_forager_band', unlock: 'unlock_forager_band',
    description: 'A woven headband. +2 max hunger; plants and bugs yield extra.', mods: { maxHunger: 2 }, special: 'forager',
  },
  {
    id: 'miner_lamp', name: 'Miner Lamp', sprite: 'hat_miner_lamp', unlock: 'unlock_miner_lamp',
    description: 'A brass lamp cap. Brighter light; mine faster.', mods: { lightRadius: 0.5 }, special: 'miner',
  },
  {
    id: 'berserker_scarf', name: 'Berserker Scarf', sprite: 'hat_berserker_scarf', unlock: 'unlock_berserker_scarf',
    description: '+1 ATK. Melee hits much harder at 1 HP.', mods: { atk: 1 }, special: 'berserk',
  },
  {
    id: 'ranger_cap', name: 'Ranger Cap', sprite: 'hat_ranger_cap', unlock: 'unlock_ranger_cap',
    description: '+1 DEX. Sometimes an arrow is not used up.', mods: { dex: 1 }, special: 'arrow_saver',
  },
  {
    id: 'wizard_hat', name: 'Wizard Hat', sprite: 'hat_wizard_hat', unlock: 'unlock_wizard_hat',
    description: '+1 MAG, +1 max mana. Spells sometimes cost nothing.', mods: { mag: 1, maxMana: 1 }, special: 'mana_refund',
  },
  {
    id: 'bunny_ears', name: 'Bunny Ears', sprite: 'hat_bunny_ears', unlock: 'unlock_bunny_ears',
    description: 'An extra jump in mid-air.', mods: { airJumps: 1 }, special: 'triple_jump',
  },
  {
    id: 'bat_wings', name: 'Bat Wings', sprite: 'hat_bat_wings', unlock: 'unlock_bat_wings',
    description: '+1 stamina. Hold jump to glide down slowly.', mods: { maxStamina: 1 }, special: 'slow_fall',
  },
  {
    id: 'tiki_mask', name: 'Tiki Mask', sprite: 'hat_tiki_mask', unlock: 'unlock_tiki_mask',
    description: '+1 HP. Enemies that touch you get hurt.', mods: { maxHp: 1 }, special: 'thorns',
  },
  {
    id: 'skull_mask', name: 'Skull Mask', sprite: 'hat_skull_mask', unlock: 'unlock_skull_mask',
    description: 'Melee hits sometimes heal you.', mods: { lifeSteal: 0.1 }, special: 'life_steal',
  },
  {
    id: 'gilded_crown', name: 'Gilded Crown', sprite: 'hat_gilded_crown', unlock: 'unlock_gilded_crown',
    description: '+2 LCK. Gold is worth double.', mods: { lck: 2, goldFind: 1 }, special: 'double_gold',
  },
  {
    id: 'shroom_cap', name: 'Shroom Cap', sprite: 'hat_shroom_cap', unlock: 'unlock_shroom_cap',
    description: '+1 HP. Mushrooms heal you.', mods: { maxHp: 1 }, special: 'shroom_heal',
  },
  {
    id: 'dragon_mask', name: 'Dragon Mask', sprite: 'hat_dragon_mask', unlock: 'unlock_dragon_mask',
    description: 'Half fire damage; never burn.', mods: { resist: { fire: 0.5 } }, special: 'burn_immune',
  },
];
