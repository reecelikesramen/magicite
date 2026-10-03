import { hashSeed, Rng } from '../engine/rng';
import type { Session } from '../game/session';
import { createRun } from '../sim';
import { MAX_PLAYERS } from '../sim/constants';
import { addPlayer } from '../sim/player/create';
import type { GameEvent, PlayerCommand, PlayerInput } from '../sim/types';
import { emptyInput } from '../sim/types';
import type { Level, PlayerSetup, World } from '../sim/world';
import { ByteReader, ByteWriter, CollectingSink, bytesEqual, writeValue } from './codec';
import { type TileEdits, TileTracker, regenerateLevel } from './levelsync';
import { SLOW_PRIVATE_KEYS, privateKeys, publicView } from './players';
import { OwnerAccess, buildOwnerLayout, copyInput, writeOwnerDelta } from './predict';
import {
  HostEncoder, Msg, PROTOCOL_VERSION, type SnapshotHeader, decodeCommands, decodeHello, decodeInputPacket, emptySnapshotHeader,
  encodePong, encodeReason, writeEventList, writeLevelChange, writePrivateState, writeSnapshotHeader, writeTileEdits,
  writeWelcome, writeWorldState,
} from './protocol';
import { EntityFrame, type InterestArea, captureFrame, selectInterest, writeEntityDelta } from './snapshot';
import { createStringTable } from './strings';
import type { Channel, PeerId, Transport } from './transport';

/**
 * Host-authoritative listen server. Owns the real World (stepped at 60 Hz by the game loop through
 * `tick`), plays its local player(s) with zero latency, and serves remote players:
 *
 *  - join at any time (Hello → addPlayer → Welcome + LevelChange(+edit log) + WorldState +
 *    PrivateState, then a full snapshot over the reliable channel), reconnect with the token,
 *    leave/crash → the player is marked `out` and its entity hidden until it reconnects;
 *  - per-client input jitter buffer keyed by tick (missing → repeat last held input, stale → drop);
 *  - snapshots at `snapshotRate` Hz: delta vs the client's last acked snapshot, interest-filtered,
 *    with public player views, the owner's exact prediction block and nearby cosmetic events;
 *  - reliable streams: tile edit log, level changes, important events, world/run state, owner-only
 *    private state (inventory, stats, meters…) when it changes.
 */
export interface HostOptions {
  transport: Transport;
  seed: number;
  /** Players on this machine (indices 0..n-1). */
  setups: PlayerSetup[];
  /** Use an existing world instead of `createRun(seed, setups)`. */
  world?: World;
  /** Snapshots per second (default 30). Must divide 60. */
  snapshotRate?: number;
  interest?: Partial<InterestArea>;
  /** Milliseconds clock (default performance.now). Tests pass the loopback network clock. */
  clock?: () => number;
  /** Drop a client that sent nothing for this long (default 10 s). */
  timeoutMs?: number;
  maxPlayers?: number;
}

/** ~2 screens (VIEW 320×180) around the viewer, plus hysteresis for entities already known. */
export const DEFAULT_INTEREST: InterestArea = { halfW: 320, halfH: 180, margin: 32 };

const RING = 64;
const INPUT_RING = 128;
const MAX_INPUT_AHEAD = 120;
const SLACK_WINDOW = 30;
const PRIVATE_SLOW_TICKS = 60;
const WORLD_STATE_EVERY = 6;

/** Event types that are pure presentation and may be lost (sent inside the unreliable snapshot). */
const COSMETIC_EVENTS: ReadonlySet<string> = new Set(['sfx', 'particles', 'damage', 'heal', 'death', 'shake', 'hitstop', 'tileBroken', 'resourceHit']);
/** Never forwarded: the client produces these itself. */
const LOCAL_ONLY_EVENTS: ReadonlySet<string> = new Set(['levelEnter']);

interface SentEntry {
  tick: number;
  epoch: number;
  slot: number;
  inc: Int32Array;
  count: number;
  owner: Float64Array;
  hasOwner: boolean;
  pubVer: Int32Array;
  defs: number[];
}

class InputRing {
  private ticks = new Int32Array(INPUT_RING).fill(-1);
  private inputs: PlayerInput[] = Array.from({ length: INPUT_RING }, () => emptyInput());

