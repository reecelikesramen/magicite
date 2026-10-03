import type { TrysteroOptions } from './net/trysteroTransport';

/** Working title — the project is an original recreation/extension, rename freely. */
export const GAME_TITLE = 'Shardfall';
export const VERSION = '0.2.0';

/**
 * Network configuration, overridable at build time with Vite env vars (see docs/HOSTING.md):
 * - VITE_NOSTR_RELAYS: comma-separated Nostr relay URLs for trystero signaling (default: trystero's
 *   public list)
 * - VITE_TURN_URL / VITE_TURN_USER / VITE_TURN_CRED: a TURN server for strict NATs
 * - VITE_DEDICATED_URL: wss:// URL of a dedicated server (src/net/wsTransport) if one is run
 * - VITE_ROOM_PASSWORD: optional shared password namespacing your rooms
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/**
 * Page-level overrides for testing and self-hosting without a rebuild:
 * - `?relay=wss://a,wss://b` — signaling relays (e.g. `bun server/relay.ts`)
 * - `?ice=none` — no STUN/TURN (same machine / LAN only); `?ice=stun:host:3478,turn:...` — custom list
 */
const query = (() => {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '');
  } catch {
    return new URLSearchParams();
  }
})();

const list = (s: string | null | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

function trysteroConfig(): Omit<TrysteroOptions, 'roomCode'> {
  const out: Omit<TrysteroOptions, 'roomCode'> = { appId: 'shardfall-v1' };
  const relays = query.has('relay') ? list(query.get('relay')) : list(env.VITE_NOSTR_RELAYS);
  if (relays.length) out.relayUrls = relays;
  if (query.has('ice')) {
    const ice = query.get('ice');
    out.rtcConfig = { iceServers: ice === 'none' ? [] : list(ice).map((urls) => ({ urls })) };
  }
  if (env.VITE_TURN_URL) out.turnConfig = [{ urls: env.VITE_TURN_URL, username: env.VITE_TURN_USER, credential: env.VITE_TURN_CRED }];
  if (env.VITE_ROOM_PASSWORD) out.password = env.VITE_ROOM_PASSWORD;
  return out;
}

export const NET_CONFIG = {
  trystero: trysteroConfig(),
  dedicatedUrl: env.VITE_DEDICATED_URL ?? '',
};
