import type { SkillDef, SkillPathDef } from './types';

/** The three skill paths offered at levels 5/10/15/20/25 (one skill from each). */
export const SKILL_PATHS: SkillPathDef[] = [
  { id: 'warrior', name: 'Warrior', color: 0xd04040, icon: 'path_warrior', description: 'Close-quarters might. Scales with ATK.' },
  { id: 'mage', name: 'Mage', color: 0x4070e0, icon: 'path_mage', description: 'Arcane and elemental spells. Scales with MAG.' },
  { id: 'ranger', name: 'Ranger', color: 0x40b040, icon: 'path_ranger', description: 'Arrows, traps and tricks. Scales with DEX.' },
];

/**
 * Active skills (Z/X/C). `power` is per rank (index = rank-1); its meaning depends on the effect and
 * is documented on each entry. Damage values add the path stat (ATK / MAG / DEX) at cast time.
 * Implementations: src/sim/progression/skills.ts.
 */
export const SKILLS: SkillDef[] = [
  // --- Warrior (red, ATK) -----------------------------------------------------------------------
  {
    id: 'whirlwind', name: 'Whirlwind', path: 'warrior', icon: 'skill_whirlwind', effect: 'whirlwind',
    description: 'Spin your weapon, striking everything around you several times.',
    cooldown: 7, staminaCost: 1, power: [1, 2, 3], // damage per hit (+ATK)
  },
  {
    id: 'ground_slam', name: 'Ground Slam', path: 'warrior', icon: 'skill_ground_slam', effect: 'ground_slam',
    description: 'Slam into the ground: damages and stuns nearby foes. In mid-air you dive first.',
    cooldown: 8, staminaCost: 1, power: [2, 4, 6], // damage (+ATK)
  },
  {
    id: 'war_cry', name: 'War Cry', path: 'warrior', icon: 'skill_war_cry', effect: 'war_cry',
    description: 'A rallying roar. Nearby allies gain haste; nearby enemies are weakened.',
    cooldown: 20, power: [4, 6, 8], // duration in seconds
  },
  {
    id: 'charge', name: 'Charge', path: 'warrior', icon: 'skill_charge', effect: 'charge',
    description: 'Rush forward, bowling through enemies. Invulnerable while charging.',
    cooldown: 6, staminaCost: 1, power: [2, 3, 5], // damage (+ATK)
    mods: { moveSpeed: 0.03 },
  },
  {
    id: 'iron_skin', name: 'Iron Skin', path: 'warrior', icon: 'skill_iron_skin', effect: 'iron_skin',
    description: 'Harden your skin to absorb the next hit. Passive: +1 max HP per rank.',
    cooldown: 24, power: [6, 8, 10], // shield duration in seconds
    mods: { maxHp: 1 },
  },
  {
    id: 'cleave', name: 'Cleave', path: 'warrior', icon: 'skill_cleave', effect: 'cleave',
    description: 'A heavy overhead cleave that hits everything in front of you and makes it bleed.',
    cooldown: 4, staminaCost: 1, power: [2, 4, 6], // damage (+2xATK)
  },
  // --- Mage (blue, MAG) -------------------------------------------------------------------------
  {
    id: 'fire_burst', name: 'Fire Burst', path: 'mage', icon: 'skill_fire_burst', effect: 'fire_burst',
    description: 'Release a ring of fireballs in every direction.',
    cooldown: 6, manaCost: 2, power: [1, 2, 3], // damage per fireball (+MAG); 6/8/10 fireballs
  },
  {
    id: 'frost_nova', name: 'Frost Nova', path: 'mage', icon: 'skill_frost_nova', effect: 'frost_nova',
    description: 'A burst of frost that damages and freezes nearby enemies.',
    cooldown: 10, manaCost: 2, power: [1, 2, 3], // damage (+MAG/2); freeze 1.5/2/2.5 s
  },
  {
    id: 'chain_lightning', name: 'Chain Lightning', path: 'mage', icon: 'skill_chain_lightning', effect: 'chain_lightning',
    description: 'Lightning strikes the enemy nearest the cursor and leaps to others.',
    cooldown: 5, manaCost: 2, power: [2, 3, 4], // damage (+MAG); 3/4/5 targets
  },
  {
    id: 'blink', name: 'Blink', path: 'mage', icon: 'skill_blink', effect: 'blink',
    description: 'Teleport a short distance toward the cursor.',
    cooldown: 4, manaCost: 1, power: [40, 56, 72], // max distance in px
  },
  {
    id: 'arcane_ward', name: 'Arcane Ward', path: 'mage', icon: 'skill_arcane_ward', effect: 'arcane_ward',
    description: 'A shimmering ward absorbs the next hit. Passive: +1 max mana per rank.',
    cooldown: 20, manaCost: 2, power: [8, 10, 12], // shield duration in seconds
    mods: { maxMana: 1 },
  },
  {
    id: 'meteor', name: 'Meteor', path: 'mage', icon: 'skill_meteor', effect: 'meteor',
    description: 'Call down a blazing meteor on the cursor. Huge damage in an area; sets foes alight.',
    cooldown: 12, manaCost: 4, power: [4, 7, 10], // damage (+2xMAG)
  },
  // --- Ranger (green, DEX) ----------------------------------------------------------------------
  {
    id: 'multishot', name: 'Multishot', path: 'ranger', icon: 'skill_multishot', effect: 'multishot',
    description: 'Loose a fan of arrows toward the cursor. Needs no ammo.',
    cooldown: 4, staminaCost: 1, power: [1, 2, 3], // damage per arrow (+DEX); 3/4/5 arrows
  },
  {
    id: 'arrow_rain', name: 'Arrow Rain', path: 'ranger', icon: 'skill_arrow_rain', effect: 'arrow_rain',
    description: 'Arrows rain down around the cursor.',
    cooldown: 10, staminaCost: 1, power: [1, 2, 3], // damage per arrow (+DEX); 8/11/14 arrows
  },
  {
    id: 'bear_trap', name: 'Bear Trap', path: 'ranger', icon: 'skill_bear_trap', effect: 'bear_trap',
    description: 'Set a trap at your feet. The first enemy to step in is hurt and held fast.',
    cooldown: 6, power: [3, 5, 7], // damage (+DEX); hold 2/2.5/3 s
  },
  {
    id: 'smoke_bomb', name: 'Smoke Bomb', path: 'ranger', icon: 'skill_smoke_bomb', effect: 'smoke_bomb',
    description: 'Vanish in smoke: nearby enemies are dazed and slowed while you slip away quickly.',
    cooldown: 14, power: [2, 3, 4], // duration in seconds
  },
  {
    id: 'hawk', name: 'Hawk', path: 'ranger', icon: 'skill_hawk', effect: 'hawk',
    description: 'Release a hawk that dives at nearby enemies before flying off.',
    cooldown: 12, power: [2, 3, 4], // damage per strike (+DEX); 3/4/5 strikes
  },
  {
    id: 'volley_step', name: 'Volley Step', path: 'ranger', icon: 'skill_volley_step', effect: 'volley_step',
    description: 'Leap away from the cursor while loosing arrows at it.',
    cooldown: 5, staminaCost: 1, power: [1, 2, 3], // damage per arrow (+DEX); 2/3/4 arrows
  },
];

/** Skills are offered at these levels (GDD §5). */
export const SKILL_LEVELS: readonly number[] = [5, 10, 15, 20, 25];

/** Max number of slotted active skills (Z / X / C). */
export const MAX_SKILL_SLOTS = 3;
