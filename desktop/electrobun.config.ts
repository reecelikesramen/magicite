import type { ElectrobunConfig } from 'electrobun';

/**
 * Desktop shell: a native window around the single-file web build (../dist-single/index.html),
 * using the OS webview (WKWebView on macOS, WebView2 on Windows).
 *
 * Linux bundles CEF (Chromium) because distro WebKitGTK builds ship without WebRTC (verified:
 * Ubuntu 24.04 WebKitGTK 2.52 has no RTCPeerConnection), which online co-op needs.
 * `SHARDFALL_LITE=1` builds against the system WebKitGTK instead: a much smaller download with
 * solo play only (the menus disable Host/Join when WebRTC is missing).
 */
const lite = process.env.SHARDFALL_LITE === '1';

export default {
  app: {
    name: lite ? 'Shardfall Lite' : 'Shardfall',
    identifier: 'dev.shardfall.game',
    // CI stamps the release version (APP_VERSION) so the updater sees each build as new.
    version: process.env.APP_VERSION || '0.2.0',
    description: 'Roguelike crafting platformer with online co-op',
  },
  build: {
    bun: { entrypoint: 'src/bun/index.ts' },
    // English-only ICU data (Linux/Windows): the game's text is English.
    locales: ['en'],
    copy: {
      '../dist-single/index.html': 'views/game/index.html',
    },
    mac: { bundleCEF: false, icons: 'assets/icon.iconset' },
    win: { bundleCEF: false, icon: 'assets/icon.ico' },
    linux: lite
      ? { bundleCEF: false, icon: 'assets/icon.png' }
      : {
          bundleCEF: true,
          defaultRenderer: 'cef',
          icon: 'assets/icon.png',
          // Machines without a usable GPU still get WebGL (SwiftShader) instead of an unlit canvas.
          chromiumFlags: { 'ignore-gpu-blocklist': true, 'enable-unsafe-swiftshader': true },
        },
  },
  release: {
    // Where release artifacts live, for the built-in updater and delta patches. CI sets it to the
    // repo's GitHub Releases ("…/releases/latest/download"); empty = no updates.
    baseUrl: process.env.RELEASE_BASE_URL ?? '',
  },
} satisfies ElectrobunConfig;
