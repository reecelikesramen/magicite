import type { PlayerCommand, PlayerInput } from '../sim/types';
import { emptyInput } from '../sim/types';
import type { PlayerSetup } from '../sim/world';
import {
  type ByteReader, ByteWriter, CollectingSink, StaticSink, type StringTable, readStringDefs, readValue, writeStringDefs,
  writeValue,
} from './codec';
import type { OwnerLayout } from './predict';

/**
 * Wire protocol. Every packet starts with a u8 message id.
 *
 * Host → client packets then carry a string-definition section (`uvar n, (uvar id, str)*`) for
 * dynamic interned strings the receiver may not know yet, then the body. Client → host packets
 * have no definition section (clients only use static string ids and inline everything else).
 *
 * Channel use:
 *   reliable   — Hello, Welcome, Reject, Commands, LevelChange, TileEdits, PrivateState, WorldState,
 *                Events (important ones), Leave
 *   unreliable — Input (with the last 8 inputs for redundancy + snapshot ack), Snapshot, Ping, Pong
 */
export const PROTOCOL_VERSION = 1;

export const Msg = {
  Hello: 1,
  Welcome: 2,
  Reject: 3,
  Input: 4,
  Commands: 5,
  Snapshot: 6,
  LevelChange: 7,
  TileEdits: 8,
  PrivateState: 9,
  WorldState: 10,
  Events: 11,
  Ping: 12,
  Pong: 13,
  Leave: 14,
} as const;
export type MsgId = (typeof Msg)[keyof typeof Msg];

/** Max inputs carried per Input packet (redundancy against loss). */
export const INPUT_REDUNDANCY = 8;

// ---------------------------------------------------------------------------------------------
// Host envelope (string definitions)
// ---------------------------------------------------------------------------------------------

/**
 * Builds host → client packets. Encode the body into `begin()`, then `finish(type, known)` per
 * recipient: definitions for dynamic ids the recipient doesn't know are prepended.
 */
export class HostEncoder {
  readonly body = new ByteWriter(2048);
  private out = new ByteWriter(2048);
  readonly sink: CollectingSink;
  private defs: number[] = [];

  constructor(readonly table: StringTable) {
    this.sink = new CollectingSink(table);
  }

  begin(): ByteWriter {
    this.body.reset();
    this.sink.clear();
    return this.body;
  }

  /** Dynamic ids used by the current body that are not in `known`. */
  missing(known: ReadonlySet<number>, extra?: readonly number[]): number[] {
    this.defs.length = 0;
    for (const id of this.sink.used) if (!known.has(id)) this.defs.push(id);
    if (extra) for (const id of extra) if (!known.has(id) && !this.defs.includes(id)) this.defs.push(id);
    return this.defs;
  }

  /**
   * Assemble the packet (view valid until the next finish). If `markKnown` (reliable channel), the
   * defined ids are added to `known` right away; otherwise the caller marks them on ack.
   */
  finish(type: MsgId, known: Set<number>, markKnown: boolean, extra?: readonly number[]): Uint8Array {
    const defs = this.missing(known, extra);
    const out = this.out.reset();
    out.u8(type);
    writeStringDefs(out, this.table, defs);
    out.bytes(this.body.finish());
    if (markKnown) for (const id of defs) known.add(id);
    return out.finish();
  }
}

/** Client side: read type + definitions; returns the reader positioned at the body. */
export function openHostPacket(r: ByteReader, data: Uint8Array, table: StringTable): number {
  r.reset(data);
  const type = r.u8();
  readStringDefs(r, table);
  return type;
}

// ---------------------------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------------------------

export interface Hello {
  version: number;
  stringHash: number;
  clientTime: number;
  /** Reconnect token from an earlier Welcome ('' = new player). */
  token: string;
  setup: PlayerSetup;
}

export function encodeHello(h: Hello, table: StringTable): Uint8Array {
  const w = new ByteWriter(256);
  w.u8(Msg.Hello);
  w.uvar(h.version);
  w.u32(h.stringHash);
  w.f64(h.clientTime);
  w.str(h.token);
  writeValue(w, h.setup, new StaticSink(table));
  return w.copy();
}

export function decodeHello(r: ByteReader, table: StringTable): Hello {
  const version = r.uvar();
  const stringHash = r.u32();
  const clientTime = r.f64();
  const token = r.str();
  const setup = sanitizeSetup(readValue(r, table));
  return { version, stringHash, clientTime, token, setup };
}

/** Untrusted setup → a well-formed PlayerSetup. */
export function sanitizeSetup(v: unknown): PlayerSetup {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const s = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');
  const setup: PlayerSetup = { name: s(o.name, 16) || 'DELVER', race: s(o.race, 32), hat: s(o.hat, 32), companion: s(o.companion, 32) };
  if (Array.isArray(o.traits)) setup.traits = o.traits.filter((t): t is string => typeof t === 'string').slice(0, 4).map((t) => t.slice(0, 32));
  const st = o.stats as Record<string, unknown> | undefined;
  if (st && typeof st === 'object') {
    const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(99, Math.round(x))) : 0);
    setup.stats = { hp: n(st.hp), atk: n(st.atk), dex: n(st.dex), mag: n(st.mag), lck: n(st.lck) };
  }
  if (o.difficulty === 'madcap' || o.difficulty === 'normal') setup.difficulty = o.difficulty;
  return setup;
}

