import { Content } from '../../content';
import { DT } from '../constants';
import type { Entity } from '../types';
import type { World } from '../world';

/** Nearest active player entity to `e` within `range` px, or undefined. */
export function nearestPlayer(world: World, e: Entity, range: number): Entity | undefined {
  let best: Entity | undefined;
  let bestD = range * range;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  for (const p of world.activePlayers()) {
    const dx = p.x + p.w / 2 - cx;
    const dy = p.y + p.h / 2 - cy;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** PLACEHOLDER (scaffold) hopper: periodically hops toward a nearby player. */
function hopper(world: World, e: Entity): void {
  const def = Content.enemies.get(e.def);
  const ai = (e.ai ??= { state: 'idle', t: 0, target: 0, phase: 0, n: {} });
  ai.t++;
  if (e.onGround) {
    e.vx *= 0.8;
    if (ai.t > 50 + (e.id % 30)) {
      const target = nearestPlayer(world, e, def?.sight ?? 80);
      const dir = target ? Math.sign(target.x - e.x) || 1 : world.rng.sign();
      e.facing = dir as 1 | -1;
      e.vx = dir * (def?.speed ?? 40);
      e.vy = -150;
      ai.t = 0;
    }
  } else if (e.wallDir !== 0) {
    e.vx = -e.vx;
  }
  e.anim = e.onGround ? 'idle' : 'jump';
  void DT;
}

/** AI dispatcher: routes each enemy/boss to its behaviour by content def. */
export function aiSystem(world: World): void {
  if (world.freeze > 0) return;
  for (const e of world.entities) {
    if (e.dead || (e.kind !== 'enemy' && e.kind !== 'boss')) continue;
    if (e.hurt > 0 && e.kind === 'enemy') continue; // brief stagger
    hopper(world, e);
  }
}
