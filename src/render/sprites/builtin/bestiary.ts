import { shade } from '../../color';
import { Pen } from '../draw';
import { BUILTIN_PRIORITY, defineSprite, type PixelContext, type SpriteDef, type SpriteMeta } from '../registry';

/**
 * Procedural bestiary: a handful of parametric archetypes (quadruped, beetle, spider, bat, bird,
 * wasp, humanoid, toad, lizard/dragon, golem, totem, floating head, grub, shroud, wall) coloured
 * per creature after docs/research/art-direction.md. Everything faces right (the renderer flips);
 * anims: idle (2), move (4), attack (2), hurt (1) unless noted. Pixel art at native scale.
 */

/** Creature palette: dark / mid / light body tones, accent, eye. */
interface Pal {
  d: number;
  m: number;
  l: number;
  a: number;
  e: number;
}

const pal = (d: number, m: number, l: number, a: number, e: number): Pal => ({ d, m, l, a, e });

type Draw = (p: Pen, anim: string, frame: number) => void;

function def(w: number, h: number, draw: Draw, opts: { anims?: Record<string, number>; fps?: SpriteDef['fps']; meta?: SpriteMeta } = {}): SpriteDef {
  return {
    w,
    h,
    anims: opts.anims ?? { idle: 2, move: 4, attack: 2, hurt: 1 },
    fps: opts.fps ?? { idle: 3, move: 9, attack: 6 },
    meta: opts.meta,
    draw(ctx: PixelContext, anim, frame) {
      draw(new Pen(ctx), anim, frame);
    },
  };
}

/** Leg swing offset for walk frames (0..3). */
const swing = (frame: number, phase: number): number => [0, 1, 0, -1][(frame + phase) & 3]!;
/** 1 px breathing bob on idle frame 1. */
const breathe = (anim: string, frame: number): number => (anim === 'idle' && frame === 1 ? 1 : 0);

// ------------------------------------------------------------------------------------------------
// Ground beasts
// ------------------------------------------------------------------------------------------------

interface QuadOpts {
  tusks?: boolean;
  mane?: number;
  ears?: boolean;
  tail?: boolean;
  bristles?: boolean;
  spots?: number;
}

/** Four-legged beast: boars, wolves, lynxes. */
function quadruped(W: number, H: number, c: Pal, o: QuadOpts = {}): SpriteDef {
  return def(W, H, (p, anim, f) => {
    const bob = breathe(anim, f);
    const atk = anim === 'attack' || anim === 'charge';
    const legTop = Math.round(H * 0.62);
    const bodyCy = H * 0.45 + bob;
    // Legs (back pair darker).
    const lx = [0.22, 0.34, 0.62, 0.74].map((t) => Math.round(W * t));
    lx.forEach((x, i) => {
      const s = anim === 'move' || anim === 'run' ? swing(f, i % 2 ? 2 : 0) : 0;
      p.vline(x + s, legTop, H - 1, i % 2 ? c.d : shade(c.d, 0.8));
      p.px(x + s, H - 1, shade(c.d, 0.6));
    });
    if (o.tail) p.line(Math.round(W * 0.12), Math.round(bodyCy - 1), 1, Math.round(bodyCy - H * 0.25), c.m);
    p.ellipse(W * 0.46, bodyCy, W * 0.34, H * 0.28, c.m);
    p.ellipse(W * 0.44, bodyCy + H * 0.08, W * 0.28, H * 0.16, c.l);
    if (o.spots) for (let i = 0; i < 4; i++) p.px(Math.round(W * (0.28 + i * 0.12)), Math.round(bodyCy - 1 + (i % 2)), o.spots);
    if (o.bristles) for (let x = Math.round(W * 0.2); x < W * 0.68; x += 2) p.px(x, Math.round(bodyCy - H * 0.28), c.d);
    if (o.mane) {
      for (let x = Math.round(W * 0.22); x < W * 0.7; x += 2) {
        const flick = (x + f) % 3 === 0 ? 2 : 1;
        p.vline(x, Math.round(bodyCy - H * 0.28 - flick), Math.round(bodyCy - H * 0.26), x % 4 ? o.mane : shade(o.mane, 1.3));
      }
    }
    // Head (lowered when charging).
    const hx = W * 0.8;
    const hy = bodyCy - H * 0.06 + (atk ? H * 0.12 : 0);
    p.ellipse(hx, hy, W * 0.15, H * 0.22, c.m);
    p.rect(Math.round(hx + W * 0.08), Math.round(hy), Math.max(2, Math.round(W * 0.1)), Math.max(2, Math.round(H * 0.16)), c.l);
    p.px(Math.round(hx + W * 0.04), Math.round(hy - H * 0.08), anim === 'hurt' ? 0xffffff : c.e);
    if (o.ears) p.px(Math.round(hx - W * 0.04), Math.round(hy - H * 0.26), c.d);
    if (o.tusks) p.px(Math.round(hx + W * 0.14), Math.round(hy + H * 0.16), 0xf0e8d0);
  });
}

