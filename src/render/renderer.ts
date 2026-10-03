import { Container, Sprite, type Application } from 'pixi.js';
import { Content } from '../content';
import { lerp } from '../engine/math';
import { TILE } from '../sim/constants';
import { Tile } from '../sim/tiles';
import type { Entity, GameEvent } from '../sim/types';
import type { Level, World } from '../sim/world';
import { Background } from './background';
import { Camera, type Bounds, type CameraTarget } from './camera';
import { blue, green, normalizeHue, ramp, red } from './color';
import { Compositor } from './compositor';
import { EntityViews } from './entities';
import { flicker, LightPool } from './lights';
import { damageColor, WorldOverlay } from './overlay';
import { updateAmbient } from './particles/ambient';
import { emitPreset } from './particles/presets';
import { ParticleSystem } from './particles/system';
import { ParticleView } from './particles/view';
import { flushAtlas, registerBuiltinSprites, setFrames, spriteSet } from './sprites';
import { biomeStyle, type BiomeStyle } from './style';
import { ChunkLayer } from './tiles/chunks';
import type { Emitter } from './tiles/painter';
import { haloTexture, lightTexture } from './tiles/textures';

/** Target native view; the scale is the largest integer that still shows at least this much. */
export const VIEW_W = 320;
export const VIEW_H = 180;

/** Look tunables (exposed for quick iteration from the console: `game.renderer.look`). */
export const LOOK = {
  /** Multiplier on palette.ambient·ambientLevel (the darkness of everything outside lights). */
  ambientBoost: 1.0,
  /** Minimum light on creatures/items (0 = as dark as terrain, 1 = unlit). */
  entityFloor: 0.6,
  bloom: 1.4,
  /** Static/level lights and portal lights. */
  portalLight: { radius: 44, intensity: 0.9 },
  lavaFlicker: 0.15,
};

interface PortalView {
  frame: Sprite;
  glow: Sprite;
  bars: Sprite | null;
  x: number;
  y: number;
  color: number;
}

/**
 * Render core. Reads the sim (never writes it): procedural tile chunks, sprite views, particles,
 * dynamic lighting with over-exposure, emissive glow + bloom, parallax haze, camera with lookahead,
 * shake and hit-stop flash, damage numbers and name tags. Public surface used by `Game`:
 * `draw(world, alpha, focus)`, `handleEvents(events, world)`, `screenToWorld`, `scale`, `viewW/H`, `camX/Y`.
 */
export class Renderer {
  /** Everything this renderer puts on the stage (composited world + world-space UI). */
  readonly root = new Container();
  readonly look = LOOK;
  scale = 4;
  /** Camera top-left in native px (smoothed, without shake). */
  camX = 0;
  camY = 0;

  private comp = new Compositor();
  private camera = new Camera();
  private chunks = new ChunkLayer();
  private background = new Background();
  private entities = new EntityViews();
  private particles = new ParticleSystem(4096);
  private particleView = new ParticleView();
  private lights: LightPool;
  private halos: LightPool;
  private overlay = new WorldOverlay();
  private portals = new Container();
  private portalGlows = new Container();
  private portalViews: PortalView[] = [];
  private emitters: Emitter[] = [];
  private level: Level | null = null;
  private style: BiomeStyle = biomeStyle('woods');
  private lastNow = 0;
  private time = 0;
  private flash = 0;
  private flashColor = 0xffffff;
  private gridRef: Level['grid'] | null = null;
  private readonly solidFn = (x: number, y: number): boolean => this.gridRef !== null && this.gridRef.solidAt(x, y);
  // Per-frame scratch (no allocations in draw()).
  private readonly view = { x: 0, y: 0, w: 0, h: 0 };
  private readonly levelBounds: Bounds = { x: 0, y: 0, w: 0, h: 0 };
  private readonly camTarget: CameraTarget = { x: 0, y: 0, vx: 0, vy: 0, grounded: true };
  private bubbleDt = 0;
  private readonly bubbleFn = (tx0: number, tx1: number, ty: number, kind: 'water' | 'lava'): void => {
    const ps = this.particles;
    const n = (tx1 - tx0 + 1) * this.bubbleDt * (kind === 'lava' ? 0.6 : 0.25);
    if (ps.rand() > n) return;
    const x = (tx0 + ps.rand() * (tx1 - tx0 + 1)) * TILE;
    if (kind === 'lava') emitPreset(ps, 'embers', x, ty * TILE, { count: 1 });
    else emitPreset(ps, 'bubble', x, ty * TILE + 3, { count: 1 });
  };

