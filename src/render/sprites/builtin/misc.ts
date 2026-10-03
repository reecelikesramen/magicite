import { Content } from '../../../content';
import type { ProjectileDef } from '../../../content/types';
import { hash01 } from '../../../engine/rng';
import { shade } from '../../color';
import { Pen } from '../draw';
import { BUILTIN_PRIORITY, defineSprite, defineSpriteFamily, type SpriteDef } from '../registry';

/** Stone doorway exit portal (frame) + its glowing interior (white, tinted per destination biome). */
export const PORTAL_W = 32;
export const PORTAL_H = 24;
const IN_X0 = 5;
const IN_X1 = 26;
const IN_Y0 = 5;

function portalFrame(): SpriteDef {
  return {
    w: PORTAL_W,
    h: PORTAL_H,
    anims: { idle: 1 },
    draw(ctx) {
      const p = new Pen(ctx);
      const dark = 0x2e2e32;
      const mid = 0x5a5a5e;
      const hi = 0x8a8a8e;
      // Pillars and lintel built from blocks.
      for (const [x0, x1] of [[0, IN_X0 - 1], [IN_X1 + 1, PORTAL_W - 1]] as const) {
        for (let y = IN_Y0 - 1; y < PORTAL_H; y++) {
          for (let x = x0; x <= x1; x++) {
            const seam = (y - IN_Y0 + (x0 > 0 ? 2 : 0)) % 4 === 3 || (x === x0 + 2 && ((y >> 2) & 1) === 1);
            p.px(x, y, seam ? dark : x === x0 ? hi : mid);
          }
        }
      }
      for (let y = 0; y < IN_Y0; y++) {
        for (let x = 0; x < PORTAL_W; x++) {
          const seam = y === IN_Y0 - 1 || ((x + (y > 1 ? 4 : 0)) & 7) === 7;
          p.px(x, y, seam ? dark : y === 0 ? hi : mid);
        }
      }
      // Moss on the lintel.
      for (let x = 1; x < PORTAL_W - 1; x++) {
        const r = hash01(x, 3, 9);
        if (r < 0.45) p.px(x, 0, r < 0.15 ? 0x8fdc5a : 0x4caf3a);
        if (r < 0.12) p.px(x, 1, 0x2e7a26);
      }
      // Dark interior.
      p.rect(IN_X0, IN_Y0, IN_X1 - IN_X0 + 1, PORTAL_H - IN_Y0, 0x070908);
      // Dotted bright border.
      for (let x = IN_X0; x <= IN_X1; x += 2) p.px(x, IN_Y0 - 1, 0xc8c8c8);
      for (let y = IN_Y0; y < PORTAL_H; y += 2) {
        p.px(IN_X0 - 1, y, 0xc8c8c8);
        p.px(IN_X1 + 1, y, 0xc8c8c8);
      }
      p.hline(0, PORTAL_W - 1, PORTAL_H - 1, dark);
    },
  };
}

function portalGlow(): SpriteDef {
  return {
    w: PORTAL_W,
    h: PORTAL_H,
    anims: { idle: 4 },
    fps: 5,
    meta: { emissive: true },
    draw(ctx, _a, frame) {
      const p = new Pen(ctx);
      for (let y = IN_Y0; y < PORTAL_H - 1; y++) {
        for (let x = IN_X0; x <= IN_X1; x++) {
          const edge = Math.min(x - IN_X0, IN_X1 - x, y - IN_Y0);
          const n = hash01(x >> 1, (y + frame * 2) >> 1, 17) * 0.6 + hash01(x, y, frame) * 0.4;
          let v = 0.18 + n * 0.35 + (edge < 2 ? 0.35 : edge < 4 ? 0.12 : 0) + (y > PORTAL_H - 5 ? 0.15 : 0);
          if (n > 0.86) v = 1;
          if (v < 0.3) continue;
          p.px(x, y, shade(0xffffff, Math.min(1, v)));
        }
      }
      // Animated border dots.
      for (let x = IN_X0 + (frame & 1); x <= IN_X1; x += 2) p.px(x, IN_Y0 - 1, 0xffffff);
      for (let y = IN_Y0 + (frame & 1); y < PORTAL_H; y += 2) {
        p.px(IN_X0 - 1, y, 0xffffff);
        p.px(IN_X1 + 1, y, 0xffffff);
      }
    },
  };
}

