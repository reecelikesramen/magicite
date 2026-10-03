import { Container, Graphics, Sprite } from 'pixi.js';
import { Content } from '../content';
import { lerp } from '../engine/math';
import { hash3 } from '../engine/rng';
import type { Entity, PlayerState } from '../sim/types';
import type { World } from '../sim/world';
import { animFrame, heldRestAngle, heldSpriteKey, spriteKeyFor, swingAngle } from './entity-keys';
import { flicker, type LightPool } from './lights';
import { emitPreset } from './particles/presets';
import type { ParticleSystem } from './particles/system';
import { setFlashFrames, setFrames, spriteSet, type FrameSet } from './sprites/atlas';
import { animFps } from './sprites/registry';
import type { BiomeStyle } from './style';

interface View {
  id: number;
  seen: number;
  key: string;
  set: FrameSet;
  sprite: Sprite;
  held: Sprite | null;
  heldKey: string;
  anim: string;
  t: number;
  shake: number;
  prevGround: boolean;
  prevVy: number;
  trailX: number;
  trailY: number;
  emissive: boolean;
  /** Variant frame for `meta.variants` sprites (trees). */
  variant: number;
  /** Render position this frame (anchor point, world px), for overlays. */
  ax: number;
  ay: number;
}

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Horizontal speed (px/s) above which players leave a dash streak. */
const DASH_SPEED = 120;

/** Tunables of how entities light the world. */
export const ENTITY_LIGHT = {
  /** Player light radius multiplier and centre over-exposure. */
  playerRadius: 1.35,
  playerIntensity: 1.6,
  /** Other entity lights. */
  radius: 1.1,
  intensity: 1.0,
};

/**
 * Pooled sprite views of sim entities: animation from `e.anim` + a render clock, facing flip,
 * hurt flash (white silhouette), invulnerability blink, resource hit shake, held items and melee
 * swing arcs, pickups bobbing, projectile rotation + trails, entity lights and glow halos.
 */
export class EntityViews {
  /** Layers inside the lit entity render texture (back → front). */
  readonly background = new Container();
  readonly middle = new Container();
  readonly main = new Container();
  readonly front = new Container();
  readonly trails = new Graphics();
  /** Unlit sprites (meta.emissive) — add to the emissive layer. */
  readonly emissive = new Container();
  private views = new Map<number, View>();
  private active: View[] = [];
  private freeSprites: Sprite[] = [];
  private frameNo = 0;
  time = 0;

  /** Resource-hit shake from `resourceHit` events. */
  shake(id: number): void {
    const v = this.views.get(id);
    if (v) v.shake = 0.18;
  }

  viewOf(id: number): { x: number; y: number; h: number } | null {
    const v = this.views.get(id);
    return v ? { x: v.ax, y: v.ay, h: v.set.h } : null;
  }

  clear(): void {
    for (const v of this.active) this.release(v);
    this.active.length = 0;
    this.views.clear();
    this.trails.clear();
  }

  sync(world: World, alpha: number, dt: number, view: ViewRect, style: BiomeStyle, lights: LightPool, halos: LightPool, ps: ParticleSystem): void {
    this.frameNo++;
    this.time += dt;
    const frame = this.frameNo;
    const players = world.players;
    const trails = this.trails;
    trails.clear();
    const vx0 = view.x - 48;
    const vx1 = view.x + view.w + 48;
    const vy0 = view.y - 32;
    const vy1 = view.y + view.h + 96;
    for (const e of world.entities) {
      if (e.dead) continue;
      const ix = lerp(e.px, e.x, alpha);
      const iy = lerp(e.py, e.y, alpha);
      const cx = ix + e.w / 2;
      const cy = iy + e.h / 2;
      // Lights reach beyond the entity, so test them before culling the sprite.
      if (e.light) this.addLight(e, cx, cy, view, style, lights);
      else if (e.kind === 'projectile') this.projectileLight(e, cx, cy, lights, halos);
      const onScreen = cx > vx0 && cx < vx1 && iy + e.h > vy0 && iy < vy1;
      let v = this.views.get(e.id);
      if (!onScreen) {
        if (v) v.seen = frame;
        if (v) v.sprite.visible = false;
        if (v?.held) v.held.visible = false;
        continue;
      }
      if (!v) v = this.create(e, players);
      v.seen = frame;
      this.updateView(v, e, ix, iy, dt, players, halos, ps);
    }
    // Release views of entities that no longer exist (compact in place, no allocation).
    let w = 0;
    for (let r = 0; r < this.active.length; r++) {
      const v = this.active[r]!;
      if (v.seen !== frame) {
        this.views.delete(v.id);
        this.release(v);
        continue;
      }
      this.active[w++] = v;
    }
    this.active.length = w;
  }

