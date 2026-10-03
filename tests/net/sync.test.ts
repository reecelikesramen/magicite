import { describe, expect, it } from 'vitest';
import { applyDamage } from '../../src/sim/combat/damage';
import { addItem, countItem } from '../../src/sim/items/inventory';
import { enterLevel, requestFor } from '../../src/sim/run';
import type { GameEvent } from '../../src/sim/types';
import { emptyInput } from '../../src/sim/types';
import { TICK_MS, idle, makeRig, run, scripted } from './harness';

describe('net sync details', () => {
  it('outside forces (knockback) are reconciled and the visual correction decays', () => {
    const rig = makeRig({ clients: 1, conditions: { latencyMs: 60, jitterMs: 10 }, netSeed: 21 });
    const hw = rig.host.world;
    for (const e of hw.entities) if (e.kind === 'enemy') e.dead = true;
    run(rig, 240);
    const c = rig.clients[0]!;
    const before = c.stats.corrections;
    const pe = hw.playerEntity(c.playerIndex)!;
    const hp0 = pe.hp;
    applyDamage(hw, pe, 1, { dir: 1, knockback: 120 });
    run(rig, 60, idle, idle);
    expect(c.stats.corrections).toBeGreaterThan(before);
    run(rig, 120, idle, idle);
    const ce = c.world.get(pe.id)!;
    expect(Math.abs(ce.x - pe.x)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(ce.y - pe.y)).toBeLessThanOrEqual(0.05);
    expect(Math.hypot(c.correctionOffset.x, c.correctionOffset.y)).toBe(0);
    // Non-predicted fields of the own player come from the host.
    expect(ce.hp).toBe(pe.hp);
    expect(pe.hp).toBeLessThan(hp0);
  });

  it('remote entities are interpolated smoothly despite loss and jitter', () => {
    const rig = makeRig({ clients: 1, conditions: { latencyMs: 70, jitterMs: 30, loss: 0.05 }, netSeed: 23 });
    run(rig, 240);
    const c = rig.clients[0]!;
    const hostE = rig.host.world.playerEntity(0)!;
    let lastC: number | null = null;
    let lastH = hostE.x;
    let maxC = 0;
    let maxH = 0;
    for (let i = 0; i < 900; i++) {
      run(rig, 1);
      const ce = c.world.get(hostE.id)!;
      if (lastC !== null) maxC = Math.max(maxC, Math.abs(ce.x - lastC));
      maxH = Math.max(maxH, Math.abs(hostE.x - lastH));
      lastC = ce.x;
      lastH = hostE.x;
    }
    console.log(`[net] remote player max per-tick step: client view ${maxC.toFixed(3)} px vs host ${maxH.toFixed(3)} px`);
    expect(maxC).toBeLessThanOrEqual(maxH * 1.25 + 0.15);
  });

  it('UI commands travel reliably; private state and important events come back', () => {
    const rig = makeRig({ clients: 1, conditions: { latencyMs: 50, jitterMs: 10, loss: 0.05 }, netSeed: 25 });
    run(rig, 200);
    const c = rig.clients[0]!;
    const hp = rig.host.world.players[c.playerIndex]!;
    addItem(hp, 'wood', 2);
    run(rig, 30, idle, idle);
    const cp = c.world.players[c.playerIndex]!;
    expect(countItem(cp, 'wood')).toBe(2);
    const slot = cp.inventory.findIndex((s) => s?.id === 'wood');
    const events: GameEvent[] = [];
    for (let t = 0; t < 60; t++) {
      rig.host.tick(new Map([[0, emptyInput()]]));
      rig.host.drainEvents();
      const inp = emptyInput();
      if (t === 0) inp.commands = [{ type: 'craft', a: slot, b: slot }];
      c.tick(new Map([[c.playerIndex, inp]]));
      events.push(...c.drainEvents());
      rig.net.advance(TICK_MS);
    }
    expect(countItem(hp, 'plank')).toBe(1);
    expect(countItem(cp, 'plank')).toBe(1);
    expect(countItem(cp, 'wood')).toBe(0);
    expect(cp.knownRecipes.length).toBe(1);
    expect(events.some((e) => e.type === 'craft' && e.result === 'plank')).toBe(true);
  });

  it('important events still waiting for their render tick survive a level change', () => {
    const rig = makeRig({ clients: 1, conditions: { latencyMs: 30, jitterMs: 5 }, netSeed: 31 });
    run(rig, 200);
    const c = rig.clients[0]!;
    const hw = rig.host.world;
    const hp = hw.players[c.playerIndex]!;
    addItem(hp, 'wood', 2);
    run(rig, 30, idle, idle);
    const slot = c.world.players[c.playerIndex]!.inventory.findIndex((s) => s?.id === 'wood');
    const events: GameEvent[] = [];
    let craftedAt = -1;
    for (let t = 0; t < 180; t++) {
      rig.host.tick(new Map([[0, emptyInput()]]));
      if (rig.host.drainEvents().some((e) => e.type === 'craft') && craftedAt < 0) craftedAt = t;
      // Portal right after the host has sent the craft event (one snapshot round later).
      if (craftedAt >= 0 && t === craftedAt + 2) enterLevel(hw, requestFor(hw, 2));
      const inp = emptyInput();
      if (t === 0) inp.commands = [{ type: 'craft', a: slot, b: slot }];
      c.tick(new Map([[c.playerIndex, inp]]));
      events.push(...c.drainEvents());
      rig.net.advance(TICK_MS);
    }
    expect(craftedAt).toBeGreaterThan(0);
    expect(c.epoch).toBe(rig.host.epoch);
    expect(events.filter((e) => e.type === 'craft')).toHaveLength(1);
  });

  it('a client recovers from a 1 s stall (background tab) and predicts cleanly again', () => {
    const rig = makeRig({ clients: 1, conditions: { latencyMs: 50, jitterMs: 10 }, netSeed: 29 });
    for (const e of rig.host.world.entities) if (e.kind === 'enemy') e.dead = true;
    run(rig, 240);
    const c = rig.clients[0]!;
    // Stall: the host keeps simulating, the client does not tick at all.
    for (let i = 0; i < 60; i++) {
      rig.host.tick(new Map([[0, scripted(rig.t++, 0)]]));
      rig.host.drainEvents();
      rig.net.advance(TICK_MS);
    }
    run(rig, 300);
    const before = c.stats.corrections;
    run(rig, 600);
    expect(c.stats.corrections - before).toBe(0);
    run(rig, 120, idle, idle);
    const hp = rig.host.world.playerEntity(c.playerIndex)!;
    const cp = c.world.get(hp.id)!;
    expect(Math.abs(cp.x - hp.x)).toBeLessThanOrEqual(0.05);
  });

  it('a client that never sends input still sees the world and holds its position', () => {
    const rig = makeRig({ clients: 2, conditions: { latencyMs: 30 }, netSeed: 27 });
    run(rig, 300, scripted, idle);
    for (const c of rig.clients) {
      expect(c.ready).toBe(true);
      expect(c.world.entities.length).toBeGreaterThan(3);
      expect(c.stats.corrections).toBe(0);
    }
  });
});
