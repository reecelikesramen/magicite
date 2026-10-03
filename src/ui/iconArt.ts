/**
 * Procedural pixel-art icons as pure pixel buffers (no DOM). `icons.ts` turns them into Pixi
 * textures. Item icons are 10×10, derived from the ItemDef (category / use / tool / equip slot /
 * id keywords) and tinted by material or tier, then given a 1 px dark outline.
 */
import type { ItemDef } from '../content/types';
import { TIER_COLORS, shade } from './theme';

export interface PixelBuf {
  w: number;
  h: number;
  /** 0xAARRGGBB per pixel, 0 = transparent. */
  data: Uint32Array;
}

export function makeBuf(w: number, h: number): PixelBuf {
  return { w, h, data: new Uint32Array(w * h) };
}

const OPAQUE = 0xff000000;
export const OUTLINE = 0x120c08;

export function setPx(b: PixelBuf, x: number, y: number, rgb: number, alpha = 255): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  b.data[y * b.w + x] = (((alpha & 255) << 24) | (rgb & 0xffffff)) >>> 0;
}

export function getPx(b: PixelBuf, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return 0;
  return b.data[y * b.w + x]!;
}

export function opaqueCount(b: PixelBuf): number {
  let n = 0;
  for (const v of b.data) if (v >>> 24) n++;
  return n;
}

/** Paint string art: one char per pixel, '.' / ' ' = skip, others looked up in `pal`. */
export function paint(b: PixelBuf, rows: readonly string[], pal: Readonly<Record<string, number>>, ox = 0, oy = 0): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c !== undefined) setPx(b, ox + x, oy + y, c);
    }
  }
}

/** Add a 1 px outline on transparent pixels 4-adjacent to opaque ones. */
export function outline(b: PixelBuf, rgb = OUTLINE): void {
  const src = b.data.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= b.w || y >= b.h ? 0 : src[y * b.w + x]! >>> 24);
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (at(x, y)) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) b.data[y * b.w + x] = (OPAQUE | rgb) >>> 0;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------------------------

type Tri = readonly [number, number, number];

const WOOD: Tri = [0x5a3418, 0x8a5428, 0xb47c42];
const MATERIALS: readonly [RegExp, Tri][] = [
  [/void/, [0x5a2a9a, 0x9a4ae0, 0xd29aff]],
  [/diamond/, [0x2a8aa8, 0x48cce4, 0xb0f6ff]],
  [/gold/, [0x9a6a10, 0xd8a820, 0xffe478]],
  [/iron|steel|metal/, [0x5a6470, 0x8e9aa8, 0xd4dce4]],
  [/amethyst|crystal|shard/, [0x7a2a8a, 0xc048d0, 0xff9cff]],
  [/frost|ice|snow/, [0x4a8ac0, 0x80c8f0, 0xd8f4ff]],
  [/ember|fire|flame|cinder|lava/, [0xa02810, 0xe8601c, 0xffc040]],
  [/jade|moss|bog|herb|leaf/, [0x2a6a2a, 0x48a840, 0x90e070]],
  [/slime|gel/, [0x2a8a2a, 0x5ce65c, 0xb0ffa0]],
  [/bone|skull/, [0x9a9078, 0xd8d0b8, 0xfff8e8]],
  [/stone|flint|rock/, [0x4e4e52, 0x808084, 0xb8b8bc]],
  [/coal|obsidian/, [0x141418, 0x2e2e36, 0x5a5a66]],
  [/leather|hide|pelt/, [0x6a3e1e, 0x9a6232, 0xc8925a]],
  [/silk|web|string|fiber|fabric|cloth|thread/, [0x9a9488, 0xd8d2c4, 0xfffcf0]],
  [/wood|plank|stick|log/, WOOD],
];

function tierTri(tier: number): Tri {
  const c = TIER_COLORS[Math.max(1, Math.min(TIER_COLORS.length - 1, tier))]!;
  return [shade(c, 0.55), shade(c, 0.8), c];
}