function portalBars(): SpriteDef {
  return {
    w: PORTAL_W,
    h: PORTAL_H,
    anims: { idle: 1 },
    draw(ctx) {
      const p = new Pen(ctx);
      for (let x = IN_X0 + 1; x < IN_X1; x += 4) {
        p.vline(x, IN_Y0, PORTAL_H - 2, 0x3a3a44);
        p.vline(x + 1, IN_Y0, PORTAL_H - 2, 0x6a6a78);
      }
      p.hline(IN_X0, IN_X1, IN_Y0 + 6, 0x4a4a54);
      p.hline(IN_X0, IN_X1, PORTAL_H - 6, 0x4a4a54);
    },
  };
}

function coin(): SpriteDef {
  return {
    w: 6,
    h: 6,
    anims: { idle: 4 },
    fps: 8,
    meta: { bob: true, glow: 0xffc030 },
    draw(ctx, _a, f) {
      const p = new Pen(ctx);
      const rx = [2.7, 1.8, 0.7, 1.8][f]!;
      p.ellipse(3, 3, rx, 2.7, 0xb08010);
      if (rx > 1) p.ellipse(3 - 0.3, 3 - 0.2, rx - 0.7, 2.0, 0xffd040);
      p.px(f === 2 ? 3 : 2, 1, 0xfff0a0);
    },
  };
}

function gem(): SpriteDef {
  return {
    w: 6,
    h: 6,
    anims: { idle: 2 },
    fps: 3,
    meta: { bob: true, glow: 0x80e0ff },
    draw(ctx, _a, f) {
      const p = new Pen(ctx);
      p.hline(2, 3, 1, 0xd0ffff);
      p.hline(1, 4, 2, 0x60e0f0);
      p.hline(1, 4, 3, 0x40b0d0);
      p.hline(2, 3, 4, 0x2a8aa0);
      p.px(2, 2, 0xffffff);
      if (f) p.px(4, 0, 0xffffff);
    },
  };
}

type ProjKind = 'arrow' | 'bolt' | 'knife' | 'shard' | 'orb' | 'lightning' | 'bomb' | 'blob' | 'web';

interface ProjLook {
  kind: ProjKind;
  core: number;
  mid: number;
  edge: number;
}

function projLook(key: string, def?: ProjectileDef): ProjLook {
  const s = `${key} ${def?.id ?? ''}`.toLowerCase();
  if (/arrow/.test(s)) return { kind: 'arrow', core: 0xf0f0f0, mid: 0x8a5a2a, edge: 0xc8c8d0 };
  if (/knife|dagger/.test(s)) return { kind: 'knife', core: 0xf0f0ff, mid: 0xb8b8c8, edge: 0x5a3a1a };
  if (/lightning|thunder|zap/.test(s)) return { kind: 'lightning', core: 0xffffff, mid: 0xfff080, edge: 0xffd040 };
  if (/bolt/.test(s)) return { kind: 'bolt', core: 0xe0e0f0, mid: 0x6a4a2a, edge: 0xa0a0b0 };
  if (/ice|frost|shard/.test(s)) return { kind: 'shard', core: 0xffffff, mid: 0xa0f0ff, edge: 0x40b0e0 };
  if (/bomb/.test(s)) return { kind: 'bomb', core: 0xffd040, mid: 0x26262e, edge: 0x6a6a7a };
  if (/web|silk/.test(s)) return { kind: 'web', core: 0xffffff, mid: 0xd8d8e0, edge: 0x9090a0 };
  if (/slime|acid|venom|spit_acid/.test(s)) return { kind: 'blob', core: 0xe0ffb0, mid: 0xa0ff40, edge: 0x40a020 };
  if (/fire|flame|ember|spit/.test(s)) return { kind: 'orb', core: 0xfff0b0, mid: 0xffc040, edge: 0xff6018 };
  if (/arcane|magic|void|orb/.test(s)) {
    const cyan = /magic/.test(s);
    return cyan ? { kind: 'orb', core: 0xffffff, mid: 0x80ffff, edge: 0x20a0e0 } : { kind: 'orb', core: 0xffffff, mid: 0xd090ff, edge: 0x8030e0 };
  }
  const c = def?.light?.color ?? 0xffe080;
  return { kind: 'orb', core: 0xffffff, mid: c, edge: shade(c, 0.6) };
}

