import { Content } from '../../content';
import type { ItemDef, ToolKind } from '../../content/types';
import { secs, TILE } from '../constants';
import { spawnDrops, spawnPickup } from '../items/drops';
import { Tile, tileProps } from '../tiles';
import type { Entity, PlayerState } from '../types';
import type { World } from '../world';
import { COMBAT } from './tuning';

/**
 * Hit a resource node (tree/rock/plant/bug) with an item. Right tool kind + toolPower >= hardness required
 * ('hand' resources take anything, even fists). Damage scales with toolPower. Returns true on a valid hit.
 */
export function hitResource(world: World, user: Entity, res: Entity, tool: ItemDef | undefined): boolean {
  const def = Content.resources.get(res.def);
  if (!def) return false;
  const ok = def.tool === 'hand' || (tool?.tool === def.tool && (tool.toolPower ?? 0) >= def.hardness);
  const cx = res.x + res.w / 2;
  if (!ok) {
    world.emit({ type: 'sfx', id: 'clink', x: cx, y: res.y + res.h - 4 });
    world.emit({ type: 'particles', preset: 'clink', x: cx, y: res.y + res.h - 4, count: 2 });
    const need = def.hardness > 1 ? `${def.tool} (power ${def.hardness})` : def.tool;
    world.emit({ type: 'message', text: `Needs a ${need}`, player: user.playerIndex });
    return false;
  }
  res.hp -= Math.max(1, tool?.tool === def.tool ? (tool.toolPower ?? 1) : 1);
  if (res.resource) res.resource.hitFlash = 8;
  const chips = def.tool === 'axe' ? 'wood_chips' : def.tool === 'pickaxe' ? 'rock_chips' : 'leaf_chips';
  world.emit({ type: 'particles', preset: chips, x: cx, y: res.y + res.h - 6, count: 4 });
  world.emit({ type: 'sfx', id: def.tool === 'axe' ? 'chop' : def.tool === 'pickaxe' ? 'mine' : 'harvest', x: cx, y: res.y });
  const broken = res.hp <= 0;
  world.emit({ type: 'resourceHit', entity: res.id, def: def.id, broken });
  if (broken) {
    world.kill(res);
    spawnDrops(world, def.drops, cx, res.y + res.h - 4);
    const p = user.playerIndex !== undefined ? world.players[user.playerIndex] : undefined;
    if (p) {
      if (def.tool === 'axe') p.runStats.treesChopped++;
      else if (def.tool === 'pickaxe') p.runStats.oresMined++;
      else if (def.tool === 'net') p.runStats.bugsCaught++;
      else p.runStats.plantsHarvested++;
    }
  }
  return true;
}

/** Tile ids a tool kind can dig. Pickaxes and hammers dig anything breakable; axes only wooden tiles. */
export function toolCanMine(kind: ToolKind | undefined, tile: number): boolean {
  if (kind === 'pickaxe' || kind === 'hammer') return true;
  if (kind === 'axe') return tile === Tile.WOOD || tile === Tile.PLATFORM || tile === Tile.LADDER;
  return false;
}

/** A tile that a mining ray stops at: anything that isn't air or liquid. */
function blocksRay(tile: number): boolean {
  if (tile === Tile.AIR) return false;
  return !tileProps(tile).liquid;
}

export interface MineTarget {
  tx: number;
  ty: number;
}

/**
 * The tile a mining swing targets: march from the user's centre toward the aim point and take the
 * first non-air tile within COMBAT.mining.reach. Writes into `out`; returns false if none.
 */