/** Material colours for an item: id keyword first, then tier colour. */
export function materialTri(id: string, tier = 1): Tri {
  for (const [re, tri] of MATERIALS) if (re.test(id)) return tri;
  return tierTri(tier);
}

/** Liquid colour for potions by keyword. */
function potionColor(id: string): [number, number] {
  if (/mana|blue/.test(id)) return [0x3a7aff, 0x1e3ea8];
  if (/mystery|myster/.test(id)) return [0x5ad84a, 0x2a7a2a];
  if (/poison|venom/.test(id)) return [0xa04ad8, 0x5a2080];
  if (/stamina|haste|speed/.test(id)) return [0xf0c030, 0x9a7010];
  if (/fire|ember/.test(id)) return [0xff7a2a, 0xa83010];
  return [0xff4a4a, 0xa01818];
}

// ---------------------------------------------------------------------------------------------
// Item icon kinds
// ---------------------------------------------------------------------------------------------

export type IconKind =
  | 'sword' | 'greatsword' | 'dagger' | 'spear' | 'blade' | 'axe' | 'pickaxe' | 'hammer' | 'sickle' | 'net'
  | 'bow' | 'crossbow' | 'wand' | 'staff' | 'tome' | 'bomb' | 'knife' | 'arrow'
  | 'helmet' | 'hat' | 'chest' | 'ring' | 'amulet' | 'boots' | 'shield' | 'feather'
  | 'potion' | 'meat' | 'bread' | 'berry' | 'herb' | 'mushroom'
  | 'log' | 'plank' | 'stick' | 'rock' | 'ore' | 'bar' | 'gem' | 'coal' | 'string' | 'cloth' | 'hide' | 'bone'
  | 'slime' | 'bug' | 'shell' | 'wing' | 'sac' | 'torch' | 'campfire' | 'ladder' | 'platform'
  | 'scroll' | 'key' | 'coin' | 'kit' | 'head' | 'unknown';

const has = (id: string, re: RegExp) => re.test(id);

