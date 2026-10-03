import { Pen } from '../draw';
import { BUILTIN_PRIORITY, defineSprite } from '../registry';

/**
 * Hats worn over the player's head. 10×10 canvas, origin bottom-centre (5,10), placed by the
 * renderer at the bottom of the head (player anchor − 6 px): rows 4–9 / cols 1–8 cover the head,
 * the face is on the right (rows 7–9, cols 4–8). Facing right; mirrored with the player.
 */
export const HAT_W = 10;
export const HAT_H = 10;
/** Hat anchor above the player's feet (bottom of the head). */
export const HAT_ANCHOR_Y = 6;

const HATS: Record<string, { rows: string[]; pal: Record<string, number> }> = {
  forager_band: {
    rows: ['..........', '..........', '..........', '.....ll...', '......l...', '.gggggggg.'],
    pal: { g: 0x5a8a2a, l: 0x8ad04a },
  },
  miner_lamp: {
    rows: ['..........', '..........', '...yyyy...', '..yYYYyy..', '.yyyyyyyLL', 'bbbbbbbbb.'],
    pal: { y: 0xc0a030, Y: 0xf0d060, L: 0xfff0a0, b: 0x6a4a20 },
  },
  berserker_scarf: {
    rows: ['..........', '..........', '..........', '..........', '..........', 'rrrrrrrrr.', 'rR........', 'r.........'],
    pal: { r: 0xc02020, R: 0x801010 },
  },
  ranger_cap: {
    rows: ['..........', '.f........', '..f.......', '..gggggg..', '.gGGGGggg.', '.ggggggggg'],
    pal: { g: 0x3a6a2a, G: 0x5a8a3a, f: 0xe0e0c0 },
  },
  wizard_hat: {
    rows: ['....pp....', '...ppp....', '...pps....', '..ppppp...', '..pppppp..', 'PPPPPPPPPP'],
    pal: { p: 0x5a3aa0, P: 0x3a2070, s: 0xffe060 },
  },
  bunny_ears: {
    rows: ['..w...w...', '..wk..wk..', '..wk..wk..', '..w...w...', '..ww.ww...'],
    pal: { w: 0xf0f0f0, k: 0xf0a0b0 },
  },
  bat_wings: {
    rows: ['..........', '..........', '..........', 'd........d', 'dd......dd', '.d......d.'],
    pal: { d: 0x3a1a4a },
  },
  tiki_mask: {
    rows: ['..........', '..........', '...t.t.t..', '...tttttt.', '...tTTTTtt', '...tttttt.', '...tkttkt.', '...tttttt.', '...tWWWWt.', '....tttt..'],
    pal: { t: 0x8a5a2a, T: 0xc08a40, k: 0x101010, W: 0xf0e0c0 },
  },
  skull_mask: {
    rows: ['..........', '..........', '..........', '..........', '...wwwwww.', '...wwwwwww', '...wkwwkww', '...wwwwwww', '....wkkw..', '....w.w.w.'],
    pal: { w: 0xe8e8e0, k: 0x101010 },
  },
  gilded_crown: {
    rows: ['..........', '..........', '.y..y..y..', '.yy.yy.yy.', '.yyyRyyyy.', '.yYYYYYYy.'],
    pal: { y: 0xf0c030, Y: 0xc09020, R: 0xe03030 },
  },
  shroom_cap: {
    rows: ['..........', '...rrrr...', '..rrwrrr..', '.rwrrrrwr.', 'rrrrrrwrrr', '.cccccccc.'],
    pal: { r: 0xd03030, w: 0xf8f0e8, c: 0xe8d8c0 },
  },
  dragon_mask: {
    rows: ['h........h', '.h......h.', '..gggggg..', '.gGGGGgggg', '.gggggggggr', '...gkgggk.', '...ggggggg', '....gwgwg.'],
    pal: { g: 0x2a7a3a, G: 0x4aa05a, h: 0xe0d8c0, k: 0xffe040, r: 0xe04030, w: 0xf0f0f0 },
  },
};

export function registerHatSprites(): void {
  for (const [id, h] of Object.entries(HATS)) {
    defineSprite(
      `hat_${id}`,
      {
        w: HAT_W,
        h: HAT_H,
        anims: { idle: 1 },
        origin: { x: HAT_W / 2, y: HAT_H },
        meta: id === 'miner_lamp' ? { glow: 0xfff0a0 } : undefined,
        draw(ctx) {
          // Rows are listed top-down starting at row 0; masks reach the face rows (7–9).
          new Pen(ctx).grid(h.rows.map((r) => r.slice(0, HAT_W)), h.pal, 0, 0);
        },
      },
      BUILTIN_PRIORITY,
    );
  }
}

/** Head bob (px) of the player sprite for an anim frame, so hats ride along (see player.ts). */
export function headBob(anim: string, frame: number): number {
  if (anim === 'idle') return frame === 1 ? 1 : 0;
  if (anim === 'run') return frame % 2 === 1 ? -1 : 0;
  return 0;
}
