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
 * Movement tuning shared by the player controller and physics. Units are px, px/s, px/s² and ticks.
 * Player hitbox is 6x11 px on 8 px tiles. Measured targets (tests/player/movement.test.ts):
 * run ≈ 7.5 tiles/s · single jump apex ≈ 3.4 tiles · with double jump ≈ 5.5 tiles ·
 * ground dash ≈ 3 tiles · air dash ≈ 5 tiles · tap-jump ≈ 1.5 tiles.
 * Level-gen capability budget (GDD §8): ledge ≤ 3 tiles single, ≤ 5 double, gap ≤ 6 with dash.
 */
export const PHYS = {
  gravity: 760,
  /** Gravity multiplier while falling (snappier descent than ascent). */
  fallGravity: 1.1,
  maxFall: 300,
  /** Gravity multiplier while rising with jump released (variable jump height). */
  jumpCutGravity: 2.6,
  /** Gravity multiplier near the apex while jump is held (|vy| < apexSpeed): brief hang for air control. */
  apexGravity: 0.55,
  apexSpeed: 32,
  walkSpeed: 60,
  groundAccel: 900,
  groundDecel: 1100,
  airAccel: 620,
  airDecel: 380,
  /** Decel applied when faster than walkSpeed while holding the same direction (keeps dash/knockback momentum). */
  groundOverspeedDecel: 700,
  airOverspeedDecel: 220,
  /** Control multiplier while staggered (Entity.hurt > 0) so knockback reads. */
  hurtControl: 0.25,
  /** Initial jump velocity. */
  jumpSpeed: 210,
  /** Air (double) jump velocity; costs 1 stamina. */
  airJumpSpeed: 166,
  /** Innate air jumps (the double jump); StatMods.airJumps adds more. */
  baseAirJumps: 1,
  coyoteTicks: 6,
  jumpBufferTicks: 7,
  /** Air jumps are held back (buffered for a free ground jump) if we'd land within this many ticks. */
  airJumpLandGrace: 3,
  /** Ground dash: 165 px/s x 8 ticks ≈ 3 tiles. */
  dashGroundSpeed: 165,
  dashGroundTicks: 8,
  /** Air dash: faster and gravity-free, ≈ 5 tiles. */
  dashAirSpeed: 270,
  dashAirTicks: 8,
  /** Ticks after a dash ends before the next one. */
  dashCooldownTicks: 14,
  dashBufferTicks: 6,
  /** Invulnerability at dash start (GDD §6: dash i-frames). */
  dashIframes: 6,
  /** Fraction of ground-dash speed kept when jumping out of it (dash-jump). */
  dashJumpCarry: 0.8,
  /** Dive (Down + Jump in mid-air): fast-fall slam. */
  diveSpeed: 330,
  /** Max px nudged sideways around a ceiling corner when jumping. */
  cornerCorrect: 3,
  /** Max px popped up onto a ledge (or down under a ceiling lip) when barely missing it in the air. */
  ledgeNudge: 3,
  dropThroughTicks: 10,
  climbSpeed: 48,
  /** Downed players crawl. */
  crawlSpeed: 12,
  /** Liquids: water. */
  swimGravityScale: 0.35,
  swimMaxFall: 40,
  /** Deceleration (px/s²) braking a fast fall on entering a liquid. */
  liquidDrag: 1500,
  swimSpeedMul: 0.6,
  /** Holding Jump/Up underwater swims upward at this speed. */
  swimUpSpeed: 55,
  swimDownSpeed: 70,
  swimAccel: 420,
  /** Jump pressed with the head at the surface leaps out of the liquid. */
  swimJumpSpeed: 190,
  /** Lava: strong slowdown. */
  lavaSpeedMul: 0.35,
  lavaGravityScale: 0.25,
  lavaMaxFall: 25,
  lavaUpSpeed: 32,
  lavaJumpSpeed: 160,
} as const;
