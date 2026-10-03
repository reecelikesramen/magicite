import { describe, expect, it } from 'vitest';
import { analyzeTraversal, MOVE, softLockCount } from '../../src/sim/gen';
import { repairTraversal } from '../../src/sim/gen/repair';
import { Tile } from '../../src/sim/tiles';
import { ctxFromAscii, gridFromAscii } from './helpers';

/** Is the (single) exit reachable from the spawn in this ASCII map? */
function reachable(rows: string[]): boolean {
  const { grid, spawn, exits } = gridFromAscii(rows);
  const t = analyzeTraversal(grid, spawn.tx, spawn.ty, exits);
  expect(t.spawnNode).toBeGreaterThanOrEqual(0);
  expect(t.exitNodes[0]!.length).toBeGreaterThan(0);
  return t.exitReachable[0]!;
}

/** Flat floor with a solid ledge `hgt` tiles above the spawn's feet; exit on the ledge. */
function ledge(hgt: number): string[] {
  const H = hgt + 6;
  const floor = H - 1;
  const top = floor - hgt;
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < 12; x++) {
      if (y === floor || (x >= 7 && y >= top)) row += '#';
      else if (x === 1 && y === floor - 1) row += 'S';
      else if (x === 9 && y === top - 1) row += 'E';
      else row += ' ';
    }
    rows.push(row);
  }
  return rows;
}

/** Two floors separated by a spiked pit `gap` tiles wide. */
function gap(g: number): string[] {
  const left = '#####';
  const right = '######';
  return [
    ' '.repeat(5 + g + 6),
    ' '.repeat(5 + g + 6),
    ' '.repeat(5 + g + 6),
    ' S' + ' '.repeat(3 + g + 2) + 'E   ',
    left + ' '.repeat(g) + right,
    left + ' '.repeat(g) + right,
    left + '^'.repeat(g) + right,
  ];
}

describe('traversal graph (movement capabilities)', () => {
  it('climbs ledges up to the double-jump height and no higher', () => {
    for (let h = 1; h <= MOVE.doubleJump; h++) expect(reachable(ledge(h)), `ledge ${h}`).toBe(true);
    expect(reachable(ledge(MOVE.doubleJump + 1))).toBe(false);
    expect(reachable(ledge(9))).toBe(false);
  });

  it('jumps gaps within the horizontal reach, not wider ones', () => {
    // Landing `reachLow` columns away crosses a gap one tile narrower than that.
    for (let g = 1; g < MOVE.reachLow; g++) expect(reachable(gap(g)), `gap ${g}`).toBe(true);
    expect(reachable(gap(MOVE.reachLow)), `gap ${MOVE.reachLow}`).toBe(false);
    expect(reachable(gap(MOVE.reachLow + 1))).toBe(false);
  });

  it('climbs ladders of any height and steps off the top rung', () => {
    const rows = [
      '            ',
      '        E   ',
      '      H#####',
      '      H#####',
      '      H#####',
      '      H#####',
      '      H#####',
      '      H#####',
      '      H#####',
      '      H#####',
      ' S    H#####',
      '############',
    ];
    expect(reachable(rows)).toBe(true);
    expect(reachable(rows.map((r) => r.replace(/H/g, ' ')))).toBe(false);
  });

  it('jumps up through one-way platforms and stands on them', () => {
    expect(
      reachable([
        '          ',
        '          ',
        '     E    ',
        '   ====   ',
        '          ',
        '          ',
        ' S        ',
        '##########',
      ]),
    ).toBe(true);
  });

  it('drops down any height, but not into spikes', () => {
    const shaft = ['          ', ' S        ', '####  ####'];
    for (let i = 0; i < 20; i++) shaft.push('####  ####');
    shaft.push('####E ####', '##########');
    expect(reachable(shaft)).toBe(true);
    // Drop through a platform into the shaft.
    expect(reachable(['          ', ' S        ', '####==####', '####  ####', '####  ####', '####E ####', '##########'])).toBe(true);
    // A spiked pit swallows the fall.
    expect(reachable(['          ', ' S        ', '####  ####', '####  ####', '####^^####', '####  ####', '####E ####', '##########'])).toBe(false);
  });

  it('swims across water and climbs out', () => {
    expect(
      reachable([
        '              ',
        '              ',
        ' S         E  ',
        '###~~~~~~~####',
        '###~~~~~~~####',
        '###~~~~~~~####',
        '##############',
      ]),
    ).toBe(true);
  });

  it('counts reachable dead ends as soft-locks', () => {
    const pit = [
      '                       ',
      ' S       E             ',
      '############      #####',
      '############      #####',
      '############      #####',
      '############      #####',
      '############      #####',
      '############      #####',
      '############      #####',
      '#######################',
    ];
    const { grid, spawn, exits } = gridFromAscii(pit);
    const t = analyzeTraversal(grid, spawn.tx, spawn.ty, exits);
    expect(t.exitReachable[0]).toBe(true);
    // The 6-wide, 7-deep pit past the exit is reachable (drop) but can't be climbed out of.
    expect(softLockCount(t)).toBeGreaterThan(0);
  });
});

describe('traversal repair', () => {
  it('connects an exit on top of an unclimbable cliff', () => {
    const ctx = ctxFromAscii([
      '                    ',
      '                    ',
      '               E    ',
      '           #########',
      '           #########',
      '           #########',
      '           #########',
      '           #########',
      '           #########',
      '           #########',
      '           #########',
      ' S         #########',
      '####################',
      '####################',
    ]);
    const before = analyzeTraversal(ctx.grid, ctx.spawnTx, ctx.spawnTy, ctx.exits);
    expect(before.exitReachable[0]).toBe(false);
    const after = repairTraversal(ctx);
    expect(after.exitReachable[0]).toBe(true);
    let ladders = 0;
    for (let i = 0; i < ctx.grid.fg.length; i++) if (ctx.grid.fg[i] === Tile.LADDER) ladders++;
    expect(ladders).toBeGreaterThan(0);
  });

  it('gives a reachable pit beside the route a way back out', () => {
    const ctx = ctxFromAscii([
      '                       ',
      ' S       E             ',
      '############      #####',
      '############      #####',
      '############      #####',
      '############      #####',
      '############      #####',
      '############      #####',
      '############      #####',
      '#######################',
      '#######################',
    ]);
    const t = repairTraversal(ctx);
    expect(t.exitReachable[0]).toBe(true);
    expect(softLockCount(t)).toBe(0);
  });

  it('bridges a pit that separates spawn and exit', () => {
    const ctx = ctxFromAscii([
      '                    ',
      ' S                E ',
      '#######      #######',
      '#######      #######',
      '#######      #######',
      '#######      #######',
      '#######      #######',
      '#######      #######',
      '#######      #######',
      '####################',
      '####################',
    ]);
    const t = repairTraversal(ctx);
    expect(t.exitReachable[0]).toBe(true);
    expect(softLockCount(t)).toBe(0);
  });
});