  put(tick: number, inp: PlayerInput): void {
    const i = tick % INPUT_RING;
    if (this.ticks[i] === tick) return;
    this.ticks[i] = tick;
    copyInput(this.inputs[i]!, inp);
  }

  take(tick: number): PlayerInput | undefined {
    const i = tick % INPUT_RING;
    if (this.ticks[i] !== tick) return undefined;
    this.ticks[i] = -1;
    return this.inputs[i];
  }
}

interface RemoteClient {
  peer: PeerId;
  index: number;
  token: string;
  owner: OwnerAccess;
  inputs: InputRing;
  /** Last real input (repeated when one is missing). */
  last: PlayerInput;
  /** Input handed to the world this tick. */
  cur: PlayerInput;
  commands: PlayerCommand[];
  ackTick: number;
  sent: SentEntry[];
  knownAcked: Set<number>;
  knownReliable: Set<number>;
  newestInput: number;
  /** First input tick received (misses are only counted after it). */
  firstInput: number;
  slackMin: number;
  slackReported: number;
  slackWindowStart: number;
  misses: number;
  lastHeard: number;
  priv: Map<string, Uint8Array>;
  privKeys: string[];
  privKeysTick: number;
  privSlowTick: number;
  worldState: Uint8Array | null;
  bytesOut: number;
  packetsOut: number;
  joinedTick: number;
}

export interface HostClientStats {
  peer: PeerId;
  index: number;
  name: string;
  bytesOut: number;
  packetsOut: number;
  misses: number;
  slack: number;
  ackLagTicks: number;
}

/** A remote player who left (or crashed): their slot is kept for a reconnect with the token. */
interface Departed {
  index: number;
  /** Level epoch at departure: a reconnect into the same level restores the death state below. */
  epoch: number;
  downed: boolean;
  out: boolean;
}

interface QueuedPacket {
  peer: PeerId;
  channel: Channel;
  data: Uint8Array;
}

interface NetEvent {
  tick: number;
  bytes: Uint8Array;
  dyn: number[];
  hasPos: boolean;
  x: number;
  y: number;
  /** Only for this player index (-1 = everyone). */
  only: number;
}

export class HostSession implements Session {
  readonly world: World;
  readonly localPlayers: number[];
  /** Level epoch: bumps on every level change. */
  epoch = 1;
  readonly snapshotInterval: number;
  readonly interest: InterestArea;
  /** Called when a remote player joins / leaves (UI toasts, lobby lists). */
  onPlayerJoin?: (index: number, name: string, reconnect: boolean) => void;
  onPlayerLeave?: (index: number, name: string, reason: string) => void;

  private readonly transport: Transport;
  private readonly clock: () => number;
  private readonly timeoutMs: number;
  private readonly maxPlayers: number;
  private readonly strings = createStringTable();
  private readonly enc = new HostEncoder(this.strings);
  private readonly reader = new ByteReader();
  private readonly scratchInputs: [PlayerInput, PlayerInput] = [emptyInput(), emptyInput()];
  private readonly inputs: PlayerInput[] = [];
  private readonly clients = new Map<PeerId, RemoteClient>();
  /** Reconnect token → departed remote player. */
  private readonly departed = new Map<string, Departed>();
  private readonly queue: QueuedPacket[] = [];
  private readonly unsubs: (() => void)[] = [];
  private pending: GameEvent[] = [];
  private readonly tokenRng: Rng;

  // Level tracking
  private level: Level;
  private levelTick = 0;
  private tracker!: TileTracker;
  private readonly edits: TileEdits = [];

  // Snapshot state
  private readonly frames: EntityFrame[] = [];
  private readonly frameTicks = new Int32Array(RING).fill(-1);
  private readonly frameEpochs = new Int32Array(RING);
  private readonly pubBytes: (Uint8Array | null)[] = [];
  private readonly pubDyn: number[][] = [];
  private readonly pubVer = new Int32Array(MAX_PLAYERS);
  private readonly cosmetic: NetEvent[] = [];
  private readonly important: NetEvent[] = [];
  private readonly evWriter = new ByteWriter(256);
  private readonly evSink = new CollectingSink(this.strings);
  private readonly valWriter = new ByteWriter(1024);
  private readonly valSink = new CollectingSink(this.strings);
  private readonly need: number[] = [];
  private readonly header: SnapshotHeader = emptySnapshotHeader();
  private readonly evTicks: number[] = [];
  private readonly evItems: Uint8Array[] = [];
  private disposed = false;