export interface Welcome {
  version: number;
  playerIndex: number;
  token: string;
  hostTick: number;
  clientTimeEcho: number;
  seed: number;
  snapshotInterval: number;
  owner: OwnerLayout;
}

export function writeWelcome(w: ByteWriter, m: Welcome, enc: HostEncoder): void {
  w.uvar(m.version);
  w.u8(m.playerIndex);
  w.str(m.token);
  w.uvar(m.hostTick);
  w.f64(m.clientTimeEcho);
  w.u32(m.seed);
  w.u8(m.snapshotInterval);
  writeValue(w, m.owner, enc.sink);
}

export function readWelcome(r: ByteReader, table: StringTable): Welcome {
  const version = r.uvar();
  const playerIndex = r.u8();
  const token = r.str();
  const hostTick = r.uvar();
  const clientTimeEcho = r.f64();
  const seed = r.u32();
  const snapshotInterval = r.u8();
  const owner = readValue(r, table) as OwnerLayout;
  if (!owner || !Array.isArray(owner.keys) || !Array.isArray(owner.bools)) throw new RangeError('welcome: bad owner layout');
  return { version, playerIndex, token, hostTick, clientTimeEcho, seed, snapshotInterval, owner };
}

// ---------------------------------------------------------------------------------------------
// Small messages
// ---------------------------------------------------------------------------------------------

/** Leave (either direction) / Reject (host → client). Host packets carry an empty definition section. */
export function encodeReason(type: typeof Msg.Leave | typeof Msg.Reject, reason: string, fromHost: boolean): Uint8Array {
  const w = new ByteWriter(64);
  w.u8(type);
  if (fromHost) w.uvar(0);
  w.str(reason.slice(0, 200));
  return w.copy();
}

export function encodePing(time: number): Uint8Array {
  const w = new ByteWriter(16);
  w.u8(Msg.Ping);
  w.f64(time);
  return w.copy();
}

/** Pong goes host → client, so it carries an (empty) definition section like every host packet. */
export function encodePong(echo: number, hostTick: number): Uint8Array {
  const w = new ByteWriter(24);
  w.u8(Msg.Pong);
  w.uvar(0);
  w.f64(echo);
  w.uvar(hostTick);
  return w.copy();
}

export function encodeCommands(tick: number, commands: readonly PlayerCommand[], table: StringTable): Uint8Array {
  const w = new ByteWriter(128);
  w.u8(Msg.Commands);
  w.uvar(tick);
  writeValue(w, commands, new StaticSink(table));
  return w.copy();
}

/**
 * Untrusted commands: keep only plain objects with a string `type` (the sim validates the rest).
 * Unknown command types pass through, so commands added by other workstreams keep working.
 */
export function decodeCommands(r: ByteReader, table: StringTable): { tick: number; commands: PlayerCommand[] } {
  const tick = r.uvar();
  const v = readValue(r, table);
  const commands: PlayerCommand[] = [];
  if (Array.isArray(v)) {
    for (const c of v.slice(0, 32)) {
      if (c && typeof c === 'object' && typeof (c as { type?: unknown }).type === 'string') commands.push(c as PlayerCommand);
    }
  }
  return { tick, commands };
}

// ---------------------------------------------------------------------------------------------
// Input packets
// ---------------------------------------------------------------------------------------------

const KNOWN_INPUT_KEYS = new Set(['moveX', 'moveY', 'jump', 'attack', 'alt', 'interact', 'aimX', 'aimY', 'select', 'skill', 'commands']);
const AIM_SCALE = 8;
const MOVE_SCALE = 127;

/**
 * Quantize an input in place exactly as the wire will (the client predicts with the quantized
 * input so host and client simulate identical values).
 */
export function quantizeInput(inp: PlayerInput): PlayerInput {
  inp.moveX = Math.round(Math.max(-1, Math.min(1, inp.moveX || 0)) * MOVE_SCALE) / MOVE_SCALE;
  inp.moveY = Math.round(Math.max(-1, Math.min(1, inp.moveY || 0)) * MOVE_SCALE) / MOVE_SCALE;
  inp.aimX = Math.round((inp.aimX || 0) * AIM_SCALE) / AIM_SCALE;
  inp.aimY = Math.round((inp.aimY || 0) * AIM_SCALE) / AIM_SCALE;
  inp.select = Math.max(-1, Math.min(126, Math.round(inp.select)));
  inp.skill = Math.max(-1, Math.min(126, Math.round(inp.skill)));
  return inp;
}

const NEUTRAL: PlayerInput = emptyInput();

