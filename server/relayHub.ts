/**
 * Minimal Nostr relay core (NIP-01 subset) — just enough for trystero's WebRTC signaling.
 *
 * trystero publishes short-lived, signed events (`kind` 20000–29999, one `#x` topic tag) and
 * subscribes with `{ kinds, since, '#x': [...] }`. Signaling events are only useful live, so this
 * relay stores nothing: an EVENT is acknowledged and fanned out to matching subscriptions. That
 * keeps it tiny, stateless and cheap enough for a free-tier VM, Fly/Railway box or Cloudflare.
 *
 * Signatures are not verified (SDP offers are encrypted with the room key by trystero). Abuse
 * limits: message size, subscriptions per socket, events per second per socket, and only
 * ephemeral kinds are accepted.
 *
 * The core is `handleRelayMessage`, a pure function over plain, JSON-serializable per-connection
 * state — so the in-memory `RelayHub` (Bun, tests) and the Cloudflare Durable Object (state kept in
 * hibernatable WebSocket attachments) share one implementation.
 */

export interface RelayLimits {
  /** Max bytes per message. */
  maxMessage: number;
  /** Max open subscriptions per connection. */
  maxSubs: number;
  /** Max topics (`#x` values) per filter. */
  maxTopics: number;
  /** Max EVENTs per connection per second. */
  eventsPerSecond: number;
}

export const DEFAULT_LIMITS: RelayLimits = { maxMessage: 64 * 1024, maxSubs: 32, maxTopics: 300, eventsPerSecond: 40 };

export interface RelayFilter {
  kinds: number[] | null;
  topics: string[] | null;
  since: number;
}

/** Per-connection state (plain data). */
export interface RelayConnState {
  subs: Record<string, RelayFilter[]>;
  windowStart: number;
  windowCount: number;
}

export interface RelayPeer {
  state: RelayConnState;
  send: (msg: string) => void;
}

export interface RelayStats {
  events: number;
  delivered: number;
  rejected: number;
}

interface NostrEvent {
  id: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export function newRelayConn(): RelayConnState {
  return { subs: {}, windowStart: 0, windowCount: 0 };
}

/**
 * Handle one message from `self`. Mutates only `self.state` (and `stats`); fan-out goes through
 * `others` (every open connection, `self` included or not — duplicates are skipped by identity).
 * Returns true if `self.state` changed (callers persisting state can skip unchanged writes).
 */
export function handleRelayMessage(
  self: RelayPeer,
  raw: string,
  peers: Iterable<RelayPeer>,
  nowMs: number,
  limits: RelayLimits = DEFAULT_LIMITS,
  stats?: RelayStats,
): boolean {
  const notice = (text: string) => self.send(JSON.stringify(['NOTICE', text]));
  if (raw.length > limits.maxMessage) return notice('message too large'), false;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return notice('invalid JSON'), false;
  }
  if (!Array.isArray(msg) || typeof msg[0] !== 'string') return notice('invalid message'), false;
  const c = self.state;
  switch (msg[0]) {
    case 'EVENT': {
      const ev = msg[1];
      if (!isEvent(ev)) return notice('invalid event'), false;
      if (nowMs - c.windowStart >= 1000) {
        c.windowStart = nowMs;
        c.windowCount = 0;
      }
      if (++c.windowCount > limits.eventsPerSecond) {
        if (stats) stats.rejected++;
        self.send(JSON.stringify(['OK', ev.id, false, 'rate-limited: slow down']));
        return true;
      }
      if (ev.kind < 20000 || ev.kind >= 30000) {
        if (stats) stats.rejected++;
        self.send(JSON.stringify(['OK', ev.id, false, 'blocked: only ephemeral events are relayed']));
        return true;
      }
      if (stats) stats.events++;
      self.send(JSON.stringify(['OK', ev.id, true, '']));
      const topics = ev.tags.filter((tg) => tg[0] === 'x').map((tg) => tg[1]!);
      for (const other of peers) {
        for (const subId in other.state.subs) {
          if (other.state.subs[subId]!.some((f) => matches(f, ev, topics))) {
            other.send(JSON.stringify(['EVENT', subId, ev]));
            if (stats) stats.delivered++;
          }
        }
      }
      return true;
    }
    case 'REQ': {
      const subId = msg[1];
      if (typeof subId !== 'string' || subId.length > 128) return notice('invalid subscription id'), false;
      if (!(subId in c.subs) && Object.keys(c.subs).length >= limits.maxSubs) {
        self.send(JSON.stringify(['CLOSED', subId, 'error: too many subscriptions']));
        return false;
      }
      const filters: RelayFilter[] = [];
      for (const f of msg.slice(2)) {
        if (!f || typeof f !== 'object') continue;
        const o = f as Record<string, unknown>;
        const kinds = Array.isArray(o.kinds) ? o.kinds.filter((k): k is number => typeof k === 'number') : null;
        const xs = Array.isArray(o['#x']) ? o['#x'].filter((x): x is string => typeof x === 'string') : null;
        if (xs && xs.length > limits.maxTopics) {
          self.send(JSON.stringify(['CLOSED', subId, 'error: too many topics']));
          return false;
        }
        filters.push({ kinds, topics: xs, since: typeof o.since === 'number' ? o.since : 0 });
      }
      c.subs[subId] = filters;
      // Nothing is stored, so the stored-events phase is always empty.
      self.send(JSON.stringify(['EOSE', subId]));
      return true;
    }
    case 'CLOSE':
      if (typeof msg[1] === 'string' && msg[1] in c.subs) {
        delete c.subs[msg[1]];
        return true;
      }
      return false;
    default:
      notice(`unsupported: ${String(msg[0]).slice(0, 16)}`);
      return false;
  }
}

/** In-memory relay (Bun server, tests). */
export class RelayHub {
  private conns = new Map<number, RelayPeer>();
  private nextId = 1;
  /** Counters for /health. */
  stats: RelayStats = { events: 0, delivered: 0, rejected: 0 };

  constructor(
    private readonly limits: RelayLimits = DEFAULT_LIMITS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get connections(): number {
    return this.conns.size;
  }

  open(send: (msg: string) => void): number {
    const id = this.nextId++;
    this.conns.set(id, { state: newRelayConn(), send });
    return id;
  }

  close(id: number): void {
    this.conns.delete(id);
  }

  message(id: number, raw: string): void {
    const c = this.conns.get(id);
    if (c) handleRelayMessage(c, raw, this.conns.values(), this.now(), this.limits, this.stats);
  }
}

function isEvent(ev: unknown): ev is NostrEvent {
  if (!ev || typeof ev !== 'object') return false;
  const e = ev as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.kind === 'number' &&
    typeof e.created_at === 'number' &&
    typeof e.content === 'string' &&
    Array.isArray(e.tags) &&
    e.tags.every((t) => Array.isArray(t) && t.every((s) => typeof s === 'string'))
  );
}

function matches(f: RelayFilter, ev: NostrEvent, topics: string[]): boolean {
  if (f.kinds && !f.kinds.includes(ev.kind)) return false;
  if (f.topics && !topics.some((t) => f.topics!.includes(t))) return false;
  // Allow a little clock skew between peers (created_at is in seconds).
  return ev.created_at >= f.since - 30;
}
