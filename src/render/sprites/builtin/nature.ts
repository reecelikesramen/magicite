import { Content } from '../../../content';
import type { ResourceDef } from '../../../content/types';
import { Rng } from '../../../engine/rng';
import { shade } from '../../color';
import { biomeStyle, type TreeKind } from '../../style';
import { Pen } from '../draw';
import { BUILTIN_PRIORITY, defineSprite, defineSpriteFamily, type SpriteDef } from '../registry';

/**
 * Resource art: very tall thin twisted trees with alternating leaf puffs (biome-styled), rock and
 * ore nodes, plants, bugs, chests and pots. Resolved from ResourceDef.sprite keys by keyword.
 */
let spriteToRes: Map<string, ResourceDef> | null = null;
let resCount = -1;
export function resourceForSprite(key: string): ResourceDef | undefined {
  if (!spriteToRes || resCount !== Content.resources.size) {
    spriteToRes = new Map();
    for (const d of Content.resources.values()) if (!spriteToRes.has(d.sprite)) spriteToRes.set(d.sprite, d);
    resCount = Content.resources.size;
  }
  return spriteToRes.get(key);
}

interface TreeLook {
  kind: TreeKind;
  trunk: number[];
  leaves: number[];
}

function treeLook(key: string, def?: ResourceDef): TreeLook {
  // Prefer the resource's biome; else keywords in the key.
  const biome = def?.biomes[0] ?? key.replace(/^res_tree_?|^tree_?/, '');
  const st = biomeStyle(biome || 'woods', Content.biomes.get(biome));
  return { kind: st.tree, trunk: st.trunk, leaves: st.leaves };
}

function puff(p: Pen, cx: number, cy: number, rx: number, ry: number, l: number[], kind: TreeKind): void {
  p.ellipse(cx, cy + 0.5, rx, ry, l[0]!);
  p.ellipse(cx, cy, rx, ry - 0.4, l[1]!);
  p.ellipse(cx - 0.6, cy - ry * 0.35, rx * 0.72, ry * 0.55, l[2]!);
  if (kind === 'pine') {
    // Snow cap.
    p.ellipse(cx, cy - ry * 0.55, rx * 0.95, ry * 0.45, l[3]!);
  } else {
    p.px(Math.round(cx - rx * 0.4), Math.round(cy - ry * 0.6), l[3]!);
    p.px(Math.round(cx - rx * 0.1), Math.round(cy - ry * 0.75), l[3]!);
  }
}

function crystal(p: Pen, cx: number, cy: number, s: number, l: number[]): void {
  p.vline(cx, cy - s, cy + s, l[2]!);
  p.vline(cx - 1, cy - s + 1, cy + s - 1, l[1]!);
  p.vline(cx + 1, cy - s + 1, cy + s - 1, l[1]!);
  p.px(cx, cy - s, l[3]!);
  p.px(cx, cy - s + 1, l[3]!);
}

