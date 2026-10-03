import { Rng } from '../engine/rng';

/**
 * Transport abstraction for the netcode. Peers are small integers local to this transport
 * (implementations map their native ids, e.g. trystero's string peer ids, to numbers).
 *
 * Channels:
 *  - `reliable`: ordered, lossless (WebRTC reliable DataChannel / WebSocket / trystero action).
 *  - `unreliable`: unordered, may drop or duplicate (WebRTC DataChannel with ordered:false,
 *    maxRetransmits:0). Implementations without one fall back to the reliable path.
 *
 * Ownership: `send`/`broadcast` never retain `data` after returning (callers reuse buffers).
 * Received `data` is owned by the receiver.
 */
export type PeerId = number;
export type Channel = 'reliable' | 'unreliable';

export interface TransportStats {
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
}

export type MessageHandler = (peer: PeerId, channel: Channel, data: Uint8Array) => void;
export type PeerHandler = (peer: PeerId) => void;

export interface Transport {
  /** This endpoint's id (unique within the room as seen by this transport). */
  readonly selfId: PeerId;
  readonly stats: TransportStats;
  readonly closed: boolean;
  /** Peers currently connected. */
  peers(): readonly PeerId[];
  send(peer: PeerId, channel: Channel, data: Uint8Array): void;
  broadcast(channel: Channel, data: Uint8Array): void;
  /** Subscribe; returns an unsubscribe function. */
  onMessage(fn: MessageHandler): () => void;
  onPeerJoin(fn: PeerHandler): () => void;
  onPeerLeave(fn: PeerHandler): () => void;
  close(): void;
}

export function emptyStats(): TransportStats {
  return { bytesIn: 0, bytesOut: 0, packetsIn: 0, packetsOut: 0 };
}

/** Listener bookkeeping + stats shared by transport implementations. */
export abstract class TransportBase implements Transport {
  abstract readonly selfId: PeerId;
  readonly stats = emptyStats();
  closed = false;
  private msgFns: readonly MessageHandler[] = [];
  private joinFns: readonly PeerHandler[] = [];
  private leaveFns: readonly PeerHandler[] = [];

  abstract peers(): readonly PeerId[];
  abstract send(peer: PeerId, channel: Channel, data: Uint8Array): void;
  abstract close(): void;

  broadcast(channel: Channel, data: Uint8Array): void {
    for (const p of this.peers()) this.send(p, channel, data);
  }

  // Listener lists are copy-on-write: (un)subscribing swaps in a new array, so emitting iterates a
  // stable list without copying it for every packet.
  onMessage(fn: MessageHandler): () => void {
    this.msgFns = [...this.msgFns, fn];
    return () => void (this.msgFns = this.msgFns.filter((f) => f !== fn));
  }

  onPeerJoin(fn: PeerHandler): () => void {
    this.joinFns = [...this.joinFns, fn];
    return () => void (this.joinFns = this.joinFns.filter((f) => f !== fn));
  }

  onPeerLeave(fn: PeerHandler): () => void {
    this.leaveFns = [...this.leaveFns, fn];
    return () => void (this.leaveFns = this.leaveFns.filter((f) => f !== fn));
  }

  protected emitMessage(peer: PeerId, channel: Channel, data: Uint8Array): void {
    this.stats.bytesIn += data.length;
    this.stats.packetsIn++;
    const fns = this.msgFns;
    for (let i = 0; i < fns.length; i++) fns[i]!(peer, channel, data);
  }

  protected emitJoin(peer: PeerId): void {
    const fns = this.joinFns;
    for (let i = 0; i < fns.length; i++) fns[i]!(peer);
  }

  protected emitLeave(peer: PeerId): void {
    const fns = this.leaveFns;
    for (let i = 0; i < fns.length; i++) fns[i]!(peer);
  }

  protected countOut(bytes: number): void {
    this.stats.bytesOut += bytes;
    this.stats.packetsOut++;
  }
}

// ---------------------------------------------------------------------------------------------
// Loopback network (tests): virtual clock, latency, jitter, loss, duplication, reordering.
// ---------------------------------------------------------------------------------------------

export interface LinkConditions {
  /** One-way base latency in ms (RTT ≈ 2×). */
  latencyMs: number;
  /** Extra uniform random delay in [0, jitterMs] per packet. */
  jitterMs: number;
  /** Probability an unreliable packet is dropped. On the reliable channel a "loss" costs a retransmit delay instead. */
  loss: number;
  /** Probability an unreliable packet is delivered twice. */
  duplicate: number;
}

