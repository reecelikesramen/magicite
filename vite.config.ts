import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode single` inlines every asset into one dist-single/index.html,
// which is what the desktop (Deno/Bun webview) shell embeds into its binary.
// `vite build --mode artifact` does the same but keeps pixi.js external (loaded from a CDN via an
// import map) — see scripts/build-artifact.ts.
export default defineConfig(({ mode }) => {
  const inline = mode === 'single' || mode === 'artifact';
  return {
  base: './',
  plugins: inline ? [viteSingleFile()] : [],
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'dist-single' : mode === 'artifact' ? 'dist-artifact' : 'dist',
    assetsInlineLimit: inline ? Number.MAX_SAFE_INTEGER : 4096,
    chunkSizeWarningLimit: 2048,
    rollupOptions: mode === 'artifact' ? { external: ['pixi.js'] } : {},
  },
  server: { host: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
  };
});
