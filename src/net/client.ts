import { maybeItem } from '../content';
import type { Session } from '../game/session';
import { World } from '../sim';
import { MAX_PLAYERS } from '../sim/constants';
import type { Entity, GameEvent, PlayerInput, PlayerState } from '../sim/types';
import { emptyInput } from '../sim/types';
import type { Level, PlayerSetup } from '../sim/world';
import { ByteReader, ByteWriter } from './codec';
import { applyEdits, regenerateLevel } from './levelsync';
import { blankEntity, connectingLevel, mirrorAdd, mirrorClear, mirrorRemoveWhere } from './mirror';
import { type PublicPlayerView, applyPublicView, makePlayerTemplate } from './players';
import { OwnerAccess, PREDICTED_ENTITY_KEYS, PredictionHistory, copyInput, predictStep, readOwnerDelta } from './predict';
import {
  INPUT_REDUNDANCY, Msg, PROTOCOL_VERSION, type SnapshotHeader, emptySnapshotHeader, encodeCommands, encodeHello,
  encodeInputPacket, encodePing, encodeReason, openHostPacket, quantizeInput, readEventList, readLevelChange,
  readPlayersSection, readPrivateState, readSnapshotHeader, readTileEdits, readWelcome, readWorldState,
} from './protocol';
import { ENTITY_FIELDS, EntityFrame, FX, FY, NF, applyRow, fieldIdx, fieldMask, fieldsUnder, readEntityDelta } from './snapshot';
import { createStringTable } from './strings';
import type { Channel, PeerId, Transport } from './transport';

/**
 * Network client. Keeps a *mirror* World that the renderer/UI/audio read exactly like a local one:
 *
 *  - the level is regenerated locally from the host's LevelRequest, then the tile edit log is applied;
 *  - remote entities are snapshot-interpolated ~100 ms in the past (adaptive to jitter);
 *  - the local player is predicted every tick with the real `controlPlayer` + `integrate`
 *    (src/net/predict.ts) and reconciled against the host's exact owner state on each snapshot
 *    (rewind to the server state, replay unacked inputs); visual corrections are smoothed;
 *  - inputs are sent every tick with 8× redundancy, timed so they reach the host ~2 ticks early;
 *  - presentation events come from snapshots (released at render time), minus events the client
 *    already predicted itself (own jump sfx…).
 */
export interface ClientOptions {
  transport: Transport;
  setup: PlayerSetup;
  /** Host peer id. Default: Hello goes to every peer and whoever answers Welcome is the host. */
  host?: PeerId;
  /** Reconnect token from an earlier session (`client.token`) to reclaim the same player. */
  token?: string;
  /** Milliseconds clock (default performance.now). */
  clock?: () => number;
}

export type ClientState = 'connecting' | 'joined' | 'rejected' | 'disconnected';

export interface ClientStats {
  rttMs: number;
  snapshots: number;
  /** Snapshots that could not be decoded (missing baseline, wrong epoch, malformed). */
  snapshotsDropped: number;
  /** Server states that differed from the prediction (rewind + replay). */
  reconciles: number;
  /** Reconciles that actually moved the local player (visible corrections). */
  corrections: number;
  maxCorrectionPx: number;
  predictedTicks: number;
  replayedTicks: number;
  /** Input ticks ahead of the newest snapshot. */
  leadTicks: number;
  interpDelayTicks: number;
  /** Host-reported count of ticks where our input arrived too late. */
  inputMisses: number;
  /** Host-reported min input slack (ticks early). */
  slack: number;
}

const RING = 64;
const HISTORY = 256;
const MAX_REPLAY = 120;
const PING_MS = 1000;
const HELLO_RETRY_MS = 1000;
const SNAP_LIMIT_PX = 48;
const OFFSET_DECAY = 0.82;
const TELEPORT_PX = 64;

interface RecvFrame {
  tick: number;
  epoch: number;
  frame: EntityFrame;
  owner: Float64Array;
  hasOwner: boolean;
}

interface QueuedEvent {
  tick: number;
  ev: GameEvent;
}

interface Predicted {
  type: string;
  key: string;
  x: number;
  y: number;
  tick: number;
}

const F_SWING = fieldIdx('swing');
const F_SWING_TICKS = fieldIdx('swing.ticks');
const F_PLAYER_INDEX = fieldIdx('playerIndex');
/** Fields the client predicts (or manages) for its own player: never overwritten from rows. */
const LOCAL_SKIP = fieldMask([...PREDICTED_ENTITY_KEYS, 'anim', 'age', 'held', ...fieldsUnder('swing').map((i) => ENTITY_FIELDS[i]!.key)]);
/** Interpolated fields (written by the interpolator, not by row application). */
const REMOTE_SKIP = fieldMask(['x', 'y']);
const SWING_FIELDS = fieldsUnder('swing');

