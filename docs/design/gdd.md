# Shardfall — Game Design Document (working title)

An original recreation, extension and bug-fix of *Magicite* (2014). Mechanics follow the original
(see `docs/research/*`); **all names, text and art are our own.** IDs in `code` are canonical —
content, generators and tests must use them exactly.

## 1. Pillars
1. **Gather → craft → hunt giant monsters** (Monster Hunter loop): chop, mine, harvest, catch bugs, hunt beasts; combine any two items to craft; fight a giant monster every few districts.
2. **Brutal, precise platforming** (Spelunky): tiny HP pools, double jump + dashes on a stamina budget, readable telegraphs, every attack dodgeable.
3. **Discovery crafting**: *any* two items may combine (`wood + wood = plank`). Recipes are discovered and remembered per run; hints exist.
4. **Permadeath with meta side-grades**: the run logs stats; milestones roll unlocks (races, hats, companions, traits). No permanent power creep.
5. **Online co-op for 1–4, done right**: the original was plagued by lag/desync. Ours is host-authoritative with prediction (docs/architecture.md).
6. **The dark**: near-black caves lit by your lantern-glow, glowing lava, crystals and fireflies.

## 2. Premise
Long ago the surface was green and peaceful. Then **the Blight** — a living, crystalline rot — swallowed the
overworld. The survivors fled underground into **the Undervault**, a stack of districts carved through
ancient caverns. Legends say the **Heartshard**, the crystal that seeded the Blight, lies at the bottom.
You are a delver: descend 20 districts, break into the **Blight Lair**, and destroy the **Blightwall**.

Intro: 5 caption cards over procedural pixel vignettes (village in sun → purple sky rays → ruined village →
people underground by torchlight → title "SHARDFALL" with sparkles).

## 2b. Decisions after code-verified research (supersede conflicting text below)
Source: `docs/research/magicite-reference.md` §18. These are binding for implementation.
1. **Run length (original pacing, ≈1 h)**: levels 1–21. **Odd = combat districts** (1, 3, …, 19 → 10 combat
   districts), **even = towns** (2, 4, …, 20, themed to the biome chosen at the previous portal), **21 = Blight
   Lair**. "District N" in the UI counts combat districts only (District 1–10, then *The Blight Lair*).
2. **Giant monsters**: guaranteed boss arena on the **3rd, 6th and 9th combat district** (levels 5, 11, 17) using that
   district's biome boss; every other combat district has a **15%** chance of a roaming giant monster (no arena, no
   lock). Final boss Blightwall at level 21 (4500 HP + 700 per extra player).
3. **Character creation**: every stat starts at **3** (HP, ATK, DEX, MAG; HP gets +2 → 5); the player (or *Reroll*)
   picks **two "good" stats (+1)** and **one "bad" stat (−1)**. **LCK** (our extension) starts at 3 and only moves via
   traits/gear/races. **Level-ups**: good stats +1 every 2 levels, neutral every 3, bad every 4 (deterministic
   cadence), plus full meter refill. **XP to next level = L² + 3L + 4** (8 at Lv1, 92 at Lv8 — matches the owner's
   screenshots); keep it a tunable function.
4. **Stamina** (original rule): max = 4 until Lv4, then = level, cap 12 (+ mods); regen **1 per second**. DEX gives
   +1% move speed per point above 3 and scales bows.
5. **Crafting quantities**: *material* recipes consume **min(A, B)** from both stacks and produce `min(A,B) × count`
   (batch crafting); gear/tool/consumable recipes craft one at a time. Combining a stack with itself pairs it with
   itself: produces `floor(n/2) × count`.
6. **Co-op scaling**: enemies & bosses get **+50% HP and +40% damage per extra player**.
7. Our deliberate deviations stay: 1-of-3 skill choice (one per path), harsher hunger, hold-to-revive with
   bleed-out, portal countdown + vote, distinct door biomes, Wraith warnings, knockback, acceleration + jump-cut.
8. Naming: biome ids are `woods fen hollow rime amethyst cinder lair` — never original-game names.

## 3. Run structure
- **Character creation**: name (random generator, ≤10 chars, editable), **race**, **companion**, **2 traits**
  (cycle with ◀ ▶), **stats** (15 points randomly spread over HP/ATK/DEX/MAG/LCK; HP 4–6, others 2–4; *Reroll*),
  **hat** (if unlocked), **difficulty** (Normal / *Madcap*). Co-op: each player creates their own hero in the lobby.