  constructor(private readonly app: Application) {
    registerBuiltinSprites();
    this.lights = new LightPool(lightTexture());
    this.halos = new LightPool(haloTexture(), 1);
    const c = this.comp;
    // Terrain layer: haze/parallax (screen space) → back wall + terrain chunks → water surfaces → cracks.
    c.terrain.root.addChildAt(this.background.root, 0);
    c.terrain.world.addChild(this.chunks.terrain, this.chunks.water, this.chunks.cracks);
    // Lit entity layer.
    const ev = this.entities;
    c.entities.world.addChild(ev.background, this.portals, ev.middle, ev.main, ev.front, ev.trails, this.particleView.lit);
    // Lightmap: sky (neutral light) + lights (additive) → depth attenuation (multiply).
    this.chunks.skyMasks.tint = 0x808080;
    c.light.world.addChild(this.chunks.skyMasks, this.lights.container, this.chunks.attenMasks);
    // Emissive (unlit) layer and bloom halos.
    c.emissive.world.addChild(this.chunks.emissive, this.portalGlows, ev.emissive, this.particleView.glow);
    c.bloom.world.addChild(this.halos.container);
    this.root.addChild(c.output, this.overlay.root);
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

  /** Particle system (other presentation code may emit presets directly). */
  emit(preset: string, x: number, y: number, count?: number, color?: number): void {
    emitPreset(this.particles, preset, x, y, { count, color });
  }

  private setLevel(world: World): void {
    const level = world.level;
    this.level = level;
    this.gridRef = level.grid;
    const def = Content.biomes.get(level.info.biome);
    this.style = biomeStyle(level.info.biome, def);
    this.chunks.setLevel(level.grid, this.style);
    this.background.setStyle(this.style, level.info.seed + level.info.district);
    this.entities.clear();
    this.particles.clear();
    this.overlay.clear();
    this.buildPortals(level);
    this.camera = new Camera();
  }

  private buildPortals(level: Level): void {
    for (const p of this.portalViews) {
      p.frame.destroy();
      p.glow.destroy();
      p.bars?.destroy();
    }
    this.portalViews.length = 0;
    const frameSet = spriteSet('exit_portal');
    const glowSet = spriteSet('exit_portal_glow');
    for (const ex of level.exits) {
      const x = Math.round(ex.x + ex.w / 2);
      const y = Math.round(ex.y + ex.h);
      const dest = ex.biome ? biomeStyle(ex.biome, Content.biomes.get(ex.biome)) : this.style;
      const frame = new Sprite(setFrames(frameSet, 'idle')[0]!);
      frame.anchor.set(frameSet.ox / frameSet.w, frameSet.oy / frameSet.h);
      frame.position.set(x, y);
      const glow = new Sprite(setFrames(glowSet, 'idle')[0]!);
      glow.anchor.set(glowSet.ox / glowSet.w, glowSet.oy / glowSet.h);
      glow.position.set(x, y);
      glow.tint = dest.portal;
      this.portals.addChild(frame);
      this.portalGlows.addChild(glow);
      this.portalViews.push({ frame, glow, bars: null, x, y, color: dest.portal });
    }
  }

  /** React to presentation events (particles, shake, damage numbers, flashes…). */
  handleEvents(events: readonly GameEvent[], world: World): void {
    const ps = this.particles;
    for (const ev of events) {
      switch (ev.type) {
        case 'particles':
          emitPreset(ps, ev.preset, ev.x, ev.y, { count: ev.count, color: ev.color, dirX: ev.dirX, dirY: ev.dirY });
          break;
        case 'damage': {
          this.overlay.damage(ev.x, ev.y, ev.amount, damageColor(ev.toPlayer, ev.crit, ev.damageType), ev.crit);
          const t = world.get(ev.target);
          const cy = t ? t.y + t.h / 2 : ev.y + 4;
          emitPreset(ps, 'hit_spark', ev.x, cy, { count: ev.crit ? 10 : 5 });
          if (t && t.kind !== 'resource') emitPreset(ps, this.isSlime(t) ? 'slime_splat' : 'blood', ev.x, cy, { count: Math.min(12, 3 + ev.amount), color: this.isSlime(t) ? this.slimeColor(t) : undefined });
          break;
        }
        case 'heal':
          this.overlay.heal(ev.x, ev.y, ev.amount);
          emitPreset(ps, 'heal', ev.x, ev.y + 4);
          break;
        case 'death': {
          if (ev.kind === 'enemy' || ev.kind === 'boss') {
            const big = ev.kind === 'boss';
            const slime = /slime/.test(Content.enemies.get(ev.def)?.sprite ?? ev.def);
            emitPreset(ps, slime ? 'slime_splat' : 'death_burst', ev.x, ev.y, { count: big ? 40 : 12 });
            emitPreset(ps, 'poof', ev.x, ev.y, { count: big ? 30 : 8 });
            if (big) this.camera.addShake(4, 20);
          } else if (ev.kind === 'resource') {
            const tool = Content.resources.get(ev.def)?.tool;
            emitPreset(ps, tool === 'axe' ? 'wood_chips' : tool === 'pickaxe' ? 'rock_chips' : 'poof', ev.x, ev.y, { count: 12 });
          } else if (ev.kind === 'projectile') {
            emitPreset(ps, 'hit_spark', ev.x, ev.y, { count: 4 });
          }
          break;
        }
        case 'shake':
          this.camera.addShake(ev.amount, ev.ticks);
          break;
        case 'hitstop':
          this.flash = Math.max(this.flash, Math.min(0.35, 0.05 * ev.ticks));
          this.flashColor = 0xffffff;
          break;
        case 'tileBroken':
          emitPreset(ps, 'tile_chips', ev.tx * TILE + 4, ev.ty * TILE + 4, { color: this.tileColor(ev.tile) });
          break;
        case 'resourceHit':
          this.entities.shake(ev.entity);
          break;
        case 'levelUp': {
          const e = world.playerEntity(ev.player);
          if (e) emitPreset(ps, 'levelup', e.x + e.w / 2, e.y + e.h / 2);
          break;
        }
        case 'downed': {
          const e = world.playerEntity(ev.player);
          if (e) emitPreset(ps, 'smoke', e.x + e.w / 2, e.y + e.h - 2);
          this.camera.addShake(3, 12);
          break;
        }
        case 'revived': {
          const e = world.playerEntity(ev.player);
          if (e) emitPreset(ps, 'heal', e.x + e.w / 2, e.y + e.h / 2, { count: 16 });
          break;
        }
        case 'pickup': {
          const e = world.playerEntity(ev.player);
          if (e && ev.item === 'gold') emitPreset(ps, 'coin_sparkle', e.x + e.w / 2, e.y + 2, { count: 3 });
          break;
        }
        case 'craft': {
          const e = world.playerEntity(ev.player);
          if (e && ev.result && ev.discovered) emitPreset(ps, 'magic', e.x + e.w / 2, e.y + 2, { count: 12, color: 0xfff080 });
          break;
        }
        default:
          break;
      }
    }
  }

  private isSlime(e: Entity): boolean {
    return e.kind === 'enemy' && /slime/.test(Content.enemies.get(e.def)?.sprite ?? e.def);
  }

  private slimeColor(e: Entity): number | undefined {
    const s = Content.enemies.get(e.def)?.sprite ?? e.def;
    if (/magma|lava|fire/.test(s)) return 0xff6020;
    if (/ice|frost/.test(s)) return 0x8ad0f0;
    if (/bog/.test(s)) return 0x7a9a3a;
    if (/blight/.test(s)) return 0xd04090;
    return undefined;
  }

  private tileColor(tile: number): number {
    const p = this.style.pal;
    switch (tile) {
      case Tile.ROCK:
      case Tile.BRICK:
        return ramp(p.rock, 2);
      case Tile.WOOD:
      case Tile.PLATFORM:
      case Tile.LADDER:
        return ramp(this.style.wood, 2);
      default:
        return ramp(p.ground, 3);
    }
  }

  draw(world: World, alpha: number, focus: Entity | undefined): void {
    const now = performance.now();
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 1 / 60;
    this.lastNow = now;
    this.time += dt;
    if (this.level !== world.level) this.setLevel(world);
    const level = world.level;
    const grid = level.grid;

    // --- scale + camera ------------------------------------------------------------------
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.scale = Math.max(1, Math.floor(Math.min(sw / VIEW_W, sh / VIEW_H)));
    const vw = sw / this.scale;
    const vh = sh / this.scale;
    const cam = this.camera;
    cam.setView(vw, vh);
    const lb = this.levelBounds;
    lb.w = grid.pixelWidth;
    lb.h = grid.pixelHeight;
    let bounds: Bounds = lb;
    if (focus) {
      const fx = lerp(focus.px, focus.x, alpha) + focus.w / 2;
      const fy = lerp(focus.py, focus.y, alpha) + focus.h / 2;
      const a = level.arena;
      if (a && level.locked && fx >= a.x && fx <= a.x + a.w && fy >= a.y && fy <= a.y + a.h) bounds = a;
      const inp = focus.playerIndex !== undefined ? world.inputs[focus.playerIndex] : undefined;
      const hasAim = !!inp && (inp.aimX !== 0 || inp.aimY !== 0);
      const t = this.camTarget;
      t.x = fx;
      t.y = fy;
      t.vx = focus.vx;
      t.vy = focus.vy;
      t.grounded = focus.onGround;
      t.aimX = hasAim ? inp!.aimX : undefined;
      t.aimY = hasAim ? inp!.aimY : undefined;
      cam.update(dt, t, bounds);
    } else cam.update(dt, null, bounds);
    this.camX = cam.x;
    this.camY = cam.y;
    const rx = cam.x + cam.shakeX;
    const ry = cam.y + cam.shakeY;
    const ix = Math.floor(rx);
    const iy = Math.floor(ry);
    const view = this.view;
    view.x = rx;
    view.y = ry;
    view.w = vw;
    view.h = vh;

    this.comp.resize(vw, vh);
    this.comp.setCamera(ix, iy);
    this.comp.floor = LOOK.entityFloor;
    this.comp.bloomStrength = LOOK.bloom;
    const pal = this.style.pal;
    const amb = normalizeHue(pal.ambient);
    const k = pal.ambientLevel * LOOK.ambientBoost;
    this.comp.setAmbient((red(amb) / 255) * k, (green(amb) / 255) * k, (blue(amb) / 255) * k);

    // --- world -----------------------------------------------------------------------------
    this.chunks.update(view, dt);
    this.background.update(this.comp.w, this.comp.h, rx, ry, grid.pixelHeight);
    const lights = this.lights;
    const halos = this.halos;
    lights.begin();
    halos.begin();
    for (const l of level.lights) lights.add(l.x, l.y, l.radius, l.color, l.intensity);
    this.drawPortals(level);
    this.emitters.length = 0;
    this.chunks.collectEmitters(view, 48, this.emitters);
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i]!;
      const fl = 1 - LOOK.lavaFlicker * flicker(i * 7 + Math.floor(e.x), this.time * 0.6);
      lights.add(e.x, e.y, e.radius, e.color, e.intensity * fl, e.w);
      halos.add(e.x, e.y, e.radius * 0.45, e.color, 0.18 * fl, e.w);
    }
    this.entities.sync(world, alpha, dt, view, this.style, lights, halos, this.particles);
    this.liquidBubbles(view, dt);
    updateAmbient(this.particles, this.style.ambientParticles, view, this.solidFn);
    this.particles.update(dt, this.time, this.solidFn);
    this.particleView.sync(this.particles, view, lights, halos);
    lights.end();
    halos.end();

