import { describe, expect, it } from 'vitest';
import { LoopbackNetwork } from '../../src/net/transport';

describe('loopback network', () => {
  it('delivers reliable data in order and before a graceful close, despite jitter and loss', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const net = new LoopbackNetwork({ seed, conditions: { latencyMs: 40, jitterMs: 30, loss: 0.2 } });
      const a = net.join();
      const b = net.join();
      net.advance(100);
      const log: string[] = [];
      b.onMessage((_p, ch, d) => log.push(`${ch}:${d[0]}`));
      b.onPeerLeave(() => log.push('leave'));
      for (let i = 0; i < 5; i++) a.send(b.selfId, 'reliable', new Uint8Array([i]));
      a.close(); // e.g. dispose() sent a Leave message, then the app closed the transport
      net.advance(2000);
      expect(log).toEqual(['reliable:0', 'reliable:1', 'reliable:2', 'reliable:3', 'reliable:4', 'leave']);
    }
  });

  it('a crash loses in-flight packets and is noticed after crashDetectMs', () => {
    const net = new LoopbackNetwork({ seed: 3, conditions: { latencyMs: 40 }, crashDetectMs: 500 });
    const a = net.join();
    const b = net.join();
    net.advance(100);
    const log: string[] = [];
    b.onMessage(() => log.push('msg'));
    b.onPeerLeave(() => log.push(`leave@${net.now()}`));
    a.send(b.selfId, 'reliable', new Uint8Array([1]));
    a.crash();
    net.advance(1000);
    expect(log).toEqual(['leave@600']);
  });

  it('unsubscribing inside a handler does not skip the other handlers of that packet', () => {
    const net = new LoopbackNetwork({ seed: 4 });
    const a = net.join();
    const b = net.join();
    net.advance(100);
    const seen: string[] = [];
    const off = b.onMessage(() => {
      seen.push('first');
      off();
    });
    b.onMessage(() => seen.push('second'));
    a.send(b.selfId, 'unreliable', new Uint8Array([1]));
    a.send(b.selfId, 'unreliable', new Uint8Array([2]));
    net.advance(100);
    expect(seen).toEqual(['first', 'second', 'second']);
  });
});
