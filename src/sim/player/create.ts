import { Content } from '../../content';
import { INVENTORY_SIZE } from '../constants';
import { addItem } from '../items/inventory';
import { recalcStats } from '../items/stats';
import { creationStats, DEFAULT_BIAS, inferBias, validBias } from '../progression/creation';
import type { Entity, PlayerCtl, PlayerState, RunStats } from '../types';
import type { PlayerSetup, World } from '../world';

/** Player hitbox in px (sprite is ~8x12; hitbox is slightly narrower for forgiving platforming). */
export const PLAYER_W = 6;
export const PLAYER_H = 11;

export function emptyRunStats(): RunStats {
  return {
    kills: 0, bossKills: 0, damageDealt: 0, damageTaken: 0, itemsCrafted: 0, recipesDiscovered: 0,
    treesChopped: 0, oresMined: 0, bugsCaught: 0, plantsHarvested: 0, goldEarned: 0, deaths: 0,
    revives: 0, districtsCleared: 0, ticksPlayed: 0,
  };
}

/** Fresh controller/meter scratch for a new player. */
export function createCtl(): PlayerCtl {
  return {
    coyote: 0, jumpBuffer: 0, airJumpsUsed: 0, dropThrough: 0, climbing: false, mineX: -1, mineY: -1, mineTicks: 0,
    jumping: false, dashT: 0, dashDir: 0, dashAir: false, dashCd: 0, dashBuf: 0, diving: false, airT: 0, fallPeak: 0,
    safeX: 0, safeY: 0, staminaT: 0, manaT: 0, hungerT: 0, starveT: 0, downedT: 0, levelKey: 0,
  };
}

/** Cancel transient movement state (dash, climb, dive, buffers) — on downed, revive and level entry. */
export function resetMotion(p: PlayerState, e: Entity): void {
  const c = p.ctl;
  c.coyote = 0;
  c.jumpBuffer = 0;
  c.airJumpsUsed = 0;
  c.dropThrough = 0;
  c.climbing = false;
  c.jumping = false;
  c.dashT = 0;
  c.dashDir = 0;
  c.dashAir = false;
  c.dashBuf = 0;
  c.diving = false;
  c.airT = 0;
  c.fallPeak = 0;
  e.gravityScale = 1;
  e.usesPlatforms = true;
}

/** Add a player (entity + state) to the world, applying race base stats and starting items. */
export function addPlayer(world: World, setup: PlayerSetup): PlayerState {
  const index = world.players.length;
  const e = world.spawn('player', 'player', 0, 0, { w: PLAYER_W, h: PLAYER_H, playerIndex: index });
  e.light = { radius: 48, color: 0xffb060, intensity: 1, flicker: 0.08 };
  const p: PlayerState = {
    index,
    entityId: e.id,
    name: setup.name,
    race: setup.race,
    hat: setup.hat,
    companion: setup.companion,
    traits: [...(setup.traits ?? [])],
    base: validBias(setup.bias) ? creationStats(setup.bias) : setup.stats ? { ...setup.stats } : creationStats(DEFAULT_BIAS),
    bias: validBias(setup.bias) ? { good: [...setup.bias.good], bad: setup.bias.bad } : setup.stats ? inferBias(setup.stats) : { good: [...DEFAULT_BIAS.good], bad: DEFAULT_BIAS.bad },
    stats: { maxHp: 1, maxMana: 0, maxHunger: 1, maxStamina: 1, atk: 0, dex: 0, mag: 0, lck: 0, def: 0 },
    mods: {},
    specials: [],
    mana: 0,
    hunger: 0,
    stamina: 0,
    level: 1,
    xp: 0,
    xpToNext: 8,
    skillPicks: 0,
    skillOffer: [],
    skills: {},
    skillSlots: [],
    skillCooldowns: [],
    gold: 0,
    inventory: new Array(INVENTORY_SIZE).fill(null),
    equipment: { head: null, body: null, accessory1: null, accessory2: null, ammo: null, trinket: null },
    selected: 0,
    useCooldown: 0,
    downed: false,
    reviveProgress: 0,
    out: false,
    ctl: createCtl(),
    prev: { jump: false, attack: false, interact: false, alt: false, dash: 0 },
    knownRecipes: [],
    runStats: emptyRunStats(),
    craftPick: -1,
  };
  world.players.push(p);
  recalcStats(p, e);
  e.hp = e.maxHp;
  p.mana = p.stats.maxMana;
  p.hunger = p.stats.maxHunger;
  p.stamina = p.stats.maxStamina;
  const race = Content.races.get(setup.race);
  for (const s of race?.startItems ?? []) addItem(p, s.item, s.count);
  for (const s of Content.companions.get(setup.companion)?.startItems ?? []) addItem(p, s.item, s.count);
  return p;
}