export function projectileDef(key: string, def?: ProjectileDef): SpriteDef {
  const l = projLook(key, def);
  const rotate = l.kind !== 'orb' && l.kind !== 'bomb' && l.kind !== 'blob' && l.kind !== 'web';
  const sizes: Record<ProjKind, [number, number]> = {
    arrow: [9, 3], bolt: [7, 3], knife: [7, 3], shard: [7, 3], orb: [6, 6], lightning: [14, 5], bomb: [6, 7], blob: [5, 5], web: [7, 7],
  };
  const [w, h] = sizes[l.kind];
  const glow = l.kind === 'orb' || l.kind === 'lightning' || l.kind === 'shard' ? l.mid : l.kind === 'bomb' ? 0xffb030 : 0;
  return {
    w,
    h,
    anims: { idle: 2 },
    fps: 12,
    origin: { x: w / 2, y: h / 2 },
    meta: { rotate, emissive: glow !== 0 && l.kind !== 'bomb', glow },
    draw(ctx, _a, f) {
      const p = new Pen(ctx);
      switch (l.kind) {
        case 'arrow':
          p.hline(1, 6, 1, l.mid);
          p.hline(7, 8, 1, l.edge);
          p.px(7, 0, l.edge);
          p.px(7, 2, l.edge);
          p.px(0, 0, l.core);
          p.px(0, 2, l.core);
          p.px(1, 0, l.core);
          p.px(1, 2, l.core);
          return;
        case 'bolt':
          p.hline(0, 4, 1, l.mid);
          p.hline(5, 6, 1, l.core);
          p.px(5, 0, l.edge);
          p.px(5, 2, l.edge);
          return;
        case 'knife':
          p.hline(0, 1, 1, l.edge);
          p.hline(2, 5, 1, l.mid);
          p.hline(2, 4, 0, l.core);
          p.px(6, 1, l.core);
          return;
        case 'shard':
          p.hline(0, 6, 1, l.mid);
          p.hline(2, 5, 0, l.edge);
          p.hline(2, 5, 2, l.edge);
          p.hline(3, 6, 1, l.core);
          return;
        case 'orb': {
          const r = f ? 2.9 : 2.6;
          p.disc(3, 3, r, l.edge);
          p.disc(3, 3, r - 0.9, l.mid);
          p.rect(2, 2, 2, 2, l.core);
          return;
        }
        case 'lightning': {
          let y = 2;
          for (let x = 0; x < 14; x++) {
            p.px(x, y, x % 3 === 0 ? l.core : l.mid);
            if (hash01(x, f, 3) < 0.5) y = Math.max(0, Math.min(4, y + (hash01(x, f, 4) < 0.5 ? -1 : 1)));
            p.px(x, y, l.core);
          }
          return;
        }
        case 'bomb':
          p.disc(3, 4.4, 2.6, l.mid);
          p.px(2, 3, l.edge);
          p.px(4, 1, 0x8a5a2a);
          p.px(f ? 5 : 4, 0, l.core);
          return;
        case 'blob':
          p.disc(2.5, 2.5, 2.2, l.edge);
          p.disc(2.3, 2.3, 1.5, l.mid);
          p.px(2, 1, l.core);
          return;
        case 'web':
          p.line(0, 3, 6, 3, l.mid);
          p.line(3, 0, 3, 6, l.mid);
          p.line(1, 1, 5, 5, l.edge);
          p.line(5, 1, 1, 5, l.edge);
          p.px(3, 3, l.core);
          return;
      }
    },
  };
}

let spriteToProj: Map<string, ProjectileDef> | null = null;
let projCount = -1;
export function projectileForSprite(key: string): ProjectileDef | undefined {
  if (!spriteToProj || projCount !== Content.projectiles.size) {
    spriteToProj = new Map();
    for (const d of Content.projectiles.values()) {
      if (!spriteToProj.has(d.sprite)) spriteToProj.set(d.sprite, d);
      if (!spriteToProj.has(d.id)) spriteToProj.set(d.id, d);
    }
    projCount = Content.projectiles.size;
  }
  return spriteToProj.get(key);
}

export function registerMiscSprites(): void {
  defineSprite('exit_portal', portalFrame(), BUILTIN_PRIORITY);
  defineSprite('exit_portal_glow', portalGlow(), BUILTIN_PRIORITY);
  defineSprite('exit_portal_bars', portalBars(), BUILTIN_PRIORITY);
  defineSprite('gold_coin', coin(), BUILTIN_PRIORITY);
  defineSprite('pickup', gem(), BUILTIN_PRIORITY);
  defineSpriteFamily(
    'projectiles',
    (key) => {
      const def = projectileForSprite(key);
      if (!def && !key.startsWith('proj')) return null;
      return projectileDef(key, def);
    },
    BUILTIN_PRIORITY,
  );
}
