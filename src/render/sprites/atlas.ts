import { Rectangle, Texture } from 'pixi.js';
import { hashSeed } from '../../engine/rng';
import { css, mix, shade } from '../color';
import { drawTextToCanvas, measureText } from '../pixelfont';
import { pickAnim, registryVersion, resolveSpriteDef, ShelfPacker, spriteOrigin, type PixelContext, type SpriteDef } from './registry';

/**
 * Lazily rasterises sprite frames into shared 1024² canvas pages → Pixi textures.
 * `getFrames(key, anim)` is the public entry point; unknown keys get a labelled placeholder.
 */
const PAGE = 1024;
const PAD = 1;

interface Page {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  packer: ShelfPacker;
  base: Texture;
  dirty: boolean;
}

export interface FrameSet {
  key: string;
  def: SpriteDef;
  w: number;
  h: number;
  /** Pivot in sprite px. */
  ox: number;
  oy: number;
  placeholder: boolean;
  anims: Map<string, Texture[]>;
  flash: Map<string, Texture[]>;
  version: number;
}

const pages: Page[] = [];
const sets = new Map<string, FrameSet>();

function newPage(): Page {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PAGE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  const base = Texture.from(canvas);
  base.source.scaleMode = 'nearest';
  const p: Page = { canvas, ctx, packer: new ShelfPacker(PAGE, PAGE), base, dirty: true };
  pages.push(p);
  return p;
}

function alloc(w: number, h: number): { page: Page; x: number; y: number } {
  let page = pages[pages.length - 1] ?? newPage();
  let r = page.packer.alloc(w + PAD * 2, h + PAD * 2);
  if (!r) {
    page = newPage();
    r = page.packer.alloc(w + PAD * 2, h + PAD * 2);
    if (!r) throw new Error(`sprite frame ${w}x${h} too large for atlas`);
  }
  page.dirty = true;
  return { page, x: r.x + PAD, y: r.y + PAD };
}

function frameTexture(page: Page, x: number, y: number, w: number, h: number): Texture {
  return new Texture({ source: page.base.source, frame: new Rectangle(x, y, w, h) });
}

function rasterize(key: string, def: SpriteDef, anim: string, frame: number): Texture {
  const { page, x, y } = alloc(def.w, def.h);
  const ctx = page.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, def.w, def.h);
  ctx.clip();
  ctx.translate(x, y);
  try {
    def.draw(ctx as PixelContext as CanvasRenderingContext2D, anim, frame, { key, seed: hashSeed(key) });
  } catch (err) {
    console.warn(`sprite ${key}/${anim}/${frame} failed`, err);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, def.w, def.h);
  }
  ctx.restore();
  return frameTexture(page, x, y, def.w, def.h);
}

/** White silhouette copy of an already rasterised frame (hurt flash). */
function silhouette(src: Texture): Texture {
  const f = src.frame;
  const srcPage = pages.find((p) => p.base.source === src.source)!;
  const data = srcPage.ctx.getImageData(f.x, f.y, f.width, f.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! > 0) {
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = 255;
    }
  }
  const { page, x, y } = alloc(f.width, f.height);
  page.ctx.putImageData(data, x, y);
  return frameTexture(page, x, y, f.width, f.height);
}

/** Placeholder hints for keys nobody has drawn yet. */
export interface PlaceholderSpec {
  kind: string;
  w: number;
  h: number;
  label: string;
}

const KIND_COLORS: Record<string, number> = {
  player: 0xf0c8a0,
  enemy: 0x5ce65c,
  boss: 0xc02020,
  projectile: 0xffd040,
  pickup: 0xe0c040,
  resource: 0x8a6a44,
  npc: 0x8080ff,
  prop: 0xaaaaaa,
  companion: 0xff80c0,
  effect: 0xffffff,
};

