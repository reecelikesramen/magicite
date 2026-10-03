import { Content } from '../../../content';
import type { ItemDef } from '../../../content/types';
import { hash01 } from '../../../engine/rng';
import { shade } from '../../color';
import { Pen } from '../draw';
import { BUILTIN_PRIORITY, defineSpriteFamily, type PixelContext, type SpriteDef } from '../registry';

/**
 * Generic item art until the items/sprites workstreams draw real icons:
 *  - `held:<kind>:<material>` — in-hand silhouettes, drawn pointing RIGHT with the grip at the origin;
 *  - item icons (10×10) for any key used as an ItemDef.sprite (or `item_*`), picked by category/keywords.
 */
export type HeldKind =
  | 'sword' | 'axe' | 'pickaxe' | 'hammer' | 'spear' | 'bow' | 'staff' | 'wand' | 'torch'
  | 'bomb' | 'knife' | 'net' | 'sickle' | 'shield' | 'food' | 'potion' | 'generic';

export type Material = 'wood' | 'stone' | 'iron' | 'gold' | 'diamond' | 'void' | 'bone' | 'frost' | 'ember' | 'amethyst' | 'jade';

export const MATS: Record<Material, [number, number, number]> = {
  wood: [0x5a3a1a, 0x8a5a2a, 0xb07a40],
  stone: [0x4a4a50, 0x7a7a80, 0xa8a8b0],
  iron: [0x6a6a78, 0xb8b8c8, 0xf0f0ff],
  gold: [0x9a6a10, 0xe0b030, 0xfff080],
  diamond: [0x2a8aa0, 0x60e0f0, 0xd0ffff],
  void: [0x40186a, 0x9040e0, 0xe0a0ff],
  bone: [0x8a8a70, 0xd0d0b8, 0xffffff],
  frost: [0x3a7ab0, 0x8ad0f0, 0xe0f8ff],
  ember: [0xa02010, 0xff6020, 0xffd060],
  amethyst: [0x6a20a0, 0xc040ff, 0xffa0ff],
  jade: [0x1a6a3a, 0x40b060, 0xa0f0b0],
};

const WOOD = MATS.wood;

export function materialFor(id: string, tier = 1): Material {
  const s = id.toLowerCase();
  if (/void|blight/.test(s)) return 'void';
  if (/diamond/.test(s)) return 'diamond';
  if (/gold|gilded/.test(s)) return 'gold';
  if (/iron|steel/.test(s)) return 'iron';
  if (/frost|ice/.test(s)) return 'frost';
  if (/ember|fire|flame|magma/.test(s)) return 'ember';
  if (/amethyst|crystal/.test(s)) return 'amethyst';
  if (/jade/.test(s)) return 'jade';
  if (/bone|skull/.test(s)) return 'bone';
  if (/stone|flint|rock/.test(s)) return 'stone';
  if (/wood|stick|plank/.test(s)) return 'wood';
  return (['wood', 'stone', 'iron', 'gold', 'diamond', 'void'] as Material[])[Math.max(0, Math.min(5, tier))]!;
}

export function heldKindFor(def: ItemDef): HeldKind {
  const id = def.id;
  if (def.tool === 'axe') return 'axe';
  if (def.tool === 'pickaxe') return 'pickaxe';
  if (def.tool === 'hammer') return 'hammer';
  if (def.tool === 'net') return 'net';
  if (def.tool === 'sickle') return 'sickle';
  if (def.use === 'shoot') return 'bow';
  if (def.use === 'cast') return /wand|rod/.test(id) ? 'wand' : 'staff';
  if (def.use === 'thrust' || /spear|lance|pike/.test(id)) return 'spear';
  if (def.use === 'throw') return /bomb|potion|flask/.test(id) ? 'bomb' : 'knife';
  if (/torch|lantern/.test(id)) return 'torch';
  if (/shield|buckler/.test(id)) return 'shield';
  if (/hammer|maul|mace/.test(id)) return 'hammer';
  if (def.use === 'swing' || def.category === 'weapon') return /dagger|knife/.test(id) ? 'knife' : 'sword';
  if (def.use === 'consume') return /potion|elixir|flask|tonic/.test(id) ? 'potion' : 'food';
  return 'generic';
}