export function treeDef(hitH: number, look: TreeLook): SpriteDef {
  const W = 28;
  const H = Math.max(24, hitH) + 22;
  const cx = 14;
  return {
    w: W,
    h: H,
    anims: { idle: 3 },
    origin: { x: cx, y: H },
    meta: { variants: true, glow: look.kind === 'crystal' || look.kind === 'blight' ? look.leaves[2] : 0 },
    draw(ctx, _a, frame, opts) {
      const p = new Pen(ctx);
      const rng = new Rng(opts.seed + frame * 7919);
      const t = look.trunk;
      const l = look.leaves;
      const trunkH = Math.max(16, hitH - 6 + frame * 7);
      const top = H - 1 - trunkH;
      const phase = rng.range(0, 6.28);
      const xs: number[] = [];
      const thick = look.kind === 'shroom' ? 3 : 2;
      for (let y = H - 1; y >= top; y--) {
        const k = H - 1 - y;
        const x = cx + Math.round(Math.sin(k * 0.17 + phase) * 1.1 + Math.sin(k * 0.05 + phase * 2) * 0.8);
        xs[y] = x;
        p.px(x - 1, y, t[1]!);
        p.px(x, y, t[2]!);
        if (thick === 3) p.px(x + 1, y, t[1]!);
        if (rng.chance(0.12)) p.px(x - 1, y, t[0]!);
        if ((look.kind === 'crystal' || look.kind === 'blight') && rng.chance(0.1)) p.px(rng.chance(0.5) ? x - 2 : x + 1, y, t[1]!);
      }
      // Root flare.
      p.px(xs[H - 1]! - 2, H - 1, t[0]!);
      p.px(xs[H - 1]! + 1, H - 1, t[1]!);
      p.px(xs[H - 2]! + 1, H - 2, t[0]!);

      let side = rng.chance(0.5) ? 1 : -1;
      const start = H - 1 - Math.round(trunkH * 0.3);
      for (let y = start; y > top + 6; y -= 6 + rng.int(0, 2)) {
        const x = xs[y] ?? cx;
        const reach = 3 + rng.int(0, 2);
        const by = y - 1;
        // Branch.
        p.px(x + (side > 0 ? 1 : -2), by, t[1]!);
        p.px(x + (side > 0 ? 2 : -3), by - 1, t[1]!);
        const px = x + side * (reach + 2);
        const py = by - 2;
        switch (look.kind) {
          case 'crystal':
          case 'blight':
            crystal(p, px, py, 2, l);
            break;
          case 'charred':
            for (let i = 0; i < 4; i++) p.px(px + rng.int(-2, 2), py + rng.int(-1, 1), l[rng.int(1, 3)]!);
            break;
          case 'shroom':
            p.ellipse(px, py, 2.6, 1.2, l[1]!);
            p.hline(px - 1, px + 1, py - 1, l[2]!);
            break;
          default:
            puff(p, px, py, 3.2 + rng.range(0, 1.4), 2.2 + rng.range(0, 0.7), l, look.kind);
        }
        side = -side;
      }
      // Crown.
      const tx = xs[top] ?? cx;
      switch (look.kind) {
        case 'crystal':
        case 'blight':
          crystal(p, tx, top - 2, 3, l);
          crystal(p, tx - 3, top, 2, l);
          crystal(p, tx + 3, top + 1, 2, l);
          break;
        case 'charred':
          for (let i = 0; i < 9; i++) p.px(tx + rng.int(-4, 4), top + rng.int(-3, 1), l[rng.int(1, 3)]!);
          break;
        case 'shroom':
          p.ellipse(tx, top - 1, 7, 3, l[0]!);
          p.ellipse(tx, top - 1.5, 6.5, 2.4, l[1]!);
          p.ellipse(tx - 1, top - 2.5, 4, 1.2, l[2]!);
          for (let i = 0; i < 4; i++) p.px(tx + rng.int(-5, 5), top - 2 + rng.int(-1, 0), l[3]!);
          break;
        default:
          puff(p, tx, top - 2, 5.5 + rng.range(0, 1.5), 3.8 + rng.range(0, 0.6), l, look.kind);
          puff(p, tx + rng.int(-1, 1), top - 5, 3.2, 2.2, l, look.kind);
      }
    },
  };
}

const ORE_FLECKS: [RegExp, number[]][] = [
  [/iron/, [0xc07a4a, 0xe0a070]],
  [/gold/, [0xe0c040, 0xfff080]],
  [/diamond/, [0x60f0ff, 0xd0ffff]],
  [/void/, [0xa040ff, 0xe0a0ff]],
  [/coal/, [0x101014, 0x2a2a30]],
  [/flint/, [0x2a2a30, 0x50505a]],
];

export function rockDef(key: string, w: number, h: number): SpriteDef {
  const fleck = ORE_FLECKS.find(([re]) => re.test(key))?.[1];
  const W = Math.max(10, w + 4);
  const H = Math.max(8, h + 1);
  const c = [0x3a3a40, 0x5a5a60, 0x8a8a90, 0xc8c8cc];
  return {
    w: W,
    h: H,
    anims: { idle: 2 },
    meta: { variants: true },
    draw(ctx, _a, frame, opts) {
      const p = new Pen(ctx);
      const rng = new Rng(opts.seed + frame * 31);
      const cx = W / 2 + (frame ? 0.5 : -0.5);
      p.ellipse(cx, H - H * 0.42, W * 0.42, H * 0.42, c[0]!);
      p.ellipse(cx - 0.4, H - H * 0.47, W * 0.38, H * 0.36, c[1]!);
      p.ellipse(cx - 1.2, H - H * 0.62, W * 0.22, H * 0.18, c[2]!);
      p.px(Math.round(cx - 2), Math.round(H - H * 0.72), c[3]!);
      p.px(Math.round(cx - 1), Math.round(H - H * 0.75), c[3]!);
      // Side pebble.
      const sx = frame ? 1.5 : W - 2.5;
      p.ellipse(sx, H - 1.6, 1.8, 1.6, c[0]!);
      p.px(Math.round(sx - 0.5), H - 3, c[2]!);
      p.hline(1, W - 2, H - 1, c[0]!);
      // Crack line.
      p.px(Math.round(cx + 1), H - 3, c[0]!);
      p.px(Math.round(cx + 2), H - 4, c[0]!);
      if (fleck) {
        for (let i = 0; i < 5; i++) p.px(Math.round(cx + rng.int(-3, 3)), H - 2 - rng.int(0, H - 4), fleck[i % 2]!);
      }
    },
  };
}