export class ClientSession implements Session {
  readonly world: World;
  readonly localPlayers: number[] = [];
  readonly stats: ClientStats = {
    rttMs: 0, snapshots: 0, snapshotsDropped: 0, reconciles: 0, corrections: 0, maxCorrectionPx: 0, predictedTicks: 0,
    replayedTicks: 0, leadTicks: 0, interpDelayTicks: 0, inputMisses: 0, slack: 0,
  };
  state: ClientState = 'connecting';
  /** Reason for 'rejected' / 'disconnected'. */
  reason = '';
  /** Reconnect token (valid after Welcome). */
  token = '';
  /** Peer id of the host once known. */
  hostPeer: PeerId = -1;
  epoch = 0;
  onStateChange?: (state: ClientState, reason: string) => void;

  private readonly transport: Transport;
  private readonly clock: () => number;
  private readonly setup: PlayerSetup;
  private readonly strings = createStringTable();
  private readonly reader = new ByteReader();
  private readonly writer = new ByteWriter(512);
  private readonly unsubs: (() => void)[] = [];
  private readonly queue: { peer: PeerId; channel: Channel; data: Uint8Array }[] = [];
  private pending: GameEvent[] = [];
  private helloAt = -1e9;
  private pingAt = -1e9;

  // Join info
  private index = -1;
  private interval = 2;
  private owner: OwnerAccess | null = null;
  private history: PredictionHistory | null = null;

  // Snapshots
  private readonly ring: RecvFrame[] = [];
  private readonly recvTicks: number[] = [];
  private readonly header: SnapshotHeader = emptySnapshotHeader();
  private ackTick = 0;
  private newestTick = 0;
  private readonly pubVer = new Int32Array(MAX_PLAYERS).fill(-1);
  private readonly applied = new EntityFrame(64);
  private appliedTick = -1;
  private localApplied = -1;

  // Timing
  private predTick = 0;
  private serverTickEst = 0;
  private renderTick = 0;
  private interpDelay = 6;
  private readonly lateness = new Float32Array(32);
  private lateIdx = 0;
  private targetSlack = 2;
  private adjust = 0;
  private adjustPhase = 0;
  private adjustCooldown = 0;
  private lastMisses = 0;
  private lastMissTick = 0;

  // Prediction
  private predicting = false;
  private lastReconciled = 0;
  private offX = 0;
  private offY = 0;
  private appliedOffX = 0;
  private appliedOffY = 0;
  private prevVisX = 0;
  private prevVisY = 0;
  private readonly lastInput = emptyInput();
  private readonly repeatInput = emptyInput();
  private firstInputTick = -1;
  private readonly sendBuf: PlayerInput[] = [];
  private readonly predicted: Predicted[] = [];
  private readonly events: QueuedEvent[] = [];
  private disposed = false;

  constructor(opts: ClientOptions) {
    this.transport = opts.transport;
    this.clock = opts.clock ?? (() => performance.now());
    this.setup = opts.setup;
    this.token = opts.token ?? '';
    if (opts.host !== undefined) this.hostPeer = opts.host;
    this.world = new World(0, []);
    this.world.level = connectingLevel();
    for (let i = 0; i < RING; i++) this.ring.push({ tick: -1, epoch: 0, frame: new EntityFrame(64), owner: new Float64Array(0), hasOwner: false });
    this.unsubs.push(
      this.transport.onMessage((peer, channel, data) => this.queue.push({ peer, channel, data })),
      this.transport.onPeerJoin((peer) => this.sendHello(peer)),
      this.transport.onPeerLeave((peer) => {
        if (peer === this.hostPeer && this.state !== 'rejected') this.setState('disconnected', 'host left');
      }),
    );
    for (const p of this.transport.peers()) this.sendHello(p);
  }

  /** Player index assigned by the host (-1 until joined). */
  get playerIndex(): number {
    return this.index;
  }

  get ready(): boolean {
    return this.state === 'joined' && this.epoch > 0;
  }