/** Sprite key for an item held in hand (explicit `held_<sprite>` art wins if someone defines it). */
export function heldKey(def: ItemDef): string {
  return `held:${heldKindFor(def)}:${materialFor(def.id, def.tier)}`;
}

type Drawer = { w: number; h: number; ox: number; oy: number; draw(p: Pen, m: [number, number, number]): void };

const HELD: Record<HeldKind, Drawer> = {
  sword: {
    w: 12, h: 5, ox: 1, oy: 2,
    draw(p, m) {
      p.hline(0, 1, 2, WOOD[1]);
      p.px(0, 2, WOOD[0]);
      p.vline(2, 0, 4, shade(m[0], 0.9));
      p.hline(3, 10, 2, m[1]);
      p.hline(3, 9, 1, m[2]);
      p.px(11, 2, m[2]);
    },
  },
  knife: {
    w: 7, h: 3, ox: 1, oy: 1,
    draw(p, m) {
      p.hline(0, 1, 1, WOOD[0]);
      p.hline(2, 5, 1, m[1]);
      p.hline(2, 4, 0, m[2]);
      p.px(6, 1, m[2]);
    },
  },
  axe: {
    w: 10, h: 7, ox: 1, oy: 5,
    draw(p, m) {
      p.hline(0, 8, 5, WOOD[1]);
      p.hline(0, 8, 6, WOOD[0]);
      p.hline(7, 8, 1, m[1]);
      p.hline(6, 9, 2, m[1]);
      p.hline(6, 9, 3, m[0]);
      p.hline(7, 8, 4, m[0]);
      p.vline(9, 2, 3, m[2]);
      p.px(8, 1, m[2]);
    },
  },
  pickaxe: {
    w: 10, h: 9, ox: 1, oy: 4,
    draw(p, m) {
      p.hline(0, 7, 4, WOOD[1]);
      p.px(6, 0, m[2]);
      p.px(7, 1, m[1]);
      p.vline(8, 2, 6, m[1]);
      p.vline(7, 3, 5, m[0]);
      p.px(7, 7, m[1]);
      p.px(6, 8, m[2]);
    },
  },
  hammer: {
    w: 10, h: 7, ox: 1, oy: 3,
    draw(p, m) {
      p.hline(0, 7, 3, WOOD[1]);
      p.rect(7, 0, 3, 7, m[0]);
      p.rect(7, 0, 2, 6, m[1]);
      p.vline(7, 0, 5, m[2]);
    },
  },
  spear: {
    w: 15, h: 3, ox: 3, oy: 1,
    draw(p, m) {
      p.hline(0, 11, 1, WOOD[1]);
      p.hline(12, 14, 1, m[1]);
      p.px(12, 0, m[0]);
      p.px(12, 2, m[0]);
      p.px(14, 1, m[2]);
    },
  },
  bow: {
    w: 5, h: 12, ox: 2, oy: 6,
    draw(p, m) {
      p.vline(1, 1, 10, 0xe0e0d0);
      p.px(2, 0, m[1]);
      p.vline(3, 1, 2, m[1]);
      p.vline(4, 3, 8, m[1]);
      p.vline(3, 9, 10, m[1]);
      p.px(2, 11, m[1]);
      p.vline(4, 5, 6, m[0]);
    },
  },
  staff: {
    w: 13, h: 5, ox: 2, oy: 2,
    draw(p, m) {
      p.hline(0, 9, 2, WOOD[1]);
      p.hline(8, 9, 1, WOOD[0]);
      p.ellipse(11, 2.5, 1.8, 2.2, m[1]);
      p.px(11, 1, m[2]);
      p.px(12, 2, m[2]);
    },
  },
  wand: {
    w: 8, h: 3, ox: 1, oy: 1,
    draw(p, m) {
      p.hline(0, 5, 1, WOOD[2]);
      p.rect(6, 0, 2, 3, m[1]);
      p.px(7, 0, m[2]);
    },
  },
  torch: {
    w: 7, h: 5, ox: 1, oy: 2,
    draw(p) {
      p.hline(0, 3, 2, WOOD[1]);
      p.rect(4, 1, 2, 3, 0xff8020);
      p.px(6, 2, 0xffb030);
      p.px(5, 0, 0xff6018);
      p.rect(4, 2, 2, 1, 0xfff0a0);
    },
  },
  bomb: {
    w: 6, h: 7, ox: 3, oy: 4,
    draw(p) {
      p.disc(3, 4.5, 2.6, 0x26262e);
      p.px(2, 3, 0x6a6a7a);
      p.px(4, 1, 0x8a5a2a);
      p.px(5, 0, 0xffd040);
    },
  },
  net: {
    w: 11, h: 7, ox: 1, oy: 3,
    draw(p) {
      p.hline(0, 6, 3, WOOD[1]);
      p.ellipse(8.5, 3.5, 2.5, 3.5, 0xd8d8c0);
      p.ellipse(8.5, 3.5, 1.5, 2.5, 0x000000);
      p.px(8, 2, 0xa0a090);
      p.px(9, 4, 0xa0a090);
    },
  },
  sickle: {
    w: 9, h: 7, ox: 1, oy: 5,
    draw(p, m) {
      p.hline(0, 5, 5, WOOD[1]);
      p.px(6, 4, m[1]);
      p.px(7, 3, m[1]);
      p.vline(8, 1, 2, m[2]);
      p.px(7, 0, m[2]);
      p.px(6, 0, m[1]);
    },
  },
  shield: {
    w: 6, h: 8, ox: 1, oy: 4,
    draw(p, m) {
      p.rect(0, 0, 6, 6, m[0]);
      p.rect(1, 0, 4, 6, m[1]);
      p.hline(1, 4, 6, m[0]);
      p.hline(2, 3, 7, m[0]);
      p.vline(2, 1, 4, m[2]);
    },
  },
  food: {
    w: 6, h: 6, ox: 2, oy: 3,
    draw(p) {
      p.disc(3.5, 2.5, 2.3, 0xc05050);
      p.px(3, 1, 0xf08080);
      p.line(1, 4, 0, 5, 0xe8e0d0);
    },
  },
  potion: {
    w: 5, h: 7, ox: 2, oy: 3,
    draw(p, m) {
      p.rect(2, 0, 1, 2, 0x8a5a2a);
      p.disc(2.5, 4.3, 2.3, m[1]);
      p.px(1, 3, 0xffffff);
    },
  },
  generic: {
    w: 5, h: 5, ox: 2, oy: 2,
    draw(p, m) {
      p.disc(2.5, 2.5, 2.2, m[1]);
      p.px(1, 1, m[2]);
    },
  },
};

