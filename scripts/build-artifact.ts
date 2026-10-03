/**
 * Builds a self-contained preview page for publishing as a claude.ai Artifact:
 *   bun scripts/build-artifact.ts
 * Our game code is inlined; pixi.js is loaded from jsDelivr through an import map (CDN allowlist).
 * Outputs dist-artifact/shardfall.html (publish this) and dist-artifact/local-test.html, a full
 * document that maps pixi.js to a local copy for offline headless testing.
 */
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('node_modules/pixi.js/package.json', 'utf8')) as { version: string };
const cdnUrl = `https://cdn.jsdelivr.net/npm/pixi.js@${pkg.version}/dist/pixi.min.mjs`;

execSync('bunx vite build --mode artifact', { stdio: 'ignore' });
const built = readFileSync('dist-artifact/index.html', 'utf8');
const m = built.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/);
if (!m) throw new Error('no inlined module script found in dist-artifact/index.html');
const code = m[1]!.replace(/<\/script/gi, '<\\/script');

const pageFor = (pixiUrl: string) => `<title>Shardfall</title>
<style>
  /* Single dark look: the game is a near-black cave lit by lanterns. */
  :root { --ground: #050403; --ink: #f2e6c8; --muted: #a8977a; --ember: #ffb060; --panel: rgba(20, 15, 10, 0.86); color-scheme: dark; }
  html, body { height: 100%; }
  body { margin: 0; background: var(--ground); color: var(--ink); overflow: hidden; font: 13px/1.4 ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; }
  #app, #app canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; image-rendering: pixelated; cursor: crosshair; }
  #help { position: fixed; left: 16px; right: 16px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: center;
    padding: 8px 12px; background: var(--panel); border: 1px solid #3a2c1c; color: var(--muted); max-width: 760px; margin: 0 auto; pointer-events: none; transition: opacity 0.6s; }
  #help b { color: var(--ember); font-weight: 600; }
  #help.faded { opacity: 0; }
  @media (prefers-reduced-motion: reduce) { #help { transition: none; } }
</style>
<script type="importmap">${JSON.stringify({ imports: { 'pixi.js': pixiUrl } })}</script>
<div id="app"></div>
<div id="help" role="note"><span><b>Click</b> the game to focus · controls are in the menu</span></div>
<script>
  (() => {
    const help = document.getElementById('help');
    addEventListener('keydown', () => help.classList.add('faded'), { once: true });
    addEventListener('pointerdown', () => { try { window.focus(); } catch {} });
  })();
</script>
<script type="module">${code}</script>
`;
const page = pageFor(cdnUrl);
writeFileSync('dist-artifact/shardfall.html', page);
// The Artifact host wraps the page in a doctype/head/body skeleton; mimic it for local testing.
const head = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>';
writeFileSync('dist-artifact/local-test.html', `${head}${pageFor('./pixi.min.mjs')}</body></html>`);
copyFileSync('node_modules/pixi.js/dist/pixi.min.mjs', 'dist-artifact/pixi.min.mjs');
console.log(`dist-artifact/shardfall.html: ${(page.length / 1024).toFixed(0)} KB (pixi.js from ${cdnUrl})`);
