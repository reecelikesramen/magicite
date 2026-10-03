/**
 * UI palette. The HUD is drawn over the (very dark) world without lighting, so colours are
 * fairly saturated; panels are translucent dark brown like the original inventory screen.
 */
export const UI = {
  panel: 0x2a2018,
  panelAlpha: 0.88,
  panelBorder: 0x4e3e2c,
  panelEdge: 0x120d08,
  slot: 0x3a3028,
  slotAlpha: 0.78,
  slotEdge: 0x16110c,
  slotHover: 0x5a4a3a,
  slotSelected: 0xd8d8d8,
  slotDisabled: 0x241c16,
  craftPick: 0xf0c040,
  held: 0x8fd0ff,
  ghost: 0x6a5a4a,

  text: 0xffffff,
  textDim: 0xb0a088,
  textMuted: 0x807060,
  gold: 0xf0d060,
  district: 0xecd27a,
  good: 0x8fe060,
  bad: 0xe85a40,
  warn: 0xf0a040,
  discover: 0xffe066,

  barFrame: 0x120d08,
  barEmpty: 0x4a4a4a,
  xpFill: 0x5cc83a,
  xpEmpty: 0x5a5a5a,
  hp: 0xd8262a,
  mana: 0x2a6ae8,
  hunger: 0x8a5428,
  stamina: 0xe8b020,
  flash: 0xffffff,

  tooltipBg: 0x16100c,
  tooltipAlpha: 0.94,

  buttonRecipe: 0xd8a830,
  buttonSort: 0xc85a8a,
  downed: 0x8a0e0e,
} as const;

/** Name/accent colour by item tier (1 wood/stone … 5 voidshard). */
export const TIER_COLORS: readonly number[] = [0xe8e0d0, 0xe8e0d0, 0xb4cce4, 0xf2d24a, 0x6ae6f4, 0xc47aff];

export function tierColor(tier: number | undefined): number {
  const t = Math.max(1, Math.min(TIER_COLORS.length - 1, Math.round(tier ?? 1)));
  return TIER_COLORS[t]!;
}

/** Fallback skill-path colours (red Warrior / blue Mage / green Ranger) when content has none. */
export const PATH_COLORS: Readonly<Record<string, number>> = {
  warrior: 0xc8343a,
  mage: 0x3a72e0,
  ranger: 0x3aaa48,
};

export const PATH_NAMES: Readonly<Record<string, string>> = {
  warrior: 'Warrior',
  mage: 'Mage',
  ranger: 'Ranger',
};

/** 0xRRGGBB → '#rrggbb' for canvas drawing. */
export function cssColor(c: number): string {
  return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Multiply an 0xRRGGBB colour's channels by `f` (0..∞, clamped). */
export function shade(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/** Linear blend between two 0xRRGGBB colours. */
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
