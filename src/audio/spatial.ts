/**
 * 2D spatialisation around the listener (the local player). World units are native pixels; the view is
 * ≈320×180 px, so sounds are full volume within ~a third of a screen and silent beyond ≈1.5 screens.
 */
export const SPATIAL = {
  /** Full volume inside this distance (px). */
  near: 96,
  /** Silent beyond this distance (px). */
  far: 420,
  /** Vertical distance counts extra (the view is wider than tall). */
  yWeight: 1.4,
  /** |dx| at which panning saturates. */
  panRange: 180,
  /** Maximum |pan| (never hard-pan a sound into one ear). */
  maxPan: 0.75,
} as const;

export interface SpatialOut {
  gain: number;
  pan: number;
}

/** Gain (0..1) and stereo pan (-1..1) for a source offset (dx, dy) from the listener. Writes into `out`. */
export function spatialize(dx: number, dy: number, out: SpatialOut): SpatialOut {
  const yy = dy * SPATIAL.yWeight;
  const d = Math.sqrt(dx * dx + yy * yy);
  if (d <= SPATIAL.near) out.gain = 1;
  else if (d >= SPATIAL.far) out.gain = 0;
  else {
    const t = 1 - (d - SPATIAL.near) / (SPATIAL.far - SPATIAL.near);
    out.gain = t * t;
  }
  let p = dx / SPATIAL.panRange;
  if (p > 1) p = 1;
  else if (p < -1) p = -1;
  out.pan = p * SPATIAL.maxPan;
  return out;
}
