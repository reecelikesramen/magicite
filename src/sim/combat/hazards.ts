import { Content } from '../../content';
import { secs, TILE } from '../constants';
import { liquidAt, pushOutOfSolids, rectFree } from '../physics';
import { resetMotion } from '../player/create';
import { Tile, tileProps, type TileGrid } from '../tiles';
import type { Entity, PlayerState } from '../types';
import type { World } from '../world';
import { applyDamage } from './damage';

/**
 * Environmental hazards + safety nets (GDD §8):
 *  - Spikes: damage on touching the spiky lower part of the tile, then a strong upward knock.
 *  - Lava: damage over time (gated by i-frames), a pop upward, burn status; movement is heavily
 *    slowed by the controller/physics.
 *  - Deep water: harmless (no drowning). Fall damage: none (falls are punished by what you land in).
 *  - Crush / out-of-bounds safety: entities stuck inside solid tiles are pushed out; players that
 *    can't be pushed out, or leave the level bounds, are returned to their last safe standing spot.
 */
export const HAZARD = {
  /** Upward speed after a spike hit (≈ 2.5 tiles). */
  spikeKnock: 190,
  /** The top `spikeInset` px of a spike tile are harmless (the points start lower). */
  spikeInset: 3,
  /** Upward pop when lava hurts you (helps escape). */
  lavaPop: 140,
  burnTicks: secs(2),
  burnPower: 1,
  /** Enemies take hazard damage too (Spelunky-style); flying/fire-type enemies and bosses are immune. */
  hurtEnemies: true,
  enemyIframes: 30,
  /** Damage when a player is crushed with nowhere to go. */
  crushDamage: 1,
  /** Max px searched when pushing an entity out of solid tiles. */
  pushOut: 12,
} as const;

/** Highest spike damage overlapping the entity's lower region, 0 if none. Allocation-free. */
export function spikeDamageAt(grid: TileGrid, e: Entity): number {
  const tx0 = Math.floor(e.x / TILE);
  const tx1 = Math.floor((e.x + e.w - 1e-4) / TILE);
  const ty0 = Math.floor(e.y / TILE);
  const ty1 = Math.floor((e.y + e.h - 1e-4) / TILE);
  let dmg = 0;
  for (let ty = ty0; ty <= ty1; ty++) {
    // Overlap with the tile's spiky band [top + inset, bottom).
    if (e.y + e.h <= ty * TILE + HAZARD.spikeInset) continue;
    for (let tx = tx0; tx <= tx1; tx++) {
      const id = grid.get(tx, ty);
      if (id !== Tile.SPIKES) continue;
      const h = tileProps(id).hazard;
      if (h > dmg) dmg = h;
    }
  }
  return dmg;
}

function addBurn(e: Entity): void {
  for (const s of e.status) {
    if (s.id === 'burn') {
      if (s.ticks < HAZARD.burnTicks) s.ticks = HAZARD.burnTicks;
      return;
    }
  }
  e.status.push({ id: 'burn', ticks: HAZARD.burnTicks, power: HAZARD.burnPower, source: 0 });
}

function outOfBounds(grid: TileGrid, e: Entity): boolean {
  return e.x + e.w < -TILE || e.x > grid.pixelWidth + TILE || e.y > grid.pixelHeight + TILE || e.y + e.h < -4 * TILE;
}

/** Put a player back on its last safe spot (or the level spawn), optionally hurting it. */
export function recoverPlayer(world: World, p: PlayerState, e: Entity, damage: number): void {
  const grid = world.level.grid;
  e.x = p.ctl.safeX;
  e.y = p.ctl.safeY;
  if (outOfBounds(grid, e) || !pushOutOfSolids(grid, e, HAZARD.pushOut)) {
    e.x = world.level.spawn.x - e.w / 2;
    e.y = world.level.spawn.y - e.h;
    pushOutOfSolids(grid, e, 4 * TILE);
  }
  e.px = e.x;
  e.py = e.y;
  e.vx = 0;
  e.vy = 0;
  resetMotion(p, e); // cancel dash/dive/climb/drop-through (no slam or air-dash carried to the spot)
  world.emit({ type: 'particles', preset: 'poof', x: e.x + e.w / 2, y: e.y + e.h / 2, count: 8 });
  if (damage > 0) applyDamage(world, e, damage, { knockback: 0 });
}

