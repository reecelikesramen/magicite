# Screenshot analysis (ground truth)

Five 1280×720 gameplay screenshots of the original Magicite were provided by the project owner.
Subagents cannot see the images, so this file is the **authoritative visual reference**. Where it
conflicts with `art-direction.md` or `magicite-reference.md`, **this file wins**.

## Official Steam description (verbatim, provided by the owner — authoritative)

> Explore, craft, and survive in this Multiplayer RPG Platformer with permanent death! Featuring many
> Rogue-like elements, Magicite randomly generates each underground dungeon for you and your friends to
> delve deep into. Chop trees, mine ores, and hunt beasts in order to collect the resources and materials
> you need to survive the harsh and unforgiving environment. With a ton of character traits, stats,
> companions, and classes, players will have a different experience each play through! Be prepared to
> die... A LOT.
>
> Magicite's main influences were Monster Hunter and Spelunky. I loved the resource collection and
> crafting in Monster Hunter, and of course fighting giant monsters with my friends. Spelunky's brutal yet
> rewarding platforming was also something that I wanted to capture with Magicite.
>
> Features:
> * Randomly Generated Dungeons - Experience a new dungeon each time you play. Expect tons of trees to
>   chop, ores to mine, plants to harvest, and bugs to catch! Oh and giant monsters.
> * Permanent Death - The game logs all of your stats in a play through, leading the way for achievements
>   and upgrades.
> * Crafting System - Combine any two items to create a new one! For example, Wood + Wood = Plank. There
>   are tons of combinations to discover!
> * Combat System - If you plan on just running in and swinging you sword, you're gonna get wrecked. Take
>   time to craft useful items and examine enemy positioning before executing a well timed attack.
> * Unlockable Races, Hats, & Companions - The more you play, more greater chance you'll unlock awesome
>   new hats with a variety of special effects. Races and Companions can also be unlocked to provide
>   different starting items and stats!
> * Multiplayer - Want to put your friendships to the test? This is the game to do it! Permanent death
>   only occurs when the ENTIRE party has fallen. So if your buddy gets knocked out feel free to run over
>   and help him back up. Or not...

### Design pillars derived from the description
1. **Monster Hunter loop**: gather (chop trees, mine ores, harvest plants, catch bugs, hunt beasts) →
   craft better gear → fight **giant monsters** (bosses ~3–5× player size) with friends.
2. **Spelunky platforming**: brutal, precise, rewarding; small HP pools; positioning and timing matter.
3. **Two-item crafting**: *any* two items may combine (`Wood + Wood = Plank`); recipes are discovered.
4. **Permadeath + run stats log** → achievements → unlocks (races, hats with special effects,
   companions that grant starting items/stats).
5. **Co-op downs**: a player at 0 HP is *knocked out*, teammates can revive them; the run only ends when
   the whole party is down.
6. Variety per run: character **traits**, **stats**, **companions**, **classes** (skill paths).

## Global observations

