import type { BiomeDef } from '../../content/types';

/**
 * Layout style per biome, layered on top of the BiomeDef `gen` knobs (which stay the tunable
 * content contract). Everything is in tiles.
 */
export interface GenStyle {
  /** Route: zone width range and big between-zone floor shift range. */
  zoneW: [number, number];
  shift: [number, number];
  /** Route: terrace segment width range, max step (≤ 3 so a single jump climbs it), chance per segment. */
  segW: [number, number];
  stepMax: number;
  stepChance: number;
  /** Route: headroom above the floor. */
  clearance: [number, number];
  /** How big up-shifts are climbed: weights for stairs / platform stacks / ladders. */
  climb: { stairs: number; platforms: number; ladder: number };
  /** Noise caverns: feature size (tiles per noise unit) and horizontal stretch. */
  cavernScale: number;
  cavernStretch: number;
  /** Extra corridors above/below the route, their headroom, and how they connect. */
  corridors: [number, number];
  corridorClearance: [number, number];
  corridorLen: [number, number];
  /** Route basins per 100 columns (filled with the biome liquid), and their width/depth. */
  basins: number;
  basinW: [number, number];
  basinDepth: [number, number];
  /** Basalt pillars rising out of wide basins (cinder) instead of plain platforms. */
  pillars: boolean;
  /** Floating ledges of the special tile (rime ice shelves). */
  specialLedges: number;
  /** Special tile usage: floor patches (ice/mud) or embedded glowing clusters (crystal/blight). */
  special: 'none' | 'floor' | 'cluster';
  specialLight?: { color: number; radius: number };
  /** Back wall: chance per open-area patch to show the far background instead. */
  wallWindows: number;
  /** Lantern lights (with a hanging lantern prop) per 100 columns. */
  lanterns: number;
  /** Chests / pots per 100 columns, secret pockets per level. */
  chests: number;
  pots: number;
  secrets: [number, number];
  /** Decoration props per 100 columns. */
  decor: number;
}

const BASE: GenStyle = {
  zoneW: [26, 40],
  shift: [5, 10],
  segW: [3, 8],
  stepMax: 2,
  stepChance: 0.35,
  clearance: [8, 13],
  climb: { stairs: 2, platforms: 2, ladder: 1 },
  cavernScale: 13,
  cavernStretch: 1.6,
  corridors: [1, 2],
  corridorClearance: [4, 7],
  corridorLen: [30, 70],
  basins: 0.8,
  basinW: [4, 9],
  basinDepth: [2, 3],
  pillars: false,
  specialLedges: 0,
  special: 'none',
  wallWindows: 0.04,
  lanterns: 0,
  chests: 1,
  pots: 1.2,
  secrets: [1, 2],
  decor: 18,
};

export const STYLES: Record<string, Partial<GenStyle>> = {
  // Rolling, surface-like terraces with tall headroom for tall trees.
  woods: {
    zoneW: [28, 44], shift: [4, 9], segW: [4, 10], stepMax: 3, stepChance: 0.45, clearance: [12, 17],
    climb: { stairs: 3, platforms: 2, ladder: 1 }, cavernScale: 14, corridors: [1, 2], basins: 0.6,
    wallWindows: 0.12, decor: 20,
  },
  // Low, flat and soggy: shallow pools everywhere, mud floors, little vertical movement.
  fen: {
    zoneW: [30, 48], shift: [3, 5], segW: [5, 12], stepMax: 1, stepChance: 0.25, clearance: [8, 12],
    climb: { stairs: 3, platforms: 2, ladder: 0 }, cavernScale: 12, cavernStretch: 2.2, corridors: [0, 1],
    basins: 3.2, basinW: [5, 12], basinDepth: [2, 3], special: 'floor', decor: 22,
  },
  // Mine tunnels and shafts: narrow corridors stacked on several levels joined by ladders.
  hollow: {
    zoneW: [22, 34], shift: [6, 12], segW: [4, 9], stepMax: 1, stepChance: 0.3, clearance: [5, 7],
    climb: { stairs: 1, platforms: 2, ladder: 3 }, cavernScale: 9, cavernStretch: 2.4, corridors: [3, 5],
    corridorClearance: [4, 6], corridorLen: [40, 90], basins: 0.3, lanterns: 5, chests: 1.3, pots: 2, decor: 16,
  },
  // Icy ledges: frequent 2–3 tile steps, ice shelves to hop across.
  rime: {
    zoneW: [24, 38], shift: [5, 10], segW: [3, 6], stepMax: 3, stepChance: 0.55, clearance: [9, 14],
    climb: { stairs: 3, platforms: 2, ladder: 0 }, cavernScale: 12, corridors: [1, 2], basins: 0.5,
    specialLedges: 4, special: 'floor', decor: 16,
  },
  // Huge open caverns studded with glowing crystal clusters.
  amethyst: {
    zoneW: [30, 46], shift: [5, 11], segW: [3, 7], stepMax: 2, stepChance: 0.4, clearance: [13, 20],
    climb: { stairs: 2, platforms: 3, ladder: 0 }, cavernScale: 17, cavernStretch: 1.3, corridors: [1, 2],
    basins: 0.4, special: 'cluster', specialLight: { color: 0xe274ee, radius: 30 }, wallWindows: 0.08, decor: 16,
  },
  // Lava lakes with basalt pillars, wide open halls.
  cinder: {
    zoneW: [28, 42], shift: [4, 8], segW: [4, 9], stepMax: 2, stepChance: 0.35, clearance: [11, 16],
    climb: { stairs: 2, platforms: 3, ladder: 0 }, cavernScale: 13, corridors: [0, 1], basins: 1.6,
    basinW: [6, 15], basinDepth: [2, 4], pillars: true, special: 'cluster', specialLight: { color: 0xff6010, radius: 20 },
    chests: 0.8, decor: 14,
  },
  lair: { special: 'cluster', specialLight: { color: 0xff40a0, radius: 28 }, decor: 14 },
};

export function styleFor(biome: BiomeDef): GenStyle {
  return { ...BASE, ...(STYLES[biome.id] ?? {}) };
}

/** Where a decor prop key sits. Unknown keys default to the floor. */
export type DecorPlacement = 'floor' | 'ceiling';

const CEILING_DECOR = new Set(['decor_vines', 'decor_roots', 'decor_stalactite', 'decor_icicles', 'decor_lantern', 'decor_blight_tendril', 'decor_glow_moss']);

export function decorPlacement(key: string): DecorPlacement {
  return CEILING_DECOR.has(key) ? 'ceiling' : 'floor';
}

/** Town look per biome: facade wall + roof tiles. */
export const LANTERN_LIGHT = { color: 0xffb040, radius: 28, intensity: 1 };
