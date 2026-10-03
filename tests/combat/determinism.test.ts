import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim';
import { emptyInput, type PlayerInput } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { give, makeWorld, spawnEnemy } from './helpers';

/** Order-sensitive digest of everything combat touches. */
function digest(w: World): string {
  const parts: string[] = [String(w.tick), JSON.stringify(w.rng.getState())];
  for (const e of w.entities) {
    parts.push(`${e.id}:${e.kind}:${e.def}:${e.x.toFixed(4)}:${e.y.toFixed(4)}:${e.hp}:${e.status.map((s) => `${s.id}${s.ticks}`).join('')}`);
  }
  for (const p of w.players) parts.push(JSON.stringify([p.inventory, p.mana, p.runStats.damageDealt]));
  let h = 0;
  for (const c of parts.join('|')) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return `${parts.length}:${h}`;
}

const script = (i: number): Partial<PlayerInput> => ({
  moveX: Math.sin(i / 40) > 0.3 ? 1 : Math.sin(i / 40) < -0.3 ? -1 : 0,
  jump: i % 70 < 8,
  attack: i % 9 < 6,
  aimX: 60 + ((i * 7) % 200),
  aimY: 80 + ((i * 3) % 60),
  select: i % 150 === 0 ? (i / 150) % 5 : -1,
});

describe('combat determinism', () => {
  it('a mixed-weapon fight replays identically from the same seed and inputs', () => {
    const run = () => {
      const { world, p } = makeWorld({ ai: true, seed: 42 });
      p.mods.critChance = 0.3;
      give(p, 't_sword', 1, 0);
      give(p, 't_bow', 1, 1);
      give(p, 't_wand', 1, 2);
      give(p, 't_bomb', 5, 3);
      give(p, 't_pick', 1, 4);
      p.selected = 0;
      p.inventory[6] = { id: 't_arrow', count: 50 };
      p.mana = 4;
      for (let k = 0; k < 6; k++) spawnEnemy(world, k % 2 ? 't_biter' : 't_dummy', 110 + k * 30);
      let shots = 0;
      for (let i = 0; i < 900; i++) {
        world.step([{ ...emptyInput(), ...script(i) }]);
        for (const ev of world.events) if (ev.type === 'sfx' && (ev.id === 'shoot_bow' || ev.id === 'cast' || ev.id === 'throw')) shots++;
      }
      return { digest: digest(world), dealt: p.runStats.damageDealt, shots };
    };
    const a = run();
    expect(a.dealt).toBeGreaterThan(0);
    expect(a.shots).toBeGreaterThan(0);
    expect(run()).toEqual(a);
  });

  it('the full game (real content + all systems) stays deterministic with combat inputs', () => {
    const run = () => {
      const w = createRun(2024, [{ name: 'A', race: 'drifter', hat: '', companion: '' }]);
      for (let i = 0; i < 900; i++) w.step([{ ...emptyInput(), ...script(i) }]);
      return digest(w);
    };
    expect(run()).toEqual(run());
  });
});
