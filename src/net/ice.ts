import type { TrysteroOptions } from './trysteroTransport';

/** Public STUN kept alongside fetched TURN servers (setting rtcConfig replaces trystero's list). */
const BASE_STUN: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];

/**
 * Resolve the trystero options for a join: when an ICE endpoint is configured, fetch fresh
 * STUN/TURN servers from it (short timeout — on failure we just go without TURN).
 */
export async function withIceServers<T extends Omit<TrysteroOptions, 'roomCode'>>(base: T, endpoint: string, timeoutMs = 4000): Promise<T> {
  if (!endpoint || base.rtcConfig) return base;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(endpoint, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return base;
    const body = (await res.json()) as { iceServers?: RTCIceServer[] };
    const fetched = Array.isArray(body.iceServers) ? body.iceServers.filter((s) => s && s.urls) : [];
    if (!fetched.length) return base;
    return { ...base, rtcConfig: { iceServers: [...BASE_STUN, ...fetched] } };
  } catch {
    return base;
  }
}
