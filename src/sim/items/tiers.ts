/**
 * Item tier for a district depth (GDD §7, levels 1–21): T1 wood/stone D1–4 · T2 iron D3–8 ·
 * T3 gold D7–13 · T4 diamond D12–18 · T5 voidshard D17+. Overlaps resolve to the lower tier until
 * the next one is fully in season.
 */
export function tierForDistrict(district: number): number {
  if (district <= 3) return 1;
  if (district <= 7) return 2;
  if (district <= 12) return 3;
  if (district <= 17) return 4;
  return 5;
}

/** Shop price inflation in percent of list price (+3% per district): deeper towns, richer delvers. */
export function pricePercent(district: number): number {
  return 100 + 3 * Math.max(0, Math.floor(district) - 1);
}

/** Shop price inflation as a multiplier (display only; prices use the integer `pricePercent`). */
export function priceMul(district: number): number {
  return pricePercent(district) / 100;
}
