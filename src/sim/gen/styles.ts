import type { BiomeDef } from '../../content/types';

/**
 * Layout style per biome, layered on top of the BiomeDef `gen` knobs (which stay the tunable
 * content contract). Everything is in tiles.
 */
export interface GenStyle {
  /** Route: zone width range and big between-zone floor shift range. */
  zoneW: [number, number];
  /** Route: smallest "real" height change between zones, and the max rise of one transition. */
  shift: [number, number];
  /** Route: columns per macro hill/valley of the floor curve. */
  macroLen: number;
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
  /** Mine timber frames (back-wall posts + beam) per 100 columns. */
  supports: number;
  /** Chests / pots per 100 columns, secret pockets per level. */
  chests: number;
  pots: number;
  secrets: [number, number];
  /** Decoration props per 100 columns. */
  decor: number;
  /** Harvestables per 100 columns (× BiomeDef.resourceDensity): trees, rock/ore nodes, plants, bugs, ceiling growths. */
  trees: number;
  rocks: number;
  plants: number;
  bugs: number;
  hangers: number;
}

const BASE: GenStyle = {
  zoneW: [26, 40],
  shift: [5, 10],
  macroLen: 70,
  segW: [3, 8],
  stepMax: 2,
  stepChance: 0.35,
  clearance: [8, 13],
  climb: { stairs: 2, platforms: 2, ladder: 1 },
  cavernScale: 13,
  cavernStretch: 1.6,
  corridors: [2, 3],
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
  supports: 0,
  chests: 1,
  pots: 1.2,
  secrets: [1, 2],
  decor: 18,
  trees: 4,
  rocks: 5,
  plants: 4,
  bugs: 2,
  hangers: 2,
};

export const STYLES: Record<string, Partial<GenStyle>> = {
  // Rolling, surface-like terraces with tall headroom for tall trees.
  woods: {
    zoneW: [28, 44], shift: [4, 9], segW: [4, 10], stepMax: 3, stepChance: 0.45, clearance: [12, 17],
    climb: { stairs: 3, platforms: 2, ladder: 1 }, cavernScale: 14, corridors: [2, 3], basins: 0.6,
    wallWindows: 0.12, decor: 20, trees: 9, rocks: 5, plants: 6, bugs: 3, hangers: 3,
  },
  // Low, flat and soggy: shallow pools everywhere, mud floors, little vertical movement.
  fen: {
    zoneW: [30, 48], shift: [3, 5], segW: [5, 12], stepMax: 1, stepChance: 0.25, clearance: [8, 12],
    climb: { stairs: 3, platforms: 2, ladder: 0 }, cavernScale: 12, cavernStretch: 2.2, corridors: [1, 2],
    basins: 3.2, basinW: [5, 12], basinDepth: [2, 3], special: 'floor', decor: 22, trees: 5, rocks: 3, plants: 7, bugs: 4, hangers: 4,
  },
  // Mine tunnels and shafts: narrow corridors stacked on several levels joined by ladders.
  hollow: {
    zoneW: [22, 34], shift: [6, 12], segW: [4, 9], stepMax: 1, stepChance: 0.3, clearance: [5, 7],
    climb: { stairs: 1, platforms: 2, ladder: 3 }, cavernScale: 9, cavernStretch: 2.4, corridors: [4, 6],
    corridorClearance: [4, 6], corridorLen: [40, 90], basins: 0.3, lanterns: 5, supports: 6, chests: 1.3, pots: 2, decor: 16,
    trees: 1.5, rocks: 9, plants: 3, bugs: 2, hangers: 2,
  },
  // Icy ledges: frequent 2–3 tile steps, ice shelves to hop across.
  rime: {
    zoneW: [24, 38], shift: [5, 10], segW: [3, 6], stepMax: 3, stepChance: 0.55, clearance: [9, 14],
    climb: { stairs: 3, platforms: 2, ladder: 0 }, cavernScale: 12, corridors: [2, 3], basins: 0.5,
    specialLedges: 4, special: 'floor', decor: 16, trees: 6, rocks: 6, plants: 4, bugs: 2, hangers: 3,
  },
  // Huge open caverns studded with glowing crystal clusters.
  amethyst: {
    zoneW: [30, 46], shift: [5, 11], segW: [3, 7], stepMax: 2, stepChance: 0.4, clearance: [13, 20],
    climb: { stairs: 2, platforms: 3, ladder: 0 }, cavernScale: 17, cavernStretch: 1.3, corridors: [2, 3],
    basins: 0.4, special: 'cluster', specialLight: { color: 0xe274ee, radius: 30 }, wallWindows: 0.08, decor: 16,
    trees: 4, rocks: 7, plants: 4, bugs: 3, hangers: 3,
  },
  // Lava lakes with basalt pillars, wide open halls.
  cinder: {
    zoneW: [28, 42], shift: [4, 8], segW: [6, 14], stepMax: 2, stepChance: 0.25, clearance: [11, 16],
    climb: { stairs: 2, platforms: 3, ladder: 0 }, cavernScale: 13, corridors: [1, 2], basins: 2,
    basinW: [5, 15], basinDepth: [2, 4], pillars: true, special: 'cluster', specialLight: { color: 0xff6010, radius: 20 },
    chests: 0.8, decor: 14, trees: 2.5, rocks: 7, plants: 1, bugs: 2, hangers: 0,
  },
  lair: { special: 'cluster', specialLight: { color: 0xff40a0, radius: 28 }, decor: 14, trees: 1, rocks: 3, plants: 1, bugs: 1, hangers: 1 },
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

/** Hanging lantern light (district tunnels, town eaves and lamp posts). */
export const LANTERN_LIGHT = { color: 0xffb040, radius: 28, intensity: 1 };
