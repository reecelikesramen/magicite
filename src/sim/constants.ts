/** Native pixels per tile. The whole simulation works in native pixels (y grows downward). */
export const TILE = 8;
/** Simulation ticks per second. The sim always advances in fixed steps of DT. */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** Seconds → ticks. */
export const secs = (s: number): number => Math.round(s * TICK_RATE);

export const MAX_PLAYERS = 4;
/** Slots 0..HOTBAR_SIZE-1 of the inventory are the hotbar. */
export const HOTBAR_SIZE = 5;
export const BACKPACK_SIZE = 15;
export const INVENTORY_SIZE = HOTBAR_SIZE + BACKPACK_SIZE;
export const DEFAULT_STACK = 99;

/**
 * Movement tuning shared by the player controller and physics. Units are px and seconds.
 * Players are ~8x12 px and tiles 8 px, so these numbers are "small" on purpose.
 */
export const PHYS = {
  gravity: 760,
  maxFall: 300,
  /** Gravity multiplier while rising with jump released (variable jump height). */
  jumpCutGravity: 2.4,
  walkSpeed: 62,
  groundAccel: 900,
  groundDecel: 1100,
  airAccel: 620,
  airDecel: 380,
  /** Initial jump velocity → apex ≈ v²/2g ≈ 3.6 tiles. */
  jumpSpeed: 210,
  coyoteTicks: 6,
  jumpBufferTicks: 7,
  climbSpeed: 48,
  /** Liquids */
  swimGravityScale: 0.35,
  swimMaxFall: 40,
  swimJumpSpeed: 120,
} as const;
