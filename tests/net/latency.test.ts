import { describe, expect, it } from 'vitest';
import type { PlayerInput } from '../../src/sim/types';
import { emptyInput } from '../../src/sim/types';
import { type InputFn, makeRig, run, step, TICK_MS } from './harness';

/**
 * Latency budget on a 30 ms one-way link (+5 ms jitter):
 *  - remote view delay: how far behind the authoritative position a client draws another player
 *  - input delay: ticks from a client starting to move until the host's world shows it
 */
const ONE_WAY = 30;
const right = (on: boolean): PlayerInput => ({ ...emptyInput(), moveX: on ? 1 : 0 });

export function measure(hostOpts: Record<string, unknown> = {}): { viewDelay: number; inputDelay: number } {
  const rig = makeRig({ conditions: { latencyMs: ONE_WAY, jitterMs: 5 }, host: hostOpts });
  run(rig, 240, null, null);
  const c = rig.clients[0]!;
  const hostIdx = 0;
  // Host walks back and forth; record its true x per tick.
  const truth: number[] = [];
  const seen: number[] = [];
  const walk: InputFn = (t) => right(Math.floor(t / 50) % 2 === 0);
  for (let i = 0; i < 300; i++) {
    step(rig, (t) => ({ ...walk(t, 0), moveX: Math.floor(t / 40) % 2 === 0 ? 1 : -1 }), null);
    truth.push(rig.host.world.playerEntity(hostIdx)!.x);
    seen.push(c.world.playerEntity(hostIdx)?.x ?? NaN);
  }
  // Best lag (ticks) aligning the client's view with the host's history.
  let best = 0;
  let bestErr = Infinity;
  for (let lag = 0; lag < 40; lag++) {
    let err = 0;
    let n = 0;
    for (let i = 60; i < truth.length; i++) {
      if (Number.isNaN(seen[i]!) || i - lag < 0) continue;
      err += Math.abs(seen[i]! - truth[i - lag]!);
      n++;
    }
    if (n && err / n < bestErr) {
      bestErr = err / n;
      best = lag;
    }
  }
  // Input delay: client starts walking at tick t0; host sees its entity move at t1.
  const ci = c.playerIndex;
  const before = rig.host.world.playerEntity(ci)!.x;
  let delay = -1;
  for (let i = 0; i < 120; i++) {
    step(rig, null, () => right(true));
    if (delay < 0 && Math.abs(rig.host.world.playerEntity(ci)!.x - before) > 0.5) delay = i;
  }
  return { viewDelay: best, inputDelay: delay };
}

describe('latency budget (30 ms one-way)', () => {
  it('reports view and input delay', () => {
    const m = measure();
    process.stderr.write(`latency: remote view ${m.viewDelay} ticks (${(m.viewDelay * TICK_MS).toFixed(0)} ms), input ${m.inputDelay} ticks (${(m.inputDelay * TICK_MS).toFixed(0)} ms)\n`);
    // 30 ms one-way ≈ 2 ticks of link: everything above that is buffering we pay for.
    // (Was 6 / 7 ticks with 30 Hz snapshots and an input slack floor of 2.)
    expect(m.viewDelay).toBeLessThanOrEqual(4);
    expect(m.inputDelay).toBeLessThanOrEqual(6);
  });
});

describe('client hit feedback', () => {
  it('a joiner hears/sees its melee hit at once, and the host copy is not played twice', async () => {
    const { spawnFromSpec } = await import('../../src/sim/spawn');
    const rig = makeRig({ conditions: { latencyMs: ONE_WAY, jitterMs: 0 } });
    run(rig, 240, null, null);
    const c = rig.clients[0]!;
    const ci = c.playerIndex;
    const me = rig.host.world.playerEntity(ci)!;
    // A stationary target right in front of the joiner (hex totems don't move).
    spawnFromSpec(rig.host.world, { kind: 'enemy', def: 'hex_totem', x: me.x + me.w + 6, y: me.y + me.h });
    const foe = rig.host.world.entities.at(-1)!;
    foe.hp = foe.maxHp = 999;
    run(rig, 60, null, null);
    const events: { tick: number; id: string }[] = [];
    let pressed = -1;
    for (let i = 0; i < 90; i++) {
      const attack = i >= 5 && i < 7;
      if (attack && pressed < 0) pressed = i;
      rig.host.tick(new Map([[0, emptyInput()]]));
      rig.host.drainEvents();
      c.tick(new Map([[ci, { ...emptyInput(), attack, aimX: foe.x + foe.w / 2, aimY: foe.y + foe.h / 2 }]]));
      for (const ev of c.drainEvents()) if (ev.type === 'sfx' && (ev.id === 'hit' || ev.id === 'crit')) events.push({ tick: i, id: ev.id });
      rig.net.advance(TICK_MS);
    }
    expect(foe.hp, 'the host registered the hit').toBeLessThan(999);
    expect(events.length, `hit sounds: ${JSON.stringify(events)}`).toBe(1);
    expect(events[0]!.tick - pressed, 'feedback within the swing wind-up, not after a round trip').toBeLessThanOrEqual(8);
  });
});
