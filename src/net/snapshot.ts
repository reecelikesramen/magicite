import type { StatusId } from '../content/types';
import type { Entity } from '../sim/types';
import type { World } from '../sim/world';
import type { ByteReader, ByteWriter, StringTable } from './codec';

/**
 * Schema-driven entity sync.
 *
 * Every synced entity property is one line in `ENTITY_FIELDS`. A field turns an entity property
 * (dot path, e.g. `'swing.ticks'`) into one quantized int32 and back, so a whole world snapshot is
 * a flat `Int32Array` of rows (`EntityFrame`) that can be diffed and delta-encoded without
 * allocating per entity. Strings become interned ids, optional components a presence bit.
 *
 * Wire format of an entity section (delta vs the client's acked baseline, or vs all-zero rows):
 *   uvar nRemoved, uvar idDelta × nRemoved          (ids in the baseline that left the interest set)
 *   ( uvar idDelta>0, uvar groupMask, u8 fieldMask × popcount(groupMask), values… )*  uvar 0
 * An entry whose id is in the baseline is an update, otherwise a create. Values per field kind:
 *   q/int → svar(cur − base) · bool/comp → nothing (a set bit flips it) · str/mask → uvar(cur).
 * Fields are grouped by 8 with the hottest (x, y, vx, vy, facing, onGround, anim, hp) first, so a
 * moving entity costs: id(1) + groupMask(1) + fieldMask(1) + ~4–8 bytes of deltas.
 */

export type FieldKind = 'q' | 'int' | 'bool' | 'str' | 'mask' | 'comp';

export interface FieldSpec {
  readonly key: string;
  readonly kind: FieldKind;
  /** Fixed-point scale for 'q' (wire value = round(v * scale)). */
  readonly scale: number;
  /** Only sent when the entity is created (the client advances it locally, e.g. `age`). */
  readonly createOnly: boolean;
  /** Interpolated between snapshots on the client (positions). */
  readonly lerp: boolean;
  /** Entity → wire int (host). May intern strings into `s`. */
  get(e: Entity, s: StringTable): number;
  /** Wire int → entity (client). */
  set(e: Entity, v: number, s: StringTable): void;
}

type Rec = Record<string, unknown>;
interface FieldOpts {
  lerp?: boolean;
  createOnly?: boolean;
}

function readPath(path: string): (e: Rec) => unknown {
  const segs = path.split('.');
  if (segs.length === 1) {
    const a = segs[0]!;
    return (e) => e[a];
  }
  if (segs.length === 2) {
    const [a, b] = segs as [string, string];
    return (e) => (e[a] as Rec | undefined)?.[b];
  }
  return (e) => {
    let o: unknown = e;
    for (const s of segs) {
      if (o === null || o === undefined) return undefined;
      o = (o as Rec)[s];
    }
    return o;
  };
}

/** Writes only if the parent object exists (component sub-fields need their `comp` field first). */
function writePath(path: string): (e: Rec, v: unknown) => void {
  const segs = path.split('.');
  const last = segs[segs.length - 1]!;
  if (segs.length === 1) return (e, v) => void (e[last] = v);
  const parents = segs.slice(0, -1);
  return (e, v) => {
    let o: unknown = e;
    for (const s of parents) {
      if (o === null || o === undefined) return;
      o = (o as Rec)[s];
    }
    if (o !== null && o !== undefined) (o as Rec)[last] = v;
  };
}

/** String → interned id with a one-entry cache (consecutive entities often share kind/def/anim). */
function internCached(): (v: unknown, s: StringTable) => number {
  let lastStr = '';
  let lastId = 0;
  let lastTable: StringTable | null = null;
  return (v, s) => {
    if (typeof v !== 'string' || v.length === 0) return 0;
    if (v === lastStr && s === lastTable) return lastId;
    lastId = s.intern(v);
    lastStr = v;
    lastTable = s;
    return lastId;
  };
}