function heldDef(kind: HeldKind, mat: Material): SpriteDef {
  const d = HELD[kind];
  const m = MATS[mat];
  return { w: d.w, h: d.h, anims: { idle: 1 }, origin: { x: d.ox, y: d.oy }, draw: (ctx) => d.draw(new Pen(ctx), m) };
}

/** Records fillRect calls into a pixel buffer (to rotate held art into diagonal icons). */
class BufferCtx implements PixelContext {
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  globalAlpha = 1;
  readonly px: Int32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Int32Array(w * h).fill(-1);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const c = parseInt(String(this.fillStyle).slice(1), 16);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && yy >= 0 && xx < this.w && yy < this.h) this.px[yy * this.w + xx] = c;
  }
  clearRect(): void {}
}

/** Draw held art rotated -45° (pointing up-right) centred in a size×size icon. */
function diagonalIcon(p: Pen, kind: HeldKind, mat: Material, size: number): void {
  const d = HELD[kind];
  const buf = new BufferCtx(d.w, d.h);
  d.draw(new Pen(buf), MATS[mat]);
  const cxs = d.w / 2;
  const cys = d.h / 2;
  const s = Math.SQRT1_2;
  const fit = Math.min(1, (size - 1) / (Math.max(d.w, d.h) * 0.9));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Inverse rotate dest (x,y) around icon centre by +45°.
      const dx = (x + 0.5 - size / 2) / fit;
      const dy = (y + 0.5 - size / 2) / fit;
      const sx = Math.floor(cxs + dx * s + dy * s);
      const sy = Math.floor(cys - dx * s + dy * s);
      if (sx < 0 || sy < 0 || sx >= d.w || sy >= d.h) continue;
      const c = buf.px[sy * d.w + sx]!;
      if (c >= 0) p.px(x, y, c);
    }
  }
}

