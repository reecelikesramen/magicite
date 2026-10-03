import { describe, expect, it } from 'vitest';
import {
  PeerIdMap, TrysteroTransport, type TrysteroRoomLike, UNRELIABLE_CHANNEL_ID, makeRoomCode, normalizeRoomCode,
} from '../../src/net/trysteroTransport';

/** A fake trystero room + RTCPeerConnection/DataChannel pair, enough to exercise the transport logic. */
class FakeChannel {
  readyState: 'connecting' | 'open' | 'closed' = 'connecting';
  bufferedAmount = 0;
  binaryType = 'blob';
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  sent: Uint8Array[] = [];
  constructor(readonly opts: RTCDataChannelInit) {}
  send(d: Uint8Array): void {
    this.sent.push(d);
  }
  close(): void {
    this.readyState = 'closed';
  }
}

class FakeRoom implements TrysteroRoomLike {
  onPeerJoin: ((peerId: string) => void) | null = null;
  onPeerLeave: ((peerId: string) => void) | null = null;
  peers: Record<string, { createDataChannel: (label: string, o: RTCDataChannelInit) => FakeChannel; ch?: FakeChannel }> = {};
  actionSent: { data: Uint8Array; target: unknown }[] = [];
  deliver: ((data: unknown, ctx: { peerId: string }) => void) | undefined;
  left = false;
  makeAction(_ns: string, config?: { onMessage?: (data: unknown, ctx: { peerId: string }) => void }) {
    this.deliver = config?.onMessage;
    return { send: async (data: Uint8Array, o?: { target?: unknown }) => void this.actionSent.push({ data, target: o?.target }) };
  }
  getPeers(): Record<string, RTCPeerConnection> {
    return this.peers as unknown as Record<string, RTCPeerConnection>;
  }
  async leave(): Promise<void> {
    this.left = true;
  }
  connect(id: string): FakeChannel | undefined {
    const pc = {
      createDataChannel: (_l: string, o: RTCDataChannelInit) => {
        pc.ch = new FakeChannel(o);
        return pc.ch;
      },
    } as FakeRoom['peers'][string];
    this.peers[id] = pc;
    this.onPeerJoin?.(id);
    return pc.ch;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('trystero transport (fake room)', () => {
  it('maps string peer ids to small numbers', () => {
    const m = new PeerIdMap();
    expect(m.id('abc')).toBe(1);
    expect(m.id('def')).toBe(2);
    expect(m.id('abc')).toBe(1);
    expect(m.str(2)).toBe('def');
    expect(m.remove('abc')).toBe(1);
    expect(m.has('abc')).toBe(false);
    expect(m.id('abc')).toBe(3);
  });

  it('opens a negotiated unordered DataChannel per peer and falls back to reliable until it is open', async () => {
    const room = new FakeRoom();
    const t = new TrysteroTransport(room);
    const joined: number[] = [];
    const got: [number, string, number[]][] = [];
    t.onPeerJoin((p) => joined.push(p));
    t.onMessage((p, ch, d) => got.push([p, ch, [...d]]));
    const ch = room.connect('peerA')!;
    expect(joined).toEqual([1]);
    expect(ch.opts).toMatchObject({ negotiated: true, id: UNRELIABLE_CHANNEL_ID, ordered: false, maxRetransmits: 0 });

    // Not open yet → unreliable goes through the reliable action with a tag byte.
    const buf = new Uint8Array([9, 8, 7]);
    t.send(1, 'unreliable', buf);
    buf[0] = 0; // caller reuses its buffer: the transport must have copied
    await flush();
    expect(room.actionSent.length).toBe(1);
    expect([...room.actionSent[0]!.data]).toEqual([2, 9, 8, 7]);
    expect(room.actionSent[0]!.target).toBe('peerA');

    // Open → unreliable uses the DataChannel.
    ch.readyState = 'open';
    t.send(1, 'unreliable', new Uint8Array([5]));
    expect(ch.sent.map((d) => [...d])).toEqual([[5]]);
    t.send(1, 'reliable', new Uint8Array([6]));
    await flush();
    expect([...room.actionSent[1]!.data]).toEqual([1, 6]);

    // Receiving on both paths.
    ch.onmessage!({ data: new Uint8Array([1, 2]).buffer });
    room.deliver!(new Uint8Array([1, 42]), { peerId: 'peerA' });
    room.deliver!(new Uint8Array([2, 43]), { peerId: 'peerA' });
    expect(got).toEqual([[1, 'unreliable', [1, 2]], [1, 'reliable', [42]], [1, 'unreliable', [43]]]);
    expect(t.stats.bytesIn).toBe(4);

    // Leave.
    const left: number[] = [];
    t.onPeerLeave((p) => left.push(p));
    room.onPeerLeave!('peerA');
    expect(left).toEqual([1]);
    expect(t.peers()).toEqual([]);
    t.close();
    expect(room.left).toBe(true);
  });

  it('room codes are short, unambiguous and normalised', () => {
    let i = 0;
    const code = makeRoomCode(() => ((i++ * 7) % 29) / 29);
    expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    expect(code).not.toMatch(/[01OILUV]/);
    expect(normalizeRoomCode(' kx7-p2q ')).toBe('KX7P2Q');
  });
});
