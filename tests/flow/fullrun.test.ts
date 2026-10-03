import { describe, expect, it } from 'vitest';
import { createRun, emptyInput } from '../../src/sim';
import { secs } from '../../src/sim/constants';
import { killEntity } from '../../src/sim/combat/damage';
import { FINAL_DISTRICT, travel } from '../../src/sim/run';
import type { PlayerInput } from '../../src/sim/types';
import type { World } from '../../src/sim/world';

/**
 * End-to-end smoke run: levels 1 → 21 through real level generation, spawning and every system,
 * for several seeds and party sizes. The heroes are invulnerable; on each level the sim runs for a
 * few seconds, any guardian is slain (its arena must unseal), and the party takes a portal. In the
 * lair, the Blightwall dies and the run must be won.
 */
function autoplay(seed: number, players: number): { levels: string[]; victory: boolean; bosses: string[] } {
  const w: World = createRun(seed, Array.from({ length: players }, (_, i) => ({ name: `P${i}`, race: 'drifter', hat: '', companion: '' })));
  const levels: string[] = [];
  const bosses: string[] = [];
  const idle = (): PlayerInput[] => w.players.map(() => emptyInput());
  const run = (ticks: number) => {
    for (let t = 0; t < ticks && !w.run.over; t++) {
      for (const p of w.players) {
        const e = w.get(p.entityId);
        if (e) e.invuln = 1e9;
        p.hunger = Math.max(p.hunger, 5);
      }
      w.step(idle());
    }
  };
  for (let guard = 0; guard < 40 && !w.run.over; guard++) {
    const info = w.level.info;
    levels.push(`${info.district}:${info.biome}${info.isTown ? ':town' : ''}`);
    run(secs(3));
    for (const e of w.entities) {
      if (e.kind === 'boss' && !e.dead) {
        bosses.push(e.def);
        killEntity(w, e, 0);
      }
    }
    run(5);
    if (w.run.over) break;
    expect(w.level.locked, `level ${info.district} still sealed`).toBe(false);
    if (info.district >= FINAL_DISTRICT) break;
    travel(w, guard % Math.max(1, w.level.exits.length));
  }
  return { levels, victory: w.run.over && w.run.victory, bosses };
}

describe('full run', () => {
  for (const [seed, players] of [[1, 1], [77, 2], [4242, 4]] as const) {
    it(`seed ${seed}, ${players} player(s): districts 1–21 are playable and the Blightwall ends it`, () => {
      const r = autoplay(seed, players);
      expect(r.levels.length).toBe(21);
      expect(r.levels[0]).toBe('1:woods');
      expect(r.levels.at(-1)).toBe('21:lair');
      // Guardians at levels 5/11/17 plus the Blightwall (roaming giants may add more).
      expect(r.bosses.length).toBeGreaterThanOrEqual(4);
      expect(r.bosses).toContain('blightwall');
      expect(r.victory).toBe(true);
    });
  }
});
