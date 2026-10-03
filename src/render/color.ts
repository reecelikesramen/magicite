/** Small 0xRRGGBB colour helpers shared by tile painting, sprite generators and lighting. Pure. */

export const red = (c: number): number => (c >> 16) & 255;
export const green = (c: number): number => (c >> 8) & 255;
export const blue = (c: number): number => c & 255;

export function rgb(r: number, g: number, b: number): number {
  const cr = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  const cg = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  const cb = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return (cr << 16) | (cg << 8) | cb;
}

/** Linear blend a → b by t (0..1). */
export function mix(a: number, b: number, t: number): number {
  return rgb(red(a) + (red(b) - red(a)) * t, green(a) + (green(b) - green(a)) * t, blue(a) + (blue(b) - blue(a)) * t);
}

/** Multiply every channel by f (clamped). f > 1 brightens. */
export function shade(c: number, f: number): number {
  return rgb(red(c) * f, green(c) * f, blue(c) * f);
}

/** Add a flat amount to every channel. */
export function lift(c: number, n: number): number {
  return rgb(red(c) + n, green(c) + n, blue(c) + n);
}

/** Perceived luminance 0..1. */
export function luminance(c: number): number {
  return (0.2126 * red(c) + 0.7152 * green(c) + 0.0722 * blue(c)) / 255;
}

/** Hue in degrees 0..360 and saturation 0..1 (HSV-style). */
export function hueSat(c: number): { hue: number; sat: number; val: number } {
  const r = red(c) / 255;
  const g = green(c) / 255;
  const b = blue(c) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d > 0) {
    if (max === r) hue = 60 * (((g - b) / d) % 6);
    else if (max === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, sat: max === 0 ? 0 : d / max, val: max };
}

/** Scale a colour so its brightest channel is 255 (keeps hue, drops brightness). */
export function normalizeHue(c: number): number {
  const m = Math.max(red(c), green(c), blue(c));
  if (m === 0) return 0xffffff;
  return shade(c, 255 / m);
}

export function css(c: number): string {
  return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Pick from a darkest→lightest ramp with a clamped index. */
export function ramp(arr: readonly number[], i: number): number {
  const n = arr.length;
  return arr[i < 0 ? 0 : i >= n ? n - 1 : i | 0]!;
}
