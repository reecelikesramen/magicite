import type { EquipSlot, StatMods, StatusId } from '../content/types';

/**
 * Simulation state is plain data: no class instances (except TileGrid typed arrays), no closures.
 * That keeps it snapshot-able for co-op netcode (rollback/lockstep) and save files.
 */

export type EntityKind =
  | 'player'
  | 'enemy'
  | 'boss'
  | 'projectile'
  | 'pickup'
  | 'resource'
  | 'npc'
  | 'prop'
  | 'companion'
  | 'effect';

export type Team = 'player' | 'enemy' | 'neutral';

export interface ItemStack {
  id: string;
  count: number;
  /** Remaining durability for tools/weapons (undefined = unbreakable). */
  durability?: number;
}

export interface StatusEffect {
  id: StatusId;
  /** Ticks remaining. */
  ticks: number;
  power: number;
  /** Entity id that applied it (for kill credit). */
  source: number;
}

/** Free-form AI scratch state. Keep values primitive so it stays serializable. */
export interface AiState {
  state: string;
  /** Ticks spent in current state. */
  t: number;
  /** Target entity id, 0 = none. */
  target: number;
  /** Boss phase index or behaviour sub-mode. */
  phase: number;
  /** Generic counters / remembered positions. */
  n: Record<string, number>;
}

export interface ProjectileComp {
  def: string;
  owner: number;
  team: Team;
  damage: number;
  /** Ticks remaining. */
  life: number;
  pierceLeft: number;
  bouncesLeft: number;
  /** Entity ids already hit (for pierce). */
  hit: number[];
  /** Item id this projectile came from (to credit stats / recover ammo). */
  sourceItem: string;
}

export interface PickupComp {
  item: ItemStack;
  /** Ticks before it can be collected (so drops pop out first). */
  delay: number;
  /** Gold pickups add to wallet instead of inventory. */
  gold: number;
}

export interface ResourceComp {
  def: string;
  /** Ticks since last hit, used for shake animation. */
  hitFlash: number;
}

export interface MeleeSwing {
  /** Ticks remaining in the active swing. */
  ticks: number;
  total: number;
  /** Aim angle in radians at swing start. */
  angle: number;
  /** Entity ids already hit by this swing. */
  hit: number[];
  item: string;
}

/** One purchasable shop line (see src/sim/items/shop.ts). */
export interface ShopEntry {
  item: string;
  /** Units left in stock (0 = sold out). */
  count: number;
  /** Gold per unit. */
  price: number;
}

/** Shop NPC state: stock rolled once per NPC from the level seed (deterministic on every peer). */
export interface ShopComp {
  stock: ShopEntry[];
  /** Shrine only: already prayed here this visit. */
  used?: boolean;
}

export interface LightComp {
  radius: number;
  color: number;
  intensity: number;
  /** Flicker amount 0..1. */
  flicker?: number;
}

export interface Entity {
  id: number;
  kind: EntityKind;
  /** Content def id (enemy/boss/resource/npc/prop/projectile def, or 'player'). */
  def: string;
  team: Team;
  /** Hitbox top-left in px. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Velocity px/s. */
  vx: number;
  vy: number;
  /** Position at the start of the tick (render interpolation). */
  px: number;
  py: number;
  facing: 1 | -1;
  onGround: boolean;
  /** Touching a wall on this side last move (-1 left, 1 right, 0 none). */
  wallDir: -1 | 0 | 1;
  hitCeiling: boolean;
  inLiquid: boolean;
  onLadder: boolean;
  /** 1 = normal gravity, 0 = floats. */
  gravityScale: number;
  /** Collides with solid tiles. */
  collides: boolean;
  /** Can stand on one-way platforms (false while dropping through). */
  usesPlatforms: boolean;
  hp: number;
  maxHp: number;
  /** Flat damage reduction. */
  armor: number;
  /** Ticks of invulnerability remaining. */
  invuln: number;
  /** Ticks remaining of hurt flash / stagger. */
  hurt: number;
  dead: boolean;
  /** Ticks alive. */
  age: number;
  /** Render hints. */
  anim: string;
  animT: number;
  status: StatusEffect[];
  /** Knockback resistance 0..1. */
  kbResist: number;
  ai?: AiState;
  /** Index into world.players for kind === 'player'. */
  playerIndex?: number;
  projectile?: ProjectileComp;
  pickup?: PickupComp;
  resource?: ResourceComp;
  swing?: MeleeSwing;
  light?: LightComp;
  /** Shop NPCs: stock and prices (items workstream). */
  shop?: ShopComp;
  /** Item id held/visible (players, armed enemies). */
  held?: string;
  /** Owner entity (companions, summons). */
  owner?: number;
}

/** Rolled at character creation (15 points; HP 4–6, others 2–4) and raised by level-ups. */
export interface BaseStats {
  hp: number;
  atk: number;
  dex: number;
  mag: number;
  lck: number;
}

export interface CoreStats {
  maxHp: number;
  maxMana: number;
  maxHunger: number;
  maxStamina: number;
  atk: number;
  dex: number;
  mag: number;
  lck: number;
  def: number;
}

/** Stats accumulated over a run; logged at death ("The game logs all of your stats"). */
export interface RunStats {
  kills: number;
  bossKills: number;
  damageDealt: number;
  damageTaken: number;
  itemsCrafted: number;
  recipesDiscovered: number;
  treesChopped: number;
  oresMined: number;
  bugsCaught: number;
  plantsHarvested: number;
  goldEarned: number;
  deaths: number;
  revives: number;
  districtsCleared: number;
  ticksPlayed: number;
  [extra: string]: number;
}