  constructor(opts: HostOptions) {
    this.transport = opts.transport;
    this.clock = opts.clock ?? (() => performance.now());
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxPlayers = Math.min(MAX_PLAYERS, opts.maxPlayers ?? MAX_PLAYERS);
    const rate = opts.snapshotRate ?? 30;
    this.snapshotInterval = Math.max(1, Math.round(60 / rate));
    this.interest = { ...DEFAULT_INTEREST, ...opts.interest };
    this.world = opts.world ?? createRun(opts.seed, opts.setups);
    this.localPlayers = opts.setups.map((_, i) => i);
    this.tokenRng = new Rng(hashSeed(`${opts.seed}:${this.clock()}`));
    this.pending.push(...this.world.events);
    for (let i = 0; i < RING; i++) this.frames.push(new EntityFrame(64));
    this.level = this.world.level;
    this.levelTick = this.world.tick;
    this.resetTracker();
    this.unsubs.push(
      this.transport.onMessage((peer, channel, data) => this.queue.push({ peer, channel, data })),
      this.transport.onPeerLeave((peer) => this.queue.push({ peer, channel: 'reliable', data: LEAVE_MARK })),
    );
  }

  /** Number of connected remote players. */
  get remoteCount(): number {
    let n = 0;
    for (const c of this.clients.values()) if (c.index >= 0) n++;
    return n;
  }

  clientStats(): HostClientStats[] {
    const out: HostClientStats[] = [];
    for (const c of this.clients.values()) {
      out.push({
        peer: c.peer, index: c.index, name: this.world.players[c.index]?.name ?? '', bytesOut: c.bytesOut, packetsOut: c.packetsOut,
        misses: c.misses, slack: c.slackReported, ackLagTicks: c.ackTick > 0 ? this.world.tick - c.ackTick : -1,
      });
    }
    return out;
  }

  /** Player index served to a peer (-1 if none). */
  playerOf(peer: PeerId): number {
    return this.clients.get(peer)?.index ?? -1;
  }

  tick(local: ReadonlyMap<number, PlayerInput>): void {
    if (this.disposed) return;
    this.processIncoming();
    this.checkTimeouts();
    // A host without local players (dedicated server) holds the run still while nobody is connected:
    // no Blight timer before the first join, and departed (= out) players can't wipe the party.
    if (this.localPlayers.length === 0 && this.clients.size === 0) return;
    const world = this.world;
    const T = world.tick;
    for (let i = 0; i < MAX_PLAYERS; i++) this.inputs[i] = EMPTY_INPUT;
    for (const i of this.localPlayers) this.inputs[i] = local.get(i) ?? EMPTY_INPUT;
    for (const c of this.clients.values()) {
      const inp = c.inputs.take(T);
      if (DEBUG && T < 100) console.log(`host T=${T} input ${inp ? `jump=${inp.jump} mx=${inp.moveX}` : 'MISSING'} newest=${c.newestInput}`);
      if (inp) copyInput(c.last, inp);
      else if (c.firstInput >= 0 && T > c.firstInput) c.misses++;
      copyInput(c.cur, c.last);
      if (!inp) {
        c.cur.select = -1;
        c.cur.skill = -1;
      }
      c.cur.commands = c.commands.length ? c.commands.splice(0) : NO_COMMANDS;
      this.inputs[c.index] = c.cur;
    }
    world.step(this.inputs);
    this.assertDeparted();
    for (const ev of world.events) this.pending.push(ev);
    this.collectNetEvents();
    if (world.level !== this.level) this.onLevelChanged();
    this.edits.length = 0;
    if (this.tracker.collect(world.level.grid, this.edits) > 0) this.broadcastTileEdits();
    if (world.tick % this.snapshotInterval === 0) this.snapshotRound();
  }

  drainEvents(): GameEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Graceful shutdown: tell every client, unsubscribe. The transport is left open (caller owns it). */
  dispose(): void {
    if (this.disposed) return;
    for (const c of this.clients.values()) this.send(c, 'reliable', encodeReason(Msg.Leave, 'host closed', true));
    this.disposed = true;
    for (const u of this.unsubs) u();
    this.clients.clear();
  }

  // -------------------------------------------------------------------------------------------
  // Incoming
  // -------------------------------------------------------------------------------------------

