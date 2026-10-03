# src/audio — procedural SFX + chiptune music

No audio files: SFX are [ZzFX](https://github.com/KilledByAPixel/ZzFX) parameter lists rendered to
`AudioBuffer`s; music is composed by a seeded generator and played by a small WebAudio chip synth.
Presentation only — nothing here is read by the sim, so `Math.random` (pitch variance) is fine.

| File | What |
|---|---|
| `audio.ts` | `AudioManager` — public API used by `src/game/game.ts` |
| `events.ts` | Pure `GameEvent` → cue mapping (`mapGameEvent`, `trackForLevel`) |
| `presets.ts` | SFX table (`SFX`), `SFX_ALIASES`, `SFX_PREFIXES`, loudness `normalizeSamples` |
| `spatial.ts` / `voices.ts` | Distance falloff + pan; per-id / global voice limiting with retrigger gap |
| `zzfx.ts` | Lazy `zzfx` loader (shims its module-level `new AudioContext`) |
| `music/moods.ts` | Track ids, biome aliases (`woods→forest`…), mood presets |
| `music/compose.ts` | Deterministic composer: (track, seed) → sorted note list |
| `music/synth.ts` / `music/sequencer.ts` | Pulse/triangle/noise voices; lookahead scheduler, crossfades, loops |

## API (`game.audio`)
- `unlock()` — call on any user gesture (already wired to `pointerdown`/`keydown`). Creates the
  `AudioContext` on first call; music requested earlier starts then.
- `setListener(x, y)` — local player centre (world px). `setLocalPlayer(i)` — optional; filters teammates'
  craft / level-up sounds (default: every player counts as local).
- `handleEvents(events)` — once per frame. `playMusic(id)` / `stopMusic()` — track id, biome id or `''`.
- `setVolumes({ master, music, sfx })` (0..1), `getVolumes()`. `playSfx(id, x?, y?)` for UI sounds
  (`ui_click`, `ui_hover`, `ui_open`, `ui_close`, `ui_error`, `buy`, `sell`, `equip`).

## Adding a sound
Emit `{ type: 'sfx', id, x, y }` from the sim and add `id` to `SFX` (or alias it to an existing preset).
`tests/audio/presets.test.ts` scans `src/` and fails on ids without a preset. Runtime-built ids
(`skill_${id}`) fall back via `SFX_PREFIXES`.

Positioning: the sim's `x = y = 0` means "no position". `spatial: false` presets are UI sounds / global alerts
and never attenuate — except `personal` ones (one player's shop, equip, craft, menu feedback), which are
spatialised when the sim *does* give a position, so a far teammate's chimes stay quiet in co-op. Presets
marked `eventDriven` (craft, level-up) are played from their semantic event (which knows the player);
their positionless raw `sfx` events are ignored and positioned ones play spatially (the voice limiter's
retrigger gap merges them with the semantic cue).

## Music
Tracks: `forest swamp cave frost crystal volcano lair town boss invasion title victory gameover` (biome ids
alias onto them; unknown ids get a stable derived mood). `levelEnter` picks town / boss / biome music;
a boss `death` returns to the biome theme (when boss music was playing); `bossPhase` (roaming giant) → `boss`; sfx `wraith_spawn` →
`invasion`; `runOver` → `victory` / `gameover`.
