import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { Content } from '../content';
import { hash01 } from '../engine/rng';
import { lerp } from '../engine/math';
import { TILE } from '../sim/constants';
import { CHUNK, Tile, tileProps } from '../sim/tiles';
import type { Entity, GameEvent } from '../sim/types';
import type { World } from '../sim/world';

/** Target native view; the scale is the largest integer that still shows at least this much. */
export const VIEW_W = 320;
export const VIEW_H = 180;

const KIND_COLORS: Record<string, number> = {
  player: 0xf0c8a0,
  enemy: 0x5ce65c,
  boss: 0xc02020,
  projectile: 0xffd040,
  pickup: 0xe0c040,
  resource: 0x7a4a24,
  npc: 0x8080ff,
  prop: 0xaaaaaa,
  companion: 0xff80c0,
  effect: 0xffffff,
};

function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

/**
 * PLACEHOLDER renderer (scaffold): chunked tile canvases + tinted rectangles for entities.
 * The render workstream replaces internals (procedural sprites, lighting, glow, parallax,
 * particles) but keeps this public surface: `draw(world, alpha)`, `screenToWorld`, `scale`.
 */
export class Renderer {
  readonly root = new Container();
  readonly world = new Container();
  private tiles = new Container();
  private ents = new Container();
  private chunkSprites = new Map<number, { sprite: Sprite; canvas: HTMLCanvasElement; version: number }>();
  private entSprites = new Map<number, Sprite>();
  private portal = new Graphics();
  private levelRef: unknown = null;
  scale = 4;
  camX = 0;
  camY = 0;

  constructor(private readonly app: Application) {
    this.world.addChild(this.tiles, this.portal, this.ents);
    this.root.addChild(this.world);
    app.stage.addChild(this.root);
  }

  get viewW(): number {
    return this.app.screen.width / this.scale;
  }