function playerHazards(world: World, p: PlayerState, e: Entity): void {
  const grid = world.level.grid;
  // Safety first: out of bounds or stuck in a wall.
  if (outOfBounds(grid, e)) {
    recoverPlayer(world, p, e, 0);
    return;
  }
  if (!rectFree(grid, e.x, e.y, e.w, e.h) && !pushOutOfSolids(grid, e, HAZARD.pushOut)) {
    recoverPlayer(world, p, e, HAZARD.crushDamage);
    return;
  }
  if (p.downed || p.out) return;

  let hazardous = false;
  const spikes = spikeDamageAt(grid, e);
  if (spikes > 0) {
    hazardous = true;
    if (e.invuln === 0 && applyDamage(world, e, spikes, { knockback: 0, type: 'physical' }) > 0) {
      e.vy = -HAZARD.spikeKnock;
      p.ctl.jumping = false;
      p.ctl.diving = false;
      world.emit({ type: 'particles', preset: 'spike', x: e.x + e.w / 2, y: e.y + e.h, count: 6 });
    }
  }
  if (e.inLiquid && liquidAt(grid, e) === Tile.LAVA) {
    hazardous = true;
    if (!p.specials.includes('burn_immune')) addBurn(e);
    if (e.invuln === 0 && applyDamage(world, e, tileProps(Tile.LAVA).hazard, { knockback: 0, type: 'fire' }) > 0) {
      e.vy = Math.min(e.vy, -HAZARD.lavaPop);
      p.ctl.jumping = false;
      world.emit({ type: 'particles', preset: 'lava_burn', x: e.x + e.w / 2, y: e.y + e.h / 2, count: 8 });
      world.emit({ type: 'sfx', id: 'sizzle', x: e.x + e.w / 2, y: e.y });
    }
  }
  if (!hazardous && e.onGround && !e.inLiquid) {
    p.ctl.safeX = e.x;
    p.ctl.safeY = e.y;
  }
}

function enemyHazards(world: World, e: Entity): void {
  // Non-colliding enemies (wall-phasing wraith, ghosts) are steered by their AI and may brush the
  // level edge; only things that physically fell out of the world are culled.
  if (!e.collides) return;
  const grid = world.level.grid;
  if (outOfBounds(grid, e)) {
    world.kill(e); // fell out of the world: no drops
    return;
  }
  if (!rectFree(grid, e.x, e.y, e.w, e.h)) pushOutOfSolids(grid, e, HAZARD.pushOut);
  if (!HAZARD.hurtEnemies || e.kind !== 'enemy' || e.gravityScale === 0 || e.invuln > 0) return;
  const def = Content.enemies.get(e.def);
  if (def?.flying) return;
  const spikes = spikeDamageAt(grid, e);
  if (spikes > 0) {
    applyDamage(world, e, spikes, { knockback: 0, iframes: HAZARD.enemyIframes });
    return;
  }
  if (e.inLiquid && liquidAt(grid, e) === Tile.LAVA) {
    const fireproof = def?.damageType === 'fire' || (def?.tags?.includes('fire') ?? false) || (def?.tags?.includes('lava_immune') ?? false);
    if (!fireproof) {
      addBurn(e);
      applyDamage(world, e, tileProps(Tile.LAVA).hazard, { knockback: 0, type: 'fire', iframes: HAZARD.enemyIframes });
    }
  }
}

/** Hazards + crush/out-of-bounds safety for players, enemies, NPCs and pickups. */
export function hazardSystem(world: World): void {
  if (world.freeze > 0) return;
  const grid = world.level.grid;
  for (const e of world.entities) {
    if (e.dead) continue;
    switch (e.kind) {
      case 'player': {
        const p = world.players[e.playerIndex ?? -1];
        if (p) playerHazards(world, p, e);
        break;
      }
      case 'enemy':
        enemyHazards(world, e);
        break;
      case 'npc':
      case 'pickup':
        if (outOfBounds(grid, e)) world.kill(e);
        else if (e.collides && !rectFree(grid, e.x, e.y, e.w, e.h)) pushOutOfSolids(grid, e, HAZARD.pushOut);
        break;
      default:
        break;
    }
  }
}
