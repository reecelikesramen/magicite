/**
 * Procedural sprite registry (pure, DOM-free). Other workstreams fill it with generators:
 *
 *   defineSprite('enemy_toad', { w: 10, h: 8, anims: { idle: 2, move: 4 }, draw(ctx, anim, frame, opts) { … } });
 *
 * Generators draw native-scale pixel art with plain canvas 2D calls (`fillStyle` + `fillRect`)
 * at (0,0)…(w,h). The atlas (atlas.ts) rasterises frames lazily into shared texture pages.
 * Keys without an explicit definition are resolved by *families* (pattern-based generators,
 * e.g. any `res_tree_*` → procedural tree) and finally by a labelled placeholder.
 */

/** The subset of CanvasRenderingContext2D generators may rely on (so tests can fake it). */
export interface PixelContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}

export interface SpriteDrawOptions {
  /** The full key being generated (families use it to pick colours/variants). */
  key: string;
  /** Stable hash of the key, for deterministic per-sprite variation. */
  seed: number;
}

export interface SpriteMeta {
  /** Frames of the first anim are per-entity variants (pick one by entity id, don't animate). */
  variants?: boolean;
  /** Rotate the sprite along the entity's velocity (arrows, bolts). */
  rotate?: boolean;
  /** Draw at full brightness after the lightmap (crystals, orbs, flames). */
  emissive?: boolean;
  /** Gentle vertical bob (pickups). */
  bob?: boolean;
  /** Halo colour for the glow pass (0 = none). */
  glow?: number;
}

export interface SpriteDef {
  w: number;
  h: number;
  /** Anim name → frame count (at least one anim). */
  anims: Record<string, number>;
  /** Pivot in sprite px placed on the entity anchor (default bottom-centre: w/2, h). */
  origin?: { x: number; y: number };
  /** Frames per second (per anim or global). Default 8. */
  fps?: number | Record<string, number>;
  /** Anims that hold their last frame instead of looping. */
  once?: string[];
  meta?: SpriteMeta;
  draw(ctx: PixelContext, anim: string, frame: number, opts: SpriteDrawOptions): void;
}

/** A family resolves keys matching some pattern to a generated def (or null if not its key). */
export type SpriteFamily = (key: string) => SpriteDef | null;

interface Entry {
  def: SpriteDef;
  priority: number;
}

const defs = new Map<string, Entry>();
const families: { name: string; fn: SpriteFamily; priority: number }[] = [];
const resolved = new Map<string, SpriteDef | null>();
/** Priority of the family that resolved each cached key (-1 = none). */
const resolvedPriority = new Map<string, number>();
let version = 0;

/** Priority used by the render core's built-in generators (anything else overrides them). */
export const BUILTIN_PRIORITY = 0;

/**
 * Register (or replace) a sprite generator. Definitions with a lower priority than the existing
 * one are ignored, so built-ins never clobber art registered by other modules.
 */
export function defineSprite(key: string, def: SpriteDef, priority = 1): void {
  const cur = defs.get(key);
  if (cur && cur.priority > priority) return;
  validateDef(key, def);
  defs.set(key, { def, priority });
  resolved.delete(key);
  version++;
}

/** Register a pattern-based generator family. Higher priority families are tried first. */
export function defineSpriteFamily(name: string, fn: SpriteFamily, priority = 1): void {
  const i = families.findIndex((f) => f.name === name);
  if (i >= 0) {
    if (families[i]!.priority > priority) return;
    families.splice(i, 1);
  }
  families.push({ name, fn, priority });
  families.sort((a, b) => b.priority - a.priority);
  resolved.clear();
  resolvedPriority.clear();
  version++;
}

export function hasSprite(key: string): boolean {
  return defs.has(key);
}

