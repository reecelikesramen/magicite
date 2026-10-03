# Magicite (2014) — mechanics reference for the Shardfall rebuild

What the **original** game is and how it plays, compiled from web research, the decompiled final-build
game code, the official trailer and the owner's screenshots. It is **mechanics guidance only**.

> **Naming rule (CLAUDE.md rule 6).** Every proper name here (races, gods, bosses, items, NPCs, places,
> district-name syllables such as "Toadvale", UI strings) belongs to the original game. It is recorded so we
> can understand the mechanics. **None of it may appear in Shardfall content.** Our names live in
> `docs/design/gdd.md`.

Companion documents:
- `docs/research/screenshot-analysis.md`: owner ground truth. **It wins every visual/HUD conflict.**
- `docs/research/trailer-analysis.md`: frame-by-frame notes on the early-build trailer.
- `docs/research/art-direction.md`: the actionable visual and audio spec for our procedural art.
- `docs/research/tech-stack.md`: the decided technology and packaging plan.

---

## 0. Evidence, confidence tags and precedence

| Tag | Meaning |
|---|---|
| **[C]** | Read directly from the **decompiled final-build code**: the Magicite 2.1 community patch's `Assembly-UnityScript.dll` (YewYew/MagiciteFanPatches, 2019). That build is the official v2.0 code (Aug 2016) plus multiplayer desync/dupe fixes and the re-enabled Desert biome. Strongest evidence for rules and numbers. |
| **[C~]** | The code fact is certain, but the mapping to a name (prefab ↔ wiki name) or the unit is inferred. |
| **[SS]** | The owner's five 1280×720 screenshots of the release build (`screenshot-analysis.md`). **Authoritative for visuals and HUD.** |
| **[V]** | Measured in the official trailer (an early build) or the Steam store screenshot (`trailer-analysis.md`). |
| **[S+]** | Two or more web sources agree (Fandom wiki, Steam news/guides/threads, Kickstarter, press). |
| **[S]** | One web source. |
| **[K]** | Training knowledge, unverified. |
| **[G]** | Guess or inference. |

**Precedence.** Visuals/HUD: [SS] > [V] > [C] > web. Rules and numbers: [C] > [S+] > [S] > [K] > [G].
When a screenshot shows a number that the code contradicts (the XP readout, §10.3), both are recorded.

**Builds.**

| Build | When | Evidence | Distinguishing marks |
|---|---|---|---|
| A | 2013 – early 2014 (Early Access) | Trailer [V] | Text-only meters, six stats (HP ATK DEF MAG AGI LCK), "alignment" line, hunger max 10→20, closer camera (≈256×160 view). |
| B | 1.0 release, June 2014 onward | Screenshots [SS], store shot [V] | Meter bars, XP bar, coins, four stats (HP ATK DEX MAG), ≈320×180 view. |
| v2.0 | Aug 2016 "final update" | Steam news [S+] | Madman Mode, the 4th Age Droid companion, Spirit rebalance, inventory retexture. |
| v2.1 | 2019 fan patch | Code [C] | v2.0 + multiplayer fixes + Desert biome enabled. |

**Units used below.** Unity world units (**u**). Strong evidence that **1 u = 1 terrain tile = 8 art px**
[G]: the camera shows ≈42.7×24 u at 16:9 and the screenshots show ≈40×22 tiles of 8 px; level chunks
sit on a 64-u grid with ±8-u height steps. Conversions to Shardfall units (px, px/s, ticks at 60 Hz) are
given as **px = u × 8**.

---

## 1. At a glance

| Fact | Value | Tag |
|---|---|---|
| Genre | 2D side-view pixel-art roguelike platformer RPG: gather, two-item crafting, permadeath, 1–4 player online co-op | [S+][SS] |
| Developer | Sean Young, solo, as SmashGames (then a UCF student; his 9th game, first non-mobile) | [S+] |
| Engine | Unity, UnityScript, legacy `Network.Instantiate`/RPC networking | [C][S+] |
| Platforms | Windows, macOS, Linux (Steam app 268750) | [S+] |
| Kickstarter | Oct 10 – Nov 19, 2013; $1,000 goal; raised $16,308 from 674 backers | [S+] |
| Early Access | Feb 11, 2014 at $4.99 | [S+] |
| 1.0 | June 9, 2014 at $9.99 | [S+] |
| Last official update | v2.0, Aug 31, 2016 | [S+] |
| Influences (dev) | Monster Hunter (gather → craft → fight giant monsters with friends) and Spelunky (brutal, rewarding platforming) | [S+][SS] |
| Run | 10 combat districts alternating with 10 safe towns, then the final Lair (internal level 21) | [C] |
| Route choice | 3 colour-coded exit doors per combat district, each an independent biome roll | [C][S+] |
| Pressure | Unkillable "Scourge" invaders after 300–349 s in a combat district (600–698 s in District 1) | [C] |
| Final boss | The Scourge Wall: an advancing wall, 4500 HP + 700 per extra player | [C] |
| Permadeath | Solo: death ends the run. Co-op: downed players can be revived; the run ends when everyone is down at once | [C][S+] |
| Meta | Side-grade unlocks only (15 races, 24 hats, 9 companions), rolled at run end from per-run milestones | [C][S+] |
| Typical win | Under an hour is "fast" (an unlock condition); ≈1–1.5 h typical [G] | [C][G] |
| Reception | Steam "Very Positive", ≈83–85% of ≈7.6k reviews; Metacritic users 7.3 | [S+] |

---

## 2. Premise and setting

- **Intro cutscene text** (final build) [C]: "Long ago there was a time of peace." / "We lived on the
  surface, free of danger." / "But something happened..." / "The Scourge was unleashed upon the world.
  Many of us died." / (screen flash) / "The rest of us sought shelter underground." / "But amidst all of this
  chaos, We found hope..." / "...Magicite." The trailer's early wording differs slightly ("UNTIL ONE DAY...",
  "DESTROYING THE OVERWORLD...") [V].
- **World.** The surface ("Overworld") was destroyed by the Scourge, a shadowy plague of monsters. Survivors
  built **Deephaven**, a network of underground passages, powered by the crystal **Magicite** [S+][C].
- **There is no "Magicite" item.** The crystal is lore only. In-world crystals are Crystalite (final-tier
  ore) and the Spirit Gem [C].
- Lore lives in race descriptions, altar-god blurbs and NPC chatter ("Life is great.", "Deephaven is scary.",
  "I miss the sun...", "The Scourge suck!") [C]. There is no narrative beyond the intro and a win screen.
- **Ending.** Killing the Scourge Wall in the Lair wins. The wall flies off left, victory music plays, then the
  run-end stats and unlock screen [C]. No ending cutscene was found [S][C].

*Shardfall:* same premise shape (surface cataclysm → underground refuge → hope crystal), with our own names
(the Blight, the Undervault, the Heartshard). See `gdd.md` §2.

---

## 3. Run structure

### 3.1 The level sequence [C]

`GameScript.Awake` increments `districtLevel` on **every** scene load, and towns load the same scene. The
player alternates combat district → town → combat district:

| `districtLevel` | Content | HUD title |
|---|---|---|
| 1 | Combat district, **always Forest** | `District 1: <Prefix> Forest` |
| 2, 4, …, 18 | Town (safe), biome = the door you picked | `District N: <Prefix> <Biome>` |
| 3, 5, …, 19 | Combat district, biome = the same door choice | `District N: <Prefix> <Biome>` |
| 20 | Final town: a single **purple** door | `District 20: …` |
| 21 | **The Scourge Lair** (biome 19): no exits; kill the Wall to win | `The Scourge Lair` |

So a run is **10 combat districts + 10 towns + the Lair**. This settles the "District 20 vs 21" conflict:
web sources that say "the Lair is District 21" and "the Wall is just past District 20" are both right [C].
The 3-door choice happens only in combat districts. A town has one exit that leads to the biome already
chosen [C].

- **District names** are `"District N: " + prefix + suffix + " " + biome noun` [C]. Prefixes: Thorn, Bush,
  Leaf, Vine, Rock, Earth, Toad, Green, Tree, Deep, Lush. Suffixes: vale, wreath, night, fire, roar, fang,
  road, wild, wood, grand, flower. "Toadvale Forest" in the screenshot is one random roll, **not a biome
  name** [C]. Shown in yellowish text under the right-hand meters [SS].
- **Entering a door** needs the Interact button while standing in it (W; spamming W can skip districts, a
  known exploit) [C][S]. In multiplayer the **first** player to interact moves the whole party 1 s later,
  through that player's door. No vote, no waiting [C].

### 3.2 Exit doors and biome gating [C]

Each combat district ends with **3 doors** whose destinations are **independent** rolls of
`GetPossibleBiome(districtLevel)`. Duplicates are allowed (three Forest doors happen 1/8 of the time at D1).
The biome you pick is used by the next town (+1) and the next combat district (+2).

| Standing in combat district | Door odds | Next combat district |
|---|---|---|
| 1, 3 | Forest 50%, Swamp 25%, Tundra 25% | 3, 5 |
| 5 | Cave 40%, Tundra 20%, Swamp 20%, Veldt 20% | 7 |
| 7 | Cave ⅓, Veldt ⅓, Dungeon ⅙, Quarry ⅙ | 9 |
| 9, 11, 13 | Dungeon 40%, Veldt 20%, Cave 20%, Desert 20% (v2.1) | 11–15 |
| 15 | Dungeon, Volcano, Veldt, Cave, Desert, Crater: ⅙ each | 17 |
| 17, 19 | Dungeon ⅓, Volcano ⅓, Crater ⅓ | 19, and the look of the D20 town |

Resulting biome depth ranges (combat districts):

| Biome (index) | Possible districts | Door colour |
|---|---|---|
| Forest (0) | D1–5 | green [S] |
| Tundra (1) | D3–7 | white [S] |
| Swamp (7) | D3–7 | blue/green [S] |
| Cave (2) | D7–17 | unknown |
| Veldt (5) | D7–17 | red [S] |
| Quarry (8) | **D9 only** | unknown |
| Dungeon (3) | D9–19 | unknown |
| Desert (4) | D11–17 (v2.1 only; vanilla returned another biome in that slot [G]) | unknown |
| Volcano (6), Crater (9) | D17–19 | unknown |
| Final door → Lair (19) | D20 town | purple [S] |

Door art uses materials `lv/d<biome>` and `lv/d99` for the final door; the colours are texture data [C].
Earlier web claims of an "overworld map" between districts are wrong; the doors are the only route choice [C].

### 3.3 How a combat district is built [C]

- `z/zEntrance` at x = 0, then **4–5 middle zones** of **64 u** (512 px) each at x = i·64 + 40, then
  `z/zExit`. Entrance and exit chunks are ≈16 u wide. A district is **≈288 or ≈352 u long**
  (≈2,300–2,800 px, i.e. ≈7–9 screen widths at 320 px per screen).
- Zone **type** is a random 1–8 (Quarry 1–2; Crater 1, 2 or 7). Each zone boundary shifts the floor:
  types 1/3/5 step −8 u (descend), 2/4/6 step +8 u (ascend), 7/8 are flat. So districts are **mostly
  horizontal with large stepped height changes**, built from hand-made chunk prefabs.
- Each zone's `SpawnScript` walks its floor anchors (`slot[]`, up to 18) and ceiling anchors (`top[]`, up to
  10). Each floor anchor rolls 0–99 against a per-biome table (§6). Anchor counts per prefab are not in the
  DLL.
- **No scaling with depth.** Enemy HP/ATK/XP/gold are per-enemy constants. Difficulty rises only through
  biome gating, plus: Percyl only from D≥2, Mimics only from `districtLevel` > 5, Spirit Gem in shops from
  D≥15, invader timer doubled in D1.