type IconKind =
  | 'log' | 'plank' | 'stick' | 'rock' | 'ore' | 'bar' | 'gem' | 'meat' | 'bread' | 'berry' | 'herb' | 'mushroom'
  | 'string' | 'cloth' | 'hide' | 'bone' | 'feather' | 'gel' | 'arrow' | 'scroll' | 'coin' | 'armor' | 'hat' | 'ring' | 'bug' | 'blob';

function iconKindFor(id: string, def?: ItemDef): IconKind | HeldKind {
  const s = id.toLowerCase();
  if (def && (def.category === 'weapon' || def.category === 'tool')) return heldKindFor(def);
  if (/arrow|bolt_ammo|ammo/.test(s) || def?.category === 'ammo') return 'arrow';
  if (/potion|elixir|tonic|flask/.test(s)) return 'potion';
  if (/bomb/.test(s)) return 'bomb';
  if (/torch/.test(s)) return 'torch';
  if (/plank/.test(s)) return 'plank';
  if (/stick|kit/.test(s)) return 'stick';
  if (/wood|log/.test(s)) return 'log';
  if (/_bar$|ingot/.test(s)) return 'bar';
  if (/ore$|_ore|coal/.test(s)) return 'ore';
  if (/stone|flint|rock|dirt/.test(s)) return 'rock';
  if (/diamond|shard|crystal|gem|core|magicite/.test(s)) return 'gem';
  if (/meat|steak|drumstick/.test(s)) return 'meat';
  if (/bread|pie|loaf|cake/.test(s)) return 'bread';
  if (/berry|apple|fruit/.test(s)) return 'berry';
  if (/glowcap|shroom|mushroom/.test(s)) return 'mushroom';
  if (/herb|moss|leaf|plant|fiber|seed/.test(s)) return 'herb';
  if (/string|silk|thread|web/.test(s)) return 'string';
  if (/fabric|cloth|scarf|robe/.test(s)) return 'cloth';
  if (/hide|leather|pelt/.test(s)) return 'hide';
  if (/bone|skull|fang|tooth/.test(s)) return 'bone';
  if (/feather|wing/.test(s)) return 'feather';
  if (/gel|slime|venom|sac/.test(s)) return 'gel';
  if (/scroll|book|tome|recipe/.test(s)) return 'scroll';
  if (/gold$|coin/.test(s)) return 'coin';
  if (/firefly|moth|beetle|bug/.test(s)) return 'bug';
  if (def?.category === 'armor') return 'armor';
  if (def?.category === 'hat') return 'hat';
  if (def?.category === 'accessory') return 'ring';
  if (def?.category === 'consumable') return 'food';
  return 'blob';
}

function iconColors(id: string, tier: number): [number, number, number] {
  const s = id.toLowerCase();
  if (/health|red|blood/.test(s)) return [0x8a1a1a, 0xe03030, 0xff9090];
  if (/mana|blue/.test(s)) return [0x1a2a8a, 0x3060e0, 0x90b0ff];
  if (/mystery|venom|poison/.test(s)) return [0x4a1a6a, 0x9040c0, 0xe0a0ff];
  if (/slime|gel|bog|herb|fiber|moss/.test(s)) return [0x2a7a2a, 0x5ce65c, 0xa8ff8a];
  if (/coal/.test(s)) return [0x101014, 0x2a2a30, 0x50505a];
  return MATS[materialFor(id, tier)];
}

