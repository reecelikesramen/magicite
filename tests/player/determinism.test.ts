import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, type PlayerInput } from '../../src/sim';
import { predictPlayer } from '../../src/sim/player/predict';
import type { World } from '../../src/sim/world';
import { boxGrid, ent, makeWorld, pl, Tile } from './helpers';

const setup = { name: 'DET', race: 'drifter', hat: '', companion: '' };

/** A busy scripted input stream exercising every movement feature. */
function script(t: number, salt = 0): PlayerInput {
  const i = emptyInput();
  const phase = Math.floor((t + salt) / 45) % 8;
  i.moveX = phase % 3 === 0 ? -1 : phase % 3 === 1 ? 1 : 0;
  i.moveY = phase === 5 ? 1 : phase === 6 ? -1 : 0;
  i.jump = (t + salt) % 37 < 12 || (phase === 4 && t % 9 < 3);
  i.dash = (t + salt) % 97 < 2 ? 1 : (t + salt) % 131 < 2 ? -1 : 0;
  i.attack = t % 60 < 4;
  i.aimX = 50 + (t % 200);
  i.aimY = 100;
  return i;
}

function digest(w: World): number[] {
  const out: number[] = [w.tick, w.entities.length, w.rng.getState().d];
  for (const p of w.players) {
    const e = w.get(p.entityId)!;
    out.push(e.x, e.y, e.vx, e.vy, e.hp, p.stamina, p.mana, p.hunger, p.ctl.dashT, p.ctl.airJumpsUsed, p.ctl.coyote);
  }
  for (const e of w.entities) out.push(e.id, e.x, e.y);
  return out;
}

describe('determinism', () => {
  it('same seed + same inputs → identical state (2 players, all movement features)', () => {
    const go = () => {
      const w = createRun(4242, [setup, { ...setup, name: 'DET2' }]);
      for (let t = 0; t < 1500; t++) w.step([script(t), script(t, 17)]);
      return digest(w);
    };
    const a = go();
    expect(go()).toEqual(a);
  });

  it('different inputs diverge (sanity)', () => {
    const w1 = createRun(4242, [setup]);
    const w2 = createRun(4242, [setup]);
    for (let t = 0; t < 300; t++) {
      w1.step([script(t)]);
      w2.step([script(t, 5)]);
    }
    expect(digest(w1)).not.toEqual(digest(w2));
  });

  it('predictPlayer reproduces authoritative movement exactly (prediction contract)', () => {
    // Terrain with platforms, a ladder, water and walls; no enemies or hazards.
    const build = () => {
      const g = boxGrid(120, 40, 30);
      g.fill(20, 26, 26, 26, Tile.PLATFORM);
      g.fill(34, 20, 34, 29, Tile.LADDER);
      g.fill(30, 20, 33, 20, Tile.GROUND);
      g.fill(50, 27, 52, 29, Tile.GROUND);
      g.fill(60, 30, 75, 33, Tile.WATER);
      g.fill(60, 34, 75, 38, Tile.GROUND);
      return makeWorld(g, { spawnTx: 12 });
    };
    const auth = build();
    const pred = build();
    // One full tick each so level-entry bookkeeping has run in both.
    auth.step([emptyInput()]);
    pred.step([emptyInput()]);
    const pa = pl(auth);
    const pp = pl(pred);
    for (let t = 0; t < 2000; t++) {
      const input = script(t, 3);
      input.attack = false; // item use isn't part of movement prediction
      if (t % 150 === 0) {
        // A swing the host started (snapshotted to the client): facing follows the aim until it ends.
        for (const w of [auth, pred]) ent(w).swing = { ticks: 20, total: 20, angle: 0, hit: [], item: 'none' };
      }
      auth.step([input]);
      predictPlayer(pred, pp, ent(pred), input);
      const a = ent(auth);
      const b = ent(pred);
      if (a.x !== b.x || a.y !== b.y || a.facing !== b.facing || pa.stamina !== pp.stamina || !!a.swing !== !!b.swing) {
        throw new Error(`diverged at tick ${t}: auth (${a.x}, ${a.y}, f ${a.facing}, st ${pa.stamina}) vs pred (${b.x}, ${b.y}, f ${b.facing}, st ${pp.stamina})`);
      }
    }
    expect(ent(auth).x).toBe(ent(pred).x);
  });
});