- **District 1** is always `woods`. Each district is a procedurally generated cave level, broadly **left → right**
  with vertical variety, ≈ 3–5 minutes to cross. Start on the far left; **3 portals** at the far right, each
  colour-coded to the biome it leads to (choices drawn from biomes allowed at the next depth; no duplicates).
- **Entering a portal** → a **Town** themed to the chosen biome (safe: no Blight timer, no hostile spawns, slow
  hunger) → walk out the town's right gate → **the district**.
- **Giant monster districts**: districts **3, 6, 9, 12, 15, 18** end in a boss arena; the portals open only after
  the biome's boss dies (2–3 phases, arena walls lock during the fight).
- **District 21: Blight Lair** (`lair`) — no town before it, no exit: kill the **Blightwall** to win.
- **The Blight Wraith** (`blight_wraith`): if you linger, an unkillable flying hunter phases through walls
  toward the party. Warnings at 3:30 ("A chill creeps into the air…") and 4:30; spawns at **5:00** (10:00 in D1).
  Never in towns or boss arenas. (Madcap: spawns at 2:00, and arenas too.)
- **Co-op transitions**: a player stepping into a portal starts a 5 s countdown shown to everyone; at zero the
  whole party moves (majority vote if players stand in different portals; ties → first entered).
- **Death**: a player at 0 HP is **downed** (crawls, can be revived by a teammate holding *interact* 2 s → 50% HP).
  Downed 30 s → out for the district (returns at 1 HP next district). Run ends when the whole party is down/out.
  Solo: death ends the run.
- **End of run**: run summary (all `RunStats`), then unlock rolls with fanfare.

## 4. Controls (rebindable)
| Action | Keyboard/Mouse | Gamepad |
|---|---|---|
| Move / climb | A D (W S) | Left stick / D-pad |
| Jump / double jump (variable height) | Space | A |
| Dash left / right (stamina) | Q / E | LB / RB |
| Use held item (attack, mine, chop, shoot, cast, eat) | Left mouse / J | X / RT |
| Secondary (aim-place, block, alt fire) | Right mouse / K | LT |
| Interact (portal, talk, revive, open) | F | Y |
| Skills | Z / X / C | D-pad ← ↑ → |
| Hotbar | 1–5, wheel | LB+RB cycle |
| Inventory / crafting | Tab / I | Back |
| Craft pick | Shift + Click two items | X in inventory |
| Pause | Esc | Start |

## 5. Player stats & meters
- **HP** (small integers, 4–6 at start), **ATK** (melee damage), **DEX** (bow damage, +max stamina every 2 DEX),
  **MAG** (spell damage, max mana = 2 + MAG), **LCK** (crit chance, crafted-gear quality rolls, drop luck),
  **DEF** from armour only (flat reduction; min 1 damage).
- **Meters** (HUD, top-right): HP ♥ red, Mana ◆ blue, Hunger 🍗 brown (max 8; −1 every 50 s in districts, every
  150 s in towns; at 0: −1 HP every 15 s), Stamina 👢 yellow (max 2 + ⌊DEX/2⌋ charges; regen 1 per 1.2 s; double
  jump & dash cost 1).
- **Level-ups**: XP from kills (shared by the party). XP to next = 8 at Lv1 (≈92 at Lv8). Each level: **+1 to a
  random stat** (HP/ATK/DEX/MAG/LCK) *and* full meter refill. At **Lv 5, 10, 15, 20, 25**: "Select Skill Path" —
  choose 1 of 3 skills (one from each path: red Warrior / blue Mage / green Ranger). Max **3 active skills**
  (Z/X/C); further picks offer upgrades (rank 2/3) of owned skills. Skill cooldowns reset each district.

## 6. Combat
- **Melee** (swing/thrust): attack box in front, aimed toward the cursor in 8 directions (down-swing in air =
  pogo bounce). Light weapons fast; great weapons slow with wider boxes and ≈2× damage. Damage = weapon + ATK.
- **Ranged** (bows/crossbows/slings): consume ammo (equipped ammo slot first); damage = weapon + ammo + DEX.
  Arrows stick in walls and can be recovered (50%).
- **Magic** (wands/staves/tomes): cost mana; damage = spell + MAG. Spells: fireball (burn), ice shard (slow),
  lightning (from above, multi-hit), arcane orb (homing), etc.
- **Thrown**: bombs (break tiles), throwing knives, potions (splash). Arc under gravity.
- **Defence**: dash i-frames (6 ticks), knockback, 0.9 s post-hit i-frames for players; shields (secondary) block
  frontal hits at stamina cost (extension; fixes "melee is a death sentence").
