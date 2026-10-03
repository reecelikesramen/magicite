import { Content } from '../../src/content';
import { Rng } from '../../src/engine/rng';
import { TILE } from '../../src/sim/constants';
import { styleFor } from '../../src/sim/gen/styles';
import type { GenCtx, LevelRequest } from '../../src/sim/gen/types';
import { Tile, TileGrid, Wall } from '../../src/sim/tiles';
import type { ExitPortal } from '../../src/sim/world';

const CHAR_TILE: Record<string, number> = {
  ' ': Tile.AIR,
  '.': Tile.AIR,
  S: Tile.AIR,
  E: Tile.AIR,
  '#': Tile.GROUND,
  '%': Tile.ROCK,
  '@': Tile.BEDROCK,
  '=': Tile.PLATFORM,
  H: Tile.LADDER,
  '^': Tile.SPIKES,
  '~': Tile.WATER,
  '&': Tile.LAVA,
};

export interface AsciiLevel {
  grid: TileGrid;
  /** Feet cell of the `S` marker. */
  spawn: { tx: number; ty: number };
  /** One 1×2-tile exit rect (px) per `E` marker (its feet cell + the cell above). */
  exits: ExitPortal[];
}

/**
 * Build a grid from ASCII rows (legend as describeLevel: `#` ground `%` rock `@` bedrock `=` platform
 * `H` ladder `^` spikes `~` water `&` lava, space/`.` air, `S` spawn feet, `E` exit feet). Rows are
 * padded to the widest one with air; the grid gets a bedrock frame.
 */
export function gridFromAscii(rows: string[]): AsciiLevel {
  const w = Math.max(...rows.map((r) => r.length)) + 2;
  const h = rows.length + 2;
  const grid = new TileGrid(w, h);
  grid.fg.fill(Tile.BEDROCK);
  grid.bg.fill(Wall.CAVE);
  let spawn = { tx: -1, ty: -1 };
  const exits: ExitPortal[] = [];
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < w - 2; rx++) {
      const ch = row[rx] ?? ' ';
      const t = CHAR_TILE[ch];
      if (t === undefined) throw new Error(`unknown tile char "${ch}"`);
      const x = rx + 1;
      const y = ry + 1;
      grid.fg[y * w + x] = t;
      if (ch === 'S') spawn = { tx: x, ty: y };
      if (ch === 'E') exits.push({ x: x * TILE, y: (y - 1) * TILE, w: TILE, h: 2 * TILE, biome: `exit${exits.length}` });
    }
  });
  return { grid, spawn, exits };
}

/** A minimal generator context around a hand-made grid (for repair tests). */
export function ctxFromAscii(rows: string[], biome = 'woods'): GenCtx & { asciiExits: ExitPortal[] } {
  const { grid, spawn, exits } = gridFromAscii(rows);
  const b = Content.biomes.get(biome)!;
  const req: LevelRequest = { seed: 1, district: 1, biome, kind: 'normal', nextBiomes: exits.map((e) => e.biome) };
  return {
    req,
    biome: b,
    style: styleFor(b),
    rng: new Rng(1),
    grid,
    w: grid.w,
    h: grid.h,
    flags: new Uint8Array(grid.w * grid.h),
    floor: new Int16Array(grid.w).fill(-1),
    spawnTx: spawn.tx,
    spawnTy: spawn.ty,
    exits,
    spawns: [],
    points: [],
    lights: [],
    depth: 0,
    asciiExits: exits,
  };
}
