import { createRun } from '../sim';
import { MAX_PLAYERS } from '../sim/constants';
import type { GameEvent, PlayerInput } from '../sim/types';
import { emptyInput } from '../sim/types';
import type { PlayerSetup, World } from '../sim/world';

/**
 * A Session owns "the world as this machine sees it". The game loop feeds it local inputs
 * once per fixed tick and renders `world`. Implementations:
 *  - LocalSession: single-player / same-screen co-op; steps the authoritative world directly.
 *  - (net workstream) HostSession: LocalSession + broadcasts snapshots to remote peers.
 *  - (net workstream) ClientSession: predicted local player + interpolated remote state.
 */
export interface Session {
  readonly world: World;
  /** Player indices controlled from this machine (index 0 = primary local player). */
  readonly localPlayers: readonly number[];
  tick(local: ReadonlyMap<number, PlayerInput>): void;
  /** Drain presentation events produced since the last call. */
  drainEvents(): GameEvent[];
  dispose(): void;
}

export class LocalSession implements Session {
  readonly world: World;
  readonly localPlayers: number[];
  private pending: GameEvent[] = [];
  private inputs: PlayerInput[] = [];

  constructor(seed: number, setups: PlayerSetup[]) {
    this.world = createRun(seed, setups);
    this.localPlayers = setups.map((_, i) => i);
    // Level-enter events fired during createRun are useful to the UI too.
    this.pending.push(...this.world.events);
  }

  tick(local: ReadonlyMap<number, PlayerInput>): void {
    for (let i = 0; i < MAX_PLAYERS; i++) this.inputs[i] = local.get(i) ?? emptyInput();
    this.world.step(this.inputs);
    for (const ev of this.world.events) this.pending.push(ev);
  }

  drainEvents(): GameEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  dispose(): void {}
}
