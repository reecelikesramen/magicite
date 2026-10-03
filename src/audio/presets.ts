import type { ZzfxParams } from './zzfx';

/**
 * Procedural SFX table, keyed by the `sfx` ids the sim emits (plus ids the audio layer derives from
 * semantic GameEvents). Each entry is a ZzFX parameter list — no audio files. Rendered buffers are
 * loudness-normalised (see `normalizeSamples`), so `gain` sets the *relative* loudness of a sound.
 *
 * ZzFX order: [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide,
 * deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume,
 * decay, tremolo, filter]. Shapes: 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise, 5 square (duty =
 * shapeCurve/2). filter > 0 = high-pass Hz, < 0 = low-pass Hz.
 */
export interface SfxPreset {
  z: ZzfxParams;
  /** Relative loudness after normalisation (default 1). */
  gain?: number;
  /** ± playback-rate variance per play, e.g. 0.06 = ±6 % (default 0.05). */
  vary?: number;
  /** Max simultaneously playing voices of this id (default 3). */
  voices?: number;
  /** Min seconds between two starts of this id; closer retriggers are dropped (default 0.035). */
  gap?: number;
  /** false = non-positional (UI, alerts, stingers): ignores listener distance and pan. Default true. */
  spatial?: boolean;
  /**
   * Belongs to one player's own action (menus, shop, crafting, out-of-stamina…). Played non-positionally
   * when the sim gives no position (x = y = 0, the "UI sound" convention), but a raw `sfx` event that
   * carries a position is spatialised like any other sound, so a teammate's shop chime across the level
   * stays quiet in co-op while your own (emitted at your feet) is full volume.
   */
  personal?: boolean;
  /**
   * Also driven by a semantic GameEvent that knows *which player* it belongs to (e.g. `craft`): positionless
   * raw `sfx` events with this id are ignored (the semantic event plays it); positioned ones are played
   * spatially (implies `personal`). See events.ts.
   */
  eventDriven?: boolean;
}

