import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/sim/constants';
import { CHUNK, Tile, TileGrid, Wall } from '../../src/sim/tiles';
import { biomeStyle } from '../../src/render/style';
import { crackStage } from '../../src/render/tiles/chunks';
import { makeCobble, patterns } from '../../src/render/tiles/pattern';
import { ATTEN_BY_DEPTH, ATTEN_SIZE, bladeHeight, CHUNK_PX, makeChunkBuffers, paintChunk, paintRegion, scanChunk, solidDepth } from '../../src/render/tiles/painter';

const SURFACE = 20;

/** 64×64 test level: ground from row 20 down, a lava pool, a water pool, an open-sky pocket. */
function testGrid(): TileGrid {
  const g = new TileGrid(64, 64);
  g.fillWall(0, 0, 63, 63, Wall.CAVE);
  g.fill(0, SURFACE, 63, 63, Tile.GROUND);
  g.fill(10, SURFACE, 14, SURFACE + 2, Tile.LAVA);
  g.fill(20, SURFACE, 24, SURFACE + 2, Tile.WATER);
  g.fillWall(2, 2, 8, 8, Wall.NONE);
  g.fill(4, 12, 7, 12, Tile.PLATFORM);
  return g;
}

const px = (buf: Uint8ClampedArray, x: number, y: number): [number, number, number, number] => {
  const o = (y * CHUNK_PX + x) * 4;
  return [buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!];
};
const rgbOf = (p: [number, number, number, number]): number => (p[0] << 16) | (p[1] << 8) | p[2];

describe('cobble patterns', () => {
  it('are deterministic and use every level', () => {
    const a = makeCobble({ size: 64, cell: 5, seed: 3 });
    const b = makeCobble({ size: 64, cell: 5, seed: 3 });
    expect(a.level).toEqual(b.level);
    const seen = new Set(a.level);
    for (const lv of [0, 1, 2, 3]) expect(seen.has(lv)).toBe(true);
    expect(() => makeCobble({ size: 60, cell: 5, seed: 1 })).toThrow();
    expect(patterns().ground.size).toBe(128);
  });
});

describe('tile painter', () => {
  const st = biomeStyle('woods');
  const g = testGrid();
  const buf = makeChunkBuffers();
  paintChunk(g, st, 0, 0, buf);

  it('paints opaque ground and back walls, leaves open sky transparent', () => {
    expect(px(buf.rgba, 5 * TILE + 3, 30 * TILE + 3)[3]).toBe(255);
    expect(px(buf.rgba, 30 * TILE + 3, 10 * TILE + 3)[3]).toBe(255);
    expect(px(buf.rgba, 5 * TILE + 3, 5 * TILE + 3)[3]).toBe(0);
  });

  it('grows grass blades above exposed ground tops', () => {
    const fringe = new Set(st.pal.fringe);
    let blades = 0;
    for (let x = 30 * TILE; x < 40 * TILE; x++) {
      for (let y = SURFACE * TILE - 3; y < SURFACE * TILE; y++) if (fringe.has(rgbOf(px(buf.rgba, x, y)))) blades++;
    }
    expect(blades).toBeGreaterThan(10);
    // The ground's own top row is grass-coloured too.
    let top = 0;
    for (let x = 30 * TILE; x < 40 * TILE; x++) if (fringe.has(rgbOf(px(buf.rgba, x, SURFACE * TILE)))) top++;
    expect(top).toBeGreaterThan(40);
  });

  it('marks lava as emissive and ground as non-emissive', () => {
    expect(px(buf.glow, 12 * TILE + 3, SURFACE * TILE)[3]).toBe(255);
    expect(px(buf.glow, 5 * TILE + 3, 30 * TILE + 3)[3]).toBe(0);
  });

  it('repainting a region after an edit only changes that region', () => {
    const before = buf.rgba.slice();
    g.set(26, 30, Tile.AIR);
    paintRegion(g, st, 0, 0, 25, 29, 27, 31, buf);
    let changedOutside = 0;
    let changedInside = 0;
    for (let y = 0; y < CHUNK_PX; y++) {
      for (let x = 0; x < CHUNK_PX; x++) {
        const o = (y * CHUNK_PX + x) * 4;
        const diff = before[o] !== buf.rgba[o] || before[o + 3] !== buf.rgba[o + 3];
        const inside = x >= 25 * TILE && x < 28 * TILE && y >= 29 * TILE && y < 32 * TILE;
        if (diff && inside) changedInside++;
        if (diff && !inside) changedOutside++;
      }
    }
    expect(changedInside).toBeGreaterThan(0);
    expect(changedOutside).toBe(0);
    g.set(26, 30, Tile.GROUND);
  });

  it('blade heights stay within 0..3 px for every fringe kind', () => {
    for (const fam of ['woods', 'fen', 'hollow', 'rime', 'amethyst', 'cinder', 'lair']) {
      const s = biomeStyle(fam);
      for (let x = 0; x < 200; x++) {
        const h = bladeHeight(s, x);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(3);
      }
    }
  });

  it('is deterministic', () => {
    const b2 = makeChunkBuffers();
    paintChunk(testGrid(), st, 0, 0, b2);
    const b3 = makeChunkBuffers();
    paintChunk(testGrid(), st, 0, 0, b3);
    expect(b2.rgba).toEqual(b3.rgba);
    expect(b2.glow).toEqual(b3.glow);
  });
});

