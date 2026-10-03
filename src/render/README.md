# Render core (`src/render`)

Reads the sim, never writes it. Entry point: `Renderer` (`renderer.ts`), driven by `Game`
(`draw(world, alpha, focus)`, `handleEvents(events, world)`, `screenToWorld`, `scale`, `viewW/H`, `camX/Y`).

## Frame pipeline

Every world layer is rendered at **native resolution** (view ≈ 320×180 + 1 px margin) into its own
render texture, then `compositor.ts` combines them in one full-screen pass (GLSL, WebGL renderer):

| Layer | Contents | Sampling |
|---|---|---|
| terrain | parallax haze (`background.ts`), back wall + terrain chunks, water surfaces, mining cracks | nearest |
| entities | trees, portals, props/pickups, creatures, players + held items, swing arcs, lit particles | nearest |
| light | ambient (clear colour) + sky masks + additive radial lights, then × depth-attenuation masks | **linear** |
| emissive | lava / glowing crust / crystals, emissive sprites, glow particles, hurt-flash silhouettes | nearest |
| bloom | blurred emissive copy + additive halos | linear |

`colour = terrain·L → over(entities · max(L, floor)) → over(emissive) + bloom·k → flash`.
The lightmap stores **L/2** so lights over-expose up to 2× (warm light turns grass tips yellow).
The integer camera position renders the layers; the sub-pixel remainder offsets the output quad
by whole screen pixels (smooth scrolling, crisp pixels). Tunables: `LOOK` in `renderer.ts`
(`game.renderer.look` in the console).

## Contracts for other workstreams

- **Sprites**: `defineSprite(key, { w, h, anims, origin?, fps?, once?, meta?, draw })` or
  `defineSpriteFamily(name, key => def | null)` from `render/sprites`. Default origin = bottom-centre
  (placed on the entity's bottom-centre; projectiles on their centre). Draw facing **right**.
  `meta`: `emissive` (unlit), `glow` (halo colour), `rotate` (along velocity), `bob`, `variants`.
  Anim names follow `e.anim` with fallbacks (`run→move/walk`, `dash→run`, `swim→fall`, `crawl→downed`, …).
  Unknown keys get a labelled placeholder, except `effect` entities (skill areas / controllers), which
  stay invisible until someone defines their key. Held items: `held_<item sprite>` overrides the generic `held:<kind>:<mat>`.
  Players use `<race.sprite>#<playerIndex>` unless real art (an explicit def or a family above
  `BUILTIN_PRIORITY`) resolves `<race.sprite>` itself.
- **Particles**: emit `{ type: 'particles', preset, x, y, count?, color?, dirX?, dirY? }`.
  Presets in `particles/presets.ts` (+ aliases for every name the other workstreams emit; unknown names →
  generic burst). Biome ambient particles from `BiomeDef.ambientParticles`: `fireflies embers snow spores
  spores_pink sparkles dust bubbles` (+ aliases such as `crystal_motes`, `blight_motes`; unknown → the family's kind).
- **Lights**: `e.light` (radius px, colour, intensity, flicker), `level.lights`, `ProjectileDef.light`,
  lava surfaces and glowing fringe/special tiles (merged runs from the chunk scan).
- **Events used**: `particles damage heal death shake hitstop tileBroken resourceHit levelUp downed
  revived pickup craft`.
- **Mining cracks**: `grid.dmg` counts mining progress in the same units as `TileProps.mineTime`.