function drawIcon(p: Pen, kind: IconKind | HeldKind, m: [number, number, number], seed: number): void {
  switch (kind) {
    case 'log':
      p.rect(1, 3, 8, 4, 0x6a4020);
      p.hline(1, 8, 3, 0x8a5a2a);
      p.ellipse(8.5, 5, 1.5, 2, 0xc89a5a);
      p.px(8, 5, 0x8a5a2a);
      return;
    case 'plank':
      p.rect(1, 3, 8, 4, 0xb07a40);
      p.hline(1, 8, 3, 0xd09a58);
      p.hline(1, 8, 6, 0x7a4a24);
      p.px(3, 5, 0x7a4a24);
      p.px(7, 4, 0x7a4a24);
      return;
    case 'stick':
      p.line(2, 8, 8, 1, 0x8a5a2a);
      p.line(3, 8, 9, 2, 0x5a3a1a);
      return;
    case 'rock':
    case 'ore':
      p.ellipse(5, 6, 4, 3, MATS.stone[0]);
      p.ellipse(4.6, 5.6, 3.4, 2.4, MATS.stone[1]);
      p.px(3, 4, MATS.stone[2]);
      p.px(4, 4, MATS.stone[2]);
      if (kind === 'ore') {
        p.px(5, 6, m[1]);
        p.px(3, 6, m[2]);
        p.px(6, 5, m[1]);
      }
      return;
    case 'bar':
      p.rect(1, 4, 8, 4, m[0]);
      p.rect(2, 3, 6, 4, m[1]);
      p.hline(2, 7, 3, m[2]);
      return;
    case 'gem':
      p.rect(3, 2, 4, 1, m[2]);
      p.rect(2, 3, 6, 2, m[1]);
      p.rect(3, 5, 4, 1, m[1]);
      p.rect(4, 6, 2, 1, m[0]);
      p.px(3, 3, 0xffffff);
      return;
    case 'meat':
      p.disc(4, 4, 3, 0xc05050);
      p.disc(3.6, 3.6, 2, 0xe07070);
      p.line(6, 6, 8, 8, 0xe8e0d0);
      p.px(8, 7, 0xffffff);
      return;
    case 'bread':
      p.ellipse(5, 5.5, 4, 2.6, 0xb07a30);
      p.ellipse(5, 5, 3.5, 2, 0xd8a050);
      p.px(3, 4, 0xf0d090);
      p.px(6, 4, 0xf0d090);
      return;
    case 'berry':
      p.disc(3.5, 6, 1.6, m[1]);
      p.disc(6.5, 6, 1.6, m[1]);
      p.disc(5, 3.8, 1.6, m[1]);
      p.px(5, 1, 0x3a8a2a);
      return;
    case 'herb':
      p.vline(5, 3, 8, 0x2e7a26);
      p.ellipse(3.5, 4, 1.6, 1, 0x5fb83a);
      p.ellipse(6.5, 3, 1.6, 1, 0x5fb83a);
      p.ellipse(4, 6, 1.6, 1, 0x4caf3a);
      return;
    case 'mushroom':
      p.rect(4, 5, 2, 4, 0xe8e0c8);
      p.ellipse(5, 4, 3.6, 2, 0x40c0c0);
      p.px(3, 3, 0xc0ffff);
      return;
    case 'string':
      p.ellipse(5, 5, 3.5, 3.5, 0xe8e0d0);
      p.ellipse(5, 5, 2, 2, 0x000000);
      p.px(5, 5, 0xc8c0b0);
      return;
    case 'cloth':
      p.rect(2, 2, 6, 6, m[1]);
      p.hline(2, 7, 2, m[2]);
      p.vline(7, 3, 7, m[0]);
      return;
    case 'hide':
      p.rect(2, 2, 6, 6, 0x8a5a3a);
      p.rect(1, 3, 8, 4, 0x8a5a3a);
      p.px(3, 3, 0xb07a50);
      p.px(6, 5, 0x6a4028);
      return;
    case 'bone':
      p.line(2, 7, 7, 2, 0xe8e0d0);
      p.px(1, 7, 0xe8e0d0);
      p.px(2, 8, 0xe8e0d0);
      p.px(7, 1, 0xe8e0d0);
      p.px(8, 2, 0xe8e0d0);
      return;
    case 'feather':
      p.line(2, 8, 7, 1, 0xf0f0f0);
      p.line(3, 7, 7, 3, 0xc8c8d8);
      return;
    case 'gel':
    case 'blob':
      p.ellipse(5, 6, 3.5, 2.6, m[1]);
      p.px(3, 5, m[2]);
      if (kind === 'blob' && hash01(seed, 1) < 0.5) p.px(6, 6, m[0]);
      return;
    case 'arrow':
      p.line(1, 8, 7, 2, 0x8a5a2a);
      p.px(8, 1, m[2]);
      p.px(7, 1, m[1]);
      p.px(8, 2, m[1]);
      p.px(1, 7, 0xf0f0f0);
      p.px(2, 8, 0xf0f0f0);
      return;
    case 'scroll':
      p.rect(2, 2, 6, 6, 0xe8d8a8);
      p.hline(2, 7, 2, 0xb8a070);
      p.hline(2, 7, 7, 0xb8a070);
      p.hline(3, 6, 4, 0x6a5a40);
      p.hline(3, 5, 5, 0x6a5a40);
      return;
    case 'coin':
      p.disc(5, 5, 3, 0xd0a020);
      p.disc(4.6, 4.6, 2.2, 0xffe060);
      p.px(4, 4, 0xffffff);
      return;
    case 'armor':
      p.rect(2, 2, 6, 6, m[1]);
      p.rect(1, 2, 8, 2, m[1]);
      p.vline(5, 3, 7, m[0]);
      p.hline(2, 7, 2, m[2]);
      return;
    case 'hat':
      p.rect(3, 3, 4, 3, m[1]);
      p.hline(1, 8, 6, m[0]);
      return;
    case 'ring':
      p.ellipse(5, 5.5, 2.8, 2.8, m[1]);
      p.ellipse(5, 5.5, 1.5, 1.5, 0x000000);
      p.px(5, 2, 0xff4060);
      return;
    case 'bug':
      p.ellipse(5, 5, 2, 1.5, 0x3a3a20);
      p.px(5, 5, 0x9cff3a);
      p.px(4, 3, 0xd0d0ff);
      p.px(6, 3, 0xd0d0ff);
      return;
  }
}

