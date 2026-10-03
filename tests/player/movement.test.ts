import { describe, expect, it } from 'vitest';
import { PHYS } from '../../src/sim/constants';
import { dexSpeedMul } from '../../src/sim/items/stats';
import type { World } from '../../src/sim/world';
import { boxGrid, ent, makeWorld, pl, place, run, runUntil, settle, TILE } from './helpers';

/** Fresh world: flat floor at row 30, player standing at tile column 10. */
function flat(): World {
  const w = makeWorld(boxGrid(120, 40, 30));
  settle(w);
  return w;
}

/** Jump from the ground and return the apex height in tiles (feet rise). */
function jumpApex(world: World, opts: { holdTicks?: number; double?: boolean } = {}): number {
  const e = ent(world);
  const startBottom = e.y + e.h;
  let minBottom = startBottom;
  let phase = 0; // 0 first jump, 1 released at apex, 2 second jump
  let doubleAt = -1;
  for (let t = 0; t < 180; t++) {
    let jump: boolean;
    if (!opts.double) jump = t < (opts.holdTicks ?? 999);
    else if (phase === 0) {
      jump = true;
      if (t > 2 && e.vy >= 0) {
        phase = 1;
        jump = false;
      }
    } else if (phase === 1) {
      jump = false;
      phase = 2;
      doubleAt = t + 1;
    } else jump = true;
    world.step([{ ...emptyIn(), jump }]);
    minBottom = Math.min(minBottom, e.y + e.h);
    if (t > 5 && e.onGround) break;
  }
  void doubleAt;
  const tiles = (startBottom - minBottom) / TILE;
  if (process.env.MEASURE) console.log(`apex ${JSON.stringify(opts)}: ${tiles.toFixed(2)} tiles`);
  return tiles;
}

function emptyIn() {
  return { moveX: 0, moveY: 0, jump: false, attack: false, alt: false, interact: false, aimX: 0, aimY: 0, select: -1, skill: -1, dash: 0 as const, commands: [] };
}

describe('movement measurements', () => {
  it('runs at ≈ 7–8 tiles/s with snappy acceleration', () => {
    const w = flat();
    const e = ent(w);
    run(w, 6, { moveX: 1 });
    expect(e.vx).toBeGreaterThan(PHYS.walkSpeed * 0.9); // full speed within ~0.1 s
    const x0 = e.x;
    run(w, 60, { moveX: 1 });
    const tilesPerSec = (e.x - x0) / TILE;
    if (process.env.MEASURE) console.log(`run: ${tilesPerSec.toFixed(2)} tiles/s`);
    expect(tilesPerSec).toBeGreaterThanOrEqual(7);
    expect(tilesPerSec).toBeLessThanOrEqual(8);
    run(w, 6);
    expect(e.vx).toBe(0); // stops within ~0.1 s
  });

  it('single jump apex ≈ 3 tiles (clears a 3-tile ledge)', () => {
    const apex = jumpApex(flat());
    expect(apex).toBeGreaterThanOrEqual(3.1);
    expect(apex).toBeLessThanOrEqual(3.6);
  });

  it('variable jump: a tap is much lower than a held jump', () => {
    const tap = jumpApex(flat(), { holdTicks: 1 });
    expect(tap).toBeGreaterThanOrEqual(1.0);
    expect(tap).toBeLessThanOrEqual(2.0);
    const mid = jumpApex(flat(), { holdTicks: 8 });
    expect(mid).toBeGreaterThan(tap);
    expect(mid).toBeLessThan(jumpApex(flat()));
  });

  it('double jump apex ≈ 5.5 tiles and costs 1 stamina', () => {
    const w = flat();
    const p = pl(w);
    const before = p.stamina;
    const apex = jumpApex(w, { double: true });
    expect(apex).toBeGreaterThanOrEqual(5.0);
    expect(apex).toBeLessThanOrEqual(6.0);
    expect(p.stamina).toBe(before - 1);
    run(w, 1);
    expect(p.ctl.airJumpsUsed).toBe(0); // reset on landing
  });

  it('no double jump without stamina', () => {
    const w = flat();
    const p = pl(w);
    p.stamina = 0;
    p.ctl.staminaT = -100000; // freeze regen for this test
    const apex = jumpApex(w, { double: true });
    expect(apex).toBeLessThanOrEqual(3.6);
    expect(p.stamina).toBe(0);
  });

  it('ground dash ≈ 3 tiles, costs 1 stamina, grants brief i-frames', () => {
    const w = flat();
    const e = ent(w);
    const p = pl(w);
    const s0 = p.stamina;
    const x0 = e.x;
    run(w, 1, { dash: 1 });
    expect(e.invuln).toBeGreaterThan(0);
    expect(p.stamina).toBe(s0 - 1);
    runUntil(w, 60, () => e.vx === 0 && p.ctl.dashT === 0);
    const tiles = (e.x - x0) / TILE;
    if (process.env.MEASURE) console.log(`ground dash: ${tiles.toFixed(2)} tiles`);
    expect(tiles).toBeGreaterThanOrEqual(2.6);
    expect(tiles).toBeLessThanOrEqual(3.4);
    expect(e.onGround).toBe(true);
  });

  it('air dash ≈ 5 tiles, faster than the ground dash and holds altitude', () => {
    const w = flat();
    const e = ent(w);
    const p = pl(w);
    // Jump and wait for the apex.
    run(w, 1, { jump: true });
    runUntil(w, 60, () => e.vy >= 0, { jump: true });
    const x0 = e.x;
    const y0 = e.y;
    run(w, 1, { dash: 1 });
    expect(p.ctl.dashAir).toBe(true);
    const speed = Math.abs(e.vx);
    expect(speed).toBeGreaterThan(PHYS.dashGroundSpeed * 1.4);
    run(w, PHYS.dashAirTicks - 1);
    expect(Math.abs(e.y - y0)).toBeLessThan(0.5); // no gravity during an air dash
    runUntil(w, 120, () => e.onGround);
    const tiles = (e.x - x0) / TILE;
    if (process.env.MEASURE) console.log(`air dash: ${tiles.toFixed(2)} tiles`);
    expect(tiles).toBeGreaterThanOrEqual(4.5);
    expect(tiles).toBeLessThanOrEqual(5.6);
  });

  it('dash left mirrors dash right', () => {
    const w = flat();
    const e = ent(w);
    const x0 = e.x;
    run(w, 1, { dash: -1 });
    runUntil(w, 60, () => e.vx === 0 && pl(w).ctl.dashT === 0);
    expect((x0 - e.x) / TILE).toBeGreaterThanOrEqual(2.6);
  });
});

