/**
 * Cloudflare Worker: Nostr signaling relay for trystero (one Durable Object, WebSocket Hibernation
 * so idle sockets cost nothing) + `/ice`, which mints short-lived Cloudflare TURN credentials so the
 * TURN secret never ships in the game build.
 *
 * Shares its protocol logic with the Bun relay (../relayHub.ts). Per-socket state lives in the
 * socket's serialized attachment, so it survives the object hibernating between messages.
 */
import { DEFAULT_LIMITS, handleRelayMessage, newRelayConn, type RelayConnState, type RelayPeer } from '../relayHub';

// Minimal Workers runtime typings (no @cloudflare/workers-types dependency in the web build).
interface HibernatableSocket {
  send(msg: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
interface DurableObjectStateLike {
  acceptWebSocket(ws: HibernatableSocket): void;
  getWebSockets(): HibernatableSocket[];
}
interface DurableObjectStub {
  fetch(req: Request): Promise<Response>;
}
interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}
declare const WebSocketPair: { new (): { 0: HibernatableSocket; 1: HibernatableSocket } };

export interface Env {
  SIGNAL: DurableObjectNamespaceLike;
  ALLOWED_ORIGINS?: string;
  TURN_KEY_ID?: string;
  TURN_KEY_TOKEN?: string;
}

export class SignalRelay {
  constructor(private readonly ctx: DurableObjectStateLike) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ ok: true, connections: this.ctx.getWebSockets().length });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(newRelayConn());
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  webSocketMessage(ws: HibernatableSocket, message: string | ArrayBuffer): void {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const peer = (s: HibernatableSocket): RelayPeer => ({
      state: (s.deserializeAttachment() as RelayConnState | null) ?? newRelayConn(),
      send: (m) => {
        try {
          s.send(m);
        } catch {
          /* socket closing */
        }
      },
    });
    const self = peer(ws);
    const others = this.ctx.getWebSockets().map(peer);
    if (handleRelayMessage(self, raw, others, Date.now(), DEFAULT_LIMITS)) ws.serializeAttachment(self.state);
  }

  webSocketClose(ws: HibernatableSocket): void {
    ws.close();
  }

  webSocketError(ws: HibernatableSocket): void {
    ws.close();
  }
}

function cors(req: Request, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim());
  const origin = req.headers.get('origin') ?? '';
  const ok = allowed.includes('*') || allowed.includes(origin);
  return ok ? { 'access-control-allow-origin': allowed.includes('*') ? '*' : origin, vary: 'origin' } : {};
}

/** Short-lived TURN credentials from Cloudflare Realtime (port 53 URLs dropped: browsers block them). */
async function ice(req: Request, env: Env): Promise<Response> {
  const headers = { ...cors(req, env), 'cache-control': 'no-store' };
  if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) {
    return Response.json({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] }, { headers });
  }
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.TURN_KEY_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: 6 * 3600 }),
  });
  if (!res.ok) return Response.json({ error: `turn: ${res.status}` }, { status: 502, headers });
  const body = (await res.json()) as { iceServers: { urls: string | string[]; username?: string; credential?: string } | { urls: string | string[] }[] };
  const list = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
  const iceServers = list.map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }));
  return Response.json({ iceServers }, { headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: { ...cors(req, env), 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' } });
    }
    if (url.pathname === '/ice') return ice(req, env);
    // One relay object: signaling is tiny, and every peer of a room must meet in the same place.
    const stub = env.SIGNAL.get(env.SIGNAL.idFromName('global'));
    if (url.pathname === '/health' || req.headers.get('upgrade')?.toLowerCase() === 'websocket') return stub.fetch(req);
    return Response.json({ name: 'shardfall-signal', supported_nips: [1, 11] }, { headers: cors(req, env) });
  },
};