  private addLight(e: Entity, cx: number, cy: number, view: ViewRect, style: BiomeStyle, lights: LightPool): void {
    const l = e.light!;
    const isPlayer = e.kind === 'player';
    const r = l.radius * (isPlayer ? ENTITY_LIGHT.playerRadius : ENTITY_LIGHT.radius);
    if (cx + r < view.x || cx - r > view.x + view.w || cy + r < view.y || cy - r > view.y + view.h) return;
    let k = l.intensity * (isPlayer ? ENTITY_LIGHT.playerIntensity : ENTITY_LIGHT.intensity);
    if (l.flicker) k *= 1 - l.flicker * flicker(e.id, this.time);
    const color = isPlayer ? style.pal.playerLight || l.color : l.color;
    lights.add(cx, cy - (isPlayer ? 2 : 0), r, color, k);
  }

  /** Projectiles whose def declares a light but whose entity carries none. */
  private projectileLight(e: Entity, cx: number, cy: number, lights: LightPool, halos: LightPool): void {
    const def = e.projectile ? Content.projectiles.get(e.projectile.def) : undefined;
    const l = def?.light;
    if (!l) return;
    lights.add(cx, cy, l.radius * ENTITY_LIGHT.radius, l.color, 0.9);
    halos.add(cx, cy, Math.max(5, l.radius * 0.3), l.color, 0.5);
  }

  private create(e: Entity, players: readonly PlayerState[]): View {
    const key = spriteKeyFor(e, players);
    const set = spriteSet(key, { kind: e.kind, w: e.w, h: e.h, label: e.def });
    const sprite = this.freeSprites.pop() ?? new Sprite();
    sprite.visible = true;
    sprite.alpha = 1;
    sprite.rotation = 0;
    sprite.scale.set(1);
    sprite.tint = 0xffffff;
    const v: View = {
      id: e.id, seen: 0, key, set, sprite, held: null, heldKey: '', anim: '', t: 0, shake: 0,
      prevGround: e.onGround, prevVy: e.vy, trailX: e.x, trailY: e.y, emissive: false,
      variant: hash3(e.id, 17, 3), ax: 0, ay: 0,
    };
    this.attach(v, e);
    this.views.set(e.id, v);
    this.active.push(v);
    return v;
  }

  private attach(v: View, e: Entity): void {
    const meta = v.set.def.meta;
    v.emissive = !!meta?.emissive;
    const layer = v.emissive
      ? this.emissive
      : e.kind === 'resource' && Content.resources.get(e.resource?.def ?? e.def)?.background
        ? this.background
        : e.kind === 'resource' || e.kind === 'prop' || e.kind === 'pickup' || e.kind === 'npc'
          ? this.middle
          : e.kind === 'projectile' || e.kind === 'effect'
            ? this.front
            : this.main;
    layer.addChild(v.sprite);
    v.sprite.anchor.set(v.set.ox / v.set.w, v.set.oy / v.set.h);
  }

  private release(v: View): void {
    v.sprite.visible = false;
    v.sprite.removeFromParent();
    this.freeSprites.push(v.sprite);
    if (v.held) {
      v.held.visible = false;
      v.held.removeFromParent();
      this.freeSprites.push(v.held);
      v.held = null;
    }
  }