export const PERFECT_LINK: LinkConditions = { latencyMs: 0, jitterMs: 0, loss: 0, duplicate: 0 };

interface Pending {
  at: number;
  seq: number;
  kind: 'msg' | 'join' | 'leave';
  from: number;
  to: number;
  channel: Channel;
  data: Uint8Array | null;
}

/** Binary min-heap ordered by (at, seq): deterministic delivery order. */
class EventQueue {
  private h: Pending[] = [];
  get size(): number {
    return this.h.length;
  }
  peek(): Pending | undefined {
    return this.h[0];
  }
  push(p: Pending): void {
    const h = this.h;
    h.push(p);
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!less(h[i]!, h[parent]!)) break;
      [h[i], h[parent]] = [h[parent]!, h[i]!];
      i = parent;
    }
  }
  pop(): Pending | undefined {
    const h = this.h;
    if (h.length === 0) return undefined;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && less(h[l]!, h[m]!)) m = l;
        if (r < h.length && less(h[r]!, h[m]!)) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m]!, h[i]!];
        i = m;
      }
    }
    return top;
  }
}

function less(a: Pending, b: Pending): boolean {
  return a.at < b.at || (a.at === b.at && a.seq < b.seq);
}

/**
 * A simulated room. Every `join()` creates a peer that connects to all existing peers (full mesh,
 * like a trystero room). Time only moves via `advance(ms)`, which synchronously delivers every
 * due packet/event in timestamp order. All randomness comes from a seeded Rng → reproducible runs.
 */
export class LoopbackNetwork {
  private t = 0;
  private seq = 0;
  private rng: Rng;
  private queue = new EventQueue();
  private nodes = new Map<number, LoopbackTransport>();
  private nextId = 1;
  private links = new Map<string, LinkConditions>();
  private down = new Set<string>();
  private lastReliable = new Map<string, number>();
  private connected = new Set<string>();
  conditions: LinkConditions;
  /** Delay before a joining peer sees (and is seen by) the others. */
  connectDelayMs: number;
  /** How long until peers notice an abrupt disconnect (`crash()`). */
  crashDetectMs: number;

  constructor(opts: { seed?: number; conditions?: Partial<LinkConditions>; connectDelayMs?: number; crashDetectMs?: number } = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.conditions = { ...PERFECT_LINK, ...opts.conditions };
    this.connectDelayMs = opts.connectDelayMs ?? 30;
    this.crashDetectMs = opts.crashDetectMs ?? 2000;
  }

  /** Virtual time in ms. */
  now(): number {
    return this.t;
  }

  /** A clock function suitable for session options. */
  readonly clock = (): number => this.t;

  /** Override conditions for the directed link a → b (or both directions when `bidirectional`). */
  setLink(a: PeerId, b: PeerId, cond: Partial<LinkConditions>, bidirectional = true): void {
    this.links.set(`${a}>${b}`, { ...this.conditions, ...cond });
    if (bidirectional) this.links.set(`${b}>${a}`, { ...this.conditions, ...cond });
  }

  /** Silently black-hole a link (no leave event), e.g. to test timeouts. */
  setLinkDown(a: PeerId, b: PeerId, isDown: boolean): void {
    for (const k of [`${a}>${b}`, `${b}>${a}`]) {
      if (isDown) this.down.add(k);
      else this.down.delete(k);
    }
  }

  join(): LoopbackTransport {
    const id = this.nextId++;
    const node = new LoopbackTransport(this, id);
    for (const other of this.nodes.values()) {
      if (other.closed) continue;
      this.schedule({ at: this.t + this.connectDelayMs, kind: 'join', from: other.selfId, to: id, channel: 'reliable', data: null });
      this.schedule({ at: this.t + this.connectDelayMs, kind: 'join', from: id, to: other.selfId, channel: 'reliable', data: null });
    }
    this.nodes.set(id, node);
    return node;
  }

  /** Deliver everything due up to now + ms. */
  advance(ms: number): void {
    const until = this.t + ms;
    for (;;) {
      const p = this.queue.peek();
      if (!p || p.at > until) break;
      this.queue.pop();
      this.t = Math.max(this.t, p.at);
      this.deliver(p);
    }
    this.t = until;
  }

  /** Number of packets/events in flight. */
  get inFlight(): number {
    return this.queue.size;
  }

  private cond(from: number, to: number): LinkConditions {
    return this.links.get(`${from}>${to}`) ?? this.conditions;
  }

