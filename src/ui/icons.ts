/**
 * UI icon textures. Item icons are procedural (see iconArt.ts) unless a sprite source is
 * installed via `setItemIconSource` (the lead routes this through src/render/sprites once the
 * sprite registry lands, e.g. `setItemIconSource((def) => getFrames(def.sprite)?.[0])`).
 */
import { Texture } from 'pixi.js';
import { Content } from '../content';
import type { EquipSlot, ItemDef } from '../content/types';
import { GHOST_ART, HUD_ART, SKILL_ART, artPixels, itemIconPixels, type PixelBuf } from './iconArt';

export type ItemIconSource = (def: ItemDef) => Texture | null | undefined;

let iconSource: ItemIconSource | null = null;
const itemCache = new Map<string, Texture>();
const hudCache = new Map<string, Texture>();

/** Install (or clear) an external icon provider, e.g. the procedural sprite registry. */
export function setItemIconSource(fn: ItemIconSource | null): void {
  iconSource = fn;
  itemCache.clear();
}

/** Convert a pixel buffer into a nearest-sampled texture (one small canvas each, cached by callers). */
export function bufToTexture(b: PixelBuf): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = b.w;
  canvas.height = b.h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(b.w, b.h);
  const d = img.data;
  for (let i = 0; i < b.data.length; i++) {
    const v = b.data[i]!;
    const o = i * 4;
    d[o] = (v >> 16) & 255;
    d[o + 1] = (v >> 8) & 255;
    d[o + 2] = v & 255;
    d[o + 3] = v >>> 24;
  }
  ctx.putImageData(img, 0, 0);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

/** 10×10 icon texture for an item id (cached). Unknown ids still get a keyword-based icon. */
export function itemIcon(itemId: string): Texture {
  let t = itemCache.get(itemId);
  if (t) return t;
  const def = Content.items.get(itemId);
  if (def && iconSource) t = iconSource(def) ?? undefined;
  t ??= bufToTexture(itemIconPixels(def, itemId));
  itemCache.set(itemId, t);
  return t;
}

function cached(key: string, make: () => PixelBuf): Texture {
  let t = hudCache.get(key);
  if (!t) {
    t = bufToTexture(make());
    hudCache.set(key, t);
  }
  return t;
}

export type HudIconId = 'heart' | 'gem' | 'drumstick' | 'boot' | 'coin' | 'bulb' | 'sort' | 'lock' | 'skull' | 'star';

export function hudIcon(id: HudIconId): Texture {
  return cached(`hud:${id}`, () => {
    const a = HUD_ART[id]!;
    return artPixels(a.rows, a.pal);
  });
}

/** Grey silhouette shown in an empty equipment slot. */
export function ghostIcon(slot: EquipSlot): Texture {
  return cached(`ghost:${slot}`, () => artPixels(GHOST_ART[slot]!, { g: 0xffffff }));
}

/** White skill pictogram for a path (tinted by the view). */
export function skillGlyph(path: string): Texture {
  const key = SKILL_ART[path] ? path : 'unknown';
  return cached(`skill:${key}`, () => artPixels(SKILL_ART[key]!, { s: 0xffffff, g: 0xb0b0b0 }));
}
