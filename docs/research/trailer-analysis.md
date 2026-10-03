# Trailer analysis (official *Magicite* trailer, ~2014 build)

Source: a screen recording of the Steam store page playing the official trailer, provided by the project
owner. It is 95 s long at 2202×1184 and 20 fps. The trailer itself plays in a **16:10 viewport** at source
px x 256–1933, y 102–1152 (≈1677×1050). Frame `t_NNN` (1 fps) ≈ recording second N−0.5. After the trailer
ends (~91 s), the Steam carousel moves on to a **screenshot of a later build**. That screenshot is already
covered in `screenshot-analysis.md`.

**Two builds.** The trailer shows an **older build (Build A)**: HUD meters are text only, the hotbar sits flush
in the corner, and the character card lists six stats. The screenshots in `screenshot-analysis.md` show a
**later build (Build B)**: meter bars, an XP bar and coins, and HP/ATK/DEX/MAG. Both builds share the same art
language. When this file describes Build A, `screenshot-analysis.md` stays authoritative for Build B.

The video is soft (it was compressed and then screen-recorded), so the hex values below are estimates. Single
pixels are often smeared. Readings I am unsure of are marked **(?)**. All names quoted here belong to the
original game. They are recorded only as reference and **must not be reused** (CLAUDE.md rule 6).

---

## 1. Timeline (recording seconds → content)

