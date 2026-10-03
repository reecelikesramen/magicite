# Hosting & netcode

Shardfall's online co-op (1–4 players) is **host-authoritative with client-side prediction**. One
machine owns the real simulation; everyone else sends inputs and receives snapshots. There is no
required server of ours: by default players connect peer-to-peer over WebRTC, with matchmaking
(signaling) over public Nostr relays through [trystero](https://github.com/dmotz/trystero).

```
 host (a player's browser / desktop app, or the headless Bun server)
   HostSession ── authoritative World (60 Hz) ── snapshots 30 Hz ──► clients
        ▲                                                            │
        └──────────── inputs every tick (8× redundant) ◄─────────────┘
 transport: WebRTC DataChannels via trystero (P2P)  |  WebSocket (dedicated server / relay)
```

## Topologies

| Mode | How | When |
|---|---|---|
| **P2P listen server** (default) | Host and clients `joinTrysteroRoom({ roomCode })`; the host runs `HostSession`, the others `ClientSession`. Signaling over public Nostr relays; game traffic is direct WebRTC. | Normal play. Zero infrastructure. |
| P2P + self-hosted signaling | Same, with `relayUrls: ['wss://relay.example.org']` (any Nostr relay: `strfry`, `nostr-rs-relay`), or another trystero strategy via `joinRoom` (`@trystero-p2p/torrent`, `…/mqtt`, `…/supabase`, `…/firebase`). | Public relays are flaky/blocked, or for privacy. |
| P2P + TURN | Pass `turnConfig` (e.g. Cloudflare Realtime TURN, coturn). | Players behind symmetric NAT / strict firewalls. |
| **Dedicated server** | `bun server/dedicated.ts` (WebSocket, no local player); clients use `connectWebSocket('wss://…')`. The run holds still while nobody is connected. | Always-on rooms, WebRTC-less webviews (some Linux WebKitGTK), LAN parties. |
| Relay fallback (planned) | A Cloudflare Worker + Durable Object per room code that forwards `wsTransport` frames between the host and clients. Same framing as the dedicated server, so `WebSocketClientTransport` works unchanged; the host side needs a small "relay host" transport. | When P2P cannot connect at all. |

## Wiring a lobby (for the menus/lobby workstream)

`src/main.ts` currently starts a `LocalSession`. An online game swaps the session — `Game` only
needs the `Session` interface (`world`, `localPlayers`, `tick`, `drainEvents`, `dispose`).

```ts
import { ClientSession, HostSession, joinTrysteroRoom, makeRoomCode } from './net';

// HOST ------------------------------------------------------------------------------------------
const code = makeRoomCode();                      // show it: "KX7-P2Q"
const transport = await joinTrysteroRoom({ roomCode: code /*, password, relayUrls, turnConfig */ });
const host = new HostSession({ transport, seed, setups: [mySetup] });
host.onPlayerJoin = (index, name, reconnect) => toast(`${name} joined`);
host.onPlayerLeave = (index, name, reason) => toast(`${name} left (${reason})`);
const game = new Game(app, input, host);          // host plays with zero latency

// CLIENT ----------------------------------------------------------------------------------------
const transport = await joinTrysteroRoom({ roomCode: typedCode });
const client = new ClientSession({ transport, setup: mySetup, token: savedToken /* reconnect */ });
client.onStateChange = (state, reason) => {
  if (state === 'joined') saveToken(client.token); // lets a crashed client reclaim its hero
  if (state === 'rejected' || state === 'disconnected') backToMenu(reason);
};
// Start rendering once `client.ready` (Welcome + level received); before that the mirror world
// holds a tiny placeholder level so a renderer never sees `world.level === undefined`.
const game = new Game(app, input, client);

// Leaving: session.dispose() (tells the other side) and then transport.close().
```

Notes for integrators:

- Drive `session.tick()` from the normal `FixedLoop` (60 Hz). Keep the host's tab visible (or move the
  host loop into a Worker later): browsers throttle `requestAnimationFrame` in background tabs.
