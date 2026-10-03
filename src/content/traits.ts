import type { TraitDef } from './types';

/**
 * Character traits (pick 2 at creation, GDD §3/§10). Small side-grades; `special` flags are handled
 * by name in the sim:
 *  - `gatherer` 50% chance of +1 drop when chopping / mining / harvesting (combat/items workstream)
 *  - `artisan`  better quality rolls on crafted gear (items workstream)
 *  - `bookworm` +25% XP (src/sim/progression/xp.ts)
 */
export const TRAITS: TraitDef[] = [
  { id: 'aggressive', name: 'Aggressive', description: '+2 ATK, -1 DEX.', mods: { atk: 2, dex: -1 } },
  { id: 'defensive', name: 'Defensive', description: '+1 DEF, +1 HP, -1 ATK.', mods: { def: 1, maxHp: 1, atk: -1 } },
  { id: 'healthy', name: 'Healthy', description: '+2 HP.', mods: { maxHp: 2 } },
  { id: 'swift', name: 'Swift', description: 'Move 12% faster.', mods: { moveSpeed: 0.12 } },
  { id: 'gatherer', name: 'Gatherer', description: 'Chance of extra wood, ore and herbs.', special: 'gatherer' },
  { id: 'artisan', name: 'Artisan', description: 'Crafted gear rolls better quality. +1 LCK.', mods: { lck: 1 }, special: 'artisan' },
  { id: 'glutton', name: 'Glutton', description: '+4 max hunger, but you get hungry faster.', mods: { maxHunger: 4, hungerRate: 0.25 } },
  { id: 'lucky', name: 'Lucky', description: '+2 LCK.', mods: { lck: 2 } },
  { id: 'bookworm', name: 'Bookworm', description: 'Gain 25% more experience.', special: 'bookworm' },
  { id: 'nimble', name: 'Nimble', description: '+1 stamina, jump a little higher.', mods: { maxStamina: 1, jump: 0.08 } },
];
