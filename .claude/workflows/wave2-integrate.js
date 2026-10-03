export const meta = {
  name: 'wave2-integrate',
  description: 'Integration fixes (netcode/prediction, GDD run-flow reconciliation, gameplay glue) + Wave 2 (enemies/AI, bosses, app flow & online lobby, procedural sprites) in worktrees: implement -> adversarial review/fix',
  phases: [
    { title: 'Implement', detail: 'one agent per workstream in its own git worktree/branch' },
    { title: 'Review', detail: 'adversarial reviewer fixes bugs in the same worktree' },
  ],
}

// Screenshots go to the gitignored screenshots/ folder of each worktree.
const SHOTS = 'screenshots'
// args: { group: 'int' | 'content' | 'art', base: '<commit sha the worktrees start from>' }
const BASE = args.base

const COMMON = `
You are a senior engineer on "Shardfall" (working title), an ORIGINAL TypeScript recreation/extension of the 2014 game Magicite: a 2D pixel-art roguelike platformer with two-item crafting, permadeath and ONLINE CO-OP (high-performance multiplayer is a core requirement).
Stack: Bun, Vite 8, TypeScript 7, Vitest 5, PixiJS 8.22, trystero (P2P), zzfx-style audio.

STATE OF THE CODE: Phase-1 workstreams are MERGED at ${BASE}: deterministic sim (player movement/dash/meters/downed, combat/item use/projectiles/statuses/mining, 7-biome level gen + towns + boss arenas, 227 items + 190 recipes + shops/loot, progression/skills/companions/wraith/meta), netcode (src/net: HostSession/ClientSession, trystero + WebSocket transports, dedicated server), render core (lighting compositor, procedural tiles, sprite registry, particles), UI (HUD/inventory/crafting/skill panel), audio. ~1250 tests. Known: 5 net prediction tests fail (the netfix workstream fixes them).

SETUP (first):
- You are in an isolated git worktree of /home/user/magicite at commit ${BASE}. Run \`bun install\`.
- Branch: if \`git branch --list ws2/WSKEY\` is EMPTY: \`git checkout -b ws2/WSKEY\`. If it ALREADY EXISTS you are RESUMING interrupted work: \`git worktree list\` — if ws2/WSKEY is checked out in another worktree, cd there and work there for the rest of the task (report THAT path); else \`git checkout ws2/WSKEY\`. Read \`git log --stat ${BASE}..ws2/WSKEY\` + uncommitted changes and CONTINUE; don't redo finished work.
- READ: CLAUDE.md (hard rules), docs/design/gdd.md (§2b "Decisions" are BINDING and supersede older text), docs/architecture.md, docs/research/screenshot-analysis.md + docs/research/art-direction.md (visuals), docs/research/magicite-reference.md (original mechanics, for reference only — never copy names), the READMEs in src/render and src/sim/progression and server/, and the code you build on.

!!! CRASH SAFETY: the machine restarts without warning; uncommitted work is LOST. Commit EARLY and OFTEN (at least every ~15 minutes and at every working milestone; WIP commits fine).

PARALLEL WORKSTREAMS (code against contracts; do not implement their parts): netfix (src/net), flow (run flow/GDD reconciliation: src/sim/run.ts, src/sim/progression, stats/stamina, co-op/madcap scaling), glue (cross-module dedupe: consume/status/loot/interact/legacy items), enemies (src/sim/ai except bosses, src/content/enemies.ts), bosses (src/sim/ai/bosses, src/content/bosses.ts), app (title/menus/character creation/online lobby: src/game, src/main.ts, src/ui/menus), sprites_creatures and sprites_world (src/render/sprites/library/**).
SPRITE KEY CONVENTIONS (everyone): enemies 'enemy_<id>', bosses 'boss_<id>', NPCs 'npc_<id>' (as in content), races 'player_<raceId>', hats 'hat_<id>', companions 'companion_<id>', items use ItemDef.sprite, resources ResourceDef.sprite, decor props use their def id (e.g. 'decor_lantern'), projectiles ProjectileDef.sprite. Read src/render/README.md for the registry API (defineSprite / defineSpriteFamily, meta flags emissive/glow/rotate, origin bottom-centre, art faces right).

RULES:
- Only create/modify files in your OWNED paths. Shared contract files (src/sim/types.ts, src/sim/world.ts, src/content/types.ts, src/content/index.ts, src/sim/systems.ts, src/sim/constants.ts, src/sim/spawn.ts, src/engine/input.ts) may get MINIMAL, ADDITIVE edits only when unavoidable — list each in your report. Never reorder systems.ts.
- src/sim stays pure & deterministic (no Math.random/Date/DOM). No per-tick allocations in hot loops. ORIGINAL names only.
- Keep validateContent() passing. Before finishing: \`bun run typecheck\` and \`bun run test\` pass (except the 5 known net failures if you are not netfix — do not break any other test). Add tests under tests/WSKEY/.
- Visual work: \`bunx vite build\`, \`bunx vite preview --port PORT &\`, \`bun scripts/screenshot.ts http://localhost:PORT/?seed=42 ${SHOTS}/WSKEY/\` (or your own playwright script; window.game exposes the Game, game.session.world the World) and LOOK at the PNGs with Read; iterate. Kill your server when done (kill by PID, never pkill -f with a pattern that matches your own shell).
- Commit messages end with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GuoS8h2imwbyNTe9aF2qh9
  Do NOT push or merge.
- Return the structured report.
`