  private updateView(v: View, e: Entity, ix: number, iy: number, dt: number, players: readonly PlayerState[], halos: LightPool, ps: ParticleSystem): void {
    const s = v.sprite;
    s.visible = true;
    const p = e.kind === 'player' && e.playerIndex !== undefined ? players[e.playerIndex] : undefined;
    // Pickups can change item (merge); players can change race sprite (rare) → re-key.
    if (e.kind === 'pickup') {
      const key = spriteKeyFor(e, players);
      if (key !== v.key) {
        v.key = key;
        v.set = spriteSet(key, { kind: e.kind, w: e.w, h: e.h, label: e.def });
        v.sprite.anchor.set(v.set.ox / v.set.w, v.set.oy / v.set.h);
      }
    }
    const set = v.set;
    const def = set.def;
    const meta = def.meta;
    let anim = e.anim || 'idle';
    if (p?.downed) anim = 'downed';
    else if (e.swing && e.kind === 'player') anim = 'swing';
    if (anim !== v.anim) {
      v.anim = anim;
      v.t = 0;
    } else v.t += dt;
    const frames = e.hurt > 0 && !meta?.emissive ? setFlashFrames(set, anim) : setFrames(set, anim);
    let fi: number;
    if (meta?.variants) fi = v.variant % frames.length;
    else {
      const real = frames.length;
      fi = animFrame(real, animFps(def, anim), v.t + (e.kind === 'resource' ? 0 : (e.id % 7) * 0.13), def.once?.includes(anim) ?? false);
    }
    s.texture = frames[fi]!;

    // Anchor point: bottom-centre, or centre for projectiles.
    const centre = e.kind === 'projectile';
    let ax = ix + e.w / 2;
    let ay = centre ? iy + e.h / 2 : iy + e.h;
    if (meta?.bob) ay += Math.round(Math.sin(this.time * 3 + e.id) * 1.2) - 1;
    if (v.shake > 0) {
      v.shake -= dt;
      ax += Math.floor(v.shake * 60) % 2 === 0 ? 1 : -1;
    }
    v.ax = ax;
    v.ay = ay;
    s.position.set(Math.round(ax), Math.round(ay));
    if (meta?.rotate && (e.vx !== 0 || e.vy !== 0)) {
      s.rotation = Math.atan2(e.vy, e.vx);
      s.scale.set(1, 1);
    } else {
      s.rotation = 0;
      s.scale.set(e.facing < 0 ? -1 : 1, 1);
    }
    // Invulnerability blink (players) and fading pickups.
    s.alpha = e.kind === 'player' && e.invuln > 0 && !p?.downed && Math.floor(e.invuln / 4) % 2 === 0 ? 0.35 : 1;
    if (meta?.glow) halos.add(ax, ay - (centre ? 0 : set.h * 0.45), Math.max(6, Math.max(set.w, set.h) * 0.8), meta.glow, 0.45);

    // Jump puffs / landing dust (render-side juice derived from state changes).
    if (e.kind === 'player' || e.kind === 'enemy') {
      if (e.onGround && !v.prevGround && v.prevVy > 140) {
        emitPreset(ps, 'dust_land', ax - 2, iy + e.h - 1, { count: 3, dirX: -1 });
        emitPreset(ps, 'dust_land', ax + 2, iy + e.h - 1, { count: 3, dirX: 1 });
      } else if (!e.onGround && v.prevGround && e.vy < -60 && e.kind === 'player') emitPreset(ps, 'jump_puff', ax, iy + e.h - 1);
      // Dash streaks: much faster than walking (the controller's dash burst).
      if (e.kind === 'player' && Math.abs(e.vx) > DASH_SPEED && ps.rand() < 0.7) emitPreset(ps, 'dash', ax - e.facing * 3, iy + e.h * 0.5, { count: 1, dirX: -e.facing });
      v.prevGround = e.onGround;
      v.prevVy = e.vy;
    }
    if (e.kind === 'projectile') this.projectileTrail(v, e, ax, ay, ps);
    this.updateHeld(v, e, p, ax, ay);
  }

