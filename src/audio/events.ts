import { Content } from '../content';
import { TILE } from '../sim/constants';
import type { GameEvent } from '../sim/types';
import { resolveTrackId } from './music/moods';
import { isSpatialCue, resolveSfxId, SFX } from './presets';

/**
 * Pure GameEvent → sound mapping. The AudioManager feeds every event of a frame through
 * `mapGameEvent` with a CueSink; tests use a recording sink. No allocation per event.
 */
export interface CueSink {
  /** Play preset `id` at world position (x, y). `spatial` = false → ignore distance/pan. */
  sfx(id: string, x: number, y: number, spatial: boolean, volume: number, pitch: number): void;
  /** Request a music track (the last request of a frame wins). */
  music(track: string): void;
}

export interface AudioEventState {
  /** Player index local to this machine; -1 = unknown (every player counts as local). */
  localPlayer: number;
  /** Track of the current level's biome — where music returns after a giant monster dies. */
  biomeTrack: string;
  /** Track requested for the current situation (biome, town, boss…). */
  levelTrack: string;
  isBossLevel: boolean;
  /** Position of the last harvest hit this frame (resourceHit events carry no position). */
  hitX: number;
  hitY: number;
  hasHit: boolean;
}

export function createAudioEventState(localPlayer = -1): AudioEventState {
  return { localPlayer, biomeTrack: '', levelTrack: '', isBossLevel: false, hitX: 0, hitY: 0, hasHit: false };
}

/** Call at the start of each frame's batch. */
export function beginBatch(st: AudioEventState): void {
  st.hasHit = false;
}

/** Music track for a biome id: its BiomeDef.music if the biome exists, else the id itself (aliases resolved). */
export function trackForBiome(biome: string): string {
  const def = Content.biomes.get(biome);
  return resolveTrackId(def?.music || biome);
}

/** Music for entering a level: towns → 'town', boss arenas → 'boss', the Lair keeps its own dread theme. */
export function trackForLevel(ev: { biome: string; isTown: boolean; isBoss: boolean }): string {
  const biomeTrack = trackForBiome(ev.biome);
  if (ev.isTown) return 'town';
  if (biomeTrack === 'lair') return 'lair';
  if (ev.isBoss) return 'boss';
  return biomeTrack;
}

/** Break sound per harvesting tool (ResourceDef.tool). */
const BREAK_BY_TOOL: Readonly<Record<string, string>> = {
  axe: 'tree_fall',
  pickaxe: 'rock_break',
  hammer: 'rock_break',
  net: 'pickup',
  sickle: 'harvest',
  hand: 'harvest',
};

/**
 * Sound for a broken resource node: by its content def's tool (so `amethyst_cluster`, `frost_crystal_node`…
 * crack like rock), else by def id prefix (tree_*, rock_*, chest_*, bug_*, plants…).
 */
export function resourceBreakSfx(def: string): string {
  // Containers first: chests/pots are opened by hand, so the tool table would call them 'harvest'.
  if (def.startsWith('chest_')) return 'chest_open';
  if (def === 'pot' || def.startsWith('pot_')) return 'break';
  const tool = Content.resources.get(def)?.tool;
  if (tool !== undefined && Object.prototype.hasOwnProperty.call(BREAK_BY_TOOL, tool)) return BREAK_BY_TOOL[tool]!;
  if (def.startsWith('tree_')) return 'tree_fall';
  if (def.startsWith('rock_')) return 'rock_break';
  if (def.startsWith('bug_')) return 'pickup';
  if (def.startsWith('plant_') || def.startsWith('bush_') || def.endsWith('_patch')) return 'harvest';
  return 'break';
}

function isLocal(st: AudioEventState, player: number): boolean {
  return st.localPlayer < 0 || st.localPlayer === player;
}