- Terrain is **not destructible**. Resources are separate objects (trees, ore rocks, plants, bug spots)
  [C][S+].

### 3.4 The Scourge (time pressure) [C]

The original's equivalent of Spelunky's ghost.

| Rule | Value |
|---|---|
| Starts | On entering any non-town level, **including the Lair** |
| Delay | `Random.Range(300, 350)` s = 5:00–5:49. District 1: doubled to 600–698 s. Madman: 3 s |
| On trigger | Message "The Scourge have invaded! Get out!!", boss music starts |
| Spawn point | World (−15, 15): behind and above the entrance |
| Count | **Exactly 5**, 3–7 s apart. No more after that |
| Stats | 999,999 HP, 9,999 contact damage (a one-shot), DEF 3 (unused) |
| Motion | Loop: wait 1 s, lock a vector to the player, fly straight along it for 2 s at 12–17 u/s (96–136 px/s). Kinematic, so they **pass through walls** |
| Targeting | Re-acquire the nearest player about every 15 s |
| Healing | None in code (the wiki's "heals 10,000 HP/s" is not real) |

Web descriptions of "three massive purple heads that one-shot you" are a mix-up with the Wall's heads
[C][G]. **No warning precedes the invasion** in the code besides the message on spawn [C].

### 3.5 Win, loss, run end

- **Win**: Scourge Wall killed at `districtLevel` ≥ 20 → `Win`, music `tune/12`, then the run-end screen [C].
- **Loss**: all players downed at once (co-op) or the solo player dies; game over 2.2 s later [C].
- **Run end** [C]: stats screen ("Total Time, Enemies Defeated, Gold Collected, EXP Acquired, Items Crafted,
  Trees Chopped, Ore Mined, Resources Gathered, Foods Eaten, Chests Opened, Bosses Defeated, Items Bought,
  Quests Completed"), a death title ("Dragon Slayer", "Farmer"…), then **reward chests**, one per unlock
  condition met this run, each opened with a % roll (§10.8). Run stats also convert into account XP and a
  high score (tempEXP/2). Then "Again".

### 3.6 Difficulty modes

- **Normal** and **Madman Mode** (v2.0; label in red, warning "Only for strong-willed Magicite Veterans!")
  [C][S+]. Madman, complete rule set from code [C]:
  1. In every non-town level below 20 the invader timer is **3 s** (overrides the D1 doubling).
  2. At that moment a **Scourge Wall** also spawns. Killing it outside the Lair only makes it retreat.
  3. All Scourge Walls move at 3 u/s instead of 1.5 (including the Lair's).
  4. Winning in Madman unlocks companion #9.
  There are **no boss stat buffs** in code. The wiki's "Space Commander 50,000 HP with clones" is not in the
  final build [C vs S].
- **No daily challenge or seeded runs** exist [S, absence][C].

---

## 4. Controls and movement

### 4.1 Default bindings

| Action | Key | Tag |
|---|---|---|
| Move | A / D | [C][S+] |
| Jump / double jump (hold for height) | Space | [C][S+] |
| Dash left / dash right (separate keys, not facing-based) | Q / E | [C][S+] |
| Melee attack | Left mouse | [S+] |
| Use held item (shoot bow, cast staff, eat, drink, throw, place campfire, swing net) | Right mouse | [S+][C] |
| Interact (doors, NPCs, revive) / float up | W | [C] |
| Float down (only while floating) | S | [C] |
| Hotbar | 1–5, mouse wheel | [S+][C] |
| Inventory | **R** (Tab added in v2.0) | [S+]; the code reads a named "Inventory" button whose key is in Unity's InputManager, so [C] cannot settle it |
| Craft | Shift + click two items | [S+][SS] |
| Split / place one | Right-click on a slot while holding a stack | [S][C] |
| Skills | Z / X / C (Y on QWERTZ) | [S+] |
| Cheat/backer codes | L | [S+] |
| Resolution presets | F1–F6 (512×320 up to 1080p) | [C] |

- Rebinding happens only in the Unity launcher before the game starts [S+].
- **No controller support** ever shipped; free-cursor aiming was the obstacle [S+]. No local/split-screen
  co-op [S][G].
- **Aiming**: facing flips instantly to the side of the mouse cursor. Melee has no vertical aim. Arrows,
  bolts, thrown rocks and vials fly at the cursor's exact angle. Fireball goes left/right by facing. Bolt is
  centred on the player [C].

### 4.2 Physics constants [C] (final build; `PlayerControllerN`)

| Item | Value (u) | Shardfall units | Notes |
|---|---|---|---|
| Run speed | 7.6 + 0.05·DEX u/s | ≈ 61 + 0.4·DEX px/s | Written straight into velocity: **no acceleration**, release = stop, full air control. DEX barely matters (DEX 20 → 69 px/s) |
| Speed modifiers | Haste Beetle ×2; Wasp Glasses +4; Charge! +4 for 10 s; 4th Age Droid ×3 (only on scene start, a bug) | | Halved during melee wind-up and swing |
| Gravity | **Not in code** (Unity project setting) | ≈ 600–800 px/s² [G] | Inferred from the trailer's ≈4-tile single jump with vy 25 u/s. Shardfall's `PHYS.gravity = 760` fits |
| Max fall | −25 u/s | 200 px/s | −5 u/s (40 px/s) with Wasp Glasses |
| Jump | vy = 25 u/s | 200 px/s | Variable height by **holding**: +32 u/s² (256 px/s²) upward for up to 1 s while held. Release does not cut velocity |
| Double jump | vy = 27 u/s, **costs 1 stamina** | 216 px/s | Same 1 s hold boost. Fails with 0 stamina ("noSta" popup). White puff at take-off [V] |
| Triple jump | vy = 26, costs 1 stamina | 208 px/s | Bunny Ears hat only; re-armed on landing |
| Coyote time | ≈0.2 s | ≈12 ticks | Ground ray 1 u; on losing ground re-check after 0.2 s with a 1.5-u ray |
| Dash | vx ±18 u/s ground, ±15 u/s air, for **0.3 s**; costs 1 stamina | 144 / 120 px/s, 18 ticks | Distance ≈5.4 / 4.5 tiles. Gravity still applies; run input ignored. No cooldown beyond stamina |
| Bat Wing hat | +10 to dash speed | 224 / 200 px/s | ≈×1.6, not the ×2 its text claims |
| Stamina | Max 4 up to Lv4, then = level, cap 12; **+1 per second** | | Not DEX-based (web claim was wrong) |
| Floating | Floaty Slime: gravity off; Down → vy −10, Interact → vy +10 (one-shot). Droid ±20. Levitate skill: 10 s from vy +10 | | |
| Gooey Ghost | Unlimited free double jumps; hold boost never clears (holding Jump climbs) | | |
| Not present | Drop-through platforms, wall slide/jump (flags set but unused), fast-fall/dive, fall damage, ladders, swimming | | Falling below y −120 teleports to (0,0) |

Feel from reviews: "tight and responsive" [S], "every attack dodgeable" [S]; complaints that the double jump
sometimes "doesn't work" [S] (likely the stamina gate) and that **enemies often outrun the player** [S+].
The trailer shows a single jump ≈4 tiles and a double jump totalling ≈6 tiles [V].

---

## 5. Combat

### 5.1 Stats that drive combat [C]

Four stats: **HP** (= max HP), **ATK** (melee), **DEX** (bows; tiny run-speed bonus), **MAG** (= max mana and
spell damage). There is **no LCK stat** (LCK is only the forge roll, §9.3), **no player DEF stat** (DEF exists
in data but is unused; armour gives HP + a class stat), and **no stat or level cap**. Build A showed six stats
(HP ATK DEF MAG AGI LCK) [V], which were cut.

### 5.2 Melee [C]

- **Hitbox**: a sphere collider active for **0.2 s** after the wind-up, in the facing direction:

| Held item | Centre x | Radius | Wind-up | Full cycle |
|---|---|---|---|---|
| Swords, axes, picks (IDs 500–559) | 0.4 u (3 px) | 0.6 u (5 px) | 0.45 s | ≈0.65–0.85 s |
| Great weapons (560–579: great axes, Philibuster, Jelly Blade, Zweihander, the three brands) | 0.7 u (6 px) | 1.0 u (8 px) | 1.0 s | ≈1.4 s |
| Bare hands, materials | 0.1 u | 0.6 u | 0.45 s | |

- Bows never melee in the final build; with no arrows they do nothing (older builds: bow-melee cost
  durability [S]).
- **Damage** = (base ATK + race + level growth + held weapon + gear ATK + Drum bonus + Viking Helm proc)
  × 2 if Berserker's Rage × 2 on crit, + Magic Weapons bonus. **Crit** 6% (26% with Skeleton Mask). Minimum 1.
- **Feedback**: every successful player melee hit plays `swipe`, a camera "shaake" clip and an enemy
  knockback [C]. Swing animation: weapon snaps vertical, sweeps to ≈45° below horizontal in ≈0.15 s and
  returns; no slash trail [V].
- **No blocking.** Shields only add HP (and reduce damage via ShieldDEF where an item gives it) [C][S].
- **Melee was the weakest build**: short reach, slow great weapons, no block, enemies faster than the
  player, flying enemies hard to hit; "a death sentence" [S+].

### 5.3 Ranged [C]

- Arrows go in the dedicated ammo slot. Right-click fires toward the cursor; **instant, no charge**; flight
  is **straight at 30 u/s (240 px/s), no gravity**. Arrows hitting the ground drop as recoverable items.
- **Damage** = DEX + DEX bonuses + Drum of Dexterity + arrow bonus (Bone 1, Stone 1, Ironite 4, Goldium 11,
  Diamonite 20). Fire Bow: 1.25 × (DEX + bonuses + 7) + arrow bonus; Triple Shot extras ×2 (×2.5 with the Fire
  Bow).
- Community consensus: **ranged is the safest and strongest** ("skilled archers can finish without taking
  damage") [S+].

### 5.4 Magic [C]

Staves are crafted from a gem + stick; mana pool = MAG; regen **+1 per 10 s** (Clairvoyance: +1 per 0.5 s ×20;
Gorgon Eye: extra +1 per 1.5 s).

| Staff | Mana | Behaviour | Damage |
|---|---|---|---|
| Fireball | 1 | Flies left/right by facing, **passes through terrain**, dies on the first enemy hit; 0.3 s cast | max MAG + Drum of Wisdom |
| Bolt | 1 | A stationary full-screen-height lightning pillar **on the player** for 0.6 s (12 × 0.05 s frames), hits everything inside; 0.5 s cast | MAG-based |
| Frostshard | **3** (needs MAG ≥ 3) | 3 shards orbit the player for **20 s**, pass through walls; recast extends | ½ (MAG + drum) each |
| Summon Zombie | 1 | Summons a minion | MAG-based |

- Wizard Beard hat: ⅔ of casts free. Elemental greatswords (Firebrand/Thunderbrand/Icebrand) cast their
  spell on swing; The Philibuster spends 1 mana per swing for a fire explosion (`haz/fE`, damage in prefab).
- Early reception called magic "SERIOUSLY underpowered"; later the wiki calls mage "the most effective
  playstyle" once MAG is stacked (Remnant + Wizard Beard + Flame of Hope "casting lightning across the map")
  [S+].

### 5.5 Thrown items [C]

Rocks (Stone) and poison vials: a unit vector to the cursor × force 2900, then a physics arc under gravity;
0.5 s wind-up. Damage is in the prefab. The wiki advises jumping before throwing so the vial doesn't land at
your feet [S]. Daggers exist as items but `ThrowDagger` is dead code [C].

### 5.6 Taking damage [C]

| Rule | Value |
|---|---|
| Damage taken | max(1, damage − ShieldDEF). Guardian's Aura adds +4 ShieldDEF for 10 s (stacks). Overworld Helm halves **after** the minimum, truncating, so 1-damage hits become 0 |
| Player i-frames | **0.7 s** after a hit (a second path restores at 1 s). Invulnerable while standing in a door or while downed |
| Enemy i-frames | 0.2 s |
| Contact damage | Once per collision **enter**; standing in contact does not tick |
| Knockback on player | vx ±10, vy +10 u/s for one frame, **only from PvP melee, poison clouds and the Wall (vx 40)**. Ordinary enemy hits do **not** knock the player back |
| Knockback on enemies | vx ±15, vy +10 u/s, AI frozen 1 frame + 0.2 s |
| HP regen | **None**. HP returns from food (50% +1), potions, Frost Crown, Regen Fairy (+1 per level load), Tiki Mask, altars |
| Enemy DEF | Stored but ignored (only the Fire Ox subtracts DEF 2) |

### 5.7 Status effects

Few and simple [C][S]: **poison cloud** (Vial of Poison or a Mysterious Potion's bad roll; 6 s cloud; 20% of
max HP **once per entry**, players including the thrower, enemies 20% of base HP; knocks targets out of the
centre); **starvation** (§10.5); **"on fire" arrows** (Fire Bow / Fire Wisp ×2). No burn-over-time, freeze or
slow exists. Buffs come from skills and drums.

### 5.8 Active skills (Z/X/C) [C]

At levels **5, 10, 15** a "Select Skill Path" panel opens with three buttons: red **Warrior**, blue **Mage**,
green **Ranger** [SS][C]. You get a **random skill from the chosen path** (a duplicate bumps to the next one,
wrapping). Max 3 skills. Cooldowns tick in 0.1 s and **reset on entering a new level** [C][S].

| Path | Skill | CD | Effect |
|---|---|---|---|
| Warrior | Throwing Axe | 20 s | Giant piercing axe toward the cursor side; ATK (excl. weapon) / 2 |
| | Berserker's Rage | 40 s | Melee ×2 for 10 s |
| | Charge! | 40 s | Area pulse: +4 run speed for 10 s (allies too) |
| | Guardian's Aura | 40 s | Area pulse: −4 damage taken for 10 s (allies too) |
| | Knight's Blade | 15 s | Launch up (vy 38) + summoned blade dealing ATK |
| Mage | Magic Weapons | 40 s | Area pulse: +max MAG flat melee bonus for 15 s |
| | Clairvoyance | 20 s | +1 mana every 0.5 s for 10 s |
| | Necromancer's Minion | 35 s | Fireball-shooting minion at the cursor (power = MAG) |
| | Warp | 15 s | Teleport 8 u toward the cursor side unless a wall is within 8.4 u |
| | Levitate | 20 s | Float for 10 s |
| Ranger | Hunter's Roar | 40 s | +10 DEX for 10 s (allies too) |
| | Triple Shot | 15 s | Next shot fires 2 extra arrows at ±10°, ×2 damage |
| | Druid's Arrow | 15 s | Launch up (vy 38) + arrow dealing weapon ATK |
| | Fire Wisp | 15 s | Wisp at the cursor; arrows passing through ignite (×2) |
| | Dire Wolf | 15 s | Summon a wolf (power = DEX) |

### 5.9 Co-op scaling [C]

Every `EnemyScript` (regular enemies, bosses, invaders), with N = other connected players:
**HP = base × (1 + 0.5N)**, **ATK = base × (1 + 0.4N)**. The Scourge Wall instead gets **4500 + 700N** HP.

---

## 6. Biomes

Spawn tables are per floor anchor, roll 0–99 [C]. "Standard ore" = Ironite 80% / Goldium 15% / Diamonite 5%;
"rich ore" = 48 / 36 / 16. 10% of standard ore nodes (5% of rich) are a Rock Crab instead (never in Forest).
Music index = `tune/<n>` (§13).

### 6.1 Forest (index 0) — D1–5

- **Look** [SS][V]: near-black world; bright lime grass fringe with crenellated tufts over dark brown cobble
  soil (lit soil turns red-brown, grass tips glow yellow); very tall thin zigzag-trunk trees with round leaf
  puffs alternating up the trunk; lime fireflies; grey rock and gold-fleck ore nodes; stone exit portal on a
  high ledge with mossy green glow.
- **Spawn table** [C]: 0 = ⅓ beehive / ⅓ chest / ⅓ Percyl (D≥2) · 1 bug spot · 2–9 vines · 10–12 plant ·
  13–24 tree · 25–34 pig · 35–49 forest enemy (+½ vines, +⅛ bug spot) · 50–59 ore · 60–99 tree. Ceiling: 10%
  vines.
- **Enemy weights** [C]: 17 Green Slime : 5 Bee : 6 Boar : 5 Green Spider : 1 Tyrannox.
- **Hazards**: spiked blocks moving up and down, 1 dmg [S].
- **Bosses**: Tyrannox (rare enemy roll), Percyl the penguin pirate (chest-slot roll). The trailer's giant
  segmented worm erupting from the ground appeared here in Build A [V]; its code (`WormScript`) is cut by v2.0
  [C].
- Music `tune/0`.

### 6.2 Swamp (index 7) — D3–7

- **Look** [SS]: deep blue ambient haze (#14205a), dark teal grass with cyan tips, hanging vines with white
  flowers, tall stalks with purple leaves. Identity [C~]: the screenshot's tiki-mask enemies match the swamp's
  roster.
- **Spawn table** [C]: 0 chest · 1 bug spot · 2–9 gas · 10–12 plant · 13–24 tree · 25–34 slug · 35–49 swamp
  enemy · 50–59 ore (+⅓ enemy, +1/7 bug spot) · 60–99 tree.
- **Enemies** [C]: 7 Tiki Clubsman : 4 Tiki Mage; Slugs (passive).
- **Hazards**: purple flowers shooting bubbles straight up, 1 dmg (the "gas" slots) [S][C~].
- **Boss**: none [S+][C]. Visiting rolls the Tiki Mask hat (20%).
- Music `tune/7`.

### 6.3 Tundra (index 1) — D3–7

- **Look** [V]: grey rock with a white jagged snow cap that glows white under the light; snow pines (red-brown
  zigzag trunk, white-topped green puffs); cyan ice-crystal spike clusters; falling snow (3×3 crosses and
  1–2 px dots); white rabbits.
- **Spawn table** [C]: 0 chest (+⅓ Ice Queen) · 1 bug spot · 2–6 snow hazard · 7–12 plant · 13–24 tree ·
  25–34 rabbit (+½ tundra enemy) · 35–49 tundra enemy (+1/7 hazard, +¼ bug spot) · 50–59 ore · 60–99 tree.
- **Enemy weights** [C]: 20 Blue Slime : 15 Ice Fairy : 12 Ice Knight : **3 Yeti**.
- **Hazards**: ice boulders falling from the ceiling, 2 dmg [S].
- **Bosses**: Yeti (fairly common), Ice Queen. Visiting rolls Bunny Ears (20%).
- Music `tune/1`.

### 6.4 Cave (index 2) — D7–17

- **Look** [V][SS][C~]: the purple crystal cave. Navy/blue-violet cobble body, glowing **magenta crystal
  lumps** as the top fringe (hot pink #ff50c0 when lit), very dark violet back wall, purple thorny trees with
  magenta crystal blossoms, big white-violet glowing crystals, sparse teal motes. The trailer's underground
  town sits in this palette.
- **Spawn table** [C]: 0–2 chest · 3 bug spot · 4–19 tree · **20–34 spider egg** · 35–49 cave enemy (+⅙ bug
  spot) · 50–79 ½ ore / ½ tree · 80–99 cave enemy.
- **Enemies** [C]: 29 Purple Spider : 19 Bat (out of 50).
- **Boss**: Broodmother, summoned by **every 3rd spider egg broken** in the district (eggs pop on contact),
  spawning 50 u above the player with the message "You've awakened the Broodmother..." [C].
- Visiting rolls Bat Wing (20%). Music `tune/2`.

### 6.5 Veldt (index 5) — D7–17

- **Look** [G]: savanna; ochre earth, dry grass, savanna trees, ceiling shrooms (10% of ceiling anchors).
  Red door [S].
- **Spawn table** [C]: 1 bug spot · 10–12 plant · 13–24 tree + sheep · 25–34 sheep · 35–49 veldt enemy ·
  50–59 rich ore · 60–99 tree (+⅓ veldt enemy). **No chests, no hazards** [C][S].
- **Enemy weights** [C]: 8 Jumping Shroom : 4 Jellyfish : 2 Shroom Soldier : 6 Shroom Mage.
- **Boss**: none. Visiting rolls the Shroom Hat (20%). Music `tune/5`.

### 6.6 Dungeon (index 3) — D9–19

- **Look** [V]: grey stone bricks in staggered 8×4 rows; dark maroon/purple brick back wall with grey cobble
  pillars; magenta motes; lanterns and spires.
- **Spawn table** [C]: 0–1 chest (+⅕ Skeleton King) · 2–9 spike ball · 10–12 dungeon enemy · 13–24 pillar
  (+¼ rich ore) · 25–34 nothing · 35–49 dungeon enemy (+¼ spike ball) · 50–59 rich ore · 60–99 pillar (+⅓ chest).
- **Enemy weights** [C]: 7 skeletons (⅓ Warrior, ⅔ Archer) : 2 Minotaur : 3 Genie.
- **Hazard**: swinging spiked chain balls [C][S].
- **Boss**: Skeleton King. Chest bonus: ⅙ Ryvenrath's Scale. Visiting rolls Skeleton Mask (20%).
  Music `tune/3`.

### 6.7 Crystal Quarry (index 8) — D9 only

- **Look** [G]: grey stone, crystal trees and plants, cyan/white crystal spikes.
- **Spawn table** [C]: 0–1 ⅓ Crystallized Hero else chest · 2–3 bug spot · 10–12 plant · 13–24 and 60–99 ⅔
  crystal tree else crystal hazard (⅔ of those a spike) · 25–49 quarry enemy (+⅛ bug spot) · 50–59 ore.
- **Enemies** [C]: Crystal Bat + Crystal Slug pairs, Crystal Golem.
- **Boss**: Crystallized Hero (`e/scourgeKnight`) [C~]. Chest bonus ⅙ Crystal Bow. Music `tune/8`.

### 6.8 Desert (index 4) — cut, v2.1 only (D11–17)

Snakes (placeholder 354 HP), cacti, spires, palms, desert towns and music existed unfinished in the files;
enabled by the fan patch [C][S]. Not part of the shipped game.

### 6.9 Volcano (index 6) — D17–19

- **Look** [SS]: dark red rounded rock blobs in the back wall; platforms with glowing lava crust tops
  (#ffd040/#ffb030/#ff8020) over dark red-brown bodies laced with glowing cracks; fire bursts of orange/yellow
  squares rising from the ground.
- **Spawn table** [C]: 0 chest (+½ Black Dragon) · 1 bug spot · 2–9 plant · 10–12 rich ore · 13–24 flame ·
  35–49 volcano enemy + rich ore · 50–59 rich ore (+¼ enemy) · 60–99 tree (+1/7 chest, +1/7 enemy).
- **Enemies** [C]: 3 Whelp (the screenshot's small red dragon firing **3 aimed fireball streams** [SS][C~]) :
  4 Red Skeleton : 4 Fire Ox (the burning spiked quadruped [SS][C~]).
- **Hazard**: flame vents ("fireballs moving up and down") [C][S].
- **Boss**: Black Dragon. Chest bonus ⅙ The Philibuster. Visiting rolls the Dragon Hat (20%). Music `tune/6`.

### 6.10 Crater (index 9) — D17–19 (added 1.2.0)

- **Look** [S][G]: space theme; starry black, violet rock, crater flames, glowing butterflies.
- **Spawn table** [C]: 0 chest · 1–12 crater flame · 13–24 tree · 25–49 crater enemy (+⅙ bug spot) · 50–59
  ore · 60–99 tree (+⅕ chest).
- **Enemy weights** [C]: 16 Space Butterfly : 28 Cosmic Skeleton : 1 Space Commander.
- Chest bonus ⅕ Total Biscuit; rare Laser Sword / Laser Crossbow. Visiting: 50% Bandicoot race. Music `tune/9`.

### 6.11 The Scourge Lair (index 19) — level 21

- **Look** [G][S]: black and flesh-purple, magenta accents, pink/purple projectiles. Exclusive **Crystalite**
  ore (needs a Diamonite pick).
- **Spawn table** [C]: 1–12 and 50–59 Crystalite node · 13–24 tree · 25–49 Lair enemy · 60–99 tree (+⅓ Lair
  enemy).
- **Enemy weights** [C]: 5 Ghoul : 2 Scourge Worm : 4 Fallen Knight.
- **No exits.** The Scourge Wall spawns on load; invaders still arrive after 300–349 s. Visiting rolls the
  Scourge Mask (20%).

### 6.12 Towns [C]

- One town after every combat district except the Lair. It uses the **biome you picked** for its look, has no
  invaders, no hunger drain, and its single exit leads to that biome. Layout ≈96 u wide: entrance, **one**
  64-u zone (can slope), exit.
- **Always present**: Blacksmith (smelt + metal gear), Leatherworker, Tailor, Hoarder (sell box); **two
  merchants**, each 40% item / 60% gear merchant before D15 and always item merchants from D15.
- **Altar**: 1/3 chance per town (§9.7).
- **Commoners and chickens**: at six anchors, ⅔ chance of a commoner + house, else 2/1/0 chickens (≈2 per
  town). Each chicken killed has a **1/8** chance to summon the Chicken King.
- Look [V]: beige stone-block houses (≈4–5 tiles wide, 3–4 tall, some two-storey) with flat red roofs and a pale
  Greek-key frieze, dark square windows, wooden rail fences, chimneys puffing white smoke; ceiling lanterns.
  Music: random `tune/10`–`tune/12`.
- Leftover hub-town code (`ReturnTown`, `LeaveTown`) from the 2013 quest-hub design is unreachable [C].

---

## 7. Enemies

`SetStats(HP, ATK, DEF, EXP, SPD, drops, GOLD, exp)`: the XP actually awarded is the **last** argument; DEF is
unused [C]. Gold = coins (1 gold each) in `Range(a, b)` with b exclusive. Drop slots roll **50% / 25% / 12.5%**,
each for 1–2 items. Contact damage = ATK. Projectile damage lives in prefabs (web values given where known).
Behaviour archetypes from the wiki "Attacks" page [S]: passive, slime (hop), charge, spider charge (fast leap),
flying charge, projectile, combo.

| Biome | Enemy (prefab) | HP | ATK | XP | Gold | Drops (50/25/12.5%) | Behaviour |
|---|---|---|---|---|---|---|---|
| Forest | Pig (`e/pig`) | 7 | 1 | 2 | 2–5 | Raw Meat / Hide / Pelt | Passive wanderer |
| Forest | Green Slime (`e/slime`) | 10 | 1 | 3 | 5–14 | Herb / Bone / HP Potion | Hops forward or back at random; emissive green [SS] |
| Forest | Bee (`e/wasp`) | 25 | 2 | 8 | 5–14 | Bone / Pelt / Hide | Flying, homing |
| Forest | Beehive (`haz/beeHive`) | prefab | — | — | — | — | Spawns a bee every 4th hit; burst on destroy |
| Forest | Green Spider (`e/spiderGrass`) | 20 | 2 | 6 | 5–14 | Web ×3 | Leap-charge when the player is within 35 u |
| Forest | Boar (`e/boar`) | 35 | 2 | 11 | 5–14 | Meat / Bone | Charger |
| Swamp | Slug (`e/snail`) | ? | ? | ? | ? | ? | Passive |
| Swamp | Tiki Clubsman (`e/Gob`) | 15 | 2 | 4 | 6–19 | Hide / Pelt / Poison | Charger |
| Swamp | Tiki Mage (`e/chief`) | 15 | 2 | 15 | 10–24 | Meat / Bone | One aimed shot (0.7 s wind-up, 1.2 s rest) |
| Veldt | Sheep (`e/sheep`) | 7 | 1 | 2 | 2–5 | Meat / Bone / Pelt | Passive |
| Veldt | Jumping Shroom (`e/shroomBaby`) | 15 | 4 | 7 | 5–14 | Pelt / Hide / HP Potion | Hopper |
| Veldt | Shroom Soldier (`e/shroom`) | 50 | 4 | 4 | 6–19 | Hide / Pelt / Poison | Approaches and melees |
| Veldt | Shroom Mage (`e/shroomMage`) | 46 | 6 | 10 | 10–24 | Meat / Bone | One aimed shot, 1 s rest |
| Veldt | Jellyfish (`e/jelly`) | 50 | 1 | 8 | 6–19 | — / HP Potion / **Jelly Blade** | Flying; fires jelly fire |
| Cave | Purple Spider (`e/spider`) | 45 | 4 | 17 | 5–14 | Web / Web / Hide | Leap-charge within 35 u; packs of 3–6 [V] |
| Cave | Bat (`e/bat`) | 25 | 2 | 8 | 5–14 | — / HP Potion / Poison | Flying, homing |
| Dungeon | Skeleton Warrior (`e/sKnight`) | 55 | 7 | 20 | 6–19 | Poison (12.5%) | Charger; giant greatsword [V] |
| Dungeon | Skeleton Archer (`e/sArcher`) | 15 | 2 | 15 | 10–24 | Meat / Bone | One aimed arrow (0.9 s wind-up, 2.5 s rest); 1–2 dmg [S] |
| Dungeon | Minotaur (`e/mino`) | 85 | 7 | 40 | 6–19 | Pelt / HP Potion / HP Potion | Charge + roar |
| Dungeon | Genie (`e/djin`) | 85 | 6 | 10 | 10–24 | Meat / Bone | Hovers; 3 fireballs 0.3 s apart, 2 s glide, 1.5 s rest; 8 ranged / 4 melee [S] |
| Tundra | Rabbit (`e/bunny`) | ? | — | ? | ? | ? | Passive |
| Tundra | Blue Slime (`e/slimeIce`) | 15 | 2 | 6 | 5–14 | Shroom / Herb / Mana Potion | Hopper |
| Tundra | Ice Fairy (`e/fairy`) | 90 | 4 | 8 | 5–14 | HP Potion / Poison | Flying, homing |
| Tundra | Ice Knight (`e/iceKnight`) | 35 | 4 | 4 | 6–19 | Poison | Approaches and melees |
| Quarry | Crystal Bat + Crystal Slug | prefab | | | | | Spawned as a pair |
| Quarry | Crystal Golem (`e/golem`) | 35 | 3 | 4 | 6–19 | Hide / Pelt / Poison | Charger |
| Volcano | Whelp (`e/whelp`) | 150 | 6 | 10 | 10–24 | Meat / HP Potion / Pelt | Flying; 3 aimed fireballs then a dash |
| Volcano | Red Skeleton (`e/skeletonRed`) | 55 | 7 | 20 | 6–19 | Poison | Charger |
| Volcano | Fire Ox (`e/lavaBison`) | 150 | 6 | 10 | 10–24 | Meat / Hide / Hide | Charger; the only enemy using DEF (2) |
| Crater | Cosmic Skeleton (`e/skelCrater`) | 80 | 7 | 45 | 6–19 | Poison | Charger |
| Crater | Space Butterfly (`e/butterfly`) | 105 | 5 | 50 | 6–19 | Poison | Flying; drops a projectile every 0.8 s |
| Lair | Ghoul (`e/ghoul`) | 100 | 5 | 8 | 6–19 | Poison | Flying; shot every 1.5 s |
| Lair | Scourge Worm (`e/blueWorm`) | 100 | 6 | 10 | 10–24 | Meat / Bone | Waits 2–4 s, then lunges or relocates within ±8 u |
| Lair | Fallen Knight (`e/fallenKnight`) | 30 | 6 | 10 | 10–24 | Meat / Bone | Roars 1.2 s, then lunges at 10 u/s for 0.3 s |
| Any (D7+) | Mimic (`e/mimic`) | 80 | 3 | 4 | 6–19 | Diamonite Bar / Luminous Leather / Refined Leather | A chest (1/8 from `districtLevel` > 5) that leap-charges |
| Ore spots | Rock Crab (`e/OreSpider`) | 15 | 2 | 4 | 6–19 | Ironite Ore ×3 | Charger disguised as ore |
| Town | Chicken (`e/chick`) | 7 | 1 | 2 | 2–5 | Raw Chicken | Passive |

All [C] (names [C~]). Cut or unused in the final build [C]: Gator, Bear, Octopus, Ghost, segmented Worm,
Skeleton Mage, plain Skeleton, "Scourge Head" (`ScourgeScript`, 10 HP homing flyer with no spawn site), Abyssal
Titan, Scourge Dragon. The Wolf is a summon.

**Sizes** (art px) [SS][V]: slime 8–10×7, pig ≈10–12×8, rabbit ≈6–8×6, purple spider 16–18×12, yeti
≈16–20×14–15, skeleton ≈10×12–13 (greatsword ≈24 long), whelp ≈24×20, Tyrannox ≈40×24, giant worm segments
≈16–18 px, longer than a screen.

---

## 8. Bosses

The wiki's "12 bosses" are all live in code [C]. Bosses are **random spawns tied to slot rolls**, not
guaranteed boss districts. Only the Wall is guaranteed. All except the Wall use co-op scaling (§5.9). One
**shared boss music track** plays for every boss and for the invasion [C].

| Boss | Biome | Spawn trigger | HP / ATK / XP / gold | Attacks and movement | Reward / hat |
|---|---|---|---|---|---|
| Tyrannox | Forest | Forest enemy roll, 1/34 (≈0.4% per slot) | 100 / 3 / 40 / 6–19 | Within 30 u: wait 1 s, roar 1.3 s, charge 6 u/s for 3 s. Every 3 s, if damaged: ⅓ chance to roar + a 6-rock meteor rain (±20 u, from 35 u up, 0.3 s apart) | Hide / Pelt / HP Potion; Tyrannox Hat 1/5 |
| Percyl (penguin pirate) | Forest | Slot 0 → ⅓, only D≥2 | 600 / 4 / 200 / 6–19 | ⅓ leap-dash (vy 5, then vx 25 bursts ≈1.1 s), else charge | Hide / Pelt / Poison; Pirate Hat (2× gold): the hat's unlock text names Percyl [C][S], though one code pass mapped its `bossID` to the Commander [C~] |
| Yeti (`e/bigYeti`) | Tundra | Enemy roll, 3/50 | 150 / 4 / 40 / 6–19 | Charge 2 s; when hurt, ½ chance to roar + throw 3 arcing snowballs | Poison |
| Ice Queen (`e/fQueen`, also "Fairy Queen") | Tundra | Slot 0 chest + ⅓ | 850 / 4 / 350 / 20 | Hovers, tracks the player (5 u/s x, 4 u/s y), passes through walls [S]; after 20 s summons a fairy every 5 s, max 8 | Ice Gem ×3; Frost Crown (guaranteed) |
| Broodmother | Cave | Every 3rd spider egg broken; spawns 50 u above the player. Also the Spider Egg hat (10% on hit) | 400 / 3 / 150 / 5–14 | Flying: aim 0.5 s, dash 10 u/s for 2 s **through terrain**, rest 0.5 s | HP Potion ×2 / Shroom; Spider Egg hat 1/5 |
| Skeleton King (`e/king`) | Dungeon | Chest slot + ⅕ | 600 / 8 / 700 / 10–24 | Hovers 3–9 u above its slot; within 50 u: 1 aimed fireball, then glides at the player 8 u/s for 2 s | Meat / Bone / Pelt; Skeleton King Hood (guaranteed) |
| Black Dragon | Volcano | Chest slot + ½ | 1000 / 8 / 700 / 10–24 | Within 50 u: 3 fireballs (aim offsets 0, +10, +20), dash 6 u/s, rest 1.5 s | Meat / Bone / Pelt; Black Dragon Hat (guaranteed) |
| Crystallized Hero (`e/scourgeKnight`) [C~] | Quarry | Slot 0–1 → ⅓ | 200 / 3 / 15 / 10–24 | ¼ chance to jump; aims, fires 1 shot; rest 1.8 s | HP Potion ×3 |
| Space Commander | Crater | Enemy roll, 1/45 | 1500 / 7 / 450 / 6–19 | Ground walker; hops/strafes ±4 u within 40 u; aimed shot every 3 s | Poison |
| Chicken King | Town | 1/8 per town chicken killed; spawns at (0,0) | 300 / 2 / 40 / 6–19 | Tyrannox clone: charge + roar, ⅓ chance to jump (vy 35) every 2.5 s | Big HP Potion ×3 |
| Spirit Knight Axelark III (`e/ghostKnight`) | Any non-town | Use a **Spirit Gem** (2000 g, item shops from D15); spawns 18 u above the player | 4000 / 5 / 40 / 6–19 | Flying: charge 13 u/s for 1 s, rest 1 s; 2 orbiting ghost swords, a 3rd below 1000 HP (wiki: "three spinning blades, 7 dmg") | Big HP Potion ×3; Spirit race (guaranteed) |
| **Scourge Wall** (final) | Lair (and every district in Madman) | Spawns at (−15, 0) when the Lair loads | **4500 + 700N** | Fills the screen height, advances right at **1.5 u/s (12 px/s)**, 3 in Madman; tracks the target's height at 1 u/s within ±1 u. Contact 75 dmg + shove vx 40. Volley every 4–6 s: 0.7 s wind-up, then 5 pairs of balls 0.3 s apart (10 projectiles, ≈5 dmg each [S]) at varied speeds; balls despawn after a distance [S] | Win; Hero Crown (guaranteed); flawless win → Overworld Helm; Remnant race roll (20%) |

Resolved HP conflicts: Skeleton King 600 (wiki 1000), Black Dragon 1000 (wiki 500/800), Commander 1500 (wiki
1700), Tyrannox 100 Forest (one summary: 300 Quarry, a confusion with the Crystallized Hero), Wall 4500 (wiki
4000) [C]. Wall advice: clear the floor first; ranged and mage builds favoured; melee "an absolute nightmare"
[S+].

---

## 9. Items, crafting and economy

### 9.1 Inventory [C][SS]

31 slots: 0–4 hotbar, 5–19 backpack (5×3), 20 head (IDs 700–799), 21 body (800–899), 22 shield (900–949; the
screenshot's "feather-like" slot [G]), 23 ammo (arrows 52–56), 24–25 rings (950–957), 26–27 craft inputs,
28–30 temp. **Stack cap 99** for materials; gear (ID ≥ 500) does not stack and has durability. The inventory
**does not pause** the game; the camera centres on the player while it is open.

### 9.2 Gathering [C]

| Source | Tool | Yield | Modifiers |
|---|---|---|---|
| Tree | Any axe (also the Scourge Blade) | Wood + Wooden Stick | Woodcutter trait: 50% no durability loss |
| Ore node (2 hits) | Pick with power > tier + 1 | Always 2 Stone, 1/5 Coal, plus the ore if the pick is strong enough | Miner Cap: ¼ chance of an extra ore per hit; Miner trait: 50% no durability loss |
| Plant (hit) | Anything | Herb, Shroom or Root; web grass → Spider Web | Gatherer: 2× ingredients; Gatherer Headband: 25% random bonus item |
| Bug spot | **Bug Net** | Fire / Thunder / Ice Bug, ⅓ each | Mage builds need all three |
| Animals, enemies | — | Meat, Raw Chicken, Monster Bone / Hide / Pelt, Spider Web, Vial of Poison | Drop table §7 |

Ore tiers: 0 Ironite (grey), 1 Goldium (gold flecks), 2 Diamonite (cyan), 3 Crystalite (Lair only). Tiers 4–6
(Dragonite, Adamantite, Obsidian) never spawn [C].

### 9.3 Two-item crafting [C][S+]

1. Open the inventory, **Shift+click item A, then item B**. The pair is unordered. Selecting the same slot
   twice cancels, so "Wood + Wood" needs **two separate stacks** of wood.
2. **No recipe book, no crafting table** for player crafting. Recipes are discovered or looked up on the wiki
   (a frequent complaint) [C][S+]. The tutorial line reads "SHIFT + CLICK TWO ITEMS TO CRAFT. TIP: TRY WOOD +
   WOOD" [SS]. Invalid pairs silently do nothing.
3. **Material results (ID < 500) consume whole stacks**: output = min(qty A, qty B) × multiplier (×5 for
   arrows). The larger stack keeps the remainder.
4. **Gear results (ID ≥ 500)** consume one of each, come out at max durability onto the cursor, then roll
   **forge luck**: r = 0–99 against L = 6 (12 with Artisan). r < L/2 → tier 3 (magenta, 4 bonus rolls);
   r < L → tier 2 (yellow, 2 rolls); r < 2L → tier 1 (cyan, 1 roll); else tier 0 (white). Each bonus roll
   adds +1–2 to a random stat. Odds: 3% / 3% / 6% normally, doubled with Artisan.
5. Potion Brewer trait: 50% chance a basic potion comes out Big.

**Complete player recipe list (final build)** [C] (2014 Reddit posts match it except "Stone Slab" was later
renamed "Refined Stone" [S]):

| Line | Recipes |
|---|---|
| Wood | Wood + Wood → Plank · Plank + Plank → Wooden Blade · Plank + Stick → Sword Hilt · Stick + Stick → Axe Handle · Axe Handle + Stick → Pick Handle · Pick Handle + Stick → Unstrung Bow · Unstrung Bow + String → Wooden Bow · Hilt + Wooden Blade → Wooden Sword · Axe Handle + Wooden Blade → Wooden Axe · Pick Handle + Wooden Blade → Wooden Pick |
| Blades | Stone + Stone → Refined Stone · Refined Stone ×2 → Stone Blade · Stone Blade ×2 → Stone Great Blade · Monster Bone ×2 → Refined Bone · Refined Bone ×2 → Bone Blade · X Bar ×2 → X Blade · X Blade ×2 → X Great Blade (X = Ironite, Goldium, Diamonite) · Crystalite Fragment ×2 → Crystalite Shard |
| Assembly | X Blade + Hilt → X Sword · + Axe Handle → X Axe · + Pick Handle → X Pick · X Great Blade + Axe Handle → X Great Axe (X = Stone, Bone, Ironite, Goldium, Diamonite; no Bone great axe). Oddity: Monster Bone + Bone Blade → Bone Axe |
| Arrows (×5) | Stick + Refined Bone / Refined Stone / Ironite Bar / Goldium Bar / Diamonite Bar → Bone / Stone / Ironite / Goldium / Diamonite Arrow |
| Magic | Fire Bug ×2 → Fire Gem · Thunder Bug ×2 → Thunder Gem · Ice Bug ×2 → Ice Gem · Gem + Stick → Fireball / Bolt / Frostshard staff · Zweihander + Ice / Fire / Thunder Gem → Icebrand / Firebrand / Thunderbrand |
| Potions | Herb ×2 → HP Potion · Shroom ×2 → Mana Potion · any two **different** of Herb / Shroom / Root → Mysterious Potion · each potion ×2 → its Big version |
| Utility | Spider Web ×2 → String · String ×2 → Net · Net + Stick → Bug Net · Coal + Stone → Firestarter · Plank + Refined Leather → Tribal Drum · Tribal Drum + Fire / Thunder / Ice Bug → Drum of Strength / Dexterity / Wisdom · Monster Hide ×2 → Refined Leather · Monster Pelt ×2 → Refined Cloth |

Beginner path [S+]: chop ≈10 wood → planks → wooden blade → wooden sword and pick → stone tools.

### 9.4 Town crafting stations [C]

NPCs act as stations with 2 input slots (refining) or 3 (gear); no gold cost.

| NPC | Line | Recipes |
|---|---|---|
| Blacksmith ("Smelt your ores!") | Ore → bar, metal gear | Ore ×2 → Bar (Ironite, Goldium, Diamonite). 3 of a material (Ironite / Goldium / Diamonite bars, Refined Stone, Refined Bone) → Helm, Armor or Shield |
| Leatherworker ("Refine your Monster Hide!") | DEX gear | Refined Leather + Refined Stone / Refined Bone / Ironite / Goldium / Diamonite Bar → Rugged / Tribal / Elegant / Royal / Luminous Leather; 3 leather → Cap or Cloak |
| Tailor ("Craft fancy fabrics!") | MAG gear | Refined Cloth + the same five → five Fabric grades; 3 fabric → Hood or Robes |
| Hoarder ("Sell me your treasure!") | Selling | §9.6 |

### 9.5 Equipment [C]

**Weapons** (bonus to wielder stats; durability = max uses; buy price where sold):

| Weapon | Bonus | Durability | Source |
|---|---|---|---|
| Wooden / Stone / Bone Sword | ATK +2 / +4 / +4 | 50 / 55 / 60 | Craft |
| Ironite / Goldium / Diamonite Sword | ATK +8 / +15 / +25 | 80 / 160 / 250 | Craft |
| Stone / Ironite / Goldium / Diamonite Great Axe | ATK +8 / +15 / +30 / +48 | 65 / 100 / 180 / 270 | Craft |
| Wooden Club | ATK +18 | 50 | Gear merchant |
| Zweihander | ATK +35 | 50 | Chests |
| Icebrand / Firebrand / Thunderbrand | ATK +95, MAG +10 | 180 | Craft |
| The Philibuster | ATK +55 (1-mana explosion per swing) | 65 | Volcano chests ⅙; Djinn start |
| Lightbringer | HP +5, ATK +27, DEX +5, MAG +5 | — | Special chest |
| Scourge Blade | HP +2, ATK +30, DEX +2, MAG +2 (also chops) | — | Special chest |
| Obsidian Sword | HP +5, ATK +30, DEX +2, MAG +2 | — | Chests (1/10 rare roll) |
| Emerald Katana / Combat Axe | HP +2, ATK +11 | — | Chests; Lizardman start |
| Laser Sword | ATK +75 | — | Crater chests |
| Jelly Blade | HP −3, ATK +100 | 100 | Jellyfish drop 12.5% |
| Wooden Bow | (uses DEX) | 100 | Craft |
| Fire Bow / Crystal Bow / Laser Crossbow | DEX +3 / DEX +6 / DEX +15 MAG +15 | — | Special chest / Quarry chest / Crater chest |
| Staves | — | 50 (Summon Zombie 300) | Craft (200 g at merchants) |
| Axes, picks (Wood → Diamonite) | none | 50 / 55 / 60 / 80 / 160 / 250 | Craft |

**Armour** (head + body + shield; three stat families):

| Tier | Helm / Armor (ATK) | Cap / Cloak (DEX) | Hood / Robes (MAG) | Shield |
|---|---|---|---|---|
| Stone / Bone (Rugged / Tribal) | HP +1, ATK +2 | HP +1, DEX +2 | HP +1, MAG +2 | HP +1 |
| Ironite (Elegant) | HP +2, ATK +4 | HP +2, DEX +4 | HP +2, MAG +4 | HP +2 |
| Goldium (Royal) | HP +3, ATK +6 | HP +3, DEX +6 | HP +3, MAG +6 | HP +3 |
| Diamonite (Luminous) | HP +4, ATK +9 | HP +4, DEX +9 | HP +4, MAG +9 | HP +4 |

Special shields: Ryvenrath's Scale (HP +5, +2 ATK/DEX/MAG), Paladin Guard (HP +5, ATK +2, MAG +5), Scourge Shield
(HP +3, ATK +5, DEX +5). **Rings** (2 slots; chests 1/7): Power ATK +5, Wisdom MAG +5, Nature DEX +5, Life HP +5,
Rage HP −2 ATK +8, Insanity HP −2 MAG +8, Archer's HP −2 DEX +8, Balance +2 all.

**Durability** on all gear; lost on hits and on chopping/mining; "Your <item> is about to break." warning;
**no repair exists** [C][S+].

### 9.6 Consumables [C]

| Item | Effect |
|---|---|
| Raw Meat / Raw Chicken | +1 hunger. Using it while standing in a campfire converts **one** to cooked instantly |
| Cooked Meat / Cooked Chicken | +3 / +4 hunger, 50% chance +1 HP |
| Firestarter (Coal + Stone) | Places a campfire for **20 s** (0.5 s wind-up) |
| HP Potion / Big | +2 / +5 HP |
| Mana Potion / Big | +3 / +7 mana |
| Mysterious Potion / Big | ⅓ each: +10 HP, +10 mana, or thrown poison (Big: 15 / 15 / poison) |
| Vial of Poison | Thrown; 6 s cloud (§5.7) |
| Drum of Strength / Dexterity / Wisdom | Area pulse: +10 ATK / DEX / MAG for 15 s to every player in range (stacks); drumDEX only affects bows, drumMAG only spell damage |
| Total Biscuit | +3 max HP, +3 max MAG for the run, +3 HP now |
| Crystalite Shard | Light-blast projectile (150 dmg [S]) |
| Spirit Gem | Summons Axelark III (not in towns) |

Eating takes a 0.5 s wind-up, is refused at full hunger, and every food spawns a cosmetic "poop" object [C].
"Cooked Food Trivializes the Game" was a Steam thread title [S].

### 9.7 Gold, shops, selling, altars, chests [C]

- **Gold**: coins worth 1 each (Pirate Hat ×2), from enemies (2–25), chests, and the Pickpocket trait.
- **Merchants**: 4 items each. Item merchant: 4 random IDs 1–55 ×1–3 (Mystery Key, Root, Total Biscuit swapped
  for HP Potion); slot 0 becomes the Spirit Gem from D15. Gear merchant: 4 random gear IDs 500–519 (wood/stone/
  bone tools and weapons, Wooden Bow, Wooden Club). **Buy price = table price × 2** (Wood 10, Ironite Bar 60, HP
  Potion 40, Diamonite Sword 1400, Diamonite Great Axe 2000). Lines: "Waddya buyin', stranger?", "It is
  dangerous to go alone! Buy something." TV Tropes notes "teaser equipment" you can't afford yet [S].
- **Selling**: drop items on the Hoarder's sell box; **flat** 2 g (60%), 3 g (30%) or 4 g (10%) per unit;
  wood, plank and stick 1 g. Selling is a surplus dump, not value-based.
- **Altars**: 1/3 of towns; **500 g**, once per town; one of 8 equally likely outcomes **fixed at spawn and
  shown by the altar's sprite** (`altar0`–`altar7`): +5 ATK · −1 max HP (only removes an earlier altar bonus)
  · +2 all stats · −1 HP (not below 1) · full heal · nothing · +5 DEX · nothing. Four gods (Ryvenrath strength,
  Maalurk shadow, Eoqueth purity, Pegelda justice), one good and one bad outcome each. Added in 1.4 [S].
- **Chests** (hit to open): 2–3 random items (IDs 1–55) + coins; golden chests (1/8 of chests) give 3–6 and
  need the Lockmaster trait in the final build; biome bonuses (Volcano ⅙ Philibuster, Quarry ⅙ Crystal Bow,
  Dungeon ⅙ Ryvenrath's Scale, Crater ⅕ Total Biscuit); 1/7 ring; 1/10 rare weapon; a Zweihander roll; a rare
  "isTwo" chest gives one of six legendaries. Mimics replace 1/8 of chests from combat D7. Chests burst with
  yellow sparkles and "+1 ITEM" texts [V].

---

## 10. Progression

### 10.1 Character creation [C]

Fields: Name (≤10 chars), Head/hair style (14), hair Colour (3), Body/outfit (6), Race, Variant (race colour
variant), Hat, Companion, two Traits, Difficulty, stat roller, Randomize [C]. A random backstory line is
generated ("<Name>'s <relation> was a <adjective> <job>…"). Random names come from syllable tables (Wys, Rath,
Gar, Syv… + gar, wulf, hart, even, vand…) giving names like RALVAND [C][V].

**Stat roll**: every stat starts at 3; two different "good" stats get +1 (shown **green**); one "bad" stat gets
−1 (shown red; it can coincide with a good one); then HP +2. Always **15 points**, HP 4–6, others 2–4. "Stats"
rerolls [C]. (Web "15 random points" was the right total, wrong mechanism.)

### 10.2 Races [C][S+]

15 races, Peon default; up to 3 colour variants each, unlocked by re-earning the race.

| Race | Stats | Start items | Unlock (end-of-run roll) |
|---|---|---|---|
| Peon | HP +1 | Wooden Axe + 2 random materials | Default |
| Noble | HP +1, MAG +1 | Stone Axe | 20%: 15 kills in a run |
| Orclops | HP −1, ATK +2 | Bone Sword, Bone Pick | 20%: mine 20 ores |
| Dwelf | HP −1, DEX +4 | Wooden Axe, Wooden Bow | 20%: first skill |
| Crusader | ATK +1 | Wooden Axe, Stone Great Axe, 1 random | 20%: second skill |
| Remnant | HP −1, MAG +4 | Wooden Axe, Bolt staff | 20%: beat the game |
| Trogon | DEX +3 in text, **DEX +1 applied** (bug) | Wooden Axe, Big HP + Big Mana Potion | 100%: win in under 1 hour |
| Earthkin | ATK +1, DEX +1, MAG +1 | Wooden Axe, Bone Armor | 20%: reach district 10 |
| Pigfolk | all −1 | 3 Raw Meat, **no axe** | 100%: win without using an HP potion |
| Qualogg | ATK +2, DEX +2 | Wooden Axe, Bug Net, Raw Meat | 100%: win without crafting |
| Bandicoot | ATK +1, DEX +3 | Wooden Axe, Ring of Balance, Ring of Power | 50%: visit the Crater |
| Djinn | MAG +3 | Wooden Axe, The Philibuster, Fireball staff | 100%: win killing only 1 enemy |
| Lizardman | ATK +1, DEX +3, MAG +1 | Stone Pick, Emerald Katana | Name the hero "Roguelands" |
| Scourgeling | MAG +4 | Summon Zombie staff | 100%: 20 golden chests opened (lifetime, Lockmaster only) |
| Spirit | HP +7, ATK +3 (was HP +5 ATK +15 before v2.0) | Goldium Sword, Wooden Axe | Defeat Axelark III |

Base meters therefore vary by race: screenshots show HP 2 / MP 8 casters vs HP 5 / MP 4 fighters [SS].

### 10.3 Experience and level-up [C]

- XP orbs (worth 1, 8 or 20) drop from kills; XP and gold are **per player**.
- **XP to next level = 8 + 5·(L−1) = 5L+3** (Lv1 8, Lv5 28, Lv8 43, Lv10 53). Overflow XP is lost.
  **Conflict:** the owner's screenshot shows "Lv.8 15/92" [SS], which fits 8 + 12·(L−1) instead (an older build
  or a misread) [G]. The HUD format `cur/max` is certain; the curve is a tuning choice.
- **Stat growth is a fixed cadence on the new level**: good stats +1 on even levels; the bad stat +1 every 4th
  level; neutral stats +1 every 3rd level; an HP gain also heals 1. Hats can add a ⅓-chance extra +1; Flame of
  Hope adds +1 random every level. A floating "LUP" text shows each gain; a pale vertical light beam and
  "LEVEL UP!" mark the event [C][V].
- Skills at 5/10/15 (§5.8). Levels go well past 15 (a companion needs Lv40); no level cap.

### 10.4 Traits (pick 2 different; ◀ ▶ selectors) [C]

Earlier builds rolled traits randomly with the stats [S]. Final-build effects (in-game text in quotes where it
lies):

| Trait | Effect |
|---|---|
| Woodcutter | 50% no axe durability loss ("chops quicker") |
| Miner | 50% no pick durability loss ("mines faster") |
| Gatherer | 2× gathered ingredients (menu says 50% chance) |
| Potion Brewer | 50% chance to craft the Big potion (the community's favourite) |
| Artisan | Forge luck 6 → 12 ("+10 LCK") |
| Aggressive | **ATK +2, DEX −1** (menu "−1 DEF", in-game "−1 HP": both wrong) |
| Defensive | HP +4, ATK −1 |
| Swift | DEX +2 |
| Healthy | HP +2 |
| Big Eater | Hunger cap 8 → 12 |
| Intelligent | **MAG +4** (text says +2) |
| Lockmaster | Opens golden chests without a key |
| Pickpocket | Chance to steal gold when walking past NPCs (newest) |

Trait badges are ≈18–20 px rounded squares in a fixed colour per trait with a white glyph (§ art-direction).

### 10.5 Hunger and survival [C]

Max 8 (12 with Big Eater); starts full; **−1 every 60 s** in every biome; **no drain in towns** (nor while
downed). At 0 each 60 s tick deals 1 damage. Messages: "Your stomach begins to grumble." at 3, "You are
starving." at 0. Build A showed hunger 10 → 20 at Lv2 and overfill above max [V], cut later.

### 10.6 Hats (24; one equipped) [C]

| Hat | Effect | Unlock |
|---|---|---|
| Gatherer Headband | 25% bonus item when gathering | 20%: gather 10 plants |
| Miner Cap | 25% extra ore per hit | 20%: mine 10 ores |
| Berserker Scarf | ⅓ chance +1 ATK on level-up | 100%: 10 kills in one biome |
| Robin Hood Hat | ⅓ chance +1 DEX on level-up | 20%: shoot 100 arrows |
| Magician Hat | ⅓ chance +1 MAG on level-up | 20%: craft any staff |
| Bunny Ears | Triple jump | 20%: visit Tundra |
| Bat Wing | +10 dash speed | 20%: visit Cave |
| Tyrannox Hat | Bare-hand toxic meteors (1 mana) | 20%: kill Tyrannox |
| Wasp Glasses | +4 speed, slow fall | 20%: destroy a beehive |
| Tiki Mask | Each level load: 50% +3 HP / 50% −1 HP | 20%: visit Swamp |
| Wizard Beard | ⅔ of casts free | 100%: three Mage skills |
| Hero Crown | ⅓ chance +1 random stat on level-up | 100%: beat the game |
| Shroom Hat | 20% chance to drop an ingredient when hit | 20%: visit Veldt |
| Spider Egg | 10% on hit: spawn a Broodmother | 20%: kill Broodmother |
| Skeleton Mask | Crit 26% | 20%: visit Dungeon |
| Dragon Hat | Bare-hand fireball (1 mana) | 20%: visit Volcano |
| Scourge Mask | Curse: −1 HP every 2 min | 20%: visit the Lair |
| Frost Crown | 20% +1 HP per mana regen tick | 100%: kill Ice Queen |
| Viking Helm | 10% on attack: giant axe for 2× ATK | 100%: three Warrior skills |
| Black Dragon Hat | Dashes and extra jumps cost no stamina | 100%: kill Black Dragon |
| Skeleton King Hood | Bare-hand summon skeletons (1 mana) | 100%: kill Skeleton King |
| Pirate Hat | 2× gold | 100%: kill Percyl |
| Sean's Head | None (dev thank-you) | Code menu (L) |
| Overworld Helm | **Halves all damage taken** (community: the best hat) | 100%: win without taking damage |

Kickstarter extras via the L code menu: Bear Hat, Cat Form, an emote, a death animation, titles [C][S+].

### 10.7 Companions (9; one per hero; hover beside the player) [C]

| Companion | Effect | Unlock (100%) |
|---|---|---|
| Regen Fairy | +1 HP each level load | Reach district 15 |
| Ancient Bat | Occasionally spits out a random item (outside towns) | Beat the game |
| Haste Beetle | Speed ×2 | Reach level 40 |
| Gadget Guard | Spinning blade while air-dashing (ATK/2) | Win under level 5 |
| Gorgon Eye | +1 mana every 1.5 s | Win without talking to NPCs |
| Floaty Slime | Gravity off (float with Down/Interact) | Win without chopping a tree |
| Gooey Ghost | Infinite free double jumps | Craft all 3 elemental greatswords in one run |
| Flame of Hope | +1 random stat every level-up | Win with Ryvenrath's Scale equipped |
| 4th Age Droid | Float + speed (×3 on scene start) | Win in Madman Mode |

### 10.8 Meta-progression [C][S+]

No permanent power: unlocks are side-grades. Each unlock condition met during a run becomes a **reward chest**
on the run-end screen ("NEW RACE UNLOCKED!", "NEW HAT UNLOCKED!", "NEW COMPANION UNLOCKED!", "NEW VARIANT
UNLOCKED!"), opened with its % roll (20% typical; 100% for hard feats; 50% Bandicoot). Lifetime stats are saved
(Characters Created, Enemies Defeated, Gold, EXP, Items Crafted, Trees Chopped, Ore Mined, Resources Gathered,
Foods Eaten, Chests Opened, Quests Completed (unused), Items Bought, Bosses Defeated). 56 Steam achievements
[S]. The 2013 design had a persistent hub town that leveled up across deaths and repeatable quests; it was
dropped before 1.0 [S][C].

---

## 11. Multiplayer

| Aspect | Original behaviour | Tag |
|---|---|---|
| Players | Up to 4; co-op campaign, host-toggled PvP (1.4) | [S+][C] |
| Connectivity | Host / Connect with IP and port (**7777**); LAN; Hamachi; **no Steam matchmaking**; port forwarding required | [S+][C] |
| Engine | Unity legacy networking (`Network.Instantiate`, RPC); host spawns enemies (`Network.isServer`) | [C] |
| Camera | Each client follows only its own player; no shared camera, no zoom-out, no off-screen markers | [C][V] |
| Downed | HP ≤ 0 → downed: sprite lies flat, red "!" above, HUD HP 0/N; cannot be hit, does not bleed out, no hunger loss | [C][V] |
| Revive | A teammate in the revive box presses Interact once → 3-2-1 countdown (3 s) during which the helper is frozen → revived at **HP 1** | [C] |
| Level change while downed | Auto-revive at HP 1, **gold set to 0** | [C] |
| Run end | When all players are downed at the same time (host counts, 2.2 s delay) | [C] |
| Doors | First player to interact moves everyone 1 s later via that door | [C] |
| Loot | **Per client**: each client spawns and rolls its own coins, XP orbs and item drops; chests and plants spawn local copies | [C] |
| PvP | Players hurt by melee (with knockback), spells, arrows, thrown axe, player hazards. **Poison clouds always hurt every player** (friendly fire) | [C] |
| Scaling | Enemies +50% HP / +40% ATK per extra player; Wall +700 HP | [C] |
| Reputation | Chronic lag, desync, non-host crashes, item duplication; 1.4.5 "HUGE improvements"; players downgraded for stable multiplayer; fan patch 2.1 fixed desync/dupes | [S+] |

---

## 12. UI and HUD (summary; full layout spec in `art-direction.md`)

- **HUD** [SS]: top-left `Lv.N`, a green XP bar with `cur/max`, coin icon `xN`; below it a 5-slot hotbar with a
  light-grey selected border, stack counts bottom-right, small green durability bars. Top-right a 2×2 grid of
  meters (`cur/max` text above a two-tone bar plus an icon): HP red heart, Mana blue/cyan gem, Hunger brown
  drumstick, Stamina yellow bar with an orange boot. **Bar width ∝ the meter's max** (0.2 u per point for
  HP/mana, 0.3 u for hunger/stamina) [C], bars right-aligned against the icon. District title under the meters
  in yellowish text. HUD is never darkened.
- **Inventory** [SS]: translucent dark brown panel over the left of the screen; hotbar row; equipment columns
  (helm, chest, ring | ammo, shield, ring); character card (name, HP/ATK/DEX/MAG); two square buttons (gold
  lightbulb, pink heart; function unknown); 5×3 backpack; the Shift+click tip; tooltip shows the name coloured
  by forge tier (white/cyan/yellow/magenta), "Durability: x/y", "+ N ATK" lines in green (red if negative)
  [C][SS].
- **Messages** [C]: centred white TextMesh lines ("You feel uneasy.", "There is a foul taste in the air.",
  "<Name> has fallen.", item-break and hunger warnings, "+1 ITEM" pickup texts, white damage numbers floating
  up ≈1 s, "+N HP"/"+N Mana" popups, crit text).
- **Menus** [C]: title with logo; Singleplayer / Multiplayer (Host, Connect, IP, Port, PvP); Normal vs Madman;
  Options (Sound, Graphics, Fullscreen, Resolution); Stats; Cards; Credits; social links; character slots
  (Create, Delete); character creator; pause (Resume, Options, Menu, Quit); run end (stats → reward chests →
  Again).
- **Camera** [C]: target = **midpoint of the player and the mouse cursor's world position**; follow
  `pos = lerp(pos, target, dt × 2)` (≈0.5 s time constant, sub-pixel); centred on the player while the
  inventory or a menu is open. One "shaake" clip on every player melee hit; no shake on damage. The trailer's
  early build looked hard-centred [V]. View ≈42.7×24 u at 16:9 (orthographic size 12; 13, 14.5, 15.2 for 16:10,
  4:3, 5:4); **non-integer** pixel scaling in the original.

---

## 13. Audio [C]

- **Music**: one looping track per biome, `tune/<index>` (0 Forest … 9 Crater); towns pick a random
  `tune/10`–`tune/12`; `tune/12` doubles as the victory theme; **one shared boss theme** `tune/boss1`, also
  triggered by the Scourge invasion; the previous track resumes after a boss. **Hard cuts** (stop, swap, play
  after 0.5 s); no crossfades. ≈14 cues in total. Composer not found; the OST was a $40 Kickstarter tier [S].
  Style reportedly retro/chip-flavoured [K-low].
- **SFX** (`Resources/Au/`): swipe (melee hit), chop, mine, gather, netSwing, break, pickup, JUMP, JUMP2, eat,
  drink, drum, poop, invOpen, invClose, CLICKh (hover), CLICK, PURCHASE, FAIL, SKILL, altar, madman; per-object
  attack, melee, dash, move, fire, crafted, levelUp, logo and select cues.

---

## 14. Development history (condensed)

| Date | Event | Tag |
|---|---|---|
| Jul–Sep 2013 | IndieDB devlogs: multiplayer working, hub town + quests design, lighting, level generator | [S] |
| Oct 10 – Nov 19, 2013 | Kickstarter: $16,308 / 674 backers; $5k stretch doubled item count and added per-weapon-type attack animations (heavier = slower, harder) | [S+] |
| Feb 11, 2014 | Steam Early Access ($4.99) | [S+] |
| Mar 2014 | Run-end reward system, gameplay timer (the Scourge), 8 races, 17 hats | [S] |
| Jun 9, 2014 | 1.0 ($9.99) | [S+] |
| mid–late 2014 | 1.1.5 companions; **1.2.0 Crater biome** + better enemy vision; 1.3 races/companions, harder Lair; **1.4 altars, PvP, first-player door transition**; 1.4.5 lag fixes | [S] |
| ~early 2015 | 1.5: races, Chicken King, legendaries | [S] |
| Feb 27, 2015 | 1.6: multiplayer fix, Spirit Gem / Axelark III / Spirit race; billed as final | [S] |
| Aug 31, 2016 | **v2.0** "Final Update": Madman Mode, 4th Age Droid, Spirit rebalance, inventory retexture, R/Tab | [S+] |
| 2019 | Fan patch 2.1 (YewYew): multiplayer fixes, Desert enabled | [S][C] |

Later SmashGames titles: Roguelands (2015–16, the closest art sibling), Littlewood [S][K].

---

## 15. Reception → opportunities for Shardfall

| Loved | Evidence | Keep / amplify |
|---|---|---|
| Discovery crafting ("combine any two items") | Store pitch, reviews [S+] | Core pillar; make discovery rewarding (recipe log, hints) |
| Co-op chaos and revives | "Put your friendships to the test" [SS]; reviews [S+] | Core pillar |
| Tight, dodgeable movement; double jump + air dash | Capsule Computers, GameFAQs [S] | Keep the stamina-gated mobility |
| Atmosphere: dark caves, glowing life, chibi art | r/Magicite "beautiful" art [S]; screenshots [SS] | The darkness-first look (art-direction.md) |
| Replayability: races, hats, companions, traits | Reviews [S+] | Side-grade unlocks with odd, fun conditions |
| Short runs and the Scourge timer's tension | Spelunky-style pacing [S+] | Keep a timer, add telegraphs |

| Criticized | Evidence | Shardfall response |
|---|---|---|
| Netcode: lag, desync, crashes, dupes; direct IP + port 7777 | Steam/Metacritic [S+] | Host-authoritative, prediction, room codes, WebRTC P2P (architecture.md) |
| No controller support, no local co-op | Steam threads [S+] | Gamepad with twin-stick/auto-aim; shared-screen co-op (GDD §11) |
| Opaque crafting, wiki-dependent | Reddit, Cliqist [S+] | Recipe book (lightbulb), hint scrolls, "Discovered: X!" |
| Melee "a death sentence"; no block; enemies outrun the player | Steam threads [S+] | Reach/hit-stop/pogo, shield block, dash i-frames, enemy speed caps (GDD §6) |
| "Soul-crushing" spikes; 2–3 hits kill; little guidance | Cliqist [S+] | Readable telegraphs, i-frames, clearer threat signalling |
| Durability with no repair | Steam threads [S] | Repair at the smith (GDD §6) |
| Cooked food trivializes hunger | Steam thread title [S] | Tune hunger and food values |
| Thin late content; many bosses are random, easy to miss | Reviews [S]; code (random slot spawns) [C] | Guaranteed giant-monster encounters (GDD boss districts) |
| Mage underpowered early, archer dominant | Steam threads [S+] | Balance the three paths; telemetry |
| Bugs: unreliable double jump, door-skip exploit, desync | [S+] | Deterministic sim + tests; input buffering; door debounce |
| No daily/seeded runs | [S] absence | Daily Run seed (GDD §11) |

---

## 16. Contradictions resolved

| Topic | Claims | Verdict |
|---|---|---|
| Final district | Lair = D21 vs Wall in D20 | Towns count as districts: combat on odd 1–19, towns on even 2–20, D20 town has the purple door, Lair = level 21 [C] |
| Number of combat districts | "About 20" (web) | **10** combat districts + 10 towns + Lair [C] |
| Overworld map | World-enemies report guessed an FTL-style map | None; only the 3 doors [C] |
| "Toadvale Forest" | Treated as a biome name | Random prefix+suffix district title [C] |
| Boss HP | See §8 | Code values [C] |
| Co-op scaling | +700 per player vs +50%/+40% | Both: Wall +700; everything else +50% HP / +40% ATK per extra player [C] |
| Scourge invader | 500,000 HP and heals 10k/s vs 999,999 | 999,999 HP, 9,999 ATK, no healing, 5 invaders [C] |
| Stat generation | 15 random points vs base 3 ± structured | Base 3, two +1, one −1, HP +2 = 15 total [C] |
| LCK | A player stat vs forge luck only | Forge luck only (Build A had LCK as a stat [V]) [C] |
| Level-up growth | Random +1 vs cadence | Fixed cadence by good/bad/neutral stat [C] |
| Skill pick | 1 of 3 offered vs path then random | Choose path → random skill from it; at 5/10/15 [C][SS] |
| Stamina | DEX-based vs level-based | Level-based (4 → level, cap 12), +1/s [C] |
| Crusader unlock | 5% at Lv10 vs 20% second skill | 20% on second skill [C] |
| Pigfolk / Scourgeling unlock | Unknown | Win with no HP potion / 20 golden chests [C] |
| Peon, Earthkin, Trogon | Various | Peon HP +1; Earthkin ATK/DEX/MAG +1; Trogon DEX +1 applied (text +3) [C] |
| Aggressive / Defensive | −2 DEX / −1 DEF / −1 HP; −2 ATK / −1 ATK | Aggressive ATK +2 DEX −1; Defensive HP +4 ATK −1 [C] |
| Mana Potion | 2/5 vs 3/7 | 3/7 [C] |
| Mysterious Potion recipe | Shroom+Herb vs Root+Shroom | Any two different of Herb/Shroom/Root [C] |
| Spell mana | Frostshard 3 vs "all 1" | Frostshard 3, the rest 1 [C] |
| The Philibuster | +75 with explosion vs +55 | +55, explosion real (1 mana per swing); +75 is the Laser Sword [C] |
| Zweihander | +3 HP +35 ATK dur 200 vs +35 dur 50 | ATK +35, durability 50 [C] |
| Diamonite Great Axe | +50 vs +48 | +48 (forge rolls explain +50) [C] |
| Fire Bow | 2× / 1.5× / 1.25× | 1.25 × (DEX + bonuses + 7) [C] |
| Altars | 30% spawn, "major buff" | 1/3 spawn; 8 outcomes, some harmful [C] |
| Inventory key | R(+Tab) vs Tab/I | R, Tab added in v2.0 [S+]; I is a debug key in code [C] |
| Hat count / name | 17 / 24 / 26; Goggles vs Glasses | 24 hats; "Wasp Glasses"; Bear Hat and Cat Form are separate code-menu extras [C] |
| XP curve | 5L+3 (code) vs "Lv.8 15/92" (screenshot) | Unresolved; display format from [SS], curve is tuning (§10.3) |
| Red dragon in the volcano shot | Boss? | The Whelp, a regular volcano enemy (150 HP) [C~][SS] |
| Large lizard in the forest shot | Unknown boss | Almost certainly Tyrannox [G, strong] |
| Giant worm (trailer) | Boss | Early-build forest worm; cut by the final build [V][C] |
| Camera | Hard-centred (trailer) vs smooth (screenshots) | Final build lerps toward the player–cursor midpoint [C]; early build looked centred [V] |

---

## 17. Open questions

- Gravity, collider sizes (aura, drum, poison, revive box, campfire), projectile damages and rock damage
  (prefab data, not in the DLL).
- Door colours for Cave, Dungeon, Quarry, Volcano and Crater.
- Look of Veldt, Quarry, Crater and the Lair (no screenshots).
- Function of the gold lightbulb and pink heart inventory buttons.
- The real XP curve of the screenshot build.
- Vanilla v2.0 numbers where the 2.1 patch might differ (most likely only the Desert slots).
- Composer and musical style.

---

## 18. Implications for Shardfall (deltas vs `docs/design/gdd.md`)

These are differences between the original and our GDD. "Intentional" means the GDD deliberately extends
or fixes the original; "review" means the GDD was written from a web claim the code has since contradicted.

| # | Topic | Original [C] | GDD | Status |
|---|---|---|---|---|
| 1 | Run length | 10 combat districts + 10 towns + Lair (≈1 h) | 20 combat districts + towns + Lair | **Review**: doubles run length; consider 10–12 combat districts |
| 2 | Bosses | Random slot rolls; only the Wall guaranteed | Boss arena every 3 districts | Intentional (fixes "easy to miss") |
| 3 | LCK stat | Forge luck only | Player stat | Intentional extension |
| 4 | Level-up growth | Fixed cadence (good/bad/neutral) | +1 random stat | Review: the cadence gives the creation-time green/red stats meaning |
| 5 | XP curve | 5L+3 (Lv8 = 43) | "≈92 at Lv8" from the screenshot | Review: make it data-driven and tune |
| 6 | Skill pick | Choose path → random skill | Choose 1 of 3 skills (one per path) | Intentional improvement |
| 7 | Stamina | 4 → level (cap 12), +1/s | 2 + ⌊DEX/2⌋, 1 per 1.2 s | Intentional (DEX matters more); keep ≈4 at start |
| 8 | Hunger | −1/60 s; at 0 −1 HP per 60 s; none in towns | −1/50 s; at 0 −1 HP per 15 s; slow in towns | Intentional, harsher |
| 9 | Revive | Interact once, 3 s, HP 1, no bleed-out | Hold 2 s, 50% HP, 30 s bleed-out | Intentional |
| 10 | Door transition | First player, instant | 5 s countdown + vote | Intentional (fixes griefing) |
| 11 | Door rolls | Independent, duplicates allowed | No duplicates | Intentional |
| 12 | Invaders | 300–349 s (×2 in D1), 5 of them, no warning | Wraith at 5:00 (10:00 D1) with warnings | Intentional |
| 13 | Crafting quantities | Material crafts consume whole stacks (min(A,B)); arrows ×5; same item needs two stacks | "A stack combined with itself needs ≥2" | Review: adopt min-stack batch crafting, allow self-pairing |
| 14 | Physics | Instant run speed ≈61 px/s, jump 200 px/s + hold boost, double jump 216 px/s, dash 144/120 px/s for 0.3 s | `PHYS.walkSpeed 62`, `jumpSpeed 210`, accel/decel, jump-cut | Consistent; ours adds acceleration and jump-cut |
| 15 | Player knockback | None from ordinary enemy hits | Knockback | Intentional (readability) |
| 16 | Enemy scaling | None by depth; +50% HP/+40% ATK per extra player | — | Adopt the co-op scaling numbers as a baseline |
| 17 | Naming | — | `src/content/biomes.ts` uses id `toadvale_forest` / "Toadvale Forest" | **Fix**: "Toadvale" is an original-game name fragment (rule 6); use `woods` / Mossgrave Woods |

---

## Sources

**Primary, read locally**
- Magicite 2.1 fan patch `Assembly-UnityScript.dll`, disassembled/decompiled (all [C]):
  https://github.com/YewYew/MagiciteFanPatches
- Owner screenshots and verbatim Steam description: `docs/research/screenshot-analysis.md`
- Official trailer frame analysis: `docs/research/trailer-analysis.md`
- Magispec trait-roll helper (trait colours, 2015 trait list): https://github.com/onsubmit/Magispec
- RemoveScourgeInvaders BepInEx mod (invader timer IL): https://github.com/Permamiss/Magicite_RemoveScourgeInvaders
- Fan remake content list compiled from the wiki: https://github.com/Arthurgroll997/magicite (`todo.txt`)
- Magicite-Rewritten README: https://github.com/kateisprettydamngreat/Magicite-Rewritten
- r/Magicite comments 2014–2016 (HICE dataset, `CNN/raw/subreddit_Magicite.csv`): https://github.com/jayjay-park/HICE
- TV Tropes pages (archive): https://github.com/jwzimmer-zz/tv-tropes ; https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Magicite

**Web (search-result summaries; fetch was blocked)**
- Steam store and news: https://store.steampowered.com/app/268750/Magicite/ ; v2.0
  https://store.steampowered.com/news/app/268750/view/2916599926678476493 ; v2.0 hotfix
  https://store.steampowered.com/news/app/268750/view/2916599926678476389 ; 1.6
  https://steamcommunity.com/games/268750/announcements/detail/225515799670054163 ; 1.5
  https://store.steampowered.com/news/app/268750/view/2916599926678476871 ; 1.4
  https://steamcommunity.com/games/268750/announcements/detail/233383774582849379 ; 1.4.5
  https://steamcommunity.com/games/268750/announcements/detail/233383774606025399 ; 1.3
  https://store.steampowered.com/news/app/268750/view/2916599926678477253 ; EA launch
  https://store.steampowered.com/oldnews/12383
- Fandom wiki: https://magicite.fandom.com/wiki/Magicite and pages Biomes, Bosses, Scourge_Wall,
  The_Scourge_Lair, Scourge_Guardian, Madman_Mode, Races, Hats, Companions, Traits, Stats, Skills, Controls,
  Town, Altars, Multiplayer, Updates, Beginners_Guide, Beating_Magicite, Attacks, Creatures, Weapons, Swords,
  Great_Axes, Bows, Staves, Shields, Rings, Potions, Cooking, Glitch_Biome, Magicite_2.1, Spirit_Gem
  (all under https://magicite.fandom.com/wiki/)
- Steam guides and threads: https://steamcommunity.com/sharedfiles/filedetails/?id=509562840 (Gameplay
  Overview), ?id=273075459 (TL;DR guide), ?id=2587201201 (Magichridion), ?id=278097065 (mage guide);
  threads https://steamcommunity.com/app/268750/discussions/0/522729359428531319/ (tips),
  …/611704730323411416 (melee), …/522730701427842829 (magic), …/522730701929925891 (controller),
  …/522730701218539091 (final boss)
- Kickstarter: https://www.kickstarter.com/projects/seanyoung/magicite-a-multiplayer-rpg-platformer
- IndieDB/ModDB devlogs: https://www.indiedb.com/games/magicite ;
  https://www.moddb.com/games/magicite/news/magicite-questing-boss-mechanics ;
  https://www.moddb.com/games/magicite/news/magicite-2d-multiplayer-rpgplatformer-update
- Press: https://www.capsulecomputers.com.au/2014/06/magicite-review/ ;
  https://cliqist.com/2014/06/11/magicite-enjoyably-tough-roguelike-or-maddeningly-unfair/ ;
  https://www.gamingonlinux.com/2014/02/magicite-multiplayer-rpg-platformer-with-permanent-death-now-on-steam-early-access/ ;
  https://www.orlandotech.org/2014/04/09/an-interview-with-magicite-game-designer-sean-young/ ;
  https://gamedevacademy.org/sean-youngs-interview-creator-of-magicite/ (summary only)
- Reviews/aggregators: https://www.metacritic.com/game/magicite/user-reviews/ ;
  https://gamefaqs.gamespot.com/pc/762885-magicite/reviews/161714 ; https://nodal.gg/game/magicite-268750 ;
  https://steamdb.info/app/268750/
- Developer tweet (v2.0 companion): https://x.com/seanyoungsg/status/768012966843260928
- speedrun.com: https://www.speedrun.com/magicite
