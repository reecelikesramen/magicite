import { type Channel, type PeerId, TransportBase } from './transport';

/**
 * WebSocket transports: the fallback when WebRTC is unavailable (some Linux WebKitGTK builds,
 * locked-down networks) and the link to the optional dedicated Bun server (server/dedicated.ts).
 *
 * TCP has no unreliable mode, so both channels share the socket; each frame is
 * `[u8 channel tag][payload]`. Unreliable frames are dropped (not queued) when the socket is
 * backed up, which keeps snapshots fresh instead of letting latency grow.
 *
 * Socket objects are structural (`WebSocketLike`) so the same code runs with browser WebSockets,
 * Bun's ServerWebSocket and the fakes used in tests.
 */
export interface WebSocketLike {
  readonly readyState: number;
  /** Browser WebSocket. */
  readonly bufferedAmount?: number;
  /** Bun's ServerWebSocket has no `bufferedAmount` property, only this method. */
  getBufferedAmount?(): number;
  send(data: Uint8Array): unknown;
  close(code?: number, reason?: string): void;
}

const TAG_RELIABLE = 1;
const TAG_UNRELIABLE = 2;
const OPEN = 1;
const MAX_UNRELIABLE_BUFFER = 64 * 1024;

function frame(channel: Channel, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 1);
  out[0] = channel === 'reliable' ? TAG_RELIABLE : TAG_UNRELIABLE;
  out.set(data, 1);
  return out;
}

function unframe(raw: unknown): { channel: Channel; data: Uint8Array } | null {
  let bytes: Uint8Array | null = null;
  if (raw instanceof Uint8Array) bytes = raw;
  else if (raw instanceof ArrayBuffer) bytes = new Uint8Array(raw);
  else if (ArrayBuffer.isView(raw)) bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (!bytes || bytes.length === 0) return null;
  const tag = bytes[0];
  if (tag !== TAG_RELIABLE && tag !== TAG_UNRELIABLE) return null;
  return { channel: tag === TAG_RELIABLE ? 'reliable' : 'unreliable', data: bytes.subarray(1) };
}

function buffered(ws: WebSocketLike): number {
  return typeof ws.getBufferedAmount === 'function' ? ws.getBufferedAmount() : (ws.bufferedAmount ?? 0);
}

function sendFramed(ws: WebSocketLike, channel: Channel, data: Uint8Array): boolean {
  if (ws.readyState !== OPEN) return false;
  if (channel === 'unreliable' && buffered(ws) > MAX_UNRELIABLE_BUFFER) return false;
  ws.send(frame(channel, data));
  return true;
}

/** Server side: one peer per accepted socket. Wire `accept/receive/drop` to the server's ws events. */
export class WebSocketServerTransport extends TransportBase {
  readonly selfId: PeerId = 0;
  private readonly sockets = new Map<PeerId, WebSocketLike>();
  private readonly order: PeerId[] = [];
  private next = 1;

  peers(): readonly PeerId[] {
    return this.order;
  }

  /** A socket connected; returns its peer id (store it on the socket). */
  accept(ws: WebSocketLike): PeerId {
    const id = this.next++;
    this.sockets.set(id, ws);
    this.order.push(id);
    this.emitJoin(id);
    return id;
  }

  receive(peer: PeerId, raw: unknown): void {
    if (this.closed || !this.sockets.has(peer)) return;
    const m = unframe(raw);
    if (m) this.emitMessage(peer, m.channel, m.data);
  }

  drop(peer: PeerId): void {
    if (!this.sockets.delete(peer)) return;
    const i = this.order.indexOf(peer);
    if (i >= 0) this.order.splice(i, 1);
    this.emitLeave(peer);
  }

  send(peer: PeerId, channel: Channel, data: Uint8Array): void {
    const ws = this.sockets.get(peer);
    if (!ws || this.closed) return;
    if (sendFramed(ws, channel, data)) this.countOut(data.length);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const ws of this.sockets.values()) ws.close(1001, 'server closing');
    this.sockets.clear();
    this.order.length = 0;
  }
}

/** Client side: a single connection; the server (host) is peer 1. */
export class WebSocketClientTransport extends TransportBase {
  readonly selfId: PeerId = 0;
  static readonly SERVER: PeerId = 1;
  private open = false;

  constructor(private readonly ws: WebSocketLike & {
    binaryType?: string;
    onopen: ((ev: unknown) => void) | null;
    onmessage: ((ev: { data: unknown }) => void) | null;
    onclose: ((ev: unknown) => void) | null;
  }) {
    super();
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      this.open = true;
      this.emitJoin(WebSocketClientTransport.SERVER);
    };
    ws.onmessage = (ev) => {
      if (this.closed) return;
      const m = unframe(ev.data);
      if (m) this.emitMessage(WebSocketClientTransport.SERVER, m.channel, m.data);
    };
    ws.onclose = () => {
      if (!this.open) return;
      this.open = false;
      this.emitLeave(WebSocketClientTransport.SERVER);
    };
    if (ws.readyState === OPEN) queueMicrotask(() => ws.onopen?.(null));
  }

  peers(): readonly PeerId[] {
    return this.open ? SERVER_ONLY : NONE;
  }

  send(peer: PeerId, channel: Channel, data: Uint8Array): void {
    if (this.closed || peer !== WebSocketClientTransport.SERVER) return;
    if (sendFramed(this.ws, channel, data)) this.countOut(data.length);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.ws.close(1000, 'bye');
  }
}

const SERVER_ONLY: readonly PeerId[] = [WebSocketClientTransport.SERVER];
const NONE: readonly PeerId[] = [];

/** Browser helper: connect to `ws(s)://host:port` (e.g. the dedicated server). */
export function connectWebSocket(url: string): WebSocketClientTransport {
  return new WebSocketClientTransport(new WebSocket(url) as unknown as ConstructorParameters<typeof WebSocketClientTransport>[0]);
}