/** Map one GameEvent to zero or more cues. */
export function mapGameEvent(ev: GameEvent, st: AudioEventState, sink: CueSink): void {
  switch (ev.type) {
    case 'sfx': {
      const preset = SFX[resolveSfxId(ev.id)]!;
      const positioned = ev.x !== 0 || ev.y !== 0;
      // Positionless raw sfx of event-driven sounds (craft, level-up) are played by their semantic event,
      // which knows the player. Positioned ones (e.g. a craft that fails for want of a station, which has
      // no `craft` event) play spatially; the voice limiter merges them with the semantic cue.
      if (preset.eventDriven && !positioned) return;
      if (ev.id === 'chop' || ev.id === 'mine' || ev.id === 'harvest') {
        st.hitX = ev.x;
        st.hitY = ev.y;
        st.hasHit = true;
      }
      sink.sfx(ev.id, ev.x, ev.y, isSpatialCue(preset, positioned), ev.volume ?? 1, ev.pitch ?? 1);
      // The Blight Wraith has arrived: panic music until the party leaves the district.
      if (ev.id === 'wraith_spawn' && st.levelTrack !== 'invasion') {
        st.levelTrack = 'invasion';
        sink.music('invasion');
      }
      return;
    }
    case 'damage':
      if (ev.crit && !ev.toPlayer) sink.sfx('crit', ev.x, ev.y, true, 1, 1);
      return;
    case 'heal':
      sink.sfx('heal', ev.x, ev.y, true, 1, 1);
      return;
    case 'death':
      switch (ev.kind) {
        case 'boss':
          sink.sfx('boss_death', ev.x, ev.y, false, 1, 1);
          // Giant monster down: the portals open and the biome theme returns (unless something else took
          // over the music meanwhile, e.g. the Blight Wraith's invasion theme — the Wraith is still there).
          if (st.biomeTrack !== '' && st.levelTrack === 'boss') {
            st.levelTrack = st.biomeTrack;
            sink.music(st.biomeTrack);
          }
          return;
        case 'enemy':
          sink.sfx('death_enemy', ev.x, ev.y, true, 1, 1);
          return;
        case 'companion':
        case 'npc':
          sink.sfx('death_small', ev.x, ev.y, true, 1, 1);
          return;
        case 'prop':
          sink.sfx('break', ev.x, ev.y, true, 1, 1);
          return;
        case 'resource':
          sink.sfx(resourceBreakSfx(ev.def), ev.x, ev.y, true, 1, 1);
          return;
        default:
          return;
      }
    case 'craft':
      if (!isLocal(st, ev.player)) return;
      if (ev.result === null) sink.sfx('craft_fail', 0, 0, false, 1, 1);
      else {
        sink.sfx('craft', 0, 0, false, 1, 1);
        if (ev.discovered) sink.sfx('discover', 0, 0, false, 1, 1);
      }
      return;
    case 'levelUp':
      if (isLocal(st, ev.player)) sink.sfx('levelup', 0, 0, false, 1, 1);
      return;
    case 'downed':
      sink.sfx('downed', 0, 0, false, 1, isLocal(st, ev.player) ? 1 : 0.9);
      return;
    case 'revived':
      sink.sfx('revive', 0, 0, false, 1, 1);
      return;
    case 'tileBroken':
      sink.sfx('tile_break', ev.tx * TILE + TILE / 2, ev.ty * TILE + TILE / 2, true, 1, 1);
      return;
    case 'resourceHit':
      if (ev.broken) sink.sfx(resourceBreakSfx(ev.def), st.hitX, st.hitY, st.hasHit, 1, 1);
      return;
    case 'levelEnter': {
      const track = trackForLevel(ev);
      st.biomeTrack = trackForBiome(ev.biome);
      st.levelTrack = track;
      st.isBossLevel = ev.isBoss;
      sink.sfx('portal', 0, 0, false, 1, 1);
      sink.music(track);
      return;
    }
    case 'bossPhase':
      sink.sfx('boss_roar', 0, 0, false, 1, 1);
      // A roaming giant monster (no arena) waking up switches to the boss theme.
      if (st.levelTrack !== 'boss' && st.levelTrack !== 'lair') {
        st.levelTrack = 'boss';
        sink.music('boss');
      }
      return;
    case 'runOver':
      sink.sfx(ev.victory ? 'run_win' : 'run_lose', 0, 0, false, 1, 1);
      st.levelTrack = ev.victory ? 'victory' : 'gameover';
      sink.music(st.levelTrack);
      return;
    default:
      return;
  }
}
