# Shardfall tech stack (decided) and packaging plan

What we build Shardfall with, why, and how it ships. It covers the browser game and the desktop shell, and
includes measured size data. Structure and rules live in `docs/architecture.md`; vetted libraries in
`docs/research/libraries.md`. This file records **versions, rationale, measurements and the packaging
decision**.

---

## 1. Summary

| Layer | Choice | Version (installed) |
|---|---|---|
| Language | TypeScript, strict, `verbatimModuleSyntax`, ES2022 target | `typescript` 7.0.2 (native compiler, `tsc --noEmit`) |
| Package manager / scripts | Bun (npm also works) | Bun 1.3.14 locally; Node 22.22.0 available |
| Bundler / dev server | Vite (Rolldown-based) | `vite` 8.3.2 |
| Single-file build | `vite build --mode single` → `dist-single/index.html` | `vite-plugin-singlefile` 2.3.3 |
| Tests | Vitest, `environment: 'node'`, headless sim tests | `vitest` 5.0.3 |
| Rendering | PixiJS v8 (WebGL2 preferred; WebGPU optional; Canvas fallback) | `pixi.js` 8.22.0 |
| Post FX | Bloom/blur filters | `pixi-filters` 6.1.5 |
| Procedural SFX | ZzFX parameter arrays on WebAudio | `zzfx` 1.4.0 |
| Music | Own WebAudio step sequencer (data patterns) | — |
| Level noise | Seeded simplex noise (wrapped around our `Rng`) | `simplex-noise` 4.0.3 |
| Networking | WebRTC P2P via Trystero (Nostr signaling; self-hosted WebSocket relay fallback) + our own binary snapshot codec | `trystero` 0.25.4 |
| Screenshots / browser smoke | Playwright core driving `/opt/pw-browsers/chromium` (`scripts/screenshot.ts`) | `playwright-core` 1.56.1 |
| Node typings | — | `@types/node` 26.6.4 |
| Web hosting | Cloudflare Pages (static); Worker + Durable Object for the relay | — |
| Desktop | **The game is one self-contained HTML file; the shell is swappable.** Recommended shells in §6 | — |

Commands are in `CLAUDE.md` (`bun run dev`, `typecheck`, `test`, `check`, `build`, `build:single`).

---

## 2. Rationale per component

- **TypeScript 7 (native compiler).** Order-of-magnitude faster typechecks keep `bun run check` cheap enough
  to run before every commit. Strict settings plus `noUnusedLocals/Parameters` catch dead code in a codebase
  written by many parallel agents. The code must stay valid for `tsc --noEmit` (no TS-7-only syntax tricks).
- **Bun as package manager and script runner.** Fast installs and native TS execution for scripts
  (`bun scripts/screenshot.ts`). The **game itself does not depend on Bun**: it runs in any browser or webview,
  and the sim runs unchanged in Bun, Deno or Node (rule 1).
- **Vite 8.** Instant dev server with HMR; `?seed=123` for fixed runs; one config produces both the multi-file
  web build (`dist/`, lazy chunks, cacheable) and the single-file build (`dist-single/`, everything inlined:
  `assetsInlineLimit = MAX_SAFE_INTEGER`, singlefile plugin).
- **Vitest 5 in a Node environment.** The sim is pure, so tests need no DOM or GPU. Every sim feature gets a
  test (rule 8); determinism tests compare hashes of two runs from the same seed.
- **PixiJS 8 as a renderer only.** We own the deterministic sim, so we want a fast 2D renderer, not an engine
  with its own scene/physics model. Pixi gives batching, render textures (light map), blend modes (multiply
  light map, additive glow), filters (bloom), WebGL2, WebGPU and a Canvas fallback in one MIT package. Its
  renderer back-ends load as **lazy chunks**, so only the chosen back-end is parsed at runtime (§4).
- **pixi-filters 6.** `AdvancedBloomFilter` / `KawaseBlurFilter` for the glow look; import filters
  individually so the rest tree-shakes.
- **ZzFX.** ≈1 KB synth; every SFX is a parameter array, so there are **no audio files**, matching the
  "no assets, everything procedural" goal and the tiny single-file build.
- **simplex-noise 4.** Seedable 2D/3D noise for cave carving and decoration density; seeded from our `Rng` so
  generation stays deterministic across peers.