  tick(local: ReadonlyMap<number, PlayerInput>): void {
    if (this.disposed) return;
    this.processIncoming();
    const now = this.clock();
    if (this.state === 'connecting' && now - this.helloAt > HELLO_RETRY_MS) {
      if (this.hostPeer >= 0) this.sendHello(this.hostPeer);
      else for (const p of this.transport.peers()) this.sendHello(p);
    }
    if (this.state !== 'joined' || this.epoch === 0 || !this.history) return;
    if (now - this.pingAt > PING_MS) {
      this.pingAt = now;
      this.transport.send(this.hostPeer, 'unreliable', encodePing(now));
    }
    const world = this.world;
    this.removeVisualOffset();

    // 1. Reconcile the local player with the newest authoritative state.
    this.reconcile();

    // 2. Sample + record + send this tick's input (1 tick normally; 0/2 while re-timing).
    const raw = local.get(this.index) ?? local.values().next().value ?? EMPTY;
    if (raw.commands.length) this.transport.send(this.hostPeer, 'reliable', encodeCommands(this.predTick, raw.commands, this.strings));
    // Re-timing is spread out (at most every other tick) so it reads as a slight speed change.
    let steps = 1;
    this.adjustPhase ^= 1;
    if (this.adjust > 0 && this.adjustPhase) {
      steps = 2;
      this.adjust--;
    } else if (this.adjust < 0 && this.adjustPhase) {
      steps = 0;
      this.adjust++;
    }
    for (let s = 0; s < steps; s++) {
      copyInput(this.lastInput, raw);
      this.lastInput.commands = NO_COMMANDS;
      if (s > 0) {
        this.lastInput.select = -1;
        this.lastInput.skill = -1;
      }
      quantizeInput(this.lastInput);
      const t = this.predTick;
      if (this.firstInputTick < 0) this.firstInputTick = t;
      this.history.putInput(t, this.lastInput);
      if (this.predicting) this.predictTick(t, this.lastInput, false);
      this.predTick++;
    }
    this.sendInputs();

    // 3. Remote entities, events, presentation.
    this.serverTickEst += 1;
    this.advanceRenderTick();
    this.interpolate();
    this.releaseEvents();
    this.applyVisualOffset();
    world.tick = this.predTick;
    world.run.ticks++;
    this.stats.leadTicks = this.predTick - this.newestTick;
    this.stats.interpDelayTicks = this.interpDelay;
  }

  drainEvents(): GameEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Leave the game (tells the host) and stop listening. The transport stays open (caller owns it). */
  dispose(): void {
    if (this.disposed) return;
    if (this.hostPeer >= 0 && this.state === 'joined') this.transport.send(this.hostPeer, 'reliable', encodeReason(Msg.Leave, 'left', false));
    this.disposed = true;
    for (const u of this.unsubs) u();
  }

  // -------------------------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------------------------

  private setState(s: ClientState, reason: string): void {
    if (this.state === s) return;
    this.state = s;
    this.reason = reason;
    this.onStateChange?.(s, reason);
  }

  private sendHello(peer: PeerId): void {
    if (this.state !== 'connecting' || this.disposed) return;
    if (this.hostPeer >= 0 && peer !== this.hostPeer) return;
    this.helloAt = this.clock();
    this.transport.send(peer, 'reliable', encodeHello({
      version: PROTOCOL_VERSION, stringHash: this.strings.hash, clientTime: this.clock(), token: this.token, setup: this.setup,
    }, this.strings));
  }

  private processIncoming(): void {
    const q = this.queue;
    for (let i = 0; i < q.length; i++) {
      const p = q[i]!;
      if (this.hostPeer >= 0 && p.peer !== this.hostPeer) continue;
      try {
        this.handle(p.peer, p.data);
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        this.stats.snapshotsDropped++;
      }
    }
    q.length = 0;
  }