On-screen text is quoted verbatim, including the quote marks, which are drawn on screen. Each intro card types
on letter by letter: one frame shows only `"T`, another `"BUT AM`. The card then slowly zooms in on a near-black
background (#050505). Cards and illustrations cross-fade through black.

| Time (s) | Content |
|---|---|
| 0–2 | Black (Steam carousel arrows `<` `>` visible at the edges; not part of the trailer). |
| 2–5 | Card: **"LONG AGO THERE WAS A TIME OF PEACE..."** |
| 5–8 | Illustration 1: hero seen from behind (spiky blond hair, red cape, grey shoulder pads) on a green hill between thatched cottages. Teal sky, alternating yellow/teal **sun rays**. It fades in from a dark silhouette. |
| 8–11 | Card: **"WE LIVED ON THE SURFACE, FREE OF DANGER..."** |
| 11–14 | Illustration 2: a family in front of a thatched house with a stone chimney and a white smoke cloud. Bald bearded father, blonde girl with a pink flower, brown-haired mother in green. Grey cobble wall in front, teal sky with chunky clouds. |
| 14–17 | Card: **"UNTIL ONE DAY..."** |
| 17–22 | Illustration 1 again (17 s). The sky then turns **purple**, the rays go violet, and a huge **winged dragon/demon silhouette** rises over a dark blue landscape. |
| 22–25 | Card: **"THE SCOURGE WAS UNLEASHED UPON THE LAND, DESTROYING THE OVERWORLD..."** |
| 25–28 | Illustration 3: the family scene under a magenta sky. Dark smoke rises and a dragon silhouette dives. A **purple tentacle mass** grabs the mother and a green ghoul hand appears with red blood splashes. |
| 28–31 | Card: **"THE REST OF US SOUGHT SHELTER UNDERGROUND..."** |
| 31–34 | Illustration 4: a hooded, bearded elder (brown hood, striped tan beard, green robe) in a brown cave. He holds a staff topped with a **glowing violet oval crystal**, next to a flickering torch. |
| 34–37 | Card: **"BUT AMIDST ALL OF THIS CHAOS, WE FOUND HOPE..."** |
| 37–40 | Illustration 5: two miners with pickaxes in an orange-lit cave. One is bald with a white beard, the other younger. A **glowing cyan crystal** sits between them. |
| 40–42 | Card: **"MAGICITE."** |
| 42–45 | Gameplay fades in. Purple crystal cave: GAREVEN and GWEST against purple spiders. GWEST double-jumps, then **"LEVEL UP!"** with a light beam (43 s). Then (44 s) a forest/purple border: pink pig, green slimes, **"+1 WOOD"**, damage number "4". |
| 45–46 | Feature card **"MULTIPLAYER"**. |
| 46–47 | Underground town in the purple cave. Four players (SEAN, RATHHART, IRONSIDE, ESTEBAN) stand by a stone house with a red roof and chimney smoke. |
| 47–52 | GAREVEN with a gold staff jumps between purple ledges over spiders, white "crystal mound" creatures, chests and grey boulders. HP drops 6/6 → 4/6. |
| 52–53 | Feature card **"RPG"**. |
| 53–54 | Snow-floored town: two houses and a two-storey house, a townsperson NPC (orange hair, blue cloak), and the four players. |
| 54–56 | Snow biome: SYVVAND on a floating snow platform against a **yeti** that throws **snowballs**. A chest and snow-capped bushes are nearby. |
| 56–58 | Purple biome: GWEST, REDILIA and GWULF (downed, red "!"). REDILIA casts a **full-height lightning pillar** from a gold staff (mana 1/13 → 0/13). Damage number "13". |
| 58–59 | Feature card **"PLATFORMER"** (cross-fades over snow gameplay). |
| 59–62 | Snow cave with layered ledges: GAREVEN, GWEST and NILKE with **cyan diamond swords** against a yeti. Tall snow pines, white rabbits. |
| 62–65 | Forest: GAREVEN with a fire staff against a **giant segmented purple worm** that comes out of the terrain diagonally. Pickup text "+1 VIAL OF POISON"(?) and "+1 RAW MEAT"(?). Damage "12". |
| 65–66 | Feature card **"EPIC LOOT"**. |
| 66–68 | Purple biome: LODNOR with a wooden sword fights a crystal-mound creature, then **smashes a chest**. Pickups pop: **"+1 MONSTER BONE"**, "+1 COOKED MEAT"(?) and "+1 MONSTER FANG"(?), overlapping. |
| 68–69 | GAREVEN with a diamond sword in the purple biome. GWEST and NILKE are on the level below. |
| 69–71 | Feature card **"CRAFTING"** (cross-fades into the inventory). |
| 71–74 | Inventory and character panel open (SEAN, LV.2). The cursor hovers over raw meat and a tooltip **"RAW MEAT"** appears. No craft is actually performed. |
| 74–75 | Feature card **"PERMANENT DEATH"**. |
| 75–77 | Stone-brick dungeon: a skeleton with a giant greatsword and a skeleton archer. SEAN is shot by arrows and **downed** (HP 0/2, body lying flat, red "!"). IRONSIDE and ESTEBAN come over. |
| 77–79 | Forest: SEAN with a fire staff shoots a **fireball** past pink butterflies at green slimes. A pig is nearby. Damage "12". |
| 79–83 | Snow: SYVVAND with a wooden stick against two yetis and snowballs. **Cyan ice-crystal spikes**, a rabbit, chests on upper ledges. |
| 83–86 | Forest: SYVVAND with a fire staff double-jumps (white puff) while the worm bursts out of the ground. |
| 86–89 | SEAN in the purple biome drops down past the underground town's houses. RATHHART, IRONSIDE and ESTEBAN are below. |
| 89–91 | Logo **"Magicite"**: gold pixel lettering with gold square particles and white 4-point sparkles. |
| 91–95 | (Steam carousel) Build B screenshot of the forest district. See `screenshot-analysis.md`. |

## 2. Story / premise (as told by the intro)

People lived peacefully on the surface (the "overworld") in thatched villages. A **"Scourge"** arrived,
pictured as a giant winged dragon/demon under a purple sky together with tentacled purple horrors and ghouls.
It destroyed the overworld. The survivors fled **underground**. There an elder with a glowing violet-crystal
staff and miners striking a glowing **cyan crystal** stand for the discovery of **magicite**, a magic crystal
that is "hope". Gameplay then takes place entirely in underground districts, with **towns built in the caves**.

*For Shardfall:* the premise is generic (a surface cataclysm, an underground refuge, a magic-crystal "hope").
Keep the structure but invent our own names: the cataclysm, the crystal, and the people.

## 3. Biomes seen

Layering is the same in every biome. There is a **solid ground body** (lumpy "cobble" blobs, 3–6 px, with
1-px darker gaps) and a separate **top fringe layer** with a jagged or crenellated top edge. Behind sits a
**back wall** of darker round cobbles that only shows within ~3 tiles of a light. Everything else is near-black
(#020200–#050505). Tiles are 8×8: dungeon bricks measure ≈8×4 px, two rows per tile.

### 3a. Forest (green, Build A and Build B)
- **Top fringe:** bright lime grass with a crenellated top (2–3 px tufts with 1 px gaps), 2–3 px thick.
  A darker, checker-dithered grass band sits under it, then dark soil with orange-brown root and pebble specks.
  - Grass under the player's light: #d3f852 / #a6e04a. Mid: #5ec109 / #47af12. Unlit, far away: #212f0f.
  - Soil when lit: #2d2c0c–#4b3d19 with specks #8a4a20(?). Unlit: #080d01.
- **Trees:** very tall (8–12 tiles), thin 2-px **zigzag trunk** (#351606 with a #6b3418 highlight(?)).
  - Round **leaf puffs**, 8–14 px wide, alternate left/right up the trunk, with a bigger puff on top.
  - Puff colours: highlight #9ae846, mid #72c520, shade #469127, with lighter dither dots on top.
  - Trees are drawn at near full brightness even far from the player.
- **Plants and decor:** leafy bush with white flower dots (#8cb444; flowers #ffffff), a harvestable herb(?).
  Four-leaf **clover** item. Pink butterflies with yellow bodies. Rows of three yellow glowing dots (bees or a
  glow-worm?).
- **Particles:** single-pixel **fireflies** #daea7f / #9cff3a drifting slowly.
- **Animals and enemies:** green slime cubes, pink pig, the giant worm (see §4).

### 3b. Purple crystal cave (violet)
- **Top fringe:** rounded **magenta crystal lumps** (3–5 px blobs). They are #f694f7 / #e274ee near light and
  dim to #8730a0 → #441858 far away.
- **Body:** dark navy/teal cobbles (#0a1c20) with **blue highlights** #364b7c near light. It reads as
  blue-violet.
- **Back wall:** very dark violet blobs, #170b1e. Room outlines are traced by faint purple wall edges.
- **Particles:** sparse **teal motes** (#65d8b2 / #40e0c0), 1 px, drifting.
- **Props:** grey boulder clusters (mineable stone?), wooden chests, the town (see §6).

### 3c. Snow / ice
- **Top fringe:** a white **snow cap** with a jagged edge of 1–2 px notches. It is pure white #fefefb where lit
  (it glows under the player) and drops to grey #353532 unlit.
- **Body:** grey rock #2e2e2b with darker mottling #0d0e06 and small dark sprout marks.
- **Back wall:** dark grey round cobbles, visible only in the light halo.
- **Snow pines:** tall, with a dark red-brown zigzag trunk (#311208). Leaf puffs are white snow on top with
  green underneath (#658952) and light-green dots. A short 2–3 tier bush variant also appears.
- **Ice crystals:** a cluster of cyan spikes (#40e0e0 / #a0ffff), ~2 tiles wide (an ore or a hazard?).
- **Particles:** **falling snow**. Flakes are white plus-shaped 3×3 px crosses and 1–2 px dots that fall
  slowly over the whole screen.
- **Animals:** white rabbits (~6×6 px).

### 3d. Stone dungeon (grey/maroon)
- **Floor:** grey stone bricks in staggered rows (brick ≈8×4 px). Lit #90908d, mid #31312e, dark #0d0d0a.
- **Back wall:** dark **maroon/purple bricks** (#2a0a1e–#3a1028(?)) with grey cobble **pillars** (#373637).
- **Particles:** magenta motes (#c040c0).
- **Enemies:** skeletons (see §4).

### 3e. Hazards
No lava or spikes appear in the trailer. The fire district is only in Build B screenshots. The ice spikes may
be a hazard (?). Pits between floating platforms are the main danger.

## 4. Enemies and bosses

The player is ≈8 px wide (≈10 with hands) and ≈11–12 px tall.

| Creature | Size (≈px) | Look | Behaviour seen |
|---|---|---|---|
| **Green slime** | 8×8 | Square cube #85f282 with a lighter top edge #a8ff8a, two black dot eyes and a tiny mouth. Soft green glow. | Hops around in groups of 2–3. Green orbs (#d9fec7) float nearby: spit or dropped gel? (?) |
| **Pink pig** | 10×8 | Boxy pink #de86a1, shade #d56e89, a pointed ear, dot eye, stubby legs. | Passive animal (source of meat). |
| **Purple spider** | 16–18 × 12 | Indigo/navy body #3a2a8a(?) with a big **magenta abdomen** #702373. A **red-orange X marking** sits on the face/abdomen, with **yellow glowing eyes** #faf879. Thin dark legs. | Packs of 3–6 crawl on the purple floor and take hits (damage "4"). |
| **Crystal mound** | 16×14 | A **white, lilac-spotted dome on splayed white legs** (like a tent or hairy spider) with a glowing **violet cap** #b656f4. | Walks and slides into or through players. Takes sword hits. |
| **Yeti** | 20×15 | White fur with a jagged spiky outline, **pale-blue face** #aae4f5, two black eyes, blue paws #9ab7c2. Crouches. | **Throws snowballs**: white glowing balls ~10 px across that arc and hit the ground. |
| **Giant worm (boss)** | Segments ≈16–18 px; total length 12+ segments (>25 tiles) | Round segments with a dusty-rose/magenta rim (#a03060 / #c04070), a violet diamond pattern inside (#7a30a0) and a dark core. The head is a **round dark maw ringed by ~12 white teeth**. | Bursts out of the ground and arcs **diagonally across the whole screen**. It is drawn *behind* the tree puffs, as if moving through the background. Takes 12-damage hits from the fire staff. |
| **Skeleton (greatsword)** | 10×12, sword ~24 px | White blocky skull #d4d4d1 with black dot eyes, bone ribcage body, a faint dark-red aura. Holds a **huge grey greatsword** (#9e9e9b) raised diagonally. | Advances on players. |
| **Skeleton archer** | 10×12 | Same body, with a bow (white string line). | Fires **arrows**: white arrowhead and brown shaft, ~12 px long, flying horizontally. Two or three hits downed a 2-HP player. |
| **Scourge dragon (story only)** | — | A black winged silhouette with horns and spread bat wings. | Intro illustrations only. |

## 5. Player characters

- **Body:** a chibi block, 8 px wide and 11–12 px tall.
  - The square **head is ~7×7 px**, about 60% of the height, with a dark 1-px outline.
  - Hair covers the top 40% of the head and ends in a jagged fringe. Two 1-px black **dot eyes**, no mouth.
  - The shirt below is 3 px tall, then 1–2 px of dark legs.
  - **Hands are separate floating 1-px squares** on either side of the torso. Rayman-style: no arms are drawn.
- **Skin and clothes:** skin is pale cream #fbe7b7 / #f0e0a0. Hair is usually brown (#5f422a). Shirt colour
  varies per player: red #980822, blue #2840a0, green #30a040, orange-brown. Variants seen:
  - ESTEBAN has a pale bald head with a small **black top-knot or mohawk** and an orange-brown apron. This may be
    a different race or a hat (?).
  - GWULF looks yellow-skinned or blonde (?).
- **Name tags:**
  - Each player's random fantasy name floats in **white uppercase pixel text** (#eeeeeb) centred ~4 px above
    the head. There is no outline, only a soft glow.
  - The font is finer than the world pixels: about 2.5 source px per font pixel, against 6.5 for a world pixel.
    Letters are about 2.5 world-px tall.
  - Glyph quirks: **N and M are drawn as lowercase-style n/m shapes**, and A has a flat top.
  - Tags do **not** avoid each other. When players stand together the tags overlap ("RA…SIDE").
  - Names seen: GAREVEN, GWEST, SEAN, RATHHART, IRONSIDE, ESTEBAN, SYVVAND, REDILIA, GWULF, NILKE, LODNOR.
- **Held items:**
  - The selected hotbar item is drawn **at the front hand, held out horizontally** in the facing direction, even
    while idle or walking.
  - Swords point forward at hand height. Staffs and wands are held horizontally with the head forward. Ore and
    other non-tools are held as the icon itself, just in front of the hand.
  - Handles are **1-px lines of alternating light and dark pixels** (a "dotted" shaft).
  - Item art seen in hand: wooden sword (brown), cyan diamond sword, gold sword, wooden stick or spear, fire
    staff (red-orange-yellow flame tip), gold staff (yellow crescent/hook top), cyan axe, gold ore, red potion.
- **Swing animation** (§8): the weapon goes up to vertical overhead, sweeps through the front to ~45° below
  horizontal, then back to horizontal. The whole swing takes ~0.15 s.
- **Hats and companions:** none are clearly visible in the trailer. ESTEBAN's top-knot may be a hat (?). No
  pets are seen.

## 6. Towns, NPCs, buildings, shops, portals, chests

- **Underground towns** sit on cave floors in the purple and snow biomes. One spans **two levels**, with houses
  stacked on ledges.
- **Houses** are ~4–5 tiles wide and ~3–4 tiles tall. A two-storey variant is ~5 tiles tall.
  - Walls are beige stone blocks (#a18c75 / #ab9983) with lighter rectangular stones (#c8b8a0(?)) and dark mortar.
  - Roofs are flat **red** (#943d46 / #73272d) with a darker top edge (#37070d) and a pale **Greek-key / glyph
    frieze**.
  - Square dark windows (#100400) and a dark doorway. A wooden **fence or rail** (#251607 / #5a3a20) runs in
    front at ground level.
  - A **chimney** puffs **white smoke**: clusters of round white blobs (#f3f3f0 / #bcbcbc) that rise and shrink.
- **NPCs:** a townsperson with tall orange hair (#be653e, or an orange hat) and a blue-grey cloak (#3f5563)
  stands in a doorway.
- **Shop (?):** next to ESTEBAN at the house is a displayed item (a cyan sword, a dark round object) with a
  white number **"13"** floating beside it. This is probably a price. Glowing yellow-green dots in a doorway
  could be coins or eyes (?).
- **Chests:** a wooden chest ~10×8 px. It is dark brown with vertical slats (#2a2419 / #5a3a20) inside a
  lighter grey-brown frame with **corner posts**, so it looks a bit like a bench. A grey/iron variant appears in
  the forest. Chests stand on floors and ledges in every biome.
  - Hitting a chest makes it **burst**: yellow sparkles, then several "+1 ITEM" pickup texts.
- **Portals / exits:** not shown in the trailer. Build B's stone doorway is described in the screenshot analysis.

## 7. HUD and UI

### 7a. Build A HUD (trailer). Estimated native coordinates on a ~256×160 view.

```
[ sel ][slot][slot][slot][slot]                    6/6  (heart)     18/10 (drumstick)
  ‾‾     ‾‾    ‾‾  (green durability bars)         11/11 (gem)      10/10 (boot)
```
- **Hotbar:** 5 slots, top-left, origin ≈ (10, 8).
  - Slots are 14×14 with a 1 px dark gap (pitch 15), so the whole bar is ≈74 px wide.
  - Slot fill is dark brown #2d1d0a / #2f2709, slightly translucent, with darker gaps #1d0e01.
  - The **selected slot** has a 1-px light border #efecdb / #f6f6f1.
  - Item icons are drawn at world pixel scale (~10×10) with dark 1-px outlines.
  - Stack counts are small white digits (#d0ccc4) at bottom-right, e.g. "40", "23", "15", "6", "2".
  - **Durability:** tools and weapons show a short **green bar** (#8ff6a3, ~5×1 px) centred under the slot,
    overlapping the slot's bottom edge.
- **Meters:** top-right, a 2×2 grid. Each meter is **text `cur/max` then an icon**, with no bars in this build.
  The right margin is ≈5 px and the rows sit at y≈12 and y≈20. Icons are ~6×6 px.
  - **HP:** red heart-like icon (#ba0111, notched top). Small integers: 6/6, 5/5, 3/3, 2/6, 1/2, **0/2 when
    downed**.
  - **Mana:** cyan diamond gem (#28dce9). Values 11/11, 12/12, 13/13, 3/12. It drains when staffs are used
    (11 → 1, 1 → 0 after the lightning) and regenerates over time.
  - **Drumstick:** brown meat (#6e2f1a) with a white bone. Values 10/10, 5/10, 3/10, but also **18/10, 19/10**
    (above max), and **9/20 at LV.2**.
    - The max doubles 10 → 20 at LV.2, which matches the panel line "HUNGER: 20/20". So this is most likely
      **food/hunger with overfill allowed** (eating past full, up to ~2× max, decaying quickly: 19 → 18 in about
      1 s).
    - It could also be XP. (?)
  - **Boot:** orange boot (#d68d4d). Values 10/10, 7/7, 4/4, 3/3, 2/2. It **drops by 1 on each mid-air
    (double) jump** (2/2 → 1/2 → 0/2, 3/3 → 2/3) and refills at roughly 1 point per second. Treat it as
    **stamina / air-jump charges** (?). The maximum varies per character.
- **Text font:** white (#eeeeeb) blocky pixel digits with a soft glow, drawn at a finer UI pixel scale. HUD
  digits are ≈4 world-px tall.
- **World text:**
  - Name tags (§5).
  - Pickup text "+1 WOOD": white, pops above the player, drifts up and fades. Several can overlap.
  - Damage numbers: white digits above the target.
  - "LEVEL UP!": a larger white font with a dark outline (§8).

### 7b. Build A inventory and character panel (opened at 71–74 s)

The game keeps running behind it.

```
[hot1][hot2][HOT3*][hot4][hot5 23]
[eq ] +--------------------+ [eq ]
[eq ] | SEAN               | [eq ]
[eq ] | LV.2               | [eq ]
      | HUNGER: 20/20      |
      | NEUTRAL +0         |
      |                    |
      | HP: 5     ATK: 5   |
      | DEF: 5    MAG: 5   |
      | AGI: 5    LCK: 5   |
      +--------------------+
[inv][inv][inv][inv][inv]                                  [red btn]
[inv][inv][inv][inv][inv]                                  [taupe btn]
[inv][inv][inv][inv][inv]
```
- **Equipment:** six empty slots, three per side, the same brown as the hotbar. No ghost silhouettes appear in
  this build.
- **Stat card:** about 40×43 px, translucent brown (#3a2b19, ~85% opaque; the tree trunk behind shows through).
  - Card text in white: name, `LV.2`, `HUNGER: 20/20`, **alignment `NEUTRAL +0`**, then **six stats in two
    columns**: HP, ATK, DEF, MAG, AGI, LCK.
  - Build B shows HP/ATK/DEX/MAG instead.
- **Backpack:** 5×3 slots below a ~20 px gap, at y≈90–134, the same width as the hotbar. Total storage is
  20 slots (hotbar plus backpack). Items seen: blue mushroom, gold nugget, raw meat.
- **Tooltip:** hovering an item opens a near-black translucent box to its right with the item name in white caps
  (`RAW MEAT`). The inventory is mouse-driven.
- **Two square buttons, bottom-right of the screen** (~13 px each, stacked):
  - A **red** button (#dc263d) with a white glyph like a stylised brick or key pattern (recipes/journal?).
  - A **taupe** button (#9a7865) with a white **hammer** glyph (craft?).
  - Build B uses a gold lightbulb and a pink heart instead.

### 7c. Build B (the later screenshot shown after the trailer)
- Top-left: `Lv.1`, a green XP bar with "5/8" centred on it, and a coin icon "x7". The hotbar has larger gaps
  between slots.
- Meters become **bars**: 4/4 red + heart, 3/3 blue + gem, 8/8 brown + drumstick, 4/4 yellow + boot.
- Full details are in `screenshot-analysis.md`.

### 7d. Cards, logo, fonts
- **Intro cards:** white uppercase pixel font with quote marks and an ellipsis. Centred, with a typewriter
  reveal and a slow zoom-in on #050505.
- **Feature cards:** "MULTIPLAYER", "RPG", "PLATFORMER", "EPIC LOOT", "CRAFTING", "PERMANENT DEATH". Same
  font, much bigger, white with a soft glow, over darkened or cross-fading gameplay.
- **Logo:** "Magicite" with a **huge block "M"** and lowercase blocky letters.
  - Fill is a vertical gradient from pale yellow-white to gold #e0b030, with a darker gold outline and an outer
    glow.
  - Floating **gold square particles** and **white 4-point sparkles** surround it on a dark, faintly patterned
    background.
- **Cutscene illustrations:** square panels about the height of the viewport, at a much bigger pixel scale (~48
  art px across (?)). They share the chibi style and use **dark 1-px outlines**, 2–3 tone flat shading, chunky
  clouds and light rays, a vignette, and fades.

## 8. Combat and movement

- **Camera:** hard-centred on the local player on both axes. The name tag sits at exactly the same screen spot
  in every clip, including mid-jump and while downed (§9).
- **Jump** (measured by the floor moving while the player stays centred):
  - A **single jump rises ≈220 source px ≈ 33 native px ≈ 3 player heights (≈4 tiles of 8 px)**. It takes
    ~0.45 s up and ~0.35 s down, so it falls faster than it rises. (?) The ascent may include some hold.
  - **Double jump:** a **white cloud puff** (~10 px) appears at the take-off point and dissipates into a
    dotted ring. The total rise is ≈330 source px ≈ 50 native px (≈6 tiles), and the boot meter drops by 1.
  - The very high total jump makes vertical room layouts generous: rooms are ~8–9 tiles tall.
- **Walking speed:** not reliably measurable (?). It looks moderate, roughly 3–5 tiles/s.
- **Melee:** the weapon is held out horizontally. On attack it snaps up to vertical, then **sweeps down to ~45°
  below horizontal** in about 3 frames (~0.15 s) and returns. No large slash arc or trail sprite appears.
  Chests and enemies take hits from the swing.
- **Damage numbers:** white digits (1, 4, 12, 13) pop above the target and float up. There is no colour coding
  and no crit styling.
- **Spells and projectiles:**
  - **Fire staff → fireball.** A red-orange flame sprite (~12×6 px, #fef388 core, #fbb468 / #e04020 flames)
    flies horizontally. Yellow ember dots trail behind it, or there is a 3-dot burst (?).
  - **Gold staff → lightning pillar.** A vertical beam ~8 px wide spans the **entire screen height**, slightly
    in front of the caster. It is built from stacked, offset jagged segments in lime-yellow (#d4de82 / #e9e682)
    with a white core (#f4f7d1). **4-point star sparkles** (#f9fecf) scatter around it, and it lasts ~1.5 s.
  - **Enemy projectiles:** snowballs (white, glowing, arcing), arrows (horizontal), and green orbs (?).
- **Hit feedback:** knockback, hit flash and screen shake are **not discernible** at this video quality (?).
- **Downed state (co-op):**
  - At 0 HP the player's sprite **lies on its side on the floor** (rotated 90°).
  - The name tag stays at standing height, and a big **red "!"** (#e01020, ~3×8 px, bar plus dot) appears above
    it.
  - The HUD shows HP 0/N. Teammates walk over to revive (the revive itself is not shown).
  - The camera stays on the downed player.
- **Level up:** a thin pale-yellow **vertical light beam** comes from the top of the screen down to the player.
  **"LEVEL UP!"** appears in large white outlined text just above the name tag. Both last about 1 s.
- **Loot:** smashing a chest or killing an enemy releases yellow sparkles. Items go straight into the inventory
  with "+1 NAME" texts. Some green orbs may be dropped items (?).
- **Death puffs (?):** grey smoke clusters appear near spiders. They may also be mineable boulders.
- **Lighting:**
  - Each player carries a soft radial light (radius ≈3 tiles; smooth, not stepped). It reveals back-wall cobbles
    and makes the fringe under the player glow: snow turns white, grass turns lime/yellow, crystals turn pink.
  - Terrain outside the light stays faintly visible: grass tops at ~15–20% brightness (#212f0f). Soil and back
    wall drop to near-black.
  - **Creatures, NPCs, trees, smoke and particles are drawn near full brightness everywhere**, often with a
    slight glow. Darkness mostly applies to tiles and the back wall.
- **Particles:** fireflies, teal motes, falling snow crosses, magenta motes, chimney smoke, star sparkles from
  spells and level-up, and loot sparkles.

## 9. Camera and scale

- The trailer viewport is **16:10** (likely a 1280×800 capture). One world pixel ≈ 6.5 source px (≈5 px on the
  original 1280×800 screen).
  - The visible world is about **256×160 native px ≈ 32×20 tiles**.
  - Cross-checks: dungeon bricks 8 px wide, hotbar slot pitch 15 px, player head 7 px, snow platform 16 tiles.
  - Build B (the 1280×720 screenshots) shows **≈320×180 ≈ 40×22.5 tiles**, so it is zoomed out compared with
    the trailer build.
- **Camera follow:** the local player is locked to the screen centre on both axes, with no visible lag,
  look-ahead or dead-zone. Smooth sub-pixel scrolling (?).
- **Multiplayer:** **every client has its own camera** with the same zoom. There is no shared camera and no
  zoom-out with 4 players.
  - Teammates are often half off-screen or below the view.
  - There are no off-screen arrows. Only name tags are cut off at the screen edges.
- **Edited transitions:** clips cross-fade (~0.5 s), and feature cards fade over darkened gameplay.

## 10. Art-direction rules for a procedural recreation

1. **Darkness first.**
   - The background is near-black (#020200–#050505).
   - Terrain is lit only within ~3 tiles of a light: a smooth radial falloff, not pixelated.
   - Keep a 15–20% ambient on tile **top fringes** so level silhouettes read across the screen.
   - Soil and back wall go to ~0 outside the light.
   - Draw creatures, NPCs, trees, smoke, particles and UI at **full brightness** (or emissive), with a mild
     bloom halo on bright pixels.
2. **Tiles (8×8).**
   - Body: lumpy rounded "cobbles" (3–6 px blobs, 2–3 shades plus 1-px dark gaps). Never use clean grid bricks
     except in the dungeon.
   - Each biome adds a **top fringe** with a jagged or crenellated upper edge that is 1–2 px out of the tile:
     grass tufts, magenta crystal lumps, snow cap. The fringe is brighter and more saturated than the body.
   - Sides and bottoms of platforms are ragged too.
   - The back wall uses the same blob texture at ~30% brightness, revealed only by light.
3. **Palette per biome:** 2–3 fringe tones + 2–3 body tones + 1 back-wall tone + 1 particle colour.
   - Forest: lime / green / brown soil.
   - Purple: pink-magenta / navy-blue / teal motes.
   - Snow: white / grey / white flakes.
   - Dungeon: grey bricks / maroon bricks / magenta motes.
4. **Characters and creatures.**
   - Chibi block shapes: a square head about 60% of the height, 1-px dot eyes, floating 1-px hands.
   - Dark 1-px outlines on characters and items, not on terrain.
   - **3–6 colours per sprite**, flat fills with one highlight and one shade, light dithering on big creatures.
   - Slimes and similar are simple rounded rectangles.
   - Bosses are built from **repeated segments** (worm rings) or are ~2× player size (yeti, spiders).
5. **Items:** ~10×10 icons with a 1-px dark outline and 2–3 tones. Tools have a 1-px **dotted** handle line
   running diagonally from bottom-left to top-right in the icon, and horizontally when held.
6. **Effects:** white cloud puffs (round 3–4-blob clusters) for double jumps, chimney smoke and deaths.
   4-point white/yellow star sparkles for magic and loot. Beams are stacks of jagged segments with a white core.
7. **UI:**
   - Dark brown translucent slots (#2d1d0a) with a light 1-px selection border. White pixel text with a soft
     glow. Icon + `cur/max` meters.
   - Text in the original is rendered at a **finer pixel scale than the world** (name tags ≈2.5 world-px tall).
   - On a native 256–320 px canvas we cannot match that on the world grid. Either draw UI and name tags in a
     separate overlay at 2× native resolution, or accept a 3×5 / 4×5 native font that is chunkier than the
     original.
8. **Camera:** a pixel-perfect integer upscale of a ~320×180 (or ~256×160 for the trailer feel) world, centred
   on the local player. Each co-op player has their own view.