- **Trystero 0.25.** Serverless room join over public Nostr relays (no signaling server to run); exposes the
  `RTCPeerConnection`s so we add our own unreliable, unordered DataChannel (negotiated, fixed id) for
  inputs/snapshots. Self-hosted WebSocket relay strategy as fallback.
- **Playwright core + Chromium.** Headless screenshots of real frames for visual review and smoke tests.

Rejected engines and libraries (with reasons) are in `libraries.md`. The bundle measurements below back
those choices with numbers.

---

## 3. Browser capabilities in our test environment (measured)

`probe.mjs` in the scratchpad launched `/opt/pw-browsers/chromium` with and without SwiftShader flags:

| Capability | Result |
|---|---|
| WebGL2 / WebGL1 | Available: ANGLE on Vulkan 1.3 **SwiftShader** (software) in both modes |
| `MAX_TEXTURE_SIZE` | 8192 |
| WebGPU | **Not available** (`navigator.gpu` adapter request failed) |
| Gamepad API, `AudioContext`, `OffscreenCanvas` | Present |

Consequences:
- The renderer must **prefer WebGL** (`preference: 'webgl'`); WebGPU is an optional upgrade, never required.
- Screenshot tests run on a software rasterizer: keep effect passes cheap (one light map, one bloom pass on
  the emissive layer) so CI frames render in reasonable time.
- Texture atlases stay ≤ 4096² (8192 is the ceiling here; many integrated GPUs and webviews are 4096 or
  16384).

---

## 4. Engine bundle-size experiment (measured)

Each engine was built with Vite 8.3.2 (`target: 'es2022'`, default minification) from a minimal 320×180
program. All six builds succeeded (`err-*.txt` are empty). Sizes are the sum of emitted JS; gzip is `gzip -9`
per file.

| Engine (version) | Test program | JS raw | JS gzip |
|---|---|---|---|
| LittleJS 1.23.1 | `engineInit` + one `drawRect` | 97,096 B (95 KiB) | 35,577 B (35 KiB) |
| KAPLAY 3001.0.19 | One rect entity | 187,361 B (183 KiB) | 67,935 B (66 KiB) |
| Excalibur 0.32.0 | Engine + one Actor | 476,364 B (465 KiB) | 119,963 B (117 KiB) |
| **PixiJS 8.22.0** | Application + Sprite + ParticleContainer (500 particles) + Graphics | 533,001 B (520 KiB) in 17 chunks | **156,495 B (153 KiB)** |
| PixiJS 8.22.0 + `@pixi/tilemap` 5.0.2 | `CompositeTilemap` with 1000 tiles | 536,025 B (523 KiB) | 157,788 B (154 KiB) |
| Phaser 4.2.1 | One scene with a rectangle | 1,375,322 B (1.31 MiB) | 352,410 B (344 KiB) |

Notes:
- **Pixi's total counts every back-end.** The largest chunks are `CanvasPool` 112.9 KB, `CanvasRenderer`
  88.5 KB, `RenderTargetSystem` 78.2 KB, `WebGLRenderer` 72.8 KB, `WebGPURenderer` 55.2 KB, `browserAll`
  43.5 KB. Pixi loads its back-ends through dynamic imports, so a WebGL session should not fetch or parse the
  WebGPU or Canvas chunks [G]. The single-file build inlines everything, so its size counts all of them.
- `@pixi/tilemap` costs only ≈1.3 KB gzip, so the earlier rejection (cached chunk canvases are simpler for
  destructible, procedurally textured tiles) is about design, not size; it can be revisited.
- Phaser is ≈2.3× Pixi's gzip size and brings a scene/physics model we would fight (libraries.md).
- LittleJS and KAPLAY are smaller but give less control over render targets, blend modes and filters, which
  the darkness/glow look needs.

**Shardfall today** (scaffold stage, measured on the current tree):

| Build | Files | Raw | gzip -9 | xz -9 |
|---|---|---|---|---|
| `dist/` (web, 2026-10-02 build) | 10 | 587,866 B (574 KiB) | 173,717 B (170 KiB) | — |
| Single file (`vite build --mode single`, built 2026-10-03) | 1 | 597,783 B (584 KiB) | 175,077 B (171 KiB) | 146,092 B (143 KiB) |