/** Armoured beetle (forest/shard beetles, rock crawler, haste beetle). */
function beetle(W: number, H: number, c: Pal, o: { spikes?: number; stripe?: number; rocky?: boolean } = {}): SpriteDef {
  return def(W, H, (p, anim, f) => {
    const lift = anim === 'attack' ? 1 : breathe(anim, f);
    for (let i = 0; i < 3; i++) {
      const x = Math.round(W * (0.25 + i * 0.22)) + (anim === 'move' ? swing(f, i) : 0);
      p.line(x, H - 3, x + (i - 1), H - 1, c.d);
    }
    p.ellipse(W * 0.44, H * 0.55 - lift, W * 0.38, H * 0.42, c.m);
    p.ellipse(W * 0.4, H * 0.42 - lift, W * 0.24, H * 0.22, c.l);
    p.vline(Math.round(W * 0.44), Math.round(H * 0.2 - lift), Math.round(H * 0.85 - lift), c.d);
    if (o.stripe) p.hline(Math.round(W * 0.15), Math.round(W * 0.75), Math.round(H * 0.58 - lift), o.stripe);
    if (o.rocky) for (let i = 0; i < 5; i++) p.px(Math.round(W * (0.15 + i * 0.13)), Math.round(H * (0.3 + (i % 2) * 0.25)), c.d);
    if (o.spikes) {
      for (let i = 0; i < 3; i++) {
        const x = Math.round(W * (0.22 + i * 0.18));
        const glow = anim === 'attack' || anim === 'charge' ? 0xffffff : o.spikes;
        p.vline(x, Math.round(H * 0.05), Math.round(H * 0.22 - lift), glow);
      }
    }
    p.ellipse(W * 0.86, H * 0.62, W * 0.12, H * 0.2, c.d);
    p.px(Math.round(W * 0.9), Math.round(H * 0.55), c.e);
    p.px(W - 1, Math.round(H * 0.72), c.a);
  });
}

/** Eight-legged spider (cave/crystal spiders, spiderlings, the Broodqueen). */
function spider(W: number, H: number, c: Pal, o: { sigil?: number; crystal?: boolean } = {}): SpriteDef {
  return def(W, H, (p, anim, f) => {
    const rear = anim === 'attack' || anim === 'charge' ? Math.max(1, Math.round(H * 0.08)) : 0;
    const by = Math.round(H * 0.45) - rear;
    for (let i = 0; i < 4; i++) {
      const s = anim === 'move' ? swing(f, i) : 0;
      const kx = Math.round(W * (0.2 + i * 0.17));
      const top = by - Math.round(H * 0.18);
      p.line(Math.round(W * 0.5), by, kx + s, top, c.d);
      p.line(kx + s, top, kx + s + (i < 2 ? -2 : 2), H - 1, c.d);
    }
    p.ellipse(W * 0.32, by - H * 0.02, W * 0.24, H * 0.26, c.a);
    if (o.sigil) {
      p.px(Math.round(W * 0.3), by - 1, o.sigil);
      p.hline(Math.round(W * 0.27), Math.round(W * 0.33), by, o.sigil);
      p.px(Math.round(W * 0.3), by + 1, o.sigil);
    }
    if (o.crystal) {
      p.line(Math.round(W * 0.22), by - 2, Math.round(W * 0.3), Math.round(H * 0.05), 0xffffff);
      p.line(Math.round(W * 0.36), by - 2, Math.round(W * 0.4), Math.round(H * 0.1), c.l);
    }
    p.ellipse(W * 0.66, by + 1, W * 0.14, H * 0.16, c.m);
    p.px(Math.round(W * 0.74), by, anim === 'hurt' ? 0xffffff : c.e);
    p.px(Math.round(W * 0.76), by + 1, c.e);
    p.px(Math.round(W * 0.8), by + 2, c.l);
  });
}

/** Squat toad (toads, the Bogmother) and tadpoles. */
function toad(W: number, H: number, c: Pal, o: { warts?: boolean } = {}): SpriteDef {
  return def(
    W,
    H,
    (p, anim, f) => {
      const air = anim === 'move' || anim === 'jump';
      const puff = (anim === 'idle' && f === 1) || anim === 'attack' || anim === 'charge';
      const y = air ? -1 : 0;
      // Back legs.
      p.ellipse(W * 0.22, H * 0.78 + y, W * 0.16, H * 0.2, c.d);
      if (air) p.line(Math.round(W * 0.15), Math.round(H * 0.8), 1, H - 1, c.d);
      p.ellipse(W * 0.48, H * 0.55 + y, W * 0.42, H * 0.4, c.m);
      p.ellipse(W * 0.52, H * 0.72 + y, W * 0.3, puff ? H * 0.26 : H * 0.18, c.a);
      if (o.warts) for (let i = 0; i < 6; i++) p.px(Math.round(W * (0.2 + i * 0.1)), Math.round(H * (0.3 + (i % 3) * 0.08)), c.d);
      p.ellipse(W * 0.7, H * 0.25 + y, W * 0.1, H * 0.14, c.l);
      p.px(Math.round(W * 0.72), Math.round(H * 0.22 + y), anim === 'hurt' ? 0xffffff : c.e);
      p.hline(Math.round(W * 0.62), W - 2, Math.round(H * 0.5 + y), c.d);
      if (anim === 'attack') p.hline(W - 2, W - 1, Math.round(H * 0.5), 0xff80a0);
      p.rect(Math.round(W * 0.7), H - 2, Math.round(W * 0.14), 2, c.d);
    },
    { anims: { idle: 2, move: 2, attack: 1, hurt: 1 } },
  );
}

function tadpole(c: Pal): SpriteDef {
  return def(
    8,
    5,
    (p, anim, f) => {
      p.ellipse(5, 2.5, 2.6, 2.2, c.m);
      p.px(6, 1, c.e);
      const wag = anim === 'move' ? (f % 2 ? 1 : -1) : 0;
      p.line(2, 2, 0, 2 + wag, c.d);
    },
    { anims: { idle: 1, move: 2, hurt: 1 } },
  );
}

