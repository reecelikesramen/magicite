import { describe, expect, it } from 'vitest';
import {
  ByteReader, ByteWriter, CollectingSink, StaticSink, StringTable, bytesEqual, readStringDefs, readValue,
  unzigzag, writeStringDefs, writeValue, zigzag,
} from '../../src/net/codec';

describe('codec: ByteWriter/ByteReader', () => {
  it('round-trips fixed-width ints, floats, bools and strings', () => {
    const w = new ByteWriter(4); // tiny on purpose: exercises growth
    w.u8(250);
    w.i8(-5);
    w.u16(65000);
    w.u32(0xdeadbeef);
    w.f32(1.5);
    w.f64(Math.PI);
    w.bool(true);
    w.str('hello');
    w.str('héllo ✓');
    w.blob(new Uint8Array([1, 2, 3]));
    const r = new ByteReader(w.finish());
    expect(r.u8()).toBe(250);
    expect(r.i8()).toBe(-5);
    expect(r.u16()).toBe(65000);
    expect(r.u32()).toBe(0xdeadbeef);
    expect(r.f32()).toBe(1.5);
    expect(r.f64()).toBe(Math.PI);
    expect(r.bool()).toBe(true);
    expect(r.str()).toBe('hello');
    expect(r.str()).toBe('héllo ✓');
    expect([...r.blob()]).toEqual([1, 2, 3]);
    expect(r.remaining).toBe(0);
    expect(() => r.u8()).toThrow(RangeError);
  });

  it('varints and zigzag cover small, 32-bit and 53-bit ranges', () => {
    const vals = [0, 1, 127, 128, 300, 16383, 16384, 2 ** 31 - 1, 2 ** 31, 2 ** 32 + 5, 2 ** 40, Number.MAX_SAFE_INTEGER];
    const w = new ByteWriter();
    for (const v of vals) w.uvar(v);
    const svals = vals.filter((v) => v < 2 ** 52); // zigzag doubles the magnitude
    for (const v of svals) w.svar(v);
    for (const v of svals) w.svar(-v);
    const r = new ByteReader(w.finish());
    for (const v of vals) expect(r.uvar()).toBe(v);
    for (const v of svals) expect(r.svar()).toBe(v);
    for (const v of svals) expect(r.svar()).toBe(v === 0 ? 0 : -v);
    for (const v of [-3, -1, 0, 1, 2, -(2 ** 30), 2 ** 30 - 1, 2 ** 30, -(2 ** 33)]) expect(unzigzag(zigzag(v))).toBe(v);
  });

  it('num() is exact for ints and doubles and compact for small ints', () => {
    const vals = [0, 1, -1, 42, -1000, 2 ** 27, -(2 ** 27), 2 ** 29, 0.1, -2.4, 1e-9, -0, Infinity];
    const w = new ByteWriter();
    w.num(5);
    expect(w.pos).toBe(1);
    for (const v of vals) w.num(v);
    const r = new ByteReader(w.finish());
    expect(r.num()).toBe(5);
    for (const v of vals) expect(Object.is(r.num(), v)).toBe(true);
  });

  it('quantized fixed point rounds to the scale', () => {
    const w = new ByteWriter();
    w.q(12.34, 16);
    w.q(-0.04, 16);
    const r = new ByteReader(w.finish());
    expect(r.q(16)).toBeCloseTo(12.3125, 5);
    expect(r.q(16)).toBeCloseTo(-0.0625, 5);
  });

  it('bytesEqual compares contents', () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(bytesEqual(undefined, new Uint8Array(0))).toBe(false);
  });
});

describe('codec: strings and generic values', () => {
  it('interns static and dynamic strings; definitions travel to a fresh table', () => {
    const host = new StringTable(['alpha', 'beta']);
    const client = new StringTable(['alpha', 'beta']);
    expect(host.hash).toBe(client.hash);
    expect(host.staticCount).toBe(3); // '' + 2
    const sink = new CollectingSink(host);
    const w = new ByteWriter();
    const value = { a: 'alpha', name: 'RALVAND', list: [1, -2, 3.25, null, true, 'beta', 'RALVAND'], nested: { deep: 'gamma' }, skip: undefined };
    writeValue(w, value, sink);
    expect(sink.used.length).toBe(7); // a, name, RALVAND, list, nested, deep, gamma
    const defs = new ByteWriter();
    writeStringDefs(defs, host, sink.used);
    readStringDefs(new ByteReader(defs.finish()), client);
    const decoded = readValue(new ByteReader(w.finish()), client);
    const { skip: _skip, ...expected } = value;
    void _skip;
    expect(decoded).toEqual(expected);
  });

  it('client sinks write unknown strings inline (no id allocation)', () => {
    const t = new StringTable(['x']);
    const w = new ByteWriter();
    writeValue(w, { x: 1, unknownKey: 'unknownValue' }, new StaticSink(t));
    expect(t.size).toBe(2);
    expect(readValue(new ByteReader(w.finish()), new StringTable(['x']))).toEqual({ x: 1, unknownKey: 'unknownValue' });
  });

  it('lossy mode stores fractional numbers as f32', () => {
    const t = new StringTable([]);
    const w = new ByteWriter();
    writeValue(w, [1.1, 7], new CollectingSink(t), true);
    const out = readValue(new ByteReader(w.finish()), t) as number[];
    expect(out[0]).toBeCloseTo(1.1, 5);
    expect(out[1]).toBe(7);
  });

  it('rejects malformed input without hanging and ignores __proto__ keys', () => {
    const t = new StringTable([]);
    expect(() => readValue(new ByteReader(new Uint8Array([7, 200, 200, 200])), t)).toThrow(RangeError);
    expect(() => readValue(new ByteReader(new Uint8Array([99])), t)).toThrow(RangeError);
    const w = new ByteWriter();
    w.u8(8); // object
    w.uvar(1);
    w.uvar(0);
    w.str('__proto__');
    w.u8(8);
    w.uvar(0);
    const o = readValue(new ByteReader(w.finish()), t) as object;
    expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
  });
});