/** Decide which pictogram represents an item. Works for unknown ids from keywords alone. */
export function iconKind(def: ItemDef | undefined, id: string): IconKind {
  const s = id.toLowerCase();
  if (s === 'gold' || has(s, /coin/)) return 'coin';
  if (has(s, /_pick_head|_axe_head|_head$/)) return 'head';
  if (has(s, /scroll|recipe/)) return 'scroll';
  if (has(s, /repair|_kit$|kit_/) && !has(s, /ladder|platform/)) return 'kit';
  if (has(s, /ladder/)) return 'ladder';
  if (has(s, /platform/)) return 'platform';
  if (has(s, /torch/)) return 'torch';
  if (has(s, /campfire|bonfire/)) return 'campfire';
  if (has(s, /bomb/)) return 'bomb';
  if (has(s, /throwing|shuriken/)) return 'knife';
  if (has(s, /crossbow/)) return 'crossbow';
  if (has(s, /bow|sling/)) return 'bow';
  if (has(s, /arrow|bolt(?!er)/) && def?.use !== 'cast') return 'arrow';
  if (has(s, /tome|grimoire|spellbook|book/)) return 'tome';
  if (has(s, /staff|scepter/)) return 'staff';
  if (has(s, /wand|rod/)) return 'wand';
  if (has(s, /great|claymore|zweihander/) && has(s, /sword|blade/)) return 'greatsword';
  if (has(s, /dagger|knife|dirk/)) return 'dagger';
  if (has(s, /spear|lance|pike|halberd|trident/)) return 'spear';
  if (has(s, /pickaxe|_pick$/)) return 'pickaxe';
  if (has(s, /hammer|mace|maul/)) return 'hammer';
  if (has(s, /scythe|sickle/)) return 'sickle';
  if (has(s, /bug_net|_net$|^net$/)) return 'net';
  if (has(s, /axe/)) return 'axe';
  if (has(s, /sword|saber|sabre|katana|rapier/)) return 'sword';
  if (has(s, /_blade$/)) return 'blade';

  if (def?.tool) {
    const t = def.tool;
    return t === 'axe' ? 'axe' : t === 'pickaxe' ? 'pickaxe' : t === 'net' ? 'net' : t === 'sickle' ? 'sickle' : 'hammer';
  }
  switch (def?.use) {
    case 'shoot':
      return 'bow';
    case 'cast':
      return 'wand';
    case 'throw':
      return 'knife';
    case 'thrust':
      return 'spear';
    case 'swing':
      return 'sword';
    default:
      break;
  }

  if (has(s, /shield|buckler|aegis/)) return 'shield';
  if (has(s, /helm|helmet|cap$|crown|hood|mask/)) return def?.category === 'hat' ? 'hat' : 'helmet';
  if (has(s, /hat|band$|ears|scarf/)) return 'hat';
  if (has(s, /armor|armour|chest|mail|plate|tunic|robe|vest|coat/)) return 'chest';
  if (has(s, /boot|shoe|greave/)) return 'boots';
  if (has(s, /ring|band/)) return 'ring';
  if (has(s, /amulet|pendant|necklace|charm|talisman|totem/)) return 'amulet';
  if (has(s, /feather|quill/)) return 'feather';
  if (def?.equipSlot === 'head' || def?.category === 'hat') return def?.category === 'hat' ? 'hat' : 'helmet';
  if (def?.equipSlot === 'body') return 'chest';
  if (def?.equipSlot === 'ammo' || def?.category === 'ammo') return 'arrow';
  if (def?.equipSlot === 'accessory1' || def?.equipSlot === 'accessory2' || def?.category === 'accessory') return 'ring';
  if (def?.equipSlot === 'trinket') return 'amulet';
  if (def?.category === 'armor') return 'chest';

  if (has(s, /potion|elixir|flask|vial|tonic|brew/)) return 'potion';
  if (has(s, /meat|steak|chicken|fish|jerky|drumstick/)) return 'meat';
  if (has(s, /bread|biscuit|pie|cake|loaf/)) return 'bread';
  if (has(s, /berry|berries|apple|fruit/)) return 'berry';
  if (has(s, /shroom|glowcap|mushroom|fungus/)) return 'mushroom';
  if (has(s, /herb|leaf|moss|root|plant/)) return 'herb';
  if (has(s, /firefly|moth|beetle|bug|butterfly/)) return 'bug';
  if (has(s, /plank|board/)) return 'plank';
  if (has(s, /stick|handle|hilt|rod/)) return 'stick';
  if (has(s, /wood|log/)) return 'log';
  if (has(s, /coal|charcoal/)) return 'coal';
  if (has(s, /_ore$|ore_/)) return 'ore';
  if (has(s, /_bar$|ingot|bar_/)) return 'bar';
  if (has(s, /diamond|gem|crystal|shard|amethyst|voidshard|jewel|core|magicite/)) return 'gem';
  if (has(s, /fiber|string|thread|twine|rope/)) return 'string';
  if (has(s, /fabric|silk|cloth|web|linen/)) return 'cloth';
  if (has(s, /leather|hide|pelt|fur|skin/)) return 'hide';
  if (has(s, /bone|skull|fang|tooth|horn/)) return 'bone';
  if (has(s, /slime|gel|goo|ooze/)) return 'slime';
  if (has(s, /shell|carapace|scale/)) return 'shell';
  if (has(s, /wing/)) return 'wing';
  if (has(s, /sac|gland|venom|bladder/)) return 'sac';
  if (has(s, /key/)) return 'key';
  if (has(s, /stone|rock|flint|pebble|dirt|clay|sand/)) return 'rock';

  switch (def?.category) {
    case 'consumable':
      return 'potion';
    case 'placeable':
      return 'kit';
    case 'key':
      return 'key';
    case 'weapon':
      return 'sword';
    case 'tool':
      return 'pickaxe';
    case 'material':
      return 'rock';
    default:
      return 'unknown';
  }
}

