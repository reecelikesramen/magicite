import type { BiomeDef, Palette } from '../content/types';
import { hueSat, luminance } from './color';

/**
 * Presentation-only biome styling. The sim's tiles are generic materials; this decides how a
 * biome draws them (fringe kind, special tile look, tree look, spike tint, water colour...).
 * Picked by biome-id keywords so it works for both the GDD ids (`woods`, `fen`, `rime`…) and
 * older/longer ids (`toadvale_forest`), falling back to palette analysis. Pure (testable).
 */
export type BiomeFamily = 'woods' | 'fen' | 'hollow' | 'rime' | 'amethyst' | 'cinder' | 'lair';
export type FringeKind = 'grass' | 'moss' | 'snow' | 'crust' | 'crystal' | 'blight';
export type SpecialKind = 'mud' | 'ice' | 'crystal' | 'obsidian' | 'blight';
export type CeilingKind = 'roots' | 'vines' | 'icicles' | 'drips' | 'none';
export type TreeKind = 'puff' | 'fen' | 'shroom' | 'pine' | 'crystal' | 'charred' | 'blight';

export interface BiomeStyle {
  id: string;
  family: BiomeFamily;
  pal: Palette;
  fringe: FringeKind;
  /** Fringe pixels glow (lava crust, crystal moss). */
  fringeEmissive: boolean;
  special: SpecialKind;
  ceiling: CeilingKind;
  /** Glowing crack colours inside the ground body (cinder), or null. */
  crackGlow: number[] | null;
  spikes: number[];
  water: { body: number; deep: number; surface: number; alpha: number };
  lava: { crust: number[]; glow: number[] };
  brick: number[];
  wood: number[];
  tree: TreeKind;
  /** Trunk ramp (dark→light) and foliage ramp (dark→light). */
  trunk: number[];
  leaves: number[];
  ambientParticles: string;
  /** Portal interior / emissive accent for this biome (used for colour-coded exits). */
  portal: number;
}

const WOODS: Palette = {
  wall: [0x0a0806, 0x141009, 0x1f170e, 0x2a1f14],
  ground: [0x1c140c, 0x2a1f14, 0x3b2a1a, 0x4e3822],
  fringe: [0x2e7a26, 0x3f8f2a, 0x5fb83a, 0x8fdc5a],
  rock: [0x2a2a2e, 0x3e3e44, 0x5a5a60, 0x7a7a80],
  accent: [0x9cff3a, 0x4caf3a, 0x8fd65a, 0x7a4a24],
  ambient: 0x1a1410,
  ambientLevel: 0.12,
  sky: 0x050403,
  playerLight: 0xffb060,
};

/** Default palettes per family (used when the biome def is missing or for unknown ids). */
export const FAMILY_PALETTES: Record<BiomeFamily, Palette> = {
  woods: WOODS,
  fen: {
    wall: [0x05080c, 0x0a1018, 0x101a24, 0x16222e],
    ground: [0x0c1414, 0x142020, 0x1c2c2c, 0x243838],
    fringe: [0x124040, 0x1a5a5a, 0x2a8a8a, 0x40c0c0],
    rock: [0x20242c, 0x2c323c, 0x3c4450, 0x50586a],
    accent: [0x8040e0, 0xb070ff, 0x40ffff, 0xf0f0ff],
    ambient: 0x14205a,
    ambientLevel: 0.15,
    sky: 0x0b1236,
    playerLight: 0xffb060,
  },
  hollow: {
    wall: [0x080706, 0x100e0c, 0x181512, 0x221e1a],
    ground: [0x1a1612, 0x26201a, 0x332b22, 0x40362a],
    fringe: [0x2a3a1a, 0x3a4a22, 0x4a5a2a, 0x5e6e36],
    rock: [0x2a2a2e, 0x3e3e44, 0x5a5a60, 0x7a7a80],
    accent: [0xffc060, 0xc08050, 0x7a4a24, 0xe0c040],
    ambient: 0x201810,
    ambientLevel: 0.1,
    sky: 0x040302,
    playerLight: 0xffb060,
  },
  rime: {
    wall: [0x080a10, 0x0e121a, 0x161c26, 0x1e2632],
    ground: [0x1a2230, 0x243042, 0x2e3e54, 0x3a4e68],
    fringe: [0x9ab0c8, 0xc0d4e8, 0xe0ecf8, 0xffffff],
    rock: [0x2a3040, 0x3a4256, 0x4e586e, 0x667290],
    accent: [0x9ad8f0, 0x6ab0e0, 0xd8f4ff, 0x2e7a46],
    ambient: 0x203050,
    ambientLevel: 0.15,
    sky: 0x060a14,
    playerLight: 0xffc080,
  },
  amethyst: {
    wall: [0x0a0610, 0x120a1c, 0x1a1028, 0x241634],
    ground: [0x1a1230, 0x2a2040, 0x3a2a5a, 0x4a3670],
    fringe: [0xa02080, 0xd040a0, 0xff50c0, 0xff90e0],
    rock: [0x22183a, 0x30244e, 0x403466, 0x54487e],
    accent: [0xff40ff, 0xc020c0, 0xf0e0ff, 0xa060ff],
    ambient: 0x301848,
    ambientLevel: 0.12,
    sky: 0x08040e,
    playerLight: 0xffb070,
  },
  cinder: {
    wall: [0x100404, 0x2a0808, 0x4a1010, 0x5a1414],
    ground: [0x1e0a06, 0x2c0e08, 0x3a120c, 0x4a1a10],
    fringe: [0xff6018, 0xff8020, 0xffb030, 0xffd040],
    rock: [0x1a1414, 0x2a2020, 0x3a2c2a, 0x4a3a36],
    accent: [0xc03018, 0xe05020, 0xff8020, 0xffd040],
    ambient: 0x401008,
    ambientLevel: 0.12,
    sky: 0x0a0202,
    playerLight: 0xffb060,
  },
  lair: {
    wall: [0x0c0408, 0x160810, 0x200c18, 0x2c1022],
    ground: [0x1a0812, 0x260c1a, 0x341224, 0x441830],
    fringe: [0x801850, 0xb02070, 0xe040a0, 0xff70c0],
    rock: [0x1a1018, 0x281824, 0x382234, 0x4a2e46],
    accent: [0xff40a0, 0xff80c0, 0x400020, 0xffd0e0],
    ambient: 0x401028,
    ambientLevel: 0.1,
    sky: 0x080206,
    playerLight: 0xffb060,
  },
};