/** Long low lizard (salamander, Gloomjaw the croc, Emberwyrm with wings). */
function lizard(W: number, H: number, c: Pal, o: { wings?: number; crest?: number; spikes?: number; jaw?: boolean; spots?: number } = {}): SpriteDef {
  return def(W, H, (p, anim, f) => {
    const flap = o.wings ? [0, -2, -3, -1][f & 3]! : 0;
    const open = anim === 'attack' || anim === 'charge';
    const by = Math.round(H * (o.wings ? 0.55 : 0.6)) + breathe(anim, f);
    // Tail.
    p.line(1, by + 1 + (anim === 'move' ? swing(f, 0) : 0), Math.round(W * 0.25), by, c.m);
    p.line(0, by + 2, Math.round(W * 0.2), by + 1, c.d);
    // Legs.
    for (let i = 0; i < 2; i++) {
      const x = Math.round(W * (0.32 + i * 0.3)) + (anim === 'move' ? swing(f, i * 2) : 0);
      p.line(x, by + 1, x + 1, H - 1, c.d);
    }
    p.ellipse(W * 0.48, by, W * 0.3, H * 0.2, c.m);
    p.hline(Math.round(W * 0.26), Math.round(W * 0.7), by + Math.round(H * 0.12), c.l);
    if (o.spots) for (let i = 0; i < 5; i++) p.px(Math.round(W * (0.3 + i * 0.08)), by - 1 + (i % 2), o.spots);
    if (o.spikes) for (let x = Math.round(W * 0.24); x < W * 0.72; x += 3) p.vline(x, by - Math.round(H * 0.24), by - Math.round(H * 0.18), o.spikes);
    if (o.crest) for (let x = Math.round(W * 0.6); x < W * 0.85; x += 2) p.px(x, by - Math.round(H * 0.22), o.crest);
    // Head and jaw.
    const hx = Math.round(W * 0.78);
    p.ellipse(hx, by - H * 0.06, W * 0.1, H * 0.16, c.m);
    p.rect(hx, by - Math.round(H * 0.1), Math.round(W * 0.2), Math.max(2, Math.round(H * 0.1)), c.m);
    if (o.jaw || open) {
      const gap = open ? Math.max(2, Math.round(H * 0.1)) : 1;
      p.rect(hx + 1, by - Math.round(H * 0.1) + gap + 1, Math.round(W * 0.19), Math.max(1, Math.round(H * 0.06)), c.d);
      if (open) for (let x = hx + 2; x < hx + W * 0.18; x += 2) p.px(x, by - Math.round(H * 0.1) + Math.max(2, Math.round(H * 0.06)), 0xf0f0e0);
    }
    p.px(hx + 1, by - Math.round(H * 0.16), anim === 'hurt' ? 0xffffff : c.e);
    if (o.wings) {
      const wy = Math.round(H * 0.2) + flap;
      p.line(Math.round(W * 0.4), by - 2, Math.round(W * 0.3), Math.max(0, wy), o.wings);
      p.line(Math.round(W * 0.3), Math.max(0, wy), Math.round(W * 0.62), by - 3, o.wings);
      p.line(Math.round(W * 0.34), Math.max(0, wy) + 1, Math.round(W * 0.56), by - 3, shade(o.wings, 0.7));
      p.line(Math.round(W * 0.38), Math.max(0, wy) + 2, Math.round(W * 0.5), by - 3, shade(o.wings, 0.7));
    }
  });
}

// ------------------------------------------------------------------------------------------------
// Flyers
// ------------------------------------------------------------------------------------------------

/** Bat: round body, flapping wings (glimmer/cave bats, ember bat companion). */
function bat(W: number, H: number, c: Pal, o: { trail?: number } = {}): SpriteDef {
  return def(
    W,
    H,
    (p, anim, f) => {
      const up = anim === 'idle' ? f % 2 : [0, 1, 2, 1][f & 3]!;
      const cy = Math.round(H * 0.5);
      const cx = Math.round(W / 2);
      const wy = up === 0 ? cy + 1 : up === 1 ? cy - 1 : cy - 3;
      p.line(cx - 2, cy, 0, Math.max(0, wy), c.d);
      p.line(cx + 2, cy, W - 1, Math.max(0, wy), c.d);
      p.line(cx - 2, cy + 1, 1, Math.max(0, wy) + 1, c.m);
      p.line(cx + 2, cy + 1, W - 2, Math.max(0, wy) + 1, c.m);
      p.ellipse(cx, cy, 2.4, 2.2, c.m);
      p.px(cx - 1, cy - 2, c.d);
      p.px(cx + 1, cy - 2, c.d);
      p.px(cx + 1, cy - 1, anim === 'hurt' ? 0xffffff : c.e);
      if (o.trail) p.px(0, Math.min(H - 1, cy + 2), o.trail);
    },
    { anims: { idle: 2, move: 4, hurt: 1 }, fps: { idle: 6, move: 12 } },
  );
}

/** Owl / bird: perched (idle) or wings spread (move/attack). */
function owl(W: number, H: number, c: Pal): SpriteDef {
  return def(W, H, (p, anim, f) => {
    const spread = anim !== 'idle';
    p.ellipse(W / 2, H * 0.58, W * 0.3, H * 0.38, c.m);
    p.ellipse(W / 2, H * 0.66, W * 0.18, H * 0.24, c.l);
    if (spread) {
      const y = f % 2 ? 2 : 4;
      p.line(Math.round(W * 0.25), Math.round(H * 0.55), 0, y, c.d);
      p.line(Math.round(W * 0.75), Math.round(H * 0.55), W - 1, y, c.d);
    }
    p.px(Math.round(W * 0.4), Math.round(H * 0.38), c.e);
    p.px(Math.round(W * 0.62), Math.round(H * 0.38), c.e);
    p.px(Math.round(W * 0.52), Math.round(H * 0.48), c.a);
    p.px(Math.round(W * 0.3), Math.round(H * 0.18), c.d);
    p.px(Math.round(W * 0.7), Math.round(H * 0.18), c.d);
  });
}

