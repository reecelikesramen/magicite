import { describe, expect, it } from 'vitest';
import type { ClientSession } from '../../src/net/client';
import { applyDamage } from '../../src/sim/combat/damage';
import { enterLevel, requestFor } from '../../src/sim/run';
import { Tile } from '../../src/sim/tiles';
import type { World } from '../../src/sim/world';
import { type Rig, TICK_MS, addClient, idle, makeRig, run, scripted, step } from './harness';

/** Remove enemies so nothing but the players' own inputs moves them ("no outside forces"). */
function removeEnemies(world: World): void {
  for (const e of world.entities) if (e.kind === 'enemy' || e.kind === 'boss') e.dead = true;
}

/** Max position error of every player as seen by `c` vs the host (local player includes smoothing). */
function playerError(rig: Rig, c: ClientSession): number {
  let max = 0;
  for (const p of rig.host.world.players) {
    if (p.out) continue;
    const he = rig.host.world.get(p.entityId)!;
    const ce = c.world.get(p.entityId);
    if (!ce) return Infinity;
    max = Math.max(max, Math.abs(he.x - ce.x), Math.abs(he.y - ce.y));
  }
  return max;
}

function gridsEqual(a: World, b: World): boolean {
  const ga = a.level.grid;
  const gb = b.level.grid;
  if (ga.w !== gb.w || ga.h !== gb.h) return false;
  for (let i = 0; i < ga.fg.length; i++) if (ga.fg[i] !== gb.fg[i] || ga.bg[i] !== gb.bg[i]) return false;
  return true;
}

/** Dig a few tiles out of the host level (stands in for mining / bombs). */
function digSomeTiles(world: World, seed: number): number {
  const g = world.level.grid;
  let n = 0;
  for (let k = 0; k < 12; k++) {
    const x = 10 + ((seed * 7 + k * 13) % (g.w - 20));
    for (let y = 0; y < g.h; y++) {
      if (g.get(x, y) === Tile.GROUND) {
        g.set(x, y, Tile.AIR);
        n++;
        break;
      }
    }
  }
  return n;
}

const RTTS = [50, 150, 250];