const KEYWORDS: [BiomeFamily, RegExp][] = [
  ['woods', /wood|forest|toad|grove|moss/],
  ['fen', /fen|swamp|bog|marsh|jungle|mire/],
  ['hollow', /hollow|cave|mine|ossuary|bone/],
  ['rime', /rime|snow|ice|frost|tundra|glacier/],
  ['amethyst', /amethyst|crystal|shadow|gem|void/],
  ['cinder', /cinder|volcan|lava|fire|magma|ember|ash/],
  ['lair', /lair|blight|heart/],
];

/** Guess the visual family of a biome from its id, then from its palette's fringe hue. */
export function biomeFamily(id: string, pal?: Palette): BiomeFamily {
  const s = id.toLowerCase();
  for (const [fam, re] of KEYWORDS) if (re.test(s)) return fam;
  if (pal && pal.fringe.length) {
    const top = pal.fringe[pal.fringe.length - 1]!;
    const { hue, sat } = hueSat(top);
    if (luminance(top) > 0.8 && sat < 0.25) return 'rime';
    if (hue < 50 && sat > 0.6) return 'cinder';
    if (hue >= 280 || (hue > 250 && sat > 0.4)) return 'amethyst';
    if (hue > 160 && hue < 210) return 'fen';
    if (hue >= 60 && hue <= 160) return 'woods';
  }
  return 'woods';
}

interface FamilyKnobs {
  fringe: FringeKind;
  fringeEmissive: boolean;
  special: SpecialKind;
  ceiling: CeilingKind;
  crackGlow: number[] | null;
  spikes: number[];
  water: BiomeStyle['water'];
  tree: TreeKind;
  trunk: number[];
  leaves: number[];
  ambientParticles: string;
}

const WATER = { body: 0x1c4aa8, deep: 0x102c6a, surface: 0x6aa8ff, alpha: 0.62 };

