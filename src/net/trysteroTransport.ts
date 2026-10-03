import { type Channel, type PeerId, TransportBase } from './transport';

/**
 * Real P2P transport on top of trystero (serverless WebRTC; signaling over public Nostr relays by
 * default — no server of ours involved).
 *
 *  - Room = `appId` + room code (+ optional password, which also encrypts the signaling).
 *  - `reliable`: a trystero action (binary, ordered, chunked by trystero for large payloads).
 *  - `unreliable`: our own extra DataChannel on each peer's RTCPeerConnection (`negotiated: true`,
 *    fixed id, `ordered: false`, `maxRetransmits: 0`) — both sides create it with the same id, so no
 *    extra signaling is needed. Until it is open (or when the browser refuses), packets fall back to
 *    the reliable path.
 *  - Strategy: Nostr is bundled; pass any trystero-compatible `joinRoom` (torrent / mqtt / supabase /
 *    firebase packages, or a self-hosted relay strategy) to use another signaling backend. For Nostr,
 *    `relayUrls` points at self-hosted relays (e.g. a `nostr-rs-relay` or the Cloudflare relay in
 *    server/README.md).
 *
 * Browser only (needs RTCPeerConnection). Not covered by integration tests here (no network); the
 * pure bits (peer id mapping, channel selection) are unit-tested with a fake room.
 */

/** Minimal structural types of the trystero API we use (keeps this file decoupled from its typings). */
export interface TrysteroRoomLike {
  makeAction: (namespace: string, config?: { onMessage?: (data: unknown, ctx: { peerId: string }) => void }) => {
    send: (data: Uint8Array, opts?: { target?: string | string[] | null }) => Promise<void>;
  };
  getPeers: () => Record<string, RTCPeerConnection>;
  leave: () => Promise<void>;
  onPeerJoin: ((peerId: string) => void) | null;
  onPeerLeave: ((peerId: string) => void) | null;
}

export type JoinRoomFn = (config: Record<string, unknown>, roomId: string, callbacks?: Record<string, unknown>) => TrysteroRoomLike;

export interface TrysteroOptions {
  /** Room code shared out of band (see makeRoomCode). */
  roomCode: string;
  /** Namespaces rooms per game/build (default 'shardfall-v1'). */
  appId?: string;
  /** Optional room password (peers without it cannot join or read signaling). */
  password?: string;
  /** Nostr relay URLs to use instead of trystero's public defaults (e.g. a self-hosted relay). */
  relayUrls?: string[];
  /** How many relays to use at once (trystero default 5). */
  relayRedundancy?: number;
  /** ICE servers etc. Default: trystero's public STUN list. Add TURN for strict NATs. */
  rtcConfig?: RTCConfiguration;
  turnConfig?: { urls: string | string[]; username?: string; credential?: string }[];
  /** Signaling strategy: any trystero `joinRoom`. Default: Nostr (bundled with `trystero`). */
  joinRoom?: JoinRoomFn;
  /** Extra strategy-specific config merged into the trystero config. */
  extraConfig?: Record<string, unknown>;
  /** Called on signaling failures (bad password, relay errors). */
  onJoinError?: (details: { error: string }) => void;
}

/** DataChannel id of our unreliable channel (trystero's own channel uses auto-assigned low ids). */
export const UNRELIABLE_CHANNEL_ID = 117;
/** Drop unreliable packets when this much is already queued (they would arrive stale anyway). */
const MAX_UNRELIABLE_BUFFER = 64 * 1024;

/** Bidirectional mapping between trystero's string peer ids and our small numeric ids (≥ 1). */
export class PeerIdMap {
  private toN = new Map<string, number>();
  private toS = new Map<number, string>();
  private next = 1;

  /** Numeric id for a string id, allocating one if new. */
  id(s: string): number {
    let n = this.toN.get(s);
    if (n === undefined) {
      n = this.next++;
      this.toN.set(s, n);
      this.toS.set(n, s);
    }
    return n;
  }

  has(s: string): boolean {
    return this.toN.has(s);
  }

  str(n: number): string | undefined {
    return this.toS.get(n);
  }

  remove(s: string): number | undefined {
    const n = this.toN.get(s);
    if (n === undefined) return undefined;
    this.toN.delete(s);
    this.toS.delete(n);
    return n;
  }
}

interface PeerLink {
  str: string;
  channel: RTCDataChannel | null;
  /** Serializes reliable sends so the trystero action never reorders them. */
  chain: Promise<void>;
}

export class TrysteroTransport extends TransportBase {
  readonly selfId: PeerId = 0;
  private readonly ids = new PeerIdMap();
  private readonly links = new Map<PeerId, PeerLink>();
  private readonly order: PeerId[] = [];
  private readonly action: ReturnType<TrysteroRoomLike['makeAction']>;

