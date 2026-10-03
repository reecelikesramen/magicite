import type { UnlockDef } from './types';

/** One extra requirement on top of the main `condition` (same scope). */
export interface UnlockCheck {
  stat: string;
  atLeast?: number;
  atMost?: number;
}

/**
 * Meta-progression unlock rule, evaluated at the end of every run (GDD §3/§10) by
 * `evaluateUnlocks` in src/game/meta.ts. Content points at these ids via RaceDef.unlock,
 * HatDef.unlock and CompanionDef.unlock.
 *
 * Stats a condition can read (`scope: 'run'` = this run's summary, `'lifetime'` = totals over all
 * runs including this one):
 *  - every RunStats key (kills, bossKills, oresMined, plantsHarvested, treesChopped, bugsCaught,
 *    recipesDiscovered, itemsCrafted, goldEarned, damageTaken, revives, districtsCleared, …)
 *  - progression extras: skillsLearned, warriorSkills, mageSkills, rangerSkills, xpEarned
 *  - outcome: level (highest reached), district (deepest reached), victory (0/1), madcap (0/1),
 *    minutes (run length), runs (lifetime only: number of runs), wins (lifetime only)
 */
export interface UnlockRule extends UnlockDef {
  scope: 'run' | 'lifetime';
  /** 0..1 chance rolled once per run end while the condition holds (1 = guaranteed). */
  chance: number;
  also?: UnlockCheck[];
}

const run = (id: string, name: string, description: string, stat: string, atLeast: number, chance: number, also?: UnlockCheck[]): UnlockRule => ({
  id, name, description, condition: { stat, atLeast }, scope: 'run', chance, ...(also ? { also } : {}),
});
const life = (id: string, name: string, description: string, stat: string, atLeast: number, chance: number): UnlockRule => ({
  id, name, description, condition: { stat, atLeast }, scope: 'lifetime', chance,
});

export const UNLOCKS: UnlockRule[] = [
  // --- Races ------------------------------------------------------------------------------------
  run('unlock_highborn', 'Highborn', '20% chance after a run with 15+ kills.', 'kills', 15, 0.2),
  run('unlock_cyclorc', 'Cyclorc', '20% chance after mining 20+ ore in one run.', 'oresMined', 20, 0.2),
  run('unlock_stoutling', 'Stoutling', '20% chance after learning your first skill.', 'skillsLearned', 1, 0.2),
  run('unlock_templar', 'Templar', '5% chance after reaching level 10.', 'level', 10, 0.05),
  run('unlock_wraithkin', 'Wraithkin', 'Destroy the Blightwall.', 'victory', 1, 1),
  run('unlock_mosskin', 'Mosskin', '20% chance after reaching district 10.', 'district', 10, 0.2),
  life('unlock_boarfolk', 'Boarfolk', 'Guaranteed after 5 runs.', 'runs', 5, 1),
  run('unlock_saurian', 'Saurian', '25% chance after slaying 3 giant monsters in one run.', 'bossKills', 3, 0.25),
  run('unlock_ifrit', 'Ifrit', '20% chance after reaching district 15.', 'district', 15, 0.2),
  // --- Hats -------------------------------------------------------------------------------------
  run('unlock_forager_band', 'Forager Band', '20% chance after harvesting 10+ plants in one run.', 'plantsHarvested', 10, 0.2),
  run('unlock_miner_lamp', 'Miner Lamp', '20% chance after mining 10+ ore in one run.', 'oresMined', 10, 0.2),
  run('unlock_berserker_scarf', 'Berserker Scarf', '50% chance after a run with 30+ kills.', 'kills', 30, 0.5),
  run('unlock_ranger_cap', 'Ranger Cap', '50% chance after learning 2 ranger skills in one run.', 'rangerSkills', 2, 0.5),
  run('unlock_wizard_hat', 'Wizard Hat', '50% chance after learning 2 mage skills in one run.', 'mageSkills', 2, 0.5),
  life('unlock_bunny_ears', 'Bunny Ears', '30% chance once you have cleared 25 districts in total.', 'districtsCleared', 25, 0.3),
  run('unlock_bat_wings', 'Bat Wings', '20% chance after catching 5+ bugs in one run.', 'bugsCaught', 5, 0.2),
  run('unlock_tiki_mask', 'Tiki Mask', '20% chance after taking 40+ damage in one run.', 'damageTaken', 40, 0.2),
  life('unlock_skull_mask', 'Skull Mask', 'Guaranteed after 300 kills in total.', 'kills', 300, 1),
  run('unlock_gilded_crown', 'Gilded Crown', '25% chance after earning 500+ gold in one run.', 'goldEarned', 500, 0.25),
  run('unlock_shroom_cap', 'Shroom Cap', '20% chance after discovering 15+ recipes in one run.', 'recipesDiscovered', 15, 0.2),
  run('unlock_dragon_mask', 'Dragon Mask', '30% chance after slaying 4 giant monsters in one run.', 'bossKills', 4, 0.3),
  // --- Companions -------------------------------------------------------------------------------
  run('unlock_mend_sprite', 'Mend Sprite', 'Reach district 15.', 'district', 15, 1),
  run('unlock_ember_bat', 'Ember Bat', 'Destroy the Blightwall.', 'victory', 1, 1),
  run('unlock_lantern_wisp', 'Lantern Wisp', '25% chance after reaching district 6.', 'district', 6, 0.25),
  run('unlock_haste_beetle', 'Haste Beetle', 'Reach level 20 in one run.', 'level', 20, 1),
  run('unlock_floaty_slime', 'Floaty Slime', 'Win without chopping a single tree.', 'victory', 1, 1, [{ stat: 'treesChopped', atMost: 0 }]),
  run('unlock_gizmo_drone', 'Gizmo Drone', 'Win on Madcap difficulty.', 'victory', 1, 1, [{ stat: 'madcap', atLeast: 1 }]),
];
