/**
 * Content definition contracts. Content is pure data (no functions) so it can be validated,
 * serialized, and hot-tuned. Behaviour lives in sim systems keyed by these ids.
 *
 * Every visual reference is a *sprite key* string resolved by `src/render/sprites`; a missing
 * key renders as a labelled placeholder, so content can land before art.
 */

export type ItemCategory =
  | 'material'
  | 'weapon'
  | 'tool'
  | 'armor'
  | 'accessory'
  | 'hat'
  | 'ammo'
  | 'consumable'
  | 'placeable'
  | 'key';

export type EquipSlot = 'head' | 'body' | 'accessory1' | 'accessory2' | 'ammo' | 'trinket';

/** How a held item behaves when the attack button is used. */
export type UseStyle =
  /** Arc swing in front of the player (swords, axes, hammers). */
  | 'swing'
  /** Forward stab with long reach (spears). */
  | 'thrust'
  /** Fires `projectile` toward the aim point, consuming `ammo` (bows, slings). */
  | 'shoot'
  /** Casts `projectile` toward the aim point, consuming mana (wands, staves, spellbooks). */
  | 'cast'
  /** Throws itself (bombs, throwing knives); consumes one. */
  | 'throw'
  /** Eat / drink / read: applies `effects` and consumes one. */
  | 'consume'
  /** Places a tile or prop (torch, platform). */
  | 'place'
  | 'none';

export type ToolKind = 'axe' | 'pickaxe' | 'net' | 'sickle' | 'hammer';

export type DamageType = 'physical' | 'fire' | 'ice' | 'poison' | 'magic' | 'lightning';

export type StatusId = 'burn' | 'poison' | 'freeze' | 'slow' | 'stun' | 'bleed' | 'regen' | 'haste' | 'shield' | 'weak';

export interface StatusApply {
  id: StatusId;
  /** Seconds. */
  duration: number;
  /** 0..1 chance to apply on hit. */
  chance: number;
  /** Optional strength (damage per tick-second, slow factor…). */
  power?: number;
}

/** Additive stat modifiers granted by equipment, hats, races, skills, companions, perks. */
export interface StatMods {
  maxHp?: number;
  maxMana?: number;
  maxHunger?: number;
  maxStamina?: number;
  atk?: number;
  dex?: number;
  mag?: number;
  lck?: number;
  def?: number;
  /** Multiplier deltas (0.1 = +10%). */
  moveSpeed?: number;
  jump?: number;
  attackSpeed?: number;
  critChance?: number;
  lifeSteal?: number;
  manaRegen?: number;
  hungerRate?: number;
  luck?: number;
  /** Extra air jumps. */
  airJumps?: number;
  lightRadius?: number;
  goldFind?: number;
  /** Damage resistances (0.25 = 25% less). */
  resist?: Partial<Record<DamageType, number>>;
}

export interface ConsumeEffect {
  heal?: number;
  mana?: number;
  food?: number;
  stamina?: number;
  status?: StatusApply[];
  /** Permanently grant stats (rare elixirs). */
  permanent?: StatMods;
  /** Reveal map, teleport to exit, etc. Handled by name in sim. */
  special?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  sprite: string;
  maxStack: number;
  /** Shop buy price in gold; sell price = floor(value/2). */
  value: number;
  /** 1..5, used for drop tables, shop tiers and colour accents. */
  tier: number;
  equipSlot?: EquipSlot;
  use?: UseStyle;
  /** Weapons/tools. */
  damage?: number;
  damageType?: DamageType;
  /** Seconds between uses. */
  cooldown?: number;
  /** Reach in px (melee) or projectile speed scale (ranged). */
  range?: number;
  knockback?: number;
  /** Mana per cast. */
  manaCost?: number;
  /** Projectile def id fired by shoot/cast/throw. */
  projectile?: string;
  /** Ammo item category id consumed by shoot (e.g. 'arrow'). */
  ammoType?: string;
  /** For ammo items: which ammoType they satisfy. */
  ammoKind?: string;
  tool?: ToolKind;
  /** Harvest power: must be >= resource/tile hardness. */
  toolPower?: number;
  onHit?: StatusApply[];
  /** Equipment / passive bonus while equipped (or while held for weapons). */
  mods?: StatMods;
  consume?: ConsumeEffect;
  /** Tile id placed by use:'place'. */
  places?: number;
  /** Prop id placed by use:'place'. */
  placesProp?: string;
  tags?: string[];
}