  private processIncoming(): void {
    const q = this.queue;
    for (let i = 0; i < q.length; i++) {
      const p = q[i]!;
      if (p.data === LEAVE_MARK) {
        const c = this.clients.get(p.peer);
        if (c) this.dropClient(c, 'disconnected');
        continue;
      }
      try {
        this.handle(p.peer, p.data);
      } catch (err) {
        // Malformed packet from a peer: ignore it (never let a peer crash the host).
        if (!(err instanceof RangeError)) throw err;
      }
    }
    q.length = 0;
  }

  private handle(peer: PeerId, data: Uint8Array): void {
    const r = this.reader.reset(data);
    const type = r.u8();
    const c = this.clients.get(peer);
    if (c) c.lastHeard = this.clock();
    switch (type) {
      case Msg.Hello:
        this.onHello(peer, r);
        return;
      case Msg.Input: {
        if (!c) return;
        const T = this.world.tick;
        const pkt = decodeInputPacket(r, this.strings, this.scratchInputs, (tick, inp) => {
          if (tick < T || tick > T + MAX_INPUT_AHEAD) return;
          c.inputs.put(tick, inp);
        });
        if (pkt.newestTick > c.newestInput) c.newestInput = pkt.newestTick;
        if (c.firstInput < 0 && pkt.newestTick >= T) c.firstInput = Math.max(T, pkt.newestTick - pkt.count + 1);
        const slack = pkt.newestTick - T;
        if (slack < c.slackMin) c.slackMin = slack;
        this.onAck(c, pkt.ackTick);
        return;
      }
      case Msg.Commands: {
        if (!c) return;
        const { commands } = decodeCommands(r, this.strings);
        for (const cmd of commands) if (c.commands.length < 64) c.commands.push(cmd);
        return;
      }
      case Msg.Ping: {
        const t = r.f64();
        this.transport.send(peer, 'unreliable', encodePong(t, this.world.tick));
        return;
      }
      case Msg.Leave:
        if (c) this.dropClient(c, 'left');
        return;
      default:
    }
  }

  private onAck(c: RemoteClient, tick: number): void {
    if (tick <= c.ackTick) return;
    const e = c.sent[this.slotOf(tick)]!;
    if (e.tick !== tick) return;
    c.ackTick = tick;
    for (const id of e.defs) c.knownAcked.add(id);
  }

  private onHello(peer: PeerId, r: ByteReader): void {
    if (this.clients.has(peer)) return; // duplicate Hello (reliable retransmit or second try)
    const hello = decodeHello(r, this.strings);
    if (hello.version !== PROTOCOL_VERSION) return this.reject(peer, `version mismatch (host ${PROTOCOL_VERSION}, you ${hello.version})`);
    if (hello.stringHash !== this.strings.hash) return this.reject(peer, 'content mismatch: different game build');
    const world = this.world;
    let index = -1;
    let prior: Departed | undefined;
    if (hello.token) {
      // A reconnect (page reload, network switch) usually arrives before the old connection has been
      // detected as dead: the newer connection takes the slot over instead of creating a second player.
      for (const old of this.clients.values()) {
        if (old.token === hello.token) {
          this.dropClient(old, 'replaced');
          break;
        }
      }
      prior = this.departed.get(hello.token);
    }
    const reconnect = prior !== undefined;
    if (prior) {
      index = prior.index;
      this.departed.delete(hello.token);
    } else {
      if (world.players.length >= this.maxPlayers) return this.reject(peer, 'game is full');
      const p = addPlayer(world, hello.setup);
      index = p.index;
    }
    const p = world.players[index]!;
    const e = world.get(p.entityId)!;
    if (prior) {
      e.dead = false;
      if (prior.epoch === this.epoch) {
        // Same level: leaving must not revive a downed/out player (GDD: out for the district), nor
        // teleport anyone to the party — they come back where and how they left.
        p.downed = prior.downed;
        p.out = prior.out;
      } else {
        // The party moved on meanwhile; like everyone else they enter the new level standing (≥ 1 HP).
        p.downed = false;
        p.out = false;
        if (e.hp < 1) e.hp = 1;
        this.placeNearParty(index);
      }
    } else this.placeNearParty(index);
    const token = prior ? hello.token : this.makeToken();
    const owner = new OwnerAccess(buildOwnerLayout(p, e));
    const c: RemoteClient = {
      peer, index, token, owner, inputs: new InputRing(), last: emptyInput(), cur: emptyInput(), commands: [], ackTick: 0,
      sent: Array.from({ length: RING }, () => ({
        tick: -1, epoch: 0, slot: 0, inc: new Int32Array(64), count: 0, owner: new Float64Array(owner.n), hasOwner: false,
        pubVer: new Int32Array(MAX_PLAYERS), defs: [],
      })),
      knownAcked: new Set(), knownReliable: new Set(), newestInput: -1, firstInput: -1, slackMin: 1e9, slackReported: 127,
      slackWindowStart: world.tick, misses: 0, lastHeard: this.clock(), priv: new Map(), privKeys: [], privKeysTick: -1e9,
      privSlowTick: -1e9, worldState: null, bytesOut: 0, packetsOut: 0, joinedTick: world.tick,
    };
    this.clients.set(peer, c);

    // Welcome → LevelChange (+compacted edit log) → WorldState → PrivateState; the first snapshot
    // (full, reliable) follows at the next snapshot round.
    let w = this.enc.begin();
    writeWelcome(w, {
      version: PROTOCOL_VERSION, playerIndex: index, token, hostTick: world.tick, clientTimeEcho: hello.clientTime,
      seed: world.seed, snapshotInterval: this.snapshotInterval, owner: owner.layout,
    }, this.enc);
    this.sendReliable(c, Msg.Welcome);
    w = this.enc.begin();
    writeLevelChange(w, this.levelChangeMsg(this.tracker.compactLog(world.level.grid)), this.enc.sink);
    this.sendReliable(c, Msg.LevelChange);
    this.sendWorldState(c, true);
    this.sendPrivate(c, true);
    this.onPlayerJoin?.(index, p.name, reconnect);
  }

