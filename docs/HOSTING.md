# Hosting Shardfall (for free)

Online co-op is peer-to-peer: one player hosts and the others connect straight to them over WebRTC.
You never need a game server. What you do host:

| Piece | What it does | Free option | Required? |
|---|---|---|---|
| **Web build** | Static files (`dist/`) | GitHub Pages, Cloudflare Pages, Netlify, itch.io | Yes, for browser play |
| **Signaling** | Peers find each other with a room code | Public Nostr relays (built into trystero) | No: the defaults work |
| Own signaling relay | Reliable, private matchmaking | Cloudflare Worker (`server/cloudflare`) or `bun server/relay.ts` | Recommended once people play |
| **TURN** | Relays traffic when two NATs can't connect directly (~10–20% of pairs) | Cloudflare Realtime TURN (1,000 GB/month free) | Recommended |
| Dedicated server | Always-on world, for webviews without WebRTC | Oracle Cloud Always Free VM (Docker) | Optional |

```
 browser A (host) ◄──── WebRTC DataChannels (direct, or via TURN) ────► browser B
        └──── signaling: Nostr relay (public, or your Worker) ────┘   only while connecting
```

## 1. Web build: GitHub Pages

`.github/workflows/pages.yml` builds and deploys on every push to `main`.

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge to `main` (or run the "Deploy web build" workflow by hand from the Actions tab).
3. The game is live at `https://<user>.github.io/<repo>/`. The build uses relative paths, so subpaths work.

Other static hosts: run `bun run build` and upload `dist/`. On Cloudflare Pages, use build command
`bun run build` and output directory `dist`. For itch.io, zip `dist/` as an HTML5 game.
For a single file, `bun run build:single` produces `dist-single/index.html`.

## 2. Signaling relay (optional, recommended)

The default public Nostr relays work with no setup, but they're run by strangers and sometimes go down.
Your own relay is tiny and stateless:

### Cloudflare Worker (free, no server to run)

```sh
cd server/cloudflare
npx wrangler login
npx wrangler deploy            # → https://shardfall-signal.<you>.workers.dev
```

It's one Durable Object using WebSocket hibernation, so idle sockets cost nothing. Signaling is a few
messages per join, well inside the free plan's 100k Durable Object requests per day.
Check it with `curl https://shardfall-signal.<you>.workers.dev/health`.

### Or: Bun / Docker anywhere

```sh
bun server/relay.ts                                   # ws://localhost:7777, GET /health
docker build -f server/Dockerfile -t shardfall-server .
docker run -d --restart=always -p 7777:7777 shardfall-server
```

Pages are served over https, so put the relay behind TLS (`wss://`): use Caddy (`reverse_proxy :7777`),
a Cloudflare Tunnel, or a platform proxy (Fly.io, Railway, Render).

### Point the game at it

- GitHub Pages: repo **Settings → Secrets and variables → Actions → Variables**, add
  `NOSTR_RELAYS = wss://shardfall-signal.<you>.workers.dev` (comma-separate several for redundancy;
  you can list public relays too).
- Local builds: `VITE_NOSTR_RELAYS=wss://… bun run build`.
- Without rebuilding (testing): open the game with `?relay=wss://…`.

## 3. TURN (optional, recommended)

Some players sit behind NATs that block direct connections. TURN relays their traffic.

1. Cloudflare dashboard → **Realtime → TURN Server → Create**. Note the *Turn Token ID* and *API Token*.
2. Store them on the Worker (never in the game build):
   ```sh
   cd server/cloudflare
   npx wrangler secret put TURN_KEY_ID
   npx wrangler secret put TURN_KEY_TOKEN
   ```
3. Set the repo variable `ICE_ENDPOINT = https://shardfall-signal.<you>.workers.dev/ice`
   (or `VITE_ICE_ENDPOINT` for local builds). Before joining a room, the game fetches 6-hour
   credentials from `/ice`. If the endpoint fails, it carries on with STUN only.
4. Lock `/ice` to your site: set `ALLOWED_ORIGINS` in `server/cloudflare/wrangler.toml`
   (e.g. `https://<user>.github.io`) and redeploy.

The free allowance is 1,000 GB/month of TURN egress. A 4-player game uses roughly 2–5 GB per 100 hours
relayed, and only pairs that need TURN use it.

Self-hosted alternative: [coturn](https://github.com/coturn/coturn) on any VM, then
`VITE_TURN_URL=turn:host:3478 VITE_TURN_USER=… VITE_TURN_CRED=…` (static credentials end up in the
build; fine for friends, not for public).

## 4. Dedicated server (optional)

`server/dedicated.ts` runs the authoritative world headless in Bun over WebSockets. Use it for an
always-on room, or for desktop/Linux webviews that lack WebRTC.

```sh
docker run -d --restart=always -p 8787:8787 -e MODE=dedicated shardfall-server
```

Players reach it from the main menu: **Join Server** appears when the build has
`VITE_DEDICATED_URL=wss://your.host` (repo variable `DEDICATED_URL` for the Pages build), or with
`?server=wss://your.host` on the page. This is also how the WebKitGTK "Lite" desktop build plays online.

**Oracle Cloud Always Free** (4 ARM cores and 24 GB RAM, 10 TB egress/month) is the most generous free
VM. Install Docker, open port 8787 (or 443 behind Caddy) in the VCN security list and in `iptables`,
then run the command above. GCP's free e2-micro also works, but it has only 1 GB/month of free egress,
so it's fine for the relay and too small for a busy game server.

## 5. Desktop builds

The desktop app embeds the web build. Online play in it uses the same relays and TURN as the web build.
See `desktop/README.md`.

## Checking it works

```sh
bun run build && (cd dist && python3 -m http.server 4401 &)
bun run e2e:mp http://localhost:4401/index.html            # two headless browsers, local relay
RELAY_URL=wss://shardfall-signal.<you>.workers.dev bun run e2e:mp http://localhost:4401/index.html
```

The E2E opens two Chromium browsers. One hosts through the menus and the other joins with the room code;
the script then checks that movement syncs both ways, prediction matches the host, and a backgrounded
host keeps the world running. It then starts `server/dedicated.ts` and checks that two browsers can
play together through **Join Server**.

## Costs at a glance

| Usage | Pages | Worker relay | TURN | Total |
|---|---|---|---|---|
| Friends & playtests | free | free | free | **$0** |
| A few thousand players/month | free | free (≈ a few k requests/day) | free under 1 TB | **$0** |
| Beyond that | free | Workers Paid $5/month | $0.05/GB over 1 TB | ~$5+ |
