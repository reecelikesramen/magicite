import { describe, expect, it } from 'vitest';
import { OwnerAccess, buildOwnerLayout, latchPrev, predictStep } from '../../src/net/predict';
import { createRun } from '../../src/sim';
import { applyDamage } from '../../src/sim/combat/damage';
import type { PlayerInput, PlayerState } from '../../src/sim/types';
import { emptyInput } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { scripted, setupFor } from './harness';

function soloWorld(seed: number): World {
  const w = createRun(seed, [setupFor('A')]);
  for (const e of w.entities) if (e.kind === 'enemy' || e.kind === 'boss') e.dead = true;
  w.step([emptyInput()]); // let cleanup remove them
  return w;
}

describe('client prediction step', () => {
  it('reproduces the authoritative owner state tick for tick, including knockback stagger and i-frame timers', () => {
    const host = soloWorld(31);
    const mirror = soloWorld(31);
    const hp = host.players[0]!;
    const he = host.playerEntity(0)!;
    const mp = mirror.players[0]!;
    const me = mirror.playerEntity(0)!;
    const acc = new OwnerAccess(buildOwnerLayout(hp, he));
    expect(acc.layout.keys).toContain('e.invuln');
    expect(acc.layout.keys).toContain('e.hurt');
    const a = new Float64Array(acc.n);
    const b = new Float64Array(acc.n);
    // Same outside force on both, then identical inputs: only the predicted pipeline runs on the mirror.
    applyDamage(host, he, 1, { dir: -1, knockback: 90 });
    applyDamage(mirror, me, 1, { dir: -1, knockback: 90 });
    for (let t = 0; t < 240; t++) {
      const inp: PlayerInput = scripted(t, 1);
      host.step([inp]);
      predictStep(mirror, mp, me, inp);
      acc.capture(hp, he, a);
      acc.capture(mp, me, b);
      if (!acc.equal(a, 0, b, 0)) {
        const diff = acc.layout.keys.flatMap((k, i) => (a[i] !== b[i] ? [`${k}: ${a[i]} vs ${b[i]}`] : []));
        throw new Error(`tick ${t}: ${diff.join(', ')}`);
      }
    }
    expect(he.invuln).toBe(0);
    expect(he.hurt).toBe(0);
  });

  it('carried-only entries are restored on rewind but never trigger one', () => {
    const w = soloWorld(5);
    const p = w.players[0]!;
    const e = w.playerEntity(0)!;
    const acc = new OwnerAccess(buildOwnerLayout(p, e));
    const a = new Float64Array(acc.n);
    const b = new Float64Array(acc.n);
    acc.capture(p, e, a);
    p.ctl.mineTicks = 17;
    acc.capture(p, e, b);
    expect(acc.equal(a, 0, b, 0)).toBe(true);
    p.ctl.mineTicks = 0;
    acc.restore(p, e, b);
    expect(p.ctl.mineTicks).toBe(17);
    e.x += 0.25;
    acc.capture(p, e, b);
    expect(acc.equal(a, 0, b, 0)).toBe(false);
  });

  it('latches numeric button fields too (e.g. a dash direction added by the player workstream)', () => {
    const p = { prev: { jump: false, attack: false, interact: false, alt: false, dash: 0 } } as unknown as PlayerState;
    const inp = { ...emptyInput(), jump: true, dash: -1 } as unknown as PlayerInput;
    latchPrev(p, inp);
    expect(p.prev).toEqual({ jump: true, attack: false, interact: false, alt: false, dash: -1 });
    // Fields the input does not carry are left alone.
    const bare = { ...emptyInput() } as unknown as Record<string, unknown>;
    delete bare.dash;
    latchPrev(p, bare as unknown as PlayerInput);
    expect((p.prev as unknown as Record<string, unknown>).dash).toBe(-1);
  });
});