describe('traversal budget (level-gen capability graph)', () => {
  /** Horizontal tiles covered by a running jump from flat ground until landing at the same height. */
  function runningJump(opts: { double?: boolean; dash?: 'ground' | 'apex' } = {}): number {
    const w = flat();
    const e = ent(w);
    run(w, 20, { moveX: 1 }); // full speed
    if (opts.dash === 'ground') run(w, 2, { moveX: 1, dash: 1 });
    const x0 = e.x;
    let t = 0;
    let usedDouble = false;
    let usedDash = false;
    run(w, 1, { moveX: 1, jump: true });
    while (t++ < 240 && !e.onGround) {
      const input: { moveX: number; jump: boolean; dash?: 1 } = { moveX: 1, jump: true };
      if (opts.double && !usedDouble && e.vy >= 0) {
        input.jump = false;
        usedDouble = true;
        run(w, 1, input);
        input.jump = true;
      }
      if (opts.dash === 'apex' && !usedDash && e.vy >= 0) {
        input.dash = 1;
        usedDash = true;
      }
      run(w, 1, input);
    }
    const tiles = (e.x - x0) / TILE;
    if (process.env.MEASURE) console.log(`running jump ${JSON.stringify(opts)}: ${tiles.toFixed(2)} tiles`);
    return tiles;
  }

  it('running jump clears ≥ 4 tiles; with an apex air dash ≥ 6 (GDD: gaps ≤ 6 with dash)', () => {
    expect(runningJump()).toBeGreaterThanOrEqual(4);
    expect(runningJump({ double: true })).toBeGreaterThan(runningJump());
    expect(runningJump({ dash: 'apex' })).toBeGreaterThanOrEqual(6);
    expect(runningJump({ dash: 'ground' })).toBeGreaterThan(runningJump());
  });
});

