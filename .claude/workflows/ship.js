export const meta = {
  name: 'ship',
  description: 'Ship track: desktop packaging (Electrobun, mac/linux/win CI), hosting setup (Pages, relay worker, dedicated server), real multi-browser WebRTC E2E multiplayer tests, automated playtest bot — implement -> adversarial review/fix',
  phases: [
    { title: 'Implement', detail: 'one agent per workstream in its own git worktree/branch' },
    { title: 'Review', detail: 'adversarial reviewer fixes bugs in the same worktree' },
  ],
}

// args: { base: '<commit sha the worktrees start from>', keys?: string[] }
const BASE = args.base
const SHOTS = 'screenshots'

const COMMON = `
You are a senior engineer on "Shardfall" (working title), an ORIGINAL TypeScript recreation/extension of the 2014 game Magicite: a 2D pixel-art roguelike platformer with two-item crafting, permadeath and ONLINE CO-OP. Stack: Bun, Vite 8, TypeScript 7, Vitest 5, PixiJS 8.22, trystero (P2P WebRTC; Nostr signaling by default, @trystero-p2p/ws-relay available on npm for a self-hosted relay).

STATE: sim, render, UI, audio, netcode (src/net: HostSession/ClientSession, trysteroTransport, wsTransport, server/dedicated.ts) are merged at ${BASE}. In parallel other agents are working on: netfix (src/net prediction fixes), flow (run flow), glue (gameplay dedupe), enemies, bosses, app (title/menus/character creation/ONLINE LOBBY in src/game + src/main.ts + src/ui/menus), sprites. Do NOT edit their areas; code against the current contracts and report anything they must change.

ENVIRONMENT FACTS (this container): Ubuntu 24.04, root, 4 CPUs. npm registry, jsr, GitHub release assets (curl -L) and archive.ubuntu.com (apt-get) are reachable; most other hosts are blocked (no public Nostr relays, no Cloudflare APIs). Chromium for Playwright: /opt/pw-browsers/chromium (use playwright-core 1.56.1 from devDeps). No macOS/Windows here: cross-platform builds must run in GitHub Actions; validate workflow YAML carefully (actionlint via \`bunx actionlint\` if installable, else careful review).

SETUP (first):
- You are in an isolated git worktree of /home/user/magicite at ${BASE}. Run \`bun install\`.
- Branch: if \`git branch --list ship/WSKEY\` is EMPTY: \`git checkout -b ship/WSKEY\`. If it EXISTS you are RESUMING: \`git worktree list\` — if checked out elsewhere, cd there and continue there (report THAT path); else \`git checkout ship/WSKEY\`. Read \`git log --stat ${BASE}..ship/WSKEY\` + uncommitted changes and continue.
- READ: CLAUDE.md, docs/architecture.md (Multiplayer + Desktop sections), docs/research/tech-stack.md, docs/research/libraries.md, server/README.md, src/net/index.ts and the code you build on.

!!! CRASH SAFETY: commit EARLY and OFTEN (every ~15 min and every milestone). Uncommitted work is lost on restarts.

RULES: only modify your OWNED paths; shared files (package.json scripts/devDeps, vite.config.ts, src/config.ts, .gitignore) may get minimal additive edits — list them. Keep \`bun run typecheck\` + \`bun run test\` passing (5 known net failures may exist until netfix merges — don't add new failures). Kill any server you start by PID (never pkill -f patterns that match your own shell). Commit messages end with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GuoS8h2imwbyNTe9aF2qh9
Do NOT push or merge. Return the structured report.
`

