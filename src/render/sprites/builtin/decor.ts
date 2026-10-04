import { Pen } from '../draw';
import { BUILTIN_PRIORITY, defineSprite, type SpriteMeta } from '../registry';

/**
 * Level dressing (decor_* props from level gen, plus the hanging-vine resource). Floor props are
 * anchored bottom-centre on the floor; ceiling props (`hang`) top-centre under the ceiling, which is
 * where populate.ts / town.ts put their spawn point. Several props carry variants (one picked per
 * entity) so a cave full of mushrooms doesn't look stamped.
 */

type Draw = (p: Pen, variant: number, frame: number) => void;

interface Opts {
  /** Hangs from the ceiling: origin at the top. */
  hang?: boolean;
  /** Per-entity variants (frames of `idle`, picked by entity id). */
  variants?: number;
  /** Animated frames (ignored when `variants` is set). */
  frames?: number;
  fps?: number;
  meta?: SpriteMeta;
}

function reg(key: string, w: number, h: number, draw: Draw, o: Opts = {}): void {
  const n = o.variants ?? o.frames ?? 1;
  defineSprite(
    key,
    {
      w,
      h,
      anims: { idle: n },
      origin: { x: Math.floor(w / 2), y: o.hang ? 0 : h },
      fps: o.fps ?? 4,
      meta: { ...o.meta, ...(o.variants ? { variants: true } : {}) },
      draw(ctx, _anim, frame) {
        const p = new Pen(ctx);
        draw(p, o.variants ? frame : 0, o.variants ? 0 : frame);
      },
    },
    BUILTIN_PRIORITY,
  );
}