describe('chunk scan (lights, liquids, attenuation)', () => {
  const g = testGrid();
  const st = biomeStyle('cinder');
  const meta = scanChunk(g, st, 0, 0);

  it('merges lava surfaces into emitters and finds liquid surfaces', () => {
    const lava = meta.emitters.filter((e) => e.color === 0xff8a30);
    expect(lava.length).toBe(1);
    expect(lava[0]!.w).toBe(5 * TILE);
    expect(meta.surfaces).toContainEqual({ tx0: 10, tx1: 14, ty: SURFACE, kind: 'lava' });
    expect(meta.surfaces).toContainEqual({ tx0: 20, tx1: 24, ty: SURFACE, kind: 'water' });
  });

  it('cinder crust on exposed ground tops emits light', () => {
    expect(meta.emitters.some((e) => e.color !== 0xff8a30 && e.y === SURFACE * TILE)).toBe(true);
  });

  it('records open sky where there is no back wall', () => {
    expect(meta.sky[5 * CHUNK + 5]).toBe(1);
    expect(meta.sky[15 * CHUNK + 15]).toBe(0);
    expect(meta.skyCount).toBe(7 * 7);
  });

  it('attenuates light with depth into solid ground (with a 1-tile neighbour ring)', () => {
    expect(meta.atten.length).toBe(ATTEN_SIZE * ATTEN_SIZE);
    const at = (tx: number, ty: number) => meta.atten[(ty + 1) * ATTEN_SIZE + (tx + 1)]!;
    expect(at(30, 10)).toBe(255);
    expect(at(30, SURFACE)).toBe(ATTEN_BY_DEPTH[1]);
    expect(at(30, SURFACE + 1)).toBe(ATTEN_BY_DEPTH[2]);
    expect(at(30, SURFACE + 10)).toBe(0);
    // Ring outside the level is dark.
    expect(meta.atten[0]).toBe(0);
    expect(solidDepth(g, 30, 10)).toBe(0);
    expect(solidDepth(g, 30, SURFACE + 2)).toBe(3);
    expect(solidDepth(g, 30, SURFACE + 9)).toBe(4);
  });
});

describe('mining cracks', () => {
  it('maps mining progress to 4 stages', () => {
    expect(crackStage(0, Tile.GROUND)).toBe(-1);
    expect(crackStage(1, Tile.GROUND)).toBe(0);
    expect(crackStage(12, Tile.GROUND)).toBe(2);
    expect(crackStage(24, Tile.GROUND)).toBe(3);
    expect(crackStage(240, Tile.GROUND)).toBe(3);
    expect(crackStage(128, Tile.BEDROCK)).toBe(2);
  });
});
