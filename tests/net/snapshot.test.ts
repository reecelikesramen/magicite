import { describe, expect, it } from 'vitest';
import { ByteReader, ByteWriter } from '../../src/net/codec';
import { blankEntity, mirrorAdd, mirrorClear, mirrorRemoveWhere } from '../../src/net/mirror';
import {
  ENTITY_FIELDS, EntityFrame, NF, applyRow, captureFrame, readEntityDelta, selectInterest, writeEntityDelta,
} from '../../src/net/snapshot';
import { createStringTable } from '../../src/net/strings';
import { createRun } from '../../src/sim';
import { World } from '../../src/sim/world';

const setup = { name: 'T', race: 'drifter', hat: '', companion: '' };

function allIdx(f: EntityFrame): Int32Array {
  const a = new Int32Array(f.count);
  for (let i = 0; i < f.count; i++) a[i] = i;
  return a;
}

function encode(f: EntityFrame, base: EntityFrame | null, strings = createStringTable()): Uint8Array {
  const w = new ByteWriter();
  writeEntityDelta(w, f, allIdx(f), f.count, base, base ? allIdx(base) : null, base ? base.count : 0, () => {}, strings.staticCount);
  return w.copy();
}

describe('snapshot schema', () => {
  it('has unique keys and components before their sub-fields', () => {
    const keys = ENTITY_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(NF).toBe(keys.length);
    expect(ENTITY_FIELDS.slice(0, 8).map((f) => f.key)).toEqual(['x', 'y', 'vx', 'vy', 'facing', 'onGround', 'anim', 'hp']);
  });

  it('round-trips entities through capture → full encode → decode → applyRow', () => {
    const world = createRun(3, [setup]);
    const strings = createStringTable();
    const pe = world.playerEntity(0)!;
    pe.x = 123.4567;
    pe.vx = -61.3;
    pe.facing = -1;
    pe.swing = { ticks: 5, total: 9, angle: 1.25, hit: [3], item: 'axe' };
    pe.status = [{ id: 'burn', ticks: 30, power: 1, source: 0 }];
    pe.held = 'axe';
    const slime = world.spawnAt('enemy', 'green_slime', 200, 200, 8, 6, { hp: 3, maxHp: 5, anim: 'some_new_anim' });
    const f = new EntityFrame(4);
    captureFrame(world, f, strings);
    const pkt = encode(f, null, strings);
    const out = new EntityFrame(4);
    readEntityDelta(new ByteReader(pkt), null, out);
    expect(out.count).toBe(f.count);
    expect([...out.rows.subarray(0, out.count * NF)]).toEqual([...f.rows.subarray(0, f.count * NF)]);

    const i = out.indexOf(pe.id);
    const e = blankEntity(pe.id);
    applyRow(e, out.rows, i * NF, strings, true);
    expect(e.x).toBeCloseTo(123.4567, 1);
    expect(Math.abs(e.x - pe.x)).toBeLessThanOrEqual(1 / 32);
    expect(e.vx).toBeCloseTo(-61.5, 5);
    expect(e.facing).toBe(-1);
    expect(e.kind).toBe('player');
    expect(e.playerIndex).toBe(0);
    expect(e.held).toBe('axe');
    expect(e.swing).toMatchObject({ ticks: 5, total: 9, item: 'axe' });
    expect(e.swing!.angle).toBeCloseTo(1.25, 2);
    expect(e.status.map((s) => s.id)).toEqual(['burn']);
    expect(e.light?.radius).toBe(48);

    const j = out.indexOf(slime.id);
    const se = blankEntity(slime.id);
    applyRow(se, out.rows, j * NF, strings, true);
    expect(se).toMatchObject({ kind: 'enemy', def: 'green_slime', team: 'enemy', hp: 3, maxHp: 5, anim: 'some_new_anim', w: 8, h: 6 });
    expect(se.swing).toBeUndefined();
    expect(se.playerIndex).toBeUndefined();
  });

  it('delta encoding: unchanged entities cost nothing; creates, updates and removes are exact', () => {
    const world = createRun(4, [setup]);
    for (let k = 0; k < 50; k++) world.spawnAt('resource', 'tree_forest', 100 + k * 8, 200, 8, 24, { gravityScale: 0, collides: false, resource: { def: 'tree_forest', hitFlash: 0 } });
    const strings = createStringTable();
    const a = new EntityFrame();
    captureFrame(world, a, strings);
    const b = new EntityFrame();
    captureFrame(world, b, strings);
    expect(encode(b, a, strings).length).toBe(2); // nRemoved = 0, terminator

    // Move the player, remove a tree, add a pickup.
    const pe = world.playerEntity(0)!;
    pe.x += 3.5;
    const tree = world.entities.find((e) => e.kind === 'resource')!;
    tree.dead = true;
    world.spawnAt('pickup', 'wood', 50, 50, 6, 6, { pickup: { item: { id: 'wood', count: 3 }, delay: 0, gold: 0 } });
    const c = new EntityFrame();
    captureFrame(world, c, strings);
    const pkt = encode(c, a, strings);
    expect(pkt.length).toBeLessThan(40);
    const decodedA = new EntityFrame();
    readEntityDelta(new ByteReader(encode(a, null, strings)), null, decodedA);
    const out = new EntityFrame();
    readEntityDelta(new ByteReader(pkt), decodedA, out);
    expect(out.count).toBe(c.count);
    expect([...out.ids.subarray(0, out.count)]).toEqual([...c.ids.subarray(0, c.count)]);
    expect([...out.rows.subarray(0, out.count * NF)]).toEqual([...c.rows.subarray(0, c.count * NF)]);
  });

  it('interest: players always, others within the box, hysteresis for known entities', () => {
    const world = new World(1, []);
    world.level = createRun(1, []).level;
    const p = world.spawn('player', 'player', 0, 0, { w: 6, h: 11 });
    const near = world.spawn('enemy', 'green_slime', 100, 0);
    const edge = world.spawn('enemy', 'green_slime', 330, 0); // centre 334: just outside 320 + 0
    const far = world.spawn('enemy', 'green_slime', 2000, 0);
    const otherPlayer = world.spawn('player', 'player', 5000, 0);
    const strings = createStringTable();
    const f = new EntityFrame();
    captureFrame(world, f, strings);
    const area = { halfW: 320, halfH: 180, margin: 32 };
    const out = new Int32Array(8);
    const n = selectInterest(f, p.x, p.y, area, null, null, 0, out);
    const ids = [...out.subarray(0, n)].map((i) => f.ids[i]);
    expect(ids).toEqual([p.id, near.id, otherPlayer.id]);
    // The client already had `edge` → kept while within halfW + margin.
    const prevInc = new Int32Array([f.indexOf(edge.id)]);
    const n2 = selectInterest(f, p.x, p.y, area, f, prevInc, 1, out);
    expect([...out.subarray(0, n2)].map((i) => f.ids[i])).toContain(edge.id);
    expect([...out.subarray(0, n2)].map((i) => f.ids[i])).not.toContain(far.id);
  });
});

describe('mirror world', () => {
  it('inserts host-id entities that World.get can find, and removes them', () => {
    const world = new World(0, []);
    const e = blankEntity(77);
    mirrorAdd(world, e);
    mirrorAdd(world, blankEntity(78));
    expect(world.get(77)).toBe(e);
    mirrorRemoveWhere(world, (x) => x.id === 77);
    expect(world.get(77)).toBeUndefined();
    expect(world.entities.map((x) => x.id)).toEqual([78]);
    mirrorClear(world);
    expect(world.get(78)).toBeUndefined();
    expect(world.entities.length).toBe(0);
  });
});
