import { DT } from '../constants';
import type { World } from '../world';
import { addItem } from './inventory';

const MAGNET = 18;
const GRAB = 6;

/** Pickups fall, get magnetised toward nearby players and are collected into inventory/wallet. */
export function pickupSystem(world: World): void {
  if (world.freeze > 0) return;
  const players = world.activePlayers();
  for (const e of world.entities) {
    const pk = e.pickup;
    if (!pk || e.dead) continue;
    if (e.onGround) e.vx *= 0.85;
    if (pk.delay > 0) {
      pk.delay--;
      continue;
    }
    for (const pe of players) {
      const p = world.players[pe.playerIndex!]!;
      const dx = pe.x + pe.w / 2 - (e.x + e.w / 2);
      const dy = pe.y + pe.h / 2 - (e.y + e.h / 2);
      const d = Math.hypot(dx, dy);
      if (d < GRAB) {
        if (pk.gold > 0) {
          p.gold += pk.gold;
          p.runStats.goldEarned += pk.gold;
          world.kill(e);
          world.emit({ type: 'sfx', id: 'coin', x: e.x, y: e.y });
        } else {
          const left = addItem(p, pk.item.id, pk.item.count);
          if (left < pk.item.count) {
            world.emit({ type: 'pickup', player: p.index, item: pk.item.id, count: pk.item.count - left });
            world.emit({ type: 'sfx', id: 'pickup', x: e.x, y: e.y });
          }
          pk.item.count = left;
          if (left <= 0) world.kill(e);
        }
        break;
      } else if (d < MAGNET) {
        e.vx += (dx / d) * 600 * DT;
        e.vy += (dy / d) * 600 * DT - 300 * DT;
      }
    }
  }
}
