import { TILE } from './constants';

/**
 * Tiles are generic *materials*; the level's biome decides how they look (palette, fringe).
 * e.g. GROUND in Mossgrave Woods renders as brown soil with green grass on exposed tops,
 * while GROUND in the volcano renders as dark basalt with a glowing lava crust.
 */
export const Tile = {
  AIR: 0,
  /** Main diggable earth of the biome (soil / sand / snow / basalt…). */
  GROUND: 1,
  /** Denser rock pockets inside GROUND; harder to dig. */
  ROCK: 2,
  /** Indestructible level border / boss arena walls. */
  BEDROCK: 3,
  /** One-way platform you can jump up through and drop down with Down+Jump. */
  PLATFORM: 4,
  LADDER: 5,
  /** Damaging floor hazard (biome-styled: thorns, icicles, spikes). */
  SPIKES: 6,
  WATER: 7,
  LAVA: 8,
  /** Man-made blocks for towns and ruins. */
  BRICK: 9,
  WOOD: 10,
  /** Biome special block: ice (slippery) / crystal (glows) / mud (slow) depending on biome. */
  SPECIAL: 11,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

export interface TileProps {
  id: TileId;
  name: string;
  /** Blocks movement from every side. */
  solid: boolean;
  /** Blocks only from above (land on top, pass through from below). */
  oneWay: boolean;
  climbable: boolean;
  liquid: boolean;
  /** Damage dealt per contact tick-window; 0 = harmless. */
  hazard: number;
  /** Mining hardness. 0 = cannot be broken. Pickaxe power must be >= hardness. */
  hardness: number;
  /** Ticks of continuous mining with a tier-1 pick to break (scaled by tool speed). */
  mineTime: number;
  /** Item dropped when broken ('' = nothing). */
  drop: string;
  /** Emits light (rendered as a glow). */
  emissive: boolean;
  /** Ground friction multiplier (ice < 1, mud > 1). */
  friction: number;
}

const base: Omit<TileProps, 'id' | 'name'> = {
  solid: false,
  oneWay: false,
  climbable: false,
  liquid: false,
  hazard: 0,
  hardness: 0,
  mineTime: 0,
  drop: '',
  emissive: false,
  friction: 1,
};

export const TILE_PROPS: readonly TileProps[] = [
  { ...base, id: Tile.AIR, name: 'air' },
  { ...base, id: Tile.GROUND, name: 'ground', solid: true, hardness: 1, mineTime: 24, drop: 'dirt' },
  { ...base, id: Tile.ROCK, name: 'rock', solid: true, hardness: 2, mineTime: 48, drop: 'stone' },
  { ...base, id: Tile.BEDROCK, name: 'bedrock', solid: true },
  { ...base, id: Tile.PLATFORM, name: 'platform', oneWay: true, hardness: 1, mineTime: 12, drop: 'wood' },
  { ...base, id: Tile.LADDER, name: 'ladder', climbable: true, hardness: 1, mineTime: 12, drop: 'wood' },
  { ...base, id: Tile.SPIKES, name: 'spikes', hazard: 1, hardness: 2, mineTime: 30 },
  { ...base, id: Tile.WATER, name: 'water', liquid: true },
  { ...base, id: Tile.LAVA, name: 'lava', liquid: true, hazard: 2, emissive: true },
  { ...base, id: Tile.BRICK, name: 'brick', solid: true, hardness: 3, mineTime: 60, drop: 'stone' },
  { ...base, id: Tile.WOOD, name: 'wood', solid: true, hardness: 1, mineTime: 20, drop: 'wood' },
  { ...base, id: Tile.SPECIAL, name: 'special', solid: true, hardness: 2, mineTime: 40 },
];

export function tileProps(id: number): TileProps {
  return TILE_PROPS[id] ?? TILE_PROPS[Tile.BEDROCK]!;
}

/** Background wall layer values. */
export const Wall = {
  NONE: 0,
  /** Natural cave back-wall (dimmer version of the biome's ground). */
  CAVE: 1,
  /** Man-made wall (towns, ruins). */
  BRICK: 2,
  WOOD: 3,
} as const;
export type WallId = (typeof Wall)[keyof typeof Wall];

export const CHUNK = 32; // tiles per render chunk edge

/**
 * The level's tile storage. Out-of-bounds reads return BEDROCK so the world is always closed.
 * Every mutation bumps a per-chunk version so the renderer can rebuild only what changed.
 */
export class TileGrid {
  readonly fg: Uint8Array;
  readonly bg: Uint8Array;
  /** Accumulated mining damage per tile (0..255), reset when the tile changes. */
  readonly dmg: Uint8Array;
  readonly chunksX: number;
  readonly chunksY: number;
  readonly chunkVersion: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.fg = new Uint8Array(w * h);
    this.bg = new Uint8Array(w * h);
    this.dmg = new Uint8Array(w * h);
    this.chunksX = Math.ceil(w / CHUNK);
    this.chunksY = Math.ceil(h / CHUNK);
    this.chunkVersion = new Uint32Array(this.chunksX * this.chunksY);
  }

  get pixelWidth(): number {
    return this.w * TILE;
  }

  get pixelHeight(): number {
    return this.h * TILE;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  get(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return Tile.BEDROCK;
    return this.fg[ty * this.w + tx]!;
  }

  getWall(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return Wall.CAVE;
    return this.bg[ty * this.w + tx]!;
  }

  set(tx: number, ty: number, id: number): void {
    if (!this.inBounds(tx, ty)) return;
    const i = ty * this.w + tx;
    if (this.fg[i] === id) return;
    this.fg[i] = id;
    this.dmg[i] = 0;
    this.touch(tx, ty);
  }

  setWall(tx: number, ty: number, id: number): void {
    if (!this.inBounds(tx, ty)) return;
    const i = ty * this.w + tx;
    if (this.bg[i] === id) return;
    this.bg[i] = id;
    this.touch(tx, ty);
  }

  /** Bump versions of the chunk containing (tx,ty) and neighbours whose edge tiles depend on it. */
  touch(tx: number, ty: number): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = Math.floor((tx + dx) / CHUNK);
        const cy = Math.floor((ty + dy) / CHUNK);
        if (cx < 0 || cy < 0 || cx >= this.chunksX || cy >= this.chunksY) continue;
        this.chunkVersion[cy * this.chunksX + cx]!++;
      }
    }
  }

  isSolid(tx: number, ty: number): boolean {
    return tileProps(this.get(tx, ty)).solid;
  }

  isOneWay(tx: number, ty: number): boolean {
    return tileProps(this.get(tx, ty)).oneWay;
  }

  /** Solid at a world-pixel position. */
  solidAt(px: number, py: number): boolean {
    return this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  fill(x0: number, y0: number, x1: number, y1: number, id: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, id);
  }

  fillWall(x0: number, y0: number, x1: number, y1: number, id: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.setWall(x, y, id);
  }

  clone(): TileGrid {
    const g = new TileGrid(this.w, this.h);
    g.fg.set(this.fg);
    g.bg.set(this.bg);
    g.dmg.set(this.dmg);
    return g;
  }
}

export const toTile = (px: number): number => Math.floor(px / TILE);
export const toPx = (t: number): number => t * TILE;
