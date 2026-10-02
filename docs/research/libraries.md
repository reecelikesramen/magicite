# Third-party FOSS libraries

Vetted via the npm registry (2026-10-02). Prefer small, MIT/BSD/ISC/MPL libraries; keep the
deterministic sim (`src/sim`) dependency-free except for pure helpers.

## Adopted

| Library | Version | License | Used for | Notes |
|---|---|---|---|---|
| `pixi.js` | 8.22 | MIT | Rendering (WebGL/WebGPU), batching, render textures, blend modes | Core engine |
| `pixi-filters` | 6.1 | MIT | Bloom/blur for the glow look (`AdvancedBloomFilter`, `KawaseBlurFilter`) | Import individual filters (tree-shaken) |
| `trystero` | 0.25 | MIT | **Serverless WebRTC P2P**: room join + signaling over public Nostr relays (default), BitTorrent trackers, MQTT, or a **self-hosted WebSocket relay** | Free matchmaking with zero servers. `room.getPeers()` exposes the `RTCPeerConnection`s, so we add our own *unreliable/unordered* DataChannel (`negotiated: true`, fixed id) for snapshots/inputs |
| `zzfx` | 1.4 | MIT | Tiny procedural SFX synth (~1 KB) | Sound presets are parameter arrays — no audio files |
| `simplex-noise` | 4.0 | MIT | Seedable 2D/3D noise for level generation | Seed with a function wrapping our `Rng` (deterministic) |

## Planned (later phases)

| Library | License | Purpose |
|---|---|---|
| `electrobun` (2.x) | MIT | Bun-native desktop shell on the system webview (typed RPC, bsdiff delta updates, cross-platform builds). Alternative: `webview-bun` (2.4, MIT) for a minimal shell |
| `node-datachannel` (0.33) | MPL-2.0 | Native WebRTC (libdatachannel) for the dedicated Bun server and for desktop builds whose webview lacks WebRTC (some Linux WebKitGTK builds) |
| `msgpackr` (2.1) | MIT | Compact encoding for *reliable*, low-frequency messages (lobby, chat, save files). Hot-path snapshots use our own bit-packed codec |

## Considered and rejected

| Library | Why not |
|---|---|
| `phaser` 4 | Great engine, but its scene/physics model fights a pure deterministic sim that must also run headless on servers; Pixi + our own sim is leaner |
| `@pixi/tilemap` | Fine, but destructible tiles + per-biome procedural textures are simpler with cached chunk canvases |
| `@colyseus/schema` / Colyseus | Server-centric rooms over WebSocket; we need P2P listen-server + custom interest-managed delta snapshots |
| `peerjs` | Needs PeerServer (hosted signaling); Trystero needs none |
| `simple-peer` | Unmaintained since 2023 |
| `netplayjs` | Rollback-only, unmaintained since 2023 |
| `@geckos.io/snapshot-interpolation` | Small and good, but our snapshot model (delta + interest + prediction) is tightly coupled to the sim; ~200 lines in-house |
| `@dimforge/rapier2d` | Rigid-body physics is overkill for tile platforming and costs ~12 MB of WASM |

## Free hosting plan

- **Web build**: Cloudflare Pages (free static hosting).
- **Signaling**: Trystero over public Nostr relays (free, no server). Fallback: self-hosted WebSocket relay
  on a Cloudflare Worker + Durable Object (free plan) — also relays game traffic when WebRTC can't connect.
- **STUN**: public (Google / Cloudflare). **TURN** for strict NATs: Cloudflare Realtime TURN (check current free allowance).
- **Optional dedicated server** (same sim in Bun): Oracle Cloud Always Free ARM VM (generous egress).
  GCP's always-free e2-micro only includes ~1 GB/month egress — too little for game traffic.