function spec(key: string, kind: FieldKind, scale: number, opts: FieldOpts, get: FieldSpec['get'], set: FieldSpec['set']): FieldSpec {
  return { key, kind, scale, createOnly: !!opts.createOnly, lerp: !!opts.lerp, get, set };
}

/** Status ids synced as a bitmask (unknown ids are not shown on remote clients). */
export const STATUS_IDS: readonly StatusId[] = ['burn', 'poison', 'freeze', 'slow', 'stun', 'bleed', 'regen', 'haste', 'shield', 'weak'];
const STATUS_BIT = new Map<string, number>(STATUS_IDS.map((s, i) => [s, i]));

/** Field builders: each returns one FieldSpec. */
export const F = {
  /** Fixed-point number (positions, hp…). */
  q(path: string, scale: number, opts: FieldOpts = {}): FieldSpec {
    const r = readPath(path);
    const w = writePath(path);
    return spec(path, 'q', scale, opts, (e) => {
      const v = r(e as unknown as Rec);
      return typeof v === 'number' ? Math.round(v * scale) : 0;
    }, (e, v) => w(e as unknown as Rec, v / scale));
  },
  /** Integer (timers, ids, colours). */
  int(path: string, opts: FieldOpts = {}): FieldSpec {
    const r = readPath(path);
    const w = writePath(path);
    return spec(path, 'int', 1, opts, (e) => {
      const v = r(e as unknown as Rec);
      return typeof v === 'number' ? Math.round(v) : 0;
    }, (e, v) => w(e as unknown as Rec, v));
  },
  /** Optional integer: undefined ↔ 0 on the wire, n ↔ n + 1. */
  optInt(path: string, opts: FieldOpts = {}): FieldSpec {
    const r = readPath(path);
    const w = writePath(path);
    return spec(path, 'int', 1, opts, (e) => {
      const v = r(e as unknown as Rec);
      return typeof v === 'number' ? Math.round(v) + 1 : 0;
    }, (e, v) => w(e as unknown as Rec, v === 0 ? undefined : v - 1));
  },
  bool(path: string, opts: FieldOpts = {}): FieldSpec {
    const r = readPath(path);
    const w = writePath(path);
    return spec(path, 'bool', 1, opts, (e) => (r(e as unknown as Rec) ? 1 : 0), (e, v) => w(e as unknown as Rec, v !== 0));
  },
  /** ±1 stored as one bit (1 = negative). */
  sign(path: string, opts: FieldOpts = {}): FieldSpec {
    const r = readPath(path);
    const w = writePath(path);
    return spec(path, 'bool', 1, opts, (e) => ((r(e as unknown as Rec) as number) < 0 ? 1 : 0), (e, v) => w(e as unknown as Rec, v !== 0 ? -1 : 1));
  },
  /** Interned string; '' and undefined both encode as 0 and decode as ''. */
  str(path: string, opts: FieldOpts = {}): FieldSpec {
    const r = readPath(path);
    const w = writePath(path);
    const intern = internCached();
    return spec(path, 'str', 1, opts, (e, s) => intern(r(e as unknown as Rec), s), (e, v, s) => w(e as unknown as Rec, s.get(v)));
  },
  /** Optional interned string: 0 decodes as undefined. */
  optStr(path: string, opts: FieldOpts = {}): FieldSpec {
    const r = readPath(path);
    const w = writePath(path);
    const intern = internCached();
    return spec(path, 'str', 1, opts, (e, s) => intern(r(e as unknown as Rec), s), (e, v, s) => w(e as unknown as Rec, v === 0 ? undefined : s.get(v)));
  },
  /** StatusEffect[] → bitmask of STATUS_IDS (remote clients only need which effects are active). */
  statusMask(path: string): FieldSpec {
    const r = readPath(path);
    const w = writePath(path);
    return spec(path, 'mask', 1, {}, (e) => {
      const list = r(e as unknown as Rec) as { id: string }[] | undefined;
      if (!list || list.length === 0) return 0;
      let m = 0;
      for (const st of list) {
        const b = STATUS_BIT.get(st.id);
        if (b !== undefined) m |= 1 << b;
      }
      return m;
    }, (e, v) => {
      const list = r(e as unknown as Rec) as { id: string }[] | undefined;
      let cur = 0;
      if (list) for (const st of list) cur |= 1 << (STATUS_BIT.get(st.id) ?? 31);
      if (cur === v && list) return;
      const out: Entity['status'] = [];
      for (let i = 0; i < STATUS_IDS.length; i++) if (v & (1 << i)) out.push({ id: STATUS_IDS[i]!, ticks: 1, power: 0, source: 0 });
      w(e as unknown as Rec, out);
    });
  },
  /** Optional component presence. Must precede its sub-fields in the table. */
  comp(path: string, factory: () => object): FieldSpec {
    const r = readPath(path);
    const w = writePath(path);
    return spec(path, 'comp', 1, {}, (e) => (r(e as unknown as Rec) ? 1 : 0), (e, v) => {
      const has = !!r(e as unknown as Rec);
      if (v !== 0 && !has) w(e as unknown as Rec, factory());
      else if (v === 0 && has) w(e as unknown as Rec, undefined);
    });
  },
};

