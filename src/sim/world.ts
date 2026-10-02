import { Rng, type RngState } from '../engine/rng';
import type { Rect } from '../engine/math';
import { MAX_PLAYERS } from './constants';
import type { TileGrid } from './tiles';
import type { Entity, EntityKind, GameEvent, PlayerInput, PlayerState, Team } from './types';
import { emptyInput } from './types';

export interface LevelInfo {
  /** 1-based district depth. Towns share the depth of the district they follow. */
  district: number;
  biome: string;
  /** Display name, e.g. "District 1: Toadvale Forest". */
  name: string;
  isTown: boolean;
  isBoss: boolean;
  seed: number;
}

/** Something the generator wants spawned when the level loads. x,y = bottom-centre in px. */
export interface SpawnSpec {
  kind: EntityKind;
  def: string;
  x: number;
  y: number;
  /** Extra data, e.g. chest loot tier or NPC id. */
  data?: Record<string, number | string>;
}

export interface StaticLight {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
}

export interface Level {
  info: LevelInfo;
  grid: TileGrid;
  /** Player spawn, bottom-centre px. */
  spawn: { x: number; y: number };
  /** Exit portal rect in px (players press interact inside it). */
  exit: Rect;
  spawns: SpawnSpec[];
  lights: StaticLight[];
}

export interface RunState {
  seed: number;
  /** Ordered biome ids of districts chosen so far. */
  path: string[];
  over: boolean;
  victory: boolean;
  /** Ticks since the run started. */
  ticks: number;
  /** Players who have entered the exit portal this level. */
  exited: number[];
}

export interface PlayerSetup {
  name: string;
  race: string;
  hat: string;
  companion: string;
}

export type System = (world: World) => void;

/**
 * The whole deterministic simulation. Advance with `step(inputs)` at exactly TICK_RATE Hz.
 * Systems (see systems.ts) are plain functions that read/write this object.
 */
export class World {
  tick = 0;
  rng: Rng;
  level!: Level;
  entities: Entity[] = [];
  players: PlayerState[] = [];
  /** Inputs for the current tick, indexed by player index. */
  inputs: PlayerInput[] = [];
  /** Events emitted during the current tick (cleared at the start of each step). */
  events: GameEvent[] = [];
  run: RunState;
  /** Hit-stop ticks: when > 0 most systems skip (juice on heavy hits). */
  freeze = 0;
  private byId = new Map<number, Entity>();
  private nextId = 1;

  constructor(
    readonly seed: number,
    private readonly systems: readonly System[],
  ) {
    this.rng = new Rng(seed);
    this.run = { seed, path: [], over: false, victory: false, ticks: 0, exited: [] };
  }

  /** Advance one fixed tick. */
  step(inputs: readonly PlayerInput[]): void {
    this.events.length = 0;
    for (let i = 0; i < MAX_PLAYERS; i++) this.inputs[i] = inputs[i] ?? emptyInput();
    for (const e of this.entities) {
      e.px = e.x;
      e.py = e.y;
    }
    for (const sys of this.systems) sys(this);
    this.cleanup();
    this.tick++;
    this.run.ticks++;
  }

  emit(ev: GameEvent): void {
    this.events.push(ev);
  }

  get(id: number): Entity | undefined {
    return this.byId.get(id);
  }

  /** Create an entity with sane defaults; override anything via `init`. */
  spawn(kind: EntityKind, def: string, x: number, y: number, init: Partial<Entity> = {}): Entity {
    const team: Team = kind === 'player' || kind === 'companion' ? 'player' : kind === 'enemy' || kind === 'boss' ? 'enemy' : 'neutral';
    const e: Entity = {
      id: this.nextId++,
      kind,
      def,
      team,
      x,
      y,
      w: 8,
      h: 8,
      vx: 0,
      vy: 0,
      px: x,
      py: y,
      facing: 1,
      onGround: false,
      wallDir: 0,
      hitCeiling: false,
      inLiquid: false,
      onLadder: false,
      gravityScale: 1,
      collides: true,
      usesPlatforms: true,
      hp: 1,
      maxHp: 1,
      armor: 0,
      invuln: 0,
      hurt: 0,
      dead: false,
      age: 0,
      anim: 'idle',
      animT: 0,
      status: [],
      kbResist: 0,
      ...init,
    };
    e.px = e.x;
    e.py = e.y;
    this.entities.push(e);
    this.byId.set(e.id, e);
    return e;
  }

  /** Spawn with x,y given as bottom-centre (how generators and drops specify positions). */
  spawnAt(kind: EntityKind, def: string, cx: number, bottom: number, w: number, h: number, init: Partial<Entity> = {}): Entity {
    return this.spawn(kind, def, cx - w / 2, bottom - h, { w, h, ...init });
  }

  /** Mark for removal at the end of the tick. */
  kill(e: Entity): void {
    e.dead = true;
  }

  playerEntity(index: number): Entity | undefined {
    const p = this.players[index];
    return p ? this.byId.get(p.entityId) : undefined;
  }

  /** Living, non-downed player entities. */
  activePlayers(): Entity[] {
    const out: Entity[] = [];
    for (const p of this.players) {
      if (p.downed || p.out) continue;
      const e = this.byId.get(p.entityId);
      if (e && !e.dead) out.push(e);
    }
    return out;
  }

  /** Iterate entities of a kind (allocation-free callback form). */
  each(kind: EntityKind, fn: (e: Entity) => void): void {
    for (const e of this.entities) if (e.kind === kind && !e.dead) fn(e);
  }

  /**
   * Replace the current level. Non-player entities are discarded; players are moved to the
   * spawn point. Spawning the generator's SpawnSpecs is done by the `onLevelLoad` hook
   * (see systems.ts) so content-specific logic stays out of the core.
   */
  loadLevel(level: Level, onLoad?: (world: World) => void): void {
    this.level = level;
    const keep = new Set(this.players.map((p) => p.entityId));
    this.entities = this.entities.filter((e) => keep.has(e.id));
    this.byId = new Map(this.entities.map((e) => [e.id, e]));
    this.run.exited = [];
    let i = 0;
    for (const p of this.players) {
      const e = this.byId.get(p.entityId);
      if (!e) continue;
      e.x = level.spawn.x - e.w / 2 + (i - (this.players.length - 1) / 2) * 6;
      e.y = level.spawn.y - e.h;
      e.px = e.x;
      e.py = e.y;
      e.vx = 0;
      e.vy = 0;
      i++;
    }
    onLoad?.(this);
    this.emit({ type: 'levelEnter', district: level.info.district, biome: level.info.biome, name: level.info.name, isTown: level.info.isTown, isBoss: level.info.isBoss });
  }

  private cleanup(): void {
    let w = 0;
    for (let r = 0; r < this.entities.length; r++) {
      const e = this.entities[r]!;
      // Player entities are never removed; death is a state on PlayerState.
      if (e.dead && e.kind !== 'player') {
        this.byId.delete(e.id);
        continue;
      }
      e.age++;
      this.entities[w++] = e;
    }
    this.entities.length = w;
  }

  /** Serializable snapshot of RNG (TileGrid/entities are already plain data). */
  rngState(): RngState {
    return this.rng.getState();
  }
}
