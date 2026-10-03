import { describe, expect, it } from 'vitest';
import { ClientSession } from '../../src/net/client';
import { HostSession } from '../../src/net/host';
import { WebSocketClientTransport, WebSocketServerTransport } from '../../src/net/wsTransport';
import { emptyInput } from '../../src/sim/types';
import { scripted, setupFor } from './harness';

/** In-memory socket pair with a delivery queue (flushed by the test, like a network tick). */
class FakeSocket {
  readyState = 0;
  bufferedAmount = 0;
  binaryType = '';
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  peer: FakeSocket | null = null;
  inbox: Uint8Array[] = [];
  onServerMessage: ((data: Uint8Array) => void) | null = null;
  onServerClose: (() => void) | null = null;
  send(d: Uint8Array): void {
    this.peer?.inbox.push(d.slice());
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.(null);
    this.onServerClose?.();
    if (this.peer && this.peer.readyState !== 3) this.peer.close();
  }
  flush(): void {
    const box = this.inbox;
    this.inbox = [];
    for (const d of box) {
      if (this.onmessage) this.onmessage({ data: d.buffer });
      else this.onServerMessage?.(d);
    }
  }
}

describe('websocket transport', () => {
  it('drops unreliable frames (never reliable ones) when the socket is backed up, browser and Bun style', () => {
    const sent: number[] = [];
    let backlog = 0;
    // Bun's ServerWebSocket: no bufferedAmount property, only getBufferedAmount().
    const bunWs = { readyState: 1, getBufferedAmount: () => backlog, send: (d: Uint8Array) => sent.push(d[0]!), close: () => {} };
    const server = new WebSocketServerTransport();
    const peer = server.accept(bunWs);
    server.send(peer, 'unreliable', new Uint8Array([7]));
    backlog = 1 << 20;
    server.send(peer, 'unreliable', new Uint8Array([7]));
    server.send(peer, 'reliable', new Uint8Array([7]));
    expect(sent).toEqual([2, 1]); // [tag unreliable], (dropped), [tag reliable]

    const browserWs = new FakeSocket();
    browserWs.readyState = 1;
    const client = new WebSocketClientTransport(browserWs);
    const out: Uint8Array[] = [];
    browserWs.send = (d: Uint8Array) => void out.push(d);
    browserWs.bufferedAmount = 1 << 20;
    client.send(WebSocketClientTransport.SERVER, 'unreliable', new Uint8Array([1]));
    client.send(WebSocketClientTransport.SERVER, 'reliable', new Uint8Array([1]));
    expect(out.map((d) => d[0])).toEqual([1]);
  });

  it('runs a host and two clients over framed sockets (dedicated-server path)', () => {
    let now = 0;
    const clock = () => now;
    const server = new WebSocketServerTransport();
    // Dedicated server: no local players.
    const host = new HostSession({ transport: server, seed: 9, setups: [], clock });
    const pairs: { c: FakeSocket; s: FakeSocket }[] = [];
    const clients: ClientSession[] = [];
    const connect = (name: string) => {
      const c = new FakeSocket();
      const s = new FakeSocket();
      c.peer = s;
      s.peer = c;
      const transport = new WebSocketClientTransport(c);
      c.readyState = 1;
      s.readyState = 1;
      const id = server.accept(s);
      s.onServerMessage = (d) => server.receive(id, d);
      s.onServerClose = () => server.drop(id);
      c.onopen?.(null);
      pairs.push({ c, s });
      clients.push(new ClientSession({ transport, setup: setupFor(name), clock }));
    };
    // Nobody connected yet: the run does not start (no Blight timer ticking on an empty server).
    for (let t = 0; t < 30; t++) host.tick(new Map());
    expect(host.world.tick).toBe(0);
    connect('A');
    connect('B');
    for (let t = 0; t < 300; t++) {
      host.tick(new Map());
      clients.forEach((cl, i) => cl.tick(new Map([[cl.playerIndex, i === 0 ? scripted(t, 1) : emptyInput()]])));
      now += 1000 / 60;
      for (const p of pairs) {
        p.s.flush();
        p.c.flush();
      }
    }
    expect(clients.map((c) => c.state)).toEqual(['joined', 'joined']);
    expect(clients.map((c) => c.playerIndex)).toEqual([0, 1]);
    expect(host.world.players.map((p) => p.name)).toEqual(['A', 'B']);
    const a = host.world.playerEntity(0)!;
    const seenByB = clients[1]!.world.get(a.id)!;
    expect(Math.abs(seenByB.x - a.x)).toBeLessThan(40); // interpolated ~100 ms behind a moving player
    expect(clients[0]!.stats.corrections).toBe(0);
    expect(server.stats.bytesOut).toBeGreaterThan(1000);

    // Socket closes → host frees the player.
    pairs[1]!.c.close();
    host.tick(new Map());
    expect(host.world.players[1]!.out).toBe(true);
    expect(host.remoteCount).toBe(1);

    // Last player gone → the world holds still until someone (re)joins.
    pairs[0]!.c.close();
    host.tick(new Map());
    const frozen = host.world.tick;
    for (let t = 0; t < 60; t++) host.tick(new Map());
    expect(host.world.tick).toBe(frozen);
    expect(host.world.run.over).toBe(false);
  });
});