**Budget.** All art and audio are generated in code, so the single HTML should stay **≤ 2 MB raw
(≈ 600 KB gzip)** at 1.0. Track it in CI by failing the build above the budget.

---

## 5. Desktop shells: measured runtime sizes

The original plan (`architecture.md`, "Desktop packaging") was a Bun (`webview-bun`) or Deno
(`@webview/webview`) program compiled to a single executable that loads `dist-single/index.html` into the OS
webview. We measured what such a binary costs **before any game code**.

| Artifact (Linux x64) | Raw | gzip -9 | xz -9 |
|---|---|---|---|
| `bun build --compile` hello world, **Bun 1.3.14** (`a-bun`) | **94,582,912 B (94.6 MB)** | 35,982,404 B (36.0 MB) | 24,743,440 B (24.7 MB) |
| `bun build --compile` hello world, **Bun 1.4.2** (`a-bun142`) | **81,315,296 B (81.3 MB)** | 36,662,617 B (36.7 MB) | 27,644,644 B (27.6 MB) |
| Bun 1.4.2 runtime binary alone (npm `@oven/bun-linux-x64`) | 79,500,640 B (79.5 MB) | — | — |
| Bun 1.4.2 npm tarball | 37,119,594 B (37.1 MB) | (is gzip) | — |
| Deno 2.9.6 runtime binary | 95,600,728 B (95.6 MB) | — | 29,734,060 B (29.7 MB) |
| Deno 2.9.6 npm tarball | 42,285,097 B (42.3 MB) | (is gzip) | — |
| `deno compile` hello world | **not measured**: `deno compile` downloads the `denort` runtime from `dl.deno.land`, which the sandbox's egress proxy refused | — | — |

The hello-world program was `console.log("hi", Bun.version)`; both binaries ran and printed `1.3.14` and
`1.4.2`. The compiled executable is the runtime plus ≈1.8 MB (81.3 − 79.5 MB): **a compiled Bun/Deno shell
embeds the whole JavaScript runtime**. A `deno compile` binary embeds `denort`, a trimmed runtime, but still
the full V8; expect the same order of magnitude (tens of MB) [G]. Adding a webview binding (`webview-bun`,
`@webview/webview`) adds a small native library on top.

**Bun's own `Bun.WebView` is not a desktop shell.** It is a headless automation API: WKWebView on macOS,
Chrome/Edge over the DevTools protocol elsewhere (Bun docs, `runtime/webview.mdx`).

### 5.1 Why this matters for Shardfall

The game runs entirely inside the webview's own JS engine (V8 in WebView2, JavaScriptCore in WKWebView and
WebKitGTK). A desktop shell only needs to open a window, load one HTML file and optionally persist saves.
Shipping a second, 80–95 MB JavaScript runtime to do that is pure overhead: the shell would be **≈135–160×
larger than the game it carries** (≈0.6 MB raw today; the ratio is similar compressed, ≈25 MB vs 0.15–0.18 MB).

---

## 6. Shell options

| Shell | How | Download / on-disk size | Pros | Cons |
|---|---|---|---|---|
| Bun `--compile` + `webview-bun` | TS shell, compiled | **≈81–95 MB** on disk, ≈25–37 MB compressed (measured runtime) | Same language and toolchain; trivial to write | Embeds the Bun runtime; large |
| Deno `compile` + `@webview/webview` | TS shell, compiled | ≈ tens of MB (runtime 95.6 MB; `denort` not measured) | Same; permissions model | Same problem |
| **Electrobun** (Bun/Cottontail main process, system webview) | TS main process, Hutch build tool; **self-extracting bundles compressed with Zstandard**; bsdiff delta updates; DMG / `.tar.gz` setup / Flatpak | With a Bun main process the download is roughly the compressed runtime (≈25–37 MB class, from our gzip/xz numbers) and the install unpacks to ≈80 MB+ [G]. With the default **Cottontail** runtime (Zig + JavaScriptCore, "carries only the APIs applications use") or a **native main process** (Zig, Rust, Go, Odin) the bundle is smaller; not measured | All-TypeScript workflow, auto-updater with kilobyte patches, cross-platform builds, CEF opt-in | Young project, fast-moving APIs; Linux needs GTK 3 + WebKitGTK 4.1 + AppIndicator + librsvg; sizes unverified |
| **Tauri 2** (Rust, system webview) | Rust shell, `tauri.conf.json`; size-optimised Cargo profile (`lto`, `opt-level = "s"`, `strip`, `panic = "abort"`, `removeUnusedCommands`) | **≈2–10 MB** installers [K] | Mature, small, signing/updater/bundlers, Steamworks via Rust crates [K] | Rust toolchain; WebKitGTK caveats on Linux |
| **Minimal C / Zig shell** on the `webview/webview` library | ≈100–200 lines: create window, embed the HTML (`#embed`/`@embedFile`), set title/size, bind 3–4 host functions | **≈1–3 MB** including the game [K] | Smallest possible; no runtime; easy to audit | We maintain native build scripts per OS; no updater |
| Electron / NW.js | Bundled Chromium | ≈100–200 MB [K] | Identical rendering everywhere | Contradicts the "tiny" goal; rejected |