/** Wasp: striped abdomen, flicker wings, stinger. */
function wasp(W: number, H: number, c: Pal): SpriteDef {
  return def(
    W,
    H,
    (p, anim, f) => {
      const cy = Math.round(H * 0.55);
      p.ellipse(W * 0.32, cy, W * 0.26, H * 0.28, c.a);
      for (let x = 1; x < W * 0.55; x += 2) p.vline(x, cy - 1, cy + 1, c.d);
      p.disc(W * 0.7, cy - 1, 1.6, c.d);
      p.px(Math.round(W * 0.78), cy - 1, c.e);
      p.px(0, cy + 1, anim === 'attack' ? 0xff3030 : c.d);
      p.ctx.globalAlpha = 0.6;
      const wy = f % 2 ? 0 : 1;
      p.rect(Math.round(W * 0.38), wy, 3, 2, 0xe0f0ff);
      p.ctx.globalAlpha = 1;
    },
    { anims: { idle: 2, move: 2, attack: 1, hurt: 1 }, fps: { idle: 14, move: 14 } },
  );
}

// ------------------------------------------------------------------------------------------------
// People and imps
// ------------------------------------------------------------------------------------------------

interface HumanoidOpts {
  skin: number;
  shirt: number;
  pants: number;
  hair?: number;
  hood?: number;
  apron?: number;
  robe?: boolean;
  hat?: number;
  beard?: number;
  pack?: number;
  horns?: number;
  wings?: number;
  lamp?: number;
  tool?: 'pick' | 'hammer' | 'staff' | 'sword';
  float?: boolean;
  bones?: boolean;
  visor?: number;
}

/** Small humanoid (W≈10, H≈13): villagers, skeleton miner, imps, the Shardbound Knight. */
function humanoid(W: number, H: number, o: HumanoidOpts): SpriteDef {
  return def(W, H, (p, anim, f) => {
    const cx = Math.round(W / 2) - 1;
    const bob = o.float ? (f % 2) : breathe(anim, f);
    const headH = Math.max(3, Math.round(H * 0.3));
    const top = (o.float ? 1 : 0) + bob + (o.horns ? 2 : 0);
    const bodyTop = top + headH;
    const legTop = Math.round(H * 0.72);
    // Legs / robe.
    if (o.robe || o.float) {
      p.rect(cx - 2, bodyTop, 5, H - bodyTop - (o.float ? 1 : 0), o.pants);
      p.hline(cx - 2, cx + 2, H - 1 - (o.float ? 1 : 0), shade(o.pants, 0.7));
    } else {
      const s = anim === 'move' || anim === 'run' ? swing(f, 0) : 0;
      p.vline(cx - 1 + s, legTop, H - 1, o.pants);
      p.vline(cx + 1 - s, legTop, H - 1, shade(o.pants, 0.8));
    }
    // Torso.
    p.rect(cx - 2, bodyTop, 5, Math.max(2, legTop - bodyTop), o.shirt);
    if (o.bones) for (let y = bodyTop + 1; y < legTop; y += 2) p.hline(cx - 1, cx + 1, y, shade(o.shirt, 0.6));
    if (o.apron) p.rect(cx - 1, bodyTop + 1, 3, legTop - bodyTop + 1, o.apron);
    if (o.pack) p.rect(cx - 3, bodyTop, 2, 4, o.pack);
    // Arm (front) + tool.
    const raised = anim === 'attack' || anim === 'charge' || anim === 'cast';
    p.vline(cx + 3, bodyTop + (raised ? -1 : 1), bodyTop + (raised ? 1 : 3), o.skin);
    if (o.tool === 'pick') {
      p.vline(cx + 4, bodyTop - (raised ? 3 : 0), bodyTop + 3 - (raised ? 3 : 0), 0x7a4a2a);
      p.hline(cx + 3, cx + 6, bodyTop - (raised ? 3 : 0), 0xb0b0b8);
    } else if (o.tool === 'hammer') {
      p.vline(cx + 4, bodyTop - (raised ? 2 : 0), bodyTop + 3, 0x7a4a2a);
      p.rect(cx + 3, bodyTop - (raised ? 3 : 1), 3, 2, 0x707078);
    } else if (o.tool === 'staff') {
      p.vline(cx + 4, top, H - 1, 0x8a6a3a);
      p.px(cx + 4, top - 1, o.lamp ?? 0xffe080);
    } else if (o.tool === 'sword') {
      const y = raised ? top - 1 : bodyTop + 1;
      p.line(cx + 4, bodyTop + 2, cx + (raised ? 6 : 8), y, 0xd0c8ff);
    }
    // Head.
    p.rect(cx - 2, top, 5, headH, o.skin);
    if (o.hair) p.hline(cx - 2, cx + 2, top, o.hair);
    if (o.hood) {
      p.hline(cx - 2, cx + 2, top, o.hood);
      p.vline(cx - 2, top, top + headH - 1, o.hood);
    }
    if (o.hat) {
      p.hline(cx - 3, cx + 3, top, o.hat);
      p.rect(cx - 1, top - 2, 3, 2, o.hat);
    }
    if (o.visor) p.hline(cx - 1, cx + 2, top + 1, o.visor);
    if (o.beard) p.rect(cx, top + headH - 2, 3, 2, o.beard);
    const eye = anim === 'hurt' ? 0xffffff : o.bones ? 0x101010 : 0x1a1010;
    if (!o.visor) p.px(cx + 1, top + 1, eye);
    if (o.horns) {
      p.px(cx - 2, top - 1, o.horns);
      p.px(cx - 2, top - 2, o.horns);
      p.px(cx + 2, top - 1, o.horns);
      p.px(cx + 2, top - 2, o.horns);
    }
    if (o.lamp && o.tool !== 'staff') p.px(cx + 1, top - 1, o.lamp);
    if (o.wings) {
      const y = f % 2 ? bodyTop - 1 : bodyTop + 1;
      p.line(cx - 3, bodyTop + 1, 0, y, o.wings);
    }
  });
}

