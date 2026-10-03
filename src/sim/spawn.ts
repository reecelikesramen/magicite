import { spawnBoss } from './ai/bosses';
import { scaleSpawnedEnemy } from './progression/difficulty';
import { Content } from '../content';
import type { SpawnSpec, World } from './world';

/**
 * Instantiate the generator's SpawnSpecs. Content-driven: sizes/hp come from defs.
 * Workstreams may extend the per-kind branches (bosses, npcs, chests, props).
 */
export function spawnFromSpec(world: World, s: SpawnSpec): void {
  switch (s.kind) {
    case 'enemy': {
      const d = Content.enemies.get(s.def);
      if (!d) return;
      const e = world.spawnAt('enemy', d.id, s.x, s.y, d.w, d.h, {
        hp: d.hp, maxHp: d.hp, armor: d.def ?? 0, kbResist: d.knockbackResist ?? 0,
        gravityScale: d.flying ? 0 : 1, light: d.light ? { radius: d.light.radius, color: d.light.color, intensity: 1 } : undefined,
      });
      scaleSpawnedEnemy(world, e);
      return;
    }
    case 'boss': {
      const d = Content.bosses.get(s.def);
      if (d) spawnBoss(world, d, s.x, s.y, s.data);
      return;
    }
    case 'resource': {
      const d = Content.resources.get(s.def);
      if (!d) return;
      const y = d.placement === 'ceiling' ? s.y + d.h : s.y;
      world.spawnAt('resource', d.id, s.x, y, d.w, d.h, {
        hp: d.hp, maxHp: d.hp, gravityScale: 0, collides: false, resource: { def: d.id, hitFlash: 0 },
        light: d.light ? { radius: d.light.radius, color: d.light.color, intensity: 1 } : undefined,
      });
      return;
    }
    case 'npc': {
      world.spawnAt('npc', s.def, s.x, s.y, 8, 12, { gravityScale: 1 });
      return;
    }
    default:
      world.spawnAt(s.kind, s.def, s.x, s.y, 8, 8, { gravityScale: 0, collides: false });
  }
}

export function spawnLevelEntities(world: World): void {
  for (const s of world.level.spawns) spawnFromSpec(world, s);
}