  private projectileTrail(v: View, e: Entity, ax: number, ay: number, ps: ParticleSystem): void {
    const def = e.projectile ? Content.projectiles.get(e.projectile.def) : undefined;
    const trail = def?.trail ?? (def?.light ? 'trail_fire' : '');
    if (!trail) return;
    const dx = ax - v.trailX;
    const dy = ay - v.trailY;
    if (dx * dx + dy * dy < 25) return;
    v.trailX = ax;
    v.trailY = ay;
    emitPreset(ps, trail, ax, ay, { count: 1, color: def?.light?.color });
  }

  private updateHeld(v: View, e: Entity, p: PlayerState | undefined, ax: number, ay: number): void {
    let itemId = e.held;
    if (e.swing) itemId = e.swing.item;
    else if (!itemId && p) itemId = p.inventory[p.selected]?.id;
    const def = itemId && !p?.downed ? Content.items.get(itemId) : undefined;
    if (!def || (e.kind !== 'player' && !e.swing && !e.held)) {
      if (v.held) v.held.visible = false;
      return;
    }
    const key = heldSpriteKey(def);
    if (!v.held) {
      v.held = this.freeSprites.pop() ?? new Sprite();
      v.held.alpha = 1;
      v.held.tint = 0xffffff;
    }
    const h = v.held;
    if (h.parent !== v.sprite.parent) v.sprite.parent?.addChild(h);
    if (v.heldKey !== key) {
      v.heldKey = key;
      const set = spriteSet(key, { kind: 'effect', w: 6, h: 3, label: def.id });
      h.texture = setFrames(set, 'idle')[0]!;
      h.anchor.set(set.ox / set.w, set.oy / set.h);
    }
    h.visible = v.sprite.visible;
    h.alpha = v.sprite.alpha;
    const f = e.facing < 0 ? -1 : 1;
    // Hand position relative to the feet anchor (chibi player: hand ≈ 2 px forward, 5 px up).
    const hx = Math.round(ax) + (e.swing ? 1 : 2) * f;
    const hy = Math.round(ay) - (e.kind === 'player' ? (e.swing ? 6 : 5) : Math.round(e.h * 0.5));
    let ang: number;
    if (e.swing) {
      const sw = swingAngle(e.swing.angle, f, e.swing.ticks, e.swing.total);
      ang = sw.angle;
      this.drawArc(hx, hy, sw.start, sw.angle, h.texture.width);
    } else {
      const rest = heldRestAngle(key);
      ang = f > 0 ? rest : Math.PI - rest;
    }
    h.position.set(hx, hy);
    h.rotation = ang;
    // Keep the art's top edge up when pointing left.
    h.scale.set(1, Math.cos(ang) < 0 ? -1 : 1);
    // Held item draws in front of the body when swinging or facing the camera side.
    const parent = h.parent;
    if (parent) {
      const si = parent.getChildIndex(v.sprite);
      const hi = parent.getChildIndex(h);
      if (hi < si) parent.setChildIndex(h, si);
    }
  }

  /** Pixel arc trail of a melee swing from `a0` to `a1` at the weapon's reach. */
  private drawArc(cx: number, cy: number, a0: number, a1: number, len: number): void {
    const g = this.trails;
    const r = Math.max(6, len - 1);
    const span = a1 - a0;
    const steps = Math.max(2, Math.ceil(Math.abs(span) * r));
    let lx = -9999;
    let ly = -9999;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = a0 + span * t;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (x === lx && y === ly) continue;
      lx = x;
      ly = y;
      g.rect(x, y, 1, 1).fill({ color: t > 0.7 ? 0xffffff : 0xc8d8ff, alpha: 0.15 + 0.75 * t });
      if (t > 0.45) {
        const x2 = Math.round(cx + Math.cos(a) * (r - 1));
        const y2 = Math.round(cy + Math.sin(a) * (r - 1));
        g.rect(x2, y2, 1, 1).fill({ color: 0xe8f0ff, alpha: 0.4 * t });
      }
    }
  }
}
