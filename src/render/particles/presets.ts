import { mix, shade } from '../color';
import { PF, type ParticleSystem } from './system';

/**
 * Particle presets (pure data + an emitter). Triggered by `particles` GameEvents
 * (preset/x/y/count/color/dir) and by other events (death, damage, tileBroken…).
 * Unknown preset names fall back to a generic burst so new sim events always show *something*.
 */
export interface Preset {
  count: number;
  /** Seconds. */
  life: [number, number];
  /** px/s. */
  speed: [number, number];
  /** Emission angle (radians, 0 = right, -π/2 = up) and spread (± radians). */
  angle: number;
  spread: number;
  /** px/s² (positive = down). */
  gravity: number;
  drag: number;
  size: [number, number];
  /** Picked at random; an event `color` replaces them with shades of that colour. */
  colors: number[];
  flags: number;
  /** Positional jitter radius (px). */
  jitter?: number;
  /** Emit on a ring of this radius moving outward (air-jump ring). */
  ring?: number;
  /** Use the event direction (dirX/dirY) as the emission angle when provided. */
  directional?: boolean;
}

const UP = -Math.PI / 2;
const ALL = Math.PI;

export const PRESETS: Record<string, Preset> = {
  hit_spark: { count: 6, life: [0.12, 0.28], speed: [40, 110], angle: 0, spread: ALL, gravity: 120, drag: 6, size: [1, 1], colors: [0xffffff, 0xfff0a0, 0xffd040], flags: PF.GLOW | PF.FADE, directional: true },
  blood: { count: 7, life: [0.4, 0.8], speed: [30, 90], angle: UP, spread: 1.3, gravity: 420, drag: 1, size: [1, 2], colors: [0xa01818, 0xc02020, 0x701010], flags: PF.COLLIDE | PF.SHRINK, directional: true },
  slime_splat: { count: 8, life: [0.4, 0.8], speed: [30, 90], angle: UP, spread: 1.4, gravity: 420, drag: 1, size: [1, 2], colors: [0x5ce65c, 0xa8ff8a, 0x2e8a2e], flags: PF.COLLIDE | PF.SHRINK },
  wood_chips: { count: 5, life: [0.35, 0.7], speed: [40, 90], angle: UP, spread: 1.1, gravity: 480, drag: 1, size: [1, 2], colors: [0x7a4a24, 0xb07a40, 0x4a2a14], flags: PF.COLLIDE },
  rock_chips: { count: 5, life: [0.35, 0.7], speed: [40, 100], angle: UP, spread: 1.1, gravity: 520, drag: 1, size: [1, 2], colors: [0x5a5a60, 0x9a9aa0, 0x3a3a40, 0xc8c8cc], flags: PF.COLLIDE },
  tile_chips: { count: 8, life: [0.35, 0.8], speed: [30, 90], angle: UP, spread: 1.4, gravity: 520, drag: 1, size: [1, 2], colors: [0x4e3822, 0x3b2a1a, 0x2a1f14], flags: PF.COLLIDE, jitter: 3 },
  dust_land: { count: 6, life: [0.25, 0.45], speed: [15, 40], angle: 0, spread: 0.25, gravity: -20, drag: 5, size: [1, 1], colors: [0x8a7a6a, 0x6a5a4a, 0xa89a88], flags: PF.FADE },
  jump_puff: { count: 4, life: [0.2, 0.35], speed: [10, 30], angle: Math.PI / 2, spread: 1.2, gravity: -30, drag: 6, size: [1, 1], colors: [0x9a8a7a, 0x7a6a5a], flags: PF.FADE },
  airjump: { count: 10, life: [0.22, 0.32], speed: [30, 45], angle: 0, spread: ALL, gravity: 0, drag: 5, size: [1, 1], colors: [0xe8f4ff, 0xb0d8ff], flags: PF.FADE | PF.GLOW, ring: 2 },
  dash: { count: 5, life: [0.15, 0.3], speed: [5, 20], angle: 0, spread: ALL, gravity: 0, drag: 6, size: [1, 2], colors: [0xc8e0ff, 0xffffff, 0x8ab0e0], flags: PF.FADE | PF.SHRINK, jitter: 3, directional: true },
  fire: { count: 10, life: [0.3, 0.7], speed: [20, 60], angle: UP, spread: 0.7, gravity: -90, drag: 2, size: [1, 2], colors: [0xffd040, 0xffb030, 0xff6018, 0xfff0a0], flags: PF.GLOW | PF.FADE | PF.SHRINK | PF.LIGHT, jitter: 3 },
  embers: { count: 6, life: [0.6, 1.4], speed: [10, 35], angle: UP, spread: 0.9, gravity: -25, drag: 1, size: [1, 1], colors: [0xffb030, 0xff8020, 0xffd040], flags: PF.GLOW | PF.FADE, jitter: 3 },
  magic: { count: 8, life: [0.3, 0.7], speed: [10, 40], angle: 0, spread: ALL, gravity: -10, drag: 3, size: [1, 1], colors: [0xd090ff, 0xffffff, 0x80ffff], flags: PF.GLOW | PF.FADE, jitter: 2 },
  smoke: { count: 6, life: [0.5, 1.0], speed: [8, 22], angle: UP, spread: 0.8, gravity: -25, drag: 2, size: [2, 2], colors: [0x3a3a3a, 0x4a4a4a, 0x2a2a2a], flags: PF.FADE, jitter: 3 },
  coin_sparkle: { count: 5, life: [0.25, 0.5], speed: [15, 40], angle: UP, spread: 1.2, gravity: 40, drag: 3, size: [1, 1], colors: [0xfff080, 0xffd040, 0xffffff], flags: PF.GLOW | PF.FADE },
  levelup: { count: 28, life: [0.6, 1.2], speed: [25, 70], angle: UP, spread: ALL, gravity: -30, drag: 2, size: [1, 2], colors: [0xfff080, 0x80ff80, 0xffffff, 0x80e0ff], flags: PF.GLOW | PF.FADE | PF.LIGHT, jitter: 4 },
  heal: { count: 8, life: [0.5, 0.9], speed: [8, 20], angle: UP, spread: 0.5, gravity: -30, drag: 1, size: [1, 1], colors: [0x80ff80, 0xc0ffc0], flags: PF.GLOW | PF.FADE, jitter: 4 },
  explosion: { count: 30, life: [0.3, 0.8], speed: [40, 150], angle: 0, spread: ALL, gravity: 120, drag: 3, size: [1, 2], colors: [0xfff0a0, 0xffd040, 0xff8020, 0xff4010], flags: PF.GLOW | PF.FADE | PF.SHRINK | PF.LIGHT },
  death_burst: { count: 12, life: [0.3, 0.6], speed: [30, 90], angle: UP, spread: ALL, gravity: 260, drag: 2, size: [1, 2], colors: [0xc02020, 0x801010, 0xffffff], flags: PF.COLLIDE | PF.SHRINK },
  poof: { count: 10, life: [0.3, 0.6], speed: [10, 35], angle: UP, spread: ALL, gravity: -20, drag: 4, size: [1, 2], colors: [0xe0e0e0, 0xb0b0b0, 0xffffff], flags: PF.FADE, jitter: 3 },
  splash: { count: 8, life: [0.3, 0.6], speed: [30, 80], angle: UP, spread: 0.7, gravity: 420, drag: 1, size: [1, 1], colors: [0x6aa8ff, 0xbfe4ff, 0xffffff], flags: PF.FADE },
  bubble: { count: 1, life: [0.6, 1.2], speed: [8, 16], angle: UP, spread: 0.3, gravity: -10, drag: 1, size: [1, 1], colors: [0xbfe4ff], flags: PF.FADE },
  trail_fire: { count: 1, life: [0.15, 0.3], speed: [0, 8], angle: UP, spread: ALL, gravity: -20, drag: 2, size: [1, 1], colors: [0xffb030, 0xff8020], flags: PF.GLOW | PF.FADE },
  trail_magic: { count: 1, life: [0.2, 0.4], speed: [0, 10], angle: 0, spread: ALL, gravity: 0, drag: 2, size: [1, 1], colors: [0xffffff, 0x80ffff, 0xd090ff], flags: PF.GLOW | PF.FADE },
  dust_puff: { count: 6, life: [0.3, 0.6], speed: [8, 28], angle: UP, spread: ALL, gravity: -15, drag: 4, size: [1, 2], colors: [0x8a7a6a, 0x6a5a4a, 0xa89a88], flags: PF.FADE, jitter: 3 },
  steam: { count: 8, life: [0.5, 1.0], speed: [8, 24], angle: UP, spread: 0.6, gravity: -40, drag: 2, size: [1, 2], colors: [0xd8e0e8, 0xb8c4d0, 0xf0f4f8], flags: PF.FADE, jitter: 3 },
  frost: { count: 14, life: [0.3, 0.7], speed: [20, 70], angle: 0, spread: ALL, gravity: 20, drag: 3, size: [1, 1], colors: [0xe0f8ff, 0x9ad8f0, 0xffffff], flags: PF.GLOW | PF.FADE, jitter: 2 },
  zap: { count: 8, life: [0.08, 0.2], speed: [60, 140], angle: 0, spread: ALL, gravity: 0, drag: 8, size: [1, 1], colors: [0xffffff, 0xfff080, 0xe9e682], flags: PF.GLOW | PF.FADE | PF.LIGHT },
  trail_dots: { count: 1, life: [0.12, 0.2], speed: [0, 0], angle: 0, spread: 0, gravity: 0, drag: 0, size: [1, 1], colors: [0xd8d8d8], flags: PF.FADE },
};