  constructor(private readonly room: TrysteroRoomLike) {
    super();
    this.action = room.makeAction('g', {
      onMessage: (data, ctx) => {
        if (this.closed) return;
        const bytes = toBytes(data);
        if (!bytes) return;
        const peer = this.ids.id(ctx.peerId);
        if (!this.links.has(peer)) this.addPeer(ctx.peerId);
        // Unreliable packets that fell back to the reliable path carry a 1-byte channel prefix.
        if (bytes.length > 0 && bytes[0] === FALLBACK_TAG) this.emitMessage(peer, 'unreliable', bytes.subarray(1));
        else if (bytes.length > 0 && bytes[0] === RELIABLE_TAG) this.emitMessage(peer, 'reliable', bytes.subarray(1));
      },
    });
    room.onPeerJoin = (id) => this.addPeer(id);
    room.onPeerLeave = (id) => this.removePeer(id);
    for (const id of Object.keys(room.getPeers())) this.addPeer(id);
  }

  peers(): readonly PeerId[] {
    return this.order;
  }

  /** trystero's string id for a numeric peer (for display / debugging). */
  peerName(peer: PeerId): string | undefined {
    return this.ids.str(peer);
  }

  /** True once the unreliable DataChannel to `peer` is open. */
  hasUnreliable(peer: PeerId): boolean {
    return this.links.get(peer)?.channel?.readyState === 'open';
  }

  send(peer: PeerId, channel: Channel, data: Uint8Array): void {
    if (this.closed) return;
    const link = this.links.get(peer);
    if (!link) return;
    this.countOut(data.length);
    if (channel === 'unreliable') {
      const ch = link.channel;
      if (ch && ch.readyState === 'open') {
        if (ch.bufferedAmount > MAX_UNRELIABLE_BUFFER) return;
        try {
          ch.send(data.slice());
          return;
        } catch {
          // fall through to the reliable path
        }
      }
    }
    // Copy now: callers reuse their buffers, and trystero's send is async.
    const framed = new Uint8Array(data.length + 1);
    framed[0] = channel === 'unreliable' ? FALLBACK_TAG : RELIABLE_TAG;
    framed.set(data, 1);
    link.chain = link.chain.then(() => this.action.send(framed, { target: link.str })).catch(() => {});
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const l of this.links.values()) l.channel?.close();
    this.links.clear();
    this.order.length = 0;
    void this.room.leave();
  }

  private addPeer(id: string): void {
    if (this.closed) return;
    const peer = this.ids.id(id);
    if (this.links.has(peer)) return;
    const link: PeerLink = { str: id, channel: null, chain: Promise.resolve() };
    this.links.set(peer, link);
    this.order.push(peer);
    link.channel = this.openUnreliable(id, peer);
    this.emitJoin(peer);
  }

  private removePeer(id: string): void {
    const peer = this.ids.remove(id);
    if (peer === undefined) return;
    const link = this.links.get(peer);
    link?.channel?.close();
    this.links.delete(peer);
    const i = this.order.indexOf(peer);
    if (i >= 0) this.order.splice(i, 1);
    this.emitLeave(peer);
  }

  private openUnreliable(id: string, peer: PeerId): RTCDataChannel | null {
    const pc = this.room.getPeers()[id];
    if (!pc || typeof pc.createDataChannel !== 'function') return null;
    try {
      const ch = pc.createDataChannel('u', { negotiated: true, id: UNRELIABLE_CHANNEL_ID, ordered: false, maxRetransmits: 0 });
      ch.binaryType = 'arraybuffer';
      ch.onmessage = (ev: MessageEvent) => {
        if (this.closed) return;
        const bytes = toBytes(ev.data);
        if (bytes) this.emitMessage(peer, 'unreliable', bytes);
      };
      return ch;
    } catch {
      return null;
    }
  }
}

const RELIABLE_TAG = 1;
const FALLBACK_TAG = 2;

function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

/**
 * Join a room. Resolves immediately with a transport (peers appear through onPeerJoin as WebRTC
 * connections come up). Trystero is loaded lazily so it stays out of the single-player bundle.
 */
export async function joinTrysteroRoom(opts: TrysteroOptions): Promise<TrysteroTransport> {
  const join: JoinRoomFn = opts.joinRoom ?? ((await import('trystero')).joinRoom as unknown as JoinRoomFn);
  const config: Record<string, unknown> = { appId: opts.appId ?? 'shardfall-v1', ...opts.extraConfig };
  if (opts.password) config.password = opts.password;
  if (opts.rtcConfig) config.rtcConfig = opts.rtcConfig;
  if (opts.turnConfig) config.turnConfig = opts.turnConfig;
  if (opts.relayUrls || opts.relayRedundancy) {
    config.relayConfig = { ...(opts.relayUrls ? { urls: opts.relayUrls } : {}), ...(opts.relayRedundancy ? { redundancy: opts.relayRedundancy } : {}) };
  }
  const room = join(config, normalizeRoomCode(opts.roomCode), opts.onJoinError ? { onJoinError: opts.onJoinError } : undefined);
  return new TrysteroTransport(room);
}

/** Unambiguous alphabet for spoken/typed room codes (no 0/O, 1/I/L, U/V). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZ23456789';

/** A short random room code like `KX7-P2Q`. `rand` returns [0, 1) (default crypto-strong). */
export function makeRoomCode(rand: () => number = cryptoRandom, length = 6): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    if (i === length / 2) s += '-';
    s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  }
  return s;
}

/** Case/spacing-insensitive form used as the trystero room id. */
export function normalizeRoomCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cryptoRandom(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0]! / 4294967296;
}
