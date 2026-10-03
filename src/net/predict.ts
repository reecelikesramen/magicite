import { groundBelow, integrate } from '../sim/physics';
import { controlPlayer } from '../sim/player/controller';
import type { Entity, PlayerInput, PlayerState } from '../sim/types';
import { emptyInput } from '../sim/types';
import type { World } from '../sim/world';
import type { ByteReader, ByteWriter } from './codec';
import { PREDICTED_PLAYER_KEYS } from './players';

/**
 * Client-side prediction of the local player.
 *
 * The "owner vector" is every number/boolean that `controlPlayer` + physics read or write for one
 * player: entity motion fields, the controller scratch `p.ctl.*`, the button latch `p.prev.*` and
 * `PREDICTED_PLAYER_KEYS`. The host sends it to the owner every snapshot (exact doubles) and the
 * client compares it with what it predicted for that tick; any difference → rewind + replay.
 * The layout is computed by the host from live objects and sent in Welcome, so new `ctl`/`prev`
 * fields added by the player workstream are picked up automatically.
 */
export const PREDICTED_ENTITY_KEYS: readonly string[] = [
  'x', 'y', 'vx', 'vy', 'onGround', 'facing', 'gravityScale', 'usesPlatforms', 'inLiquid', 'onLadder', 'wallDir', 'hitCeiling',
  // i-frame / stagger timers: ticked by statusSystem every tick, read by movement (hurt = knockback stagger).
  'invuln', 'hurt',
];

export interface OwnerLayout {
  /** 'e.x', 'ctl.coyote', 'prev.jump', 'p.stamina' … */
  keys: string[];
  /** true where the value is a boolean (stored as 0/1). */
  bools: boolean[];
}

export function buildOwnerLayout(p: PlayerState, e: Entity): OwnerLayout {
  const keys: string[] = [];
  const bools: boolean[] = [];
  const add = (prefix: string, obj: Record<string, unknown>, names: readonly string[]) => {
    for (const k of names) {
      const v = obj[k];
      if (typeof v !== 'number' && typeof v !== 'boolean') continue;
      keys.push(`${prefix}.${k}`);
      bools.push(typeof v === 'boolean');
    }
  };
  const er = e as unknown as Record<string, unknown>;
  add('e', er, PREDICTED_ENTITY_KEYS);
  add('ctl', p.ctl as unknown as Record<string, unknown>, Object.keys(p.ctl));
  add('prev', p.prev as unknown as Record<string, unknown>, Object.keys(p.prev));
  add('p', p as unknown as Record<string, unknown>, PREDICTED_PLAYER_KEYS);
  return { keys, bools };
}

const SECT_E = 0;
const SECT_CTL = 1;
const SECT_PREV = 2;
const SECT_P = 3;

/** Compiled accessors for an OwnerLayout. */
export class OwnerAccess {
  readonly n: number;
  private sect: Uint8Array;
  private names: string[];
  private bools: Uint8Array;
  /** Index of e.x / e.y in the vector (for correction smoothing). */
  readonly ix: number;
  readonly iy: number;

  constructor(readonly layout: OwnerLayout) {
    this.n = layout.keys.length;
    this.sect = new Uint8Array(this.n);
    this.bools = new Uint8Array(this.n);
    this.names = [];
    layout.keys.forEach((key, i) => {
      const dot = key.indexOf('.');
      const s = key.slice(0, dot);
      this.sect[i] = s === 'e' ? SECT_E : s === 'ctl' ? SECT_CTL : s === 'prev' ? SECT_PREV : SECT_P;
      this.names.push(key.slice(dot + 1));
      this.bools[i] = layout.bools[i] ? 1 : 0;
    });
    this.ix = layout.keys.indexOf('e.x');
    this.iy = layout.keys.indexOf('e.y');
  }

  private obj(i: number, p: PlayerState, e: Entity): Record<string, unknown> {
    const s = this.sect[i];
    return (s === SECT_E ? e : s === SECT_CTL ? p.ctl : s === SECT_PREV ? p.prev : p) as unknown as Record<string, unknown>;
  }

  capture(p: PlayerState, e: Entity, out: Float64Array, off = 0): void {
    for (let i = 0; i < this.n; i++) {
      const v = this.obj(i, p, e)[this.names[i]!];
      out[off + i] = typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : 0;
    }
  }

  restore(p: PlayerState, e: Entity, src: Float64Array, off = 0): void {
    for (let i = 0; i < this.n; i++) {
      const v = src[off + i]!;
      if (Number.isNaN(v)) continue;
      this.obj(i, p, e)[this.names[i]!] = this.bools[i] ? v !== 0 : v;
    }
  }

  /** Exact comparison of two vectors (NaN in `a` = unknown → unequal). */
  equal(a: Float64Array, aOff: number, b: Float64Array, bOff: number): boolean {
    for (let i = 0; i < this.n; i++) if (a[aOff + i] !== b[bOff + i]) return false;
    return true;
  }
}

const fm = new Uint8Array(32);

