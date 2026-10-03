import { afterEach, describe, expect, it, vi } from 'vitest';
import { withIceServers } from '../../src/net/ice';

afterEach(() => vi.unstubAllGlobals());

describe('withIceServers', () => {
  it('is a no-op without an endpoint', async () => {
    const base = { appId: 'x' };
    expect(await withIceServers(base, '')).toBe(base);
  });

  it('adds fetched TURN servers after public STUN', async () => {
    const turn = { urls: ['turn:turn.example:3478'], username: 'u', credential: 'c' };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ iceServers: [turn] })));
    const out: { rtcConfig?: RTCConfiguration } = await withIceServers({ appId: 'x' } as { appId: string; rtcConfig?: RTCConfiguration }, 'https://relay.example/ice');
    expect(out.rtcConfig?.iceServers?.at(-1)).toEqual(turn);
    expect(out.rtcConfig?.iceServers?.[0]?.urls).toContain('stun:');
  });

  it('falls back to the base config when the endpoint fails', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    const base = { appId: 'x' };
    expect(await withIceServers(base, 'https://relay.example/ice')).toBe(base);
  });

  it('keeps an explicit rtcConfig (e.g. ?ice=none)', async () => {
    const base = { appId: 'x', rtcConfig: { iceServers: [] } };
    expect(await withIceServers(base, 'https://relay.example/ice')).toBe(base);
  });
});