- `client.localPlayers` is filled on Welcome (`[assignedIndex]`); `Game.localPlayer` already reads it.
- Reconnects: a Hello carrying a saved token reclaims that player's slot — also from a connection the
  host still thinks is alive (page reload), which is then dropped with reason `'replaced'`. Within the
  same level the player comes back exactly as they left (position, downed/out); after a level change
  they enter the new level standing like everyone else. Treat the token as a secret.
- UI actions go into `PlayerInput.commands` exactly as offline; the client sends them reliably.
- Prediction contract (src/net/predict.ts): the owner's entity motion fields, every `ctl`/`prev` field
  and `PREDICTED_PLAYER_KEYS` are rewound exactly. `ctl` fields the *host alone* advances (mining
  progress, meter timers) belong in `CARRIED_ONLY_KEYS`, or every snapshot forces a rewind.
- `client.stats` (RTT, corrections, lead, interpolation delay, input misses) and `host.clientStats()`
  (per-client bytes, misses, ack lag) are meant for a debug overlay.
- Local test without network: `const net = new LoopbackNetwork({ conditions: { latencyMs: 60, jitterMs: 15, loss: 0.05 } })`,
  `net.join()` per peer, call `net.advance(1000 / 60)` every tick (see `tests/net/harness.ts`).

## What goes over the wire

| Message | Channel | Content |
|---|---|---|
| Hello / Welcome / Reject | reliable | protocol version + content-table hash, PlayerSetup, reconnect token; player index, host tick, seed, owner-state layout |
| LevelChange | reliable | level epoch + `LevelRequest` (clients regenerate the level — `generateLevel` is pure) + hash of the pristine grid (a client whose generator differs leaves with "level mismatch" instead of desyncing) + compacted tile edit log; full RLE level only if the run flow recorded no request |
| TileEdits | reliable | tiles changed since last tick (host diffs chunks whose `chunkVersion` changed — catches mining, bombs, placement, anything) |
| Snapshot | unreliable (full ones reliable) | header (tick, epoch, baseline, input timing feedback) · public player views (versioned) · the owner's exact prediction state · entity delta vs the client's last acked snapshot, interest-filtered (≈2 screens + players/bosses) · nearby cosmetic events |
| Input | unreliable | ack + last 8 inputs (delta-coded, ~15–30 B) |
| Commands | reliable | `PlayerCommand[]` (craft, swap, equip, buy…) |
| PrivateState | reliable | owner-only PlayerState fields that changed (inventory, equipment, stats, meters, gold, xp, skills, recipes; run stats 1×/s) |
| WorldState / Events | reliable | run state + exit lock; important events (level-ups, downed, crafted, messages) |
| Ping / Pong / Leave | — | RTT, graceful leave |

Entity sync is schema-driven: `ENTITY_FIELDS` in `src/net/snapshot.ts` lists every synced field
(key, kind, quantization). **Adding a field is one line**; optional components get a presence field
plus sub-fields. New `PlayerState` fields are private (owner-only) by default; new
`PlayerInput` fields are transmitted automatically.

## Measured (tests/net, loopback, 200 entities, 5% loss)

- Downstream ≈ 3–5 KB/s per client (budget 12 KB/s); upstream ≈ 1.1 KB/s.
- Snapshot round (capture + 4× interest/encode/decode) ≈ 0.4–0.5 ms; host tick incl. sim ≈ 0.4 ms.
- Local prediction: 0 corrections with no outside forces at 50/150/250 ms RTT; knockback etc. are
  reconciled (rewind + replay) and smoothed over ~100 ms.

## Security model

Co-op among friends: the host trusts nobody's *state* (clients only send inputs/commands, which the
sim validates), but there is no anti-cheat. Packets are bounds-checked (`RangeError` → dropped),
setups are sanitized, and a room `password` keeps strangers out of the room and its signaling.