// prettier-ignore
export const ITEM_ART: Record<IconKind, readonly string[]> = {
  sword: ['..........', '........h.', '.......hH.', '......hH..', '.....hH...', '..a.hH....', '...a......', '..W.a.....', '.a........', '..........'],
  greatsword: ['..........', '.......hh.', '......hhH.', '.....hhH..', '....hhH...', '.a.hhH....', '..ahH.....', '..Wa......', '.W..a.....', '.a........'],
  dagger: ['..........', '..........', '..........', '......h...', '.....hH...', '..a.hH....', '...a......', '..W.a.....', '.a........', '..........'],
  blade: ['..........', '........h.', '.......hH.', '......hH..', '.....hH...', '....hH....', '...hH.....', '..DD......', '..........', '..........'],
  spear: ['..........', '.......Hh.', '......HhH.', '......aH..', '.....W....', '....W.....', '...W......', '..W.......', '.V........', '..........'],
  axe: ['..........', '..hHH.V...', '.hHHHWV...', '.hHHD.W...', '..hD..W...', '......W...', '......W...', '......W...', '......V...', '..........'],
  pickaxe: ['..........', '..hhHHHD..', '.h...W..D.', '.....W....', '.....W....', '.....W....', '.....W....', '.....W....', '.....V....', '..........'],
  hammer: ['..........', '.hhHHHHD..', '.hHHHHDD..', '.DDDDDDD..', '....W.....', '....W.....', '....W.....', '....W.....', '....V.....', '..........'],
  sickle: ['..........', '...hhHH...', '..h....H..', '.......H..', '......H...', '.....W....', '....W.....', '...W......', '..V.......', '..........'],
  net: ['..........', '.....GGG..', '....GsGsG.', '....GsGsG.', '....WGGG..', '...W......', '..W.......', '.W........', '.V........', '..........'],
  bow: ['..........', '...WWs....', '..W..s....', '.W...s....', '.w...s....', '.w...s....', '.W...s....', '..W..s....', '...WWs....', '..........'],
  crossbow: ['..........', '....h.....', '.DHHhHHD..', '.s..W..s..', '..s.W.s...', '...sWs....', '....W.....', '....W.....', '....V.....', '..........'],
  wand: ['..........', '........s.', '......sa..', '......aA..', '.....W....', '....W.....', '...W......', '..W.......', '.V........', '..........'],
  staff: ['..........', '....sa....', '...aaAA...', '....AA....', '....W.....', '....W.....', '....W.....', '....W.....', '....V.....', '..........'],
  tome: ['..........', '..AAAAAA..', '..AaaaaAs.', '..AayyaAs.', '..AayyaAs.', '..AaaaaAs.', '..AaaaaAs.', '..AAAAAAs.', '...ssssss.', '..........'],
  bomb: ['..........', '.......y..', '......o...', '.....G....', '...kkkk...', '..kgkkkk..', '..kgkkkk..', '..kkkkkk..', '...kkkk...', '..........'],
  knife: ['..........', '..........', '.......h..', '......hH..', '.....hH...', '....hH....', '...a......', '..W.......', '..........', '..........'],
  arrow: ['..........', '......hhh.', '.......hH.', '......W.h.', '.....W....', '....W.....', '.s.W......', '.sW.......', '.Vss......', '..........'],
  helmet: ['..........', '...hhHH...', '..hHHHHD..', '.hHHHHHHD.', '.hHkkkkHD.', '.hH....HD.', '.hH....HD.', '..D....D..', '..........', '..........'],
  hat: ['..........', '.....a....', '....aA....', '....aA....', '...aaAA...', '...ayyA...', '.aaaaAAAA.', '..AAAAAA..', '..........', '..........'],
  chest: ['..........', '.hH....HD.', '.hHHhHHHD.', '.hHHHHHHD.', '..hHHHHD..', '..hHaHHD..', '..hHHHHD..', '..DDDDDD..', '..........', '..........'],
  ring: ['..........', '....aa....', '...aAAa...', '...hHHD...', '..h....D..', '..h....D..', '..H....D..', '...HHDD...', '..........', '..........'],
  amulet: ['..........', '.h......h.', '..h....h..', '...h..h...', '....hh....', '...aaaa...', '...aAsa...', '...aAAa...', '....aa....', '..........'],
  boots: ['..........', '..hHH.....', '..hHH.....', '..hHH.....', '..hHH.....', '..hHHHH...', '..hHHHHH..', '..DDDDDD..', '..........', '..........'],
  shield: ['..........', '.hhHHHHD..', '.hHHaHHD..', '.hHaaaHD..', '.hHHaHHD..', '..hHHHD...', '...hHD....', '....D.....', '..........', '..........'],
  feather: ['..........', '.......ss.', '......sGs.', '.....sGs..', '....sGs...', '...sGs....', '...Gs.....', '..G.......', '.G........', '..........'],
  potion: ['..........', '....VV....', '....GG....', '...GaaG...', '..GsaaaG..', '..GaaaaG..', '..GaaAAG..', '...GAAG...', '..........', '..........'],
  meat: ['..........', '....aaA...', '...aaaaA..', '...aaaAA..', '...aAAAA..', '....AAA...', '...ss.....', '..sss.....', '..s.......', '..........'],
  bread: ['..........', '..........', '..........', '...aaaaa..', '..aAaAaAa.', '..aaaaaaa.', '..AAAAAAA.', '..........', '..........', '..........'],
  berry: ['..........', '.....E....', '....Ee....', '...aa.aa..', '..asAaasA.', '..aAAaAAA.', '...AaaA...', '....aAA...', '..........', '..........'],
  herb: ['..........', '.....e....', '....eEe...', '..e.eEe.e.', '..eEeEeEe.', '...eEEEe..', '....eEe...', '.....V....', '.....V....', '..........'],
  mushroom: ['..........', '..........', '...aaaa...', '..asaasa..', '.aaaaaaaa.', '.AAAAAAAA.', '....ss....', '....ss....', '...ssss...', '..........'],
  log: ['..........', '..........', '......aa..', '.WWWWaAAa.', '.VWWWaAaa.', '.WWVWaAAa.', '.WWWWaaAa.', '......aa..', '..........', '..........'],
  plank: ['..........', '..........', '..........', '.wwwwwwww.', '.WWWVWWWW.', '.WWWWWWVW.', '.VVVVVVVV.', '..........', '..........', '..........'],
  stick: ['..........', '.......wW.', '......wW..', '.....wW...', '....wW....', '...wW.....', '..wW......', '.VV.......', '..........', '..........'],
  rock: ['..........', '..........', '...hhH....', '..hHHHH...', '.hHHHHDD..', '.HHHHDDD..', '..DDDDD...', '..........', '..........', '..........'],
  ore: ['..........', '..........', '...ggG....', '..gaGGa...', '.gGGGaGk..', '.GaGGkkk..', '..kkakk...', '..........', '..........', '..........'],
  bar: ['..........', '..........', '..........', '...hhhhh..', '..hHHHHHD.', '.hHHHHHDD.', '.DDDDDDD..', '..........', '..........', '..........'],
  gem: ['..........', '..........', '...hhhh...', '..hHhHHD..', '.hHHHHHDD.', '..HHHHDD..', '...HHDD...', '....DD....', '..........', '..........'],
  coal: ['..........', '..........', '...kkg....', '..kgkkk...', '.kkkkgkk..', '.kgkkkkk..', '..kkkkk...', '..........', '..........', '..........'],
  string: ['..........', '..........', '...hhhh...', '..h....h..', '..h.hh.h..', '..h.h..h..', '..h..hh...', '...h......', '....hhhh..', '..........'],
  cloth: ['..........', '..........', '..hhhhhh..', '.hHhHhHhD.', '.hHHHHHHD.', '.hhHhHhHD.', '.HHHHHHHD.', '..DDDDDD..', '..........', '..........'],
  hide: ['..........', '..h....h..', '..hhhhhh..', '.hhHHHHhD.', '..hHHHHD..', '..hHHHHD..', '.hhHHHHDD.', '..h....D..', '..........', '..........'],
  bone: ['..........', '.......hh.', '......hHh.', '.....hH...', '....hH....', '...hH.....', '.hhH......', '.hHh......', '..h.......', '..........'],
  slime: ['..........', '..........', '....aa....', '...asaa...', '..aasaaa..', '..aaaaaa..', '.aaAaaAaa.', '.AAAAAAAA.', '..........', '..........'],
  bug: ['..........', '..s....s..', '...s..s...', '..ssaass..', '.sssaasss.', '..saAAas..', '....AA....', '...a..a...', '..........', '..........'],
  shell: ['..........', '..........', '...hhhh...', '..hHDHDh..', '.hHDHDHDH.', '.hHDHDHDH.', '.DDDDDDDD.', '..........', '..........', '..........'],
  wing: ['..........', '.h........', '.hh.......', '.hHh...h..', '.hHHh.hh..', '.hHHHhHH..', '.hDHDHDH..', '.D.D.D.D..', '..........', '..........'],
  sac: ['..........', '....V.....', '....aa....', '...asaa...', '..aasaaa..', '..aaaaAa..', '..aaaAAa..', '...AAAA...', '..........', '..........'],
  torch: ['..........', '....y.....', '...yoy....', '...ooo....', '....R.....', '....W.....', '....W.....', '....W.....', '....V.....', '..........'],
  campfire: ['..........', '....y.....', '...yo.....', '...ooy....', '..ooRoo...', '..oRRRo...', '.WVWWVWW..', '.VWVVWVV..', '..........', '..........'],
  ladder: ['..........', '..W....W..', '..WwwwwW..', '..W....W..', '..WwwwwW..', '..W....W..', '..WwwwwW..', '..W....W..', '..V....V..', '..........'],
  platform: ['..........', '..........', '..........', '.wwwwwwww.', '.WWWWWWWW.', '..V....V..', '..V....V..', '..V....V..', '..........', '..........'],
  scroll: ['..........', '..aaaaaa..', '.aAssssAa.', '..ssssss..', '..sGGGGs..', '..ssssss..', '..sGGGs...', '.aAssssAa.', '..aaaaaa..', '..........'],
  key: ['..........', '..aaa.....', '.a...a....', '.a...a....', '..aaaA....', '....aA....', '....aAa...', '....aA....', '....aAa...', '..........'],
  coin: ['..........', '..........', '...yyyy...', '..yYyyyY..', '..yYyyyY..', '..yYyyyY..', '..yYYYYY..', '...YYYY...', '..........', '..........'],
  kit: ['..........', '..........', '..WWWWWW..', '.WwwwwwwW.', '.WwwrrwwW.','.WwrrrrwW.', '.WwwrrwwW.', '.WWWWWWWW.', '..........', '..........'],
  head: ['..........', '..........', '..hhHHH...', '.hHHHHHD..', '.hHHHHDD..', '..DD.DD...', '...D.D....', '..........', '..........', '..........'],
  unknown: ['..........', '.mmmmmmmm.', '.m..mm..m.', '.m.m..m.m.', '.m....m.m.', '.m...m..m.', '.m..m...m.', '.m......m.', '.m..m...m.', '.mmmmmmmm.'],
};