/** Generic fallback for preset names nobody defined yet. */
export const GENERIC: Preset = { count: 6, life: [0.25, 0.5], speed: [20, 60], angle: UP, spread: ALL, gravity: 150, drag: 2, size: [1, 1], colors: [0xffffff, 0xd0d0d0], flags: PF.FADE };

/** Aliases (sim/other workstreams may use different names). */
const ALIASES: Record<string, string> = {
  spark: 'hit_spark', hit: 'hit_spark', sparks: 'hit_spark',
  slime: 'slime_splat', splat: 'slime_splat', gore: 'blood',
  chips: 'tile_chips', dig: 'tile_chips', mine: 'rock_chips', chop: 'wood_chips',
  land: 'dust_land', dust: 'dust_land', jump: 'jump_puff', air_jump: 'airjump', double_jump: 'airjump',
  dash_trail: 'dash', flame: 'fire', burn: 'fire', ember: 'embers',
  sparkle: 'magic', arcane: 'magic', cast: 'magic', coin: 'coin_sparkle', gold: 'coin_sparkle',
  level_up: 'levelup', explode: 'explosion', bomb: 'explosion', death: 'death_burst',
  regen: 'heal', water: 'splash', fire_trail: 'trail_fire', magic_trail: 'trail_magic',
  // Names emitted by the combat / player / progression / items workstreams.
  tile_break: 'dust_puff', clink: 'hit_spark', block: 'hit_spark', deflect: 'hit_spark', bounce: 'hit_spark',
  slash: 'hit_spark', item_break: 'rock_chips', arrow_break: 'wood_chips', trap_snap: 'rock_chips',
  fizzle: 'smoke', immune: 'poof', place: 'dust_puff', pogo: 'jump_puff', slam: 'dust_land', spike: 'blood',
  lava_burn: 'fire', fire_burst: 'fire', ember_trail: 'trail_fire', revive: 'heal', repair: 'coin_sparkle',
  teleport: 'magic', blink: 'magic', mystery: 'magic', status_shield: 'magic', shield: 'magic', iron_skin: 'magic',
  arcane_ward: 'magic', war_cry: 'magic', blessing: 'levelup', skill_learn: 'levelup', whirlwind: 'dash',
  frost_nova: 'frost', ice: 'frost', freeze: 'frost', lightning: 'zap', thunder: 'zap', shock: 'zap',
  wraith: 'smoke', wraith_spawn: 'smoke', feathers: 'poof', vapor: 'steam',
};

