import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { TILE } from '../../sim/constants';
import { CHUNK, tileProps, type TileGrid } from '../../sim/tiles';
import type { BiomeStyle } from '../style';
import { CHUNK_PX, makeChunkBuffers, paintChunk, paintRegion, scanChunk, type ChunkBuffers, type ChunkMeta, type Emitter } from './painter';
import { crackTextures, surfaceTextures } from './textures';

const SNAP = CHUNK + 2;

interface SurfaceView {
  a: TilingSprite;
  b: TilingSprite;
  kind: 'water' | 'lava';
}

interface ChunkRec {
  cx: number;
  cy: number;
  version: number;
  buf: ChunkBuffers;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  sprite: Sprite;
  glowCanvas: HTMLCanvasElement | null;
  glowCtx: CanvasRenderingContext2D | null;
  glowImg: ImageData | null;
  glowSprite: Sprite | null;
  skyCanvas: HTMLCanvasElement | null;
  skySprite: Sprite | null;
  snapFg: Uint8Array;
  snapBg: Uint8Array;
  meta: ChunkMeta;
  surfaces: SurfaceView[];
}

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Tile chunk renderer: one canvas per 32×32-tile chunk (back wall + terrain) and an optional
 * emissive canvas, rebuilt lazily for visible chunks and *partially* repainted when
 * `grid.chunkVersion` changes (diffing a snapshot of the chunk's tiles to find the dirty rect).
 */
export class ChunkLayer {
  /** Lit terrain (under the lightmap). */
  readonly terrain = new Container();
  /** Animated water surfaces (lit). */
  readonly water = new Container();
  /** Mining crack overlays (lit). */
  readonly cracks = new Container();
  /** Emissive chunk overlays + lava surfaces (after the lightmap). */
  readonly emissive = new Container();
  /** Sky masks rendered into the lightmap (neutral light where the sky shows). */
  readonly skyMasks = new Container();

  private grid: TileGrid | null = null;
  private style: BiomeStyle | null = null;
  private chunks: (ChunkRec | undefined)[] = [];
  private crackPool: Sprite[] = [];
  private time = 0;
  /** Number of chunk (re)paints since level load (for tests/perf HUD). */
  paints = 0;

  setLevel(grid: TileGrid, style: BiomeStyle): void {
    this.clear();
    this.grid = grid;
    this.style = style;
    this.chunks = new Array(grid.chunksX * grid.chunksY);
  }

  clear(): void {
    for (const c of this.chunks) if (c) this.destroyChunk(c);
    this.chunks = [];
    this.grid = null;
    this.paints = 0;
  }

  private destroyChunk(c: ChunkRec): void {
    c.sprite.destroy({ texture: true, textureSource: true });
    c.glowSprite?.destroy({ texture: true, textureSource: true });
    c.skySprite?.destroy({ texture: true, textureSource: true });
    for (const s of c.surfaces) {
      s.a.destroy();
      s.b.destroy();
    }
  }

  /** Make sure chunks overlapping `view` (+margin) exist and are up to date; animate surfaces. */
  update(view: ViewRect, dt: number): void {
    const g = this.grid;
    if (!g) return;
    this.time += dt;
    const span = CHUNK * TILE;
    const x0 = Math.max(0, Math.floor((view.x - 16) / span));
    const y0 = Math.max(0, Math.floor((view.y - 16) / span));
    const x1 = Math.min(g.chunksX - 1, Math.floor((view.x + view.w + 16) / span));
    const y1 = Math.min(g.chunksY - 1, Math.floor((view.y + view.h + 16) / span));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = cy * g.chunksX + cx;
        const version = g.chunkVersion[key]!;
        const c = this.chunks[key];
        if (!c) this.chunks[key] = this.buildChunk(cx, cy, version);
        else if (c.version !== version) this.refreshChunk(c, version);
      }
    }
    // Visibility culling (cheap: a handful of chunks).
    for (const c of this.chunks) {
      if (!c) continue;
      const vis = c.cx >= x0 - 1 && c.cx <= x1 + 1 && c.cy >= y0 - 1 && c.cy <= y1 + 1;
      c.sprite.visible = vis;
      if (c.glowSprite) c.glowSprite.visible = vis;
      if (c.skySprite) c.skySprite.visible = vis;
      for (const s of c.surfaces) {
        s.a.visible = s.b.visible = vis;
        if (!vis) continue;
        if (s.kind === 'water') {
          s.a.tilePosition.x = Math.floor(this.time * 6) % 16;
          s.b.tilePosition.x = -Math.floor(this.time * 4) % 16;
        } else {
          s.a.tilePosition.x = Math.floor(this.time * 3) % 16;
          s.b.tilePosition.x = -Math.floor(this.time * 2) % 16;
          s.b.alpha = 0.6 + 0.4 * Math.sin(this.time * 3 + c.cx);
        }
      }
      if (c.glowSprite && vis) c.glowSprite.alpha = 0.88 + 0.12 * Math.sin(this.time * 2.2 + c.cx * 1.7 + c.cy);
    }
    this.updateCracks(view);
  }

  private snapshot(cx: number, cy: number, fg: Uint8Array, bg: Uint8Array): void {
    const g = this.grid!;
    const bx = cx * CHUNK - 1;
    const by = cy * CHUNK - 1;
    for (let y = 0; y < SNAP; y++) {
      for (let x = 0; x < SNAP; x++) {
        fg[y * SNAP + x] = g.get(bx + x, by + y);
        bg[y * SNAP + x] = g.getWall(bx + x, by + y);
      }
    }
  }

  private buildChunk(cx: number, cy: number, version: number): ChunkRec {
    const g = this.grid!;
    const st = this.style!;
    const buf = makeChunkBuffers();
    paintChunk(g, st, cx, cy, buf);
    this.paints++;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = CHUNK_PX;
    const ctx = canvas.getContext('2d')!;
    const img = new ImageData(buf.rgba as unknown as Uint8ClampedArray<ArrayBuffer>, CHUNK_PX, CHUNK_PX);
    ctx.putImageData(img, 0, 0);
    const sprite = new Sprite(Texture.from(canvas));
    sprite.position.set(cx * CHUNK_PX, cy * CHUNK_PX);
    this.terrain.addChild(sprite);
    const snapFg = new Uint8Array(SNAP * SNAP);
    const snapBg = new Uint8Array(SNAP * SNAP);
    this.snapshot(cx, cy, snapFg, snapBg);
    const rec: ChunkRec = {
      cx, cy, version, buf, canvas, ctx, img, sprite,
      glowCanvas: null, glowCtx: null, glowImg: null, glowSprite: null,
      skyCanvas: null, skySprite: null,
      snapFg, snapBg,
      meta: scanChunk(g, st, cx, cy),
      surfaces: [],
    };
    this.syncGlow(rec, 0, 0, CHUNK_PX, CHUNK_PX);
    this.syncMeta(rec);
    return rec;
  }

  /** Diff the tile snapshot, repaint only the dirty rect (changed tiles ± 1). */
  private refreshChunk(c: ChunkRec, version: number): void {
    const g = this.grid!;
    const st = this.style!;
    const bx = c.cx * CHUNK - 1;
    const by = c.cy * CHUNK - 1;
    let minX = 1e9;
    let minY = 1e9;
    let maxX = -1e9;
    let maxY = -1e9;
    for (let y = 0; y < SNAP; y++) {
      for (let x = 0; x < SNAP; x++) {
        const i = y * SNAP + x;
        const f = g.get(bx + x, by + y);
        const b = g.getWall(bx + x, by + y);
        if (f !== c.snapFg[i] || b !== c.snapBg[i]) {
          c.snapFg[i] = f;
          c.snapBg[i] = b;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    c.version = version;
    if (maxX < 0) return;
    const tx0 = bx + minX - 1;
    const ty0 = by + minY - 1;
    const tx1 = bx + maxX + 1;
    const ty1 = by + maxY + 1;
    paintRegion(g, st, c.cx, c.cy, tx0, ty0, tx1, ty1, c.buf);
    this.paints++;
    const lx0 = Math.max(0, tx0 - c.cx * CHUNK) * TILE;
    const ly0 = Math.max(0, ty0 - c.cy * CHUNK) * TILE;
    const lx1 = Math.min(CHUNK, tx1 - c.cx * CHUNK + 1) * TILE;
    const ly1 = Math.min(CHUNK, ty1 - c.cy * CHUNK + 1) * TILE;
    if (lx1 > lx0 && ly1 > ly0) {
      c.ctx.putImageData(c.img, 0, 0, lx0, ly0, lx1 - lx0, ly1 - ly0);
      c.sprite.texture.source.update();
      this.syncGlow(c, lx0, ly0, lx1 - lx0, ly1 - ly0);
    }
    c.meta = scanChunk(g, st, c.cx, c.cy);
    this.syncMeta(c);
  }

  private syncGlow(c: ChunkRec, x: number, y: number, w: number, h: number): void {
    const a = c.buf.glow;
    let any = false;
    for (let i = 3; i < a.length; i += 4) {
      if (a[i]! > 0) {
        any = true;
        break;
      }
    }
    if (!any && !c.glowCanvas) return;
    if (!c.glowCanvas) {
      c.glowCanvas = document.createElement('canvas');
      c.glowCanvas.width = c.glowCanvas.height = CHUNK_PX;
      c.glowCtx = c.glowCanvas.getContext('2d')!;
      c.glowImg = new ImageData(c.buf.glow as unknown as Uint8ClampedArray<ArrayBuffer>, CHUNK_PX, CHUNK_PX);
      c.glowCtx.putImageData(c.glowImg, 0, 0);
      c.glowSprite = new Sprite(Texture.from(c.glowCanvas));
      c.glowSprite.position.set(c.cx * CHUNK_PX, c.cy * CHUNK_PX);
      this.emissive.addChild(c.glowSprite);
      return;
    }
    c.glowCtx!.putImageData(c.glowImg!, 0, 0, x, y, w, h);
    c.glowSprite!.texture.source.update();
  }

  private syncMeta(c: ChunkRec): void {
    // Sky mask (1 px per tile, upscaled with linear filtering into the lightmap).
    if (c.meta.skyCount > 0) {
      if (!c.skyCanvas) {
        c.skyCanvas = document.createElement('canvas');
        c.skyCanvas.width = c.skyCanvas.height = CHUNK;
      }
      const ctx = c.skyCanvas.getContext('2d')!;
      const img = ctx.createImageData(CHUNK, CHUNK);
      for (let i = 0; i < CHUNK * CHUNK; i++) {
        const v = c.meta.sky[i] ? 255 : 0;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = img.data[i * 4 + 3] = v;
      }
      ctx.putImageData(img, 0, 0);
      if (!c.skySprite) {
        const tex = Texture.from(c.skyCanvas);
        tex.source.scaleMode = 'linear';
        c.skySprite = new Sprite(tex);
        c.skySprite.position.set(c.cx * CHUNK_PX, c.cy * CHUNK_PX);
        c.skySprite.scale.set(TILE);
        c.skySprite.blendMode = 'add';
        this.skyMasks.addChild(c.skySprite);
      } else c.skySprite.texture.source.update();
    } else if (c.skySprite) {
      c.skySprite.destroy({ texture: true, textureSource: true });
      c.skySprite = null;
      c.skyCanvas = null;
    }
    // Liquid surfaces.
    for (const s of c.surfaces) {
      s.a.destroy();
      s.b.destroy();
    }
    c.surfaces.length = 0;
    const tex = surfaceTextures();
    for (const s of c.meta.surfaces) {
      const w = (s.tx1 - s.tx0 + 1) * TILE;
      const pair = s.kind === 'water' ? tex.water : tex.lava;
      const a = new TilingSprite({ texture: pair[0], width: w, height: pair[0].height });
      const b = new TilingSprite({ texture: pair[1], width: w, height: pair[1].height });
      const y = s.ty * TILE - (s.kind === 'water' ? 1 : 1);
      a.position.set(s.tx0 * TILE, y);
      b.position.set(s.tx0 * TILE, y);
      const layer = s.kind === 'water' ? this.water : this.emissive;
      layer.addChild(a, b);
      c.surfaces.push({ a, b, kind: s.kind });
    }
  }

  /** Emitters of chunks overlapping the view (appended to `out`). */
  collectEmitters(view: ViewRect, margin: number, out: Emitter[]): void {
    const g = this.grid;
    if (!g) return;
    const span = CHUNK * TILE;
    const x0 = Math.max(0, Math.floor((view.x - margin) / span));
    const y0 = Math.max(0, Math.floor((view.y - margin) / span));
    const x1 = Math.min(g.chunksX - 1, Math.floor((view.x + view.w + margin) / span));
    const y1 = Math.min(g.chunksY - 1, Math.floor((view.y + view.h + margin) / span));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.chunks[cy * g.chunksX + cx];
        if (!c) continue;
        for (const e of c.meta.emitters) {
          if (e.x + e.w / 2 + e.radius < view.x - margin || e.x - e.w / 2 - e.radius > view.x + view.w + margin) continue;
          if (e.y + e.radius < view.y - margin || e.y - e.radius > view.y + view.h + margin) continue;
          out.push(e);
        }
      }
    }
  }

  /** Liquid surfaces of loaded chunks overlapping the view (for bubble particles). */
  forEachSurface(view: ViewRect, fn: (tx0: number, tx1: number, ty: number, kind: 'water' | 'lava') => void): void {
    for (const c of this.chunks) {
      if (!c || !c.sprite.visible) continue;
      for (const s of c.meta.surfaces) {
        if ((s.tx1 + 1) * TILE < view.x || s.tx0 * TILE > view.x + view.w || s.ty * TILE < view.y || s.ty * TILE > view.y + view.h) continue;
        fn(s.tx0, s.tx1, s.ty, s.kind);
      }
    }
  }

  private updateCracks(view: ViewRect): void {
    const g = this.grid!;
    const tex = crackTextures();
    const tx0 = Math.max(0, Math.floor(view.x / TILE));
    const ty0 = Math.max(0, Math.floor(view.y / TILE));
    const tx1 = Math.min(g.w - 1, Math.floor((view.x + view.w) / TILE));
    const ty1 = Math.min(g.h - 1, Math.floor((view.y + view.h) / TILE));
    let n = 0;
    const dmg = g.dmg;
    for (let ty = ty0; ty <= ty1; ty++) {
      const row = ty * g.w;
      for (let tx = tx0; tx <= tx1; tx++) {
        const d = dmg[row + tx]!;
        if (d === 0) continue;
        const stage = crackStage(d, g.fg[row + tx]!);
        if (stage < 0) continue;
        let s = this.crackPool[n];
        if (!s) {
          s = new Sprite(tex[0]!);
          this.crackPool.push(s);
          this.cracks.addChild(s);
        }
        s.texture = tex[stage]!;
        s.visible = true;
        s.position.set(tx * TILE, ty * TILE);
        n++;
      }
    }
    for (let i = n; i < this.crackPool.length; i++) this.crackPool[i]!.visible = false;
  }
}

/**
 * Crack overlay stage 0..3 for a tile's accumulated mining damage, or -1 for none.
 * Contract: `grid.dmg` counts mining progress in the same units as `TileProps.mineTime`
 * (tiles without a mineTime fall back to a 0..255 scale).
 */
export function crackStage(dmg: number, tileId: number): number {
  if (dmg <= 0) return -1;
  const mt = tileProps(tileId).mineTime;
  const f = mt > 0 ? dmg / mt : dmg / 255;
  return Math.min(3, Math.floor(f * 4));
}