export const SFX: Readonly<Record<string, SfxPreset>> = {
  // ── movement ─────────────────────────────────────────────────────────────
  jump: { z: [0.4, 0, 240, 0.01, 0.03, 0.08, 5, 0.5, 14], gain: 0.55, vary: 0.04 },
  double_jump: { z: [0.35, 0, 420, 0.01, 0.03, 0.1, 5, 0.3, 16, 0, 0, 0, 0, 0.2], gain: 0.55 },
  land: { z: [0.3, 0, 90, 0, 0.01, 0.05, 1, 1, -6, 0, 0, 0, 0, 0.8], gain: 0.35, vary: 0.1, gap: 0.08 },
  step: { z: [0.1, 0, 140, 0, 0, 0.025, 4, 1, -5], gain: 0.18, vary: 0.15, voices: 2, gap: 0.09 },
  dash: { z: [0.4, 0, 600, 0, 0.03, 0.15, 4, 1, -20], gain: 0.6, vary: 0.08 },
  slam: { z: [0.5, 0, 80, 0, 0.04, 0.2, 2, 1, -4, 0, 0, 0, 0, 0.6, 0, 0.2], gain: 0.8 },
  splash: { z: [0.4, 0, 500, 0.01, 0.06, 0.25, 4, 1, -3, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, -2000], gain: 0.5, vary: 0.1 },
  dive: { z: [0.35, 0, 180, 0, 0.05, 0.15, 0, 1, -15, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1000], gain: 0.45 },
  stamina_empty: { z: [0.3, 0, 90, 0, 0.03, 0.06, 5, 1, 0, 0, 0, 0, 0, 0.1], gain: 0.35, spatial: false, gap: 0.2, personal: true },

  // ── melee / defence ──────────────────────────────────────────────────────
  swing: { z: [0.3, 0, 900, 0, 0.01, 0.08, 4, 1, -30], gain: 0.45, vary: 0.12 },
  swing_heavy: { z: [0.4, 0, 500, 0.02, 0.03, 0.15, 4, 1, -20], gain: 0.6, vary: 0.08 },
  thrust: { z: [0.3, 0, 1200, 0, 0.01, 0.06, 4, 1, -40, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1000], gain: 0.45, vary: 0.1 },
  hit: { z: [0.6, 0, 140, 0, 0.02, 0.12, 2, 1, -8, 0, 0, 0, 0, 0.4, 0, 0.2], gain: 0.85, vary: 0.1, voices: 4 },
  crit: { z: [0.6, 0, 300, 0, 0.03, 0.2, 5, 0.5, -14, 0, 600, 0.03, 0, 0.3, 0, 0.25], gain: 1, vary: 0.06 },
  player_hurt: { z: [0.7, 0, 220, 0, 0.05, 0.2, 5, 0.5, -20, 0, 0, 0, 0, 0.2], gain: 1, vary: 0.04, voices: 2, gap: 0.1 },
  block: { z: [0.45, 0, 320, 0, 0.02, 0.15, 2, 1, -5, 0, 0, 0, 0, 0.2, 40], gain: 0.75 },
  shield_hit: { z: [0.45, 0, 520, 0, 0.02, 0.18, 1, 2, -4, 0, 0, 0, 0, 0.15, 60], gain: 0.75 },
  deflect: { z: [0.4, 0, 1400, 0, 0.02, 0.15, 0, 1, -10, 0, 0, 0, 0, 0, 80], gain: 0.6 },
  item_break: { z: [0.5, 0, 400, 0, 0.02, 0.25, 2, 1, -25, 0, 0, 0, 0, 0.5, 0, 0.4], gain: 0.8, spatial: false, personal: true },

  // ── ranged / magic ───────────────────────────────────────────────────────
  bow: { z: [0.4, 0, 420, 0, 0.01, 0.12, 1, 1, -18, 0, 0, 0, 0, 0, 30], gain: 0.55, vary: 0.06 },
  shoot_crossbow: { z: [0.45, 0, 250, 0, 0.01, 0.1, 2, 1, -20, 0, 0, 0, 0, 0.2, 20], gain: 0.6 },
  arrow_hit: { z: [0.35, 0, 200, 0, 0.01, 0.06, 1, 1, -30, 0, 0, 0, 0, 0.5], gain: 0.45, vary: 0.12, voices: 4 },
  throw: { z: [0.3, 0, 700, 0, 0.01, 0.1, 4, 1, -15], gain: 0.4, vary: 0.1 },
  empty: { z: [0.3, 0, 1500, 0, 0.01, 0.03, 5, 0.3, -50], gain: 0.35, spatial: false, gap: 0.15, personal: true },
  fizzle: { z: [0.35, 0, 500, 0, 0.05, 0.2, 4, 1, -15, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1500], gain: 0.45, spatial: false, gap: 0.15, personal: true },
  magic_cast: { z: [0.35, 0, 500, 0.02, 0.08, 0.2, 0, 1, 10, 0, 300, 0.04, 0.04], gain: 0.55, vary: 0.06 },
  fireball: { z: [0.45, 0, 120, 0.03, 0.1, 0.3, 4, 1, 4, 0, 0, 0, 0, 2, 0, 0.2, 0, 1, 0, 0, -1500], gain: 0.7, vary: 0.08 },
  ice_shard: { z: [0.35, 0, 1800, 0, 0.03, 0.15, 0, 1, -30, 0, 0, 0, 0, 0, 120, 0, 0.03], gain: 0.5, vary: 0.06 },
  lightning: { z: [0.55, 0, 1200, 0, 0.05, 0.3, 4, 1, -40, 0, 0, 0, 0, 4, 0, 0.5], gain: 0.85, vary: 0.08 },
  arcane: { z: [0.35, 0, 700, 0.03, 0.1, 0.25, 0, 1, 0, 0, 0, 0, 0.06, 0, 40, 0, 0, 1, 0, 0.5], gain: 0.5 },
  explosion: { z: [0.8, 0, 60, 0.01, 0.15, 0.7, 4, 1, -1, 0, 0, 0, 0, 1, 0, 0.5, 0, 0.6, 0.05], gain: 1.2, vary: 0.1, voices: 3, gap: 0.06 },
  freeze: { z: [0.45, 0, 1200, 0.01, 0.1, 0.4, 0, 1, -12, 0, 0, 0, 0.05, 0, 0, 0, 0, 1, 0, 0.4], gain: 0.55 },
  burn: { z: [0.35, 0, 300, 0.02, 0.1, 0.25, 4, 1, 0, 0, 0, 0, 0, 3, 0, 0.2, 0, 1, 0, 0, 1000], gain: 0.4, vary: 0.1, gap: 0.12 },
  sizzle: { z: [0.3, 0, 800, 0.02, 0.08, 0.2, 4, 1, -5, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 2000], gain: 0.35, vary: 0.1, gap: 0.15 },
  poison: { z: [0.3, 0, 200, 0, 0.05, 0.1, 0, 1, 20, 0, 0, 0, 0.04], gain: 0.35, gap: 0.15 },
  teleport: { z: [0.4, 0, 300, 0.02, 0.15, 0.3, 0, 1, 30, 0, 0, 0, 0.05, 0, 0, 0, 0, 1, 0, 0.4], gain: 0.6 },
  zap: { z: [0.35, 0, 900, 0, 0.03, 0.1, 4, 1, -30, 0, 0, 0, 0, 3, 0, 0.3], gain: 0.45, vary: 0.1 },
  buff: { z: [0.4, 0, 260, 0.03, 0.12, 0.3, 1, 1, 6, 0, 130, 0.08, 0, 0, 20, 0, 0, 1, 0, 0.3], gain: 0.55 },
  war_cry: { z: [0.6, 0, 160, 0.03, 0.25, 0.3, 2, 1.5, 3, 0, 0, 0, 0, 0.3, 8, 0, 0, 1, 0, 0.4], gain: 0.85, voices: 1 },
  smoke: { z: [0.45, 0, 200, 0.02, 0.15, 0.4, 4, 1, -2, 0, 0, 0, 0, 1, 0, 0, 0, 0.7, 0, 0, -900], gain: 0.6 },
  hawk: { z: [0.4, 0, 1700, 0.02, 0.1, 0.25, 2, 0.8, -25, 0, 0, 0, 0, 0, 30, 0, 0, 1, 0, 0.3], gain: 0.55 },
  meteor: { z: [0.6, 0, 500, 0.05, 0.3, 0.3, 4, 1, -12, 0, 0, 0, 0, 1.5, 0, 0.3, 0, 1, 0, 0, -2500], gain: 0.8, voices: 2 },
  trap_snap: { z: [0.5, 0, 700, 0, 0.01, 0.08, 2, 1, -60, 0, 0, 0, 0, 0.3, 0, 0.2], gain: 0.7 },
  skill: { z: [0.4, 0, 400, 0.01, 0.08, 0.25, 5, 0.5, 20, 0, 0, 0, 0.05], gain: 0.6, vary: 0.04 },

  // ── creatures ────────────────────────────────────────────────────────────
  death_enemy: { z: [0.45, 0, 300, 0, 0.05, 0.3, 2, 1, -12, 0, 0, 0, 0, 0.5, 0, 0.3], gain: 0.7, vary: 0.1, voices: 3 },
  death_small: { z: [0.3, 0, 600, 0, 0.02, 0.12, 4, 1, -20], gain: 0.4, vary: 0.15 },
  boss_roar: { z: [0.8, 0, 70, 0.05, 0.3, 0.5, 2, 2, -2, 0, 0, 0, 0, 0.6, 10], gain: 1.3, vary: 0.05, voices: 1, gap: 0.6, spatial: false },
  boss_death: { z: [1, 0, 90, 0.02, 0.5, 1.2, 2, 1, -3, 0, 0, 0, 0, 0.8, 0, 0.5, 0.1, 0.6], gain: 1.4, voices: 1, gap: 1, spatial: false },
  wraith_warn: { z: [0.6, 0, 300, 0.3, 0.6, 0.6, 5, 0.5, 4, 0, 0, 0, 0.2, 0, 0, 0, 0, 1, 0, 0.5], gain: 0.8, voices: 1, gap: 2, spatial: false },
  wraith_spawn: { z: [0.8, 0, 110, 0.2, 0.5, 0.8, 2, 2, -1, 0, 0, 0, 0.15, 0.4, 6, 0.2, 0, 1, 0, 0.6], gain: 1.2, voices: 1, gap: 2, spatial: false },

  // ── gathering / world ────────────────────────────────────────────────────
  chop: { z: [0.5, 0, 180, 0, 0, 0.06, 1, 1, 0, 0, 0, 0, 0, 0.6], gain: 0.7, vary: 0.08 },
  mine: { z: [0.45, 0, 900, 0, 0, 0.09, 1, 2, -5, 0, 0, 0, 0, 0.3], gain: 0.65, vary: 0.08 },
  clink: { z: [0.35, 0, 1800, 0, 0, 0.12, 0, 1, 0, 0, 0, 0, 0, 0, 60], gain: 0.5, vary: 0.05 },
  harvest: { z: [0.3, 0, 500, 0, 0.02, 0.07, 4, 1, 8, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1500], gain: 0.4, vary: 0.12 },
  dig: { z: [0.4, 0, 140, 0, 0.02, 0.08, 4, 1, -6, 0, 0, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, -1200], gain: 0.5, vary: 0.12 },
  tile_break: { z: [0.45, 0, 110, 0, 0.04, 0.2, 4, 1, -4, 0, 0, 0, 0, 1, 0, 0.3], gain: 0.6, vary: 0.1 },
  tree_fall: { z: [0.6, 0, 90, 0.02, 0.15, 0.4, 2, 1, -2, 0, 0, 0, 0, 0.8, 0, 0.4], gain: 0.8 },
  rock_break: { z: [0.55, 0, 130, 0, 0.05, 0.25, 4, 1, -6, 0, 0, 0, 0, 0.6, 0, 0.4], gain: 0.75 },
  break: { z: [0.4, 0, 400, 0, 0.02, 0.15, 4, 1, -20, 0, 0, 0, 0, 0, 0, 0.3], gain: 0.6, vary: 0.1 },
  chest_open: { z: [0.4, 0, 300, 0.01, 0.08, 0.25, 5, 0.5, 0, 0, 300, 0.08], gain: 0.6 },
  place: { z: [0.3, 0, 220, 0, 0.01, 0.05, 1, 1, -10, 0, 0, 0, 0, 0.3], gain: 0.45, vary: 0.08 },
  portal: { z: [0.5, 0, 200, 0.05, 0.2, 0.4, 0, 1, 30, 0, 0, 0, 0, 0, 5], gain: 0.75, voices: 1, gap: 0.3, spatial: false },
  portal_open: { z: [0.4, 0, 400, 0.05, 0.2, 0.5, 0, 1, 10, 0, 0, 0, 0.1, 0, 0, 0, 0, 1, 0, 0.3], gain: 0.7, voices: 1, gap: 0.3, spatial: false },
  pot_break: { z: [0.45, 0, 900, 0, 0.01, 0.18, 4, 1, -30, 0, 0, 0, 0.03, 0.4, 0, 0.2, 0, 0.7, 0, 0, 800], gain: 0.6, vary: 0.12 },
  drop: { z: [0.3, 0, 260, 0, 0.01, 0.06, 1, 1, -12, 0, 0, 0, 0, 0.2], gain: 0.35, vary: 0.1, gap: 0.08 },
  locked: { z: [0.35, 0, 140, 0, 0.06, 0.08, 2, 1, 0, 0, -30, 0.05, 0, 0.1, 0, 0.2], gain: 0.45, vary: 0, gap: 0.2 },

  // ── items / meters ───────────────────────────────────────────────────────
  coin: { z: [0.35, 0, 1200, 0, 0.03, 0.12, 5, 0.5, 0, 0, 600, 0.04], gain: 0.4, vary: 0.03, voices: 4, gap: 0.04 },
  pickup: { z: [0.3, 0, 700, 0, 0.02, 0.07, 5, 0.5, 0, 0, 350, 0.03], gain: 0.4, vary: 0.04, voices: 3, gap: 0.05 },
  eat: { z: [0.35, 0, 220, 0, 0.12, 0.05, 4, 1, 0, 0, 0, 0, 0.06, 0.4, 0, 0, 0, 1, 0, 1], gain: 0.55, vary: 0.08, voices: 1 },
  drink: { z: [0.35, 0, 300, 0, 0.08, 0.1, 0, 1, -10, 0, 0, 0, 0.07, 0.1, 0, 0, 0, 1, 0, 0.6], gain: 0.55, vary: 0.06, voices: 1 },
  heal: { z: [0.3, 0, 600, 0.02, 0.06, 0.2, 0, 1, 6, 0, 300, 0.06], gain: 0.45, voices: 2, gap: 0.25 },
  scroll: { z: [0.35, 0, 900, 0.02, 0.08, 0.25, 4, 1, 12, 0, 0, 0, 0, 0.6, 0, 0, 0, 1, 0, 0.3, 1200], gain: 0.5, vary: 0.05, voices: 1 },
  craft: { z: [0.4, 0, 660, 0, 0.05, 0.2, 5, 0.5, 0, 0, 330, 0.05, 0.05], gain: 0.55, vary: 0.02, gap: 0.2, spatial: false, eventDriven: true },
  craft_fail: { z: [0.35, 0, 120, 0, 0.08, 0.1, 2, 1, -3, 0, 0, 0, 0, 0, 0, 0.2], gain: 0.45, vary: 0, gap: 0.2, spatial: false, eventDriven: true },
  discover: { z: [0.4, 0, 880, 0, 0.05, 0.25, 0, 1, 0, 0, 440, 0.05, 0.05, 0, 0, 0, 0, 1, 0, 0.2], gain: 0.6, vary: 0, voices: 1, spatial: false, personal: true },
  levelup: { z: [0.5, 0, 523, 0, 0.1, 0.4, 5, 0.5, 0, 0, 262, 0.08, 0.08], gain: 0.75, vary: 0, voices: 1, gap: 0.3, spatial: false, eventDriven: true },
  revive: { z: [0.5, 0, 330, 0, 0.1, 0.3, 5, 0.5, 15], gain: 0.7, vary: 0, voices: 1, gap: 0.3, spatial: false },
  downed: { z: [0.5, 0, 440, 0, 0.1, 0.3, 5, 0.5, -15], gain: 0.8, vary: 0, voices: 1, gap: 0.3, spatial: false },
  run_win: { z: [0.5, 0, 392, 0, 0.15, 0.6, 5, 0.5, 0, 0, 196, 0.1, 0.1], gain: 0.8, vary: 0, voices: 1, gap: 1, spatial: false },
  run_lose: { z: [0.5, 0, 330, 0, 0.2, 0.6, 5, 0.5, -6, 0, -55, 0.15, 0.15], gain: 0.8, vary: 0, voices: 1, gap: 1, spatial: false },

  // ── UI (non-positional) ──────────────────────────────────────────────────
  ui_click: { z: [0.2, 0, 1800, 0, 0, 0.02, 5, 0.5], gain: 0.3, vary: 0.02, spatial: false, gap: 0.02 },
  ui_hover: { z: [0.1, 0, 2400, 0, 0, 0.01, 5, 0.5], gain: 0.15, vary: 0.02, spatial: false, voices: 1, gap: 0.03 },
  ui_open: { z: [0.2, 0, 500, 0, 0.02, 0.06, 5, 0.5, 0, 0, 250, 0.03], gain: 0.3, vary: 0, spatial: false, voices: 1 },
  ui_close: { z: [0.2, 0, 750, 0, 0.02, 0.06, 5, 0.5, 0, 0, -250, 0.03], gain: 0.3, vary: 0, spatial: false, voices: 1 },
  ui_error: { z: [0.25, 0, 150, 0, 0.05, 0.08, 5, 0.5], gain: 0.35, vary: 0, spatial: false, voices: 1, gap: 0.1, personal: true },
  buy: { z: [0.35, 0, 900, 0, 0.03, 0.1, 5, 0.5, 0, 0, 450, 0.04, 0.04], gain: 0.45, vary: 0, spatial: false, personal: true },
  sell: { z: [0.3, 0, 1100, 0, 0.02, 0.08, 5, 0.5, 0, 0, -300, 0.04], gain: 0.4, vary: 0, spatial: false, personal: true },
  unequip: { z: [0.3, 0, 240, 0, 0.02, 0.07, 2, 1, -6, 0, 0, 0, 0, 0.3, 20], gain: 0.35, spatial: false, personal: true },
  repair: { z: [0.4, 0, 1500, 0, 0.18, 0.12, 0, 1, -20, 0, 0, 0, 0.1, 0, 70, 0, 0, 1, 0, 0.9], gain: 0.55, vary: 0.04, voices: 1, spatial: false, personal: true },
  blessing: { z: [0.45, 0, 520, 0.05, 0.25, 0.5, 0, 1, 4, 0, 260, 0.1, 0.1, 0, 0, 0, 0.08, 1, 0, 0.2], gain: 0.65, vary: 0, voices: 1, gap: 0.5, spatial: false, personal: true },
  equip: { z: [0.3, 0, 300, 0, 0.02, 0.08, 2, 1, 0, 0, 0, 0, 0, 0.3, 25], gain: 0.4, spatial: false, personal: true },
};

