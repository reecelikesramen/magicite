/**
 * Voice limiting: caps simultaneous voices per sfx id and overall, and drops retriggers of the same id
 * closer than its `gap` (so 12 arrows landing in one frame don't sum into a clipping wall of noise, and
 * a sound reported by both a raw `sfx` event and its semantic event plays once). Pure: time is passed in.
 */
export class VoiceLimiter {
  /** id → end times of playing voices. Arrays are reused (no per-play allocation once warm). */
  private readonly active = new Map<string, number[]>();
  private readonly lastStart = new Map<string, number>();
  private total = 0;

  constructor(readonly maxTotal = 24) {}

  /** Number of voices currently counted as playing (after pruning at `now`). */
  playing(now: number): number {
    this.pruneAll(now);
    return this.total;
  }

  /**
   * Try to start a voice of `id` lasting `duration` seconds at time `now`. Returns false (and records
   * nothing) if it would exceed `maxVoices` for the id, the global cap, or retrigger within `gap`.
   */
  tryStart(id: string, now: number, duration: number, maxVoices: number, gap: number): boolean {
    const last = this.lastStart.get(id);
    if (last !== undefined && now - last < gap && now >= last) return false;
    let list = this.active.get(id);
    if (!list) {
      list = [];
      this.active.set(id, list);
    }
    this.prune(list, now);
    if (list.length >= maxVoices) return false;
    if (this.total >= this.maxTotal) {
      this.pruneAll(now);
      if (this.total >= this.maxTotal) return false;
    }
    list.push(now + duration);
    this.total++;
    this.lastStart.set(id, now);
    return true;
  }

  reset(): void {
    this.active.clear();
    this.lastStart.clear();
    this.total = 0;
  }

  private prune(list: number[], now: number): void {
    let w = 0;
    for (let r = 0; r < list.length; r++) {
      const end = list[r]!;
      if (end > now) list[w++] = end;
      else this.total--;
    }
    list.length = w;
  }

  private pruneAll(now: number): void {
    for (const list of this.active.values()) this.prune(list, now);
  }
}