### 6.1 Decision

1. **The game stays one self-contained HTML file** (`dist-single/index.html`) with no runtime dependency on
   any shell. This is the contract that makes the shell swappable.
2. **Ship the web build first** (Cloudflare Pages, itch.io HTML5). It is the zero-install path and the main
   multiplayer test bed.
3. **Desktop:** prefer **Tauri 2** or a **minimal C/Zig `webview` shell** for a truly small download
   (**1–10 MB**). Use **Electrobun** if we want an all-TypeScript toolchain with compressed installers and
   delta updates and accept a larger first download (its Cottontail or native main process should be
   measured before committing). A Bun/Deno compiled shell remains acceptable **only as a dev convenience or
   internal build**; it cannot meet a "tiny binary" goal because it embeds an ≈80–95 MB runtime.
4. The **optional dedicated server** is different: it runs the sim headless, so it needs a JS runtime anyway.
   There a compiled Bun binary (≈81 MB) or plain `bun run` is fine.

`architecture.md` ("Desktop packaging (later phase)") still describes the Bun/Deno shell; treat this section
as the updated decision when that phase starts.

### 6.2 Shell contract (any implementation)

| Concern | Requirement |
|---|---|
| Content | Load the embedded `index.html` from a custom scheme or in-memory string. No remote page loads |
| Window | Title "Shardfall", default 1280×720, minimum 640×360, resizable, F11 fullscreen, remember size/position |
| Host bridge (optional) | `window.shardfallHost = { platform, saveRead(key), saveWrite(key, json), quit(), setFullscreen(on) }`. The game must work without it (fallback: `localStorage` + IndexedDB) |
| Networking | None native. The page uses WebRTC (Trystero); if `RTCPeerConnection` is missing (some WebKitGTK builds), it falls back to the WebSocket relay, which every webview supports |
| Audio | Unlock WebAudio on first input (autoplay policies apply in webviews too) |
| Input | Keyboard/mouse via DOM; gamepads via the Gamepad API (WebView2: yes; WKWebView and WebKitGTK: version-dependent [K], so test) |
| Steam (later) | Steamworks calls live in the shell's native side behind the same bridge (achievements, rich presence, overlay). Never required to play |

### 6.3 Webview rendering caveats

- **WebView2 (Windows)**: Chromium, self-updating, preinstalled on Windows 11; Tauri installers bootstrap it
  on older Windows (Tauri docs, `reference/webview-versions.md`).
