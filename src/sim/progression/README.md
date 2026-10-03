# Progression, run flow & meta (`src/sim/progression`, `src/sim/run.ts`, `src/game/meta.ts`)

GDD §3 / §5 / §10 / §11. Everything under `src/sim` is pure and deterministic; only
`src/game/meta.ts` touches browser storage.

## Tick integration

- `progressionSystem` (exported from `xp.ts`, implemented in `system.ts`, slot fixed in `systems.ts`):
  `chooseSkill` commands → skill offers → cooldowns + `PlayerInput.skill` activation → skill effect
  entities → companions → Blight Wraith. Skill picks are processed even during hit-stop.
- `exitSystem` (`run.ts`): boss watch (victory / arena unlock), defensive party-wipe check, portal
  countdown + majority vote → `travel`.
- Level entry (`enterLevel`): spawns gen SpawnSpecs, applies Madcap enemy HP, revives downed/out
  players at 1 HP, resets skill cooldowns, spawns companions, resets per-level `world.run` fields.

## Run flow

`D1 (woods) → 3 portals (biomes allowed at the next depth, from BiomeDef.depths) → town (district =
the one just cleared, biome = chosen) → gate → D2 …`; D3/6/9/12/15/18 are `kind: 'boss'`
(`level.locked` until a boss seen alive is gone); D20's single portal (`biome: 'lair'`) leads straight
to the lair (D21, no town, no exits). Killing `blightwall` (or any boss in the lair) → `run.victory`,
`run.over`, `runOver{victory:true}`. Portal options are seeded from (run seed, district, route), not
`world.rng`. Solo portal use is immediate; co-op starts a 5 s countdown (message each second); at zero
the exit with most active players wins, ties → the portal that started it.

## Blight Wraith (`wraith.ts`)

`levelTicks` timer per level: warnings 90 s / 30 s before the spawn; spawn at 5:00 (10:00 in D1,
2:00 Madcap). Never in towns or the lair; boss districts only on Madcap. Enemy entity
`blight_wraith` (EnemyDef in `content/enemies.ts` gives contact damage) that this module moves
itself (position integrated from `px/py`, so other movement is overridden). **AI dispatch should
skip def `blight_wraith`.** Invulnerable (invuln refreshed every tick, statuses cleared).

## Entities this workstream spawns (sprite keys for render)

| kind | def / sprite key | notes |
|---|---|---|
| `companion` | CompanionDef.sprite (`companion_<id>`) | owner = player entity id, 6×6, flies, has `light` |
| `enemy` | `enemy_blight_wraith` | 12×14, `anim: 'fly'`, purple light |
| `projectile` | `arrow`, `fireball` | ProjectileComp shape, `sourceItem: 'skill:<id>'` — route through combat's `fireProjectile` when merged |
| `effect` | `skill_whirlwind` `skill_war_cry` `skill_frost_nova` `skill_cleave` `skill_smoke_bomb` | visuals sized to the area (centre = effect centre) |
| `effect` | `skill_meteor` (falling, lit), `skill_hawk` (flying 8×6), `skill_bear_trap` (`anim` `armed`/`snapped`) | need sprites |
| `effect` | `skill_charge` `skill_ground_slam` `skill_arrow_rain` | logic-only controllers: render nothing |

## Statuses applied (combat/status owns their behaviour)

Powers follow combat/status semantics (fractions for haste/slow/weak, HP absorbed for shield):
`shield` (iron_skin / arcane_ward power = rank; gizmo_drone power 1) · `haste` (war_cry 0.3,
smoke_bomb 0.4) · `weak` (war_cry 0.4) · `stun` (ground_slam, chain_lightning, bear_trap hold,
smoke_bomb daze) · `freeze` (frost_nova) · `bleed` (cleave) · `burn` (meteor) · `slow` (smoke_bomb 0.5).
Merge: route `util.addStatus` through combat's `addStatus` so immunities (`burn_immune`, bosses'
shortened disables) apply.

## Specials / mods referenced by name (other workstreams implement)

Races: `wealthy` (handled here: +30 gold at run start), `herb_heal`, `eats_anything`, `burn_immune`.
Traits: `gatherer`, `artisan`, `bookworm` (handled here: +25% XP). Hats: `forager miner berserk
arrow_saver mana_refund triple_jump slow_fall thorns life_steal double_gold shroom_heal burn_immune`.
Difficulty: combat should scale enemy damage with `scaleEnemyDamage(world, dmg)` /
`difficultyMul(world).enemyDamage` (enemy HP is scaled at level load here).

## Extra RunStats keys

`level` (highest), `district` (deepest), `xpEarned`, `skillsLearned`, `warriorSkills`, `mageSkills`,
`rangerSkills` — read by unlock rules (`content/unlocks.ts`).

## Meta (`src/game/meta.ts`)

`finishRun(world, playerIndex, { practice?, daily? })` → `{ meta, unlocked }` (persists to
localStorage key `shardfall.meta`, versioned JSON). Pure core: `evaluateUnlocks`, `applyRun`,
`availableRaces/Hats/Companions`, `describeUnlock`, `dailySeed(date)` + `todayString()`.
