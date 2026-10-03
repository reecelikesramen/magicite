import { secs } from '../constants';
import type { Entity, PlayerState } from '../types';
import type { World } from '../world';
import { resetMotion } from './create';

/**
 * Co-op death rules (GDD §3): at 0 HP a player is *downed* (applyDamage sets the flag) and crawls.
 * A teammate holding interact nearby for 2 s revives them at 50% HP. Downed 30 s without help →
 * *out* for the rest of the level. Everyone downed/out → run over. Solo: downed = run over.
 * Downed/out players return at 1 HP when the party enters the next level.
 */
export const DOWNED = {
  reviveTicks: secs(2),
  /** Max centre-to-centre distance (px) for a reviver. */
  reviveRangeX: 14,
  reviveRangeY: 12,
  reviveHpFrac: 0.5,
  /** Invulnerability after being revived. */
  reviveInvuln: secs(1.5),
  /** Revive progress lost per tick when nobody is reviving. */
  progressDecay: 2,
  bleedOutTicks: secs(30),
} as const;

/**
 * Numeric identity of the loaded level, stable across snapshots (derived from plain run/level data).
 * Always ≥ 1 so a fresh PlayerCtl (levelKey 0) counts as "entered".
 */
export function currentLevelKey(world: World): number {
  const info = world.level.info;
  return ((world.run.path.length & 0xffff) << 9) | ((info.district & 0x7f) << 2) | (info.isTown ? 1 : 0) | (info.isBoss ? 2 : 0) | 0x100000;
}

/** Bring a downed/out player back (revive or level entry). */
function standUp(world: World, p: PlayerState, e: Entity, hp: number, invuln: number): void {
  p.downed = false;
  p.out = false;
  p.reviveProgress = 0;
  p.ctl.downedT = 0;
  e.hp = Math.max(1, Math.min(e.maxHp, hp));
  e.invuln = Math.max(e.invuln, invuln);
  e.hurt = 0;
  resetMotion(p, e);
  world.emit({ type: 'revived', player: p.index });
  world.emit({ type: 'heal', target: e.id, amount: e.hp, x: e.x + e.w / 2, y: e.y });
  world.emit({ type: 'particles', preset: 'revive', x: e.x + e.w / 2, y: e.y + e.h / 2, count: 12 });
  world.emit({ type: 'sfx', id: 'revive', x: e.x + e.w / 2, y: e.y });
}

/**
 * Level-entry bookkeeping for one player: auto-revive at 1 HP if downed/out, reset transient
 * controller state, and record the safe position. The meters system calls it for every player whose
 * `ctl.levelKey` differs from the current level — all of them after a level change, but only the
 * newcomer when someone drops into a co-op game mid-level (which must not revive anyone else).
 */
export function enterLevelFor(world: World, p: PlayerState, key = currentLevelKey(world)): void {
  p.ctl.levelKey = key;
  const e = world.get(p.entityId);
  if (!e) return;
  if (p.downed || p.out) standUp(world, p, e, 1, secs(1));
  else resetMotion(p, e);
  p.ctl.safeX = e.x;
  p.ctl.safeY = e.y;
}

/**
 * Level-entry bookkeeping for every player (see enterLevelFor). Idempotent per level; the meters
 * system does this automatically when the level key changes, so run flow need not call it.
 */
export function onLevelEnter(world: World): void {
  const key = currentLevelKey(world);
  for (const p of world.players) enterLevelFor(world, p, key);
}

/** End the run as a defeat (once). */
export function partyWipe(world: World): void {
  if (world.run.over) return;
  world.run.over = true;
  world.run.victory = false;
  world.emit({ type: 'runOver', victory: false });
}

function findReviver(world: World, p: PlayerState, e: Entity): PlayerState | undefined {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  for (const q of world.players) {
    if (q === p || q.downed || q.out) continue;
    if (!world.inputs[q.index]?.interact) continue;
    const r = world.get(q.entityId);
    if (!r || r.dead) continue;
    if (Math.abs(r.x + r.w / 2 - cx) <= DOWNED.reviveRangeX && Math.abs(r.y + r.h / 2 - cy) <= DOWNED.reviveRangeY) return q;
  }
  return undefined;
}

/** Downed state machine + party-wipe check. Called by metersSystem every tick. */
export function updateDowned(world: World): void {
  const solo = world.players.length <= 1;
  for (const p of world.players) {
    if (!p.downed || p.out) continue;
    const e = world.get(p.entityId);
    if (!e) continue;
    if (p.ctl.downedT === 0) {
      // First tick downed.
      p.runStats.deaths++;
      p.ctl.downedT = 1;
      resetMotion(p, e);
      world.emit({ type: 'sfx', id: 'downed', x: e.x + e.w / 2, y: e.y });
      if (solo) {
        p.out = true;
        continue;
      }
      world.emit({ type: 'message', text: `${p.name} is down! Hold interact to revive.`, color: 0xff6060 });
    }
    const reviver = findReviver(world, p, e);
    if (reviver) {
      p.reviveProgress++;
      if (p.reviveProgress >= DOWNED.reviveTicks) {
        reviver.runStats.revives++;
        standUp(world, p, e, Math.ceil(e.maxHp * DOWNED.reviveHpFrac), DOWNED.reviveInvuln);
      }
      continue;
    }
    p.reviveProgress = Math.max(0, p.reviveProgress - DOWNED.progressDecay);
    if (++p.ctl.downedT > DOWNED.bleedOutTicks) {
      p.out = true;
      p.reviveProgress = 0;
      world.emit({ type: 'message', text: `${p.name} bled out.`, color: 0xa04040 });
    }
  }
  if (world.players.length === 0) return;
  for (const p of world.players) if (!p.downed && !p.out) return;
  partyWipe(world);
}
