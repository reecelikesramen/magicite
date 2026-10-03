/**
 * Self-hostable signaling relay for online play (a tiny Nostr relay; see relayHub.ts).
 *
 *   bun server/relay.ts                      # ws://localhost:7777
 *   PORT=9000 bun server/relay.ts
 *
 * Point builds at it with VITE_NOSTR_RELAYS=wss://your.host (or `?relay=wss://your.host` on the
 * page for testing). GET /health returns JSON stats. Put it behind TLS (Caddy, Cloudflare Tunnel,
 * Fly/Railway's proxy) for https pages — browsers block ws:// from https origins.
 */
import { RelayHub } from './relayHub';

interface BunSocket {
  data: { id: number };
  send(msg: string): void;
}
interface BunServer {
  upgrade(req: Request, opts: { data: { id: number } }): boolean;
  port: number;
}
declare const Bun: {
  serve(opts: {
    port: number;
    fetch(req: Request, server: BunServer): Response | undefined;
    websocket: {
      open(ws: BunSocket): void;
      message(ws: BunSocket, msg: string | Uint8Array): void;
      close(ws: BunSocket): void;
    };
  }): BunServer;
};
declare const process: { env: Record<string, string | undefined> };

const hub = new RelayHub();
const decoder = new TextDecoder();

const server = Bun.serve({
  port: Number(process.env.PORT ?? 7777),
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, connections: hub.connections, ...hub.stats });
    }
    if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      if (srv.upgrade(req, { data: { id: 0 } })) return undefined;
      return new Response('upgrade failed', { status: 400 });
    }
    // NIP-11-ish info document for relay browsers.
    return Response.json(
      { name: 'shardfall-signal', description: 'Ephemeral signaling relay for Shardfall', supported_nips: [1, 11] },
      { headers: { 'access-control-allow-origin': '*' } },
    );
  },
  websocket: {
    open(ws) {
      ws.data.id = hub.open((m) => ws.send(m));
    },
    message(ws, msg) {
      hub.message(ws.data.id, typeof msg === 'string' ? msg : decoder.decode(msg));
    },
    close(ws) {
      hub.close(ws.data.id);
    },
  },
});

console.log(`signaling relay on ws://localhost:${server.port} (GET /health for stats)`);