/** Accent colours (guards, gems, liquids, food) per kind; `materialTri` covers h/H/D. */
function accentFor(kind: IconKind, id: string, mat: Tri): [number, number] {
  switch (kind) {
    case 'potion':
      return potionColor(id);
    case 'meat':
      return /cooked|roast|steak|jerky/.test(id) ? [0xb0682c, 0x7a401a] : [0xf09aa8, 0xc8566a];
    case 'bread':
      return [0xe8b060, 0xa86a2a];
    case 'berry':
      return /blue/.test(id) ? [0x6a7aff, 0x3a3aa8] : [0xe03048, 0x901828];
    case 'mushroom':
      return /glow/.test(id) ? [0x60e8ff, 0x2a90b0] : [0xd84838, 0x8a2018];
    case 'slime':
    case 'sac':
      return [mat[1], mat[0]];
    case 'bug':
      return /firefly/.test(id) ? [0xd8ff4a, 0x7aa020] : /moth/.test(id) ? [0xe8d8b0, 0x9a8a60] : [0x3a9a6a, 0x1e5a3a];
    case 'hat':
      return /wizard|mage/.test(id) ? [0x4a5ae0, 0x2a2a90] : /crown|gilded/.test(id) ? [0xffd84a, 0xb08a10] : [mat[1], mat[0]];
    case 'tome':
      return [mat[1], mat[0]];
    case 'scroll':
    case 'key':
      return [0xd8a83a, 0x8a6418];
    case 'sword':
    case 'greatsword':
    case 'dagger':
      return [0xc8a040, 0x7a5a1a];
    default:
      return [mat[2], mat[0]];
  }
}