/**
 * THE entity sync table. Order matters: (1) the first 8 fields are the per-tick hot set,
 * (2) a `comp` field must come before its sub-fields. Adding a field = adding one line.
 */
export const ENTITY_FIELDS: readonly FieldSpec[] = [
  // group 0 — hot
  F.q('x', 16, { lerp: true }),
  F.q('y', 16, { lerp: true }),
  F.q('vx', 2),
  F.q('vy', 2),
  F.sign('facing'),
  F.bool('onGround'),
  F.str('anim'),
  F.q('hp', 16),
  // group 1
  F.int('invuln'),
  F.int('hurt'),
  F.optStr('held'),
  F.statusMask('status'),
  F.q('maxHp', 16),
  F.bool('inLiquid'),
  F.comp('swing', () => ({ ticks: 0, total: 0, angle: 0, hit: [], item: '' })),
  F.int('swing.ticks'),
  // group 2
  F.int('swing.total'),
  F.q('swing.angle', 1024),
  F.str('swing.item'),
  F.str('kind'),
  F.str('def'),
  F.str('team'),
  F.q('w', 16),
  F.q('h', 16),
  // group 3
  F.optInt('playerIndex'),
  F.optInt('owner'),
  F.int('age', { createOnly: true }),
  F.comp('light', () => ({ radius: 0, color: 0, intensity: 0 })),
  F.q('light.radius', 4),
  F.int('light.color'),
  F.q('light.intensity', 256),
  F.q('light.flicker', 256),
  // group 4
  F.comp('resource', () => ({ def: '', hitFlash: 0 })),
  F.str('resource.def'),
  F.int('resource.hitFlash'),
  F.comp('pickup', () => ({ item: { id: '', count: 0 }, delay: 0, gold: 0 })),
  F.str('pickup.item.id'),
  F.int('pickup.item.count'),
  F.int('pickup.gold'),
  F.comp('projectile', () => ({ def: '', owner: 0, team: 'neutral', damage: 0, life: 0, pierceLeft: 0, bouncesLeft: 0, hit: [], sourceItem: '' })),
  // group 5
  F.str('projectile.def'),
  F.int('projectile.owner'),
  F.str('projectile.team'),
  F.comp('ai', () => ({ state: '', t: 0, target: 0, phase: 0, n: {} })),
  F.str('ai.state'),
  F.int('ai.phase'),
];

export const NF = ENTITY_FIELDS.length;
export const NG = Math.ceil(NF / 8);

