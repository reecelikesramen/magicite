import { maybeItem } from '../../content';
import type { ConsumeEffect, ItemDef, StatMods } from '../../content/types';
import { TILE } from '../constants';
import { recalcStats } from '../items/stats';
import { Tile, tileProps } from '../tiles';
import type { Entity, PlayerState } from '../types';
import type { World } from '../world';
import { applyDamage } from './damage';
import { applyStatuses, clearStatuses } from './status';
import { COMBAT } from './tuning';
import { feed, heal, restoreMana, restoreStamina } from './vitals';

/** Remove one item from an inventory slot (clears the slot at 0). */
export function takeOne(p: PlayerState, slot: number): void {
  const s = p.inventory[slot];
  if (!s) return;
  s.count--;
  if (s.count <= 0) p.inventory[slot] = null;
}

const PERMANENT_BASE: readonly [keyof StatMods, keyof PlayerState['base']][] = [
  ['maxHp', 'hp'],
  ['atk', 'atk'],
  ['dex', 'dex'],
  ['mag', 'mag'],
  ['lck', 'lck'],
];

/**
 * Permanent stat gains (rare elixirs) go into the rolled base stats: maxHp/atk/dex/mag/lck. Other
 * StatMods keys have no permanent store on PlayerState yet and are ignored.
 */
function applyPermanent(world: World, p: PlayerState, e: Entity, mods: StatMods): void {
  let hpGain = 0;
  for (const [mod, base] of PERMANENT_BASE) {
    const v = mods[mod];
    if (typeof v !== 'number' || v === 0) continue;
    p.base[base] += v;
    if (base === 'hp') hpGain += v;
    const label = base === 'hp' ? 'HP' : base.toUpperCase();
    world.emit({ type: 'message', text: `${v > 0 ? '+' : ''}${v} ${label}`, color: v > 0 ? 0x80ff80 : 0xff8080, player: p.index });
  }
  recalcStats(p, e);
  if (hpGain > 0) heal(world, e, hpGain);
}

/** Named special effects of consumables ("handled by name in sim"). Unknown names do nothing. */
function applySpecial(world: World, p: PlayerState, e: Entity, special: string): void {
  switch (special) {
    case 'cleanse':
      clearStatuses(e);
      break;
    case 'full_restore':
      heal(world, e, e.maxHp);
      restoreMana(p, p.stats.maxMana);
      restoreStamina(p, p.stats.maxStamina);
      feed(p, p.stats.maxHunger);
      break;
    case 'recall':
    case 'teleport_exit': {
      const exit = special === 'teleport_exit' ? world.level.exits[0] : undefined;
      const tx = exit ? exit.x + exit.w / 2 : world.level.spawn.x;
      const ty = exit ? exit.y + exit.h : world.level.spawn.y;
      world.emit({ type: 'particles', preset: 'teleport', x: e.x + e.w / 2, y: e.y + e.h / 2, count: 12 });
      e.x = tx - e.w / 2;
      e.y = ty - e.h;
      e.px = e.x;
      e.py = e.y;
      e.vx = 0;
      e.vy = 0;
      world.emit({ type: 'particles', preset: 'teleport', x: tx, y: ty - e.h / 2, count: 12 });
      world.emit({ type: 'sfx', id: 'teleport', x: tx, y: ty });
      break;
    }
    default:
      break;
  }
}

/** Apply a ConsumeEffect to a player (heal / mana / food / stamina / statuses / permanent / special). */
export function applyConsumeEffect(world: World, p: PlayerState, e: Entity, c: ConsumeEffect): void {
  if (c.heal && c.heal > 0) heal(world, e, c.heal);
  else if (c.heal && c.heal < 0) applyDamage(world, e, -c.heal, { type: 'poison', dot: true });
  if (c.mana) restoreMana(p, c.mana);
  if (c.food) feed(p, c.food);
  if (c.stamina) restoreStamina(p, c.stamina);
  applyStatuses(world, e, c.status, e);
  if (c.permanent) applyPermanent(world, p, e, c.permanent);
  if (c.special) applySpecial(world, p, e, c.special);
}

/** Eat / drink / read the item in `slot`. Returns true if something was consumed. */
export function consumeFromSlot(world: World, p: PlayerState, slot: number): boolean {
  const stack = p.inventory[slot];
  const def = maybeItem(stack?.id);
  const e = world.get(p.entityId);
  if (!def?.consume || !e || p.downed || p.out) return false;
  applyConsumeEffect(world, p, e, def.consume);
  takeOne(p, slot);
  const drink = def.tags?.includes('drink') || /potion|elixir|tonic|brew/.test(def.id);
  world.emit({ type: 'sfx', id: drink ? 'drink' : 'eat', x: e.x + e.w / 2, y: e.y });
  world.emit({ type: 'particles', preset: drink ? 'drink' : 'eat', x: e.x + e.w / 2, y: e.y + 3, count: 5 });
  return true;
}

/** Light for placed props (props have no content table yet; keyed by id). */
function propLight(id: string): Entity['light'] {
  if (id.includes('campfire')) return { radius: 64, color: 0xff8030, intensity: 1, flicker: 0.2 };
  if (id.includes('torch')) return { radius: 56, color: 0xffa040, intensity: 1, flicker: 0.15 };
  if (id.includes('lantern')) return { radius: 60, color: 0xffc060, intensity: 1, flicker: 0.05 };
  return undefined;
}

/**
 * Place the held item's tile (`places`) or prop (`placesProp`) at the aimed tile: must be in reach, the
 * cell empty (air or liquid), and a solid tile may not entomb any entity. Consumes one on success.
 */
export function placeFromSlot(world: World, p: PlayerState, e: Entity, slot: number, aimX: number, aimY: number): boolean {
  const def: ItemDef | undefined = maybeItem(p.inventory[slot]?.id);
  if (!def || (def.places === undefined && !def.placesProp)) return false;
  const grid = world.level.grid;
  const tx = Math.floor(aimX / TILE);
  const ty = Math.floor(aimY / TILE);
  if (!grid.inBounds(tx, ty)) return false;
  const x = tx * TILE;
  const y = ty * TILE;
  if (Math.hypot(x + TILE / 2 - (e.x + e.w / 2), y + TILE / 2 - (e.y + e.h / 2)) > COMBAT.place.reach) return false;
  const cur = grid.get(tx, ty);
  if (cur !== Tile.AIR && !tileProps(cur).liquid) return false;
  if (def.places !== undefined) {
    if (tileProps(def.places).solid) {
      for (const o of world.entities) {
        if (o.dead || !o.collides || o.kind === 'projectile') continue;
        if (o.x < x + TILE && o.x + o.w > x && o.y < y + TILE && o.y + o.h > y) return false;
      }
    }
    grid.set(tx, ty, def.places);
  } else {
    const prop = def.placesProp!;
    for (const o of world.entities) {
      if (o.dead || o.kind !== 'prop') continue;
      if (o.x < x + TILE && o.x + o.w > x && o.y < y + TILE && o.y + o.h > y) return false;
    }
    world.spawn('prop', prop, x, y, { w: TILE, h: TILE, gravityScale: 0, collides: false, light: propLight(prop), owner: e.id });
  }
  takeOne(p, slot);
  world.emit({ type: 'sfx', id: 'place', x: x + TILE / 2, y: y + TILE / 2 });
  world.emit({ type: 'particles', preset: 'place', x: x + TILE / 2, y: y + TILE / 2, count: 4 });
  return true;
}