  private handle(peer: PeerId, data: Uint8Array): void {
    if (data.length === 0) return;
    const type = data[0]!;
    // Only a host sends these; clients in the same room ignore each other.
    if (type === Msg.Hello || type === Msg.Input || type === Msg.Commands || type === Msg.Ping) return;
    const r = this.reader;
    openHostPacket(r, data, this.strings);
    switch (type) {
      case Msg.Welcome:
        return this.onWelcome(peer, r);
      case Msg.Reject:
        if (this.state === 'connecting') this.setState('rejected', r.str());
        return;
      case Msg.Leave:
        if (peer === this.hostPeer) this.setState('disconnected', r.str());
        return;
      case Msg.Pong: {
        const echo = r.f64();
        const rtt = Math.max(0, this.clock() - echo);
        this.stats.rttMs = this.stats.rttMs === 0 ? rtt : this.stats.rttMs * 0.8 + rtt * 0.2;
        return;
      }
      default:
    }
    if (this.state !== 'joined') return;
    switch (type) {
      case Msg.Snapshot:
        return this.onSnapshot(r);
      case Msg.LevelChange:
        return this.onLevelChange(r);
      case Msg.TileEdits: {
        const m = readTileEdits(r);
        if (m.epoch === this.epoch) applyEdits(this.world.level.grid, m.edits);
        return;
      }
      case Msg.WorldState: {
        const m = readWorldState(r, this.strings);
        if (m.epoch !== this.epoch) return;
        this.world.run = m.run;
        this.world.level.locked = m.locked;
        return;
      }
      case Msg.PrivateState: {
        const m = readPrivateState(r, this.strings);
        if (m.index !== this.index) return;
        const p = this.ensurePlayer(m.index) as unknown as Record<string, unknown>;
        for (const k in m.values) p[k] = m.values[k];
        return;
      }
      case Msg.Events:
        readEventList(r, this.strings, (tick, ev) => {
          if (ev && typeof ev === 'object' && typeof (ev as { type?: unknown }).type === 'string') this.events.push({ tick, ev: ev as GameEvent });
        });
        return;
      default:
    }
  }

  private onWelcome(peer: PeerId, r: ByteReader): void {
    if (this.state !== 'connecting') return;
    const m = readWelcome(r, this.strings);
    this.hostPeer = peer;
    this.index = m.playerIndex;
    this.token = m.token;
    this.interval = Math.max(1, m.snapshotInterval);
    (this.world as { seed: number }).seed = m.seed;
    this.owner = new OwnerAccess(m.owner);
    this.history = new PredictionHistory(HISTORY, this.owner.n + 1);
    for (const f of this.ring) f.owner = new Float64Array(this.owner.n);
    const p = this.ensurePlayer(this.index);
    Object.assign(p, makePlayerTemplate(this.setup, this.index, p.entityId), { entityId: p.entityId });
    this.localPlayers.length = 0;
    this.localPlayers.push(this.index);
    // Initial timing: the host is ≈ rtt/2 ahead of the Welcome's tick, and our inputs need another
    // rtt/2 to get there, plus a small safety lead.
    const rtt = Math.max(0, this.clock() - m.clientTimeEcho);
    this.stats.rttMs = rtt;
    const rttTicks = Math.ceil(rtt / (1000 / 60));
    this.predTick = m.hostTick + rttTicks + this.targetSlack + 1;
    this.serverTickEst = m.hostTick;
    this.renderTick = m.hostTick - this.interpDelay;
    this.lastMissTick = m.hostTick;
    this.setState('joined', '');
  }

  // -------------------------------------------------------------------------------------------
  // Level
  // -------------------------------------------------------------------------------------------

  private onLevelChange(r: ByteReader): void {
    const m = readLevelChange(r, this.strings);
    if (m.epoch <= this.epoch) return;
    let level: Level;
    if (m.request) level = regenerateLevel(m.request);
    else level = m.level!;
    applyEdits(level.grid, m.edits);
    const world = this.world;
    world.level = level;
    this.epoch = m.epoch;
    mirrorClear(world);
    this.appliedTick = -1;
    this.applied.count = 0;
    this.localApplied = -1;
    this.recvTicks.length = 0;
    this.events.length = 0;
    this.predicted.length = 0;
    this.predicting = false;
    this.offX = this.offY = this.appliedOffX = this.appliedOffY = 0;
    // Input history is kept: the host still applies inputs we sent before we heard of the change.
    this.pending.push({ type: 'levelEnter', district: level.info.district, biome: level.info.biome, name: level.info.name, isTown: level.info.isTown, isBoss: level.info.isBoss });
  }

  // -------------------------------------------------------------------------------------------
  // Snapshots
  // -------------------------------------------------------------------------------------------

  private slotOf(tick: number): number {
    return Math.floor(tick / this.interval) % RING;
  }