- **WKWebView (macOS)**: system Safari engine; WebGL2 yes, WebGPU depends on the OS version.
- **WebKitGTK (Linux)** (Tauri docs, `develop/Debug/linux-graphics.md`):
  - NVIDIA + DMABUF renderer can give blank or flickering windows or crash on resize; workarounds are
    environment variables (`__NV_DISABLE_EXPLICIT_SYNC=1`, `WEBKIT_DISABLE_DMABUF_RENDERER=1`,
    `WEBKIT_DISABLE_COMPOSITING_MODE=1`) set by the shell before creating the webview, only when needed.
  - **WebGL can silently fall back to a slow path**, and WebKitGTK **masks the WebGL renderer string** ("Apple
    GPU"), so the page cannot detect it.
  - Mitigations for us: a **low-effects mode** (no bloom, light map at half resolution), Pixi's **Canvas
    renderer** as a user-selectable fallback, and an automatic suggestion when the average frame time stays
    above 20 ms for 3 s.

---

## 7. Packaging plan

| Phase | Deliverable | Notes |
|---|---|---|
| Now | `bun run build` → `dist/` on Cloudflare Pages; `?seed=` for fixed runs | Multi-file, cache-friendly |
| Now | `bun run build:single` → `dist-single/index.html` | The artifact every shell embeds; size budget §4 |
| Phase 2 | itch.io HTML5 zip of `dist/` | Same build |
| Phase 2 | Desktop shell prototype in `desktop/`: Tauri 2 **or** a C/Zig `webview` shell; build Windows x64, macOS arm64/x64, Linux x64 | Measure installer sizes and record them here |
| Phase 2 | Optional Electrobun build for comparison (Cottontail main process) | Measure before choosing |
| Phase 2+ | Code signing (Windows Authenticode, Apple notarisation), Steam depot, Steamworks bridge | Shell-side only |
| Optional | Dedicated server: `bun build --compile server/index.ts` (≈81 MB) or `bun run` on an always-free VM | Reuses `src/sim` + `src/net` |

---

## 8. Netcode and hosting (recap)

- Host-authoritative listen server, P2P transport, up to 4 players; inputs every tick with redundancy over an
  unreliable channel; 30 Hz delta-compressed, interest-filtered binary snapshots; client prediction and
  reconciliation for the local player; snapshot interpolation for remote entities (`architecture.md`).
- Signaling: Trystero over public Nostr relays (free). Fallback: self-hosted WebSocket relay on a Cloudflare
  Worker + Durable Object (also relays game traffic when WebRTC fails). STUN: public; TURN: Cloudflare Realtime
  TURN for strict NATs.
- Planned additions: `node-datachannel` 0.33 (MPL-2.0) for the dedicated server and webviews without WebRTC;
  `msgpackr` 2.1 for reliable low-frequency messages and saves.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Linux webviews: slow WebGL, missing WebRTC | Low-effects mode, Canvas fallback, WebSocket relay |
| WebGPU absent in CI and many webviews | WebGL2 is the default path; WebGPU opt-in only |
| Bundle growth from libraries | CI size budget on `dist-single/index.html`; import Pixi filters individually |
| Determinism drift (iteration order, floats, `Math.random`) | Rule 1 + seeded-run hash tests in Vitest |
| Electrobun API churn | Keep the shell thin; the HTML contract is shell-agnostic |
| Shell size creeping back up | Re-measure each shell build; record numbers in §5–6 |

---

## 10. Reproducing the measurements

```sh
# Compiled hello-world shells (Linux x64)
echo 'console.log("hi", Bun.version)' > a.ts
bun build --compile a.ts --outfile a-bun          # Bun 1.3.14 → 94,582,912 B
# same with the Bun 1.4.2 binary from the @oven/bun-linux-x64 npm tarball → 81,315,296 B
gzip -9 -c a-bun | wc -c ; xz -9 -c -T0 a-bun | wc -c
deno compile -A -o d-deno d.ts                     # needs dl.deno.land for denort (blocked here)

# Engine bundles: one tiny entry per engine, built with Vite 8.3.2
ENG=pixi bunx vite build                           # outDir dist-$ENG; then sum *.js and gzip -9 each

# Shardfall single file
bunx vite build --mode single                      # prints raw and gzip size
```

Raw data: scratchpad `sz/` (binaries and tarballs) and `eng/dist-*` (engine builds), session
2026-10-02/03.

## Sources

- `package.json`, `vite.config.ts`, `tsconfig.json`, `docs/architecture.md`, `docs/research/libraries.md`
- Bun docs: `bundler/executables.mdx` (`--compile`, `--bytecode`, `--minify`), `runtime/webview.mdx`
  (`Bun.WebView` is headless automation) — https://bun.com/docs
- Electrobun docs and README (Hutch, Cottontail, native main processes, Zstandard self-extracting bundles,
  bsdiff patches, platform matrix): https://github.com/blackboardsh/electrobun ;
  https://framework.blackboard.sh/electrobun/
- Tauri docs: `concept/size.mdx` (size-optimised profiles, `removeUnusedCommands`),
  `reference/webview-versions.md`, `develop/Debug/linux-graphics.md` — https://v2.tauri.app
- webview/webview (C/C++ single-header webview library): https://github.com/webview/webview [K]