const FIXED: Record<string, number> = {
  k: 0x2a2a34,
  g: 0x6a6a72,
  G: 0xb8b8c0,
  s: 0xf2eee4,
  y: 0xffe060,
  Y: 0xc89a20,
  o: 0xf07a20,
  R: 0xa02010,
  r: 0xd83030,
  e: 0x5cc84a,
  E: 0x2a7a2a,
  m: 0xff3cff,
};

/** Draw the 10×10 icon for an item id (def may be undefined for unknown ids). */
export function itemIconPixels(def: ItemDef | undefined, id: string): PixelBuf {
  const b = makeBuf(10, 10);
  const kind = iconKind(def, id);
  const s = id.toLowerCase();
  let mat = materialTri(s, def?.tier ?? 1);
  // Tools/weapons whose id has no material keyword: wooden starter gear looks like wood + stone.
  if (!MATERIALS.some(([re]) => re.test(s)) && (kind === 'sword' || kind === 'axe' || kind === 'pickaxe' || kind === 'hammer')) mat = tierTri(def?.tier ?? 1);
  if (kind === 'ore') mat = materialTri(s.replace(/stone|rock/g, ''), def?.tier ?? 2);
  const [a, A] = accentFor(kind, s, mat);
  const pal: Record<string, number> = { ...FIXED, h: mat[2], H: mat[1], D: mat[0], w: WOOD[2], W: WOOD[1], V: WOOD[0], a, A };
  if (kind === 'ore') {
    pal.a = mat[2];
    pal.G = 0x8a8a90;
  }
  paint(b, ITEM_ART[kind], pal);
  if (kind !== 'unknown') outline(b);
  return b;
}

