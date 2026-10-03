/**
 * Minimal Nostr relay core (NIP-01 subset) — just enough for trystero's WebRTC signaling.
 *
 * trystero publishes short-lived, signed events (`kind` 20000–29999, one `#x` topic tag) and
 * subscribes with `{ kinds, since, '#x': [...] }`. Signaling events are only useful live, so this
 * relay stores nothing: an EVENT is acknowledged and fanned out to matching subscriptions. That
 * keeps it tiny, stateless and cheap enough for a free-tier VM, Fly/Railway box or Cloudflare.
 *
 * Signatures are not verified (trystero verifies nothing either; SDP offers are encrypted with the
 * room key). Abuse limits: message size, subscriptions per socket, events per second per socket,
 * and only ephemeral kinds are accepted.
 *
 * Transport-agnostic: `server/relay.ts` wires it to Bun.serve; tests drive it directly.
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

interface Filter {
  kinds: Set<number> | null;
  topics: Set<string> | null;
  since: number;
}

interface Conn {
  send: (msg: string) => void;
  subs: Map<string, Filter[]>;
  windowStart: number;
  windowCount: number;
}

interface NostrEvent {
  id: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export class RelayHub {
  private conns = new Map<number, Conn>();
  private nextId = 1;
  /** Counters for /health. */
  stats = { events: 0, delivered: 0, rejected: 0 };

  constructor(
    private readonly limits: RelayLimits = DEFAULT_LIMITS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get connections(): number {
    return this.conns.size;
  }

  open(send: (msg: string) => void): number {
    const id = this.nextId++;
    this.conns.set(id, { send, subs: new Map(), windowStart: 0, windowCount: 0 });
    return id;
  }

  close(id: number): void {
    this.conns.delete(id);
  }

  message(id: number, raw: string): void {
    const c = this.conns.get(id);
    if (!c) return;
    if (raw.length > this.limits.maxMessage) return this.notice(c, 'message too large');
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.notice(c, 'invalid JSON');
    }
    if (!Array.isArray(msg) || typeof msg[0] !== 'string') return this.notice(c, 'invalid message');
    switch (msg[0]) {
      case 'EVENT':
        return this.onEvent(c, msg[1]);
      case 'REQ':
        return this.onReq(c, msg[1], msg.slice(2));
      case 'CLOSE':
        if (typeof msg[1] === 'string') c.subs.delete(msg[1]);
        return;
      default:
        return this.notice(c, `unsupported: ${String(msg[0]).slice(0, 16)}`);
    }
  }

  private onEvent(c: Conn, ev: unknown): void {
    if (!isEvent(ev)) return this.notice(c, 'invalid event');
    const t = this.now();
    if (t - c.windowStart >= 1000) {
      c.windowStart = t;
      c.windowCount = 0;
    }
    if (++c.windowCount > this.limits.eventsPerSecond) {
      this.stats.rejected++;
      return c.send(JSON.stringify(['OK', ev.id, false, 'rate-limited: slow down']));
    }
    if (ev.kind < 20000 || ev.kind >= 30000) {
      this.stats.rejected++;
      return c.send(JSON.stringify(['OK', ev.id, false, 'blocked: only ephemeral events are relayed']));
    }
    this.stats.events++;
    c.send(JSON.stringify(['OK', ev.id, true, '']));
    const topics = ev.tags.filter((tg) => tg[0] === 'x').map((tg) => tg[1]);
    for (const other of this.conns.values()) {
      for (const [subId, filters] of other.subs) {
        if (filters.some((f) => matches(f, ev, topics))) {
          other.send(JSON.stringify(['EVENT', subId, ev]));
          this.stats.delivered++;
        }
      }
    }
  }

  private onReq(c: Conn, subId: unknown, rawFilters: unknown[]): void {
    if (typeof subId !== 'string' || subId.length > 128) return this.notice(c, 'invalid subscription id');
    if (!c.subs.has(subId) && c.subs.size >= this.limits.maxSubs) {
      return c.send(JSON.stringify(['CLOSED', subId, 'error: too many subscriptions']));
    }
    const filters: Filter[] = [];
    for (const f of rawFilters) {
      if (!f || typeof f !== 'object') continue;
      const o = f as Record<string, unknown>;
      const kinds = Array.isArray(o.kinds) ? new Set(o.kinds.filter((k): k is number => typeof k === 'number')) : null;
      const xs = Array.isArray(o['#x']) ? o['#x'].filter((x): x is string => typeof x === 'string') : null;
      if (xs && xs.length > this.limits.maxTopics) return c.send(JSON.stringify(['CLOSED', subId, 'error: too many topics']));
      filters.push({ kinds, topics: xs ? new Set(xs) : null, since: typeof o.since === 'number' ? o.since : 0 });
    }
    c.subs.set(subId, filters);
    // Nothing is stored, so the stored-events phase is always empty.
    c.send(JSON.stringify(['EOSE', subId]));
  }

  private notice(c: Conn, text: string): void {
    c.send(JSON.stringify(['NOTICE', text]));
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

function matches(f: Filter, ev: NostrEvent, topics: string[]): boolean {
  if (f.kinds && !f.kinds.has(ev.kind)) return false;
  if (f.topics && !topics.some((t) => f.topics!.has(t))) return false;
  // Allow a little clock skew between peers (created_at is in seconds).
  return ev.created_at >= f.since - 30;
}