  private onSnapshot(r: ByteReader): void {
    const h = readSnapshotHeader(r, this.header);
    if (h.epoch !== this.epoch) {
      this.stats.snapshotsDropped++;
      return;
    }
    const slot = this.ring[this.slotOf(h.tick)]!;
    if (slot.tick === h.tick && slot.epoch === h.epoch) return; // duplicate
    let base: RecvFrame | null = null;
    if (h.baseTick > 0) {
      const b = this.ring[this.slotOf(h.baseTick)]!;
      if (b.tick !== h.baseTick || b.epoch !== h.epoch || b === slot) {
        this.stats.snapshotsDropped++;
        return;
      }
      base = b;
    }
    // Public player views (versioned, so out-of-order snapshots never roll them back).
    readPlayersSection(r, this.strings, (index, version, view) => {
      if (index >= MAX_PLAYERS || version <= this.pubVer[index]!) return;
      this.pubVer[index] = version;
      const p = this.ensurePlayer(index);
      applyPublicView(p, view as PublicPlayerView, index === this.index);
    });
    slot.tick = -1;
    const hasOwner = r.u8() === 1;
    if (hasOwner) readOwnerDelta(r, base && base.hasOwner ? base.owner : null, slot.owner);
    slot.hasOwner = hasOwner;
    readEntityDelta(r, base ? base.frame : null, slot.frame);
    slot.frame.tick = h.tick;
    slot.frame.epoch = h.epoch;
    slot.tick = h.tick;
    slot.epoch = h.epoch;
    readEventList(r, this.strings, (tick, ev) => {
      if (ev && typeof ev === 'object' && typeof (ev as { type?: unknown }).type === 'string') this.events.push({ tick, ev: ev as GameEvent });
    });
    this.stats.snapshots++;
    this.insertRecvTick(h.tick);
    if (h.tick > this.ackTick) this.ackTick = h.tick;
    this.world.freeze = h.freeze;

    // Clock: earliest-arrival estimate of the host's snapshot clock + lateness stats for the buffer.
    const late = this.serverTickEst - h.tick;
    if (late < 0) this.serverTickEst = h.tick;
    else this.serverTickEst -= Math.min(late, 0.01 * late + 0.002);
    this.lateness[this.lateIdx++ & 31] = Math.max(0, late);
    if (h.tick > this.newestTick) {
      this.newestTick = h.tick;
      this.onTimingFeedback(h);
    }
  }

  private insertRecvTick(tick: number): void {
    const a = this.recvTicks;
    let i = a.length;
    while (i > 0 && a[i - 1]! > tick) i--;
    a.splice(i, 0, tick);
    if (a.length > RING - 8) a.shift();
  }

  /** Adjust our input lead so inputs reach the host `targetSlack` ticks before they are needed. */
  private onTimingFeedback(h: SnapshotHeader): void {
    this.stats.inputMisses = h.misses;
    this.stats.slack = h.slack;
    const T = h.tick;
    if (h.misses > this.lastMisses) {
      this.lastMisses = h.misses;
      this.lastMissTick = T;
      if (this.targetSlack < 6) this.targetSlack++;
    } else if (T - this.lastMissTick > 600 && this.targetSlack > 2) {
      this.targetSlack--;
      this.lastMissTick = T;
    }
    if (h.inputTick < 0 || h.slack >= 100 || T < this.adjustCooldown) return;
    const rttTicks = Math.ceil(this.stats.rttMs / (1000 / 60));
    if (h.slack < -20 || h.slack > 60) {
      // We stalled (background tab, debugger) or the link changed drastically: jump straight to the
      // right input tick instead of slowly re-timing; the next snapshot re-anchors the prediction.
      this.predTick += this.targetSlack + 1 - h.slack;
      this.adjust = 0;
      this.predicting = false;
      this.adjustCooldown = T + rttTicks + 40;
      return;
    }
    if (this.adjust !== 0) return;
    let d = 0;
    if (h.slack < this.targetSlack) d = this.targetSlack - h.slack;
    else if (h.slack > this.targetSlack + 3) d = this.targetSlack + 1 - h.slack;
    if (d === 0) return;
    this.adjust = Math.max(-30, Math.min(30, d));
    this.adjustCooldown = T + 2 * Math.abs(this.adjust) + rttTicks + 40;
  }

  private sendInputs(): void {
    const hist = this.history!;
    const newest = this.predTick - 1;
    const buf = this.sendBuf;
    buf.length = 0;
    let first = newest;
    while (first > newest - INPUT_REDUNDANCY + 1 && hist.input(first - 1)) first--;
    for (let t = first; t <= newest; t++) {
      const inp = hist.input(t);
      if (inp) buf.push(inp);
    }
    if (buf.length === 0) return;
    this.transport.send(this.hostPeer, 'unreliable', encodeInputPacket(this.writer, this.ackTick, newest, buf, this.strings));
  }

  // -------------------------------------------------------------------------------------------
  // Players
  // -------------------------------------------------------------------------------------------

  private ensurePlayer(index: number): PlayerState {
    const players = this.world.players;
    while (players.length <= index) {
      const i = players.length;
      players.push(makePlayerTemplate({ name: '', race: '', hat: '', companion: '' }, i, 0));
    }
    return players[index]!;
  }

