import { describe, expect, it } from 'vitest';
import { PHYS, secs } from '../../src/sim/constants';
import { applyDamage } from '../../src/sim/combat/damage';
import { addPlayer } from '../../src/sim/player/create';
import { DOWNED, onLevelEnter } from '../../src/sim/player/downed';
import type { World } from '../../src/sim/world';
import { boxGrid, ent, loadTestLevel, makeWorld, pl, place, run, settle, TILE } from './helpers';

function coop(n = 2): World {
  const w = makeWorld(boxGrid(80, 40, 30), { players: n });
  settle(w, 10);
  return w;
}

function down(w: World, i: number): void {
  const e = ent(w, i);
  e.invuln = 0;
  applyDamage(w, e, 999, { knockback: 0 });
}

describe('downed & revive (co-op)', () => {
  it('a player at 0 HP is downed, crawls slowly and cannot jump or dash', () => {
    const w = coop();
    down(w, 0);
    run(w, 1);
    const p = pl(w);
    const e = ent(w);
    expect(p.downed).toBe(true);
    expect(p.out).toBe(false);
    expect(p.runStats.deaths).toBe(1);
    expect(w.run.over).toBe(false);
    run(w, 30, { moveX: 1, jump: true, dash: 1 });
    expect(Math.abs(e.vx)).toBeLessThanOrEqual(PHYS.crawlSpeed);
    expect(e.vx).toBeGreaterThan(0);
    expect(e.onGround).toBe(true);
    expect(e.anim).toBe('crawl');
  });

  it('a teammate holding interact nearby for 2 s revives at 50% HP', () => {
    const w = coop();
    down(w, 0);
    run(w, 1);
    const e0 = ent(w, 0);
    place(w, 1, e0.x + e0.w / 2 + 6, e0.y + e0.h);
    const events: string[] = [];
    let t = 0;
    while (pl(w, 0).downed && t < secs(3)) {
      run(w, 1, {}, { interact: true });
      for (const ev of w.events) events.push(ev.type);
      t++;
    }
    expect(pl(w, 0).downed).toBe(false);
    expect(t).toBeGreaterThanOrEqual(DOWNED.reviveTicks - 1);
    expect(t).toBeLessThanOrEqual(DOWNED.reviveTicks + 1);
    expect(e0.hp).toBe(Math.ceil(e0.maxHp / 2));
    expect(e0.invuln).toBeGreaterThan(0);
    expect(events).toContain('revived');
    expect(pl(w, 1).runStats.revives).toBe(1);
  });

  it('revive progress needs proximity and decays when the reviver lets go', () => {
    const w = coop();
    down(w, 0);
    run(w, 1);
    const e0 = ent(w, 0);
    // Too far away: no progress.
    place(w, 1, e0.x + 40, e0.y + e0.h);
    run(w, 30, {}, { interact: true });
    expect(pl(w, 0).reviveProgress).toBe(0);
    // Close: progress, then decay after letting go.
    place(w, 1, e0.x + e0.w / 2 + 4, e0.y + e0.h);
    run(w, 60, {}, { interact: true });
    expect(pl(w, 0).reviveProgress).toBe(60);
    run(w, 10, {}, {});
    expect(pl(w, 0).reviveProgress).toBe(60 - 10 * DOWNED.progressDecay);
  });

  it('bleeds out after 30 s (out for the level) and returns at 1 HP on the next level', () => {
    const w = coop();
    down(w, 0);
    run(w, DOWNED.bleedOutTicks + 5);
    expect(pl(w, 0).out).toBe(true);
    expect(w.run.over).toBe(false); // teammate still up
    // Party moves on.
    loadTestLevel(w, boxGrid(80, 40, 30), { district: 2 });
    run(w, 2);
    expect(pl(w, 0).downed).toBe(false);
    expect(pl(w, 0).out).toBe(false);
    expect(ent(w, 0).hp).toBe(1);
  });

  it('downed (not yet out) players also revive at 1 HP on level entry', () => {
    const w = coop();
    down(w, 1);
    run(w, 5);
    loadTestLevel(w, boxGrid(80, 40, 30), { district: 1, isTown: true });
    run(w, 1);
    expect(pl(w, 1).downed).toBe(false);
    expect(ent(w, 1).hp).toBe(1);
    // Idempotent when called explicitly by run flow as well.
    onLevelEnter(w);
    expect(ent(w, 1).hp).toBe(1);
  });

  it('a teammate dropping in mid-level does not revive downed or out players', () => {
    const w = coop(3);
    down(w, 0);
    run(w, DOWNED.bleedOutTicks + 5); // player 0 bled out
    down(w, 1);
    run(w, 5); // player 1 downed
    expect([pl(w, 0).out, pl(w, 1).downed]).toEqual([true, true]);
    addPlayer(w, { name: 'Late', race: 'drifter', hat: '', companion: '' });
    run(w, 2);
    expect(pl(w, 0).out).toBe(true);
    expect(pl(w, 1).downed).toBe(true);
    expect(ent(w, 0).hp).toBe(0);
    expect(pl(w, 3).ctl.levelKey).toBe(pl(w, 2).ctl.levelKey); // newcomer got its level-entry bookkeeping
  });

  it('when the whole party is down the run is over', () => {
    const w = coop(3);
    down(w, 0);
    down(w, 1);
    run(w, 2);
    expect(w.run.over).toBe(false);
    down(w, 2);
    let over = false;
    for (let i = 0; i < 2; i++) {
      run(w, 1);
      if (w.events.some((ev) => ev.type === 'runOver' && !ev.victory)) over = true;
    }
    expect(over).toBe(true);
    expect(w.run.over).toBe(true);
    expect(w.run.victory).toBe(false);
  });

  it('a downed player cannot revive another downed player', () => {
    const w = coop(3);
    down(w, 0);
    down(w, 1);
    run(w, 1);
    expect(w.run.over).toBe(false); // player 2 is still up (far away, not helping)
    const e0 = ent(w, 0);
    place(w, 1, e0.x + e0.w / 2 + 4, e0.y + e0.h);
    place(w, 2, e0.x + 60, e0.y + e0.h);
    run(w, 30, {}, { interact: true }, {});
    expect(pl(w, 0).reviveProgress).toBe(0);
    expect(pl(w, 0).downed).toBe(true);
  });
});

describe('solo death', () => {
  it('downed in solo ends the run immediately', () => {
    const w = makeWorld(boxGrid());
    settle(w, 5);
    down(w, 0);
    run(w, 1);
    expect(pl(w).downed).toBe(true);
    expect(pl(w).out).toBe(true);
    expect(w.run.over).toBe(true);
    expect(pl(w).runStats.deaths).toBe(1);
  });

  it('no fall damage', () => {
    const w = makeWorld(boxGrid(40, 80, 70));
    settle(w, 5);
    const e = ent(w);
    place(w, 0, 20 * TILE, 10 * TILE);
    run(w, 240);
    expect(e.onGround).toBe(true);
    expect(e.hp).toBe(e.maxHp);
  });
});
