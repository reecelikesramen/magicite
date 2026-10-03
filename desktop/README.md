# Desktop app

A native window around the single-file web build, made with [Electrobun](https://electrobun.dev)
(Bun main process + the OS webview). Game code is identical to the web version.

```sh
cd desktop
bun install
bun run dev            # build the web bundle, open a dev window
bun run build          # stable build for this OS -> desktop/artifacts/
SHARDFALL_LITE=1 bun run build   # Linux: system WebKitGTK instead of bundled Chromium
```

Electrobun builds for the OS it runs on, so the CI workflow (`.github/workflows/desktop.yml`)
builds each platform on its own runner. Run it from the Actions tab, or push a tag
(`git tag v0.2.0 && git push --tags`) to publish a GitHub Release.

## Platforms

| Target | Webview | Online co-op | Installer download (measured in CI) |
|---|---|---|---|
| macOS (Apple Silicon) | WKWebView (system) | yes (WebKit WebRTC) | **≈ 19 MB** |
| Windows x64 | WebView2 (system Chromium) | yes | **≈ 33 MB** |
| Linux x64 | bundled CEF (Chromium 147) | yes | **≈ 160 MB** |
| Linux x64 Lite | WebKitGTK (system) | dedicated servers only (no P2P) | **≈ 33 MB** |

(Each CI artifact zip holds the installer and the updater archive, so it is about twice these.)

Linux bundles Chromium because distro WebKitGTK builds ship without WebRTC. We checked this:
Ubuntu 24.04's WebKitGTK 2.52 has no `RTCPeerConnection`, even with `enable-webrtc` set. The Lite
build is the small option. Its menus detect the missing WebRTC and disable Host/Join, but **Join Server**
(a dedicated server over WebSocket, see docs/HOSTING.md) still works.

Most of each download is the bundled Bun runtime and ICU data (~30 MB). The game itself is
about 1 MB.

Runtime requirements on Linux: `libwebkit2gtk-4.1-0` (Lite) and `libayatana-appindicator3-1`
(both builds). These ship with most desktop distros.

## Verified here

- Linux Lite and Linux CEF builds install with `./installer` (inside `*-Setup.tar.gz`), launch under
  Xvfb and render the title screen.
- The CEF build exposes `RTCPeerConnection`, so online co-op works. With no GPU it falls back to
  WebGL on SwiftShader (the flags are set in `electrobun.config.ts`).
- If WebGL is unavailable anywhere (blocklisted GPU), the game renders unlit on Pixi's Canvas renderer
  instead of going black.

All four targets build green in CI (`.github/workflows/desktop.yml`). The macOS and Windows apps
have not been launched here. Smoke-test them on real machines before release, in particular WebRTC in
WKWebView (online play).

## Signing (later)

- macOS: an Apple Developer ID ($99/yr). Set `build.mac.codesign`/`notarize` and the
  `ELECTROBUN_DEVELOPER_ID`, `ELECTROBUN_APPLEID`, `ELECTROBUN_APPLEIDPASS` and `ELECTROBUN_TEAMID`
  secrets. Until then, users right-click → Open the first time.
- Windows: Azure Trusted Signing (~$10/month), or ship unsigned (SmartScreen warning).

## Shrinking further (ideas)

- Linux: run WebRTC in the Bun process with `node-datachannel`'s RTCPeerConnection polyfill
  (trystero accepts `rtcPolyfill`) and bridge packets to the WebKitGTK page over Electrobun RPC.
  That would give online play at Lite size, with no CEF.