// ------------------------------------------------------------------------------------------------
// Odd ones
// ------------------------------------------------------------------------------------------------

/** Carved post with glyph eyes (hex totem). */
function totem(W: number, H: number, c: Pal): SpriteDef {
  return def(
    W,
    H,
    (p, anim, f) => {
      p.rect(1, 0, W - 2, H, c.m);
      for (let y = 4; y < H; y += 5) p.hline(1, W - 2, y, c.d);
      p.vline(1, 0, H - 1, c.d);
      p.rect(0, H - 2, W, 2, c.d);
      const lit = anim === 'attack' || anim === 'charge' ? 0xffffff : f % 2 ? shade(c.e, 1.2) : c.e;
      p.rect(2, 2, 2, 2, lit);
      p.rect(W - 4, 2, 2, 2, lit);
      p.hline(3, W - 4, 7, c.a);
    },
    { anims: { idle: 2, attack: 1, hurt: 1 }, meta: { glow: c.e } },
  );
}

/** Hulking stone golem with crystals. */
function golem(W: number, H: number, c: Pal): SpriteDef {
  return def(W, H, (p, anim, f) => {
    const raised = anim === 'attack' || anim === 'charge';
    const s = anim === 'move' || anim === 'run' ? swing(f, 0) : 0;
    p.rect(Math.round(W * 0.25) + s, Math.round(H * 0.75), 4, H - Math.round(H * 0.75), c.d);
    p.rect(Math.round(W * 0.55) - s, Math.round(H * 0.75), 4, H - Math.round(H * 0.75), c.d);
    p.rect(Math.round(W * 0.15), Math.round(H * 0.3), Math.round(W * 0.7), Math.round(H * 0.48), c.m);
    p.rect(Math.round(W * 0.2), Math.round(H * 0.34), Math.round(W * 0.3), Math.round(H * 0.16), c.l);
    p.rect(Math.round(W * 0.3), Math.round(H * 0.1), Math.round(W * 0.42), Math.round(H * 0.24), c.m);
    p.px(Math.round(W * 0.6), Math.round(H * 0.18), c.e);
    const ay = raised ? Math.round(H * 0.05) : Math.round(H * 0.4);
    p.rect(Math.round(W * 0.82), ay, 3, Math.round(H * 0.3), c.d);
    p.rect(Math.round(W * 0.8), ay + Math.round(H * 0.28), 4, 3, c.m);
    p.rect(0, Math.round(H * 0.4), 3, Math.round(H * 0.3), c.d);
    for (let i = 0; i < 3; i++) {
      const x = Math.round(W * (0.22 + i * 0.18));
      p.vline(x, Math.round(H * 0.24) - i, Math.round(H * 0.32), c.a);
      p.px(x, Math.round(H * 0.24) - i - 1, 0xffffff);
    }
  });
}

/** Floating head / orb with a face (blight heads, wisps). */
function orb(W: number, H: number, c: Pal, o: { maw?: boolean; glow?: number } = {}): SpriteDef {
  return def(
    W,
    H,
    (p, anim, f) => {
      const cx = W / 2;
      const cy = H / 2 + (f % 2 ? 0.5 : 0);
      p.disc(cx, cy, Math.min(W, H) / 2 - 0.5, c.m);
      p.disc(cx - 1, cy - 1, Math.min(W, H) / 3.5, c.l);
      const open = anim === 'attack' || anim === 'charge' || anim === 'shoot';
      if (o.maw) {
        p.rect(Math.round(cx - 2), Math.round(cy + 1), 5, open ? 3 : 1, 0x080004);
        if (open) {
          p.px(Math.round(cx - 2), Math.round(cy + 1), 0xffffff);
          p.px(Math.round(cx + 2), Math.round(cy + 1), 0xffffff);
        }
      }
      p.px(Math.round(cx - 2), Math.round(cy - 2), c.e);
      p.px(Math.round(cx + 2), Math.round(cy - 2), c.e);
    },
    { anims: { idle: 2, move: 2, attack: 1, hurt: 1 }, fps: { idle: 4, move: 6 }, meta: { glow: o.glow ?? 0 } },
  );
}

/** Segmented grub (blight spawn). */
function grub(W: number, H: number, c: Pal): SpriteDef {
  return def(W, H, (p, anim, f) => {
    const rear = anim === 'attack' ? 2 : 0;
    for (let i = 0; i < 4; i++) {
      const x = 1.5 + i * (W - 3) / 3.4;
      const y = H - 3 - (i === 3 ? rear : 0) + (anim === 'move' && (i + f) % 2 ? -1 : 0);
      p.ellipse(x, y, 2, 2.4, i % 2 ? c.m : c.d);
      p.px(Math.round(x), Math.round(y - 2), c.l);
    }
    p.px(W - 2, H - 4 - rear, c.e);
  });
}

