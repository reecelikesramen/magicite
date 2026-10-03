/**
 * Fast binary codec for the netcode hot path.
 *
 * - `ByteWriter` writes into a growable, preallocated buffer (reuse one writer per message kind and
 *   call `reset()`; `finish()` returns a view that is valid until the next write/reset).
 * - `ByteReader` reads from a Uint8Array view and throws `RangeError` on truncated input, so a
 *   malformed packet can be rejected with a single try/catch.
 * - Integers: u8/u16/u32, LEB128 `uvar`, zigzag `svar`. Floats: f32/f64. Fixed point: `q`.
 * - `StringTable` interns strings to small integer ids. A static prefix (content ids, enum names,
 *   common keys) is known to both peers up front; dynamic entries are defined on the wire.
 * - `writeValue`/`readValue`: a compact self-describing encoding for plain JSON-like data (commands,
 *   events, player state, level metadata) that keeps working when other workstreams add fields.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const TWO_31 = 2147483648;

export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  pos = 0;

  constructor(initialCapacity = 1024) {
    this.buf = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buf.buffer);
  }

  reset(): this {
    this.pos = 0;
    return this;
  }

  get capacity(): number {
    return this.buf.length;
  }

  private grow(need: number): void {
    let cap = this.buf.length * 2;
    while (cap < this.pos + need) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.pos));
    this.buf = nb;
    this.view = new DataView(nb.buffer);
  }

  ensure(n: number): void {
    if (this.pos + n > this.buf.length) this.grow(n);
  }

  u8(v: number): void {
    if (this.pos + 1 > this.buf.length) this.grow(1);
    this.buf[this.pos++] = v;
  }

  i8(v: number): void {
    this.u8(v & 0xff);
  }

  u16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
  }

  u32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, v >>> 0, true);
    this.pos += 4;
  }

  f32(v: number): void {
    this.ensure(4);
    this.view.setFloat32(this.pos, v, true);
    this.pos += 4;
  }

  f64(v: number): void {
    this.ensure(8);
    this.view.setFloat64(this.pos, v, true);
    this.pos += 8;
  }

  bool(v: boolean): void {
    this.u8(v ? 1 : 0);
  }

  /** Unsigned LEB128 varint (0 .. 2^53). */
  uvar(v: number): void {
    this.ensure(8);
    const b = this.buf;
    if (v < TWO_31) {
      while (v >= 0x80) {
        b[this.pos++] = (v & 0x7f) | 0x80;
        v >>>= 7;
      }
      b[this.pos++] = v;
      return;
    }
    // Slow path for big values (rare): arithmetic instead of 32-bit ops.
    this.ensure(10);
    while (v >= 0x80) {
      b[this.pos++] = (v % 128) | 0x80;
      v = Math.floor(v / 128);
    }
    b[this.pos++] = v;
  }

  /** Zigzag signed varint. */
  svar(v: number): void {
    this.uvar(zigzag(v));
  }

  /** Quantized fixed point: round(v * scale) as svar. */
  q(v: number, scale: number): void {
    this.svar(Math.round(v * scale));
  }

  /**
   * Number that is exact for any double: small integers cost 1–4 bytes, everything else 9.
   * Layout: uvar(zigzag(int) * 2) for |int| < 2^28, otherwise uvar(1) + f64.
   */
  num(v: number): void {
    if (Number.isInteger(v) && v > -268435456 && v < 268435456 && !Object.is(v, -0)) this.uvar(zigzag(v) * 2);
    else {
      this.u8(1);
      this.f64(v);
    }
  }

  bytes(src: Uint8Array): void {
    this.ensure(src.length);
    this.buf.set(src, this.pos);
    this.pos += src.length;
  }

  /** Length-prefixed byte blob. */
  blob(src: Uint8Array): void {
    this.uvar(src.length);
    this.bytes(src);
  }

  /** Length-prefixed UTF-8 string (ASCII fast path). */
  str(s: string): void {
    const n = s.length;
    let ascii = true;
    for (let i = 0; i < n; i++) {
      if (s.charCodeAt(i) > 0x7f) {
        ascii = false;
        break;
      }
    }
    if (ascii) {
      this.uvar(n);
      this.ensure(n);
      for (let i = 0; i < n; i++) this.buf[this.pos++] = s.charCodeAt(i);
      return;
    }
    const enc = textEncoder.encode(s);
    this.uvar(enc.length);
    this.bytes(enc);
  }

  /** Reserve `n` bytes to be patched later; returns their offset. */
  reserve(n: number): number {
    this.ensure(n);
    const at = this.pos;
    this.pos += n;
    return at;
  }

  patchU8(at: number, v: number): void {
    this.buf[at] = v;
  }

  patchU16(at: number, v: number): void {
    this.view.setUint16(at, v, true);
  }

  /** View of the written bytes; valid until the next write or reset. */
  finish(): Uint8Array {
    return this.buf.subarray(0, this.pos);
  }

  /** Owned copy of the written bytes. */
  copy(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

export class ByteReader {
  private buf: Uint8Array;
  private view: DataView;
  pos = 0;
  end = 0;

  constructor(data: Uint8Array = new Uint8Array(0)) {
    this.buf = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.end = data.length;
  }

  /** Point the reader at new data (allocation-free for repeated use). */
  reset(data: Uint8Array): this {
    this.buf = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.pos = 0;
    this.end = data.length;
    return this;
  }

  get remaining(): number {
    return this.end - this.pos;
  }

  private need(n: number): void {
    if (this.pos + n > this.end) throw new RangeError('ByteReader: read past end');
  }

  u8(): number {
    if (this.pos >= this.end) throw new RangeError('ByteReader: read past end');
    return this.buf[this.pos++]!;
  }

  i8(): number {
    const v = this.u8();
    return v > 127 ? v - 256 : v;
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f32(): number {
    this.need(4);
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  uvar(): number {
    const b = this.buf;
    let result = 0;
    let shift = 0;
    let mul = 1;
    for (;;) {
      if (this.pos >= this.end) throw new RangeError('ByteReader: truncated varint');
      const byte = b[this.pos++]!;
      if (shift < 28) result |= (byte & 0x7f) << shift;
      else result += (byte & 0x7f) * mul;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      mul = 2 ** shift;
      if (shift > 63) throw new RangeError('ByteReader: varint too long');
    }
    return result;
  }

  svar(): number {
    return unzigzag(this.uvar());
  }

  q(scale: number): number {
    return this.svar() / scale;
  }

  num(): number {
    const u = this.uvar();
    if (u === 1) return this.f64();
    return unzigzag(u / 2);
  }

  bytes(n: number): Uint8Array {
    this.need(n);
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  /** Length-prefixed blob (a view into the packet; copy it if you keep it). */
  blob(): Uint8Array {
    return this.bytes(this.uvar());
  }

  str(): string {
    const n = this.uvar();
    this.need(n);
    const b = this.buf;
    let ascii = true;
    for (let i = 0; i < n; i++) {
      if (b[this.pos + i]! > 0x7f) {
        ascii = false;
        break;
      }
    }
    let s: string;
    if (ascii) {
      s = '';
      for (let i = 0; i < n; i++) s += String.fromCharCode(b[this.pos + i]!);
    } else s = textDecoder.decode(b.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }
}

export function zigzag(v: number): number {
  if (v >= -1073741824 && v < 1073741824) return ((v << 1) ^ (v >> 31)) >>> 0;
  return v >= 0 ? v * 2 : -v * 2 - 1;
}

export function unzigzag(u: number): number {
  if (u < TWO_31 * 2 && u >= 0 && u <= 0xffffffff) return (u >>> 1) ^ -(u & 1);
  return u % 2 === 0 ? u / 2 : -(u + 1) / 2;
}

/** Pack up to 32 booleans into an integer (bit i = flags[i]). */
export function packBits(...flags: boolean[]): number {
  let v = 0;
  for (let i = 0; i < flags.length; i++) if (flags[i]) v |= 1 << i;
  return v >>> 0;
}

export function bit(v: number, i: number): boolean {
  return ((v >>> i) & 1) === 1;
}

/** Byte-wise equality of two arrays. */
export function bytesEqual(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** FNV-1a 32-bit hash of strings (used to check both peers share the same static string table). */
export function fnv1a(parts: readonly string[]): number {
  let h = 0x811c9dc5;
  for (const s of parts) {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------------------------
// String interning
// ---------------------------------------------------------------------------------------------

/**
 * Interns strings to small ids. Id 0 is always the empty string. Ids `< staticCount` come from the
 * static list both peers build identically; higher ids are dynamic and must be defined on the wire
 * (see `StringSink`). The host owns the authoritative dynamic id space.
 */
export class StringTable {
  private ids = new Map<string, number>();
  private strs: string[] = [];
  readonly staticCount: number;
  readonly hash: number;

  constructor(statics: readonly string[]) {
    this.add('');
    for (const s of statics) if (!this.ids.has(s)) this.add(s);
    this.staticCount = this.strs.length;
    this.hash = fnv1a(this.strs);
  }

  private add(s: string): number {
    const id = this.strs.length;
    this.strs.push(s);
    this.ids.set(s, id);
    return id;
  }

  get size(): number {
    return this.strs.length;
  }

  /** Id for `s`, interning it as a dynamic string if new (host side). */
  intern(s: string): number {
    const id = this.ids.get(s);
    return id !== undefined ? id : this.add(s);
  }

  /** Existing id or -1. */
  find(s: string): number {
    return this.ids.get(s) ?? -1;
  }

  get(id: number): string {
    const s = this.strs[id];
    if (s === undefined) throw new RangeError(`StringTable: unknown string id ${id}`);
    return s;
  }

  has(id: number): boolean {
    return id >= 0 && id < this.strs.length && this.strs[id] !== undefined;
  }

  /** Client side: record a dynamic definition received from the host. */
  define(id: number, s: string): void {
    if (id < this.staticCount) return;
    const prev = this.strs[id];
    if (prev === s) return;
    if (prev !== undefined) this.ids.delete(prev);
    while (this.strs.length < id) this.strs.push(undefined as unknown as string);
    this.strs[id] = s;
    this.ids.set(s, id);
  }
}

/**
 * Write-side string context. `idFor` returns the id to put on the wire, or -1 to write the string
 * inline. Host sinks intern (and remember which dynamic ids a message used so the encoder can
 * prepend definitions); client sinks only use static ids because the host owns the id space.
 */
export interface StringSink {
  readonly table: StringTable;
  idFor(s: string): number;
}

/** Host-side sink: interns everything and collects referenced dynamic ids (dedup, first-use order). */
export class CollectingSink implements StringSink {
  readonly used: number[] = [];
  private seen = new Set<number>();
  constructor(readonly table: StringTable) {}
  idFor(s: string): number {
    const id = this.table.intern(s);
    if (id >= this.table.staticCount && !this.seen.has(id)) {
      this.seen.add(id);
      this.used.push(id);
    }
    return id;
  }
  clear(): void {
    this.used.length = 0;
    this.seen.clear();
  }
}

/** Client-side sink: static ids only, everything else inline. */
export class StaticSink implements StringSink {
  constructor(readonly table: StringTable) {}
  idFor(s: string): number {
    const id = this.table.find(s);
    return id >= 0 && id < this.table.staticCount ? id : -1;
  }
}

/** Write a string as `uvar(id + 1)`, or `uvar(0)` + inline UTF-8 when the sink has no id for it. */
export function writeStrId(w: ByteWriter, s: string, sink: StringSink): void {
  const id = internable(s) ? sink.idFor(s) : -1;
  if (id >= 0) w.uvar(id + 1);
  else {
    w.uvar(0);
    w.str(s);
  }
}

export function readStrId(r: ByteReader, table: StringTable): string {
  const id = r.uvar();
  return id === 0 ? r.str() : table.get(id - 1);
}

/** Write definitions for dynamic ids: uvar count, (uvar id, str)*. */
export function writeStringDefs(w: ByteWriter, table: StringTable, ids: readonly number[]): void {
  w.uvar(ids.length);
  for (const id of ids) {
    w.uvar(id);
    w.str(table.get(id));
  }
}

export function readStringDefs(r: ByteReader, table: StringTable): void {
  const n = r.uvar();
  for (let i = 0; i < n; i++) {
    const id = r.uvar();
    table.define(id, r.str());
  }
}

// ---------------------------------------------------------------------------------------------
// Generic value codec
// ---------------------------------------------------------------------------------------------

const T_UNDEF = 0;
const T_NULL = 1;
const T_FALSE = 2;
const T_TRUE = 3;
const T_INT = 4;
const T_F64 = 5;
const T_STR = 6;
const T_ARR = 7;
const T_OBJ = 8;
const T_BYTES = 9;
const T_F32 = 10;

/** Strings longer than this (or with spaces) are written inline instead of interned. */
const MAX_INTERN_LEN = 24;

function internable(s: string): boolean {
  return s.length <= MAX_INTERN_LEN && s.indexOf(' ') < 0;
}

/**
 * Encode plain data (undefined/null/boolean/number/string/array/plain object/Uint8Array).
 * Object keys with `undefined` values are skipped. `lossy` writes non-integer numbers as f32
 * (presentation data such as event positions); otherwise numbers round-trip exactly.
 */
export function writeValue(w: ByteWriter, v: unknown, sink: StringSink, lossy = false): void {
  switch (typeof v) {
    case 'undefined':
      w.u8(T_UNDEF);
      return;
    case 'boolean':
      w.u8(v ? T_TRUE : T_FALSE);
      return;
    case 'number':
      if (Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER && !Object.is(v, -0)) {
        w.u8(T_INT);
        w.svar(v);
      } else if (lossy) {
        w.u8(T_F32);
        w.f32(v);
      } else {
        w.u8(T_F64);
        w.f64(v);
      }
      return;
    case 'string':
      w.u8(T_STR);
      writeStrId(w, v, sink);
      return;
    case 'object': {
      if (v === null) {
        w.u8(T_NULL);
        return;
      }
      if (Array.isArray(v)) {
        w.u8(T_ARR);
        w.uvar(v.length);
        for (let i = 0; i < v.length; i++) writeValue(w, v[i], sink, lossy);
        return;
      }
      if (v instanceof Uint8Array) {
        w.u8(T_BYTES);
        w.blob(v);
        return;
      }
      const obj = v as Record<string, unknown>;
      let n = 0;
      for (const k in obj) if (obj[k] !== undefined && typeof obj[k] !== 'function') n++;
      w.u8(T_OBJ);
      w.uvar(n);
      for (const k in obj) {
        const val = obj[k];
        if (val === undefined || typeof val === 'function') continue;
        writeStrId(w, k, sink);
        writeValue(w, val, sink, lossy);
      }
      return;
    }
    default:
      // functions / symbols / bigint are not plain data; encode as undefined.
      w.u8(T_UNDEF);
  }
}

export function readValue(r: ByteReader, table: StringTable): unknown {
  const tag = r.u8();
  switch (tag) {
    case T_UNDEF:
      return undefined;
    case T_NULL:
      return null;
    case T_FALSE:
      return false;
    case T_TRUE:
      return true;
    case T_INT:
      return r.svar();
    case T_F64:
      return r.f64();
    case T_F32:
      return r.f32();
    case T_STR:
      return readStrId(r, table);
    case T_ARR: {
      const n = r.uvar();
      if (n > r.remaining) throw new RangeError('readValue: bad array length');
      const out: unknown[] = new Array(n);
      for (let i = 0; i < n; i++) out[i] = readValue(r, table);
      return out;
    }
    case T_OBJ: {
      const n = r.uvar();
      if (n > r.remaining) throw new RangeError('readValue: bad object size');
      const out: Record<string, unknown> = {};
      for (let i = 0; i < n; i++) {
        const k = readStrId(r, table);
        const val = readValue(r, table);
        // Untrusted input: never let a peer set an object's prototype.
        if (k !== '__proto__') out[k] = val;
      }
      return out;
    }
    case T_BYTES:
      return r.blob().slice();
    default:
      throw new RangeError(`readValue: bad tag ${tag}`);
  }
}

/** Convenience: encode a value with a throwaway sink into an owned buffer. */
export function encodeValue(v: unknown, table: StringTable, lossy = false): { bytes: Uint8Array; dynIds: number[] } {
  const w = new ByteWriter(256);
  const sink = new CollectingSink(table);
  writeValue(w, v, sink, lossy);
  return { bytes: w.copy(), dynIds: sink.used.slice() };
}
