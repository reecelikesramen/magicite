import type { BiomeDef } from '../../content/types';
import type { Rng } from '../../engine/rng';
import type { LevelRequest } from './types';

const TOWN_A = ['Ash', 'Brook', 'Candle', 'Dun', 'Elm', 'Fern', 'Glim', 'Hearth', 'Iron', 'Lantern', 'Moss', 'Nettle', 'Oak', 'Pebble', 'Rook', 'Salt', 'Thistle', 'Under', 'Wick', 'Yarrow'];
const TOWN_B = ['hold', 'rest', 'haven', 'stead', 'ford', 'gate', 'burrow', 'well', 'mere', 'delve', 'hollow', 'nook'];

/**
 * Display name for a level. Combat districts are numbered by combat count (GDD §2b: level 1, 3, 5…
 * are Districts 1, 2, 3…); towns get a generated settlement name; level 21 is the Blight Lair.
 */
export function levelName(req: LevelRequest, biome: BiomeDef | undefined, rng: Rng): string {
  if (req.kind === 'lair') return 'The Blight Lair';
  const bname = biome?.name ?? req.biome;
  if (req.kind === 'town') return `${rng.pick(TOWN_A)}${rng.pick(TOWN_B)} (${bname})`;
  const n = Math.max(1, Math.ceil(req.district / 2));
  return `District ${n}: ${bname}`;
}