/** Ragged shroud (the Blight Wraith, Frost Matron's cloak variant). */
function shroud(W: number, H: number, c: Pal): SpriteDef {
  return def(
    W,
    H,
    (p, _anim, f) => {
      p.ellipse(W / 2, H * 0.32, W * 0.34, H * 0.26, c.m);
      p.rect(Math.round(W * 0.16), Math.round(H * 0.32), Math.round(W * 0.68), Math.round(H * 0.45), c.m);
      for (let x = Math.round(W * 0.16); x < W * 0.84; x += 2) p.vline(x, Math.round(H * 0.7), Math.round(H * 0.8) + ((x + f) % 3), c.d);
      p.disc(W / 2, H * 0.5, 2, c.a);
      p.px(Math.round(W * 0.42), Math.round(H * 0.3), c.e);
      p.px(Math.round(W * 0.6), Math.round(H * 0.3), c.e);
    },
    { anims: { idle: 3, move: 3, hurt: 1 }, fps: 6, meta: { glow: c.a } },
  );
}

function chicken(): SpriteDef {
  return def(
    7,
    7,
    (p, anim, f) => {
      const peck = anim === 'idle' && f === 1 ? 1 : 0;
      p.ellipse(3, 4.2, 2.8, 2.2, 0xf0f0f0);
      p.px(1, 3, 0xd0d0d0);
      p.rect(4, 1 + peck, 2, 2, 0xf0f0f0);
      p.px(5, peck, 0xe03030);
      p.px(6, 2 + peck, 0xf0a020);
      p.px(5, 1 + peck, 0x101010);
      p.vline(2, 6, 6, 0xf0a020);
      p.vline(4, 6, 6, 0xf0a020);
    },
    { anims: { idle: 2, move: 2 }, fps: 3 },
  );
}

function drone(): SpriteDef {
  return def(
    9,
    7,
    (p, _anim, f) => {
      p.rect(2, 3, 5, 3, 0x707880);
      p.hline(2, 6, 3, 0xa0a8b0);
      p.px(5, 4, f % 2 ? 0x40ff80 : 0x20a050);
      p.hline(0, 3 + (f % 2), 1, 0xc0c8d0);
      p.hline(5 - (f % 2), 8, 1, 0xc0c8d0);
      p.vline(4, 1, 2, 0x505860);
    },
    { anims: { idle: 2, move: 2 }, fps: 12, meta: { glow: 0x40ff80 } },
  );
}

/** Shardbound Knight: plated armour with amethyst inlays, cape, crystal greatsword. */
function knight(): SpriteDef {
  const W = 26;
  const H = 26;
  const steel = 0x5a5a60;
  const steelL = 0x8a8a94;
  const steelD = 0x34343a;
  const gem = 0xa060ff;
  return def(W, H, (p, anim, f) => {
    const raised = anim === 'attack' || anim === 'charge';
    const s = anim === 'move' || anim === 'run' ? swing(f, 0) : 0;
    const b = breathe(anim, f);
    // Cape.
    p.rect(5, 8 + b, 4, 13, 0x3a1a5a);
    p.vline(5, 10 + b, 22, 0x2a1040);
    // Legs.
    p.rect(9 + s, 18, 3, 8, steelD);
    p.rect(13 - s, 18, 3, 8, steel);
    p.hline(9 + s, 12 + s, 25, steelD);
    // Torso + plates.
    p.rect(8, 8 + b, 9, 11, steel);
    p.rect(9, 9 + b, 3, 4, steelL);
    p.rect(13, 11 + b, 2, 3, gem);
    p.hline(8, 16, 17 + b, steelD);
    p.rect(7, 8 + b, 3, 3, steelL);
    p.rect(15, 8 + b, 3, 3, steelL);
    // Helmet with visor slit and crest.
    p.rect(9, 1 + b, 7, 7, steel);
    p.rect(10, 1 + b, 3, 2, steelL);
    p.hline(11, 16, 4 + b, anim === 'hurt' ? 0xffffff : 0xff40ff);
    p.vline(12, 0, 1 + b, gem);
    // Sword arm + crystal blade.
    if (raised) {
      p.rect(16, 6 + b, 2, 4, steel);
      p.line(17, 6 + b, 22, 0, 0xd0c8ff);
      p.line(18, 6 + b, 23, 1, gem);
    } else {
      p.rect(16, 10 + b, 2, 4, steel);
      p.line(18, 13 + b, 25, 13 + b, 0xd0c8ff);
      p.line(18, 14 + b, 24, 14 + b, gem);
      p.vline(18, 11 + b, 15 + b, 0x7a5a2a);
    }
  }, { meta: { glow: 0xc070ff } });
}

/** Frost Matron: hooded floating robe, pale face, orbiting ice shards. */
function matron(): SpriteDef {
  const W = 24;
  const H = 32;
  return def(
    W,
    H,
    (p, anim, f) => {
      const bob = f % 2;
      const robe = 0xc8e0f0;
      const robeD = 0x8ab0d0;
      // Robe widening to a ragged hem.
      for (let y = 9; y < 28; y++) {
        const half = 3 + Math.floor((y - 9) / 3);
        p.hline(12 - half, 11 + half, y + bob, y % 4 === 0 ? robeD : robe);
      }
      for (let x = 4; x < 20; x += 2) p.vline(x, 28 + bob, 29 + bob + ((x + f) % 2), robeD);
      p.vline(11, 10 + bob, 27 + bob, robeD);
      // Hood + face.
      p.rect(8, 2 + bob, 8, 8, 0xa0d0f0);
      p.rect(10, 4 + bob, 4, 5, 0xe0f4ff);
      p.px(11, 6 + bob, anim === 'hurt' ? 0xffffff : 0x2060a0);
      p.px(13, 6 + bob, anim === 'hurt' ? 0xffffff : 0x2060a0);
      // Raised hands when casting.
      if (anim === 'attack' || anim === 'charge') {
        p.rect(4, 8 + bob, 2, 2, 0xe0f4ff);
        p.rect(18, 8 + bob, 2, 2, 0xe0f4ff);
      }
      // Orbiting shards.
      for (let i = 0; i < 3; i++) {
        const a = (f / 3 + i / 3) * Math.PI * 2;
        const x = Math.round(12 + Math.cos(a) * 10);
        const y = Math.round(16 + Math.sin(a) * 4);
        p.vline(x, y - 1, y + 1, 0xa0ffff);
        p.px(x, y - 1, 0xffffff);
      }
    },
    { anims: { idle: 3, move: 3, attack: 2, hurt: 1 }, fps: 5, meta: { glow: 0xa0e0ff } },
  );
}

