import type { CompanionDef } from './types';

/**
 * Hovering companions (GDD §10). Behaviour by `role` lives in src/sim/progression/companions.ts;
 * `power` means: attack = damage per zap, light = light radius px, collect = pull radius px,
 * heal = HP per pulse, shield = shield strength. `mods` are passive bonuses while it is with you.
 */
export const COMPANIONS: CompanionDef[] = [
  {
    id: 'mend_sprite', name: 'Mend Sprite', sprite: 'companion_mend_sprite', role: 'heal', power: 1, unlock: 'unlock_mend_sprite',
    description: 'A soft green glimmer. Restores 1 HP every 30 seconds.',
  },
  {
    id: 'ember_bat', name: 'Ember Bat', sprite: 'companion_ember_bat', role: 'attack', power: 2, unlock: 'unlock_ember_bat',
    description: 'A smouldering little bat that zaps nearby enemies.',
  },
  {
    id: 'lantern_wisp', name: 'Lantern Wisp', sprite: 'companion_lantern_wisp', role: 'light', power: 104, unlock: 'unlock_lantern_wisp',
    description: 'A bright wisp that lights up the dark and glints near hidden chests.',
  },
  {
    id: 'haste_beetle', name: 'Haste Beetle', sprite: 'companion_haste_beetle', role: 'collect', power: 56, unlock: 'unlock_haste_beetle',
    description: 'You move 15% faster. It scurries off to fetch nearby drops.', mods: { moveSpeed: 0.15 },
  },
  {
    id: 'floaty_slime', name: 'Floaty Slime', sprite: 'companion_floaty_slime', role: 'collect', power: 40, unlock: 'unlock_floaty_slime',
    description: 'A buoyant blob. +1 air jump; slurps up nearby drops.', mods: { airJumps: 1 },
  },
  {
    id: 'gizmo_drone', name: 'Gizmo Drone', sprite: 'companion_gizmo_drone', role: 'shield', power: 1, unlock: 'unlock_gizmo_drone',
    description: 'A clockwork drone that projects a shield every 20 seconds.',
  },
];
