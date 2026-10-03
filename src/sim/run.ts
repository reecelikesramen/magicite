import { Content } from '../content';
import { RACE_START_GOLD } from '../content/races';
import type { BiomeDef } from '../content/types';
import { rectsOverlap } from '../engine/math';
import { hashSeed, Rng } from '../engine/rng';
import { secs } from './constants';
import { generateLevel, type LevelRequest } from './gen';
import { spawnCompanions } from './progression/companions';
import { applyDifficultyToLevel } from './progression/difficulty';
import { resetSkillCooldowns } from './progression/skills';
import { isActive } from './progression/util';
import { spawnLevelEntities } from './spawn';
import type { Entity } from './types';
import type { World } from './world';

/**
 * Run flow (GDD §3): district 1 (woods) → [3 colour-coded portals, one per next-biome option] →
 * town themed to the chosen biome → its right gate → the next district in that biome → … Districts
 * 3/6/9/12/15/18 end in a boss arena (exits locked until the boss dies). District 20's single portal
 * leads straight into the Blight Lair (21, no town, no exit): killing the Blightwall wins the run.
 */
export const FINAL_DISTRICT = 21;
export const LAIR_BIOME = 'lair';
export const START_BIOME = 'woods';
export const FINAL_BOSS = 'blightwall';
export const BOSS_DISTRICTS: readonly number[] = [3, 6, 9, 12, 15, 18];
/** Number of next-biome portals offered at the end of a district. */
export const PORTAL_OPTIONS = 3;
/** Co-op portal countdown (solo play transitions immediately). */
export const PORTAL_COUNTDOWN = secs(5);

export type DistrictKind = 'normal' | 'boss' | 'lair';

export function districtKind(district: number): DistrictKind {
  if (district >= FINAL_DISTRICT) return 'lair';
  return BOSS_DISTRICTS.includes(district) ? 'boss' : 'normal';
}

/** Biome of district 1: `woods` when present, else the first biome allowed at depth 1. */
export function startBiome(biomes: readonly BiomeDef[] = [...Content.biomes.values()]): string {
  if (biomes.some((b) => b.id === START_BIOME)) return START_BIOME;
  return (biomes.find((b) => b.id !== LAIR_BIOME && b.depths.includes(1)) ?? biomes[0])?.id ?? START_BIOME;
}

function depthDistance(b: BiomeDef, district: number): number {
  let best = Infinity;
  for (const d of b.depths) best = Math.min(best, Math.abs(d - district));
  return best;
}

/**
 * Up to `count` distinct biome ids for the portals leading to `district`: drawn (shuffled with `rng`)
 * from the biomes whose `depths` include it. If none are allowed, the nearest-depth biome is used.
 * The lair is only ever offered (alone) for the final district.
 */
export function nextBiomeOptions(rng: Rng, district: number, biomes: readonly BiomeDef[] = [...Content.biomes.values()], count = PORTAL_OPTIONS): string[] {
  if (district >= FINAL_DISTRICT) return [LAIR_BIOME];
  const pool: string[] = [];
  for (const b of biomes) if (b.id !== LAIR_BIOME && b.depths.includes(district)) pool.push(b.id);
  if (pool.length === 0) {
    let best: BiomeDef | undefined;
    for (const b of biomes) if (b.id !== LAIR_BIOME && (!best || depthDistance(b, district) < depthDistance(best, district))) best = b;
    return [best?.id ?? START_BIOME];
  }
  rng.shuffle(pool);
  return pool.slice(0, count);
}

/** Seeded per run + route so portal options don't depend on world.rng consumption. */
function portalRng(world: World, district: number, biome: string): Rng {
  return new Rng(hashSeed(`${world.seed}:portals:${district}:${biome}:${world.run.path.join('>')}`));
}

/** LevelRequest for district `district` in `biome` (normal / boss / lair by depth). */
export function districtRequest(world: World, district: number, biome: string): LevelRequest {
  const kind = districtKind(district);
  if (kind === 'lair') return { seed: world.seed, district: FINAL_DISTRICT, biome: LAIR_BIOME, kind, nextBiomes: [] };
  const nextBiomes = nextBiomeOptions(portalRng(world, district, biome), district + 1);
  return { seed: world.seed, district, biome, kind, nextBiomes };
}

/** LevelRequest for the town after district `district`, themed to the chosen next `biome`. */
export function townRequest(world: World, district: number, biome: string): LevelRequest {
  return { seed: world.seed, district, biome, kind: 'town', nextBiomes: [] };
}

/** Request for district `district` (district 1 → the start biome). Used by createRun. */
export function requestFor(world: World, district: number, biome?: string): LevelRequest {
  const b = biome ?? (district <= 1 ? startBiome() : nextBiomeOptions(portalRng(world, district, ''), district)[0]!);
  return districtRequest(world, district, b);
}

