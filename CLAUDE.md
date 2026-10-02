# Shardfall (working title) — a from-scratch recreation/extension of *Magicite* (2014)

2D pixel-art roguelike platformer with two-item crafting, permadeath and online co-op (up to 4).
TypeScript + PixiJS v8 in the browser; later shipped as a tiny desktop binary via the OS webview
(Bun/Deno). Read `docs/architecture.md` before changing anything structural.

## Commands
- `bun install` — install deps (bun is the package manager; npm works too)
- `bun run dev` — Vite dev server (http://localhost:5173, `?seed=123` for a fixed run)
- `bun run typecheck` — `tsc --noEmit` (TypeScript 7 native compiler)
- `bun run test` — Vitest (headless sim tests, no browser)
- `bun run check` — typecheck + tests (run before every commit)
- `bun run build` / `bun run build:single` — web build / single-file HTML for the desktop shell
- `bun scripts/screenshot.ts <url> <outDir>` — headless Chromium screenshots (run `bunx vite preview --port 4173` first). Chromium: `CHROMIUM_PATH` or `/opt/pw-browsers/chromium`.

## Hard rules
1. **`src/sim/**` is pure and deterministic.** No DOM, no Pixi, no `Math.random`, no `Date`/`performance.now`,
   no iteration over `Map`/`Set` whose insertion order depends on non-deterministic input, no async.
   All randomness comes from `world.rng` (or an `Rng` forked from a seed). The sim must run in Bun/Deno
   servers and in tests unchanged. Prefer the helpers in `src/engine/math.ts`.
2. **Sim state is plain data.** Entities/players are plain objects (no class instances, no closures) so
   they can be snapshotted, diffed and sent over the network. `TileGrid` typed arrays are the exception.
3. **UI never mutates the sim directly.** UI actions become `PlayerCommand`s on the next `PlayerInput`
   (deterministic, network-syncable). Presentation reacts to `GameEvent`s; the sim never reads events back.
4. **Units:** native pixels (1 tile = `TILE` = 8 px), y grows downward, velocities in px/s, timers in ticks
   (`TICK_RATE` = 60; use `secs()`), entity `x,y` = hitbox top-left; spawn specs use bottom-centre.
5. **Content is data** in `src/content/*.ts`, typed by `src/content/types.ts`, cross-checked by
   `validateContent()` (tested). Visuals are referenced by sprite-key strings; a missing key renders a placeholder.
6. **Names are original.** This is an original game inspired by Magicite — do not copy its proprietary
   names, text or art. Mechanics may match.
7. Keep files focused; match surrounding style (2-space indent, single quotes, semicolons, `type` imports).
8. Tests live in `tests/**/*.test.ts` (or next to code as `*.test.ts`). Every sim feature gets a test.
