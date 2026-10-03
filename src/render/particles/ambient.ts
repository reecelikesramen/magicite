import { PF, type ParticleSystem, type SolidFn } from './system';

/**
 * Biome ambient particles (BiomeDef.ambientParticles) kept alive around the camera:
 * fireflies, embers, snow, spores, sparkles, dust, bubbles. Pure.
 */
export interface AmbientKind {
  /** Particles per 100×100 px of view. */
  density: number;
  spawn(ps: ParticleSystem, x: number, y: number): void;
  /** Where new particles appear: anywhere in the view, or just above it (falling snow). */
  from?: 'view' | 'top';
}

const pick = (ps: ParticleSystem, arr: number[]): number => arr[Math.floor(ps.rand() * arr.length)]!;

export const AMBIENT: Record<string, AmbientKind> = {
  fireflies: {
    density: 1.1,
    spawn(ps, x, y) {
      ps.spawn(x, y, ps.range(-6, 6), ps.range(-6, 6), ps.range(6, 12), 1, pick(ps, [0x9cff3a, 0xc8ff60, 0x9cff3a]), PF.GLOW | PF.WANDER | PF.BLINK | PF.AMBIENT | PF.LIGHT);
    },
  },
  embers: {
    density: 1.4,
    spawn(ps, x, y) {
      ps.spawn(x, y, ps.range(-6, 6), ps.range(-26, -8), ps.range(3, 6), 1, pick(ps, [0xffb030, 0xff8020, 0xffd040, 0xff6018]), PF.GLOW | PF.WANDER | PF.AMBIENT, -4, 0.2);
    },
  },
  snow: {
    density: 2.2,
    from: 'top',
    spawn(ps, x, y) {
      const big = ps.rand() < 0.2;
      ps.spawn(x, y, ps.range(-6, 4), ps.range(10, 22), ps.range(8, 14), big ? 2 : 1, big ? 0xffffff : 0xdce8f4, PF.WANDER | PF.AMBIENT | (big ? PF.GLOW : 0));
    },
  },
  spores: {
    density: 1.0,
    spawn(ps, x, y) {
      ps.spawn(x, y, ps.range(-4, 4), ps.range(-8, -2), ps.range(6, 10), 1, pick(ps, [0x40c0c0, 0xb070ff, 0x80ffe0]), PF.GLOW | PF.WANDER | PF.BLINK | PF.AMBIENT);
    },
  },
  spores_pink: {
    density: 1.0,
    spawn(ps, x, y) {
      ps.spawn(x, y, ps.range(-4, 4), ps.range(-8, -2), ps.range(6, 10), 1, pick(ps, [0xff70c0, 0xff40a0, 0xffb0d8]), PF.GLOW | PF.WANDER | PF.BLINK | PF.AMBIENT);
    },
  },
  sparkles: {
    density: 1.0,
    spawn(ps, x, y) {
      ps.spawn(x, y, ps.range(-2, 2), ps.range(-3, 1), ps.range(3, 7), 1, pick(ps, [0xff90e0, 0xffffff, 0xd060ff]), PF.GLOW | PF.BLINK | PF.AMBIENT);
    },
  },
  dust: {
    density: 0.9,
    spawn(ps, x, y) {
      ps.spawn(x, y, ps.range(-3, 3), ps.range(-2, 3), ps.range(6, 12), 1, pick(ps, [0x6a5e52, 0x8a7a6a]), PF.WANDER | PF.AMBIENT);
    },
  },
  bubbles: {
    density: 0.7,
    spawn(ps, x, y) {
      ps.spawn(x, y, ps.range(-2, 2), ps.range(-12, -5), ps.range(4, 8), 1, pick(ps, [0xbfe4ff, 0x8ad0f0, 0xe0f8ff]), PF.GLOW | PF.WANDER | PF.AMBIENT);
    },
  },
};

/** Other names content may use for the same ambient kinds (e.g. the gen workstream's biome defs). */
const AMBIENT_ALIASES: Record<string, string> = {
  firefly: 'fireflies', glowflies: 'fireflies',
  ember: 'embers', ash: 'embers', sparks: 'embers',
  snowfall: 'snow', flurries: 'snow',
  spore: 'spores', fen_spores: 'spores', blight_motes: 'spores_pink', blight_spores: 'spores_pink', pink_spores: 'spores_pink',
  sparkle: 'sparkles', crystal_motes: 'sparkles', crystal_sparkles: 'sparkles', motes: 'sparkles',
  dust_motes: 'dust', cave_dust: 'dust',
  bubble: 'bubbles',
};

/** The ambient kind for a content name (canonical names, then aliases); undefined if unknown or 'none'. */
export function resolveAmbient(name: string): AmbientKind | undefined {
  return AMBIENT[name] ?? AMBIENT[AMBIENT_ALIASES[name] ?? ''];
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Top up ambient particles of `kind` inside (and slightly beyond) the view. Returns spawned count. */
export function updateAmbient(ps: ParticleSystem, kind: string, view: ViewBox, solid?: SolidFn, maxPerFrame = 6): number {
  const k = resolveAmbient(kind);
  if (!k) return 0;
  const m = 24;
  ps.cullAmbient(view.x - m * 2, view.y - m * 2, view.x + view.w + m * 2, view.y + view.h + m * 2);
  const target = Math.round((k.density * (view.w + m * 2) * (view.h + m * 2)) / 10000);
  let spawned = 0;
  for (let tries = 0; ps.ambientCount < target && spawned < maxPerFrame && tries < maxPerFrame * 3; tries++) {
    const x = view.x - m + ps.rand() * (view.w + m * 2);
    const y = k.from === 'top' && ps.ambientCount > target * 0.5 ? view.y - m + ps.rand() * m : view.y - m + ps.rand() * (view.h + m * 2);
    if (solid && solid(x, y)) continue;
    k.spawn(ps, x, y);
    spawned++;
  }
  return spawned;
}