// ------------------------------------------------------------------------------------------------
// The Blightwall (40×160 hitbox; drawn as stacked flesh plates with maws and eyes)
// ------------------------------------------------------------------------------------------------

function blightwall(): SpriteDef {
  const W = 48;
  const H = 164;
  return def(
    W,
    H,
    (p, anim, f) => {
      const flesh = 0x4a0f2a;
      p.rect(4, 0, W - 4, H, 0x2c0113);
      for (let y = 0; y < H; y += 12) {
        const off = (y / 12) % 2 ? 3 : 0;
        p.ellipse(W / 2 + off, y + 6, W / 2 - 4, 6, flesh);
        p.hline(8 + off, W - 8, y + 2, 0x6a2a5a);
      }
      // Pulsing veins.
      for (let i = 0; i < 6; i++) {
        const x = 8 + ((i * 7) % (W - 14));
        p.vline(x, 0, H - 1, f % 2 && i % 2 ? 0xff3cb4 : 0x8a1a5a);
      }
      // Maws (match bosses.ts mouths at 20/50/80 % height) and eyes.
      const open = anim === 'attack' || anim === 'charge';
      for (const t of [0.2, 0.5, 0.8]) {
        const y = Math.round(H * t);
        p.ellipse(7, y, 6, open ? 5 : 3, 0x080004);
        for (let x = 3; x <= 11; x += 2) {
          p.px(x, y - (open ? 4 : 2), 0xf0e8f0);
          p.px(x, y + (open ? 4 : 2), 0xf0e8f0);
        }
        p.disc(16, y - 9, 2, 0xffffff);
        p.px(15, y - 9, 0xff3cb4);
      }
    },
    { anims: { idle: 2, attack: 1, hurt: 1 }, fps: 3, meta: { glow: 0xff3cb4 } },
  );
}

// ------------------------------------------------------------------------------------------------

