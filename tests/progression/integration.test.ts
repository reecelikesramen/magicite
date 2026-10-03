import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, type PlayerInput } from '../../src/sim';
import { secs } from '../../src/sim/constants';
import { grantXp, totalXpForLevel } from '../../src/sim/progression/xp';
import { wraithEntity } from '../../src/sim/progression/wraith';
import type { PlayerSetup } from '../../src/sim/world';

const HEROES: PlayerSetup[] = [
  { name: 'ASH', race: 'saurian', hat: 'bunny_ears', companion: 'ember_bat', traits: ['swift', 'bookworm'], difficulty: 'madcap' },
  { name: 'BRAM', race: 'templar', hat: '', companion: 'gizmo_drone', traits: ['healthy', 'lucky'] },
];

/** Full SYSTEMS pipeline: two heroes level up, learn skills, spam them, and the wraith arrives. */
function simulate(seed: number) {
  const w = createRun(seed, HEROES);
  for (const p of w.players) grantXp(w, p, totalXpForLevel(10));
  const script = (t: number, i: number): PlayerInput => {
    const e = w.playerEntity(i)!;
    const inp = emptyInput();
    inp.moveX = Math.sin((t + i * 40) / 50) > -0.3 ? 1 : -1;
    inp.jump = (t + i * 7) % 45 < 8;
    inp.aimX = e.x + 40 * inp.moveX;
    inp.aimY = e.y;
    inp.skill = t % 37 === i * 5 ? (t / 37) % 2 | 0 : -1;
    const p = w.players[i]!;
    if (p.skillOffer.length && t % 20 === 3) inp.commands = [{ type: 'chooseSkill', path: p.skillOffer[(t + i) % p.skillOffer.length]! }];
    return inp;
  };
  for (let t = 0; t < 900; t++) {
    if (t === 300) w.run.levelTicks = secs(120) - 5; // fast-forward to the (madcap) wraith
    w.step([script(t, 0), script(t, 1)]);
  }
  return w;
}

describe('progression in the full pipeline', () => {
  it('runs with companions, skills and the wraith, deterministically', () => {
    const a = simulate(2024);
    const b = simulate(2024);
    const snap = (w: ReturnType<typeof simulate>) =>
      JSON.stringify({
        players: w.players.map((p) => [p.level, p.skills, p.skillSlots, p.skillCooldowns, p.mana, p.stamina, p.base]),
        ents: w.entities.map((e) => [e.kind, e.def, Math.round(e.x * 100), Math.round(e.y * 100), e.hp]),
        rng: w.rng.getState(),
        run: w.run,
      });
    expect(snap(a)).toBe(snap(b));
    expect(a.run.difficulty).toBe('madcap');
    for (const p of a.players) {
      expect(p.level).toBeGreaterThanOrEqual(10);
      expect(p.skillSlots).toHaveLength(2);
    }
    expect(a.entities.filter((e) => e.kind === 'companion')).toHaveLength(2);
    expect(wraithEntity(a) ?? a.run.over).toBeTruthy();
  });
});