export function placeholderDef(spec: PlaceholderSpec): SpriteDef {
  const w = Math.max(2, Math.min(64, Math.round(spec.w)));
  const h = Math.max(2, Math.min(64, Math.round(spec.h)));
  const base = KIND_COLORS[spec.kind] ?? 0xff00ff;
  const letter = (spec.label[0] ?? '?').toUpperCase();
  return {
    w,
    h,
    anims: { idle: 1 },
    origin: spec.kind === 'projectile' ? { x: w / 2, y: h / 2 } : { x: w / 2, y: h },
    draw(ctx) {
      ctx.fillStyle = css(0x0c0a08);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = css(shade(base, 0.75));
      ctx.fillRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = css(mix(base, 0xffffff, 0.3));
      ctx.fillRect(1, 1, w - 2, 1);
      const lw = measureText(letter);
      if (w >= lw + 2 && h >= 9) drawTextToCanvas(ctx as CanvasRenderingContext2D, letter, Math.floor((w - lw) / 2), Math.floor((h - 7) / 2), css(0x101010));
    },
  };
}

function buildSet(key: string, def: SpriteDef, placeholder: boolean): FrameSet {
  const o = spriteOrigin(def);
  const set: FrameSet = { key, def, w: def.w, h: def.h, ox: o.x, oy: o.y, placeholder, anims: new Map(), flash: new Map(), version: registryVersion() };
  sets.set(key, set);
  return set;
}

/**
 * The frame set for a sprite key. If nothing defines the key, a placeholder is generated from
 * `fallback` (entity kind + hitbox + label) or a generic magenta box.
 */
export function spriteSet(key: string, fallback?: PlaceholderSpec): FrameSet {
  const cur = sets.get(key);
  if (cur && (cur.version === registryVersion() || cur.placeholder === false)) {
    if (cur.version === registryVersion()) return cur;
    // Registry changed: re-resolve, keep if still the same def.
    const d = resolveSpriteDef(key);
    if (d === cur.def) {
      cur.version = registryVersion();
      return cur;
    }
  }
  const def = resolveSpriteDef(key);
  if (def) return buildSet(key, def, false);
  const spec = fallback ?? { kind: 'effect', w: 8, h: 8, label: key.replace(/^[a-z]+_/, '') };
  const phKey = `ph:${spec.kind}:${Math.round(spec.w)}x${Math.round(spec.h)}:${spec.label[0] ?? '?'}`;
  let ph = sets.get(phKey);
  if (!ph) ph = buildSet(phKey, placeholderDef(spec), true);
  sets.set(key, ph);
  return ph;
}

/** Textures for one anim (falls back to a sensible anim the sprite has). */
export function setFrames(set: FrameSet, anim: string): Texture[] {
  let arr = set.anims.get(anim);
  if (arr) return arr;
  const real = pickAnim(set.def, anim);
  arr = set.anims.get(real);
  if (!arr) {
    arr = [];
    const n = set.def.anims[real]!;
    for (let i = 0; i < n; i++) arr.push(rasterize(set.key, set.def, real, i));
    set.anims.set(real, arr);
  }
  if (real !== anim) set.anims.set(anim, arr);
  return arr;
}

export function setFlashFrames(set: FrameSet, anim: string): Texture[] {
  let arr = set.flash.get(anim);
  if (arr) return arr;
  arr = setFrames(set, anim).map(silhouette);
  set.flash.set(anim, arr);
  return arr;
}

/** Public API: textures of `key`'s `anim` (placeholder for unknown keys). */
export function getFrames(key: string, anim = 'idle'): Texture[] {
  return setFrames(spriteSet(key), anim);
}

/** First idle frame of a key — handy for UI icons. */
export function getIcon(key: string): Texture {
  return getFrames(key, 'idle')[0]!;
}

/** Upload pages that received new frames since the last call (once per rendered frame). */
export function flushAtlas(): void {
  for (const p of pages) {
    if (!p.dirty) continue;
    p.dirty = false;
    p.base.source.update();
  }
}

export function atlasStats(): { pages: number; sets: number } {
  return { pages: pages.length, sets: sets.size };
}
