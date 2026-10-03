/**
 * Headless dedicated server: runs the authoritative HostSession in Bun with a WebSocket transport.
 *
 *   bun server/dedicated.ts                 # port 8787, random seed
 *   PORT=9000 SEED=1234 bun server/dedicated.ts
 *
 * Clients connect with `connectWebSocket('ws://host:8787')` (src/net/wsTransport.ts) and a normal
 * ClientSession. The server has no local players; the run starts when the first player joins and
 * keeps going while anyone is connected. See server/README.md.
 */
import { HostSession } from '../src/net/host';
import { type WebSocketLike, WebSocketServerTransport } from '../src/net/wsTransport';

// Minimal typing of the Bun APIs used here (bun-types is not a dependency of the web build).
interface BunSocket extends WebSocketLike {
  data: { peer: number };
}
interface BunServer {
  upgrade(req: Request, opts: { data: { peer: number } }): boolean;
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
declare const process: { env: Record<string, string | undefined>; on(ev: string, fn: () => void): void; exit(code: number): never };

const port = Number(process.env.PORT ?? 8787);
const seed = Number(process.env.SEED ?? Math.floor(Math.random() * 1e9));
const STEP_MS = 1000 / 60;

const transport = new WebSocketServerTransport();
const host = new HostSession({ transport, seed, setups: [] });
host.onPlayerJoin = (i, name, re) => console.log(`[server] ${re ? 'rejoined' : 'joined'}: #${i} ${name}`);
host.onPlayerLeave = (i, name, why) => console.log(`[server] left: #${i} ${name} (${why})`);

const server = Bun.serve({
  port,
  fetch(req, srv) {
    if (srv.upgrade(req, { data: { peer: 0 } })) return undefined;
    return new Response(`Shardfall dedicated server — seed ${seed}, ${host.remoteCount} player(s)\n`);
  },
  websocket: {
    open(ws) {
      ws.data.peer = transport.accept(ws);
    },
    message(ws, msg) {
      if (typeof msg !== 'string') transport.receive(ws.data.peer, msg);
    },
    close(ws) {
      transport.drop(ws.data.peer);
    },
  },
});

// Fixed 60 Hz loop with an accumulator (timers are not precise; never run more than 5 catch-up steps).
const empty = new Map();
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += now - last;
  last = now;
  let n = 0;
  while (acc >= STEP_MS && n < 5) {
    host.tick(empty);
    host.drainEvents();
    acc -= STEP_MS;
    n++;
  }
  if (n === 5) acc = 0;
}, 4);

console.log(`[server] Shardfall dedicated server on ws://localhost:${server.port} (seed ${seed})`);
process.on('SIGINT', () => {
  host.dispose();
  transport.close();
  process.exit(0);
});
