import { TILE } from '../constants';

/**
 * Combat tuning in one place. Units: px, px/s, ticks (60/s), seconds where noted.
 * Formulas (GDD §6): melee = weapon + ATK · ranged = weapon + ammo + DEX · magic = spell + MAG.
 */
export const COMBAT = {
  crit: {
    /** Base chance + per point of LCK (+ StatMods.critChance). */
    base: 0.03,
    perLck: 0.02,
    mult: 1.5,
  },
  /** Fists / non-weapon items: base damage and the fraction of ATK added. */
  fist: { damage: 0, statMul: 0.5, range: 7, cooldown: 0.35 },
  melee: {
    /** Swing length as a fraction of the (attack-speed scaled) cooldown, clamped to [minTicks, cooldown]. */
    durationFrac: 0.7,
    minTicks: 7,
    maxTicks: 45,
    /** Inner radius of the blade from the attacker's centre. */
    innerRadius: 2,
    /** Sample spacing along the blade / between swept angles. */
    sampleStep: 2.5,
    angleStep: 0.3,
    defaultRange: 10,
    defaultKnockback: 80,
    /** Arc up/behind and down/forward of the aim, radians; heavy weapons sweep wider. */
    arc: {
      light: { up: 1.35, down: 0.75, thickness: 3, windup: 0.15, active: 0.45 },
      normal: { up: 1.57, down: 0.8, thickness: 4, windup: 0.2, active: 0.4 },
      heavy: { up: 1.75, down: 1.0, thickness: 6, windup: 0.32, active: 0.36 },
    },
    /** Thrust: thin box that extends from `thrustStart` to full reach during the active frames. */
    thrustStart: 0.45,
    thrustThickness: 3,
    /** Cooldown thresholds (seconds) when an item has no light/heavy tag. */
    lightBelow: 0.3,
    heavyFrom: 0.6,
    /** Down-swing in the air that connects bounces the attacker up (px/s). */
    pogoSpeed: 215,
  },
  hitstop: {
    heavy: 4,
    crit: 3,
    kill: 3,
    bossKill: 10,
    /** Hit-stop freezes the whole world, so it is scaled down when several players are active. */
    coopScale: 0.5,
  },
  /** Ranged: muzzle offset from the user's centre toward the aim. */
  muzzle: 4,
  /** Out-of-ammo / out-of-mana retry delay (seconds) so held fire doesn't spam messages. */
  failCooldown: 0.35,
  /** Default use cooldowns (seconds) when an item has none. */
  defaultCooldown: { swing: 0.4, thrust: 0.45, shoot: 0.5, cast: 0.6, throw: 0.45, consume: 0.6, place: 0.18 },
  /** Thrown projectiles: speed multiplier for a full-distance aim, and minimum. */
  throwPower: { min: 0.55, fullAt: 96 },
  mining: {
    /** Max distance (px) from the user's centre to the near edge of a mined tile (~2 tiles). */
    reach: 2 * TILE + 4,
    /** Bomb tile-breaking power (tiles with hardness above this survive). */
    bombPower: 2,
    /** Chance a bomb-broken tile drops its item (keeps explosions from carpeting the floor). */
    bombDropChance: 0.25,
  },
  place: {
    /** Max distance (px) from the user's centre to a placed tile's centre. */
    reach: 4 * TILE + 4,
  },
  shield: {
    /** Blocking (alt held with a shield) negates frontal hits for this much stamina. */
    staminaCost: 1,
    knockback: 70,
    iframes: 12,
  },
  /** Player i-frames after a hit (GDD: 0.9 s). Enemies get a short window so multi-hits read. */
  playerIframes: 54,
  enemyIframes: 6,
  /** Friendly explosion damage to players is capped to this (bombs still sting). */
  friendlySplashMax: 1,
} as const;

export type SwingWeight = 'light' | 'normal' | 'heavy';