const F_KIND = new Uint8Array(NF); // 0 = delta int, 1 = flip, 2 = raw uvar
const F_STR = new Uint8Array(NF);
const F_CREATE_ONLY = new Uint8Array(NF);
/** Index of the field's component presence field (-1 = top-level): absent comp ⇒ sub-fields are 0. */
const F_PARENT = new Int16Array(NF).fill(-1);
const fieldIndex = new Map<string, number>();
ENTITY_FIELDS.forEach((f, i) => {
  F_KIND[i] = f.kind === 'q' || f.kind === 'int' ? 0 : f.kind === 'bool' || f.kind === 'comp' ? 1 : 2;
  F_STR[i] = f.kind === 'str' ? 1 : 0;
  F_CREATE_ONLY[i] = f.createOnly ? 1 : 0;
  if (fieldIndex.has(f.key)) throw new Error(`snapshot: duplicate field ${f.key}`);
  // A sub-field must come after its component's presence field.
  const dot = f.key.indexOf('.');
  if (dot > 0) {
    const parent = f.key.slice(0, dot);
    const pi = fieldIndex.get(parent);
    if (pi !== undefined && ENTITY_FIELDS[pi]!.kind !== 'comp') throw new Error(`snapshot: ${parent} is not a comp`);
    if (pi !== undefined) F_PARENT[i] = pi;
  }
  fieldIndex.set(f.key, i);
});

/** Index of a field in a row (throws if unknown). */
export function fieldIdx(key: string): number {
  const i = fieldIndex.get(key);
  if (i === undefined) throw new Error(`snapshot: unknown field ${key}`);
  return i;
}

export const FX = fieldIdx('x');
export const FY = fieldIdx('y');
export const FVX = fieldIdx('vx');
export const FVY = fieldIdx('vy');
export const FKIND = fieldIdx('kind');
export const FW = fieldIdx('w');
export const FH = fieldIdx('h');
export const FPLAYER = fieldIdx('playerIndex');

// ---------------------------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------------------------

/** All synced entities at one tick as flat rows, sorted by id. Pooled and reused. */
export class EntityFrame {
  tick = 0;
  epoch = 0;
  count = 0;
  ids: Int32Array;
  rows: Int32Array;
  /** Host-side interest helpers: entity centre (px) and "always relevant" flag (players, bosses). */
  cx: Float32Array;
  cy: Float32Array;
  always: Uint8Array;

  constructor(capacity = 64) {
    this.ids = new Int32Array(capacity);
    this.rows = new Int32Array(capacity * NF);
    this.cx = new Float32Array(capacity);
    this.cy = new Float32Array(capacity);
    this.always = new Uint8Array(capacity);
  }

  get capacity(): number {
    return this.ids.length;
  }

  ensure(n: number): void {
    if (n <= this.ids.length) return;
    let cap = this.ids.length * 2;
    while (cap < n) cap *= 2;
    const ids = new Int32Array(cap);
    ids.set(this.ids);
    const rows = new Int32Array(cap * NF);
    rows.set(this.rows);
    const cx = new Float32Array(cap);
    cx.set(this.cx);
    const cy = new Float32Array(cap);
    cy.set(this.cy);
    const always = new Uint8Array(cap);
    always.set(this.always);
    this.ids = ids;
    this.rows = rows;
    this.cx = cx;
    this.cy = cy;
    this.always = always;
  }