| Aspect | Observation |
|---|---|
| Native resolution | ≈ **320×180** upscaled **4×** to 1280×720 (pixel "squares" are ~4 screen px). |
| Tile size | ≈ **8×8** native px (a 4-tile ledge ≈ 34 native px tall). ~40×22 tiles on screen. |
| Character size | Players ≈ **8–10 px wide, 11–13 px tall** (chibi: head ≈ 45% of height). Weapons drawn in-hand, 6–10 px long, angled. |
| Darkness | The world is **near-black** (#060504–#0c0a08). Only things near a light source are visible. This is the single most important part of the look. |
| Player light | Each player carries a soft **warm radial light** (radius ≈ 4–6 tiles) that tints nearby terrain orange/red-brown and turns grass tips yellow. Falloff is a smooth gradient (not pixelated). |
| Emissive things | Lava surfaces, magic crystals, fireflies, projectiles, magic orbs and glowing plants emit their own coloured light and look **bloomed** (soft halo around bright pixels). |
| Back wall | Behind the playable space there is a **background wall layer** (darker, desaturated cobble/rock blobs) only visible near light. Far background is black, sometimes with a coloured ambient haze (blue in the swamp shot). |
| Terrain edges | Exposed surfaces get a **fringe**: grass blades poke 1–3 px above top faces and also grow on exposed vertical faces. Cave interiors are lumpy cobble texture, not clean bricks. |
| Particles | Square 1–2 px particles: fireflies, embers, magic sparkles, fire bursts. Projectiles leave dotted trails. |
| Camera | Follows the player smoothly; world is not pixel-snapped coarsely (smooth sub-pixel scrolling). |

## HUD (always visible, drawn over the world, no darkness applied)

```
Lv.1  [====5/8=========]  (coin) x7                       4/4          8/8
[axe*][bow ][amul][meat2][    ]                           [red bar](heart)   [brown bar](drumstick)
                                                          3/3          4/4
                                                          [blue bar](gem)    [yellow bar](boot)
```
- **Top-left**: `Lv.N` in white pixel text; an **XP bar** (≈50 native px wide, dark frame, grey empty, green fill) with `cur/max` centred on it (XP to next level starts at 8: `0/8`, at Lv.8 it showed `15/92`); a **gold coin** icon with `xN`.
- Under it: **hotbar of 5 slots** (≈14×14 native each, 2 px gap), translucent dark brown-grey slots; **selected slot has a light grey border**. Stack counts in tiny white digits at bottom-right of the slot.
- **Top-right, two columns of meters**, each meter = `cur/max` text above a short bar + an icon:
  - **HP**: red bar + red heart icon. Observed maxima 2, 4, 5, 9 → *small integers*; HP is a handful of hit points, not hundreds.
  - **Mana**: blue bar + cyan diamond-gem icon (maxima 2, 3, 4, 8).
  - **Hunger/Food**: brown bar + meat-drumstick icon (8/8, 7/8).
  - **Yellow meter**: gold bar + orange boot icon (4/4, 5/5, 7/7). Most likely **stamina** (sprint/jump/dodge resource) — confirm via research; we treat it as stamina.
  - Starting characters differ: e.g. HP 2 / MP 8 (frail caster race) vs HP 5 / MP 4 vs HP 4 / MP 3 → **race determines base meters**.
- Under the meters (when relevant): district name in yellowish text, e.g. **"District 1: Toadvale Forest"**.
- Font: blocky uppercase-ish pixel font ≈ 5–7 px tall, white with a 1 px dark drop shadow.

## Inventory / character screen (screenshot 3)

```
[hot1][hot2][hot3][hot4][hot5]
[helm ]  +-----------+  [arrow]     [lightbulb btn]   (gold square button)
[chest]  |  RALVAND  |  [feath]     [heart btn]       (pink square button)
[ring ]  |  HP: 9    |  [ring2]
         |  ATK: 7   |
         |  DEX: 5   |
         |  MAG: 8   |
         +-----------+
[ inv ][ inv ][ inv ][ inv ][ inv ]
[ inv ][ inv ][ inv ][ inv ][ inv ]
[ inv ][ inv ][ inv ][ inv ][ inv ]

SHIFT + CLICK TWO ITEMS TO CRAFT. TIP: TRY WOOD + WOOD
```
- Panel is a translucent dark brown (#2a2018 @ ~85%) laid over the left part of the screen; the game keeps running behind it.
- **Equipment slots** (6, ghosted silhouettes when empty): left column helmet / chest armour / accessory (ring); right column ammo (arrow) / a feather-like slot (boots? trinket?) / second accessory.
- **Character card**: random fantasy name in caps (e.g. "RALVAND") and four stats **HP, ATK, DEX, MAG**.
- Two square buttons: gold button with a lightbulb (recipe hints / known recipes) and pink button with a white heart (probably eat/heal or race info).
- **Backpack**: 5×3 = 15 slots, plus the 5-slot hotbar = 20 item slots.
- **Crafting = combine two items** (Shift+Click item A, Shift+Click item B). "Wood + Wood" is the tutorial recipe.
- Items seen: axe, wooden sword, iron sword, iron bar, stone, wood/stick (stacks to 91+, so large stacks ~99), gold bar, diamond/cyan bar, meat (raw, pink), bread, arrows (stack 99), bow, pickaxes (iron, cyan/diamond), spear (gold tip), scythe/hoe (silver blade), green potion, red amulet.

## Level-up: "Select Skill Path"
- A panel titled **"Select Skill Path"** with **three square icon buttons**: **red** (crossed weapon → combat/warrior), **blue** (horseshoe/anvil → defence or crafting), **green** (paw/claw marks → survival/hunter/beast). Leveling lets you invest in one of three skill trees.

## Per-screenshot notes

### 1. Forest (Toadvale Forest — district 1)
- Grass: tufty bright green `#3f8f2a / #5fb83a / #8fdc5a` blades; soil below dark brown `#2a1f14 / #3b2a1a` cobble; near the player the soil goes red-brown `#6b2f1a` and grass tips glow yellow `#e8d040`.
- **Trees**: very tall (60–100 px), thin 2–3 px twisted brown trunk (`#4a2a14`, highlight `#7a4a24`), round leaf puffs 8–14 px wide (`#2e7a26` shade, `#4caf3a` mid, `#8fd65a` highlight) alternating left/right up the trunk, bigger crown on top. Trees stand behind the player and are choppable for wood.
- **Fireflies**: lone lime pixels `#9cff3a` with glow, drifting.
- **Exit portal**: a stone doorway ≈ 32×20 px made of grey blocks (`#8a8a8a / #5a5a5a`) with a dotted bright border and a dark interior with **green mossy glow** (`#7ac040`). Sits on a ledge, often high up.
- **Rock node**: grey boulder ≈ 8–10 px (`#5a5a5a / #9a9a9a / #c8c8c8`) — mineable for stone. Variant with **gold flecks** `#e0c040` = gold ore node.
- **Green slime**: rounded box ≈ 8×7 px, `#5ce65c` body, `#a8ff8a` highlight, two dark eye pixels.

### 2. Volcano / fire district
- Back wall: dark red rounded rock blobs `#2a0808 / #4a1010 / #5a1414`.
- Platforms: top surface glowing **lava crust** `#ffd040 / #ffb030 / #ff8020`; body dark red-brown `#3a120c / #4a1a10` with a **network of glowing cracks** `#c03018 / #e05020`.
- **Red dragon** (boss-like flyer) ≈ 24×20 px: red body `#c02020 / #e04030`, yellow belly scales `#f0c040`, bat wings. Fires **3 aimed streams of fireballs** (3×3 yellow-white core, orange halo, trail of small orange dots every ~6 px).
- Fire bursts: clusters of orange/yellow squares rising from the ground.
- A brown spiked quadruped on fire (boar / beetle).
- Other players: one in a black hood with yellow visor-eyes holding an axe; one with green skin/hood (orc?) swinging a huge grey war-hammer on a long handle.

### 3. Toadvale Forest with a big beast
- **Large lizard/croc beast** ≈ 40×24 px: brown body `#5a3a1a`, dark-red head crest `#8a1a1a`, white back spikes, mouth dripping **acid-green slime** `#c0ff40` — probably the district boss or a mini-boss.
- Gold ore node, small green slime, stone portal on the right.

### 4. Purple crystal / shadow district
- Trees: dark purple thorny trunks studded with **glowing magenta crystals/blossoms** `#ff40ff / #c020c0`.
- Ground: purple-blue cobble `#2a2040 / #3a2a5a`; top surface lit **hot pink** `#ff50c0`.
- Enemies: big dark-navy beetles/spiders (`#1a2050`, purple highlights `#5a40a0`, red stripe `#c03030`), small purple imps/bats `#6a30b0` with glowing eyes.
- A large **glowing white-violet crystal** (`#f0e0ff` core, `#a060ff` glow) — a light source / magicite crystal.
- Four players at once (co-op): brown-haired human, grey full-helm knight, red-hooded character with a cyan pickaxe.

### 5. Night swamp / jungle (teal + violet)
- Deep **blue ambient haze** `#14205a` in the background.
- Grass dark teal `#1a5a5a` with cyan tips `#40c0c0`; hanging green vines with white flowers.
- Tall stalks with **purple leaves** `#8040e0 / #b070ff`.
- Enemies: **wooden tiki-mask totems** (brown planks `#7a4a2a`, purple eye glyphs) that shoot **cyan magic orbs** (`#40ffff` core, sparkly trail); a purple cube-bat with cyan trails; small cyan cat-like spirits.
- A small red winged creature flies next to the player (pet/familiar or bat).