describe('net sessions over a lossy loopback', () => {
  for (const rtt of RTTS) {
    it(`(a) remote state converges to the host within 1 px after inputs stop — 3 clients, ${rtt} ms RTT, 5% loss, jitter`, () => {
      const rig = makeRig({ clients: 3, conditions: { latencyMs: rtt / 2, jitterMs: 15, loss: 0.05, duplicate: 0.01 }, netSeed: rtt });
      run(rig, 600);
      for (const c of rig.clients) expect(c.state).toBe('joined');
      run(rig, 180, idle, idle);
      for (const c of rig.clients) {
        expect(playerError(rig, c)).toBeLessThanOrEqual(1);
        // Static entities (trees/rocks) match exactly within quantization.
        for (const he of rig.host.world.entities) {
          if (he.kind !== 'resource') continue;
          const ce = c.world.get(he.id);
          if (!ce) continue; // outside this client's interest area
          expect(Math.abs(ce.x - he.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(ce.y - he.y)).toBeLessThanOrEqual(1);
          expect(ce.def).toBe(he.def);
        }
        expect(c.world.level.info.name).toBe(rig.host.world.level.info.name);
      }
    });
  }

  it('(b) local prediction makes zero corrections when no outside forces act', () => {
    for (const rtt of RTTS) {
      const rig = makeRig({ clients: 3, conditions: { latencyMs: rtt / 2, jitterMs: 12 }, netSeed: 100 + rtt });
      removeEnemies(rig.host.world);
      run(rig, 240); // join + settle timing
      const before = rig.clients.map((c) => ({ ...c.stats }));
      run(rig, 900);
      rig.clients.forEach((c, i) => {
        const b = before[i]!;
        console.log(`[net] rtt ${rtt} ms client ${i}: predicted ${c.stats.predictedTicks - b.predictedTicks} ticks, reconciles ${c.stats.reconciles - b.reconciles}, corrections ${c.stats.corrections - b.corrections}, lead ${c.stats.leadTicks}, slack ${c.stats.slack}, interp ${c.stats.interpDelayTicks.toFixed(1)} ticks`);
        expect(c.stats.predictedTicks - b.predictedTicks).toBeGreaterThan(800);
        expect(c.stats.corrections - b.corrections).toBe(0);
        expect(c.stats.reconciles - b.reconciles).toBe(0);
      });
    }
  });

  it('(b2) with 5% loss, mispredictions stay rare and are smoothed', () => {
    const rig = makeRig({ clients: 2, conditions: { latencyMs: 75, jitterMs: 20, loss: 0.05 }, netSeed: 5 });
    removeEnemies(rig.host.world);
    run(rig, 240);
    const before = rig.clients.map((c) => ({ ...c.stats }));
    run(rig, 1800);
    rig.clients.forEach((c, i) => {
      const corr = c.stats.corrections - before[i]!.corrections;
      console.log(`[net] 150 ms RTT + 5% loss client ${i}: ${corr} corrections in 1800 ticks (max ${c.stats.maxCorrectionPx.toFixed(2)} px), misses ${c.stats.inputMisses}, target lead adapted to slack ${c.stats.slack}`);
      expect(corr).toBeLessThan(20);
    });
  });

  it('(c) late join works mid-level (tile edit log + entities) and after a level change', () => {
    const rig = makeRig({ clients: 1, conditions: { latencyMs: 40, jitterMs: 10, loss: 0.05 }, netSeed: 9 });
    run(rig, 200);
    digSomeTiles(rig.host.world, 1);
    run(rig, 100);
    // Late joiner mid-level.
    const late = addClient(rig, 'LATE');
    run(rig, 240);
    expect(late.state).toBe('joined');
    expect(late.playerIndex).toBe(2);
    expect(gridsEqual(rig.host.world, late.world)).toBe(true);
    expect(gridsEqual(rig.host.world, rig.clients[0]!.world)).toBe(true);
    expect(rig.host.world.players.length).toBe(3);
    run(rig, 120, idle, idle);
    for (const c of rig.clients) expect(playerError(rig, c)).toBeLessThanOrEqual(1);

    // Level change (what the exit portal does), then more digging.
    const hw = rig.host.world;
    enterLevel(hw, requestFor(hw, 2));
    run(rig, 60);
    digSomeTiles(hw, 2);
    run(rig, 120);
    for (const c of rig.clients) {
      expect(c.epoch).toBe(rig.host.epoch);
      expect(c.world.level.info.district).toBe(2);
      expect(gridsEqual(hw, c.world)).toBe(true);
    }
    // Late joiner after the level change.
    const late2 = addClient(rig, 'LATER');
    run(rig, 240);
    expect(late2.state).toBe('joined');
    expect(late2.epoch).toBe(rig.host.epoch);
    expect(gridsEqual(hw, late2.world)).toBe(true);
    run(rig, 120, idle, idle);
    for (const c of rig.clients) expect(playerError(rig, c)).toBeLessThanOrEqual(1);
    // Everyone knows everyone's public data.
    for (const c of rig.clients) expect(c.world.players.map((p) => p.name)).toEqual(['HOST', 'P1', 'LATE', 'LATER']);
  });

  it('(d) bandwidth per client stays < 12 KB/s with ~200 entities in the level', () => {
    const rig = makeRig({ clients: 3, conditions: { latencyMs: 60, jitterMs: 15, loss: 0.05 }, netSeed: 11 });
    const hw = rig.host.world;
    // Populate: hopping slimes, static trees/rocks, idle pickups.
    const g = hw.level.grid;
    let n = hw.entities.length;
    for (let k = 0; n < 200; k++, n++) {
      const tx = 4 + ((k * 37) % (g.w - 8));
      let ty = 3;
      while (ty < g.h - 1 && !g.isSolid(tx, ty + 1)) ty++;
      const x = tx * 8 + 4;
      const y = (ty + 1) * 8;
      if (k % 3 === 0) hw.spawnAt('enemy', 'green_slime', x, y, 8, 6, { hp: 5, maxHp: 5 });
      else if (k % 3 === 1) hw.spawnAt('resource', 'tree_forest', x, y, 8, 24, { gravityScale: 0, collides: false, resource: { def: 'tree_forest', hitFlash: 0 } });
      else hw.spawnAt('pickup', 'wood', x, y, 6, 6, { pickup: { item: { id: 'wood', count: 1 }, delay: 0, gold: 0 } });
    }
    expect(hw.entities.length).toBeGreaterThanOrEqual(200);
    run(rig, 300);
    const start = rig.clientT.map((t) => t.stats.bytesIn);
    const secs = 10;
    run(rig, secs * 60);
    rig.clientT.forEach((t, i) => {
      const kbps = (t.stats.bytesIn - start[i]!) / secs / 1024;
      const visible = rig.clients[i]!.world.entities.length;
      console.log(`[net] client ${i}: ${kbps.toFixed(2)} KB/s down (${hw.entities.length} entities in level, ${visible} in interest), up ${(t.stats.bytesOut / ((rig.t * TICK_MS) / 1000) / 1024).toFixed(2)} KB/s`);
      expect(kbps).toBeLessThan(12);
    });
  });

  it('(f) disconnects: crash, graceful leave, reconnect with token, host leaving, full game', () => {
    const rig = makeRig({ clients: 3, conditions: { latencyMs: 30, jitterMs: 5 }, netSeed: 13 });
    let left: string[] = [];
    rig.host.onPlayerLeave = (_i, name, reason) => left.push(`${name}:${reason}`);
    run(rig, 200);
    const [a, b, c] = rig.clients as [ClientSession, ClientSession, ClientSession];
    const bIndex = b.playerIndex;
    const bEntity = rig.host.world.players[bIndex]!.entityId;
    const bToken = b.token;
    expect(bToken.length).toBeGreaterThan(4);

    // Crash: peers notice after crashDetectMs (2 s).
    rig.clientT[1]!.crash();
    run(rig, 150);
    expect(left).toEqual(['P2:disconnected']);
    expect(rig.host.world.players[bIndex]!.out).toBe(true);
    expect(rig.host.remoteCount).toBe(2);
    run(rig, 30);
    expect(a.world.get(bEntity)).toBeUndefined(); // hidden from the others
    expect(a.world.players[bIndex]!.out).toBe(true);

    // Reconnect with the token → same player slot, back in the game.
    const b2 = addClient(rig, 'P2', bToken);
    run(rig, 120);
    expect(b2.state).toBe('joined');
    expect(b2.playerIndex).toBe(bIndex);
    expect(rig.host.world.players[bIndex]!.out).toBe(false);
    expect(rig.host.world.players.length).toBe(4);
    expect(a.world.get(bEntity)).toBeDefined();

    // Graceful leave.
    left = [];
    c.dispose();
    run(rig, 30);
    expect(left).toEqual(['P3:left']);

    // Full game: 4 players max (host + a + b2 + c's slot is reserved for reconnect).
    const extra = addClient(rig, 'EXTRA');
    run(rig, 60);
    expect(extra.state).toBe('rejected');
    expect(extra.reason).toMatch(/full/);

    // Host leaves → clients disconnect.
    rig.host.dispose();
    rig.hostT.close();
    run(rig, 30);
    expect(a.state).toBe('disconnected');
    expect(b2.state).toBe('disconnected');
  });

  it('(f2) a reconnect that beats crash detection takes the slot over instead of adding a player', () => {
    const rig = makeRig({ clients: 1, conditions: { latencyMs: 30, jitterMs: 5 }, netSeed: 41 });
    run(rig, 200);
    const events: string[] = [];
    rig.host.onPlayerLeave = (i, name, reason) => events.push(`leave ${i} ${name} ${reason}`);
    rig.host.onPlayerJoin = (i, name, re) => events.push(`join ${i} ${name} ${re}`);
    const old = rig.clients[0]!;
    const index = old.playerIndex;
    // "Page reload": a new connection with the saved token while the old one still looks alive.
    const fresh = addClient(rig, 'P1', old.token);
    run(rig, 120);
    expect(fresh.state).toBe('joined');
    expect(fresh.playerIndex).toBe(index);
    expect(fresh.token).toBe(old.token);
    expect(rig.host.world.players.length).toBe(2);
    expect(rig.host.remoteCount).toBe(1);
    expect(old.state).toBe('disconnected');
    expect(old.reason).toBe('replaced');
    expect(events).toEqual([`leave ${index} P1 replaced`, `join ${index} P1 true`]);
    run(rig, 120, idle, idle);
    expect(playerError(rig, fresh)).toBeLessThanOrEqual(1);
  });

  it('(f3) leaving does not revive a downed player in the same level; after a level change they stand up', () => {
    const rig = makeRig({ clients: 1, conditions: { latencyMs: 30 }, netSeed: 43 });
    run(rig, 200);
    const hw = rig.host.world;
    const c = rig.clients[0]!;
    const index = c.playerIndex;
    const p = hw.players[index]!;
    const e = hw.get(p.entityId)!;
    applyDamage(hw, e, e.hp + 10);
    expect(p.downed).toBe(true);
    run(rig, 10);
    const pos = { x: e.x, y: e.y };

    const crashAndRejoin = (name: string): ClientSession => {
      const token = rig.clients[rig.clients.length - 1]!.token;
      rig.clientT[rig.clientT.length - 1]!.crash();
      run(rig, 150); // crash detection (2 s)
      expect(p.out).toBe(true); // hidden while away
      const back = addClient(rig, name, token);
      run(rig, 60);
      expect(back.state).toBe('joined');
      expect(back.playerIndex).toBe(index);
      return back;
    };

    crashAndRejoin('P1');
    expect(p.downed).toBe(true);
    expect(p.out).toBe(false);
    expect(e.dead).toBe(false);
    expect(e.hp).toBe(0);
    expect({ x: e.x, y: e.y }).toEqual(pos); // no free teleport to the party either

    // Away during a level change → enters the new level like everyone else (standing, ≥ 1 HP).
    const token = rig.clients[rig.clients.length - 1]!.token;
    rig.clientT[rig.clientT.length - 1]!.crash();
    run(rig, 150);
    enterLevel(hw, requestFor(hw, 2));
    run(rig, 10);
    const back = addClient(rig, 'P1', token);
    run(rig, 120);
    expect(back.playerIndex).toBe(index);
    expect(p.downed).toBe(false);
    expect(p.out).toBe(false);
    expect(e.hp).toBeGreaterThanOrEqual(1);
    expect(back.epoch).toBe(rig.host.epoch);
  });

  it('own predicted events are not duplicated by the host echo', () => {
    const rig = makeRig({ clients: 1, conditions: { latencyMs: 50, jitterMs: 10 }, netSeed: 17 });
    removeEnemies(rig.host.world);
    const c = rig.clients[0]!;
    // Host idles (so every jump sfx on the host is the client's); the client jumps periodically.
    let clientJumps = 0;
    let hostJumps = 0;
    for (let t = 0; t < 900; t++) {
      rig.host.tick(new Map([[0, idle(t, 0)]]));
      for (const ev of rig.host.drainEvents()) if (ev.type === 'sfx' && ev.id === 'jump') hostJumps++;
      c.tick(new Map([[c.playerIndex, scripted(t, 1)]]));
      for (const ev of c.drainEvents()) if (ev.type === 'sfx' && ev.id === 'jump') clientJumps++;
      rig.net.advance(TICK_MS);
    }
    expect(hostJumps).toBeGreaterThan(5);
    // The client played each jump once (predicted), not twice (predicted + host echo). The host may
    // have simulated one more/less jump in the last RTT window.
    expect(Math.abs(clientJumps - hostJumps)).toBeLessThanOrEqual(2);
  });
});

void step;