    // --- world-space UI --------------------------------------------------------------------
    this.overlay.setCamera(this.scale, rx, ry);
    this.overlay.beginTags();
    for (const p of world.players) {
      const e = world.get(p.entityId);
      if (!e || p.out) continue;
      const v = this.entities.viewOf(e.id);
      const x = v ? v.x : lerp(e.px, e.x, alpha) + e.w / 2;
      const top = v ? v.y - (p.downed ? 6 : v.h - 1) : e.y;
      this.overlay.tag(e.id, p.name.toUpperCase(), x, top, p.downed ? 0xff8070 : 0xffffff, e === focus ? 0.85 : 1, p.downed ? p.reviveProgress / 120 : -1);
    }
    this.overlay.endTags();
    this.overlay.update(dt);

    // --- composite -------------------------------------------------------------------------
    this.flash = Math.max(0, this.flash - dt * 4);
    this.comp.setFlash(this.flash, this.flashColor);
    flushAtlas();
    this.comp.render(this.app.renderer, this.scale, rx - ix, ry - iy);
  }

  private drawPortals(level: Level): void {
    const t = this.time;
    const glowSet = spriteSet('exit_portal_glow');
    const frames = setFrames(glowSet, 'idle');
    const fi = Math.floor(t * 5) % frames.length;
    for (const p of this.portalViews) {
      p.glow.texture = frames[fi]!;
      p.glow.alpha = level.locked ? 0.25 : 0.85 + 0.15 * Math.sin(t * 3 + p.x);
      if (level.locked && !p.bars) {
        const bs = spriteSet('exit_portal_bars');
        p.bars = new Sprite(setFrames(bs, 'idle')[0]!);
        p.bars.anchor.set(bs.ox / bs.w, bs.oy / bs.h);
        p.bars.position.set(p.x, p.y);
        this.portals.addChild(p.bars);
      } else if (!level.locked && p.bars) {
        p.bars.destroy();
        p.bars = null;
      }
      const k = level.locked ? 0.3 : 1;
      this.lights.add(p.x, p.y - 10, LOOK.portalLight.radius, p.color, LOOK.portalLight.intensity * k);
      this.halos.add(p.x, p.y - 9, 16, p.color, 0.35 * k);
    }
  }

  /** Occasional bubbles / embers from liquid surfaces in view. */
  private liquidBubbles(view: { x: number; y: number; w: number; h: number }, dt: number): void {
    this.bubbleDt = dt;
    this.chunks.forEachSurface(view, this.bubbleFn);
  }
}