export function registerDecorSprites(): void {
  // ---------------------------------------------------------------------------------------------
  // Floor clutter
  // ---------------------------------------------------------------------------------------------
  reg('decor_grass_tuft', 7, 4, (p, v) => {
    const c = [0x4a8a2a, 0x5aa03a, 0x3a7020][v]!;
    for (const [x, h] of [[1, 2], [2, 3], [3, 4], [4, 3], [5, 2]] as const) p.vline(x + (v === 2 ? 0 : v), 4 - h, 3, x % 2 ? c : 0x7ac04a);
  }, { variants: 3 });

  reg('decor_flowers', 7, 5, (p, v) => {
    const petal = [0xe05050, 0xf0d040, 0x80a0ff][v]!;
    for (const x of [1, 3, 5]) {
      p.vline(x, 2, 4, 0x3a7a2a);
      p.px(x, 1 + (x % 2), petal);
    }
    p.px(3, 1, 0xffffff);
  }, { variants: 3 });

  reg('decor_mushrooms', 8, 5, (p, v) => {
    const cap = [0xb05a2a, 0xd03a3a, 0x9a8a6a][v]!;
    p.rect(1, 1, 3, 1, cap);
    p.vline(2, 2, 4, 0xe8dcc0);
    p.rect(4, 2, 3, 1, cap);
    p.vline(5, 3, 4, 0xe8dcc0);
    if (v === 1) p.px(2, 1, 0xffffff);
  }, { variants: 3 });

  reg('decor_bones', 9, 4, (p, v) => {
    const b = 0xd8d4c4;
    if (v !== 1) {
      p.rect(0, 1, 3, 3, b);
      p.px(1, 2, 0x201810);
    }
    p.hline(3, 8, 3, b);
    p.px(3, 2, b);
    p.px(8, 2, b);
    if (v === 2) p.line(5, 0, 7, 2, b);
  }, { variants: 3 });

  reg('decor_stalks', 5, 10, (p, v) => {
    for (const x of [1, 3]) p.vline(x, v + 2 + (x === 3 ? 2 : 0), 9, 0x7a4aa0);
    p.px(1, v + 1, 0xc080ff);
    p.px(3, v + 3, 0xc080ff);
  }, { variants: 2 });

  reg('decor_reeds', 7, 10, (p, v) => {
    for (const [x, t] of [[1, 2], [3, 0], [5, 3]] as const) {
      p.vline(x, t + v, 9, 0x3a8a7a);
      p.rect(x, t + v, 1, 2, 0x6a4a2a);
    }
  }, { variants: 2 });

  reg('decor_frozen_shrub', 9, 6, (p) => {
    p.line(4, 5, 1, 1, 0x6a8aa0);
    p.line(4, 5, 7, 1, 0x6a8aa0);
    p.vline(4, 0, 5, 0x6a8aa0);
    for (const [x, y] of [[1, 1], [7, 1], [4, 0], [2, 3], [6, 3]] as const) p.px(x, y, 0xe8f8ff);
  });

  reg('decor_snow_rock', 9, 5, (p, v) => {
    p.ellipse(4.5, 3.2, 4.2, 2.4, 0x5a5a64);
    p.hline(1, 7 - v, 1, 0xf0f8ff);
    p.hline(2, 6, 2, 0xd0e0f0);
  }, { variants: 2 });

  reg('decor_ice_shards', 8, 7, (p) => {
    p.line(2, 6, 1, 1, 0x80d0f0);
    p.line(4, 6, 4, 0, 0xc0f0ff);
    p.line(6, 6, 7, 2, 0x80d0f0);
    p.px(4, 0, 0xffffff);
  }, { meta: { glow: 0x80e0ff } });

  reg('decor_crystals', 9, 7, (p, v) => {
    const c = [0xc060ff, 0xff60c0, 0x60c0ff][v]!;
    p.rect(1, 3, 2, 4, c);
    p.rect(4, 0, 2, 7, c);
    p.rect(6, 2, 2, 5, c);
    p.vline(4, 0, 6, 0xffffff);
  }, { variants: 3, meta: { emissive: true, glow: 0xc060ff } });

  reg('decor_crystal_spire', 5, 13, (p) => {
    p.rect(1, 2, 3, 11, 0xa040e0);
    p.vline(2, 0, 12, 0xe0a0ff);
    p.px(2, 0, 0xffffff);
  }, { meta: { emissive: true, glow: 0xc060ff } });

  reg('decor_ember_rock', 8, 5, (p, _v, f) => {
    p.ellipse(4, 3, 3.8, 2.2, 0x2a1a14);
    const hot = f % 2 ? 0xff8030 : 0xffb050;
    p.line(2, 3, 4, 2, hot);
    p.px(5, 3, hot);
  }, { frames: 2, fps: 3, meta: { glow: 0xff6020 } });

  reg('decor_ash_pile', 9, 3, (p, v) => {
    p.ellipse(4.5, 2.5, 4, 1.6, 0x4a4440);
    p.hline(3, 5, 1, 0x6a6460);
    if (v) p.px(6, 2, 0xff6020);
  }, { variants: 2 });

  reg('decor_charred_stump', 8, 7, (p) => {
    p.rect(2, 2, 4, 5, 0x2a1c14);
    p.hline(1, 6, 6, 0x1a120c);
    p.px(3, 1, 0x2a1c14);
    p.px(4, 3, 0xff6020);
  }, { meta: { glow: 0xff4010 } });

  reg('decor_blight_pustule', 7, 6, (p, _v, f) => {
    p.ellipse(3.5, 3.6 - (f % 2) * 0.4, 2.8 + (f % 2) * 0.4, 2.4 + (f % 2) * 0.3, 0xc03080);
    p.px(2, 2, 0xff90d0);
    p.hline(1, 5, 5, 0x5a1038);
  }, { frames: 2, fps: 2, meta: { emissive: true, glow: 0xff40a0 } });

  // Mine dressing (Hollow Deep).
  reg('decor_rails', 16, 3, (p) => {
    for (let x = 1; x < 16; x += 4) p.rect(x, 1, 2, 2, 0x5a3a20);
    p.hline(0, 15, 0, 0x8a8a90);
    p.hline(0, 15, 2, 0x6a6a70);
  });
  reg('decor_cart', 13, 9, (p) => {
    p.rect(1, 1, 11, 5, 0x5a5a60);
    p.hline(1, 11, 1, 0x8a8a90);
    p.rect(2, 0, 3, 1, 0x7a6a50);
    p.rect(6, 0, 4, 1, 0x9a7a40);
    p.disc(3.5, 7.5, 1.4, 0x2a2a2e);
    p.disc(9.5, 7.5, 1.4, 0x2a2a2e);
  });
  reg('decor_timber', 12, 16, (p) => {
    p.rect(1, 1, 2, 15, 0x6a4424);
    p.rect(9, 1, 2, 15, 0x6a4424);
    p.rect(0, 0, 12, 2, 0x7a5430);
    p.line(3, 3, 5, 1, 0x5a3a1a);
    p.line(8, 3, 6, 1, 0x5a3a1a);
  });

  // ---------------------------------------------------------------------------------------------
  // Ceiling growths (origin at the top)
  // ---------------------------------------------------------------------------------------------
  const vine = (p: Pen, v: number, len: number) => {
    for (const [x, l] of [[1, len - 3 - v], [3, len], [4, len - 5 + v]] as const) {
      for (let y = 0; y < l; y++) p.px(x + ((y >> 2) % 2 ? 1 : 0), y, y % 3 ? 0x3a7a2a : 0x5aa03a);
      p.px(x, l, 0x7ac04a);
    }
  };
  reg('decor_vines', 7, 13, (p, v) => vine(p, v, 12 - v * 2), { hang: true, variants: 2 });
  reg('res_vine_hanging', 6, 16, (p) => vine(p, 0, 15));

  reg('decor_roots', 7, 9, (p, v) => {
    p.line(3, 0, 1, 6 + v, 0x6a4a2a);
    p.line(3, 0, 5, 8 - v, 0x5a3a1a);
    p.line(4, 0, 3, 4, 0x7a5a30);
  }, { hang: true, variants: 2 });

  reg('decor_stalactite', 5, 9, (p, v) => {
    const len = 8 - v * 2;
    for (let y = 0; y < len; y++) {
      const half = Math.max(0, Math.round(2 - (y * 2) / len));
      p.hline(2 - half, 2 + half, y, y < 2 ? 0x6a5a4a : 0x8a7a68);
    }
  }, { hang: true, variants: 2 });

  reg('decor_icicles', 8, 8, (p, v) => {
    for (const [x, l] of [[1, 4 + v], [3, 7], [5, 3], [6, 5 - v]] as const) {
      p.vline(x, 0, l - 1, 0xb0e8ff);
      p.px(x, l, 0xffffff);
    }
  }, { hang: true, variants: 2, meta: { glow: 0x80e0ff } });

  reg('decor_blight_tendril', 5, 13, (p, _v, f) => {
    for (let y = 0; y < 12; y++) p.px(2 + Math.round(Math.sin((y + f * 2) * 0.6)), y, y % 4 ? 0x8a1a5a : 0xff3cb4);
  }, { hang: true, frames: 2, fps: 2, meta: { glow: 0xff3cb4 } });

  reg('decor_glow_moss', 9, 4, (p, v) => {
    p.hline(0, 8, 0, 0x2a6a3a);
    for (let x = 0; x < 9; x += 2) p.vline(x, 1, 1 + ((x + v) % 3), 0x60ff90);
  }, { hang: true, variants: 2, meta: { emissive: true, glow: 0x60ff90 } });

  reg('decor_lantern', 5, 10, (p, _v, f) => {
    p.vline(2, 0, 2, 0x4a4a4a);
    p.rect(0, 3, 5, 1, 0x3a2a1a);
    p.rect(1, 4, 3, 4, f % 2 ? 0xffd070 : 0xffc050);
    p.vline(0, 4, 7, 0x3a2a1a);
    p.vline(4, 4, 7, 0x3a2a1a);
    p.rect(0, 8, 5, 1, 0x3a2a1a);
  }, { hang: true, frames: 2, fps: 3, meta: { emissive: true, glow: 0xffb040 } });

  // ---------------------------------------------------------------------------------------------
  // Town
  // ---------------------------------------------------------------------------------------------
  reg('decor_town_gate', 28, 30, (p) => {
    const wood = 0x6a4424;
    const dark = 0x3a2414;
    p.rect(1, 6, 3, 24, wood);
    p.rect(24, 6, 3, 24, wood);
    p.vline(1, 6, 29, dark);
    p.vline(24, 6, 29, dark);
    p.rect(0, 3, 28, 3, 0x7a5430);
    p.hline(0, 27, 5, dark);
    p.rect(2, 0, 3, 3, 0x7a5430);
    p.rect(23, 0, 3, 3, 0x7a5430);
    // Sign board.
    p.rect(9, 7, 10, 5, 0x8a6a3a);
    p.hline(10, 17, 9, 0x3a2414);
    p.vline(11, 6, 6, dark);
    p.vline(16, 6, 6, dark);
  });

  reg('decor_chimney_smoke', 9, 16, (p, _v, f) => {
    for (let i = 0; i < 3; i++) {
      const t = ((f + i * 2) % 6) / 6;
      const y = 15 - t * 15;
      const r = 1.2 + t * 2.2;
      p.ctx.globalAlpha = 0.55 * (1 - t);
      p.disc(4.5 + Math.sin((t + i) * 3) * 1.5, y, r, 0x9a948c);
    }
    p.ctx.globalAlpha = 1;
  }, { frames: 6, fps: 5 });

  reg('decor_altar', 14, 11, (p, _v, f) => {
    p.rect(1, 6, 12, 5, 0x6a6a74);
    p.hline(1, 12, 6, 0x9a9aa4);
    p.rect(0, 5, 14, 1, 0x8a8a94);
    p.rect(3, 10, 8, 1, 0x4a4a54);
    p.disc(7, 2.5, 2, f % 2 ? 0xc080ff : 0xa060ff);
    p.px(6, 1, 0xffffff);
  }, { frames: 2, fps: 2, meta: { glow: 0xb070ff } });

  reg('decor_lamp_post', 7, 24, (p, _v, f) => {
    p.vline(3, 5, 23, 0x3a3a40);
    p.hline(1, 5, 23, 0x2a2a30);
    p.rect(1, 1, 5, 4, f % 2 ? 0xffd070 : 0xffc050);
    p.hline(0, 6, 0, 0x2a2a30);
    p.hline(1, 5, 5, 0x2a2a30);
    p.vline(1, 1, 4, 0x2a2a30);
    p.vline(5, 1, 4, 0x2a2a30);
  }, { frames: 2, fps: 2, meta: { emissive: true, glow: 0xffb040 } });

  reg('decor_stall', 22, 16, (p) => {
    // Striped awning, posts, counter with wares.
    for (let x = 0; x < 22; x++) p.vline(x, 0, 3, ((x >> 1) & 1) ? 0xe0d8c0 : 0xb03a2a);
    p.hline(0, 21, 4, 0x6a2a1a);
    p.vline(1, 4, 15, 0x5a3a1a);
    p.vline(20, 4, 15, 0x5a3a1a);
    p.rect(0, 10, 22, 6, 0x7a5430);
    p.hline(0, 21, 10, 0x9a7440);
    p.rect(4, 8, 2, 2, 0xd03a3a);
    p.rect(8, 8, 3, 2, 0xe0b040);
    p.rect(14, 7, 2, 3, 0x6a9a3a);
  });
}