/** Compat helper: a valid biome for `district`. */
export function biomeForDistrict(world: World, district: number): string {
  return district <= 1 ? startBiome() : nextBiomeOptions(portalRng(world, district, ''), district)[0]!;
}

// ------------------------------------------------------------------------------------------------
// Level entry
// ------------------------------------------------------------------------------------------------

/** Run-start bookkeeping (once, after district 1 loads): race start gold etc. */
function startRun(world: World): void {
  for (const p of world.players) {
    if (Content.races.get(p.race)?.special === 'wealthy') p.gold += RACE_START_GOLD;
    p.runStats.level = p.level;
  }
}

/** Downed / out players come back at 1 HP whenever the party changes level (GDD §3). */
export function reviveParty(world: World): void {
  for (const p of world.players) {
    if (isActive(p)) continue;
    const e = world.get(p.entityId);
    if (!e) continue;
    p.downed = false;
    p.out = false;
    p.reviveProgress = 0;
    // The player workstream keeps a downed timer in ctl; clear it if present.
    const ctl = p.ctl as unknown as Record<string, unknown>;
    if (typeof ctl.downedT === 'number') ctl.downedT = 0;
    e.hp = 1;
    e.hurt = 0;
    e.invuln = Math.max(e.invuln, secs(1));
    world.emit({ type: 'revived', player: p.index });
  }
}

/**
 * A locked level with no boss that can ever appear (no boss entity spawned and no boss SpawnSpec
 * with a known BossDef) would seal its portals forever: unseal it instead of soft-locking the run.
 */
export function unsealIfBossless(world: World): void {
  const lvl = world.level;
  if (!lvl.locked) return;
  for (const e of world.entities) if (e.kind === 'boss' && !e.dead) return;
  for (const s of lvl.spawns) if (s.kind === 'boss' && Content.bosses.has(s.def)) return;
  lvl.locked = false;
}

function onLevelLoaded(world: World): void {
  spawnLevelEntities(world);
  unsealIfBossless(world);
  applyDifficultyToLevel(world);
  reviveParty(world);
  resetSkillCooldowns(world);
  spawnCompanions(world);
}

/** Load a level from a request and reset all per-level run-flow state. */
export function enterLevel(world: World, req: LevelRequest): void {
  const run = world.run;
  const first = run.path.length === 0;
  if (req.kind !== 'town') run.path.push(req.biome);
  run.levelStart = run.ticks;
  run.wraithStage = 0;
  run.wraith = 0;
  run.portalTimer = 0;
  run.portalFirst = -1;
  run.bossSeen = false;
  if (req.kind !== 'town') for (const p of world.players) p.runStats.district = Math.max(p.runStats.district ?? 0, req.district);
  const level = generateLevel(req);
  level.request = req; // lets net clients regenerate this level locally (same line as ws/net)
  world.loadLevel(level, onLevelLoaded);
  if (first) startRun(world);
}

/** Leave the current level through exit `exitIndex` (whole party). */
export function travel(world: World, exitIndex: number): void {
  const lvl = world.level;
  const info = lvl.info;
  const exit = lvl.exits[exitIndex] ?? lvl.exits[0];
  let req: LevelRequest;
  if (info.isTown) {
    req = districtRequest(world, info.district + 1, info.biome);
  } else {
    for (const p of world.players) p.runStats.districtsCleared++;
    const next = info.district + 1;
    const biome = exit?.biome || nextBiomeOptions(portalRng(world, next, info.biome), next)[0]!;
    req = next >= FINAL_DISTRICT ? districtRequest(world, FINAL_DISTRICT, LAIR_BIOME) : townRequest(world, info.district, biome);
  }
  const ex = exit ? exit.x + exit.w / 2 : 0;
  const ey = exit ? exit.y + exit.h / 2 : 0;
  world.emit({ type: 'sfx', id: 'portal_enter', x: ex, y: ey });
  enterLevel(world, req);
}

// ------------------------------------------------------------------------------------------------
// End conditions
// ------------------------------------------------------------------------------------------------

/** End the run as a win (final boss destroyed). */
export function declareVictory(world: World): void {
  const run = world.run;
  if (run.over) return;
  run.over = true;
  run.victory = true;
  run.portalTimer = 0;
  for (const p of world.players) p.runStats.districtsCleared++;
  world.emit({ type: 'message', text: 'The Blightwall crumbles! The Undervault is free.', color: 0xfff080 });
  world.emit({ type: 'sfx', id: 'victory', x: 0, y: 0 });
  world.emit({ type: 'runOver', victory: true });
}

/** End the run as a loss (defensive: the player workstream normally does this on a party wipe). */
export function declareDefeat(world: World): void {
  const run = world.run;
  if (run.over) return;
  run.over = true;
  run.victory = false;
  run.portalTimer = 0;
  world.emit({ type: 'runOver', victory: false });
}