  private localEntity(): Entity | undefined {
    const p = this.world.players[this.index];
    return p && p.entityId ? this.world.get(p.entityId) : undefined;
  }

  // -------------------------------------------------------------------------------------------
  // Prediction & reconciliation
  // -------------------------------------------------------------------------------------------

  /** Newest received frame of the current epoch (or null). */
  private newestFrame(): RecvFrame | null {
    const ticks = this.recvTicks;
    for (let i = ticks.length - 1; i >= 0; i--) {
      const f = this.ring[this.slotOf(ticks[i]!)]!;
      if (f.tick === ticks[i] && f.epoch === this.epoch) return f;
    }
    return null;
  }

  private reconcile(): void {
    const N = this.newestFrame();
    if (!N || !N.hasOwner || N.tick <= this.lastReconciled) {
      this.syncLocalEntity(N);
      return;
    }
    const e = this.syncLocalEntity(N);
    const p = this.world.players[this.index];
    if (!e || !p) return;
    const owner = this.owner!;
    const hist = this.history!;
    const S = N.tick;
    const t = S - 1;
    const row = N.frame.indexOf(e.id);
    const off = row >= 0 ? row * NF : -1;
    const serverSwing = off >= 0 && N.frame.rows[off + F_SWING]! ? N.frame.rows[off + F_SWING_TICKS]! : 0;
    const hs = this.predicting ? hist.stateOffset(t) : -1;
    this.lastReconciled = S;
    if (hs >= 0 && owner.equal(hist.states, hs, N.owner, 0) && hist.states[hs + owner.n] === serverSwing) return;

    // Mismatch (or first state of a level): rewind to the server state at S and replay.
    const wasPredicting = this.predicting;
    if (DEBUG && wasPredicting) {
      const diffs: string[] = [];
      if (hs < 0) diffs.push('no-history');
      else for (let i = 0; i < owner.n; i++) if (hist.states[hs + i] !== N.owner[i]) diffs.push(`${owner.layout.keys[i]}: ${hist.states[hs + i]} vs ${N.owner[i]}`);
      if (hs >= 0 && hist.states[hs + owner.n] !== serverSwing) diffs.push(`swing ${hist.states[hs + owner.n]} vs ${serverSwing}`);
      console.log(`reconcile S=${S} pred=${this.predTick}`, diffs.join(', '));
    }
    const oldX = e.x;
    const oldY = e.y;
    owner.restore(p, e, N.owner);
    if (off >= 0) for (const k of SWING_FIELDS) ENTITY_FIELDS[k]!.set(e, N.frame.rows[off + k]!, this.strings);
    const from = Math.max(S, this.predTick - MAX_REPLAY);
    for (let k = from; k < this.predTick; k++) this.predictTick(k, this.replayInput(k), true);
    this.predicting = true;
    if (!wasPredicting) return;
    this.stats.reconciles++;
    const dx = oldX - e.x;
    const dy = oldY - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) {
      this.stats.corrections++;
      if (d > this.stats.maxCorrectionPx) this.stats.maxCorrectionPx = d;
      this.offX += dx;
      this.offY += dy;
      if (Math.hypot(this.offX, this.offY) > SNAP_LIMIT_PX) this.offX = this.offY = 0;
    }
  }

  /** The input the host will (most likely) use for tick k — mirrors its repeat-last rule for gaps. */
  private replayInput(k: number): PlayerInput {
    const hist = this.history!;
    const inp = hist.input(k);
    if (inp) return inp;
    if (this.firstInputTick < 0 || k < this.firstInputTick) return EMPTY;
    for (let j = k - 1; j >= this.firstInputTick && j > k - HISTORY; j--) {
      const prev = hist.input(j);
      if (!prev) continue;
      copyInput(this.repeatInput, prev);
      this.repeatInput.select = -1;
      this.repeatInput.skill = -1;
      return this.repeatInput;
    }
    return EMPTY;
  }

  /** One predicted tick; `replay` ticks are silent (their events were already emitted once). */
  private predictTick(t: number, input: PlayerInput, replay: boolean): void {
    const e = this.localEntity();
    const p = this.world.players[this.index];
    if (!e || !p) return;
    const world = this.world;
    world.events.length = 0;
    predictStep(world, p, e, input);
    // Cosmetic: show the newly selected hotbar item at once (the host confirms it in snapshots).
    if (!p.downed && !p.out) e.held = maybeItem(p.inventory[p.selected]?.id)?.id;
    const hist = this.history!;
    const o = hist.stateSlot(t);
    this.owner!.capture(p, e, hist.states, o);
    hist.states[o + this.owner!.n] = e.swing ? e.swing.ticks : 0;
    if (replay) this.stats.replayedTicks++;
    else {
      this.stats.predictedTicks++;
      for (const ev of world.events) {
        this.pending.push(ev);
        const rec = ev as unknown as Record<string, unknown>;
        if (typeof rec.x === 'number' && typeof rec.y === 'number') {
          this.predicted.push({ type: ev.type, key: eventKey(ev), x: rec.x, y: rec.y as number, tick: t + 1 });
        }
      }
    }
    world.events.length = 0;
  }

  /** Create / update / remove the local player entity from the newest frame (non-predicted fields). */
  private syncLocalEntity(N: RecvFrame | null): Entity | undefined {
    const p = this.world.players[this.index];
    if (!N || !p || !p.entityId) return this.localEntity();
    const i = N.frame.indexOf(p.entityId);
    let e = this.world.get(p.entityId);
    if (i < 0) {
      if (e) {
        mirrorRemoveWhere(this.world, (x) => x === e);
        this.predicting = false;
      }
      return undefined;
    }
    if (this.localApplied === N.tick && e) return e;
    const off = i * NF;
    if (!e) {
      e = blankEntity(p.entityId);
      applyRow(e, N.frame.rows, off, this.strings, true);
      e.px = e.x;
      e.py = e.y;
      this.prevVisX = e.x;
      this.prevVisY = e.y;
      mirrorAdd(this.world, e);
      this.predicting = false;
    } else applyRow(e, N.frame.rows, off, this.strings, false, LOCAL_SKIP);
    this.localApplied = N.tick;
    return e;
  }

  private removeVisualOffset(): void {
    const e = this.localEntity();
    if (!e) return;
    e.x -= this.appliedOffX;
    e.y -= this.appliedOffY;
    this.appliedOffX = this.appliedOffY = 0;
  }

  private applyVisualOffset(): void {
    const e = this.localEntity();
    if (!e) return;
    this.offX *= OFFSET_DECAY;
    this.offY *= OFFSET_DECAY;
    if (Math.abs(this.offX) < 0.01) this.offX = 0;
    if (Math.abs(this.offY) < 0.01) this.offY = 0;
    e.px = this.prevVisX;
    e.py = this.prevVisY;
    e.x += this.offX;
    e.y += this.offY;
    this.appliedOffX = this.offX;
    this.appliedOffY = this.offY;
    this.prevVisX = e.x;
    this.prevVisY = e.y;
  }

  /** Visual (smoothing) offset currently added to the local player's position. */
  get correctionOffset(): { x: number; y: number } {
    return { x: this.offX, y: this.offY };
  }

  // -------------------------------------------------------------------------------------------
  // Interpolation
  // -------------------------------------------------------------------------------------------

  private advanceRenderTick(): void {
    let maxLate = 0;
    for (let i = 0; i < 32; i++) if (this.lateness[i]! > maxLate) maxLate = this.lateness[i]!;
    const want = Math.max(2 * this.interval + 1, this.interval + Math.ceil(maxLate) + 1);
    const target = Math.min(15, want);
    // Grow the buffer quickly, shrink it slowly.
    this.interpDelay += target > this.interpDelay ? Math.min(1, target - this.interpDelay) : Math.max(-0.02, target - this.interpDelay);
    this.renderTick += 1;
    const goal = this.serverTickEst - this.interpDelay;
    const diff = goal - this.renderTick;
    if (Math.abs(diff) > 10) this.renderTick = goal;
    else this.renderTick += Math.max(-0.08, Math.min(0.08, diff * 0.1));
  }

  /** Frames bracketing the render tick: [a, b] with a.tick <= R < b.tick (b may be null). */
  private bracket(R: number): [RecvFrame | null, RecvFrame | null] {
    const ticks = this.recvTicks;
    let a: RecvFrame | null = null;
    let b: RecvFrame | null = null;
    for (let i = 0; i < ticks.length; i++) {
      const f = this.ring[this.slotOf(ticks[i]!)]!;
      if (f.tick !== ticks[i] || f.epoch !== this.epoch) continue;
      if (f.tick <= R) a = f;
      else {
        b = f;
        break;
      }
    }
    if (!a && b) return [b, null];
    return [a, b];
  }

  private interpolate(): void {
    const world = this.world;
    const R = this.renderTick;
    const [a, b] = this.bracket(R);
    if (!a) return;
    const localId = this.world.players[this.index]?.entityId ?? 0;
    const fa = a.frame;
    // Entity set + discrete fields follow frame `a`.
    if (a.tick !== this.appliedTick) {
      const prev = this.applied;
      for (let i = 0; i < fa.count; i++) {
        const id = fa.ids[i]!;
        if (id === localId) continue;
        const off = i * NF;
        let e = world.get(id);
        const j = prev.indexOf(id);
        if (!e) {
          e = blankEntity(id);
          applyRow(e, fa.rows, off, this.strings, true);
          e.px = e.x;
          e.py = e.y;
          mirrorAdd(world, e);
        } else if (j < 0) applyRow(e, fa.rows, off, this.strings, false, REMOTE_SKIP);
        else applyRowDiff(e, fa.rows, off, prev.rows, j * NF, this.strings);
      }
      mirrorRemoveWhere(world, (e) => e.id !== localId && fa.indexOf(e.id) < 0);
      prev.copyFrom(fa);
      this.appliedTick = a.tick;
    }
    // Positions: lerp a → b at R.
    const fb = b ? b.frame : null;
    const span = b ? b.tick - a.tick : 1;
    const t = b ? Math.max(0, Math.min(1, (R - a.tick) / span)) : 0;
    for (let i = 0; i < fa.count; i++) {
      const id = fa.ids[i]!;
      if (id === localId) continue;
      const e = world.get(id);
      if (!e) continue;
      const off = i * NF;
      let x = fa.rows[off + FX]! / 16;
      let y = fa.rows[off + FY]! / 16;
      if (fb) {
        const j = fb.indexOf(id);
        if (j >= 0) {
          const bx = fb.rows[j * NF + FX]! / 16;
          const by = fb.rows[j * NF + FY]! / 16;
          if (Math.abs(bx - x) < TELEPORT_PX && Math.abs(by - y) < TELEPORT_PX) {
            x += (bx - x) * t;
            y += (by - y) * t;
          }
        }
      }
      e.px = e.x;
      e.py = e.y;
      e.x = x;
      e.y = y;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------------------------

  private releaseEvents(): void {
    const R = this.renderTick;
    const q = this.events;
    let w = 0;
    for (let i = 0; i < q.length; i++) {
      const it = q[i]!;
      if (it.tick > R) {
        q[w++] = it;
        continue;
      }
      if (!this.suppressed(it.ev, it.tick)) this.pending.push(it.ev);
    }
    q.length = w;
    // Forget old predictions.
    const pr = this.predicted;
    let k = 0;
    for (let i = 0; i < pr.length; i++) if (pr[i]!.tick > this.predTick - 180) pr[k++] = pr[i]!;
    pr.length = k;
  }

  /** True if the client already emitted this event itself through prediction. */
  private suppressed(ev: GameEvent, tick: number): boolean {
    const rec = ev as unknown as Record<string, unknown>;
    if (typeof rec.x !== 'number' || typeof rec.y !== 'number') return false;
    const key = eventKey(ev);
    const pr = this.predicted;
    for (let i = 0; i < pr.length; i++) {
      const p = pr[i]!;
      if (p.type !== ev.type || p.key !== key || Math.abs(p.tick - tick) > 8) continue;
      if (Math.abs(p.x - (rec.x as number)) > 24 || Math.abs(p.y - (rec.y as number)) > 24) continue;
      pr.splice(i, 1);
      return true;
    }
    return false;
  }
}

function eventKey(ev: GameEvent): string {
  const rec = ev as unknown as Record<string, unknown>;
  return typeof rec.id === 'string' ? rec.id : typeof rec.preset === 'string' ? rec.preset : '';
}

/** Apply only the fields that changed between two rows (x/y are interpolated separately). */
function applyRowDiff(e: Entity, rows: Int32Array, off: number, prev: Int32Array, prevOff: number, strings: ReturnType<typeof createStringTable>): void {
  for (let k = 0; k < NF; k++) {
    if (REMOTE_SKIP[k]) continue;
    const v = rows[off + k]!;
    if (v === prev[prevOff + k]) continue;
    ENTITY_FIELDS[k]!.set(e, v, strings);
  }
}

const DEBUG = typeof process !== 'undefined' && !!process.env?.NET_DEBUG;
const EMPTY: PlayerInput = emptyInput();
const NO_COMMANDS: PlayerInput['commands'] = [];
void F_PLAYER_INDEX;