- **Durability** on weapons/tools/armour; repair at a town smith for gold (extension). Items break with a pop.
- **Status effects**: burn, poison, bleed (DoT), freeze/stun (disable), slow, haste, regen, shield, weak.
- Fixes vs original: melee viability (pogo, shields, hit-stop, better reach), flying enemies have clear
  swoop windows, enemies never outrun a dashing player.

## 7. Crafting & items
- **Two-item crafting anywhere**: Shift+Click item A then item B in the inventory. Unordered pairs. A stack
  combined with itself needs ≥2. Unknown pair → "Nothing happens…". New recipe → "Discovered: X!" and it's
  added to the run's recipe book (lightbulb button). **Hints**: shops sell *Recipe Scrolls*; NPC tips.
- **Stations** (extension): some recipes need a placed **Campfire** (cooking) or being in a **town** (armour /
  smelting at the forge). The recipe def carries `station?: 'campfire' | 'forge'`.
- **Quality** (via LCK) for crafted weapons/armour: common (white) → fine (blue) → superb (yellow) → mythic
  (purple), each adding stat bonus. *(Phase 2.)*
- **Tiers** (item.tier) track depth: T1 wood/stone (D1–4), T2 iron (D3–8), T3 gold (D7–13), T4 diamond (D12–18),
  T5 voidshard/biome-legendary (D17+).

### Canonical material & key item IDs (others may be added freely by the items workstream)
`wood stick plank stone flint coal iron_ore iron_bar gold_ore gold_bar diamond voidshard`
`fiber string fabric silk leather hide bone feather slime_gel venom_sac beetle_shell bat_wing`
`frost_crystal ember_core amethyst_shard bog_moss glowcap herb berry`
`raw_meat cooked_meat bread mystery_potion health_potion mana_potion`
`firefly glow_moth stag_beetle` (bugs, caught with `bug_net`)
`wooden_axe wooden_sword wooden_pickaxe wooden_bow arrow torch campfire bomb ladder_kit platform_kit bug_net`
`recipe_scroll repair_kit gold` (gold = currency pickup only)

Recipe idioms (keep consistent): `wood+wood=plank`, `wood+stone=stick`… head + handle = tool:
`<bar>+<bar>=<metal>_blade`, `<bar>+stone=<metal>_pick_head`, `<bar>+plank=<metal>_axe_head`,
`<head>+stick=<tool>`; `stick+string=wooden_bow`, `stick+flint=arrow×5`, `fiber+fiber=string`, `string+string=fabric`,
`hide+hide=leather`, `herb+glowcap=mystery_potion`, `raw_meat+campfire(station)=cooked_meat`.

## 8. World
| id | Name | Depths | Look (see art-direction) | Enemies | Giant monster |
|---|---|---|---|---|---|
| `woods` | Mossgrave Woods | 1–8 | green grass fringe, brown cobble, tall puff trees, fireflies | `green_slime toad boar forest_beetle thorn_wasp` | `gloomjaw` — acid-maw crocodile: lunge, charge, acid spit puddles |
| `fen` | Fenmire | 2–10 | teal grass, violet stalks, blue haze, hanging vines | `hex_totem glimmer_bat wisp_lynx bog_slime` | `bogmother` — giant toad: tongue grab, belly-flop shockwave, tadpole swarm |
| `hollow` | Hollow Deep | 2–12 | grey-brown rock, ore veins, mine timbers, lanterns | `cave_bat bone_miner rock_crawler cave_spider` | `broodqueen` — spider queen: web shots, ceiling drop, spiderlings |
| `rime` | Rimefrost | 5–15 | snow caps, ice blocks (slippery), snowy pines, snowfall | `frostling ice_wolf snow_owl ice_slime` | `frost_matron` — phases through walls, orbiting ice shards, blizzard |
| `amethyst` | Amethyst Hollows | 8–20 | purple cobble, glowing magenta crystal trees | `shard_beetle void_imp crystal_spider gem_golem` | `shardbound_knight` — crystal knight: sword combos, shard rain, mirror clone |
| `cinder` | Cinderdeep | 11–20 | basalt with glowing cracks, lava pools, embers | `magma_slime flame_boar ember_imp salamander` | `emberwyrm` — dragon: 3-stream fireball volleys, swoop, flame breath |
| `lair` | Blight Lair | 21 | pink/black blight crystal, pulsing veins | `blight_head blight_spawn` | `blightwall` — advancing wall, volleys, blight heads |