const WS = {
  desktop: { owned: 'desktop/**, .github/workflows/desktop.yml, scripts/desktop/**, scripts/icons/**, docs/desktop.md, package.json (scripts/devDeps)', spec: `
WORKSTREAM: DESKTOP APPS for macOS, Linux, Windows (Bun toolchain; decided in docs/architecture.md).
1. Shell: use **Electrobun** (npm electrobun 2.x, MIT; Bun main process + system webview: WKWebView / WebView2 / WebKitGTK) in desktop/. Load the single-file web build (\`bun run build:single\` → dist-single/index.html) as the app view (embed/copy into the app bundle). Window 1280x720, min size 640x360, resizable, title "Shardfall", F11/⌘⌃F fullscreen toggle, remember window size/position (app data dir), quit on close. If Electrobun proves unworkable after a genuine attempt, fall back to webview-bun (npm) and document why.
2. Persistence: verify localStorage persists across launches in each webview; if not, expose save/load via the shell's RPC (typed) and add a tiny adapter in desktop/ (the game's meta/settings code uses localStorage with try/catch — report what the app workstream should call if an adapter is needed).
3. WebRTC capability: WebKitGTK builds may lack RTCPeerConnection. Detect at runtime; document. The game's online menu must then use the WebSocket relay/dedicated path (report to the lead what the app/net code needs: e.g. a \`window.__shardfallPlatform = { webrtc: boolean, relayUrl?: string }\` contract injected by the shell).
4. App icon: generate procedurally (pixel-art crystal shard on dark background) as PNG (write a tiny PNG encoder or use an npm package) at 1024/512/256/128/64/32/16 and produce .icns/.ico (npm packages like png2icons are fine) via scripts/icons/.
5. Local verification on Linux: apt-get install the WebKitGTK/GTK dev+runtime packages Electrobun needs (and xvfb), build the Linux app, launch it under Xvfb, take a screenshot (e.g. with \`import -window root\` from imagemagick or xwd) and LOOK at it; record the binary/bundle sizes (raw and compressed) and whether RTCPeerConnection exists in WebKitGTK.
6. CI: .github/workflows/desktop.yml — matrix macos-14 (arm64), macos-13 (x64), ubuntu-24.04, windows-latest: checkout, setup-bun, bun install, build:single, electrobun build (release), upload artifacts (dmg/zip/AppImage or tar.gz/zip); on tag v* create a GitHub Release with all artifacts. Signing/notarization: leave documented TODOs with the secrets needed (APPLE_ID etc.), unsigned builds by default.
7. docs/desktop.md: how to build locally per OS, CI usage, sizes measured, known limitations (WebRTC on Linux, Gatekeeper/SmartScreen warnings for unsigned builds), and the "truly tiny" alternative (Tauri / C webview shell) for later.` },

  hosting: { owned: 'server/relay/** (new), server/Dockerfile, server/fly.toml|railway.json (optional), .github/workflows/pages.yml, docs/HOSTING.md, src/config.ts (net config only), package.json (scripts)', spec: `
WORKSTREAM: HOSTING SETUP (free tiers) + network configuration.
1. Web build hosting: .github/workflows/pages.yml that builds (\`bun run build\`, base './') and deploys to **GitHub Pages** via actions/deploy-pages on push to the default branch and on manual dispatch; also document Cloudflare Pages (wrangler pages deploy dist) and Netlify as alternatives. Make sure the built site works from a sub-path (/<repo>/).
2. Signaling/relay: P2P uses trystero. Default strategy Nostr (public relays, free). Provide a SELF-HOSTED relay as a fallback that works where Nostr is blocked: (a) a Cloudflare Worker + Durable Object implementing the trystero ws-relay protocol (read node_modules/@trystero-p2p/ws-relay source after \`bun add @trystero-p2p/ws-relay\` to learn the exact protocol) in server/relay/ with wrangler.toml, plus (b) the same relay as a tiny Bun server (server/relay/bun-relay.ts) for local dev/tests and for Oracle/Railway/Fly. Unit-test the relay logic (room join/leave, message fan-out, limits: max peers per room, message size caps, idle timeouts, simple per-IP rate limit).
3. Dedicated authoritative server option: server/Dockerfile (oven/bun base, runs server/dedicated.ts, healthcheck), with env config (PORT, MAX_ROOMS), and docs for Oracle Cloud Always Free (ARM VM steps + systemd unit), Railway and Fly.io.
4. Client network config: src/config.ts exposes NET_CONFIG (signaling strategy, nostr relay list override, ws-relay URL, TURN/STUN servers, dedicated server URL) read from Vite env vars (VITE_RELAY_URL, VITE_TURN_URL/USER/CRED, VITE_DEDICATED_URL) with sensible defaults (public Google/Cloudflare STUN). The app/netcode workstreams will consume it — document the contract.
5. TURN: document options (Cloudflare Realtime TURN, metered.ca free tier, self-hosted coturn on the Oracle VM with a sample turnserver.conf).
6. docs/HOSTING.md: a precise, copy-pasteable guide for the owner: enable GitHub Pages (Settings → Pages → Source: GitHub Actions), deploy the relay worker (wrangler login/deploy), set repo/Actions variables for VITE_* config, run the dedicated server on Oracle Free, costs (all free tiers) and limits, security notes (room codes are not secret; rate limits), and how to verify each piece. Include a decision table: "just play with friends" (Pages + Nostr) vs "reliable" (Pages + CF relay + TURN) vs "authoritative dedicated".` },

  mp_e2e: { owned: 'tests/e2e/** (Playwright scripts, not vitest), scripts/e2e/**, e2e/ (harness pages), docs/testing-multiplayer.md, package.json (scripts)', spec: `
WORKSTREAM: REAL END-TO-END MULTIPLAYER VERIFICATION in browsers (this is how we prove "multiplayer works").
1. Harness: an e2e harness page (e2e/harness.html + e2e/harness.ts built by Vite as an extra entry, or served by \`bunx vite\` dev) that boots the real game renderer + a HostSession or ClientSession from src/net given URL params (role=host|client, room, transport=trystero-relay|ws, relayUrl) and exposes \`window.__e2e\` (world snapshot getters, input injection, stats: rtt, corrections, bytes). Do not depend on the app workstream's menus (being built in parallel).
2. Local relay for WebRTC signaling: run a trystero-compatible ws-relay locally (@trystero-p2p/ws-relay server if it ships one, or a ~100-line Bun relay speaking its protocol — check the package source; another agent is building server/relay/bun-relay.ts in parallel, you may write your own minimal one under scripts/e2e/). Headless Chromium peers on localhost connect via WebRTC host candidates (no STUN needed).
3. Scenarios (Playwright, 2–4 browser contexts, /opt/pw-browsers/chromium with --use-angle=swiftshader): host + 1 client join; both move/jump/dash with scripted inputs; assert client view converges to host state (positions within 1–2 px after settling, same level seed/name); client crafts (Wood+Wood) and the host's world shows the result in that player's inventory; level transition through a portal syncs everyone; 3 clients; client disconnect + rejoin with token; host leaves → clients see "disconnected". Also the WebSocket dedicated-server path (bun server/dedicated.ts + ws clients). Inject network impairment where possible (Chromium CDP Network.emulateNetworkConditions for latency) and record RTT/corrections/bytes per second.
4. Make it runnable with one command: \`bun run e2e\` (starts relay + vite preview/dev + runs scenarios + writes a markdown/JSON report under screenshots/e2e/ with screenshots of host and client views side by side). LOOK at the screenshots.
5. If you find netcode bugs, fix them ONLY if the fix is small and contained, and list every change to src/net in your report (the netfix agent edits src/net concurrently — the lead merges). Otherwise document repro steps precisely.
6. docs/testing-multiplayer.md: how to run, what is covered, how to test with real friends over the internet (two machines + Nostr or the relay), and a manual QA checklist.` },

  playtest: { owned: 'scripts/playtest/**, tests/playtest/**, docs/playtest-report.md', spec: `
WORKSTREAM: AUTOMATED PLAYTESTING + BALANCE REPORT.
1. Headless bot (scripts/playtest/bot.ts, runs the pure sim via createRun with fast stepping): a scripted player that explores toward the portals (use the gen traversability graph/validator in src/sim/gen to path-find, or a simple local planner with jump/double-jump/dash), chops trees, mines rocks, picks up drops, crafts the basic progression (planks → sticks/blades → wooden sword/pickaxe → stone tools → iron at towns' forge when possible), eats when hungry, fights enemies it meets, enters portals (chooses biomes), and keeps going through towns. Modes: normal and 'god' (no damage) to separate progression bugs from difficulty.
2. Run many seeds (e.g. 50 normal + 20 god) up to level 21 or death/stuck; detect: exceptions, NaN positions, entities outside bounds, player stuck > N seconds, unreachable portals, softlocks (cannot obtain a needed tool), inventory full stalls, levels that take > 6 min of sim time, wraith timing, death causes, item/tier progression per district, gold curve, XP/level curve, enemy density per biome. Performance: average/max ms per tick at 1–4 players.
3. Browser smoke (Playwright, /opt/pw-browsers/chromium + swiftshader): build the app, open it, play with the bot's inputs for a while in each biome/town (teleport via window.game.session.world for coverage), capture screenshots of every biome, a town, a boss arena (if bosses exist at runtime) and the inventory; check console errors; measure FPS (requestAnimationFrame counter) — look at the screenshots.
4. Write docs/playtest-report.md: summary table, prioritized issue list (P0 crash/softlock, P1 major, P2 polish) with repro seeds and exact steps, balance observations with numbers, and suggested fixes. Make \`bun run playtest\` reproduce it (fast mode + full mode).
5. Fix only trivial, clearly-scoped bugs in your owned paths; everything else goes into the report for the lead.
Add vitest tests in tests/playtest/ for the bot's planner utilities and a short smoke (3 seeds × first 2 levels in god mode completes without exceptions).` },
}