export interface PlayerState {
  index: number;
  entityId: number;
  name: string;
  race: string;
  hat: string;
  companion: string;
  traits: string[];
  /** Creation roll + level-up gains (before race/trait/gear mods). */
  base: BaseStats;
  /** Final stats after race + level + skills + equipment (recomputed by recalcStats). */
  stats: CoreStats;
  /** Aggregated StatMods from everything (multipliers, resistances, specials). */
  mods: StatMods;
  specials: string[];
  mana: number;
  hunger: number;
  stamina: number;
  level: number;
  xp: number;
  xpToNext: number;
  /** Pending skill choices (granted at levels 5/10/15/20/25). */
  skillPicks: number;
  /** The 3 skill ids currently offered (one per path), empty when none pending. */
  skillOffer: string[];
  /** Owned skills → rank (1..3). */
  skills: Record<string, number>;
  /** Up to 3 owned skill ids bound to Z/X/C. */
  skillSlots: string[];
  /** Ticks until each slotted skill is ready (parallel to skillSlots). */
  skillCooldowns: number[];
  gold: number;
  /** INVENTORY_SIZE slots; [0, HOTBAR_SIZE) is the hotbar. */
  inventory: (ItemStack | null)[];
  equipment: Record<EquipSlot, ItemStack | null>;
  selected: number;
  /** Ticks until the held item can be used again. */
  useCooldown: number;
  /** Downed (0 HP) but revivable while any teammate is alive. */
  downed: boolean;
  reviveProgress: number;
  /** Fully dead for the rest of the level (solo death or bled out). */
  out: boolean;
  /** Controller scratch (coyote, jump buffer, air jumps used, drop-through). */
  ctl: { coyote: number; jumpBuffer: number; airJumpsUsed: number; dropThrough: number; climbing: boolean; mineX: number; mineY: number; mineTicks: number };
  /** Previous-tick button states for edge detection. */
  prev: { jump: boolean; attack: boolean; interact: boolean; alt: boolean };
  knownRecipes: string[];
  runStats: RunStats;
  /** Pending crafting selection (first Shift+Click). */
  craftPick: number;
}

/** UI / meta actions routed through the sim so they are deterministic and network-syncable. */
export type PlayerCommand =
  | { type: 'swap'; from: SlotRef; to: SlotRef }
  | { type: 'craft'; a: number; b: number }
  | { type: 'drop'; slot: SlotRef; count: number }
  | { type: 'use'; slot: number }
  | { type: 'equip'; slot: number }
  | { type: 'unequip'; slot: EquipSlot }
  | { type: 'chooseSkill'; path: string }
  | { type: 'buy'; npc: number; index: number }
  | { type: 'sell'; slot: number; count: number }
  | { type: 'sort' }
  /** Split an inventory stack: half (rounded down) moves to the first empty slot. */
  | { type: 'split'; slot: number }
  /** Repair a worn item: at a nearby smith (gold) or by spending a repair_kit. */
  | { type: 'repair'; slot: SlotRef };

export type SlotRef = { kind: 'inv'; index: number } | { kind: 'equip'; slot: EquipSlot };

/** Per-player input for a single tick. Held states; edges are derived in the sim. */
export interface PlayerInput {
  /** -1..1 */
  moveX: number;
  /** -1 (up) .. 1 (down) */
  moveY: number;
  jump: boolean;
  /** Primary: use held item (attack / mine / chop / shoot). */
  attack: boolean;
  /** Secondary action (block / alt-fire). */
  alt: boolean;
  /** Interact: enter portal, talk, revive, open chest. */
  interact: boolean;
  /** Aim target in world px. */
  aimX: number;
  aimY: number;
  /** Hotbar slot to select this tick, -1 = no change. */
  select: number;
  /** Skill slot (0..2 = Z/X/C) to activate this tick, -1 = none. */
  skill: number;
  commands: PlayerCommand[];
}

export function emptyInput(): PlayerInput {
  return { moveX: 0, moveY: 0, jump: false, attack: false, alt: false, interact: false, aimX: 0, aimY: 0, select: -1, skill: -1, commands: [] };
}

/**
 * Presentation events emitted by the sim during a tick. Renderer/audio/UI consume them;
 * the sim never reads them back, so dropping them can't desync anything.
 */
export type GameEvent =
  | { type: 'sfx'; id: string; x: number; y: number; volume?: number; pitch?: number }
  | { type: 'particles'; preset: string; x: number; y: number; count?: number; color?: number; dirX?: number; dirY?: number }
  | { type: 'damage'; target: number; amount: number; x: number; y: number; crit: boolean; damageType: string; toPlayer: boolean }
  | { type: 'heal'; target: number; amount: number; x: number; y: number }
  | { type: 'death'; entity: number; kind: EntityKind; def: string; x: number; y: number }
  | { type: 'shake'; amount: number; ticks: number }
  | { type: 'hitstop'; ticks: number }
  | { type: 'pickup'; player: number; item: string; count: number }
  | { type: 'craft'; player: number; a: string; b: string; result: string | null; count: number; discovered: boolean }
  | { type: 'levelUp'; player: number; level: number }
  | { type: 'downed'; player: number }
  | { type: 'revived'; player: number }
  | { type: 'message'; text: string; color?: number; player?: number }
  | { type: 'tileBroken'; tx: number; ty: number; tile: number }
  | { type: 'resourceHit'; entity: number; def: string; broken: boolean }
  | { type: 'levelEnter'; district: number; biome: string; name: string; isTown: boolean; isBoss: boolean }
  | { type: 'bossPhase'; entity: number; phase: number }
  | { type: 'runOver'; victory: boolean };