function plantDef(key: string): SpriteDef | null {
  const s = key.toLowerCase();
  if (/glowcap|shroom|mushroom/.test(s)) {
    return {
      w: 9, h: 7, anims: { idle: 1 }, meta: { glow: 0x40e0e0 },
      draw(ctx) {
        const p = new Pen(ctx);
        p.rect(2, 4, 1, 3, 0xd8d0b8);
        p.ellipse(2.5, 3.5, 2.4, 1.3, 0x30b0b0);
        p.px(2, 2, 0xc0ffff);
        p.rect(6, 2, 1, 5, 0xd8d0b8);
        p.ellipse(6.5, 1.8, 2.6, 1.4, 0x40e0e0);
        p.px(6, 1, 0xe0ffff);
      },
    };
  }
  if (/berry|bush/.test(s)) {
    return {
      w: 12, h: 8, anims: { idle: 1 },
      draw(ctx) {
        const p = new Pen(ctx);
        p.ellipse(6, 5, 5.5, 3.5, 0x1e5a1c);
        p.ellipse(5.5, 4.5, 4.5, 2.8, 0x2e7a26);
        p.ellipse(5, 3.5, 2.5, 1.4, 0x4caf3a);
        for (const [x, y] of [[3, 5], [7, 3], [8, 6], [5, 6]] as const) p.px(x, y, 0xe02040);
      },
    };
  }
  if (/fiber|grass|reed/.test(s)) {
    return {
      w: 8, h: 8, anims: { idle: 1 },
      draw(ctx) {
        const p = new Pen(ctx);
        p.line(1, 7, 0, 2, 0x3f8f2a);
        p.line(3, 7, 3, 0, 0x5fb83a);
        p.line(5, 7, 6, 1, 0x4caf3a);
        p.line(6, 7, 7, 4, 0x3f8f2a);
        p.px(3, 0, 0xc8e080);
      },
    };
  }
  if (/herb|flower/.test(s)) {
    return {
      w: 8, h: 7, anims: { idle: 1 },
      draw(ctx) {
        const p = new Pen(ctx);
        p.vline(4, 2, 6, 0x2e7a26);
        p.ellipse(2.5, 4.5, 1.6, 0.9, 0x4caf3a);
        p.ellipse(5.5, 3.5, 1.6, 0.9, 0x5fb83a);
        p.px(4, 1, 0xf0f0ff);
        p.px(3, 1, 0xe0c0ff);
        p.px(5, 1, 0xe0c0ff);
        p.px(4, 0, 0xe0c0ff);
      },
    };
  }
  if (/moss/.test(s)) {
    return {
      w: 10, h: 4, anims: { idle: 1 },
      draw(ctx) {
        const p = new Pen(ctx);
        p.ellipse(5, 3, 4.8, 2, 0x2a5a2a);
        p.hline(2, 7, 1, 0x4a8a3a);
        p.px(4, 0, 0x7ac05a);
      },
    };
  }
  return null;
}

function crystalNodeDef(key: string): SpriteDef {
  const s = key.toLowerCase();
  const pal = /frost|ice/.test(s) ? [0x3a7ab0, 0x8ad0f0, 0xd8f4ff, 0xffffff] : /ember|fire/.test(s) ? [0x6a1408, 0xc03018, 0xff8020, 0xffe080] : [0x6a20a0, 0xc040ff, 0xff80ff, 0xffe0ff];
  return {
    w: 12, h: 10, anims: { idle: 1 }, meta: { glow: pal[2] },
    draw(ctx) {
      const p = new Pen(ctx);
      crystal(p, 6, 5, 4, pal);
      crystal(p, 3, 7, 2, pal);
      crystal(p, 9, 7, 2, pal);
      p.hline(1, 10, 9, shade(pal[0]!, 0.6));
    },
  };
}