function writeOneInput(w: ByteWriter, inp: PlayerInput, prev: PlayerInput, sink: StaticSink): void {
  const mx = Math.round(inp.moveX * MOVE_SCALE);
  const my = Math.round(inp.moveY * MOVE_SCALE);
  const ax = Math.round(inp.aimX * AIM_SCALE);
  const ay = Math.round(inp.aimY * AIM_SCALE);
  const pax = Math.round(prev.aimX * AIM_SCALE);
  const pay = Math.round(prev.aimY * AIM_SCALE);
  const moveChanged = mx !== Math.round(prev.moveX * MOVE_SCALE) || my !== Math.round(prev.moveY * MOVE_SCALE);
  const aimChanged = ax !== pax || ay !== pay;
  const selChanged = inp.select !== prev.select || inp.skill !== prev.skill;
  const ir = inp as unknown as Record<string, unknown>;
  const pr = prev as unknown as Record<string, unknown>;
  let extras = 0;
  for (const k in ir) if (!KNOWN_INPUT_KEYS.has(k) && ir[k] !== pr[k]) extras++;
  let flags = 0;
  if (inp.jump) flags |= 1;
  if (inp.attack) flags |= 2;
  if (inp.alt) flags |= 4;
  if (inp.interact) flags |= 8;
  if (moveChanged) flags |= 16;
  if (aimChanged) flags |= 32;
  if (selChanged) flags |= 64;
  if (extras) flags |= 128;
  w.u8(flags);
  if (moveChanged) {
    w.i8(mx);
    w.i8(my);
  }
  if (aimChanged) {
    w.svar(ax - pax);
    w.svar(ay - pay);
  }
  if (selChanged) {
    w.i8(inp.select);
    w.i8(inp.skill);
  }
  if (extras) {
    w.uvar(extras);
    for (const k in ir) {
      if (KNOWN_INPUT_KEYS.has(k) || ir[k] === pr[k]) continue;
      w.str(k);
      writeValue(w, ir[k], sink);
    }
  }
}

function readOneInput(r: ByteReader, out: PlayerInput, prev: PlayerInput, table: StringTable): void {
  const flags = r.u8();
  // Start from prev (delta coding), then apply.
  const o = out as unknown as Record<string, unknown>;
  const p = prev as unknown as Record<string, unknown>;
  for (const k in o) if (!(k in p)) delete o[k];
  for (const k in p) if (k !== 'commands') o[k] = p[k];
  out.jump = (flags & 1) !== 0;
  out.attack = (flags & 2) !== 0;
  out.alt = (flags & 4) !== 0;
  out.interact = (flags & 8) !== 0;
  if (flags & 16) {
    out.moveX = r.i8() / MOVE_SCALE;
    out.moveY = r.i8() / MOVE_SCALE;
  }
  if (flags & 32) {
    out.aimX = (Math.round(prev.aimX * AIM_SCALE) + r.svar()) / AIM_SCALE;
    out.aimY = (Math.round(prev.aimY * AIM_SCALE) + r.svar()) / AIM_SCALE;
  }
  if (flags & 64) {
    out.select = r.i8();
    out.skill = r.i8();
  }
  if (flags & 128) {
    const n = r.uvar();
    if (n > 64) throw new RangeError('input: too many extras');
    for (let i = 0; i < n; i++) {
      const k = r.str();
      const v = readValue(r, table);
      if (k === '__proto__' || k === 'commands') continue;
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') o[k] = v;
    }
  }
  out.commands = [];
}

/**
 * Input packet: ack of the newest snapshot + the last `inputs.length` inputs ending at `newestTick`.
 * Consecutive inputs are delta-coded; a typical packet with 8 inputs is ~15–30 bytes.
 */
export function encodeInputPacket(w: ByteWriter, ackTick: number, newestTick: number, inputs: readonly PlayerInput[], table: StringTable): Uint8Array {
  w.reset();
  w.u8(Msg.Input);
  w.uvar(ackTick);
  w.uvar(newestTick);
  w.u8(inputs.length);
  const sink = new StaticSink(table);
  let prev = NEUTRAL;
  for (const inp of inputs) {
    writeOneInput(w, inp, prev, sink);
    prev = inp;
  }
  return w.finish();
}

export interface InputPacket {
  ackTick: number;
  newestTick: number;
  count: number;
}

/**
 * Decode an input packet. `visit(tick, input)` is called oldest → newest with a scratch input
 * object that is reused (copy what you keep).
 */
export function decodeInputPacket(r: ByteReader, table: StringTable, scratch: [PlayerInput, PlayerInput], visit: (tick: number, inp: PlayerInput) => void): InputPacket {
  const ackTick = r.uvar();
  const newestTick = r.uvar();
  const count = r.u8();
  if (count > 64) throw new RangeError('input: bad count');
  let prev = NEUTRAL;
  for (let i = 0; i < count; i++) {
    const out = scratch[i & 1]!;
    readOneInput(r, out, prev, table);
    visit(newestTick - (count - 1) + i, out);
    prev = out;
  }
  return { ackTick, newestTick, count };
}