/** Alternative ids used by other modules → canonical preset id. */
export const SFX_ALIASES: Readonly<Record<string, string>> = {
  explode: 'explosion',
  shoot_bow: 'bow',
  cast: 'magic_cast',
  arrow_stick: 'arrow_hit',
  level_up: 'levelup',
  hurt: 'player_hurt',
  enemy_death: 'death_enemy',
  bolt: 'shoot_crossbow',
  arcane_orb: 'arcane',
  magic_orb: 'arcane',
  bomb: 'explosion',
  click: 'ui_click',
  hover: 'ui_hover',
  inv_open: 'ui_open',
  inv_close: 'ui_close',
  fail: 'ui_error',
  purchase: 'buy',
  gather: 'harvest',
  crafted: 'craft',
  // items workstream (shop / equip / repair / consume / loot)
  denied: 'ui_error',
  // run / progression workstream
  portal_enter: 'portal',
  portal_unlock: 'portal_open',
  portal_locked: 'locked',
  victory: 'run_win',
  defeat: 'run_lose',
  wraith_warning: 'wraith_warn',
  skill_learn: 'discover',
  skill_not_ready: 'ui_error',
  skill_fail: 'fizzle',
  companion_heal: 'heal',
  companion_shield: 'buff',
  companion_zap: 'zap',
  // skills: `skill_<id>` (GDD §10); anything else under the prefix falls back to 'skill'
  skill_whirlwind: 'swing_heavy',
  skill_ground_slam: 'slam',
  skill_war_cry: 'war_cry',
  skill_charge: 'dash',
  skill_iron_skin: 'buff',
  skill_cleave: 'swing_heavy',
  skill_fire_burst: 'fireball',
  skill_frost_nova: 'freeze',
  skill_chain_lightning: 'lightning',
  skill_blink: 'teleport',
  skill_arcane_ward: 'buff',
  skill_meteor: 'meteor',
  skill_multishot: 'bow',
  skill_arrow_rain: 'bow',
  skill_bear_trap: 'place',
  skill_smoke_bomb: 'smoke',
  skill_hawk: 'hawk',
  skill_volley_step: 'dash',
  // Enemy AI cues (src/sim/ai)
  enemy_telegraph: 'zap',
  enemy_shoot: 'magic_cast',
  enemy_spit: 'sizzle',
  enemy_hop: 'jump',
  enemy_swoop: 'dash',
  enemy_charge: 'dash',
  enemy_stun: 'clink',
  enemy_drop: 'land',
};

