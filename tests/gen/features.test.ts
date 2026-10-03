import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { TILE } from '../../src/sim/constants';
import { describeLevel, generateLevel, type GeneratedLevel, type LevelRequest } from '../../src/sim/gen';
import { Tile, TILE_PROPS, Wall } from '../../src/sim/tiles';

/** Per-biome flavour and placement rules, over a modest number of seeds per biome. */
const SEEDS = 20;
const NEXT = ['woods', 'fen', 'hollow'];

function levels(biome: string, kind: LevelRequest['kind'] = 'normal', district?: number): GeneratedLevel[] {
  const def = Content.biomes.get(biome)!;
  const out: GeneratedLevel[] = [];
  for (let i = 0; i < SEEDS; i++) {
    out.push(generateLevel({ seed: 3 + i * 104729, district: district ?? def.depths[i % def.depths.length]!, biome, kind, nextBiomes: NEXT }));
  }
  return out;
}

const count = (l: GeneratedLevel, pred: (t: number) => boolean): number => {
  let n = 0;
  for (const t of l.grid.fg) if (pred(t)) n++;
  return n;
};
const per100 = (ls: GeneratedLevel[], pred: (l: GeneratedLevel) => number): number => (ls.reduce((a, l) => a + pred(l), 0) / ls.reduce((a, l) => a + l.grid.w, 0)) * 100;
const solid = (l: GeneratedLevel, tx: number, ty: number): boolean => TILE_PROPS[l.grid.get(tx, ty)]!.solid;

describe('biome flavour', () => {
  it('woods: tree groves, water, no lava', () => {
    const ls = levels('woods');
    expect(per100(ls, (l) => l.spawns.filter((s) => s.def === 'tree_woods').length)).toBeGreaterThan(6);
    for (const l of ls) expect(count(l, (t) => t === Tile.LAVA)).toBe(0);
    expect(ls.some((l) => count(l, (t) => t === Tile.WATER) > 0)).toBe(true);
  });

  it('fen: lots of water and mud floors', () => {
    const ls = levels('fen');
    for (const l of ls) expect(count(l, (t) => t === Tile.WATER)).toBeGreaterThan(20);
    expect(ls.filter((l) => count(l, (t) => t === Tile.SPECIAL) > 0).length).toBeGreaterThan(SEEDS / 2);
  });

  it('hollow: mine timber frames and lanterns', () => {
    for (const l of levels('hollow')) {
      let timber = 0;
      for (let i = 0; i < l.grid.bg.length; i++) if (l.grid.bg[i] === Wall.WOOD && l.grid.fg[i] === Tile.AIR) timber++;
      expect(timber).toBeGreaterThan(10);
      expect(l.spawns.some((s) => s.def === 'decor_lantern')).toBe(true);
      expect(l.lights.length).toBeGreaterThan(0);
    }
  });

  it('rime: ice tiles and icicles', () => {
    const ls = levels('rime');
    for (const l of ls) expect(count(l, (t) => t === Tile.SPECIAL)).toBeGreaterThan(5);
    expect(ls.some((l) => l.spawns.some((s) => s.def === 'icicle_cluster'))).toBe(true);
  });

  it('amethyst: glowing crystal clusters', () => {
    for (const l of levels('amethyst')) {
      expect(count(l, (t) => t === Tile.SPECIAL)).toBeGreaterThan(5);
      expect(l.lights.length).toBeGreaterThan(0);
    }
  });

  it('cinder: lava lakes that glow, no water', () => {
    for (const l of levels('cinder')) {
      expect(count(l, (t) => t === Tile.LAVA)).toBeGreaterThan(5);
      expect(count(l, (t) => t === Tile.WATER)).toBe(0);
      expect(l.lights.some((li) => li.color === 0xff6010)).toBe(true);
    }
  });

  it('towns use per-biome facade materials', () => {
    const wood = levels('woods', 'town').reduce((a, l) => a + count(l, (t) => t === Tile.WOOD), 0);
    const brick = levels('cinder', 'town').reduce((a, l) => a + count(l, (t) => t === Tile.BRICK), 0);
    const woodsBrick = levels('woods', 'town').reduce((a, l) => a + count(l, (t) => t === Tile.BRICK), 0);
    expect(wood).toBeGreaterThan(woodsBrick);
    expect(brick).toBeGreaterThan(0);
  });
});