function iconDef(key: string, def: ItemDef | undefined): SpriteDef {
  const id = def?.id ?? key.replace(/^item_/, '');
  const kind = iconKindFor(id, def);
  const isHeld = kind in HELD && !['potion', 'food', 'bomb', 'torch'].includes(kind) && (def?.category === 'weapon' || def?.category === 'tool');
  const mat = materialFor(id, def?.tier ?? 1);
  const colors = iconColors(id, def?.tier ?? 1);
  return {
    w: 10,
    h: 10,
    anims: { idle: 1 },
    origin: { x: 5, y: 10 },
    meta: { bob: true },
    draw(ctx, _a, _f, opts) {
      const p = new Pen(ctx);
      if (isHeld) diagonalIcon(p, kind as HeldKind, mat, 10);
      else if (kind === 'potion') {
        p.rect(4, 1, 2, 2, 0x8a5a2a);
        p.disc(5, 6, 3, colors[1]);
        p.px(3, 5, 0xffffff);
      } else if (kind === 'food') drawIcon(p, 'meat', colors, opts.seed);
      else if (kind === 'bomb' || kind === 'torch') diagonalIcon(p, kind, mat, 10);
      else drawIcon(p, kind as IconKind, colors, opts.seed);
    },
  };
}

let spriteToItem: Map<string, ItemDef> | null = null;
let itemCount = -1;

/** Reverse lookup sprite key → item def (rebuilt if the catalogue size changes). */
export function itemForSprite(key: string): ItemDef | undefined {
  if (!spriteToItem || itemCount !== Content.items.size) {
    spriteToItem = new Map();
    for (const d of Content.items.values()) if (!spriteToItem.has(d.sprite)) spriteToItem.set(d.sprite, d);
    itemCount = Content.items.size;
  }
  return spriteToItem.get(key);
}

export function registerItemSprites(): void {
  defineSpriteFamily(
    'held',
    (key) => {
      if (!key.startsWith('held:')) return null;
      const [, kind, mat] = key.split(':');
      if (!kind || !(kind in HELD)) return null;
      return heldDef(kind as HeldKind, (mat && mat in MATS ? mat : 'iron') as Material);
    },
    BUILTIN_PRIORITY,
  );
  defineSpriteFamily(
    'item-icons',
    (key) => {
      const def = itemForSprite(key);
      if (!def && !key.startsWith('item_')) return null;
      return iconDef(key, def);
    },
    BUILTIN_PRIORITY,
  );
}