function ventDef(): SpriteDef {
  return {
    w: 12, h: 6, anims: { idle: 2 }, fps: 4, meta: { glow: 0xff6020 },
    draw(ctx, _a, f) {
      const p = new Pen(ctx);
      p.ellipse(6, 5, 5.8, 2.6, 0x2a1010);
      p.ellipse(6, 4.5, 4, 1.6, 0x3a1a14);
      p.hline(4, 7, 3, f ? 0xff8020 : 0xffb030);
      p.px(5 + f, 2, 0xffd040);
    },
  };
}

function bugDef(key: string): SpriteDef {
  const s = key.toLowerCase();
  const body = /moth/.test(s) ? 0xe0d8f0 : /beetle/.test(s) ? 0x3a2a5a : 0x3a3a20;
  const glow = /firefly|fly/.test(s) ? 0x9cff3a : /moth/.test(s) ? 0xd0c0ff : 0;
  return {
    w: 5, h: 4, anims: { idle: 2 }, fps: 12, origin: { x: 2.5, y: 2 }, meta: { glow, emissive: glow !== 0 },
    draw(ctx, _a, f) {
      const p = new Pen(ctx);
      p.rect(1, 2, 3, 1, body);
      if (glow) p.px(1, 2, glow);
      p.px(f ? 1 : 2, 1, 0xe8f0ff);
      p.px(f ? 3 : 2, f ? 1 : 0, 0xe8f0ff);
    },
  };
}

function chestDef(key: string): SpriteDef {
  const iron = /iron|steel|gold/.test(key);
  const wood = iron ? [0x3a3a40, 0x5a5a64, 0x7a7a88] : [0x4a2a14, 0x7a4a24, 0x9a6a3a];
  const band = iron ? 0xe0c040 : 0x8a8a90;
  return {
    w: 12, h: 9, anims: { idle: 1, open: 1 },
    draw(ctx, anim) {
      const p = new Pen(ctx);
      p.rect(1, 4, 10, 5, wood[1]!);
      p.hline(1, 10, 8, wood[0]!);
      if (anim === 'open') {
        p.rect(1, 1, 10, 2, wood[0]!);
        p.hline(2, 9, 4, 0xffe080);
      } else {
        p.rect(1, 1, 10, 3, wood[2]!);
        p.hline(1, 10, 1, shade(wood[2]!, 1.2));
      }
      p.vline(3, 1, 8, band);
      p.vline(8, 1, 8, band);
      p.rect(5, 4, 2, 2, 0xe0c040);
    },
  };
}

function potDef(): SpriteDef {
  return {
    w: 7, h: 8, anims: { idle: 1 },
    draw(ctx) {
      const p = new Pen(ctx);
      p.ellipse(3.5, 5, 3.3, 3, 0x8a4a2a);
      p.ellipse(3, 4.5, 2.2, 2, 0xb06a3a);
      p.rect(2, 0, 3, 2, 0x8a4a2a);
      p.hline(1, 5, 0, 0x6a3a1a);
      p.px(2, 4, 0xe0a070);
    },
  };
}

export function registerNatureSprites(): void {
  defineSpriteFamily(
    'resources',
    (key) => {
      const def = resourceForSprite(key);
      const s = (def?.id ?? key).toLowerCase();
      const isRes = !!def || key.startsWith('res_');
      if (!isRes) return null;
      if (/tree|trunk|stalk/.test(s)) return treeDef(def?.h ?? 48, treeLook(key, def));
      if (/rock|ore|stone|boulder/.test(s)) return rockDef(s, def?.w ?? 8, def?.h ?? 7);
      if (/crystal|node|cluster|shard/.test(s)) return crystalNodeDef(s);
      if (/vent/.test(s)) return ventDef();
      if (/bug|firefly|moth|beetle/.test(s)) return bugDef(s);
      if (/chest/.test(s)) return chestDef(s);
      if (/pot|urn|vase/.test(s)) return potDef();
      return plantDef(s);
    },
    BUILTIN_PRIORITY,
  );
  // Explicit built-ins for the seed content's keys (priority 0: real art overrides them).
  defineSprite('res_tree_forest', treeDef(48, { kind: 'puff', trunk: [0x2e1a0c, 0x4a2a14, 0x7a4a24], leaves: [0x1e5a1c, 0x2e7a26, 0x4caf3a, 0x8fd65a] }), BUILTIN_PRIORITY);
  defineSprite('res_rock_stone', rockDef('res_rock_stone', 8, 7), BUILTIN_PRIORITY);
}
