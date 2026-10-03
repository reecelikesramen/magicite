import { describe, expect, it } from 'vitest';
import { Content, validateContent } from '../../src/content';
import { BLIGHTWALL_HP_PER_PLAYER, BOSS_PATTERNS, bossDepthScale, ROAMING_HP_MUL } from '../../src/sim/ai/bosses';
import { createRun, emptyInput } from '../../src/sim';
import { secs, TILE } from '../../src/sim/constants';
import { applyDamage } from '../../src/sim/combat/damage';
import { districtRequest, enterLevel, spawnRoamingGiant } from '../../src/sim/run';
import { Tile } from '../../src/sim/tiles';
import type { Entity, GameEvent } from '../../src/sim/types';
import type { World } from '../../src/sim/world';

const HERO = { name: 'T', race: 'drifter', hat: '', companion: '' };

function bossWorld(biome: string, level = 5, players = 1): { w: World; boss: Entity } {
  const w = createRun(11, Array.from({ length: players }, (_, i) => ({ ...HERO, name: `P${i}` })));
  enterLevel(w, districtRequest(w, level, biome));
  for (const p of w.players) w.get(p.entityId)!.invuln = 1e9;
  const boss = w.entities.find((e) => e.kind === 'boss')!;
  return { w, boss };
}

/** Put every player on the arena floor, a few tiles in from the left wall. */
function enterArena(w: World): void {
  const ar = w.level.arena!;
  for (const p of w.players) {
    const e = w.get(p.entityId)!;
    e.x = ar.x + 5 * TILE;
    e.y = ar.y + ar.h - e.h - 1;
    e.vx = e.vy = 0;
  }
}

function step(w: World, n: number, log?: GameEvent[]): void {
  for (let i = 0; i < n; i++) {
    w.step(w.players.map(() => emptyInput()));
    if (log) log.push(...w.events);
  }
}

function doorTiles(w: World): number[] {
  const d = w.level.spawns.find((s) => s.kind === 'boss')!.data!;
  const out: number[] = [];
  for (let ty = d.doorY0 as number; ty <= (d.doorY1 as number); ty++) for (let tx = d.doorX0 as number; tx <= (d.doorX1 as number); tx++) out.push(w.level.grid.get(tx, ty));
  return out;
}

const ARENA_BIOMES = [...Content.biomes.values()].filter((b) => b.id !== 'lair').map((b) => b.id);

describe('boss content', () => {
  it('every biome names a boss with a pattern, and content validates', () => {
    expect(validateContent()).toEqual([]);
    for (const b of Content.biomes.values()) {
      const def = Content.bosses.get(b.boss);
      expect(def, b.id).toBeDefined();
      expect(BOSS_PATTERNS).toContain(def!.pattern);
    }
  });

  it('scales HP with depth (tuned for combat district 3)', () => {
    expect(bossDepthScale(5).hp).toBe(1);
    expect(bossDepthScale(11).hp).toBeCloseTo(2.35);
    expect(bossDepthScale(17).hp).toBeCloseTo(3.7);
    const { boss } = bossWorld('woods', 11);
    expect(boss.maxHp).toBe(Math.ceil(Content.bosses.get('gloomjaw')!.hp * 2.35));
  });
});