- Global hunter: `blight_wraith`. Town critters: `chicken`.
- Resources per biome: trees (`tree_<biome>`), stone rocks (`rock_stone`), ore rocks (`rock_iron`, `rock_gold`,
  `rock_diamond`, `rock_voidshard` — gated by depth & pickaxe power), plants (`plant_fiber`, `plant_herb`,
  `plant_glowcap`, `bush_berry`, biome specials: `frost_crystal_node`, `ember_vent`, `amethyst_cluster`,
  `bog_moss_patch`), bugs (`bug_firefly`, `bug_moth`, `bug_beetle`), **chests** (`chest_wood`, `chest_iron`),
  **breakable pots**.
- Phase 2 biomes: `veldt` (Sunscorch Veldt), `ossuary` (bone dungeon), `crater` (Starfall Crater), `dunes`.

### Level generation rules
Sizes ≈ 160–260 × 60–100 tiles. Guaranteed path start → exits (validated with a movement-capability graph:
jump ≤ 3 tiles single, ≤ 5 with double jump, gaps ≤ 6 with dash). Mixed caverns, tunnels, vertical shafts
with platforms/ladders, liquid pools, hazards, secret pockets with chests, resource clusters, enemy spawn
points by type (ground/ceiling/air/turret), no spawns within 12 tiles of the start. Terrain is **diggable**
(GROUND with any pickaxe, ROCK needs power 2, BEDROCK never) — an extension; level borders are bedrock.
Towns: flat 90×30 street with 3–5 buildings (shop, forge, tailor/leather, altar 30%), lanterns, chickens.
Boss arenas: 60×30 bedrock-walled rooms with platforms suited to the boss.

## 9. Towns & economy
- **Merchant** (`npc_merchant`): food, potions, torches, arrows, recipe scrolls, a "teaser" item.
- **Biome trader** (`npc_trader`): biome materials & creature drops.
- **Smith** (`npc_smith`): smelt ore → bars (also craftable at a forge), **repair**, sells metal gear.
- **Outfitter** (`npc_outfitter`): fabric/leather/armour.
- **Fence** (`npc_fence`): buys anything (half value).
- **Shrine** (`npc_shrine`, 30%): 500 g prayer for a random major blessing.
- Gold drops from enemies, chests, selling. Prices scale with tier.

## 10. Progression content
- **Races** (`drifter` default): `drifter` HP+1 · `highborn` LCK+2, start 30 g · `cyclorc` ATK+2 HP−1 ·
  `stoutling` DEX+4 HP−1 · `templar` ATK+1 DEF+1, starts with a buckler · `wraithkin` MAG+4 HP−1, starts with a
  spark wand · `mosskin` ATK+1 MAG+1, herbs heal · `boarfolk` all −1, 3 raw meat, no axe, eats anything
  (+food) · `saurian` ATK+1 DEX+3 MAG+1, starts with a jade blade · `ifrit` MAG+3, fire wand, burn immune.
- **Traits** (pick 2): Aggressive, Defensive, Healthy, Swift, Gatherer, Artisan, Glutton, Lucky, Bookworm, Nimble.
- **Hats**: `forager_band miner_lamp berserker_scarf ranger_cap wizard_hat bunny_ears bat_wings tiki_mask
  skull_mask gilded_crown shroom_cap dragon_mask` (each a small stat mod + one special effect).
- **Companions** (hover, passive): `mend_sprite` (slow regen) · `ember_bat` (attacks) · `lantern_wisp` (light,
  reveals chests) · `haste_beetle` (+speed) · `floaty_slime` (+1 air jump, slow fall) · `gizmo_drone` (shield
  every 20 s).
- **Skills** (3 paths × 6): Warrior `whirlwind ground_slam war_cry charge iron_skin cleave` · Mage
  `fire_burst frost_nova chain_lightning blink arcane_ward meteor` · Ranger `multishot arrow_rain bear_trap
  smoke_bomb hawk volley_step`.
- **Unlocks**: milestone + chance at run end (e.g. 15 kills → 20% `highborn`; mine 20 ores → 20% `cyclorc`;
  first skill → 20% `stoutling`; reach Lv10 → 5% `templar`; win → `wraithkin`; reach D10 → 20% `mosskin`; …).

## 11. Modes
Normal · **Madcap** (stronger enemies, fast Wraith) · **Daily Run** (seed = date, same for everyone) · Practice
(no unlocks). Local co-op (shared screen, up to 4 pads) and online co-op (room codes).

## 12. Phasing
- **Phase 1 (now)**: everything above except quality tiers, phase-2 biomes, altars' full blessing list,
  achievements UI, desktop packaging. Placeholder-quality procedural sprites are fine.
- **Phase 2**: art pass on sprites, phase-2 biomes & bosses, quality tiers, Madcap/Daily polish,
  desktop builds, Steam integration, balance via telemetry from playtests.