  /** Binary search; -1 if absent. */
  indexOf(id: number): number {
    let lo = 0;
    let hi = this.count - 1;
    const ids = this.ids;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = ids[mid]!;
      if (v === id) return mid;
      if (v < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  get(i: number, field: number): number {
    return this.rows[i * NF + field]!;
  }

  copyFrom(o: EntityFrame): void {
    this.tick = o.tick;
    this.epoch = o.epoch;
    this.count = o.count;
    this.ensure(o.count);
    this.ids.set(o.ids.subarray(0, o.count));
    this.rows.set(o.rows.subarray(0, o.count * NF));
    this.cx.set(o.cx.subarray(0, o.count));
    this.cy.set(o.cy.subarray(0, o.count));
    this.always.set(o.always.subarray(0, o.count));
  }
}

/** Host: quantize every live entity of the world into `f` (sorted by id). */
export function captureFrame(world: World, f: EntityFrame, strings: StringTable): void {
  const ents = world.entities;
  f.count = 0;
  f.ensure(ents.length);
  const rows = f.rows;
  let sorted = true;
  let last = -Infinity;
  for (let n = 0; n < ents.length; n++) {
    const e = ents[n]!;
    if (e.dead) continue;
    const i = f.count++;
    f.ids[i] = e.id;
    if (e.id <= last) sorted = false;
    last = e.id;
    const off = i * NF;
    for (let k = 0; k < NF; k++) {
      const p = F_PARENT[k]!;
      rows[off + k] = p >= 0 && rows[off + p] === 0 ? 0 : ENTITY_FIELDS[k]!.get(e, strings);
    }
    f.cx[i] = e.x + e.w / 2;
    f.cy[i] = e.y + e.h / 2;
    f.always[i] = e.kind === 'player' || e.kind === 'boss' ? 1 : 0;
  }
  if (!sorted) sortFrame(f);
}

function sortFrame(f: EntityFrame): void {
  const n = f.count;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => f.ids[a]! - f.ids[b]!);
  const ids = f.ids.slice(0, n);
  const rows = f.rows.slice(0, n * NF);
  const cx = f.cx.slice(0, n);
  const cy = f.cy.slice(0, n);
  const al = f.always.slice(0, n);
  for (let i = 0; i < n; i++) {
    const s = order[i]!;
    f.ids[i] = ids[s]!;
    f.rows.set(rows.subarray(s * NF, s * NF + NF), i * NF);
    f.cx[i] = cx[s]!;
    f.cy[i] = cy[s]!;
    f.always[i] = al[s]!;
  }
}

// ---------------------------------------------------------------------------------------------
// Interest management
// ---------------------------------------------------------------------------------------------

export interface InterestArea {
  /** Half extents of the relevance box around the client's player (px). */
  halfW: number;
  halfH: number;
  /** Extra margin for entities the client already has (hysteresis against create/remove churn). */
  margin: number;
}

/**
 * Select indices of `f` relevant to a viewer at (vx, vy): players & bosses always, others inside
 * the box. `prev` (ids the client had last time, sorted) get the larger box. Returns the count.
 */
export function selectInterest(
  f: EntityFrame, vx: number, vy: number, area: InterestArea,
  prevFrame: EntityFrame | null, prevInc: Int32Array | null, prevCount: number, out: Int32Array,
): number {
  let n = 0;
  let pj = 0;
  const hw = area.halfW;
  const hh = area.halfH;
  const hw2 = hw + area.margin;
  const hh2 = hh + area.margin;
  for (let i = 0; i < f.count; i++) {
    const id = f.ids[i]!;
    if (f.always[i]) {
      out[n++] = i;
      continue;
    }
    let had = false;
    if (prevFrame && prevInc) {
      while (pj < prevCount && prevFrame.ids[prevInc[pj]!]! < id) pj++;
      had = pj < prevCount && prevFrame.ids[prevInc[pj]!] === id;
    }
    const dx = Math.abs(f.cx[i]! - vx);
    const dy = Math.abs(f.cy[i]! - vy);
    if (had ? dx <= hw2 && dy <= hh2 : dx <= hw && dy <= hh) out[n++] = i;
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// Entity delta encode / decode
// ---------------------------------------------------------------------------------------------

const masks = new Uint8Array(NG);
let removedScratch = new Int32Array(256);

/**
 * Write the entity section for one client.
 * `inc`/`incCount`: indices into `f` (ascending ids). `bf`/`binc`/`bcount`: the baseline frame and
 * the indices the client had at that baseline (null = no baseline → everything is a create).
 * `need(id)` is called for every dynamic string id written.
 */
export function writeEntityDelta(
  w: ByteWriter, f: EntityFrame, inc: Int32Array, incCount: number,
  bf: EntityFrame | null, binc: Int32Array | null, bcount: number,
  need: (strId: number) => void, staticCount: number,
): void {
  const rows = f.rows;
  // Removed: in baseline but not in the current set.
  let nRem = 0;
  if (bf && binc) {
    let ci = 0;
    for (let bj = 0; bj < bcount; bj++) {
      const id = bf.ids[binc[bj]!]!;
      while (ci < incCount && f.ids[inc[ci]!]! < id) ci++;
      if (ci < incCount && f.ids[inc[ci]!] === id) continue;
      if (nRem >= removedScratch.length) {
        const g = new Int32Array(removedScratch.length * 2);
        g.set(removedScratch);
        removedScratch = g;
      }
      removedScratch[nRem++] = id;
    }
  }
  w.uvar(nRem);
  let prev = 0;
  for (let i = 0; i < nRem; i++) {
    const id = removedScratch[i]!;
    w.uvar(id - prev);
    prev = id;
  }

  // Creates and updates, ascending id.
  prev = 0;
  let bj = 0;
  const brows = bf ? bf.rows : null;
  for (let c = 0; c < incCount; c++) {
    const fi = inc[c]!;
    const id = f.ids[fi]!;
    let boff = -1;
    if (bf && binc) {
      while (bj < bcount && bf.ids[binc[bj]!]! < id) bj++;
      if (bj < bcount && bf.ids[binc[bj]!] === id) boff = binc[bj]! * NF;
    }
    const create = boff < 0;
    const off = fi * NF;
    let gm = 0;
    for (let g = 0; g < NG; g++) {
      let m = 0;
      const k0 = g * 8;
      const k1 = Math.min(NF, k0 + 8);
      for (let k = k0; k < k1; k++) {
        if (!create && F_CREATE_ONLY[k]) continue;
        const base = create ? 0 : brows![boff + k]!;
        if (rows[off + k] !== base) m |= 1 << (k - k0);
      }
      masks[g] = m;
      if (m) gm |= 1 << g;
    }
    if (gm === 0 && !create) continue;
    w.uvar(id - prev);
    prev = id;
    w.uvar(gm);
    for (let g = 0; g < NG; g++) if (gm & (1 << g)) w.u8(masks[g]!);
    for (let g = 0; g < NG; g++) {
      const m = masks[g]!;
      if (!(gm & (1 << g))) continue;
      const k0 = g * 8;
      for (let j = 0; j < 8; j++) {
        if (!(m & (1 << j))) continue;
        const k = k0 + j;
        const cur = rows[off + k]!;
        const kind = F_KIND[k]!;
        if (kind === 0) w.svar(cur - (create ? 0 : brows![boff + k]!));
        else if (kind === 2) {
          w.uvar(cur >>> 0);
          if (F_STR[k] && cur >= staticCount) need(cur);
        }
      }
    }
  }
  w.uvar(0);
}

let remRead = new Int32Array(256);

/**
 * Decode an entity section into `out` = baseline (or empty) − removed + creates/updates.
 * `base` may be null (full snapshot). `out` must not be `base`.
 */
export function readEntityDelta(r: ByteReader, base: EntityFrame | null, out: EntityFrame): void {
  const nRem = r.uvar();
  if (nRem > r.remaining) throw new RangeError('snapshot: bad removed count');
  if (nRem > remRead.length) remRead = new Int32Array(Math.max(nRem, remRead.length * 2));
  let id = 0;
  for (let i = 0; i < nRem; i++) {
    id += r.uvar();
    remRead[i] = id;
  }
  out.count = 0;
  let bi = 0;
  let ri = 0;
  const bcount = base ? base.count : 0;
  const copyBase = (upTo: number): void => {
    // Copy baseline entries with id < upTo, skipping removed ones.
    while (bi < bcount && base!.ids[bi]! < upTo) {
      const bid = base!.ids[bi]!;
      while (ri < nRem && remRead[ri]! < bid) ri++;
      if (!(ri < nRem && remRead[ri] === bid)) {
        const oi = out.count++;
        out.ensure(out.count);
        out.ids[oi] = bid;
        out.rows.set(base!.rows.subarray(bi * NF, bi * NF + NF), oi * NF);
      }
      bi++;
    }
  };
  id = 0;
  for (;;) {
    const d = r.uvar();
    if (d === 0) break;
    id += d;
    copyBase(id);
    let boff = -1;
    if (bi < bcount && base!.ids[bi] === id) {
      boff = bi * NF;
      bi++;
    }
    const oi = out.count++;
    out.ensure(out.count);
    out.ids[oi] = id;
    const off = oi * NF;
    const rows = out.rows;
    if (boff >= 0) rows.set(base!.rows.subarray(boff, boff + NF), off);
    else rows.fill(0, off, off + NF);
    const gm = r.uvar();
    if (gm >= 1 << NG) throw new RangeError('snapshot: bad group mask');
    for (let g = 0; g < NG; g++) masks[g] = gm & (1 << g) ? r.u8() : 0;
    for (let g = 0; g < NG; g++) {
      const m = masks[g]!;
      if (!m) continue;
      const k0 = g * 8;
      for (let j = 0; j < 8; j++) {
        if (!(m & (1 << j))) continue;
        const k = k0 + j;
        if (k >= NF) throw new RangeError('snapshot: bad field mask');
        const kind = F_KIND[k]!;
        if (kind === 0) rows[off + k] = rows[off + k]! + r.svar();
        else if (kind === 1) rows[off + k] = rows[off + k] ? 0 : 1;
        else rows[off + k] = r.uvar();
      }
    }
  }
  copyBase(Infinity);
}

// ---------------------------------------------------------------------------------------------
// Applying rows to entities (client)
// ---------------------------------------------------------------------------------------------

/** Field indices that are interpolated (positions). */
export const LERP_FIELDS: readonly number[] = ENTITY_FIELDS.flatMap((f, i) => (f.lerp ? [i] : []));

/**
 * Write a row into an entity. `skip` (optional, by field index) leaves fields untouched — used for
 * predicted fields of the local player. createOnly fields are applied only when `created`.
 */
export function applyRow(e: Entity, rows: Int32Array, off: number, strings: StringTable, created: boolean, skip?: Uint8Array): void {
  for (let k = 0; k < NF; k++) {
    if (skip && skip[k]) continue;
    if (F_CREATE_ONLY[k] && !created) continue;
    ENTITY_FIELDS[k]!.set(e, rows[off + k]!, strings);
  }
}

/** Decoded float value of a field from a row. */
export function rowValue(rows: Int32Array, off: number, field: number): number {
  const f = ENTITY_FIELDS[field]!;
  return f.kind === 'q' ? rows[off + field]! / f.scale : rows[off + field]!;
}

/** Mask over field indices from keys. */
export function fieldMask(keys: readonly string[]): Uint8Array {
  const m = new Uint8Array(NF);
  for (const k of keys) {
    const i = fieldIndex.get(k);
    if (i !== undefined) m[i] = 1;
  }
  return m;
}

/** Field indices whose key is `prefix` or starts with `prefix.` (e.g. a component and its sub-fields). */
export function fieldsUnder(prefix: string): number[] {
  const out: number[] = [];
  ENTITY_FIELDS.forEach((f, i) => {
    if (f.key === prefix || f.key.startsWith(`${prefix}.`)) out.push(i);
  });
  return out;
}
