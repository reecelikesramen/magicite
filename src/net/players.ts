import { addPlayer } from '../sim/player/create';
import type { PlayerState } from '../sim/types';
import { World, type PlayerSetup } from '../sim/world';

/**
 * How PlayerState travels over the network. Three tiers:
 *  - public (every client, inside snapshots when changed): who the player is and what others see;
 *  - predicted (owner only, every snapshot, exact): the state client-side prediction rewinds to —
 *    controller scratch (`ctl`), button latch (`prev`) and `PREDICTED_PLAYER_KEYS`;
 *  - private (owner only, reliable on change): everything else (inventory, stats, meters, xp…).
 * New PlayerState fields are private by default, so they sync without touching this file.
 */
export const PUBLIC_PLAYER_KEYS = ['name', 'race', 'hat', 'companion', 'traits', 'level', 'downed', 'out', 'reviveProgress'] as const;

/** Top-level PlayerState fields that controlPlayer reads/writes (rewound + replayed on the client). */
export const PREDICTED_PLAYER_KEYS: readonly string[] = ['stamina', 'downed', 'out', 'selected'];

/** Never synced generically (identity or carried in the predicted block). */
const NEVER_SYNCED = new Set(['index', 'entityId', 'ctl', 'prev']);

/** Private keys that change every tick and are only refreshed ~1×/s (cosmetic for the owner). */
export const SLOW_PRIVATE_KEYS: ReadonlySet<string> = new Set(['runStats']);

export interface PublicPlayerView {
  entityId: number;
  equip: Record<string, string>;
  [key: string]: unknown;
}

/** What every peer may know about a player (also equipment ids for visuals). */
export function publicView(p: PlayerState): PublicPlayerView {
  const v: PublicPlayerView = { entityId: p.entityId, equip: {} };
  for (const k of PUBLIC_PLAYER_KEYS) v[k] = p[k];
  for (const slot in p.equipment) {
    const st = p.equipment[slot as keyof PlayerState['equipment']];
    if (st) v.equip[slot] = st.id;
  }
  return v;
}

/**
 * Apply a public view. For the owner, fields that are predicted or private are left alone (they
 * arrive through the predicted block / PrivateState with better precision).
 */
export function applyPublicView(p: PlayerState, v: PublicPlayerView, isOwner: boolean): void {
  const rec = p as unknown as Record<string, unknown>;
  for (const k of PUBLIC_PLAYER_KEYS) {
    if (isOwner && PREDICTED_PLAYER_KEYS.includes(k)) continue;
    if (k in v) rec[k] = v[k];
  }
  if (typeof v.entityId === 'number') p.entityId = v.entityId;
  if (!isOwner) {
    for (const slot in p.equipment) {
      const id = v.equip?.[slot];
      const cur = p.equipment[slot as keyof PlayerState['equipment']];
      if ((cur?.id ?? '') !== (id ?? '')) p.equipment[slot as keyof PlayerState['equipment']] = id ? { id, count: 1 } : null;
    }
  }
}

/** Keys of PlayerState sent to the owner through PrivateState. */
export function privateKeys(p: PlayerState): string[] {
  const pub = new Set<string>(PUBLIC_PLAYER_KEYS);
  return Object.keys(p).filter((k) => !NEVER_SYNCED.has(k) && !pub.has(k) && !PREDICTED_PLAYER_KEYS.includes(k));
}

/**
 * A fully-shaped PlayerState for a mirror world, built by the real `addPlayer` on a scratch world so
 * every field other workstreams add is initialised exactly like on the host.
 */
export function makePlayerTemplate(setup: PlayerSetup, index: number, entityId: number): PlayerState {
  const scratch = new World(0, []);
  const p = addPlayer(scratch, setup);
  p.index = index;
  p.entityId = entityId;
  return p;
}

/** Setup record from a PlayerState (what a reconnecting/late player is described by). */
export function setupOf(p: PlayerState): PlayerSetup {
  return { name: p.name, race: p.race, hat: p.hat, companion: p.companion, traits: [...p.traits] };
}
