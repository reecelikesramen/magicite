import { generateLevel, type LevelRequest } from '../sim/gen';
import { CHUNK, TileGrid } from '../sim/tiles';
import type { Level } from '../sim/world';
import { type ByteReader, type ByteWriter, type StringSink, type StringTable, readValue, writeValue } from './codec';

/**
 * Level synchronisation.
 *
 * Levels are regenerated on clients from their `LevelRequest` (generateLevel is pure); the host
 * then streams a reliable, ordered *tile edit log* on top: every tile whose fg/bg differs from what
 * clients have. The host tracks this with a shadow copy of the client-visible grid and diffs only
 * chunks whose `chunkVersion` changed, so it catches every mutation path (mining, bombs, placing,
 * onLoad decoration) without hooks in the sim.
 *
 * Fallback: if a level has no `request` (generator not wired), the host transfers the grid itself
 * (RLE, a few KB) plus the level metadata.
 */

/** Flat edit list: [index, fg, bg, index, fg, bg, …]. */
export type TileEdits = number[];

export class TileTracker {
  private shadowFg: Uint8Array;
  private shadowBg: Uint8Array;
  private readonly pristineFg: Uint8Array;
  private readonly pristineBg: Uint8Array;
  private versions: Uint32Array;

  /** `base` is the grid clients start from (regenerated pristine level, or the transferred copy). */
  constructor(live: TileGrid, base: TileGrid) {
    if (base.w !== live.w || base.h !== live.h) throw new Error('TileTracker: grid size mismatch');
    this.pristineFg = base.fg.slice();
    this.pristineBg = base.bg.slice();
    this.shadowFg = base.fg.slice();
    this.shadowBg = base.bg.slice();
    // Force a full scan on the first collect() (captures changes made while loading the level).
    this.versions = new Uint32Array(live.chunkVersion.length).fill(0xffffffff);
  }

  /** Append edits for every tile that changed since the last call; returns the number added. */
  collect(live: TileGrid, out: TileEdits): number {
    const before = out.length;
    const cv = live.chunkVersion;
    for (let c = 0; c < cv.length; c++) {
      if (cv[c] === this.versions[c]) continue;
      this.versions[c] = cv[c]!;
      const cx = c % live.chunksX;
      const cy = (c / live.chunksX) | 0;
      const x0 = cx * CHUNK;
      const y0 = cy * CHUNK;
      const x1 = Math.min(live.w, x0 + CHUNK);
      const y1 = Math.min(live.h, y0 + CHUNK);
      for (let y = y0; y < y1; y++) {
        let i = y * live.w + x0;
        for (let x = x0; x < x1; x++, i++) {
          const fg = live.fg[i]!;
          const bg = live.bg[i]!;
          if (fg !== this.shadowFg[i] || bg !== this.shadowBg[i]) {
            this.shadowFg[i] = fg;
            this.shadowBg[i] = bg;
            out.push(i, fg, bg);
          }
        }
      }
    }
    return (out.length - before) / 3;
  }

  /** Compacted log for a late joiner: every tile that differs from the base grid. */
  compactLog(live: TileGrid): TileEdits {
    const out: TileEdits = [];
    const n = live.w * live.h;
    for (let i = 0; i < n; i++) {
      if (live.fg[i] !== this.pristineFg[i] || live.bg[i] !== this.pristineBg[i]) out.push(i, live.fg[i]!, live.bg[i]!);
    }
    return out;
  }
}

/** Sorted, delta-coded edit list. */
export function writeEdits(w: ByteWriter, edits: TileEdits): void {
  const n = edits.length / 3;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => edits[a * 3]! - edits[b * 3]!);
  w.uvar(n);
  let prev = 0;
  for (const k of order) {
    const idx = edits[k * 3]!;
    w.uvar(idx - prev);
    prev = idx;
    w.u8(edits[k * 3 + 1]!);
    w.u8(edits[k * 3 + 2]!);
  }
}

export function readEdits(r: ByteReader): TileEdits {
  const n = r.uvar();
  if (n * 3 > r.remaining) throw new RangeError('edits: bad count');
  const out: TileEdits = new Array(n * 3);
  let idx = 0;
  for (let i = 0; i < n; i++) {
    idx += r.uvar();
    out[i * 3] = idx;
    out[i * 3 + 1] = r.u8();
    out[i * 3 + 2] = r.u8();
  }
  return out;
}

/** Apply edits through TileGrid.set/setWall so chunk versions bump (renderer rebuilds). */
export function applyEdits(grid: TileGrid, edits: TileEdits): void {
  for (let k = 0; k < edits.length; k += 3) {
    const i = edits[k]!;
    if (i < 0 || i >= grid.w * grid.h) continue;
    const x = i % grid.w;
    const y = (i / grid.w) | 0;
    grid.set(x, y, edits[k + 1]!);
    grid.setWall(x, y, edits[k + 2]!);
  }
}

function writeRle(w: ByteWriter, a: Uint8Array): void {
  let i = 0;
  while (i < a.length) {
    const v = a[i]!;
    let j = i + 1;
    while (j < a.length && a[j] === v) j++;
    w.u8(v);
    w.uvar(j - i);
    i = j;
  }
}

function readRle(r: ByteReader, out: Uint8Array): void {
  let i = 0;
  while (i < out.length) {
    const v = r.u8();
    const n = r.uvar();
    if (n === 0 || i + n > out.length) throw new RangeError('rle: bad run');
    out.fill(v, i, i + n);
    i += n;
  }
}

export function writeGrid(w: ByteWriter, g: TileGrid): void {
  w.uvar(g.w);
  w.uvar(g.h);
  writeRle(w, g.fg);
  writeRle(w, g.bg);
}

export function readGrid(r: ByteReader): TileGrid {
  const w = r.uvar();
  const h = r.uvar();
  if (w <= 0 || h <= 0 || w * h > 4_000_000) throw new RangeError('grid: bad size');
  const g = new TileGrid(w, h);
  readRle(r, g.fg);
  readRle(r, g.bg);
  return g;
}

/** Level fields that are not plain metadata. */
const NON_META = new Set(['grid', 'spawns', 'request']);

/** Full level transfer (fallback when the level has no request). */
export function writeLevelFull(w: ByteWriter, level: Level, sink: StringSink): void {
  const meta: Record<string, unknown> = {};
  for (const k of Object.keys(level)) if (!NON_META.has(k)) meta[k] = (level as unknown as Record<string, unknown>)[k];
  writeValue(w, meta, sink);
  writeGrid(w, level.grid);
}

export function readLevelFull(r: ByteReader, table: StringTable): Level {
  const meta = readValue(r, table) as Record<string, unknown>;
  const grid = readGrid(r);
  return { ...(meta as unknown as Level), grid, spawns: [] };
}

/** The level request a level was generated from, if the run flow recorded it. */
export function levelRequestOf(level: Level): LevelRequest | undefined {
  return level.request;
}

/** Client: rebuild a level locally from its request (spawns are dropped: entities come from snapshots). */
export function regenerateLevel(req: LevelRequest): Level {
  const level = generateLevel(req);
  level.request = req;
  level.spawns = [];
  return level;
}