export function resolvePreset(name: string): Preset {
  return PRESETS[name] ?? PRESETS[ALIASES[name] ?? ''] ?? GENERIC;
}

export interface EmitOptions {
  count?: number;
  color?: number;
  dirX?: number;
  dirY?: number;
}

/** Emit `preset` at (x,y). Returns the number of particles spawned. */
export function emitPreset(ps: ParticleSystem, name: string | Preset, x: number, y: number, opts: EmitOptions = {}): number {
  const p = typeof name === 'string' ? resolvePreset(name) : name;
  const n = Math.max(0, Math.min(200, Math.round(opts.count ?? p.count)));
  let base = p.angle;
  if (p.directional && (opts.dirX || opts.dirY)) base = Math.atan2(opts.dirY ?? 0, opts.dirX ?? 0);
  const c = opts.color;
  let spawned = 0;
  for (let k = 0; k < n; k++) {
    let ang: number;
    let px = x;
    let py = y;
    if (p.ring) {
      ang = (k / n) * Math.PI * 2;
      px += Math.cos(ang) * p.ring;
      py += Math.sin(ang) * p.ring * 0.6;
    } else {
      ang = base + (ps.rand() * 2 - 1) * p.spread;
      if (p.jitter) {
        px += (ps.rand() * 2 - 1) * p.jitter;
        py += (ps.rand() * 2 - 1) * p.jitter * 0.6;
      }
    }
    const sp = ps.range(p.speed[0], p.speed[1]);
    const vy = Math.sin(ang) * sp * (p.ring ? 0.6 : 1);
    const life = ps.range(p.life[0], p.life[1]);
    const size = p.size[0] === p.size[1] || ps.rand() < 0.5 ? p.size[0] : p.size[1];
    const col = c !== undefined ? tintVariant(c, ps.rand()) : p.colors[Math.floor(ps.rand() * p.colors.length)]!;
    if (ps.spawn(px, py, Math.cos(ang) * sp, vy, life, size, col, p.flags, p.gravity, p.drag) >= 0) spawned++;
  }
  return spawned;
}

/** Light / mid / dark variants of an event colour. */
export function tintVariant(c: number, r: number): number {
  if (r < 0.25) return mix(c, 0xffffff, 0.35);
  if (r < 0.7) return c;
  return shade(c, 0.65);
}