  get viewH(): number {
    return this.app.screen.height / this.scale;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: sx / this.scale + this.camX, y: sy / this.scale + this.camY };
  }

  private rebuildLevel(world: World): void {
    for (const c of this.chunkSprites.values()) c.sprite.destroy({ texture: true, textureSource: true });
    this.chunkSprites.clear();
    for (const s of this.entSprites.values()) s.destroy();
    this.entSprites.clear();
    this.levelRef = world.level;
    this.portal.clear();
    for (const ex of world.level.exits) this.portal.rect(ex.x, ex.y, ex.w, ex.h).fill({ color: 0x7ac040, alpha: 0.35 }).stroke({ color: 0x8a8a8a, width: 2 });
  }

  private drawChunk(world: World, cx: number, cy: number, canvas: HTMLCanvasElement): void {
    const g = world.level.grid;
    const biome = Content.biomes.get(world.level.info.biome);
    const pal = biome?.palette;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(CHUNK * TILE, CHUNK * TILE);
    const d = img.data;
    const ground = pal?.ground ?? [0x3b2a1a, 0x4e3822];
    const fringe = pal?.fringe ?? [0x3f8f2a, 0x8fdc5a];
    const rock = pal?.rock ?? [0x3e3e44, 0x5a5a60];
    const wall = pal?.wall ?? [0x0a0806, 0x1f170e];
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const wx = cx * CHUNK + tx;
        const wy = cy * CHUNK + ty;
        if (!g.inBounds(wx, wy)) continue;
        const id = g.get(wx, wy);
        const wallId = g.getWall(wx, wy);
        const exposedTop = tileProps(id).solid && !tileProps(g.get(wx, wy - 1)).solid;
        for (let py = 0; py < TILE; py++) {
          for (let px = 0; px < TILE; px++) {
            const gx = wx * TILE + px;
            const gy = wy * TILE + py;
            const n = hash01(gx >> 1, gy >> 1, id);
            let col = -1;
            let a = 255;
            switch (id) {
              case Tile.AIR:
                if (wallId) col = wall[Math.floor(n * wall.length)]!;
                break;
              case Tile.GROUND:
                col = exposedTop && py < 2 + (hash01(gx, wy) < 0.4 ? 1 : 0) ? fringe[Math.floor(n * fringe.length)]! : ground[Math.floor(n * ground.length)]!;
                break;
              case Tile.ROCK:
              case Tile.BRICK:
                col = rock[Math.floor(n * rock.length)]!;
                break;
              case Tile.BEDROCK:
                col = rock[0]!;
                break;
              case Tile.PLATFORM:
                if (py < 2) col = 0x8a5a2a;
                break;
              case Tile.LADDER:
                if (px === 1 || px === 6 || py % 3 === 0) col = 0x7a4a24;
                break;
              case Tile.WATER:
                col = 0x2050c0;
                a = 150;
                break;
              case Tile.LAVA:
                col = py < 2 ? 0xffd040 : 0xff6020;
                break;
              case Tile.SPIKES:
                if (py >= TILE - 1 - Math.abs(px - 3.5) * 2) col = 0xc8c8c8;
                break;
              default:
                col = 0x808080;
            }
            if (col < 0) continue;
            const o = ((ty * TILE + py) * CHUNK * TILE + tx * TILE + px) * 4;
            const [r, gg, b] = rgb(col);
            d[o] = r;
            d[o + 1] = gg;
            d[o + 2] = b;
            d[o + 3] = a;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  private syncChunks(world: World): void {
    const g = world.level.grid;
    const x0 = Math.max(0, Math.floor(this.camX / TILE / CHUNK));
    const y0 = Math.max(0, Math.floor(this.camY / TILE / CHUNK));
    const x1 = Math.min(g.chunksX - 1, Math.floor((this.camX + this.viewW) / TILE / CHUNK));
    const y1 = Math.min(g.chunksY - 1, Math.floor((this.camY + this.viewH) / TILE / CHUNK));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = cy * g.chunksX + cx;
        const version = g.chunkVersion[key]!;
        let c = this.chunkSprites.get(key);
        if (!c) {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = CHUNK * TILE;
          this.drawChunk(world, cx, cy, canvas);
          const sprite = new Sprite(Texture.from(canvas));
          sprite.position.set(cx * CHUNK * TILE, cy * CHUNK * TILE);
          this.tiles.addChild(sprite);
          c = { sprite, canvas, version };
          this.chunkSprites.set(key, c);
        } else if (c.version !== version) {
          this.drawChunk(world, cx, cy, c.canvas);
          c.sprite.texture.source.update();
          c.version = version;
        }
      }
    }
  }

  private entitySprite(e: Entity): Sprite {
    let s = this.entSprites.get(e.id);
    if (!s) {
      s = new Sprite(Texture.WHITE);
      s.tint = KIND_COLORS[e.kind] ?? 0xffffff;
      this.ents.addChild(s);
      this.entSprites.set(e.id, s);
    }
    return s;
  }

  /** React to presentation events (particles, shake, damage numbers…). */
  handleEvents(_events: readonly GameEvent[], _world: World): void {}

  draw(world: World, alpha: number, focus: Entity | undefined): void {
    if (this.levelRef !== world.level) this.rebuildLevel(world);
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.scale = Math.max(1, Math.floor(Math.min(sw / VIEW_W, sh / VIEW_H)));

    if (focus) {
      const fx = lerp(focus.px, focus.x, alpha) + focus.w / 2;
      const fy = lerp(focus.py, focus.y, alpha) + focus.h / 2;
      const g = world.level.grid;
      this.camX = Math.max(0, Math.min(g.pixelWidth - this.viewW, fx - this.viewW / 2));
      this.camY = Math.max(0, Math.min(g.pixelHeight - this.viewH, fy - this.viewH / 2));
    }
    this.world.scale.set(this.scale);
    this.world.position.set(Math.round(-this.camX * this.scale), Math.round(-this.camY * this.scale));
    this.syncChunks(world);

    const seen = new Set<number>();
    for (const e of world.entities) {
      if (e.dead) continue;
      seen.add(e.id);
      const s = this.entitySprite(e);
      s.position.set(lerp(e.px, e.x, alpha), lerp(e.py, e.y, alpha));
      s.width = e.w;
      s.height = e.h;
      s.alpha = e.invuln > 0 && e.kind === 'player' && Math.floor(e.invuln / 4) % 2 === 0 ? 0.4 : 1;
    }
    for (const [id, s] of this.entSprites) {
      if (!seen.has(id)) {
        s.destroy();
        this.entSprites.delete(id);
      }
    }
  }
}