describe('controller forgiveness', () => {
  /** Ledge: floor row 30 for x < 20, pit beyond (floor row 38). */
  function ledgeWorld(): World {
    const g = boxGrid(80, 40, 38);
    g.fill(1, 30, 19, 37, 1);
    const w = makeWorld(g, { spawnTx: 15, floor: 30 });
    settle(w);
    return w;
  }

  it('coyote time: jumping a few ticks after walking off a ledge is a free ground jump', () => {
    const w = ledgeWorld();
    const e = ent(w);
    const p = pl(w);
    place(w, 0, 19 * TILE + 4, 30 * TILE);
    run(w, 2);
    runUntil(w, 60, () => !e.onGround, { moveX: 1 });
    run(w, PHYS.coyoteTicks - 2, { moveX: 1 });
    const s0 = p.stamina;
    run(w, 1, { moveX: 1, jump: true });
    expect(e.vy).toBeLessThan(-PHYS.jumpSpeed * 0.8);
    expect(p.stamina).toBe(s0);
  });

  it('after coyote time expires the press becomes a stamina double jump', () => {
    const w = ledgeWorld();
    const e = ent(w);
    const p = pl(w);
    place(w, 0, 19 * TILE + 4, 30 * TILE);
    run(w, 2);
    runUntil(w, 60, () => !e.onGround, { moveX: 1 });
    run(w, PHYS.coyoteTicks + 4, { moveX: 1 });
    const s0 = p.stamina;
    run(w, 1, { moveX: 1, jump: true });
    expect(e.vy).toBeLessThan(0);
    expect(p.stamina).toBe(s0 - 1);
  });

  it('jump buffer: pressing jump just before landing jumps on touchdown', () => {
    const w = flat();
    const e = ent(w);
    const p = pl(w);
    p.stamina = 0; // no air jump available → the press must be buffered
    p.ctl.staminaT = -100000;
    place(w, 0, 30 * TILE, 30 * TILE - 40);
    runUntil(w, 120, () => e.y + e.h > 30 * TILE - 10);
    let jumped = false;
    run(w, 1, { jump: true });
    for (let t = 0; t < 20 && !jumped; t++) {
      run(w, 1, { jump: true });
      if (e.vy < -PHYS.jumpSpeed * 0.8) jumped = true;
    }
    expect(jumped).toBe(true);
  });

  it('a press a couple of ticks above the floor waits for the ground jump instead of burning stamina', () => {
    const w = flat();
    const e = ent(w);
    const p = pl(w);
    place(w, 0, 30 * TILE, 30 * TILE - 40);
    runUntil(w, 120, () => e.y + e.h + (e.vy * 2) / 60 >= 30 * TILE - 0.5);
    expect(e.onGround).toBe(false);
    const s0 = p.stamina;
    run(w, 4, { jump: true });
    expect(p.stamina).toBe(s0);
    expect(e.vy).toBeLessThan(-PHYS.jumpSpeed * 0.8);
  });

  it('…but never holds the double jump when the landing spot is spiked', () => {
    const w = flat();
    const e = ent(w);
    const p = pl(w);
    w.level.grid.fill(28, 29, 32, 29, 6); // spikes on the floor
    place(w, 0, 30 * TILE, 30 * TILE - 40);
    runUntil(w, 120, () => e.y + e.h + (e.vy * 2) / 60 >= 30 * TILE - 0.5);
    const s0 = p.stamina;
    run(w, 1, { jump: true });
    expect(p.stamina).toBe(s0 - 1);
    expect(e.vy).toBeLessThan(0);
  });

  it('…and if the player drifts off the ledge instead of landing, the held press still double-jumps', () => {
    const g = boxGrid(80, 40, 38);
    g.fill(1, 30, 19, 37, 1); // ledge top at y = 240, right edge at x = 160, pit beyond
    const w = makeWorld(g, { spawnTx: 15, floor: 30 });
    settle(w);
    const e = ent(w);
    const p = pl(w);
    // Falling with the hitbox overlapping the ledge corner by 1.5 px.
    place(w, 0, 20 * TILE - 1.5 + e.w / 2, 30 * TILE - 30);
    runUntil(w, 120, () => e.y + e.h + (e.vy * 2) / 60 >= 30 * TILE - 0.5);
    expect(e.onGround).toBe(false);
    e.vx = 90; // sliding off the corner
    const s0 = p.stamina;
    run(w, 1, { moveX: 1, jump: true });
    expect(p.stamina).toBe(s0); // held for the (expected) ground jump
    let rose = false;
    for (let t = 0; t < PHYS.jumpBufferTicks && !rose; t++) {
      run(w, 1, { moveX: 1, jump: true });
      rose = e.vy < 0;
    }
    expect(rose).toBe(true);
    expect(p.stamina).toBe(s0 - 1);
    expect(e.x).toBeGreaterThan(20 * TILE); // over the pit, not on the ledge
  });

  it('jump and dash presses made during hit-stop are kept for when it ends', () => {
    const w = flat();
    const e = ent(w);
    const p = pl(w);
    w.freeze = 5;
    run(w, 1, { jump: true }); // pressed while frozen
    expect(w.freeze).toBeGreaterThan(0);
    run(w, 2, { jump: true });
    expect(e.vy).toBe(0); // still frozen
    runUntil(w, 10, () => w.freeze === 0, { jump: true });
    run(w, 1, { jump: true });
    expect(e.vy).toBeLessThan(-PHYS.jumpSpeed * 0.8);
    runUntil(w, 120, () => e.onGround && e.vy === 0);
    run(w, 30);
    const s0 = p.stamina;
    w.freeze = 4;
    run(w, 1, { dash: 1 });
    expect(p.ctl.dashDir).toBe(0);
    runUntil(w, 10, () => w.freeze === 0, { dash: 1 });
    run(w, 1, { dash: 1 });
    expect(p.ctl.dashDir).toBe(1);
    expect(p.stamina).toBe(s0 - 1);
  });

  it('corner correction: a jump that clips a ceiling corner by 2 px slides around it', () => {
    const g = boxGrid(80, 40, 30);
    // Ceiling block 3 tiles above the floor covering x ∈ [80, 88); player spans [86, 92).
    g.set(10, 27, 1);
    const w = makeWorld(g, { spawnTx: 20 });
    settle(w);
    const e = place(w, 0, 89, 30 * TILE);
    run(w, 2);
    const startBottom = e.y + e.h;
    let minBottom = startBottom;
    for (let t = 0; t < 40; t++) {
      run(w, 1, { jump: true });
      minBottom = Math.min(minBottom, e.y + e.h);
    }
    expect((startBottom - minBottom) / TILE).toBeGreaterThan(3);
    expect(e.x).toBeGreaterThanOrEqual(88);
  });

  it('ledge nudge: barely missing a ledge top pops the player onto it', () => {
    const g = boxGrid(80, 40, 30);
    // 3-tile wall at column 14 (top at row 27 → y = 216).
    g.fill(14, 27, 20, 29, 1);
    const w = makeWorld(g, { spawnTx: 8 });
    settle(w);
    const e = ent(w);
    // Fall diagonally into the wall with feet 2 px below its top.
    place(w, 0, 14 * TILE - 4, 27 * TILE + 2 - 0.01);
    e.vx = 60;
    e.vy = 5;
    run(w, 10, { moveX: 1 });
    expect(e.x).toBeGreaterThan(14 * TILE);
    expect(e.y + e.h).toBeLessThanOrEqual(27 * TILE + 0.01);
  });
});