  private schedule(p: Omit<Pending, 'seq'>): void {
    this.queue.push({ ...p, seq: this.seq++ });
  }

  private deliver(p: Pending): void {
    const to = this.nodes.get(p.to);
    if (!to || to.closed) return;
    const key = `${p.from}>${p.to}`;
    if (p.kind === 'join') {
      const from = this.nodes.get(p.from);
      if (!from || from.closed) return;
      // The link opens in both directions at once (a peer may send from its onPeerJoin handler
      // before the other side's join event has been delivered).
      this.connected.add(key);
      this.connected.add(`${p.to}>${p.from}`);
      to.addPeer(p.from);
      return;
    }
    if (p.kind === 'leave') {
      if (!this.connected.delete(key)) return;
      to.removePeer(p.from);
      return;
    }
    if (!this.connected.has(key) || this.down.has(key)) return;
    to.receive(p.from, p.channel, p.data!);
  }

  /** Called by a transport to send. Copies `data` (the caller may reuse its buffer). */
  transmit(from: number, to: number, channel: Channel, data: Uint8Array): void {
    const key = `${from}>${to}`;
    if (!this.connected.has(key) || this.down.has(key)) return;
    const c = this.cond(from, to);
    const delay = () => c.latencyMs + (c.jitterMs > 0 ? this.rng.next() * c.jitterMs : 0);
    if (channel === 'unreliable') {
      if (c.loss > 0 && this.rng.chance(c.loss)) return;
      this.schedule({ at: this.t + delay(), kind: 'msg', from, to, channel, data: data.slice() });
      if (c.duplicate > 0 && this.rng.chance(c.duplicate)) {
        this.schedule({ at: this.t + delay(), kind: 'msg', from, to, channel, data: data.slice() });
      }
      return;
    }
    // Reliable: FIFO per link; each simulated loss costs a retransmission (~RTT + jitter).
    let at = this.t + delay();
    while (c.loss > 0 && this.rng.chance(c.loss)) at += 2 * c.latencyMs + c.jitterMs + 10;
    at = Math.max(at, this.lastReliable.get(key) ?? 0);
    this.lastReliable.set(key, at);
    this.schedule({ at, kind: 'msg', from, to, channel, data: data.slice() });
  }

  /** Graceful or abrupt departure of a node. */
  leave(id: number, abrupt: boolean): void {
    for (const other of this.nodes.values()) {
      if (other.selfId === id || other.closed) continue;
      // Abrupt: in-flight packets from the dead peer are lost.
      if (abrupt) {
        this.down.add(`${id}>${other.selfId}`);
        this.down.add(`${other.selfId}>${id}`);
      }
      // Graceful: the close follows the reliable data already sent on that link (e.g. a Leave
      // message sent right before close()), like a TCP FIN / SCTP shutdown does.
      const at = abrupt
        ? this.t + this.crashDetectMs
        : Math.max(this.t + this.cond(id, other.selfId).latencyMs, this.lastReliable.get(`${id}>${other.selfId}`) ?? 0);
      this.schedule({ at, kind: 'leave', from: id, to: other.selfId, channel: 'reliable', data: null });
    }
  }
}

export class LoopbackTransport extends TransportBase {
  private connected: PeerId[] = [];

  constructor(
    private readonly net: LoopbackNetwork,
    readonly selfId: PeerId,
  ) {
    super();
  }

  peers(): readonly PeerId[] {
    return this.connected;
  }

  send(peer: PeerId, channel: Channel, data: Uint8Array): void {
    if (this.closed) return;
    this.countOut(data.length);
    this.net.transmit(this.selfId, peer, channel, data);
  }

  /** Graceful close: peers get onPeerLeave after the link latency. */
  close(): void {
    if (this.closed) return;
    this.net.leave(this.selfId, false);
    this.closed = true;
    this.connected = [];
  }

  /** Simulate a crash / network loss: peers notice after `crashDetectMs`. */
  crash(): void {
    if (this.closed) return;
    this.net.leave(this.selfId, true);
    this.closed = true;
    this.connected = [];
  }

  /** @internal */
  addPeer(p: PeerId): void {
    if (this.connected.includes(p)) return;
    this.connected.push(p);
    this.emitJoin(p);
  }

  /** @internal */
  removePeer(p: PeerId): void {
    const i = this.connected.indexOf(p);
    if (i < 0) return;
    this.connected.splice(i, 1);
    this.emitLeave(p);
  }

  /** @internal */
  receive(from: PeerId, channel: Channel, data: Uint8Array): void {
    this.emitMessage(from, channel, data);
  }
}