/** Id prefixes (for ids built at runtime, e.g. `skill_${def.id}`) → preset. Checked after aliases. */
export const SFX_PREFIXES: readonly (readonly [string, string])[] = [
  ['skill_', 'skill'],
  ['companion_', 'pickup'],
  ['ui_', 'ui_click'],
  ['boss_', 'boss_roar'],
  ['portal_', 'portal'],
];

/** Played for ids missing from the table (never silent, never throws). */
export const FALLBACK_SFX = 'pickup';

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Canonical preset id for any sfx id: exact → alias → prefix rule → FALLBACK_SFX. */
export function resolveSfxId(id: string): string {
  if (own(SFX, id)) return id;
  if (own(SFX_ALIASES, id)) return SFX_ALIASES[id]!;
  for (const [prefix, target] of SFX_PREFIXES) if (id.startsWith(prefix)) return target;
  return FALLBACK_SFX;
}

/**
 * Should a cue for `preset` be spatialised? `positioned` = the source carries a real position (the sim uses
 * x = y = 0 for "no position"). Spatial presets always are; `personal` / `eventDriven` ones only when
 * positioned; everything else (UI, alerts, stingers) never.
 */
export function isSpatialCue(preset: SfxPreset, positioned: boolean): boolean {
  if (preset.spatial !== false) return true;
  return positioned && (preset.personal === true || preset.eventDriven === true);
}

