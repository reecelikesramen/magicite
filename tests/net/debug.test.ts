import { describe, expect, it } from 'vitest';
import { idle, makeRig, run } from './harness';

describe('debug', () => {
  it('joins and converges', () => {
    const rig = makeRig({ clients: 1, conditions: { latencyMs: 50, jitterMs: 10 } });
    run(rig, 300);
    const c = rig.clients[0]!;
    console.log(c.state, c.reason, c.playerIndex, c.stats, rig.host.clientStats());
    run(rig, 120, idle, idle);
    const hw = rig.host.world;
    for (const p of hw.players) {
      const he = hw.get(p.entityId)!;
      const ce = c.world.get(p.entityId);
      console.log(p.index, he.x, he.y, ce?.x, ce?.y);
    }
    console.log('entities host', hw.entities.length, 'client', c.world.entities.length);
    expect(c.state).toBe('joined');
  });
});
