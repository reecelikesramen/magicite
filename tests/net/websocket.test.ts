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
  });
});