const KNOBS: Record<BiomeFamily, FamilyKnobs> = {
  woods: {
    fringe: 'grass', fringeEmissive: false, special: 'mud', ceiling: 'roots', crackGlow: null,
    spikes: [0x2a1a0c, 0x4a3a1a, 0x9a8a5a], water: WATER, tree: 'puff',
    trunk: [0x2e1a0c, 0x4a2a14, 0x7a4a24], leaves: [0x1e5a1c, 0x2e7a26, 0x4caf3a, 0x8fd65a], ambientParticles: 'fireflies',
  },
  fen: {
    fringe: 'grass', fringeEmissive: false, special: 'mud', ceiling: 'vines', crackGlow: null,
    spikes: [0x1a3030, 0x2a5050, 0x60a0a0], water: { body: 0x1a6070, deep: 0x0c3040, surface: 0x60e0e0, alpha: 0.6 }, tree: 'fen',
    trunk: [0x24241a, 0x3a3a24, 0x5a5a34], leaves: [0x40209a, 0x8040e0, 0xb070ff, 0xd8b0ff], ambientParticles: 'spores',
  },
  hollow: {
    fringe: 'moss', fringeEmissive: false, special: 'mud', ceiling: 'drips', crackGlow: null,
    spikes: [0x3e3e44, 0x7a7a80, 0xc8c8c8], water: WATER, tree: 'shroom',
    trunk: [0x6a5a48, 0x9a8a70, 0xc8b898], leaves: [0x6a2a1a, 0xa04a2a, 0xd07a3a, 0xf0b070], ambientParticles: 'dust',
  },
  rime: {
    fringe: 'snow', fringeEmissive: false, special: 'ice', ceiling: 'icicles', crackGlow: null,
    spikes: [0x6ab0e0, 0x9ad8f0, 0xffffff], water: { body: 0x3a7ac0, deep: 0x1c4a80, surface: 0xc0e8ff, alpha: 0.6 }, tree: 'pine',
    trunk: [0x2e1a0c, 0x4a2a14, 0x6a3e20], leaves: [0x143a24, 0x1e5232, 0x2e7a46, 0xf0f8ff], ambientParticles: 'snow',
  },
  amethyst: {
    fringe: 'crystal', fringeEmissive: true, special: 'crystal', ceiling: 'none', crackGlow: null,
    spikes: [0x6a20a0, 0xc040ff, 0xffa0ff], water: { body: 0x40287a, deep: 0x201040, surface: 0xc090ff, alpha: 0.6 }, tree: 'crystal',
    trunk: [0x140c22, 0x24163a, 0x3a2658], leaves: [0x8a1a8a, 0xc020c0, 0xff40ff, 0xffc0ff], ambientParticles: 'sparkles',
  },
  cinder: {
    fringe: 'crust', fringeEmissive: true, special: 'obsidian', ceiling: 'none', crackGlow: [0xc03018, 0xe05020],
    spikes: [0x1a0a0a, 0x3a1a14, 0xff8020], water: WATER, tree: 'charred',
    trunk: [0x120a0a, 0x22140f, 0x3a2418], leaves: [0x6a1408, 0xc03018, 0xff6020, 0xffb040], ambientParticles: 'embers',
  },
  lair: {
    fringe: 'blight', fringeEmissive: true, special: 'blight', ceiling: 'drips', crackGlow: [0x801850, 0xc02070],
    spikes: [0x400020, 0x801850, 0xff70c0], water: { body: 0x601040, deep: 0x300820, surface: 0xff80c0, alpha: 0.65 }, tree: 'blight',
    trunk: [0x1c0812, 0x2c1022, 0x441830], leaves: [0x801850, 0xc02070, 0xff40a0, 0xffb0d8], ambientParticles: 'spores_pink',
  },
};

const PORTAL: Record<BiomeFamily, number> = {
  woods: 0x7ac040,
  fen: 0x40c0c0,
  hollow: 0xffb050,
  rime: 0x9ad8f0,
  amethyst: 0xd060ff,
  cinder: 0xff7020,
  lair: 0xff40a0,
};

const cache = new Map<string, BiomeStyle>();

/** Resolve the presentation style of a biome (cached per id + def identity). */
export function biomeStyle(id: string, def?: BiomeDef): BiomeStyle {
  const key = id;
  const hit = cache.get(key);
  if (hit && (!def || hit.pal === def.palette)) return hit;
  const family = biomeFamily(id, def?.palette);
  const pal = def?.palette ?? FAMILY_PALETTES[family];
  const k = KNOBS[family];
  const style: BiomeStyle = {
    id,
    family,
    pal,
    fringe: k.fringe,
    fringeEmissive: k.fringeEmissive,
    special: k.special,
    ceiling: k.ceiling,
    crackGlow: k.crackGlow,
    spikes: k.spikes,
    water: k.water,
    lava: { crust: [0x7a1408, 0xa02010, 0xc83818, 0xe85a20], glow: [0xff8020, 0xffb030, 0xffd040, 0xfff0a0] },
    brick: family === 'cinder' ? [0x1a1010, 0x3a2420, 0x4e322a, 0x624034] : [0x232326, 0x46464c, 0x5c5c62, 0x74747a],
    wood: [0x2e1a0c, 0x4a2a14, 0x6a3e1e, 0x8a5a2e],
    tree: k.tree,
    trunk: k.trunk,
    leaves: k.leaves,
    ambientParticles: def?.ambientParticles || k.ambientParticles,
    portal: PORTAL[family],
  };
  cache.set(key, style);
  return style;
}
