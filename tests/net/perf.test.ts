import { describe, expect, it } from 'vitest';
import { ByteReader, ByteWriter } from '../../src/net/codec';
import { DEFAULT_INTEREST } from '../../src/net/host';
import { EntityFrame, captureFrame, readEntityDelta, selectInterest, writeEntityDelta } from '../../src/net/snapshot';
import { createStringTable } from '../../src/net/strings';
import { createRun } from '../../src/sim';
import type { World } from '../../src/sim/world';
import { makeRig, run, scripted } from './harness';

function populate(world: World, total: number): void {
  const g = world.level.grid;
  for (let k = 0; world.entities.length < total; k++) {
    const tx = 4 + ((k * 37) % (g.w - 8));
    let ty = 3;
    while (ty < g.h - 1 && !g.isSolid(tx, ty + 1)) ty++;
    const x = tx * 8 + 4;
    const y = (ty + 1) * 8;
    if (k % 3 === 0) world.spawnAt('enemy', 'green_slime', x, y, 8, 6, { hp: 5, maxHp: 5 });
    else if (k % 3 === 1) world.spawnAt('resource', 'tree_forest', x, y, 8, 24, { gravityScale: 0, collides: false, resource: { def: 'tree_forest', hitFlash: 0 } });
    else world.spawnAt('pickup', 'wood', x, y, 6, 6, { pickup: { item: { id: 'wood', count: 1 }, delay: 0, gold: 0 } });
  }
}

describe('net performance', () => {
  it('(e) capture + encode + decode of one snapshot round for 4 clients takes < 1 ms', () => {
    const setups = [0, 1, 2, 3].map((i) => ({ name: `P${i}`, race: 'drifter', hat: '', companion: '' }));
    const world = createRun(5, setups);
    populate(world, 220);
    const strings = createStringTable();
    const clientStrings = createStringTable();
    const frames = [new EntityFrame(), new EntityFrame()];
    const inc = [0, 1, 2, 3].map(() => [new Int32Array(512), new Int32Array(512)]);
    const counts = [0, 0, 0, 0].map(() => [0, 0]);
    const decoded = [0, 1, 2, 3].map(() => [new EntityFrame(), new EntityFrame()]);
    const w = new ByteWriter(4096);
    const r = new ByteReader();
    const inputs = setups.map(() => scripted(0, 0));
    let bytes = 0;
    const samples: number[] = [];
    for (let round = 0; round < 400; round++) {
      for (let s = 0; s < 2; s++) {
        for (let i = 0; i < 4; i++) inputs[i] = scripted(round * 2 + s, i);
        world.step(inputs);
      }
      const cur = round & 1;
      const prev = cur ^ 1;
      const t0 = performance.now();
      const f = frames[cur]!;
      captureFrame(world, f, strings);
      f.tick = world.tick;
      for (let c = 0; c < 4; c++) {
        const pe = world.playerEntity(c)!;
        const hasBase = round > 0;
        const bf = hasBase ? frames[prev]! : null;
        counts[c]![cur] = selectInterest(f, pe.x, pe.y, DEFAULT_INTEREST, bf, hasBase ? inc[c]![prev]! : null, hasBase ? counts[c]![prev]! : 0, inc[c]![cur]!);
        w.reset();
        writeEntityDelta(w, f, inc[c]![cur]!, counts[c]![cur]!, bf, hasBase ? inc[c]![prev]! : null, hasBase ? counts[c]![prev]! : 0, () => {}, strings.staticCount);
        const pkt = w.finish();
        bytes += pkt.length;
        readEntityDelta(r.reset(pkt), hasBase ? decoded[c]![prev]! : null, decoded[c]![cur]!);
      }
      const dt = performance.now() - t0;
      if (round >= 50) samples.push(dt);
    }
    // Median, not mean: the suite runs test files in parallel workers, and a single GC pause or
    // descheduled slice would otherwise dominate the average and make this assertion flaky.
    samples.sort((a, b) => a - b);
    const median = samples[samples.length >> 1]!;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const p90 = samples[Math.floor(samples.length * 0.9)]!;
    console.log(`[net] snapshot round (capture ${world.entities.length} entities + 4× interest/encode/decode): median ${median.toFixed(3)} ms, avg ${avg.toFixed(3)} ms, p90 ${p90.toFixed(3)} ms, ${(bytes / 400 / 4).toFixed(0)} B/client/snapshot`);
    // Decoded client frames equal the host's interest-filtered rows.
    const f = frames[1]!;
    for (let c = 0; c < 4; c++) {
      const d = decoded[c]![1]!;
      expect(d.count).toBe(counts[c]![1]);
      for (let i = 0; i < d.count; i++) {
        const hi = inc[c]![1]![i]!;
        expect(d.ids[i]).toBe(f.ids[hi]);
      }
    }
    void clientStrings;
    expect(median).toBeLessThan(1);
  });

  it('host tick cost with 3 remote clients and ~200 entities (logged)', () => {
    const rig = makeRig({ clients: 3, conditions: { latencyMs: 40, jitterMs: 10, loss: 0.05 } });
    populate(rig.host.world, 200);
    run(rig, 240);
    let hostMs = 0;
    let clientMs = 0;
    const N = 600;
    for (let t = 0; t < N; t++) {
      const a = performance.now();
      rig.host.tick(new Map([[0, scripted(t, 0)]]));
      rig.host.drainEvents();
      const b = performance.now();
      rig.clients.forEach((c, i) => {
        c.tick(new Map([[c.playerIndex, scripted(t, i + 1)]]));
        c.drainEvents();
      });
      const d = performance.now();
      hostMs += b - a;
      clientMs += (d - b) / rig.clients.length;
      rig.net.advance(1000 / 60);
    }
    console.log(`[net] host.tick avg ${(hostMs / N).toFixed(3)} ms (incl. world.step), client.tick avg ${(clientMs / N).toFixed(3)} ms`);
    expect(hostMs / N).toBeLessThan(8);
  });
});