  private reject(peer: PeerId, reason: string): void {
    this.transport.send(peer, 'reliable', encodeReason(Msg.Reject, reason, true));
  }

  /** Reconnect tokens are bearer secrets (they reclaim a slot, even from a live connection). */
  private makeToken(): string {
    const words = new Uint32Array(4);
    const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
    if (c?.getRandomValues) c.getRandomValues(words);
    else for (let i = 0; i < 4; i++) words[i] = this.tokenRng.nextU32();
    let s = '';
    for (let i = 0; i < 4; i++) s += words[i]!.toString(36).padStart(7, '0');
    return s;
  }

  /** Put a (re)joining player next to the first active teammate, or on the level spawn. */
  private placeNearParty(index: number): void {
    const world = this.world;
    const e = world.playerEntity(index);
    if (!e) return;
    let cx = world.level.spawn.x;
    let bottom = world.level.spawn.y;
    for (const p of world.players) {
      if (p.index === index || p.out || p.downed) continue;
      const o = world.get(p.entityId);
      if (!o || o.dead) continue;
      cx = o.x + o.w / 2;
      bottom = o.y + o.h;
      break;
    }
    e.x = cx - e.w / 2;
    e.y = bottom - e.h;
    e.px = e.x;
    e.py = e.y;
    e.vx = 0;
    e.vy = 0;
  }

  private checkTimeouts(): void {
    const now = this.clock();
    for (const c of this.clients.values()) if (now - c.lastHeard > this.timeoutMs) this.dropClient(c, 'timed out');
  }

  private dropClient(c: RemoteClient, reason: string): void {
    if (!this.clients.delete(c.peer)) return;
    const p = this.world.players[c.index];
    if (p) {
      this.departed.set(c.token, { index: c.index, epoch: this.epoch, downed: p.downed, out: p.out });
      this.hidePlayer(c.index);
      this.onPlayerLeave?.(c.index, p.name, reason);
    }
    if (reason === 'timed out' || reason === 'replaced') this.transport.send(c.peer, 'reliable', encodeReason(Msg.Leave, reason, true));
  }

  private hidePlayer(index: number): void {
    const p = this.world.players[index];
    if (!p) return;
    p.out = true;
    p.downed = false;
    const e = this.world.get(p.entityId);
    if (e) {
      e.dead = true;
      e.vx = 0;
      e.vy = 0;
      e.swing = undefined;
    }
  }