const keys = args.keys ?? Object.keys(WS)

const REPORT = {
  type: 'object',
  properties: {
    branch: { type: 'string' }, worktree: { type: 'string' }, summary: { type: 'string' },
    sharedFileEdits: { type: 'array', items: { type: 'string' } },
    integrationNotes: { type: 'string' }, testsAdded: { type: 'string' }, knownGaps: { type: 'string' },
  },
  required: ['branch', 'worktree', 'summary', 'sharedFileEdits', 'integrationNotes', 'knownGaps'],
}
const REVIEW = {
  type: 'object',
  properties: {
    issuesFound: { type: 'array', items: { type: 'string' } }, fixed: { type: 'array', items: { type: 'string' } },
    remaining: { type: 'array', items: { type: 'string' } }, checksPass: { type: 'boolean' }, headCommit: { type: 'string' },
  },
  required: ['issuesFound', 'fixed', 'remaining', 'checksPass', 'headCommit'],
}

return await pipeline(
  keys,
  (k) => {
    const w = WS[k]
    const prompt = (COMMON + `\nOWNED PATHS: ${w.owned}\n` + w.spec).split('WSKEY').join(k)
    return agent(prompt, { label: `impl:${k}`, phase: 'Implement', isolation: 'worktree', schema: REPORT })
  },
  (rep, k) => {
    if (!rep) return null
    const w = WS[k]
    return agent(`You are an ADVERSARIAL senior reviewer for the "${k}" ship-track workstream of an online-co-op TypeScript game (CLAUDE.md rules; docs/architecture.md).
Work in the implementer's worktree: cd ${rep.worktree} (branch ${rep.branch}; base ${BASE}). Run \`bun install\` if needed. CRASH SAFETY: commit each fix as soon as it passes.
Implementer report: ${JSON.stringify(rep)}
Original spec:
---
${w.spec}
---
Verify claims by RUNNING things (builds, scripts, e2e, relay tests) — do not trust the report. Find and FIX real problems in \`git diff ${BASE}..HEAD\`: broken scripts, CI YAML errors (wrong action versions/inputs, matrix mistakes, missing permissions), security issues (relay abuse, open CORS, secrets in code), docs that don't match reality, flaky tests, spec items skipped, edits outside owned paths (${w.owned}) that are not minimal. Keep typecheck + tests passing (5 known net failures acceptable). Kill servers by PID. Commit fixes (messages end with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuoS8h2imwbyNTe9aF2qh9). Do not push or merge. Return the structured review.`,
      { label: `review:${k}`, phase: 'Review', schema: REVIEW }).then((rv) => ({ key: k, report: rep, review: rv }))
  },
)