/** Delta of an owner vector vs a baseline (NaN-filled = unknown): group/field masks + exact numbers. */
export function writeOwnerDelta(w: ByteWriter, cur: Float64Array, base: Float64Array | null): void {
  const n = cur.length;
  const ng = Math.ceil(n / 8);
  if (ng > 31) throw new Error('owner block too large');
  let gm = 0;
  for (let g = 0; g < ng; g++) {
    let m = 0;
    for (let j = 0; j < 8 && g * 8 + j < n; j++) {
      const k = g * 8 + j;
      if (!base || !Object.is(cur[k], base[k])) m |= 1 << j;
    }
    fm[g] = m;
    if (m) gm |= 1 << g;
  }
  w.uvar(gm);
  for (let g = 0; g < ng; g++) if (gm & (1 << g)) w.u8(fm[g]!);
  for (let g = 0; g < ng; g++) {
    if (!(gm & (1 << g))) continue;
    for (let j = 0; j < 8; j++) if (fm[g]! & (1 << j)) w.num(cur[g * 8 + j]!);
  }
}

export function readOwnerDelta(r: ByteReader, base: Float64Array | null, out: Float64Array): void {
  const n = out.length;
  const ng = Math.ceil(n / 8);
  if (base) out.set(base);
  else out.fill(NaN);
  const gm = r.uvar();
  if (ng > 31) throw new RangeError('owner block too large');
  for (let g = 0; g < ng; g++) fm[g] = gm & (1 << g) ? r.u8() : 0;
  for (let g = 0; g < ng; g++) {
    for (let j = 0; j < 8; j++) {
      if (!(fm[g]! & (1 << j))) continue;
      const k = g * 8 + j;
      if (k >= n) throw new RangeError('owner block: bad mask');
      out[k] = r.num();
    }
  }
}

/**
 * One predicted tick for the local player, mirroring the host pipeline for a single player:
 * playerControlSystem → physicsSystem (per-entity branch) → meleeSystem's swing countdown →
 * statusSystem's i-frame/stagger timers → playerInputLatchSystem.
 * Keep in sync with src/sim/physics.ts#physicsSystem and src/sim/combat/status.ts.
 */
export function predictStep(world: World, p: PlayerState, e: Entity, input: PlayerInput): void {
  controlPlayer(world, p, e, input);
  if (!e.dead) {
    if (e.gravityScale === 0 && e.vx === 0 && e.vy === 0) e.onGround = e.collides && groundBelow(world.level.grid, e);
    else integrate(world, e);
  }
  const s = e.swing;
  if (s) {
    s.ticks--;
    if (s.ticks <= 0) e.swing = undefined;
  }
  if (e.invuln > 0) e.invuln--;
  if (e.hurt > 0) e.hurt--;
  latchPrev(p, input);
}

/**
 * The button latch (`p.prev[k] = input[k]`) for every latch field the input carries — booleans and
 * numbers alike (e.g. a numeric dash direction `prev.dash`), so latch fields added by the player
 * workstream are predicted without touching this file.
 */
export function latchPrev(p: PlayerState, input: PlayerInput): void {
  const prev = p.prev as unknown as Record<string, unknown>;
  const inp = input as unknown as Record<string, unknown>;
  for (const k in prev) {
    const v = inp[k];
    if (typeof v === 'boolean' || typeof v === 'number') prev[k] = v;
  }
}

/** Copy every non-command field of an input into `dst` (allocation-free once shapes match). */
export function copyInput(dst: PlayerInput, src: PlayerInput): PlayerInput {
  const d = dst as unknown as Record<string, unknown>;
  const s = src as unknown as Record<string, unknown>;
  for (const k in s) if (k !== 'commands') d[k] = s[k];
  return dst;
}

/** Ring buffer of local inputs and predicted owner vectors, indexed by input tick. */
export class PredictionHistory {
  private ticks: Int32Array;
  private stateTicks: Int32Array;
  private inputs: PlayerInput[];
  readonly states: Float64Array;

  constructor(
    readonly size: number,
    readonly n: number,
  ) {
    this.ticks = new Int32Array(size).fill(-1);
    this.stateTicks = new Int32Array(size).fill(-1);
    this.inputs = Array.from({ length: size }, () => emptyInput());
    this.states = new Float64Array(size * n);
  }

  putInput(tick: number, input: PlayerInput): void {
    const i = tick % this.size;
    this.ticks[i] = tick;
    copyInput(this.inputs[i]!, input);
  }

  input(tick: number): PlayerInput | undefined {
    const i = tick % this.size;
    return this.ticks[i] === tick ? this.inputs[i] : undefined;
  }

  /** Offset into `states` for the state *after* simulating input `tick`; writes mark it present. */
  stateSlot(tick: number): number {
    const i = tick % this.size;
    this.stateTicks[i] = tick;
    return i * this.n;
  }

  /** Offset of a stored state or -1. */
  stateOffset(tick: number): number {
    if (tick < 0) return -1;
    const i = tick % this.size;
    return this.stateTicks[i] === tick ? i * this.n : -1;
  }

  clear(): void {
    this.ticks.fill(-1);
    this.stateTicks.fill(-1);
  }
}