// ---------------------------------------------------------------------------------------------
// HUD glyph icons (7×7 unless noted) and equipment ghosts (10×10)
// ---------------------------------------------------------------------------------------------

// prettier-ignore
export const HUD_ART: Record<string, { rows: string[]; pal: Record<string, number> }> = {
  heart: { rows: ['.rr.rr.', 'rsrrrRr', 'rrrrrRr', 'rrrrrRr', '.rrrRr.', '..rRr..', '...r...'], pal: { r: 0xe8282c, R: 0xa01418, s: 0xffb0b0 } },
  gem: { rows: ['...c...', '..csC..', '.cscCC.', 'cccCCCB', '.cCCCB.', '..CCB..', '...B...'], pal: { c: 0x7af0ff, C: 0x30b8e8, B: 0x1a6ab0, s: 0xffffff } },
  drumstick: { rows: ['..bbbB.', '.bbbbBB', '.bsbbBB', '.bbbBB.', '..sBB..', '.ss....', 's......'], pal: { b: 0xc07838, B: 0x7a4418, s: 0xf2eadc } },
  boot: { rows: ['.oooO..', '.oooO..', '.oooO..', '.oooO..', '.ooooO.', '.oooooO', '.OOOOOO'], pal: { o: 0xf09a30, O: 0xa85a14 } },
  coin: { rows: ['.yyy.', 'yYyyy', 'yYyyy', 'yYyyy', '.YYY.'], pal: { y: 0xffe060, Y: 0xc89a20 } },
  bulb: { rows: ['..yyy...', '.yssyy..', '.ysyyy..', '.yyyyy..', '..yyy...', '..ggg...', '..GGG...', '...g....'], pal: { y: 0xffe060, s: 0xfffff0, g: 0x9a9aa0, G: 0x6a6a70 } },
  sort: { rows: ['.ssssss.', '........', '.ssss...', '........', '.ss.....', '......s.', '.....sss', '......s.'], pal: { s: 0xffffff } },
  lock: { rows: ['..sss..', '.s...s.', '.s...s.', 'sssssss', 'sssgsss', 'sssgsss', 'sssssss'], pal: { s: 0xd8d8d8, g: 0x404040 } },
  skull: { rows: ['.sssss.', 'sssssss', 'skkskks', 'skkskks', 'sssssss', '.s.s.s.', '.......'], pal: { s: 0xe8e0d0, k: 0x201810 } },
  star: { rows: ['...y...', '...y...', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', 'y.....y'], pal: { y: 0xffe060 } },
};

// prettier-ignore
export const GHOST_ART: Record<string, string[]> = {
  head: ['..........', '...gggg...', '..gggggg..', '.gggggggg.', '.gggggggg.', '.gg....gg.', '.gg....gg.', '..g....g..', '..........', '..........'],
  body: ['..........', '.gg....gg.', '.gggggggg.', '.gggggggg.', '..gggggg..', '..gggggg..', '..gggggg..', '..gggggg..', '..........', '..........'],
  accessory1: ['..........', '....gg....', '...g..g...', '...gggg...', '..g....g..', '..g....g..', '..g....g..', '...gggg...', '..........', '..........'],
  accessory2: ['..........', '....gg....', '...g..g...', '...gggg...', '..g....g..', '..g....g..', '..g....g..', '...gggg...', '..........', '..........'],
  ammo: ['..........', '......ggg.', '.......gg.', '......g.g.', '.....g....', '....g.....', '.g.g......', '.gg.......', '.ggg......', '..........'],
  trinket: ['..........', '.......gg.', '......ggg.', '.....ggg..', '....ggg...', '...ggg....', '...gg.....', '..g.......', '.g........', '..........'],
};

export function artPixels(rows: readonly string[], pal: Readonly<Record<string, number>>): PixelBuf {
  const w = Math.max(...rows.map((r) => r.length));
  const b = makeBuf(w, rows.length);
  paint(b, rows, pal);
  return b;
}

/** Skill pictograms per path (10×10, white; tinted by the view). */
// prettier-ignore
export const SKILL_ART: Record<string, string[]> = {
  warrior: ['..........', '.s......s.', '..s....s..', '...s..s...', '....ss....', '....ss....', '...s..s...', '.gs....sg.', '.g......g.', '..........'],
  mage: ['..........', '....s.....', '...sss....', '..sssss...', '.sssssss..', '..sssss...', '...sss....', '....s..s..', '......sss.', '.......s..'],
  ranger: ['..........', '.......ss.', '......sss.', '.....s.s..', '....s.....', '...s......', '.gs.......', '.gs.......', '.ggs......', '..........'],
  unknown: ['..........', '...ssss...', '..s....s..', '......s...', '.....s....', '....s.....', '....s.....', '..........', '....s.....', '..........'],
};