/** True when `id` has a preset of its own or via an alias (not just a prefix rule or the fallback). */
export function hasSfx(id: string): boolean {
  return own(SFX, id) || own(SFX_ALIASES, id);
}

/** True when `id` resolves to something other than the generic fallback. */
export function resolvesSfx(id: string): boolean {
  return hasSfx(id) || SFX_PREFIXES.some(([prefix]) => id.startsWith(prefix));
}

export const DEFAULT_VOICES = 3;
export const DEFAULT_GAP = 0.035;
export const DEFAULT_VARY = 0.05;

/**
 * Scale rendered samples so presets sit at a consistent loudness: RMS (over the non-silent part) is
 * brought to `targetRms`, gain clamped to [minGain, maxGain] and peaks kept ≤ maxPeak. In place.
 */
export function normalizeSamples(s: Float32Array, targetRms = 0.2, maxPeak = 0.9, minGain = 0.25, maxGain = 3): Float32Array {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const v = s[i]!;
    if (!Number.isFinite(v)) {
      s[i] = 0;
      continue;
    }
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    if (a > 1e-4) {
      sum += v * v;
      n++;
    }
  }
  if (n === 0 || peak === 0) return s;
  const rms = Math.sqrt(sum / n);
  let g = targetRms / rms;
  if (g < minGain) g = minGain;
  if (g > maxGain) g = maxGain;
  if (peak * g > maxPeak) g = maxPeak / peak;
  for (let i = 0; i < s.length; i++) s[i] = s[i]! * g;
  return s;
}
