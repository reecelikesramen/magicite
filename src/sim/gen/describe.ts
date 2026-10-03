import { TILE } from '../constants';
import { Tile } from '../tiles';
import type { Level } from '../world';

const TILE_CHARS: Record<number, string> = {
  [Tile.AIR]: ' ',
  [Tile.GROUND]: '#',
  [Tile.ROCK]: '%',
  [Tile.BEDROCK]: '@',
  [Tile.PLATFORM]: '=',
  [Tile.LADDER]: 'H',
  [Tile.SPIKES]: '^',
  [Tile.WATER]: '~',
  [Tile.LAVA]: '&',
  [Tile.BRICK]: 'B',
  [Tile.WOOD]: 'W',
  [Tile.SPECIAL]: '*',
};

const KIND_CHARS: Record<string, string> = { enemy: 'e', boss: 'X', resource: 'r', npc: 'n', prop: '.' };

/**
 * ASCII dump of a level for debugging and tests. Legend: `#` ground `%` rock `@` bedrock `=` platform
 * `H` ladder `^` spikes `~` water `&` lava `B` brick `W` wood `*` special · `S` spawn, `1-9` exit
 * portals, `T` tree, `r` resource, `c` chest/pot, `e` enemy, `X` boss, `n` npc, `.` decor prop.
 * `opts.entities: false` prints terrain only; `opts.region` crops (tiles, inclusive).
 */
export function describeLevel(level: Level, opts: { entities?: boolean; region?: { x0: number; y0: number; x1: number; y1: number } } = {}): string {
  const g = level.grid;
  const r = opts.region ?? { x0: 0, y0: 0, x1: g.w - 1, y1: g.h - 1 };
  const rows: string[][] = [];
  for (let y = r.y0; y <= r.y1; y++) {
    const row: string[] = [];
    for (let x = r.x0; x <= r.x1; x++) row.push(TILE_CHARS[g.get(x, y)] ?? '?');
    rows.push(row);
  }
  const plot = (tx: number, ty: number, ch: string): void => {
    if (tx < r.x0 || tx > r.x1 || ty < r.y0 || ty > r.y1) return;
    rows[ty - r.y0]![tx - r.x0] = ch;
  };
  if (opts.entities !== false) {
    for (const s of level.spawns) {
      const tx = Math.floor(s.x / TILE);
      const ty = Math.floor((s.y - 1) / TILE);
      let ch = KIND_CHARS[s.kind] ?? '?';
      if (s.kind === 'resource') ch = s.def.startsWith('tree_') ? 'T' : s.def.startsWith('chest_') || s.def === 'pot' ? 'c' : 'r';
      if (s.kind === 'prop' && s.data?.hang) {
        plot(tx, Math.floor(s.y / TILE) - 1, ch);
        continue;
      }
      plot(tx, ty, ch);
    }
    level.exits.forEach((e, i) => {
      for (let x = Math.floor(e.x / TILE); x < Math.floor((e.x + e.w) / TILE); x++) plot(x, Math.floor((e.y + e.h) / TILE) - 1, String(i + 1));
    });
    plot(Math.floor(level.spawn.x / TILE), Math.floor(level.spawn.y / TILE) - 1, 'S');
  }
  const head = `${level.info.name} [${level.info.biome}] ${g.w}x${g.h} seed=${level.info.seed}${level.locked ? ' locked' : ''}`;
  return [head, ...rows.map((row) => row.join(''))].join('\n');
}