describe('placement rules', () => {
  const all = ['woods', 'fen', 'hollow', 'rime', 'amethyst', 'cinder'].flatMap((b) => levels(b));

  it('gates ores by depth', () => {
    for (const l of all) {
      for (const s of l.spawns) {
        const d = Content.resources.get(s.def);
        if (d) expect(d.minDepth, `${s.def} at district ${l.info.district}`).toBeLessThanOrEqual(l.info.district);
      }
    }
    const deep = levels('cinder', 'normal', 19);
    expect(deep.some((l) => l.spawns.some((s) => s.def === 'rock_voidshard' || s.def === 'rock_diamond'))).toBe(true);
  });

  it('hangs ceiling growths and hanging props from solid ceilings', () => {
    let n = 0;
    for (const l of all) {
      for (const s of l.spawns) {
        const hanging = Content.resources.get(s.def)?.placement === 'ceiling';
        const prop = s.kind === 'prop' && s.data?.hang === 1;
        if (!hanging && !prop) continue;
        const tx = Math.floor(s.x / TILE);
        // Resources: y = ceiling surface. Props: y = bottom of the cell under the ceiling.
        const ceilRow = hanging ? s.y / TILE - 1 : s.y / TILE - 2;
        expect(solid(l, tx, ceilRow), `${s.def} at ${s.x},${s.y}`).toBe(true);
        expect(solid(l, tx, ceilRow + 1)).toBe(false);
        n++;
      }
    }
    expect(n).toBeGreaterThan(50);
  });

  it('stands ground resources and floor props on solid ground', () => {
    for (const l of all) {
      for (const s of l.spawns) {
        const d = Content.resources.get(s.def);
        const floorThing = (d && d.placement === 'ground') || (s.kind === 'prop' && !s.data?.hang) || s.kind === 'enemy';
        if (!floorThing || s.data?.point === 'ceiling' || s.data?.point === 'air') continue;
        expect(solid(l, Math.floor(s.x / TILE), s.y / TILE), `${s.kind} ${s.def} floating at ${s.x},${s.y}`).toBe(true);
      }
    }
  });

  it('spaces enemies out', () => {
    for (const l of levels('woods', 'normal', 7)) {
      const es = l.spawns.filter((s) => s.kind === 'enemy');
      for (let i = 0; i < es.length; i++) {
        for (let j = i + 1; j < es.length; j++) {
          const close = Math.abs(es[i]!.x - es[j]!.x) < 5 * TILE && Math.abs(es[i]!.y - es[j]!.y) < 4 * TILE;
          expect(close).toBe(false);
        }
      }
    }
  });

  it('hides secret chests in sealed pockets in most districts', () => {
    const secret = all.filter((l) => l.spawns.some((s) => s.def === 'chest_iron' && s.data?.secret === 1)).length;
    expect(secret).toBeGreaterThan(all.length / 2);
  });

  it('exposes typed spawn points for the enemies workstream', () => {
    const kinds = new Set(all.flatMap((l) => l.spawnPoints.map((p) => p.kind)));
    for (const k of ['ground', 'air', 'ceiling', 'turret', 'giant']) expect(kinds.has(k as never), k).toBe(true);
  });
});

describe('describeLevel', () => {
  it('prints a header and one row per tile row with spawn and portal markers', () => {
    const l = generateLevel({ seed: 1, district: 1, biome: 'woods', kind: 'normal', nextBiomes: NEXT });
    const txt = describeLevel(l);
    const rows = txt.split('\n');
    expect(rows[0]).toContain('District 1');
    expect(rows).toHaveLength(l.grid.h + 1);
    for (const r of rows.slice(1)) expect(r).toHaveLength(l.grid.w);
    expect(txt).toContain('S');
    for (const d of ['1', '2', '3']) expect(txt).toContain(d);
    const crop = describeLevel(l, { region: { x0: 0, y0: 0, x1: 9, y1: 4 }, entities: false }).split('\n');
    expect(crop).toHaveLength(6);
    expect(crop[1]).toBe('@'.repeat(10));
  });
});