/** Unordered pair recipe: `a + b → result × count`. a/b may be item ids or `#tag` matches. */
export interface RecipeDef {
  a: string;
  b: string;
  result: string;
  count: number;
  /** Shown as a hint in the recipe book once discovered or hinted. */
  hint?: string;
  /** Requires a placed campfire nearby, or being in a town (forge). */
  station?: 'campfire' | 'forge';
}

export type AiBehavior =
  /** Patrols platforms, turns at edges/walls, attacks on contact. */
  | 'walker'
  /** Hops toward the player periodically (slimes, frogs). */
  | 'hopper'
  /** Flies with sinusoidal drift and swoops (bats, wisps). */
  | 'flyer'
  /** Keeps distance and fires projectiles (archers, totems). */
  | 'shooter'
  /** Telegraphs then dashes (boars, beetles). */
  | 'charger'
  /** Clings to ceilings and drops (spiders). */
  | 'dropper'
  /** Stationary turret / plant. */
  | 'turret'
  /** Burrows and pops up under the player. */
  | 'burrower'
  /** Harmless critter that flees (bugs to catch). */
  | 'critter'
  /** Custom multi-phase pattern implemented in src/sim/ai/bosses. */
  | 'boss';

export interface DropEntry {
  item: string;
  /** 0..1 */
  chance: number;
  min: number;
  max: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  behavior: AiBehavior;
  /** Hitbox in px. */
  w: number;
  h: number;
  hp: number;
  /** Contact / attack damage in hit points (player HP is small: 3–10). */
  damage: number;
  damageType?: DamageType;
  speed: number;
  /** Detection radius in px. */
  sight: number;
  def?: number;
  knockbackResist?: number;
  flying?: boolean;
  projectile?: string;
  /** Seconds between attacks. */
  attackCooldown?: number;
  onHit?: StatusApply[];
  xp: number;
  gold: [number, number];
  drops: DropEntry[];
  /** Biome ids this enemy appears in. */
  biomes: string[];
  /** Relative spawn weight within its biomes. */
  weight: number;
  /** Earliest district depth (1-based) it can spawn. */
  minDepth: number;
  /** Emits light (glowing eyes, fire). */
  light?: { radius: number; color: number };
  tags?: string[];
}

export interface BossDef extends Omit<EnemyDef, 'behavior' | 'weight' | 'minDepth'> {
  behavior: 'boss';
  /** Pattern implementation id in src/sim/ai/bosses. */
  pattern: string;
  /** Phase thresholds as fractions of max HP, e.g. [0.66, 0.33]. */
  phases: number[];
  /** Arena size in tiles. */
  arena: { w: number; h: number };
  title: string;
}

export interface ProjectileDef {
  id: string;
  sprite: string;
  /** px/s */
  speed: number;
  gravity: number;
  /** Hitbox px (square). */
  size: number;
  /** Seconds to live. */
  life: number;
  pierce: number;
  bounces?: number;
  damageType: DamageType;
  /** Leaves a particle trail preset. */
  trail?: string;
  light?: { radius: number; color: number };
  /** Breaks tiles it hits (bombs). */
  explode?: { radius: number; breaksTiles: boolean };
  /** Stick into walls and become a pickup (arrows). */
  recoverItem?: string;
  homing?: number;
}

/** Things you chop / mine / harvest / catch. Spawned as entities by level gen. */
export interface ResourceDef {
  id: string;
  name: string;
  sprite: string;
  /** Tool needed. 'hand' means anything (plants). */
  tool: ToolKind | 'hand';
  hardness: number;
  hp: number;
  w: number;
  h: number;
  drops: DropEntry[];
  biomes: string[];
  /** Placement: on ground surface, ceiling, wall, in air (bugs). */
  placement: 'ground' | 'ceiling' | 'air' | 'embedded';
  weight: number;
  minDepth: number;
  /** Renders behind entities (trees) vs in front. */
  background?: boolean;
  light?: { radius: number; color: number };
  /** For bug critters: moves around. */
  critter?: boolean;
}