export function registerBestiarySprites(): void {
  const reg = (key: string, d: SpriteDef) => defineSprite(key, d, BUILTIN_PRIORITY);

  // Mossgrave Woods
  reg('enemy_toad', toad(12, 9, pal(0x3a5a20, 0x6a8a30, 0xb0c860, 0xe0d8a0, 0x101808), { warts: true }));
  reg('enemy_boar', quadruped(15, 10, pal(0x3a2414, 0x6a4424, 0x9a6a40, 0, 0x100808), { tusks: true, bristles: true, tail: true }));
  reg('enemy_forest_beetle', beetle(12, 8, pal(0x1a3a1a, 0x2a6a3a, 0x80c080, 0, 0xe0e060)));
  reg('enemy_thorn_wasp', wasp(9, 7, pal(0x1e1a0c, 0x3a3010, 0xe0c040, 0xe0c040, 0xff3030)));
  // Fenmire
  reg('enemy_hex_totem', totem(10, 16, pal(0x4a2a14, 0x7a4a2a, 0x9a6a40, 0x40ffff, 0xb070ff)));
  reg('enemy_glimmer_bat', bat(11, 7, pal(0x3a1a5a, 0x6a30b0, 0x9060e0, 0, 0x40ffff), { trail: 0x40ffff }));
  reg('enemy_wisp_lynx', quadruped(13, 9, pal(0x108080, 0x20a0a0, 0x40e0e0, 0, 0xe0ffff), { ears: true, tail: true }));
  // Hollow Deep
  reg('enemy_cave_bat', bat(10, 7, pal(0x2a1a2a, 0x4a3a4a, 0x6a5a6a, 0, 0xff4040)));
  reg('enemy_bone_miner', humanoid(10, 13, { skin: 0xdbdbd9, shirt: 0x9e9e9c, pants: 0x8a8a88, bones: true, lamp: 0xffb040, hat: 0x6a5a30, tool: 'pick' }));
  reg('enemy_rock_crawler', beetle(12, 8, pal(0x3a3430, 0x5a524a, 0x7a7068, 0xc08040, 0xffd060), { rocky: true }));
  reg('enemy_cave_spider', spider(16, 12, pal(0x1a1a4a, 0x2a2a6a, 0x4a4a8a, 0x702373, 0xfaf879)));
  // Rimefrost
  reg('enemy_frostling', humanoid(10, 11, { skin: 0xc8f0ff, shirt: 0x96bed1, pants: 0x6a9ab0, horns: 0xffffff }));
  reg('enemy_ice_wolf', quadruped(16, 10, pal(0x4a6a80, 0x6a8aa0, 0xb6dce9, 0, 0x60c0ff), { ears: true, tail: true }));
  reg('enemy_snow_owl', owl(10, 9, pal(0x9aa4b0, 0xd0d8e0, 0xffffff, 0xe0a020, 0xe0c040)));
  // Amethyst Hollows
  reg('enemy_shard_beetle', beetle(16, 10, pal(0x240a30, 0x3e2152, 0x5a40a0, 0, 0xfaf879), { spikes: 0xc070ff, stripe: 0xc03030 }));
  reg('enemy_void_imp', humanoid(9, 10, { skin: 0x6a30b0, shirt: 0x4a1a8a, pants: 0x3a1070, horns: 0xff40ff, wings: 0x8040c0, float: true }));
  reg('enemy_crystal_spider', spider(14, 12, pal(0x6a2a9a, 0xa050e0, 0xffffff, 0xc05cf5, 0xffffff), { crystal: true }));
  reg('enemy_gem_golem', golem(18, 20, pal(0x4a4a50, 0x707078, 0x9a9aa0, 0x40e0ff, 0x40e0ff)));
  // Cinderdeep
  reg('enemy_flame_boar', quadruped(16, 10, pal(0x3a1a10, 0x6a2a14, 0x8a4020, 0, 0xffe080), { tusks: true, mane: 0xffb030, tail: true }));
  reg('enemy_ember_imp', humanoid(9, 10, { skin: 0xe05020, shirt: 0x8a1a10, pants: 0x6a1008, horns: 0xffe080, float: true, lamp: 0xffb030, tool: 'staff' }));
  reg('enemy_salamander', lizard(20, 9, pal(0x80200c, 0xc04020, 0xe07030, 0, 0xffe080), { spots: 0xffd040 }));
  // Blight Lair
  reg('enemy_blight_head', orb(12, 12, pal(0x2c0113, 0x6a2a5a, 0x8a3a7a, 0, 0xff40c0), { maw: true, glow: 0xff40c0 }));
  reg('enemy_blight_spawn', grub(11, 8, pal(0x340b24, 0x6a2a5a, 0x8a3a7a, 0, 0xff40c0)));
  reg('enemy_blight_wraith', shroud(16, 20, pal(0x050104, 0x0a0208, 0x2a0a20, 0xff40a0, 0xffffff)));
  // Boss minions
  reg('enemy_tadpole', tadpole(pal(0x2a4a20, 0x4a7a30, 0x80b050, 0, 0xe0e060)));
  reg('enemy_spiderling', spider(8, 6, pal(0x2a1a3a, 0x4a2a6a, 0x6a4a8a, 0x8a2a8a, 0xff40c0)));

  // Bosses (art-direction §bosses)
  reg('boss_gloomjaw', lizard(48, 22, pal(0x2a1808, 0x5a3a1a, 0x8a6a3a, 0, 0xc0ff40), { spikes: 0xf0f0e0, crest: 0x8a1a1a, jaw: true }));
  reg('boss_bogmother', toad(46, 34, pal(0x1a3a14, 0x4a7a30, 0x6a9a40, 0xd0c890, 0xffe060), { warts: true }));
  reg('boss_broodqueen', spider(40, 26, pal(0x1a1440, 0x2a2a6a, 0x4a4a9a, 0xa0208a, 0xff40c0), { sigil: 0xff80ff }));
  reg('boss_frost_matron', matron());
  reg('boss_shardbound_knight', knight());
  reg('boss_emberwyrm', lizard(42, 28, pal(0x700c0c, 0xc02020, 0xf0c040, 0, 0xffe080), { wings: 0xe04030, spikes: 0xf0c040, jaw: true }));
  reg('boss_blightwall', blightwall());

  // Town folk
  reg('npc_merchant', humanoid(10, 13, { skin: 0xe0b090, shirt: 0x3a6a9a, pants: 0x3a2a1a, hair: 0x5a3a1a, pack: 0x8a5a2a }));
  reg('npc_trader', humanoid(10, 13, { skin: 0xc09070, shirt: 0x7a5a2a, pants: 0x4a3a20, hood: 0x5a7a3a }));
  reg('npc_smith', humanoid(10, 13, { skin: 0xd09878, shirt: 0x8a3a2a, pants: 0x2a2a2a, beard: 0x3a2a1a, apron: 0x5a3a1a, tool: 'hammer' }));
  reg('npc_outfitter', humanoid(10, 13, { skin: 0xf0c8a0, shirt: 0x9a4a8a, pants: 0x4a3a5a, hair: 0xc08030, hat: 0x6a3a6a }));
  reg('npc_fence', humanoid(10, 13, { skin: 0xb08868, shirt: 0x2a2a3a, pants: 0x1a1a24, hood: 0x1a1a24 }));
  reg('npc_shrine', humanoid(10, 13, { skin: 0xf0d8c0, shirt: 0xe0e0f0, pants: 0xc8c8e0, robe: true, hood: 0xffe080, tool: 'staff', lamp: 0xffe080 }));
  reg('npc_chicken', chicken());

  // Companions
  reg('companion_mend_sprite', orb(8, 8, pal(0x2a8a40, 0x60e080, 0xc0ffc0, 0, 0x104020), { glow: 0x60ff80 }));
  reg('companion_ember_bat', bat(10, 7, pal(0x6a1a08, 0xe05020, 0xffb030, 0, 0xffe080), { trail: 0xffb030 }));
  reg('companion_lantern_wisp', orb(8, 8, pal(0xa07010, 0xffd060, 0xfff0c0, 0, 0x604000), { glow: 0xffd060 }));
  reg('companion_haste_beetle', beetle(9, 6, pal(0x1a3a6a, 0x3a6ab0, 0x80c0ff, 0, 0xffffff), { stripe: 0xffe040 }));
  reg('companion_gizmo_drone', drone());
}