/**
 * Boss bookkeeping: bosses killed this tick are still in the entity list with `dead` set (cleanup
 * runs after all systems), so no event reading is needed. The final boss dying wins the run (in the
 * lair, so does every boss there being gone once one was seen — but a boss-kind minion dying while
 * the Blightwall lives does not); in a boss district the exits unlock once a boss was seen and none
 * remain. Returns true if the run just ended.
 */
function watchBosses(world: World): boolean {
  const lvl = world.level;
  const run = world.run;
  const lair = lvl.info.district >= FINAL_DISTRICT;
  let alive = 0;
  let finalDown = false;
  for (const e of world.entities) {
    if (e.kind !== 'boss') continue;
    if (!e.dead) alive++;
    else if (e.def === FINAL_BOSS) finalDown = true;
  }
  if (alive > 0) run.bossSeen = true;
  if (finalDown || (lair && run.bossSeen && alive === 0)) {
    declareVictory(world);
    return true;
  }
  if (lvl.locked && lvl.info.isBoss && run.bossSeen && alive === 0) {
    lvl.locked = false;
    world.emit({ type: 'message', text: 'The guardian has fallen. The portals awaken!', color: 0x80ff80 });
    world.emit({ type: 'sfx', id: 'portal_unlock', x: 0, y: 0 });
  }
  return false;
}

function partyWiped(world: World): boolean {
  if (world.players.length === 0) return false;
  for (const p of world.players) if (isActive(p)) return false;
  return true;
}

// ------------------------------------------------------------------------------------------------
// Portals
// ------------------------------------------------------------------------------------------------

/** Index of the exit portal overlapping entity `e`, or -1. */
export function exitAt(world: World, e: Entity): number {
  const exits = world.level.exits;
  for (let i = 0; i < exits.length; i++) if (rectsOverlap(e, exits[i]!)) return i;
  return -1;
}

/**
 * Majority vote between portals: active players standing in each exit. Ties go to the portal that
 * started the countdown, otherwise the lowest index; nobody in a portal → the starting portal.
 */
export function voteExit(world: World): number {
  const n = world.level.exits.length;
  if (n === 0) return -1;
  const counts = new Array<number>(n).fill(0);
  for (const p of world.players) {
    if (!isActive(p)) continue;
    const e = world.get(p.entityId);
    const i = e ? exitAt(world, e) : -1;
    if (i >= 0) counts[i]!++;
  }
  let max = 0;
  for (const c of counts) if (c > max) max = c;
  const first = world.run.portalFirst;
  if (first >= 0 && first < n && (max === 0 || counts[first] === max)) return first;
  if (max === 0) return 0;
  return counts.indexOf(max);
}

function updatePortals(world: World): void {
  const run = world.run;
  const lvl = world.level;
  if (lvl.exits.length === 0) return;
  if (run.portalTimer > 0) {
    if (lvl.locked) {
      run.portalTimer = 0;
      run.portalFirst = -1;
      return;
    }
    run.portalTimer--;
    if (run.portalTimer === 0) {
      travel(world, voteExit(world));
      return;
    }
    if (run.portalTimer % 60 === 0) world.emit({ type: 'message', text: `Leaving in ${run.portalTimer / 60}...`, color: 0xc0e0ff });
    return;
  }
  for (const p of world.players) {
    if (!isActive(p)) continue;
    const input = world.inputs[p.index];
    if (!input?.interact || p.prev.interact) continue;
    const e = world.get(p.entityId);
    const i = e ? exitAt(world, e) : -1;
    if (i < 0) continue;
    if (lvl.locked) {
      world.emit({ type: 'message', text: 'The portal is sealed. Defeat the guardian!', color: 0xff8080, player: p.index });
      world.emit({ type: 'sfx', id: 'portal_locked', x: e!.x, y: e!.y });
      continue;
    }
    if (!run.exited.includes(p.index)) run.exited.push(p.index);
    if (world.players.length <= 1) {
      travel(world, i);
      return;
    }
    run.portalFirst = i;
    run.portalTimer = PORTAL_COUNTDOWN;
    world.emit({ type: 'message', text: `${p.name} opened a portal. Leaving in ${PORTAL_COUNTDOWN / 60}...`, color: 0xc0e0ff });
    world.emit({ type: 'sfx', id: 'portal_open', x: e!.x + e!.w / 2, y: e!.y });
    return;
  }
}

/**
 * Run-flow system (after progression): boss deaths → victory / arena unlock, defensive party-wipe
 * check, portal countdown + majority vote → travel.
 */
export function exitSystem(world: World): void {
  if (world.run.over || !world.level) return;
  if (watchBosses(world)) return;
  if (partyWiped(world)) {
    declareDefeat(world);
    return;
  }
  updatePortals(world);
}