export interface Palette {
  /** Back-wall / cave tones, darkest → lightest. */
  wall: number[];
  /** Ground body tones, darkest → lightest. */
  ground: number[];
  /** Exposed-top fringe (grass / snow / lava crust), darkest → lightest. */
  fringe: number[];
  /** Rock pocket tones. */
  rock: number[];
  /** Accent colours for props, plants, crystals. */
  accent: number[];
  /** Ambient light colour multiplied over the dark world. */
  ambient: number;
  /** 0..1 ambient brightness. Original game is very dark (~0.08–0.2). */
  ambientLevel: number;
  /** Distant background haze colour. */
  sky: number;
  /** Colour of the player's carried light. */
  playerLight: number;
}

export interface BiomeDef {
  id: string;
  /** e.g. "Mossgrave Woods" */
  name: string;
  palette: Palette;
  /** Level size range in tiles. */
  size: { w: [number, number]; h: [number, number] };
  /** Generation style knobs consumed by src/sim/gen. */
  gen: {
    /** 0..1 how open (cavernous) vs tunnel-like the level is. */
    openness: number;
    /** 0..1 vertical bias of the layout. */
    verticality: number;
    platformDensity: number;
    liquid: 'none' | 'water' | 'lava';
    liquidAmount: number;
    hazardDensity: number;
    specialTileDensity: number;
  };
  enemyDensity: number;
  resourceDensity: number;
  /** Ambient particles preset (fireflies, embers, snow, spores). */
  ambientParticles: string;
  music: string;
  /** Allowed district depths. */
  depths: number[];
  boss: string;
  /** Prop sprite keys scattered as decoration. */
  decor: string[];
}

export interface RaceDef {
  id: string;
  name: string;
  description: string;
  /** Stat modifiers on top of the rolled creation stats (e.g. { maxHp: 1 }, { atk: 2, maxHp: -1 }). */
  mods?: StatMods;
  /** Special behaviour flag handled in sim (e.g. 'burn_immune', 'eats_anything'). */
  special?: string;
  startItems: { item: string; count: number }[];
  sprite: string;
  /** Unlocked from the start? Otherwise needs an unlock id. */
  unlockedByDefault: boolean;
  unlock?: string;
}

export interface HatDef {
  id: string;
  name: string;
  description: string;
  sprite: string;
  mods?: StatMods;
  /** Special effect id handled in sim (e.g. 'double_gold', 'light_aura'). */
  special?: string;
  unlock: string;
}

export interface CompanionDef {
  id: string;
  name: string;
  description: string;
  sprite: string;
  /** What it does: 'attack' fights nearby enemies, 'light' glows, 'collect' grabs drops, 'heal'. */
  role: 'attack' | 'light' | 'collect' | 'heal' | 'shield';
  power: number;
  startItems?: { item: string; count: number }[];
  mods?: StatMods;
  unlock: string;
}

export type SkillPath = 'warrior' | 'mage' | 'ranger';

export interface SkillPathDef {
  id: SkillPath;
  name: string;
  /** UI colour (red / blue / green in the original). */
  color: number;
  icon: string;
  description: string;
}

/** Active skills bound to Z/X/C. Offered 1-of-3 (one per path) at levels 5/10/15/20/25. */
export interface SkillDef {
  id: string;
  name: string;
  path: SkillPath;
  description: string;
  icon: string;
  /** Seconds. Cooldowns reset on entering a new district. */
  cooldown: number;
  manaCost?: number;
  staminaCost?: number;
  /** Implementation id in src/sim/progression/skills (usually same as id). */
  effect: string;
  /** Power per rank (damage, duration, radius… meaning depends on effect). Length = max rank. */
  power: number[];
  /** Passive bonus while owned (per rank: multiplied by rank). */
  mods?: StatMods;
}

export interface TraitDef {
  id: string;
  name: string;
  description: string;
  mods?: StatMods;
  special?: string;
}

export interface UnlockDef {
  id: string;
  name: string;
  description: string;
  /** Condition evaluated against lifetime stats, e.g. { stat: 'kills', atLeast: 100 }. */
  condition: { stat: string; atLeast: number };
}

export interface NpcDef {
  id: string;
  name: string;
  sprite: string;
  role: 'shop' | 'smith' | 'healer' | 'quest' | 'flavor';
  dialogue: string[];
  /** For shops: item ids sold. */
  stock?: string[];
}