describe('platforms, ladders, water', () => {
  it('jumps up through a one-way platform, lands on it, and drops through with Down + Jump', () => {
    const g = boxGrid(80, 40, 30);
    g.fill(8, 27, 14, 27, 4); // platform 3 tiles above the floor
    const w = makeWorld(g, { spawnTx: 10 });
    settle(w);
    const e = ent(w);
    run(w, 1, { jump: true });
    runUntil(w, 120, () => e.onGround && e.vy === 0 && w.tick > 5, { jump: true });
    run(w, 10);
    expect(e.y + e.h).toBe(27 * TILE);
    run(w, 1, { moveY: 1, jump: true });
    run(w, 40);
    expect(e.y + e.h).toBe(30 * TILE);
  });

  it('climbs a ladder, stands on its top, and climbs back down', () => {
    const g = boxGrid(80, 40, 30);
    // Upper floor at row 22 with a 1-tile hole at column 12 filled by a ladder down to the floor.
    g.fill(1, 22, 30, 22, 1);
    g.fill(12, 22, 12, 29, 5);
    const w = makeWorld(g, { spawnTx: 12 });
    settle(w);
    const e = ent(w);
    place(w, 0, 12 * TILE + 4, 30 * TILE);
    run(w, 2);
    run(w, 4, { moveY: -1 });
    expect(pl(w).ctl.climbing).toBe(true);
    expect(e.anim).toBe('climb');
    runUntil(w, 200, () => !pl(w).ctl.climbing, { moveY: -1 });
    run(w, 10);
    expect(e.onGround).toBe(true);
    expect(e.y + e.h).toBe(22 * TILE);
    // Down on the ladder top climbs back down.
    run(w, 3, { moveY: 1 });
    expect(pl(w).ctl.climbing).toBe(true);
    runUntil(w, 300, () => !pl(w).ctl.climbing, { moveY: 1 });
    run(w, 10);
    expect(e.y + e.h).toBe(30 * TILE);
  });

  it('swims: sinks slowly, swims up while holding jump and leaps out at the surface', () => {
    const g = boxGrid(80, 40, 34);
    // Pool: water rows 26..33 in columns 6..20, walls around below row 26.
    g.fill(1, 26, 5, 33, 1);
    g.fill(21, 26, 40, 33, 1);
    g.fill(6, 26, 20, 33, 7);
    const w = makeWorld(g, { spawnTx: 30, floor: 26 });
    settle(w);
    const e = ent(w);
    place(w, 0, 13 * TILE, 32 * TILE);
    run(w, 30);
    expect(e.inLiquid).toBe(true);
    expect(e.vy).toBeLessThanOrEqual(PHYS.swimMaxFall + 0.01);
    // Swim up and leap out.
    const t = runUntil(w, 240, () => e.y + e.h < 26 * TILE - 4, { jump: true });
    expect(t).toBeLessThan(240);
    expect(e.vy).toBeLessThan(0);
    // Speed in water is reduced.
    place(w, 0, 13 * TILE, 33 * TILE);
    run(w, 30, { moveX: 1 });
    expect(Math.abs(e.vx)).toBeLessThanOrEqual(PHYS.walkSpeed * PHYS.swimSpeedMul * dexSpeedMul(w.players[0]!.stats.dex) + 0.01);
  });

  it('holding Down underwater dives faster than sinking (and brakes a fast entry); leaping out splashes once', () => {
    const g = boxGrid(80, 60, 50);
    g.fill(1, 20, 78, 49, 7);
    const w = makeWorld(g, { floor: 20 });
    settle(w, 5);
    const e = ent(w);
    place(w, 0, 30 * TILE, 24 * TILE);
    run(w, 40);
    const sink = e.vy;
    expect(sink).toBeLessThanOrEqual(PHYS.swimMaxFall + 0.01);
    run(w, 40, { moveY: 1 });
    expect(e.vy).toBeGreaterThan(sink + 10);
    expect(e.vy).toBeLessThanOrEqual(PHYS.swimDownSpeed + 0.01);
    // Plunging in from high up while holding Down is still braked to the dive speed.
    place(w, 0, 30 * TILE, 10 * TILE);
    runUntil(w, 120, () => e.y > 20 * TILE, { moveY: 1 });
    expect(e.vy).toBeGreaterThan(PHYS.swimDownSpeed * 2);
    run(w, 20, { moveY: 1 });
    expect(e.vy).toBeLessThanOrEqual(PHYS.swimDownSpeed + 0.01);
    // Swim up from just below the surface and leap out: one splash for the leap.
    place(w, 0, 30 * TILE, 21 * TILE + 4);
    let leapSplashes = 0;
    for (let t = 0; t < 30 && e.inLiquid; t++) {
      run(w, 1, { jump: true });
      leapSplashes += w.events.filter((ev) => ev.type === 'sfx' && ev.id === 'splash').length;
    }
    expect(e.inLiquid).toBe(false);
    expect(e.vy).toBeLessThan(0);
    expect(leapSplashes).toBe(1);
  });

  it('dive (Down + Jump in mid-air) falls faster than terminal velocity and slams down', () => {
    const w = flat();
    const e = ent(w);
    place(w, 0, 30 * TILE, 30 * TILE - 80);
    run(w, 3);
    run(w, 1, { moveY: 1, jump: true });
    expect(pl(w).ctl.diving).toBe(true);
    run(w, 2, { moveY: 1 });
    expect(e.vy).toBeGreaterThan(PHYS.maxFall);
    let slammed = false;
    for (let t = 0; t < 60 && !slammed; t++) {
      run(w, 1);
      slammed = w.events.some((ev) => ev.type === 'sfx' && ev.id === 'slam');
    }
    expect(slammed).toBe(true);
    expect(pl(w).ctl.diving).toBe(false);
    expect(e.onGround).toBe(true);
  });
});

describe('facing', () => {
  it('faces movement normally, but the aim direction while attacking', () => {
    const w = flat();
    const e = ent(w);
    run(w, 3, { moveX: -1 });
    expect(e.facing).toBe(-1);
    run(w, 3, { moveX: -1, attack: true, aimX: e.x + 50, aimY: e.y });
    expect(e.facing).toBe(1);
    run(w, 3, { moveX: -1 });
    expect(e.facing).toBe(-1);
  });
});
