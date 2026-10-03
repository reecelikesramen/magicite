/**
 * Contact sheet of procedural sprites (no browser): rasterises every frame of the given key
 * prefixes into one PNG (via ImageMagick `convert`). Usage:
 *   bun scripts/sprite-sheet.ts out.png enemy_ boss_ npc_ companion_
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Content } from '../src/content';
import { registerBestiarySprites } from '../src/render/sprites/builtin/bestiary';
import { registerCreatureSprites } from '../src/render/sprites/builtin/creatures';
import { registerItemSprites } from '../src/render/sprites/builtin/items';
import { registerMiscSprites } from '../src/render/sprites/builtin/misc';
import { registerNatureSprites } from '../src/render/sprites/builtin/nature';
import { registerPlayerSprites } from '../src/render/sprites/builtin/player';
import { type PixelContext, resolveSpriteDef } from '../src/render/sprites/registry';

registerItemSprites();
registerMiscSprites();
registerPlayerSprites();
registerCreatureSprites();
registerBestiarySprites();
registerNatureSprites();

const [out = 'sheet.png', ...prefixes] = process.argv.slice(2);
const keys = new Set<string>();
for (const e of Content.enemies.values()) keys.add(e.sprite);
for (const b of Content.bosses.values()) keys.add(b.sprite);
for (const n of Content.npcs.values()) keys.add((n as { sprite: string }).sprite);
for (const c of Content.companions.values()) keys.add((c as { sprite: string }).sprite);
const wanted = [...keys].filter((k) => !prefixes.length || prefixes.some((p) => k.startsWith(p)));

const SCALE = 3;
const PAD = 4;
type Cell = { key: string; w: number; h: number; px: Uint8ClampedArray };
const rows: Cell[][] = [];
for (const key of wanted) {
  const def = resolveSpriteDef(key);
  const row: Cell[] = [];
  if (def) {
    for (const [anim, n] of Object.entries(def.anims)) {
      for (let f = 0; f < n; f++) {
        const px = new Uint8ClampedArray(def.w * def.h * 4);
        let style = '#000';
        let alpha = 1;
        const ctx: PixelContext = {
          get fillStyle() { return style; },
          set fillStyle(v) { style = String(v); },
          get globalAlpha() { return alpha; },
          set globalAlpha(v) { alpha = v; },
          fillRect(x, y, w, h) {
            const m = /^#([0-9a-f]{6})/i.exec(style) ?? /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(style);
            let r = 255, g = 0, b = 255;
            if (m && m.length === 2) { const v = parseInt(m[1]!, 16); r = v >> 16; g = (v >> 8) & 255; b = v & 255; }
            else if (m) { r = +m[1]!; g = +m[2]!; b = +m[3]!; }
            for (let yy = Math.max(0, y); yy < Math.min(def.h, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(def.w, x + w); xx++) {
              const i = (yy * def.w + xx) * 4;
              const a = alpha;
              px[i] = px[i]! * (1 - a) + r * a; px[i + 1] = px[i + 1]! * (1 - a) + g * a; px[i + 2] = px[i + 2]! * (1 - a) + b * a;
              px[i + 3] = Math.min(255, px[i + 3]! + 255 * a);
            }
          },
          clearRect(x, y, w, h) {
            for (let yy = Math.max(0, y); yy < Math.min(def.h, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(def.w, x + w); xx++) px.fill(0, (yy * def.w + xx) * 4, (yy * def.w + xx) * 4 + 4);
          },
        };
        def.draw(ctx, anim, f, { key, seed: 1 });
        row.push({ key: `${key}:${anim}${f}`, w: def.w, h: def.h, px });
      }
    }
  }
  rows.push(row);
}
const W = Math.max(...rows.map((r) => r.reduce((s, c) => s + c.w * SCALE + PAD, PAD)), 64);
const H = rows.reduce((s, r) => s + Math.max(8, ...r.map((c) => c.h)) * SCALE + PAD, PAD);
const img = new Uint8Array(W * H * 3).fill(40);
let y0 = PAD;
for (const r of rows) {
  let x0 = PAD;
  const rh = Math.max(8, ...r.map((c) => c.h));
  for (const c of r) {
    for (let y = 0; y < c.h * SCALE; y++) for (let x = 0; x < c.w * SCALE; x++) {
      const si = ((y / SCALE | 0) * c.w + (x / SCALE | 0)) * 4;
      const di = ((y0 + y) * W + x0 + x) * 3;
      const a = c.px[si + 3]! / 255;
      const bg = ((x / SCALE | 0) + (y / SCALE | 0)) % 2 ? 52 : 60;
      img[di] = c.px[si]! * a + bg * (1 - a); img[di + 1] = c.px[si + 1]! * a + bg * (1 - a); img[di + 2] = c.px[si + 2]! * a + bg * (1 - a);
    }
    x0 += c.w * SCALE + PAD;
  }
  y0 += rh * SCALE + PAD;
}
const ppm = out.replace(/\.png$/, '.ppm');
writeFileSync(ppm, Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), Buffer.from(img)]));
execFileSync('convert', [ppm, out]);
console.log(`${wanted.length} sprites (${rows.filter((r) => r.length).length} defined) -> ${out}`);