export function findMineTarget(world: World, e: Entity, aimX: number, aimY: number, out: MineTarget): boolean {
  const grid = world.level.grid;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const dx = aimX - cx;
  const dy = aimY - cy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-3) return false;
  const ux = dx / d;
  const uy = dy / d;
  const max = Math.min(d, COMBAT.mining.reach + TILE * 0.5);
  for (let s = 0; s <= max; s += 1.5) {
    const tx = Math.floor((cx + ux * s) / TILE);
    const ty = Math.floor((cy + uy * s) / TILE);
    if (!blocksRay(grid.get(tx, ty))) continue;
    // Reach is measured to the tile's nearest point, so tiles diagonal to the player stay diggable.
    const nx = Math.max(tx * TILE, Math.min(cx, tx * TILE + TILE));
    const ny = Math.max(ty * TILE, Math.min(cy, ty * TILE + TILE));
    if (Math.hypot(nx - cx, ny - cy) > COMBAT.mining.reach) return false;
    out.tx = tx;
    out.ty = ty;
    return true;
  }
  return false;
}

export type MineResult = 'none' | 'hit' | 'broken' | 'clink';

const scratchTarget: MineTarget = { tx: 0, ty: 0 };

/** Break a tile outright: AIR, drop, events. Shared by mining and explosions. */
export function breakTile(world: World, tx: number, ty: number, dropChance = 1): void {
  const grid = world.level.grid;
  const id = grid.get(tx, ty);
  const props = tileProps(id);
  grid.set(tx, ty, Tile.AIR);
  const x = tx * TILE + TILE / 2;
  const y = ty * TILE + TILE / 2;
  world.emit({ type: 'tileBroken', tx, ty, tile: id });
  world.emit({ type: 'particles', preset: 'tile_break', x, y, count: 6 });
  if (props.drop && Content.items.has(props.drop) && (dropChance >= 1 || world.rng.chance(dropChance))) {
    spawnPickup(world, props.drop, 1, x, y);
  }
}

/**
 * Tile mining (GDD §8 extension): each swing of a digging tool adds `cooldownTicks × toolPower` to the
 * aimed tile's grid.dmg; the tile breaks at TileProps.mineTime. BEDROCK / hardness 0 never break and
 * hardness > toolPower clinks. No digging in towns. Progress is mirrored into p.ctl.mine* for the UI.
 */
export function mineTile(world: World, p: PlayerState, e: Entity, tool: ItemDef, aimX: number, aimY: number): MineResult {
  if (!tool.tool || !findMineTarget(world, e, aimX, aimY, scratchTarget)) return 'none';
  const { tx, ty } = scratchTarget;
  const grid = world.level.grid;
  const id = grid.get(tx, ty);
  const props = tileProps(id);
  const x = tx * TILE + TILE / 2;
  const y = ty * TILE + TILE / 2;
  if (!toolCanMine(tool.tool, id)) return 'none';
  const power = tool.toolPower ?? 1;
  if (props.hardness <= 0 || props.hardness > power || world.level.info.isTown) {
    world.emit({ type: 'sfx', id: 'clink', x, y });
    world.emit({ type: 'particles', preset: 'clink', x, y, count: 2 });
    if (props.hardness > power) world.emit({ type: 'message', text: `Too hard — needs a power ${props.hardness} tool`, player: p.index });
    return 'clink';
  }
  const i = ty * grid.w + tx;
  const need = Math.min(255, Math.max(1, props.mineTime));
  const add = Math.max(1, Math.round(secs(tool.cooldown ?? COMBAT.defaultCooldown.swing) * power));
  const total = Math.min(255, grid.dmg[i]! + add);
  p.ctl.mineX = tx;
  p.ctl.mineY = ty;
  if (total >= need) {
    p.ctl.mineTicks = 0;
    breakTile(world, tx, ty);
    world.emit({ type: 'sfx', id: 'tile_break', x, y });
    return 'broken';
  }
  grid.dmg[i] = total;
  // dmg changes don't bump the chunk version (renderers overlay cracks from grid.dmg / mineTime).
  p.ctl.mineTicks = total;
  world.emit({ type: 'particles', preset: 'dig', x, y, count: 3 });
  world.emit({ type: 'sfx', id: 'dig', x, y });
  return 'hit';
}