/** Explicit def, else the first family that claims the key, else null (→ placeholder). */
export function resolveSpriteDef(key: string): SpriteDef | null {
  const e = defs.get(key);
  if (e) return e.def;
  if (resolved.has(key)) return resolved.get(key)!;
  let out: SpriteDef | null = null;
  let prio = -1;
  for (const f of families) {
    const d = f.fn(key);
    if (d) {
      validateDef(key, d);
      out = d;
      prio = f.priority;
      break;
    }
  }
  resolved.set(key, out);
  resolvedPriority.set(key, prio);
  return out;
}

/**
 * Priority of whatever draws `key` (explicit def or the family that claims it); -1 when only the
 * placeholder would. Lets callers tell built-in fallbacks (BUILTIN_PRIORITY) from real art.
 */
export function spritePriority(key: string): number {
  const e = defs.get(key);
  if (e) return e.priority;
  if (!resolved.has(key)) resolveSpriteDef(key);
  return resolvedPriority.get(key) ?? -1;
}

/** Bumped whenever definitions change (atlas uses it to invalidate cached frames). */
export function registryVersion(): number {
  return version;
}

export function definedKeys(): string[] {
  return [...defs.keys()];
}

function validateDef(key: string, d: SpriteDef): void {
  if (!(d.w > 0 && d.h > 0) || d.w > 256 || d.h > 256) throw new Error(`sprite ${key}: bad size ${d.w}x${d.h}`);
  const names = Object.keys(d.anims);
  if (names.length === 0) throw new Error(`sprite ${key}: no anims`);
  for (const n of names) if (!(d.anims[n]! >= 1)) throw new Error(`sprite ${key}: anim ${n} needs >= 1 frame`);
}

export function spriteOrigin(d: SpriteDef): { x: number; y: number } {
  return d.origin ?? { x: d.w / 2, y: d.h };
}

export function animFps(d: SpriteDef, anim: string): number {
  const f = d.fps;
  if (typeof f === 'number') return f;
  return f?.[anim] ?? 8;
}

/** Common anim fallbacks so sim anim hints map onto whatever a sprite provides. */
const FALLBACK: Record<string, string[]> = {
  run: ['move', 'walk'],
  move: ['run', 'walk', 'fly'],
  walk: ['move', 'run'],
  fly: ['move', 'idle'],
  jump: ['air', 'fall', 'move'],
  fall: ['air', 'jump', 'move'],
  climb: ['idle'],
  attack: ['swing', 'shoot', 'cast', 'move'],
  shoot: ['attack', 'cast'],
  cast: ['attack', 'shoot'],
  hurt: ['idle'],
  charge: ['attack', 'move'],
  telegraph: ['attack', 'idle'],
  downed: ['dead', 'idle'],
  // Player controller hints (dash / swim / dive / crawl while downed / out for the level).
  dash: ['run', 'move', 'walk'],
  swim: ['fall', 'move', 'run'],
  dive: ['fall', 'jump', 'move'],
  crawl: ['downed', 'dead', 'idle'],
  out: ['downed', 'dead', 'idle'],
  land: ['idle'],
  windup: ['telegraph', 'attack', 'idle'],
  throw: ['attack', 'shoot', 'cast'],
};

/** Pick the anim a def actually has for a requested name. */
export function pickAnim(d: SpriteDef, anim: string): string {
  if (d.anims[anim]) return anim;
  for (const alt of FALLBACK[anim] ?? []) if (d.anims[alt]) return alt;
  if (d.anims.idle) return 'idle';
  return Object.keys(d.anims)[0]!;
}

/** Shelf packer for atlas pages (pure). */
export class ShelfPacker {
  private x = 0;
  private y = 0;
  private rowH = 0;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  alloc(w: number, h: number): { x: number; y: number } | null {
    if (w > this.width || h > this.height) return null;
    if (this.x + w > this.width) {
      this.y += this.rowH;
      this.x = 0;
      this.rowH = 0;
    }
    if (this.y + h > this.height) return null;
    const out = { x: this.x, y: this.y };
    this.x += w;
    if (h > this.rowH) this.rowH = h;
    return out;
  }
}
