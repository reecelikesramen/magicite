import { Content } from '../../content';
import { TILE } from '../constants';
import { Tile, Wall } from '../tiles';
import { initGrid } from './district';
import { makeNoise, noise01 } from './noise';
import { placePortal } from './structures';
import { LANTERN_LIGHT } from './styles';
import { F_CLAIM, F_NOHAZ, F_PROTECT, type GenCtx } from './types';

/** Town street floor row and gate geometry. */
export const TOWN_FLOOR = 22;

/** Share of brick (vs timber) facades per biome: timber villages in the woods, stone in the deep. */
const BRICK_CHANCE: Record<string, number> = { woods: 0.25, fen: 0.2, hollow: 0.6, rime: 0.5, amethyst: 0.8, cinder: 0.9, lair: 1 };

/** Shop roles in building order; roles without a building get a market stall on the street. */
const ROLES = ['npc_merchant', 'npc_smith', 'npc_outfitter', 'npc_trader', 'npc_fence'];

/**
 * A safe underground town (GDD §9): flat street, 3–5 building facades (brick/wood tiles + back
 * walls) with shopkeepers at their doors, lanterns, a 30% shrine, a few chickens and one gate on
 * the right that leads into the district.
 */
export function buildTown(ctx: GenCtx): void {
  const { rng, w, h, grid, flags } = ctx;
  initGrid(ctx);
  const floor = TOWN_FLOOR;
  const noise = makeNoise(rng);
  // Cave street: ceiling 13–17 rows above the floor.
  for (let x = 1; x < w - 1; x++) {
    const top = floor - 13 - Math.round(noise01(noise, x * 0.12, 3) * 4);
    for (let y = Math.max(2, top); y < floor; y++) grid.fg[y * w + x] = Tile.AIR;
    ctx.floor[x] = floor;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) flags[y * w + x]! |= F_NOHAZ;
  ctx.spawnTx = 4;
  ctx.spawnTy = floor - 1;
  for (let x = 2; x <= 7; x++) for (let y = floor - 3; y <= floor; y++) flags[y * w + x]! |= F_PROTECT;

  // Gate exit on the right.
  const gateX = w - 8;
  ctx.exits.push(placePortal(ctx, gateX, floor, ''));
  ctx.spawns.push({ kind: 'prop', def: 'decor_town_gate', x: (gateX + 2) * TILE, y: floor * TILE, data: { decor: 1 } });

  // Buildings.
  let count = rng.int(3, 5);
  const xMin = 11;
  const xMax = gateX - 4;
  const widths: number[] = [];
  for (let i = 0; i < count; i++) widths.push(rng.int(9, 12));
  while (count > 3 && widths.reduce((a, b) => a + b, 0) + count * 4 > xMax - xMin) {
    widths.pop();
    count--;
  }
  const slack = xMax - xMin - widths.reduce((a, b) => a + b, 0);
  const base = Math.floor(slack / count);
  const gaps = widths.map(() => base);
  gaps[count - 1]! += slack - base * count;
  for (let i = 0; i < count - 1; i++) {
    const j = rng.int(-Math.min(2, gaps[i]! - 3), Math.min(2, gaps[i + 1]! - 3));
    gaps[i]! += j;
    gaps[i + 1]! -= j;
  }
  let x = xMin;
  const doors: { x: number; role: string }[] = [];
  const stallSpots: number[] = [];
  for (let i = 0; i < count; i++) {
    const gap = gaps[i]!;
    if (gap >= 6) stallSpots.push(x + (gap >> 1));
    x += Math.max(2, gap >> 1);
    const bw = widths[i]!;
    const brick = rng.chance(BRICK_CHANCE[ctx.biome.id] ?? 0.6);
    const fh = rng.int(5, 7);
    const roofY = floor - fh - 1;
    const wall = brick ? Wall.BRICK : Wall.WOOD;
    for (let y = roofY; y < floor; y++) for (let xx = x; xx < x + bw; xx++) grid.bg[y * w + xx] = wall;
    // Roof with eaves, a second narrower course, and a chimney.
    const roof = brick ? Tile.BRICK : Tile.WOOD;
    for (let xx = x - 1; xx <= x + bw; xx++) grid.fg[roofY * w + xx] = roof;
    for (let xx = x + 1; xx < x + bw - 1; xx++) grid.fg[(roofY - 1) * w + xx] = roof;
    const cx = rng.chance(0.5) ? x + 2 : x + bw - 3;
    grid.fg[(roofY - 2) * w + cx] = Tile.BRICK;
    grid.fg[(roofY - 3) * w + cx] = Tile.BRICK;
    ctx.spawns.push({ kind: 'prop', def: 'decor_chimney_smoke', x: cx * TILE + 4, y: (roofY - 3) * TILE, data: { decor: 1 } });
    // Door (dark doorway) and windows.
    const dx = x + (bw >> 1) - 1;
    // Openings show a dark interior (Wall.NONE would read as open sky and let the backdrop through).
    for (let y = floor - 3; y < floor; y++) for (let xx = dx; xx < dx + 2; xx++) grid.bg[y * w + xx] = Wall.INTERIOR;
    for (const wx of [x + 1, x + bw - 3]) {
      if (Math.abs(wx - dx) < 3) continue;
      for (let y = floor - 4; y < floor - 2; y++) for (let xx = wx; xx < wx + 2; xx++) grid.bg[y * w + xx] = Wall.INTERIOR;
      ctx.lights.push({ x: (wx + 1) * TILE, y: (floor - 3) * TILE, radius: 14, color: 0xffb040, intensity: 0.5 });
    }
    // Lantern hanging under the eave next to the door.
    ctx.spawns.push({ kind: 'prop', def: 'decor_lantern', x: (dx + 3) * TILE + 4, y: (roofY + 2) * TILE, data: { hang: 1, decor: 1 } });
    ctx.lights.push({ x: (dx + 3) * TILE + 4, y: (roofY + 1) * TILE + 6, radius: LANTERN_LIGHT.radius, color: LANTERN_LIGHT.color, intensity: LANTERN_LIGHT.intensity });
    doors.push({ x: dx + 1, role: ROLES[i] ?? 'npc_merchant' });
    for (let xx = dx - 1; xx <= dx + 2; xx++) flags[(floor - 1) * w + xx]! |= F_CLAIM;
    x += bw + gap - Math.max(2, gap >> 1);
  }
  for (const d of doors) ctx.spawns.push({ kind: 'npc', def: d.role, x: d.x * TILE, y: floor * TILE, data: { role: d.role } });
  // Roles without a building get a stall in the widest gaps (or by the gate).
  const extra = ROLES.slice(count);
  extra.forEach((role, i) => {
    const sx = stallSpots[i] ?? gateX - 4 - i * 4;
    ctx.spawns.push({ kind: 'prop', def: 'decor_stall', x: sx * TILE + 4, y: floor * TILE, data: { decor: 1 } });
    ctx.spawns.push({ kind: 'npc', def: role, x: sx * TILE + 4, y: floor * TILE, data: { role } });
    flags[(floor - 1) * w + sx]! |= F_CLAIM;
  });
  // Shrine (30%): an altar near the start of the street.
  if (rng.chance(0.3)) {
    const ax = 9;
    ctx.spawns.push({ kind: 'prop', def: 'decor_altar', x: ax * TILE + 4, y: floor * TILE, data: { decor: 1 } });
    ctx.spawns.push({ kind: 'npc', def: 'npc_shrine', x: ax * TILE + 4, y: floor * TILE, data: { role: 'npc_shrine' } });
    ctx.lights.push({ x: ax * TILE + 4, y: (floor - 2) * TILE, radius: 24, color: 0xb070ff, intensity: 0.8 });
  }
  // Lamp posts along the street.
  for (let lx = 14; lx < gateX - 2; lx += rng.int(11, 15)) {
    if (flags[(floor - 1) * w + lx]! & F_CLAIM) continue;
    ctx.spawns.push({ kind: 'prop', def: 'decor_lamp_post', x: lx * TILE + 4, y: floor * TILE, data: { decor: 1 } });
    ctx.lights.push({ x: lx * TILE + 4, y: (floor - 3) * TILE, radius: LANTERN_LIGHT.radius, color: LANTERN_LIGHT.color, intensity: LANTERN_LIGHT.intensity });
    flags[(floor - 1) * w + lx]! |= F_CLAIM;
  }
  // Chickens wander the street (an enemy def if the enemies workstream adds one, else an npc critter).
  const chickenKind = Content.enemies.has('chicken') ? 'enemy' : 'npc';
  // Each on its own free street tile (not on a shopkeeper, stall, lamp post or another chicken).
  const chickens = rng.int(2, 3);
  for (let i = 0, tries = 0; i < chickens && tries < 40; tries++) {
    const cx = rng.int(16, gateX - 3);
    if (flags[(floor - 1) * w + cx]! & F_CLAIM) continue;
    ctx.spawns.push({ kind: chickenKind, def: 'chicken', x: cx * TILE + 4, y: floor * TILE, data: { critter: 1 } });
    flags[(floor - 1) * w + cx]! |= F_CLAIM;
    i++;
  }
}
