import type { GameEvent } from '../sim/types';
import { loadZzfx } from './zzfx';

/**
 * PLACEHOLDER (scaffold). The audio workstream implements procedural SFX (zzfx) and chiptune
 * music, reacting to GameEvents with simple spatialisation around the listener.
 */
export class AudioManager {
  /** Browsers require a user gesture before audio can start. */
  unlock(): void {
    void loadZzfx();
  }
  setListener(_x: number, _y: number): void {}
  handleEvents(_events: readonly GameEvent[]): void {}
  /** Switch background music by track id (biome music id, 'town', 'boss', 'title'). */
  playMusic(_track: string): void {}
  setVolumes(_v: { master?: number; music?: number; sfx?: number }): void {}
}
