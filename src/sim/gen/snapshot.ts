import type { GenCtx } from './types';

/** Copy of the mutable generator state (tiles, back walls, flags, static lights) for rollback. */
export interface Snapshot {
  fg: Uint8Array;
  bg: Uint8Array;
  flags: Uint8Array;
  lights: number;
}

export function snapshot(ctx: GenCtx): Snapshot {
  return { fg: ctx.grid.fg.slice(), bg: ctx.grid.bg.slice(), flags: ctx.flags.slice(), lights: ctx.lights.length };
}

export function restore(ctx: GenCtx, s: Snapshot): void {
  ctx.grid.fg.set(s.fg);
  ctx.grid.bg.set(s.bg);
  ctx.flags.set(s.flags);
  ctx.lights.length = s.lights;
}

/**
 * Optional per-feature check used by dressing passes in guarded mode: called after a feature
 * (pool, basin, spike row, ledge) is placed; false = roll that feature back.
 */
export type FeatureCheck = (() => boolean) | undefined;

/** Run `place` as one feature: snapshot first when `check` is set, roll back if it fails. */
export function feature(ctx: GenCtx, check: FeatureCheck, place: () => boolean): boolean {
  if (!check) return place();
  const s = snapshot(ctx);
  if (!place()) return false;
  if (check()) return true;
  restore(ctx, s);
  return false;
}