  /** Departed players stay out even if a system revives `out` players on a new level. */
  private assertDeparted(): void {
    for (const { index } of this.departed.values()) {
      const p = this.world.players[index];
      if (p && !p.out) this.hidePlayer(index);
      else if (p) {
        const e = this.world.get(p.entityId);
        if (e && !e.dead) e.dead = true;
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // Level & tiles
  // -------------------------------------------------------------------------------------------

  private resetTracker(): void {
    const level = this.world.level;
    const req = level.request;
    const base = req ? regenerateLevel(req).grid : level.grid.clone();
    this.tracker = new TileTracker(level.grid, base);
  }

  private levelChangeMsg(edits: TileEdits) {
    const level = this.world.level;
    return {
      epoch: this.epoch, tick: this.levelTick, request: level.request ?? null, level: level.request ? null : level,
      baseHash: level.request ? this.tracker.baseHash : 0, edits,
    };
  }

  private onLevelChanged(): void {
    this.epoch++;
    this.level = this.world.level;
    this.levelTick = this.world.tick;
    this.resetTracker();
    for (const c of this.clients.values()) {
      const w = this.enc.begin();
      writeLevelChange(w, this.levelChangeMsg([]), this.enc.sink);
      this.sendReliable(c, Msg.LevelChange);
      this.sendWorldState(c, true);
    }
  }

  private broadcastTileEdits(): void {
    if (this.clients.size === 0) return;
    const w = this.enc.begin();
    writeTileEdits(w, this.epoch, this.edits);
    for (const c of this.clients.values()) this.sendReliable(c, Msg.TileEdits);
  }

  // -------------------------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------------------------

  private collectNetEvents(): void {
    if (this.clients.size === 0) return;
    const tick = this.world.tick;
    for (const ev of this.world.events) {
      if (LOCAL_ONLY_EVENTS.has(ev.type)) continue;
      const rec = ev as unknown as Record<string, unknown>;
      // (0, 0) is the "UI sound" convention (e.g. craft sfx): treat it as positionless.
      const hasPos = typeof rec.x === 'number' && typeof rec.y === 'number' && (rec.x !== 0 || rec.y !== 0);
      this.evWriter.reset();
      this.evSink.clear();
      writeValue(this.evWriter, ev, this.evSink, true);
      const ne: NetEvent = {
        tick, bytes: this.evWriter.copy(), dyn: this.evSink.used.length ? this.evSink.used.slice() : NO_IDS, hasPos,
        x: hasPos ? (rec.x as number) : 0, y: hasPos ? (rec.y as number) : 0,
        only: ev.type === 'message' && typeof rec.player === 'number' ? (rec.player as number) : -1,
      };
      if (COSMETIC_EVENTS.has(ev.type) || (hasPos && !isImportantType(ev.type))) this.cosmetic.push(ne);
      else this.important.push(ne);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Snapshots
  // -------------------------------------------------------------------------------------------

  private slotOf(tick: number): number {
    return Math.floor(tick / this.snapshotInterval) % RING;
  }

  private snapshotRound(): void {
    if (this.clients.size === 0) {
      this.cosmetic.length = 0;
      this.important.length = 0;
      return;
    }
    const world = this.world;
    const S = world.tick;
    const slot = this.slotOf(S);
    const frame = this.frames[slot]!;
    captureFrame(world, frame, this.strings);
    frame.tick = S;
    frame.epoch = this.epoch;
    this.frameTicks[slot] = S;
    this.frameEpochs[slot] = this.epoch;
    this.updatePublicViews();
    const doWorld = (S / this.snapshotInterval) % WORLD_STATE_EVERY === 0;
    for (const c of this.clients.values()) {
      // Reliable streams first so they never lag the snapshot that depends on them.
      if (doWorld) this.sendWorldState(c, false);
      this.sendPrivate(c, false);
      this.sendImportantEvents(c);
      this.sendSnapshot(c, slot, frame);
      // Slack window bookkeeping.
      if (S - c.slackWindowStart >= SLACK_WINDOW) {
        if (c.slackMin < 1e9) c.slackReported = c.slackMin;
        c.slackMin = 1e9;
        c.slackWindowStart = S;
      }
    }
    this.cosmetic.length = 0;
    this.important.length = 0;
  }

  private updatePublicViews(): void {
    const players = this.world.players;
    for (let i = 0; i < players.length; i++) {
      this.valWriter.reset();
      this.valSink.clear();
      writeValue(this.valWriter, publicView(players[i]!), this.valSink);
      const cur = this.valWriter.finish();
      if (!bytesEqual(this.pubBytes[i] ?? undefined, cur)) {
        this.pubBytes[i] = cur.slice();
        this.pubDyn[i] = this.valSink.used.slice();
        this.pubVer[i]!++;
      }
    }
  }

  private sendSnapshot(c: RemoteClient, slot: number, frame: EntityFrame): void {
    const world = this.world;
    const S = world.tick;
    const entry = c.sent[slot]!;
    // Baseline: the newest snapshot this client acked, if we still have it and it is this level.
    let base: SentEntry | null = null;
    if (c.ackTick > 0) {
      const b = c.sent[this.slotOf(c.ackTick)]!;
      if (b.tick === c.ackTick && b.epoch === this.epoch && this.frameTicks[b.slot] === b.tick && b.tick !== S) base = b;
    }
    const baseFrame = base ? this.frames[base.slot]! : null;

    // Interest set.
    const pe = world.playerEntity(c.index);
    const vx = pe ? pe.x + pe.w / 2 : world.level.spawn.x;
    const vy = pe ? pe.y + pe.h / 2 : world.level.spawn.y;
    if (entry.inc.length < frame.count) entry.inc = new Int32Array(Math.max(frame.count, entry.inc.length * 2));
    entry.tick = S;
    entry.epoch = this.epoch;
    entry.slot = slot;
    entry.count = selectInterest(frame, vx, vy, this.interest, baseFrame, base ? base.inc : null, base ? base.count : 0, entry.inc);
    entry.defs.length = 0;

    const w = this.enc.begin();
    const h = this.header;
    h.tick = S;
    h.epoch = this.epoch;
    h.baseTick = base ? base.tick : 0;
    h.slack = c.slackReported;
    h.misses = c.misses;
    h.inputTick = c.newestInput;
    h.freeze = world.freeze;
    writeSnapshotHeader(w, h);

    // Public player views that changed since the baseline.
    const need = this.need;
    need.length = 0;
    const players = world.players;
    let nPub = 0;
    for (let i = 0; i < players.length; i++) {
      entry.pubVer[i] = this.pubVer[i]!;
      if (!base || base.pubVer[i] !== this.pubVer[i]) nPub++;
    }
    w.u8(nPub);
    for (let i = 0; i < players.length; i++) {
      if (base && base.pubVer[i] === this.pubVer[i]) continue;
      w.u8(i);
      w.uvar(this.pubVer[i]!);
      w.bytes(this.pubBytes[i]!);
      for (const id of this.pubDyn[i]!) need.push(id);
    }

    // Owner block: exact prediction state of this client's player.
    const p = players[c.index];
    const e = p ? world.get(p.entityId) : undefined;
    if (p && e && !e.dead) {
      c.owner.capture(p, e, entry.owner);
      entry.hasOwner = true;
      w.u8(1);
      writeOwnerDelta(w, entry.owner, base && base.hasOwner ? base.owner : null);
    } else {
      entry.hasOwner = false;
      w.u8(0);
    }

    // Entities.
    writeEntityDelta(w, frame, entry.inc, entry.count, baseFrame, base ? base.inc : null, base ? base.count : 0, (id) => need.push(id), this.strings.staticCount);

    // Cosmetic events in the interest box since the last round.
    const ticks = this.evTicks;
    const items = this.evItems;
    let n = 0;
    const hw = this.interest.halfW + this.interest.margin;
    const hh = this.interest.halfH + this.interest.margin;
    for (const ev of this.cosmetic) {
      if (ev.hasPos && (Math.abs(ev.x - vx) > hw || Math.abs(ev.y - vy) > hh)) continue;
      ticks[n] = ev.tick;
      items[n] = ev.bytes;
      n++;
      for (const id of ev.dyn) need.push(id);
    }
    writeEventList(w, Math.max(0, S - this.snapshotInterval), ticks, items, n);

    const full = base === null;
    // Full snapshots go reliable (and count as acked immediately): they can be large and the
    // client cannot do anything useful until it has one.
    const known = full ? c.knownReliable : c.knownAcked;
    const pkt = this.enc.finish(Msg.Snapshot, known, full, need);
    if (full) {
      for (const id of this.enc.sink.used) c.knownAcked.add(id);
      for (const id of need) c.knownAcked.add(id);
      for (const id of c.knownReliable) c.knownAcked.add(id);
      c.ackTick = S;
    } else {
      for (const id of this.enc.missing(c.knownAcked, need)) entry.defs.push(id);
    }
    this.send(c, full ? 'reliable' : 'unreliable', pkt);
  }

  private sendImportantEvents(c: RemoteClient): void {
    if (this.important.length === 0) return;
    const ticks = this.evTicks;
    const items = this.evItems;
    const need = this.need;
    need.length = 0;
    let n = 0;
    for (const ev of this.important) {
      if (ev.only >= 0 && ev.only !== c.index) continue;
      ticks[n] = ev.tick;
      items[n] = ev.bytes;
      n++;
      for (const id of ev.dyn) need.push(id);
    }
    if (n === 0) return;
    const w = this.enc.begin();
    writeEventList(w, ticks[0]!, ticks, items, n);
    this.sendReliable(c, Msg.Events, need);
  }

  private sendWorldState(c: RemoteClient, force: boolean): void {
    const world = this.world;
    this.valWriter.reset();
    this.valSink.clear();
    // Compare without the tick counter (clients advance it locally).
    writeWorldState(this.valWriter, { epoch: this.epoch, locked: world.level.locked, run: { ...world.run, ticks: 0 } }, this.valSink);
    const cmp = this.valWriter.finish();
    if (!force && bytesEqual(c.worldState ?? undefined, cmp)) return;
    c.worldState = cmp.slice();
    const w = this.enc.begin();
    writeWorldState(w, { epoch: this.epoch, locked: world.level.locked, run: world.run }, this.enc.sink);
    this.sendReliable(c, Msg.WorldState);
  }

  private readonly privKeysOut: string[] = [];
  private readonly privValsOut: Uint8Array[] = [];
  private readonly privNeed: number[] = [];

  /** Owner-only PlayerState fields that changed (inventory, stats, meters, xp…). */
  private sendPrivate(c: RemoteClient, force: boolean): void {
    const world = this.world;
    const p = world.players[c.index];
    if (!p) return;
    const S = world.tick;
    if (force || S - c.privKeysTick >= 60) {
      c.privKeys = privateKeys(p);
      c.privKeysTick = S;
    }
    const slow = force || S - c.privSlowTick >= PRIVATE_SLOW_TICKS;
    if (slow) c.privSlowTick = S;
    const keys = this.privKeysOut;
    const vals = this.privValsOut;
    const need = this.privNeed;
    keys.length = 0;
    vals.length = 0;
    need.length = 0;
    const rec = p as unknown as Record<string, unknown>;
    for (const k of c.privKeys) {
      if (!slow && SLOW_PRIVATE_KEYS.has(k)) continue;
      this.valWriter.reset();
      this.valSink.clear();
      writeValue(this.valWriter, rec[k], this.valSink);
      const cur = this.valWriter.finish();
      const prev = c.priv.get(k);
      if (!force && prev && bytesEqual(prev, cur)) continue;
      const copy = cur.slice();
      c.priv.set(k, copy);
      keys.push(k);
      vals.push(copy);
      for (const id of this.valSink.used) need.push(id);
    }
    if (keys.length === 0) return;
    const w = this.enc.begin();
    writePrivateState(w, c.index, keys, vals, this.enc.sink);
    this.sendReliable(c, Msg.PrivateState, need);
  }

  // -------------------------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------------------------

  private sendReliable(c: RemoteClient, type: (typeof Msg)[keyof typeof Msg], extra?: readonly number[]): void {
    this.send(c, 'reliable', this.enc.finish(type, c.knownReliable, true, extra));
  }

  private send(c: RemoteClient, channel: Channel, data: Uint8Array): void {
    c.bytesOut += data.length;
    c.packetsOut++;
    this.transport.send(c.peer, channel, data);
  }
}

function isImportantType(type: string): boolean {
  return type === 'levelUp' || type === 'downed' || type === 'revived' || type === 'runOver' || type === 'bossPhase' || type === 'message' || type === 'craft' || type === 'pickup';
}

const DEBUG = typeof process !== 'undefined' && !!process.env?.NET_DEBUG;
const LEAVE_MARK = new Uint8Array(0);
const NO_IDS: number[] = [];
const NO_COMMANDS: PlayerCommand[] = [];
const EMPTY_INPUT: PlayerInput = emptyInput();
