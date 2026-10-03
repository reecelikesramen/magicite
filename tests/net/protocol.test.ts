import { describe, expect, it } from 'vitest';
import { ByteReader, ByteWriter } from '../../src/net/codec';
import { TileTracker, applyEdits, gridHash, regenerateLevel } from '../../src/net/levelsync';
import { OwnerAccess, buildOwnerLayout, readOwnerDelta, writeOwnerDelta } from '../../src/net/predict';
import {
  HostEncoder, Msg, decodeHello, decodeInputPacket, encodeHello, encodeInputPacket, openHostPacket, quantizeInput,
  readLevelChange, sanitizeRequest, writeLevelChange,
} from '../../src/net/protocol';
import { createStringTable } from '../../src/net/strings';
import { createRun } from '../../src/sim';
import type { PlayerInput } from '../../src/sim/types';
import { emptyInput } from '../../src/sim/types';

describe('protocol', () => {
  it('input packets carry the last N inputs, delta-coded, with unknown fields preserved', () => {
    const table = createStringTable();
    const inputs: PlayerInput[] = [];
    for (let i = 0; i < 8; i++) {
      const inp = emptyInput();
      inp.moveX = i % 3 === 0 ? 1 : -0.5;
      inp.moveY = 0.3;
      inp.jump = i % 2 === 0;
      inp.attack = i === 5;
      inp.aimX = 100.37 + i;
      inp.aimY = -20.2;
      inp.select = i === 3 ? 2 : -1;
      (inp as unknown as Record<string, unknown>).dash = i === 6 ? 1 : 0; // a field another workstream adds
      inputs.push(quantizeInput(inp));
    }
    const pkt = encodeInputPacket(new ByteWriter(64), 1234, 500, inputs, table);
    expect(pkt.length).toBeLessThan(100);
    const r = new ByteReader(pkt);
    expect(r.u8()).toBe(Msg.Input);
    const got: [number, PlayerInput][] = [];
    const info = decodeInputPacket(r, table, [emptyInput(), emptyInput()], (t, inp) => got.push([t, { ...inp, commands: [] }]));
    expect(info).toEqual({ ackTick: 1234, newestTick: 500, count: 8 });
    expect(got.map(([t]) => t)).toEqual([493, 494, 495, 496, 497, 498, 499, 500]);
    got.forEach(([, inp], i) => {
      const src = inputs[i]! as unknown as Record<string, unknown>;
      for (const k of ['moveX', 'moveY', 'jump', 'attack', 'aimX', 'aimY', 'select', 'skill', 'dash']) {
        expect((inp as unknown as Record<string, unknown>)[k]).toBe(src[k]);
      }
    });
  });

  it('quantizeInput is idempotent (client predicts with exactly what the host decodes)', () => {
    const inp = quantizeInput({ ...emptyInput(), moveX: 0.123456, aimX: 33.3333, aimY: -7.77 });
    const again = quantizeInput({ ...inp });
    expect(again).toEqual(inp);
  });

  it('Hello sanitizes an untrusted setup', () => {
    const table = createStringTable();
    const evil = { name: 'X'.repeat(100), race: 5, hat: 'h', companion: '', traits: ['a', 3, 'b', 'c', 'd', 'e'], stats: { hp: 1e9, atk: -4, dex: NaN }, difficulty: 'godmode' };
    const pkt = encodeHello({ version: 1, stringHash: table.hash, clientTime: 5, token: '', setup: evil as never }, table);
    const r = new ByteReader(pkt);
    r.u8();
    const h = decodeHello(r, table);
    expect(h.setup.name.length).toBe(16);
    expect(h.setup.race).toBe('');
    expect(h.setup.traits).toEqual(['a', 'b', 'c', 'd']);
    expect(h.setup.stats).toEqual({ hp: 99, atk: 0, dex: 0, mag: 0, lck: 0 });
    expect(h.setup.difficulty).toBeUndefined();
  });

  it('LevelChange round-trips a request + edits; clients rebuild the identical grid', () => {
    const world = createRun(77, [{ name: 'A', race: 'drifter', hat: '', companion: '' }]);
    const level = world.level;
    const base = regenerateLevel(level.request!).grid;
    const tracker = new TileTracker(level.grid, base);
    level.grid.set(20, 20, 0);
    level.grid.set(21, 20, 0);
    level.grid.setWall(5, 5, 2);
    const host = createStringTable();
    const enc = new HostEncoder(host);
    const w = enc.begin();
    writeLevelChange(w, { epoch: 3, tick: 99, request: level.request!, level: null, baseHash: tracker.baseHash, edits: tracker.compactLog(level.grid) }, enc.sink);
    const pkt = enc.finish(Msg.LevelChange, new Set(), true);
    const client = createStringTable();
    const r = new ByteReader();
    expect(openHostPacket(r, pkt, client)).toBe(Msg.LevelChange);
    const m = readLevelChange(r, client);
    expect(m.epoch).toBe(3);
    expect(m.request).toEqual(level.request);
    const rebuilt = regenerateLevel(m.request!);
    expect(m.baseHash).toBe(gridHash(rebuilt.grid));
    applyEdits(rebuilt.grid, m.edits);
    expect(rebuilt.grid.fg).toEqual(level.grid.fg);
    expect(rebuilt.grid.bg).toEqual(level.grid.bg);
    expect(() => sanitizeRequest({ seed: 'x' })).toThrow(RangeError);
  });

  it('LevelChange falls back to a full level transfer when there is no request', () => {
    const world = createRun(78, [{ name: 'A', race: 'drifter', hat: '', companion: '' }]);
    const level = { ...world.level, request: undefined };
    const host = createStringTable();
    const enc = new HostEncoder(host);
    writeLevelChange(enc.begin(), { epoch: 1, tick: 0, request: null, level, baseHash: 0, edits: [] }, enc.sink);
    const pkt = enc.finish(Msg.LevelChange, new Set(), true);
    console.log(`[net] full level transfer: ${pkt.length} B for ${level.grid.w}×${level.grid.h} tiles`);
    const client = createStringTable();
    const r = new ByteReader();
    openHostPacket(r, pkt, client);
    const m = readLevelChange(r, client);
    expect(m.level!.grid.fg).toEqual(level.grid.fg);
    expect(m.level!.info).toEqual(level.info);
    expect(m.level!.exits).toEqual(level.exits);
  });

  it('owner block deltas are exact and compact', () => {
    const world = createRun(5, [{ name: 'A', race: 'drifter', hat: '', companion: '' }]);
    const p = world.players[0]!;
    const e = world.playerEntity(0)!;
    const acc = new OwnerAccess(buildOwnerLayout(p, e));
    expect(acc.layout.keys).toContain('e.x');
    expect(acc.layout.keys).toContain('ctl.coyote');
    expect(acc.layout.keys).toContain('prev.jump');
    const a = new Float64Array(acc.n);
    const b = new Float64Array(acc.n);
    acc.capture(p, e, a);
    e.x += 0.1234567;
    e.vy = -183.33333;
    p.ctl.jumpBuffer = 3;
    acc.capture(p, e, b);
    const w = new ByteWriter();
    writeOwnerDelta(w, b, a);
    expect(w.pos).toBeLessThan(40);
    const out = new Float64Array(acc.n);
    readOwnerDelta(new ByteReader(w.finish()), a, out);
    expect([...out]).toEqual([...b]);
    expect(acc.equal(out, 0, b, 0)).toBe(true);
  });
});
