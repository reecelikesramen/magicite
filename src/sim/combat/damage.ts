import { Content } from '../../content';
import type { DamageType } from '../../content/types';
import { secs } from '../constants';
import { spawnDrops, spawnGold } from '../items/drops';
import { grantXp } from '../progression/xp';
import type { Entity } from '../types';
import type { World } from '../world';

export interface HitOpts {
  /** Attacker entity (for knockback direction, kill credit). */
  source?: Entity;
  type?: DamageType;
  knockback?: number;
  /** Override knockback direction (-1/1). */
  dir?: number;
  crit?: boolean;
  /** Invulnerability ticks granted to the target (players get more). */
  iframes?: number;
}

/** Deal damage with armor, i-frames, knockback, events, death → drops/xp. Returns damage dealt. */
export function applyDamage(world: World, target: Entity, amount: number, opts: HitOpts = {}): number {
  if (target.dead || target.invuln > 0 || amount <= 0) return 0;
  const isPlayer = target.kind === 'player';
  if (isPlayer) {
    const p = world.players[target.playerIndex ?? -1];
    if (!p || p.downed || p.out) return 0;
  }
  const dmg = Math.max(1, Math.round(amount - target.armor));
  target.hp -= dmg;
  target.hurt = 10;
  target.invuln = opts.iframes ?? (isPlayer ? secs(0.9) : 6);
  const src = opts.source;
  const dir = opts.dir ?? (src ? Math.sign(target.x + target.w / 2 - (src.x + src.w / 2)) || 1 : 0);
  const kb = (opts.knockback ?? 60) * (1 - target.kbResist);
  if (kb > 0 && dir !== 0) {
    target.vx = dir * kb;
    target.vy = Math.min(target.vy, -kb * 0.6);
  }
  const cx = target.x + target.w / 2;
  world.emit({ type: 'damage', target: target.id, amount: dmg, x: cx, y: target.y, crit: !!opts.crit, damageType: opts.type ?? 'physical', toPlayer: isPlayer });
  world.emit({ type: 'sfx', id: isPlayer ? 'player_hurt' : 'hit', x: cx, y: target.y });
  if (isPlayer) world.emit({ type: 'shake', amount: 3, ticks: 8 });

  const attackerPlayer = src?.kind === 'player' ? world.players[src.playerIndex ?? -1] : src?.owner ? world.players[world.get(src.owner)?.playerIndex ?? -1] : undefined;
  if (attackerPlayer) attackerPlayer.runStats.damageDealt += dmg;
  if (isPlayer) world.players[target.playerIndex!]!.runStats.damageTaken += dmg;

  if (target.hp <= 0) {
    target.hp = 0;
    if (isPlayer) {
      const p = world.players[target.playerIndex!]!;
      p.downed = true;
      p.reviveProgress = 0;
      world.emit({ type: 'downed', player: p.index });
    } else {
      killEntity(world, target, attackerPlayer?.index);
    }
  }
  return dmg;
}

/** Kill a non-player entity: drops, xp, gold, stats, events. */
export function killEntity(world: World, e: Entity, killerPlayer?: number): void {
  if (e.dead) return;
  world.kill(e);
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  world.emit({ type: 'death', entity: e.id, kind: e.kind, def: e.def, x: cx, y: cy });
  if (e.kind === 'enemy' || e.kind === 'boss') {
    const def = e.kind === 'boss' ? Content.bosses.get(e.def) : Content.enemies.get(e.def);
    if (def) {
      spawnDrops(world, def.drops, cx, cy);
      spawnGold(world, world.rng.int(def.gold[0], def.gold[1]), cx, cy);
      for (const p of world.players) if (!p.out) grantXp(world, p, def.xp);
    }
    const kp = killerPlayer !== undefined ? world.players[killerPlayer] : undefined;
    if (kp) {
      kp.runStats.kills++;
      if (e.kind === 'boss') kp.runStats.bossKills++;
    }
  }
}
