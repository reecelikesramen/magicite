import { Content } from '../../content';
import type { ItemDef } from '../../content/types';
import { spawnDrops } from '../items/drops';
import type { Entity } from '../types';
import type { World } from '../world';

/** Hit a resource node (tree/rock/plant) with an item. Right tool + enough power required. */
export function hitResource(world: World, user: Entity, res: Entity, tool: ItemDef | undefined): void {
  const def = Content.resources.get(res.def);
  if (!def) return;
  const ok = def.tool === 'hand' || (tool?.tool === def.tool && (tool.toolPower ?? 0) >= def.hardness);
  const cx = res.x + res.w / 2;
  if (!ok) {
    world.emit({ type: 'sfx', id: 'clink', x: cx, y: res.y + res.h - 4 });
    world.emit({ type: 'message', text: `Need a ${def.tool} (power ${def.hardness})`, player: user.playerIndex });
    return;
  }
  res.hp -= Math.max(1, tool?.toolPower ?? 1);
  if (res.resource) res.resource.hitFlash = 8;
  world.emit({ type: 'particles', preset: def.tool === 'axe' ? 'wood_chips' : 'rock_chips', x: cx, y: res.y + res.h - 6, count: 4 });
  world.emit({ type: 'sfx', id: def.tool === 'axe' ? 'chop' : 'mine', x: cx, y: res.y });
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
}
