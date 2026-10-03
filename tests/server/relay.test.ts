import { describe, expect, it } from 'vitest';
import { RelayHub } from '../../server/relayHub';

function client(hub: RelayHub) {
  const inbox: unknown[][] = [];
  const id = hub.open((m) => inbox.push(JSON.parse(m) as unknown[]));
  return { id, inbox, send: (msg: unknown[]) => hub.message(id, JSON.stringify(msg)) };
}

const ev = (over: Record<string, unknown> = {}) => ({
  id: 'e1', pubkey: 'p', kind: 24242, created_at: 1000, tags: [['x', 'topicA']], content: 'offer', sig: 's', ...over,
});

describe('signaling relay hub', () => {
  it('fans out events to matching subscriptions and acks the sender', () => {
    const hub = new RelayHub();
    const a = client(hub);
    const b = client(hub);
    const c = client(hub);
    b.send(['REQ', 'sub1', { kinds: [24242], since: 1000, '#x': ['topicA'] }]);
    c.send(['REQ', 'sub2', { kinds: [24242], '#x': ['topicB'] }]);
    expect(b.inbox).toEqual([['EOSE', 'sub1']]);
    a.send(['EVENT', ev()]);
    expect(a.inbox).toEqual([['OK', 'e1', true, '']]);
    expect(b.inbox[1]).toEqual(['EVENT', 'sub1', ev()]);
    expect(c.inbox.length).toBe(1); // only EOSE
  });

  it('stops delivering after CLOSE and after disconnect', () => {
    const hub = new RelayHub();
    const a = client(hub);
    const b = client(hub);
    b.send(['REQ', 's', { kinds: [24242] }]);
    b.send(['CLOSE', 's']);
    a.send(['EVENT', ev()]);
    expect(b.inbox.length).toBe(1);
    b.send(['REQ', 's', { kinds: [24242] }]);
    hub.close(b.id);
    a.send(['EVENT', ev({ id: 'e2' })]);
    expect(b.inbox.length).toBe(2);
    expect(hub.connections).toBe(1);
  });

  it('ignores events older than the subscription (with skew allowance)', () => {
    const hub = new RelayHub();
    const a = client(hub);
    const b = client(hub);
    b.send(['REQ', 's', { since: 2000 }]);
    a.send(['EVENT', ev({ created_at: 1900 })]);
    a.send(['EVENT', ev({ id: 'e2', created_at: 1990 })]);
    expect(b.inbox.map((m) => m[0])).toEqual(['EOSE', 'EVENT']);
  });

  it('rejects non-ephemeral kinds, junk and floods', () => {
    let t = 0;
    const hub = new RelayHub({ maxMessage: 1000, maxSubs: 1, maxTopics: 2, eventsPerSecond: 3 }, () => t);
    const a = client(hub);
    a.send(['EVENT', ev({ kind: 1 })]);
    expect(a.inbox.pop()).toEqual(['OK', 'e1', false, 'blocked: only ephemeral events are relayed']);
    hub.message(a.id, 'not json');
    expect(a.inbox.pop()?.[0]).toBe('NOTICE');
    hub.message(a.id, JSON.stringify(['EVENT', ev({ content: 'x'.repeat(2000) })]));
    expect(a.inbox.pop()).toEqual(['NOTICE', 'message too large']);
    for (let i = 0; i < 4; i++) a.send(['EVENT', ev({ id: `f${i}` })]);
    expect(a.inbox.pop()).toEqual(['OK', 'f3', false, 'rate-limited: slow down']);
    t = 1500;
    a.send(['EVENT', ev({ id: 'g' })]);
    expect(a.inbox.pop()).toEqual(['OK', 'g', true, '']);
    a.send(['REQ', 's1', {}]);
    a.send(['REQ', 's2', {}]);
    expect(a.inbox.pop()).toEqual(['CLOSED', 's2', 'error: too many subscriptions']);
  });
});