const WS = {
  netfix: { port: 4501, owned: 'src/net/**, tests/net/**, server/**, docs/architecture.md (Multiplayer section only)', spec: `
WORKSTREAM: NETCODE INTEGRATION FIXES after merging player/combat/items/progression.
1. Make the 5 failing tests in tests/net pass by fixing the CODE, not weakening tests: client prediction (src/net/predict.ts predictStep) must use the player workstream's per-player step (src/sim/player/predict.ts predictPlayer — includes stamina regen, dash, statuses) plus the swing countdown; exclude host-only bookkeeping in p.ctl (e.g. safeX/safeY, hungerT, mining progress, meter timers) from the exact-state comparison / reconcile trigger, or sync them, whichever is correct; add new PlayerState/ctl fields used by controlPlayer (dash cooldowns etc.) to PREDICTED_PLAYER_KEYS.
2. Send the OWNER's exact status effects (id, ticks, power) in private/prediction state so slow/haste don't cause reconciles.
3. Sync Entity.shop (stock lines + counts) for NPC shop entities (structured component support in the snapshot schema or a reliable per-entity message) so clients see stock and sold-out lines; buy command indices must match.
4. Fix the input re-time bug: a hard backward re-time after a host stall makes the host replay ~1 s of stale inputs — add an input timeline generation (or equivalent) so stale duplicates are discarded.
5. Predict own attack start (swing animation + sfx) on the client (hits stay host-confirmed), per docs/architecture.md.
6. Positionless sfx: events at x=0,y=0 are UI sounds; add/keep a player field so only the owning client plays personal sounds (coordinate via GameEvent shape: minimal additive edit to src/sim/types.ts if needed).
7. Remote joiners' difficulty: run.difficulty is the host's; ignore client setups' difficulty explicitly and document.
8. Update the Multiplayer section of docs/architecture.md to match reality (trystero/Nostr signaling by default, optional WebSocket relay/dedicated server; Cloudflare relay = planned).
Keep bandwidth/CPU budgets (tests log them). Add regression tests for each fix.` },

  flow: { port: 4502, owned: 'src/sim/run.ts, src/sim/progression/**, src/content/{races,traits,hats,companions,skills,unlocks}.ts, src/game/meta.ts, src/sim/items/stats.ts (stamina/derived stats only), src/sim/player/meters.ts (stamina regen rule only), tests/flow/**, tests/progression/**', spec: `
WORKSTREAM: RUN FLOW + GDD §2b RECONCILIATION (binding decisions in docs/design/gdd.md §2b).
1. Level numbering: levels 1–21; odd = combat districts (1,3,…,19 = "District 1…10"), even = towns themed to the chosen biome, 21 = Blight Lair. Today the run shows "District 1" twice (town after D1 keeps district 1 and the next combat level is labelled District 1 again) — fix everywhere (LevelInfo.district semantics, LevelInfo.name, level-gen request, UI banner via the event's district/name, audio track selection, wraith rules, net LevelRequest). Coordinate with src/sim/gen (read it; it already follows §2b per its README — make run.ts consistent, minimal edits in gen only if unavoidable, report them).
2. Next-biome options: currently the 3 portal biomes repeat identically level after level; derive them per level from the run RNG (deterministic), 3 distinct when possible, from biomes allowed at the next combat depth.
3. Giant monsters: guaranteed boss arena on the 3rd, 6th, 9th combat district (levels 5, 11, 17) with that biome's boss (biome.boss); other combat districts 15% chance of a ROAMING giant monster (spawn the biome boss without arena lock, at a gen-provided spot or a reachable ground spot far from spawn; if bosses content is missing at runtime, skip gracefully). Lair at 21: blightwall; victory on its death.
4. Character creation (src/sim/progression/creation.ts): stats start at 3 (HP 3+2=5), choose two GOOD stats (+1) and one BAD (−1) — export helpers for the UI (rollGoodBad(rng), applyCreation(goodBad)); LCK starts at 3. Level-ups: deterministic cadence — good stats +1 every 2 levels, neutral every 3, bad every 4 — plus full meter refill. XP to next = L² + 3L + 4 (tunable function).
5. Stamina (GDD §2b.4): max = 4 until Lv4, then = level, cap 12 (+mods); regen 1/s. DEX: +1% move speed per point above 3 (expose for the controller; edit src/sim/player/controller only if strictly needed, minimal).
6. Co-op scaling: enemies & bosses +50% HP and +40% damage per extra player; Madcap multipliers on top. Apply HP at spawn (a scaling hook in src/sim/spawn.ts — minimal edit) and damage where enemy damage is computed (combat contact/projectile default damage — minimal edits in src/sim/combat, report them). Mid-level spawns (minions, roaming monsters) must also scale — provide \`scaleSpawnedEnemy(world, e)\`.
7. Boarfolk softlock: Boarfolk starts with no axe — make it viable (e.g. bare-hands tree punching at reduced yield for players with no axe, or a starting crude axe alternative) and add a test that EVERY race can reach its first pickaxe from its start kit + level-1 resources (simulate the item graph with tool requirements).
8. Update docs/design/gdd.md §3 text to match the implemented flow (owned for this purpose).
Tests: numbering sequence for a full run (1..21), options vary per level, boss levels 5/11/17, roaming chance deterministic, creation & cadence, XP curve values (8 @1, 92 @8), stamina rule, co-op/madcap multipliers, softlock test.` },

  glue: { port: 4503, owned: 'src/sim/combat/**, src/sim/items/**, src/sim/player/** (except meters.ts stamina rule), src/sim/spawn.ts, src/content/items.ts, src/content/projectiles.ts, tests/glue/**', spec: `
WORKSTREAM: GAMEPLAY GLUE — remove duplicated logic between merged workstreams and wire unconnected pieces.
1. One consume path: route combat's held-item consume (src/sim/combat/consume.ts, consumeFromSlot) through items' applyConsume (src/sim/items/consume.ts) so mystery potions, reveal_recipe, repair, full-meter refusal and race/hat food specials work everywhere; delete the duplicate.
2. One status path: player hazards (addBurn in src/sim/player/hazards.ts or wherever) and progression's util.addStatus must call combat's addStatus/applyStatus (immunities like burn_immune, boss stun/freeze reduction, particles). statusMoveMul in the controller must use combat's speedMul/isDisabled (single source of truth).
3. Vitals: replace src/sim/combat/vitals.ts stubs with the real helpers from src/sim/player/meters.ts (heal/feed/restoreMana/restoreStamina).
4. Skills: progression's spawnSkillProjectile must use combat's fireProjectile (edit src/sim/progression minimally — report it; the flow workstream also edits progression, keep it tiny).
5. Loot: SpawnSpec.data (lootTier, door rect, hang, etc.) must survive spawnFromSpec onto the entity; breaking/opening chests and pots must call items' openChest/rollChestLoot (src/sim/items/loot.ts) from the resource-break path (combat harvest.ts). Chests open with interact too (not only by hitting).
6. Interact priority (one button 'F'): revive a downed ally (hold) > talk/shop NPC > open chest > portal. Implement a single resolver used by all systems.
7. Remove legacy scaffold items 'axe' and 'meat' (replace references with wooden_axe/raw_meat everywhere incl. tests and seed content).
8. Resources/props floating after the tile under them is mined/exploded: make ground resources/props drop (or break) when unsupported.
9. Ranged firing: record the firing weapon on ProjectileComp (additive shared edit) so onHit/element use the bow that fired.
10. Melee/explosions through walls: add a cheap line-of-sight check (tile raycast) so swings and explosions don't hit through solid tiles.
Tests for each item.` },

  enemies: { port: 4504, owned: 'src/sim/ai/** (except src/sim/ai/bosses/**), src/content/enemies.ts (keep blight_wraith), tests/enemies/**', spec: `
WORKSTREAM: ENEMIES & AI (GDD §8 enemy roster; behaviours from AiBehavior in src/content/types.ts).
- Content: every GDD enemy id with EnemyDef (sprite 'enemy_<id>', size, hp, damage, speed, sight, behaviour, projectile ids from src/content/projectiles.ts, onHit statuses, xp, gold, drops referencing EXISTING item ids — creature drops like hide, fang, bone, feather, slime_gel, venom_sac, beetle_shell, bat_wing, wisp_essence, magma_scale exist in the catalogue; check), biomes, weight, minDepth, light for glowing ones. Roster: woods: green_slime toad boar forest_beetle thorn_wasp · fen: hex_totem glimmer_bat wisp_lynx bog_slime · hollow: cave_bat bone_miner rock_crawler cave_spider · rime: frostling ice_wolf snow_owl ice_slime · amethyst: shard_beetle void_imp crystal_spider gem_golem · cinder: magma_slime flame_boar ember_imp salamander · lair: blight_head blight_spawn · towns: chicken (critter, harmless, drops raw_meat/feather/egg). Balance: small integer damage early (1), scaling with tier; enemies never faster than a dashing player; flying enemies have clear swoop windows (fix of an original complaint).
- AI (src/sim/ai/): implement all behaviours: walker (patrol, turn at edges/walls, aggro chase), hopper, flyer (sinusoidal drift + telegraphed swoop), shooter (keep distance, line-of-sight, fire via combat's fireProjectile with telegraph), charger (wind-up telegraph → dash, stun on wall hit), dropper (ceiling cling → drop), turret, burrower, critter (flee, catchable with bug_net). Respect combat's isDisabled/speedMul (freeze/stun/slow), knockback, hurt stagger. Telegraphs emit particles/sfx events. AI must be deterministic (world.rng), cheap (spatial queries: add a simple spatial hash in src/sim/ai/spatial.ts if needed), and work with multiple players (target nearest active player, retarget).
- Spawning: gen already emits enemy SpawnSpecs from Content.enemies (filtered by biome/minDepth/weight) — verify enemies now appear in every biome. Add a light respawn/ambush director only if cheap (optional).
- Tests: each behaviour's core state machine, determinism, no enemy leaves the level bounds, every biome has ≥3 enemies spawning at its depths, drops valid.` },

  bosses: { port: 4505, owned: 'src/sim/ai/bosses/**, src/content/bosses.ts, tests/bosses/**', spec: `
WORKSTREAM: GIANT MONSTERS (GDD §8 bosses; Monster Hunter-style multi-phase fights; every attack telegraphed and dodgeable with dash/double jump).
- Content: BossDefs for gloomjaw (woods: acid-maw crocodile — lunge, charge, acid spit puddles), bogmother (fen: giant toad — tongue grab, belly-flop shockwave, tadpole swarm), broodqueen (hollow: spider queen — web shots that slow, ceiling drop, spiderlings), frost_matron (rime: phases through walls, orbiting ice shards, blizzard), shardbound_knight (amethyst: sword combos, shard rain, mirror clone), emberwyrm (cinder: dragon — 3-stream fireball volleys like the original screenshot, swoop, flame breath), blightwall (lair: advancing wall 12 px/s, 10-ball volleys, blight heads; 4500 HP base). Sprite keys 'boss_<id>'. Size 3–5× the player (e.g. 40x24 for gloomjaw). Drops: a trophy item per boss (exists: gloomjaw_fang, bogmother_heart, broodqueen_eye, frost_heart, shardbound_core, wyrm_heart — verify ids in src/content/items.ts) + gold + materials. Phases per BossDef.phases.
- AI (src/sim/ai/bosses/): pattern state machines per boss, dispatched from the main AI system for behavior 'boss' (add a minimal hook in src/sim/ai/index.ts if the enemies workstream hasn't — coordinate by exporting \`bossSystem\`/\`updateBoss(world, e)\` and document; the lead resolves the merge). Use combat's fireProjectile/applyStatus/applyDamage. Minions spawned via world.spawnAt with enemy defs (use existing/placeholder enemy ids; the flow workstream provides scaleSpawnedEnemy for co-op scaling — call it if present, else document). Emit 'bossPhase' events, telegraph particles, shake, sfx ids (add any new sfx id to src/audio presets? NO — audio is not yours; reuse existing sfx ids like boss_roar, explosion, fireball, magic_cast, swing, splash; list new ones needed in your report).
- Arena: on boss death set world.level.locked = false (portals open) and emit a message; blightwall death → the flow workstream handles victory (it watches 'death' events of kind 'boss' def 'blightwall').
- Multiplayer: target selection across players, no single-target lockups, scales via flow's hook.
- Tests: each boss's phases trigger at thresholds, every attack has a telegraph ≥ 0.4 s, arena unlocks on death, determinism, a scripted bot can survive/dodge at least the first pattern (sanity), performance.` },

  app: { port: 4506, owned: 'src/game/**, src/main.ts, src/ui/menus/** (new), index.html, scripts/build-artifact.ts, tests/app/**', spec: `
WORKSTREAM: APP FLOW — title, menus, character creation, ONLINE LOBBY, pause/settings, run summary.
- Title screen: short intro (5 caption cards over procedural pixel vignettes per GDD §2 — original text), logo "SHARDFALL" in gold pixel letters with sparkles; skippable. Main menu: Play Solo, Host Online, Join Online, Settings, (Daily Run).
- Character creation (pixel UI, keyboard/mouse/gamepad): name (random via progression creation helpers; editable ≤10 chars), race (unlocked ones from meta), companion, two traits (cycle), stats (choose two good + one bad per GDD §2b.3 — use the flow workstream's helpers in src/sim/progression/creation.ts if present; otherwise implement UI-side choice and pass PlayerSetup.stats), hat (if unlocked), difficulty. Show the resulting stat card.
- Online: Host → create room code (src/net: makeRoomCode / joinTrysteroRoom), lobby showing connected players (names/races), Start; Join → enter code → lobby → game starts when host starts. Use HostSession/ClientSession (see server/README.md for exact wiring). Show connection state, ping, and errors clearly ("Room not found", "Game full", "Disconnected — return to menu"). Allow a self-hosted relay URL in Settings (advanced). Note: WebRTC is unavailable inside the claude.ai artifact sandbox — menus must handle that gracefully (detect RTCPeerConnection absence; show "Online play needs the desktop or web build").
- Pause menu (Esc): resume, settings, abandon run. Settings: master/music/sfx volume (AudioManager.setVolumes), pixel scale preference, show FPS/net stats toggle, keybind list (read-only is fine). Persist settings with localStorage (try/catch).
- Run end: run summary (RunStats table, time, districts, cause), unlock rolls from src/game/meta.ts with fanfare, then back to menu. Wire Hud.onRestart to the menu flow.
- Keep Game thin: a small state machine (title → menu → creation → lobby → playing → summary). Respect input.uiFocus semantics.
- Keep scripts/build-artifact.ts working (the artifact build is how the owner plays previews).
- Tests: state-machine transitions, settings persistence (mock storage), creation produces valid PlayerSetup, lobby state logic with a loopback transport (no WebRTC).` },

  sprites_creatures: { port: 4507, owned: 'src/render/sprites/library/creatures/** (new), src/render/sprites/index.ts (registration call only), tests/sprites_creatures/**', spec: `
WORKSTREAM: PROCEDURAL PIXEL ART — CREATURES (code-drawn, no image files). Read docs/research/art-direction.md, screenshot-analysis.md and trailer-analysis.md: chibi 10x13-ish players with 1 px dark outline (#1e1a0c), limited palettes per sprite, readable silhouettes; enemies/bosses sized per content; glowing parts via meta.emissive/glow.
Generate (via defineSprite/defineSpriteFamily, animations idle/run/jump/fall/attack/hurt/downed as appropriate):
- Players: one per race in src/content/races.ts ('player_<raceId>' — e.g. Drifter brown hair, Cyclorc green one-eyed, Stoutling stocky, Wraithkin pale glowing eyes, Mosskin leafy, Boarfolk snout, Saurian lizard, Ifrit flame hair...), per-player tint variants as the registry supports; hats ('hat_<id>' overlays aligned to the head) for every HatDef; companions ('companion_<id>') floating 6–8 px creatures for every CompanionDef.
- NPCs: every NpcDef sprite (merchant, trader, smith, outfitter, fence, shrine keeper, chicken) with idle anims.
- Enemies: every GDD enemy id ('enemy_<id>') listed in docs/design/gdd.md §8 (the enemies workstream is writing their defs in parallel — use the GDD roster and sizes ≈ 6–16 px; slimes as rounded cubes like the screenshot; totems as wooden tiki masks with purple glyphs; beetles navy with red stripe; etc.).
- Bosses: 'boss_<id>' for the 7 GDD bosses, 3–5× player size, multi-frame (e.g. emberwyrm red dragon with yellow belly and bat wings per screenshot; gloomjaw brown croc with red crest, white spikes, acid-green drool; blightwall: a tall pulsing wall of pink/black crystal flesh).
- A gallery page/script (scripts/sprite-gallery.ts or a ?gallery URL param handled inside src/render) that renders every creature sprite + anims to a PNG sheet under ${SHOTS}/sprites_creatures/; LOOK at it and iterate until the art is cohesive and readable at 4× scale.
- Test: every race/hat/companion/npc/enemy(GDD)/boss(GDD) key resolves to a defined sprite (not placeholder).` },

  sprites_world: { port: 4508, owned: 'src/render/sprites/library/world/** (new), src/render/sprites/library/items/** (new), src/render/sprites/index.ts (registration call only), tests/sprites_world/**', spec: `
WORKSTREAM: PROCEDURAL PIXEL ART — ITEMS, RESOURCES, PROPS, PROJECTILES (code-drawn). Read docs/research/art-direction.md, screenshot-analysis.md, trailer-analysis.md.
Generate (defineSprite/defineSpriteFamily; use families/parameters to cover many ids with consistent style):
- Item icons for ALL items in src/content/items.ts (ItemDef.sprite, ~10–12 px icons with 1 px outline; material colours per tier: wood brown, stone grey, iron grey-blue, gold yellow, diamond cyan, voidshard pink/black; bows/wands/staves/tomes/armour/rings/potions/food/bugs/gems/bars/ore) — and held-in-hand variants where the renderer uses 'held_<sprite>' keys (see src/render/README.md / builtin/items.ts) for weapons & tools.
- Resources (ResourceDef.sprite in src/content/resources.ts): per-biome trees (tall twisted trunks with leaf puffs for woods; snowy pines for rime; magenta crystal trees for amethyst; violet stalks for fen; charred/ember trees for cinder; fungal for hollow), rock nodes per ore tier (grey with coloured flecks), plants, bug critters (animated), chests (wood/iron, open/closed), pots, crystal clusters, ember vents, vines.
- Decor props (every 'decor_*' id used by src/sim/gen — grep the generator for decor ids): lanterns (emissive), town stalls, gates, chimneys with smoke, altars, lamp posts, carts, rails, timbers, stalactites, bones, mushrooms, flowers, grass tufts, roots, icicles (icy blue, not purple), etc.
- Projectiles (ProjectileDef.sprite): arrows/bolts (rotate), fireball, ice shard, lightning, arcane orb, bomb, knives, slime ball, fire spit, magic orb, web shot — glowing ones with meta.glow.
- Portal frame variants if not already good (the render core has one; improve per biome only if cheap).
- A gallery script (scripts/sprite-gallery-world.ts) rendering every key to PNG sheets under ${SHOTS}/sprites_world/; LOOK and iterate.
- Test: every item/resource/projectile sprite key and every decor id emitted by gen resolves to a defined sprite (not placeholder).` },
}

