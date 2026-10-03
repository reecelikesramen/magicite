/**
 * Render generated levels to PNG (no canvas, no browser) for eyeballing the level generator.
 * Usage: bun scripts/gen-preview.ts <outDir> [seed=42] [biomes=all] [kinds=normal,boss,town] [district=auto] [scale=3]
 * Example: bun scripts/gen-preview.ts /tmp/shots 7 woods,fen normal
 * Env: CROP=x0,x1 renders only tile columns [x0, x1) (zoomed detail views).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Content } from '../src/content';
import { TILE } from '../src/sim/constants';
import { checkLevel, generateLevel, type GeneratedLevel, type LevelRequest } from '../src/sim/gen';
import { Tile, Wall } from '../src/sim/tiles';

const out = process.argv[2] ?? 'gen-preview';
const seed = Number(process.argv[3] ?? 42);
const biomes = (process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : [...Content.biomes.keys()].filter((b) => b !== 'lair'));
const kinds = (process.argv[5] ?? 'normal,boss,town').split(',') as LevelRequest['kind'][];
const districtArg = process.argv[6] && process.argv[6] !== 'auto' ? Number(process.argv[6]) : 0;
const S = Number(process.argv[7] ?? 3);

// --- tiny PNG encoder ---
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function png(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const raw = new Uint8Array(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())];
  const len = parts.reduce((a, p) => a + p.length, 0);
  const res = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    res.set(p, o);
    o += p.length;
  }
  return res;
}

const crop = process.env.CROP ? process.env.CROP.split(',').map(Number) : null;

function render(level: GeneratedLevel): { w: number; h: number; rgb: Uint8Array } {
  const g = level.grid;
  const pal = Content.biomes.get(level.info.biome)!.palette;
  const cx0 = crop ? Math.max(0, crop[0]!) : 0;
  const cx1 = crop ? Math.min(g.w, crop[1]!) : g.w;
  const W = (cx1 - cx0) * S;
  const H = g.h * S;
  const ox = cx0 * S;
  const rgb = new Uint8Array(W * H * 3);
  const rect = (x0: number, y0: number, w: number, h: number, c: number): void => {
    x0 -= ox;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.floor(y0 + h)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.floor(x0 + w)); x++) {
        const i = (y * W + x) * 3;
        rgb[i] = (c >> 16) & 255;
        rgb[i + 1] = (c >> 8) & 255;
        rgb[i + 2] = c & 255;
      }
    }
  };
  for (let ty = 0; ty < g.h; ty++) {
    for (let tx = cx0; tx < cx1; tx++) {
      const t = g.get(tx, ty);
      const exposed = g.get(tx, ty - 1) === Tile.AIR || g.get(tx, ty - 1) === Tile.PLATFORM;
      let c: number;
      switch (t) {
        case Tile.AIR:
          c = g.getWall(tx, ty) === Wall.NONE ? pal.sky : g.getWall(tx, ty) === Wall.BRICK ? 0x3a2e20 : g.getWall(tx, ty) === Wall.WOOD ? 0x2a1a0c : pal.wall[1]!;
          break;
        case Tile.GROUND:
          c = exposed ? pal.fringe[2]! : pal.ground[2]!;
          break;
        case Tile.ROCK:
          c = exposed ? pal.fringe[1]! : pal.rock[1]!;
          break;
        case Tile.BEDROCK:
          c = 0x101010;
          break;
        case Tile.PLATFORM:
          c = 0x8a5a30;
          break;
        case Tile.LADDER:
          c = 0xc8a070;
          break;
        case Tile.SPIKES:
          c = 0xe0e0e0;
          break;
        case Tile.WATER:
          c = 0x2050b0;
          break;
        case Tile.LAVA:
          c = 0xff6010;
          break;
        case Tile.BRICK:
          c = 0xa18c75;
          break;
        case Tile.WOOD:
          c = 0x7a4a24;
          break;
        case Tile.SPECIAL:
          c = pal.accent[1]!;
          break;
        default:
          c = 0xff00ff;
      }
      rect(tx * S, ty * S, S, S, c);
    }
  }
  const k = S / TILE;
  for (const l of level.lights) rect(l.x * k - 1, l.y * k - 1, 3, 3, 0xffff80);
  for (const s of level.spawns) {
    const r = Content.resources.get(s.def);
    let w = 6;
    let h = 6;
    let c = 0xaaaaaa;
    if (s.kind === 'resource' && r) {
      w = r.w;
      h = r.h;
      c = s.def.startsWith('tree_') ? 0x30c030 : s.def.startsWith('rock_') ? (s.def === 'rock_stone' ? 0x9a9a9a : s.def === 'rock_iron' ? 0xc0c8d8 : s.def === 'rock_gold' ? 0xffd040 : 0x60e0ff) : s.def.startsWith('chest') ? 0xffc000 : s.def === 'pot' ? 0xd08040 : r.critter ? 0xf0ff40 : 0x80ff80;
      if (s.def.startsWith('tree_')) w = 3;
    } else if (s.kind === 'enemy') {
      c = 0xff2020;
      w = 8;
      h = 8;
    } else if (s.kind === 'boss') {
      c = 0xff00ff;
      w = 32;
      h = 24;
    } else if (s.kind === 'npc') {
      c = 0x4080ff;
      w = 6;
      h = 12;
    } else {
      c = 0x707070;
      w = 3;
      h = 3;
    }
    rect((s.x - w / 2) * k, (s.y - h) * k, Math.max(1, w * k), Math.max(1, h * k), c);
  }
  for (const e of level.exits) {
    rect(e.x * k, e.y * k, e.w * k, 2, 0xff40ff);
    rect(e.x * k, (e.y + e.h) * k - 2, e.w * k, 2, 0xff40ff);
    rect(e.x * k, e.y * k, 2, e.h * k, 0xff40ff);
    rect((e.x + e.w) * k - 2, e.y * k, 2, e.h * k, 0xff40ff);
  }
  if (level.arena) {
    const a = level.arena;
    rect(a.x * k, a.y * k, a.w * k, 1, 0xff0000);
    rect(a.x * k, (a.y + a.h) * k, a.w * k, 1, 0xff0000);
  }
  for (const p of level.spawnPoints) rect(p.x * k - 1, p.y * k - 1, 2, 2, p.kind === 'giant' ? 0xff8000 : 0xff8080);
  rect(level.spawn.x * k - 3, level.spawn.y * k - 9, 6, 9, 0xffffff);
  return { w: W, h: H, rgb };
}

mkdirSync(out, { recursive: true });
for (const b of [...biomes, ...(process.argv[4] ? [] : ['lair'])]) {
  const def = Content.biomes.get(b);
  for (const kind of b === 'lair' ? (['lair'] as const) : kinds) {
    const district = districtArg || (kind === 'lair' ? 21 : (def?.depths.find((d) => d % 2 === 1) ?? 1));
    const t0 = performance.now();
    const level = generateLevel({ seed, district, biome: b, kind, nextBiomes: kind === 'town' ? [] : ['woods', 'fen', 'hollow'] });
    const ms = performance.now() - t0;
    const rep = checkLevel(level);
    const img = render(level);
    const file = `${out}/${b}-${kind}-${seed}${crop ? `-x${crop[0]}` : ''}.png`;
    writeFileSync(file, png(img.w, img.h, img.rgb));
    console.log(`${file} ${level.grid.w}x${level.grid.h} ${ms.toFixed(1)}ms spawns=${level.spawns.length} points=${level.spawnPoints.length} lights=${level.lights.length} softlocks=${rep.softLocks} ${rep.problems.length ? 'PROBLEMS ' + rep.problems.join('; ') : 'ok'}`);
  }
}
