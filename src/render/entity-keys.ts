import { Content } from '../content';
import type { ItemDef } from '../content/types';
import type { Entity, PlayerState } from '../sim/types';
import { heldKey } from './sprites/builtin/items';
import { hasSprite } from './sprites/registry';

/**
 * Pure mapping from sim entities to sprite keys / poses (no Pixi; unit-tested).
 * Sprite keys come from content defs; missing defs fall back to `<kind>_<def>` keys which the
 * sprite families or the labelled placeholder resolve.
 */
export function spriteKeyFor(e: Entity, players: readonly PlayerState[]): string {
  switch (e.kind) {
    case 'player': {
      const p = e.playerIndex !== undefined ? players[e.playerIndex] : undefined;
      const race = p ? Content.races.get(p.race) : undefined;
      const base = race?.sprite ?? 'player';
      // Explicit art for the race wins; otherwise the built-in chibi family gets a per-player tunic.
      return hasSprite(base) ? base : `${base}#${e.playerIndex ?? 0}`;
    }
    case 'enemy':
      return Content.enemies.get(e.def)?.sprite ?? `enemy_${e.def}`;
    case 'boss':
      return Content.bosses.get(e.def)?.sprite ?? `boss_${e.def}`;
    case 'resource':
      return Content.resources.get(e.resource?.def ?? e.def)?.sprite ?? `res_${e.def}`;
    case 'projectile': {
      const id = e.projectile?.def ?? e.def;
      return Content.projectiles.get(id)?.sprite ?? `proj_${id}`;
    }
    case 'pickup': {
      const pk = e.pickup;
      if (pk && pk.gold > 0) return 'gold_coin';
      const id = pk?.item.id ?? e.def;
      if (id === 'gold') return 'gold_coin';
      return Content.items.get(id)?.sprite ?? 'pickup';
    }
    case 'npc':
      return Content.npcs.get(e.def)?.sprite ?? `npc_${e.def}`;
    case 'companion':
      return Content.companions.get(e.def)?.sprite ?? `companion_${e.def}`;
    default:
      return e.def || e.kind;
  }
}

/** Sprite key of an item held in hand: explicit `held_<sprite>` art, else a generic silhouette. */
export function heldSpriteKey(def: ItemDef): string {
  const explicit = `held_${def.sprite}`;
  return hasSprite(explicit) ? explicit : heldKey(def);
}

/** Resting angle (radians, facing right) of a held item by its silhouette kind. */
export function heldRestAngle(key: string): number {
  const kind = key.startsWith('held:') ? key.split(':')[1] : '';
  switch (kind) {
    case 'bow':
    case 'bomb':
    case 'food':
    case 'potion':
    case 'shield':
    case 'generic':
      return 0;
    case 'spear':
      return -0.35;
    case 'staff':
    case 'wand':
      return -1.1;
    default:
      return -0.85;
  }
}

/**
 * Held-item angle during a melee swing: an overhand arc from above the aim direction to below it,
 * eased so most of the motion happens early. `ticks` counts down from `total`.
 */
export function swingAngle(aim: number, facing: number, ticks: number, total: number): { angle: number; start: number; progress: number } {
  const p = total > 0 ? Math.min(1, Math.max(0, 1 - ticks / total)) : 1;
  const eased = 1 - (1 - p) * (1 - p);
  const f = facing < 0 ? -1 : 1;
  const start = aim - 1.7 * f;
  const end = aim + 1.2 * f;
  return { angle: start + (end - start) * eased, start, progress: eased };
}

/** Frame index for an anim clock `t` (seconds): loops, or holds the last frame for one-shot anims. */
export function animFrame(frames: number, fps: number, t: number, once = false): number {
  if (frames <= 1) return 0;
  const f = Math.floor(t * fps);
  return once ? Math.min(frames - 1, f) : f % frames;
}