describe('boss arenas', () => {
  it('a boss sleeps until the party enters, seals the door, and reopens it when slain', () => {
    const { w, boss } = bossWorld('woods');
    expect(w.level.locked).toBe(true);
    step(w, 30);
    expect(boss.ai!.state).toBe('dormant');
    expect(doorTiles(w).every((t) => t === Tile.AIR)).toBe(true);

    const log: GameEvent[] = [];
    enterArena(w);
    step(w, 5, log);
    expect(boss.ai!.n.active).toBe(1);
    expect(log.some((e) => e.type === 'bossPhase' && e.phase === 0)).toBe(true);
    expect(doorTiles(w).every((t) => t === Tile.BEDROCK)).toBe(true);

    applyDamage(w, boss, boss.hp + 10, { source: w.playerEntity(0)!, ignoreIframes: true });
    step(w, 2);
    expect(w.level.locked).toBe(false);
    expect(doorTiles(w).every((t) => t === Tile.AIR)).toBe(true);
  });

  it('a straggler left outside after the grace period is pulled into the sealed arena', () => {
    const { w, boss } = bossWorld('woods', 5, 2);
    const ar = w.level.arena!;
    const p0 = w.playerEntity(0)!;
    const p1 = w.playerEntity(1)!;
    p0.x = ar.x + 5 * TILE;
    p0.y = ar.y + ar.h - p0.h - 1;
    step(w, secs(9));
    expect(boss.ai!.n.locked).toBe(1);
    step(w, 2);
    expect(p1.x).toBeGreaterThanOrEqual(ar.x);
    expect(p1.x + p1.w).toBeLessThanOrEqual(ar.x + ar.w);
    // Not stuck in the sealed door or any wall.
    const g = w.level.grid;
    for (let ty = Math.floor(p1.y / TILE); ty <= Math.floor((p1.y + p1.h - 1) / TILE); ty++)
      for (let tx = Math.floor(p1.x / TILE); tx <= Math.floor((p1.x + p1.w - 1) / TILE); tx++) expect(g.isSolid(tx, ty)).toBe(false);
  });

  it('phases advance at HP thresholds with a brief invulnerability', () => {
    const { w, boss } = bossWorld('fen');
    enterArena(w);
    step(w, 5);
    const log: GameEvent[] = [];
    boss.hp = Math.floor(boss.maxHp * 0.55);
    step(w, 1, log);
    expect(boss.ai!.phase).toBe(1);
    expect(log.some((e) => e.type === 'bossPhase' && e.phase === 1)).toBe(true);
    const before = boss.hp;
    applyDamage(w, boss, 20, { source: w.playerEntity(0)!, ignoreIframes: true });
    expect(boss.hp).toBe(before);
  });

  for (const biome of [...ARENA_BIOMES, 'lair']) {
    it(`${biome}: the boss fights (moves, attacks) for 40 s and stays in bounds`, () => {
      const { w, boss } = bossWorld(biome, biome === 'lair' ? 21 : 5);
      expect(boss, biome).toBeDefined();
      enterArena(w);
      let shots = 0;
      let minions = 0;
      const seen = new Set<string>();
      const start = { x: boss.x, y: boss.y };
      let moved = 0;
      for (let t = 0; t < secs(40); t++) {
        step(w, 1);
        seen.add(boss.ai!.state);
        moved = Math.max(moved, Math.abs(boss.x - start.x) + Math.abs(boss.y - start.y));
        for (const e of w.entities) {
          if (e.kind === 'projectile' && e.team === 'enemy' && e.animT === 0) shots++;
          if (e.kind === 'enemy' && e.animT === 0) minions++;
        }
        // Halfway: knock it into its last phase so late moves get exercised too.
        if (t === secs(20)) boss.hp = Math.max(1, Math.floor(boss.maxHp * 0.2));
      }
      expect(boss.dead).toBe(false);
      expect(Number.isFinite(boss.x) && Number.isFinite(boss.y)).toBe(true);
      expect(boss.x).toBeGreaterThanOrEqual(0);
      expect(boss.x + boss.w).toBeLessThanOrEqual(w.level.grid.w * TILE);
      expect(boss.y + boss.h).toBeLessThanOrEqual(w.level.grid.h * TILE);
      expect(shots + minions, `${biome} attacked`).toBeGreaterThan(3);
      seen.delete('dormant');
      expect(seen.size, `${biome} states: ${[...seen].join(', ')}`).toBeGreaterThanOrEqual(3);
      if (biome !== 'lair') expect(moved, `${biome} moved`).toBeGreaterThan(8);
    });
  }

  it('is deterministic', () => {
    const run = () => {
      const { w, boss } = bossWorld('cinder');
      enterArena(w);
      step(w, secs(15));
      return [boss.x, boss.y, boss.ai!.state, w.entities.length, w.rng.next()].join('|');
    };
    expect(run()).toBe(run());
  });
});

describe('final boss and roaming giants', () => {
  it('Blightwall has 4500 HP + 700 per extra player', () => {
    expect(bossWorld('lair', 21).boss.maxHp).toBe(4500);
    expect(bossWorld('lair', 21, 3).boss.maxHp).toBe(4500 + 2 * BLIGHTWALL_HP_PER_PLAYER);
  });

  it('a roaming giant appears without locking the level', () => {
    let spawned = 0;
    for (let seed = 1; seed <= 6 && spawned === 0; seed++) {
      const w = createRun(seed, [HERO]);
      enterLevel(w, districtRequest(w, 7, 'hollow'));
      for (const e of w.entities) if (e.kind === 'boss') w.kill(e);
      if (!spawnRoamingGiant(w, 1)) continue;
      spawned++;
      const giant = w.entities.find((e) => e.kind === 'boss' && !e.dead)!;
      expect(giant.def).toBe('broodqueen');
      expect(giant.ai!.n.roaming).toBe(1);
      expect(giant.maxHp).toBe(Math.ceil(Content.bosses.get('broodqueen')!.hp * bossDepthScale(7).hp * ROAMING_HP_MUL));
      expect(w.level.locked).toBe(false);
    }
    expect(spawned).toBe(1);
  });

  it('never rolls a roaming giant in towns, boss districts or district 1', () => {
    const w = createRun(3, [HERO]);
    enterLevel(w, districtRequest(w, 1, 'woods'));
    expect(spawnRoamingGiant(w, 1)).toBe(false);
    enterLevel(w, districtRequest(w, 5, 'woods'));
    expect(spawnRoamingGiant(w, 1)).toBe(false);
  });
});

describe('boss health bar', () => {
  it('shows the nearby boss, and keeps a hurt boss up from further away', async () => {
    const { bossForBar } = await import('../../src/ui/bossbar');
    const { w, boss } = bossWorld('woods');
    const me = w.playerEntity(0)!;
    me.x = boss.x - 400;
    me.y = boss.y;
    expect(bossForBar(w, 0)).toBeUndefined();
    boss.hp -= 10;
    expect(bossForBar(w, 0)).toBe(boss);
    me.x = boss.x - 900;
    expect(bossForBar(w, 0)).toBeUndefined();
  });
});