const GROUPS = { int: ['netfix', 'flow', 'glue'], content: ['enemies', 'bosses', 'app'], art: ['sprites_creatures', 'sprites_world'] }
const keys = GROUPS[args.group]

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
    const port = String(w.port)
    const prompt = (COMMON + `\nOWNED PATHS: ${w.owned}\nPreview port for screenshots: ${port}\n` + w.spec).split('WSKEY').join(k).split('PORT').join(port)
    return agent(prompt, { label: `impl:${k}`, phase: 'Implement', isolation: 'worktree', schema: REPORT })
  },
  (rep, k) => {
    if (!rep) return null
    const w = WS[k]
    const port = w.port + 100
    return agent(`You are an ADVERSARIAL senior reviewer for the "${k}" workstream of an online-co-op TypeScript roguelike platformer (CLAUDE.md rules; binding design: docs/design/gdd.md §2b; architecture: docs/architecture.md).
Work in the implementer's worktree: cd ${rep.worktree} (branch ${rep.branch}; base ${BASE}). Run \`bun install\` if needed. CRASH SAFETY: commit each fix as soon as it passes.
Implementer report: ${JSON.stringify(rep)}
Original spec:
---
${w.spec}
---
Find and FIX real problems in \`git diff ${BASE}..HEAD\`: correctness bugs, edge cases, determinism violations in src/sim, hot-path allocations, broken contracts/APIs other modules rely on, GDD §2b deviations, edits outside owned paths (${w.owned}) that aren't minimal/additive, spec items silently skipped, weak/tautological tests, merge hazards with the parallel workstreams (netfix, flow, glue, enemies, bosses, app, sprites_creatures, sprites_world). Run \`bun run typecheck\` and \`bun run test\` (5 known net failures are acceptable unless this is netfix). For visual work also build + \`bunx vite preview --port ${port} &\` + screenshots into ${SHOTS}/review-${k}/ and look at them (kill the server by PID after).
Commit fixes on the same branch (messages end with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GuoS8h2imwbyNTe9aF2qh9). Do not push or merge. Return the structured review.`,
      { label: `review:${k}`, phase: 'Review', schema: REVIEW }).then((rv) => ({ key: k, report: rep, review: rv }))
  },
)
