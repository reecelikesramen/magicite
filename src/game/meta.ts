import { Content } from '../content';
import { UNLOCKS, type UnlockCheck, type UnlockRule } from '../content/unlocks';
import type { CompanionDef, HatDef, RaceDef } from '../content/types';
import { hashSeed, Rng } from '../engine/rng';
import { dailySeed } from '../sim/progression/creation';
import type { RunStats } from '../sim/types';
import type { World } from '../sim/world';

/**
 * Meta-progression (GDD §3/§10/§11): lifetime stats and unlocks persisted across runs. The core is
 * pure and deterministic (`evaluateUnlocks`, `applyRun`); only `loadMeta` / `saveMeta` touch
 * browser storage (localStorage, every access wrapped in try/catch).
 */

export const META_VERSION = 1;
export const META_KEY = 'shardfall.meta';

export interface MetaSave {
  version: number;
  /** Unlock ids earned (see src/content/unlocks.ts). */
  unlocked: string[];
  /** Summed run stats over all runs (level / district keep the best value instead). */
  lifetime: Record<string, number>;
  runs: number;
  wins: number;
  bestDistrict: number;
  bestLevel: number;
  /** Last daily date played ("YYYY-MM-DD"), if any. */
  lastDaily?: string;
}

/** How a run ended, plus context the unlock rules can read. */
export interface RunOutcome {
  victory: boolean;
  /** Deepest district reached. */
  district: number;
  /** Highest level reached. */
  level: number;
  difficulty: 'normal' | 'madcap';
  /** Run length in ticks (60/s). */
  ticks: number;
  /** Practice runs record nothing and unlock nothing (GDD §11). */
  practice?: boolean;
  /** Daily date string if this was a daily run. */
  daily?: string;
}

/** Stats whose lifetime value is the best single-run value rather than a sum. */
const MAX_KEYS = new Set(['level', 'district']);

export function emptyMeta(): MetaSave {
  return { version: META_VERSION, unlocked: [], lifetime: {}, runs: 0, wins: 0, bestDistrict: 0, bestLevel: 0 };
}

/** The flat stat record unlock conditions read for one run. */
export function runSummary(runStats: Readonly<RunStats>, outcome: RunOutcome): Record<string, number> {
  const s: Record<string, number> = {};
  for (const [k, v] of Object.entries(runStats)) if (typeof v === 'number' && Number.isFinite(v)) s[k] = v;
  s.victory = outcome.victory ? 1 : 0;
  s.district = Math.max(outcome.district, s.district ?? 0);
  s.level = Math.max(outcome.level, s.level ?? 0);
  s.madcap = outcome.difficulty === 'madcap' ? 1 : 0;
  s.minutes = Math.floor(outcome.ticks / 3600);
  return s;
}

/** Lifetime totals after adding one run summary (pure). */
export function lifetimeAfter(meta: MetaSave, summary: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = { ...meta.lifetime };
  for (const [k, v] of Object.entries(summary)) out[k] = MAX_KEYS.has(k) ? Math.max(out[k] ?? 0, v) : (out[k] ?? 0) + v;
  out.runs = meta.runs + 1;
  out.wins = meta.wins + (summary.victory ? 1 : 0);
  return out;
}

function check(stats: Readonly<Record<string, number>>, c: UnlockCheck): boolean {
  const v = stats[c.stat] ?? 0;
  if (c.atLeast !== undefined && v < c.atLeast) return false;
  if (c.atMost !== undefined && v > c.atMost) return false;
  return true;
}

/** Does a rule's condition (ignoring its chance) hold for these run / lifetime stats? */
export function unlockConditionMet(rule: UnlockRule, run: Readonly<Record<string, number>>, lifetime: Readonly<Record<string, number>>): boolean {
  const stats = rule.scope === 'lifetime' ? lifetime : run;
  if (!check(stats, { stat: rule.condition.stat, atLeast: rule.condition.atLeast })) return false;
  for (const c of rule.also ?? []) if (!check(stats, c)) return false;
  return true;
}

/**
 * Roll the end-of-run unlocks. Pure and deterministic: each rule's chance roll uses its own Rng
 * seeded from (seed, number of previous runs, unlock id), so results don't depend on rule order
 * and replaying the same seed on a later run rolls again. Returns the newly unlocked ids in rule
 * order (already-unlocked rules are skipped). Practice runs unlock nothing.
 */
export function evaluateUnlocks(meta: MetaSave, runStats: Readonly<RunStats>, outcome: RunOutcome, seed: number): string[] {
  if (outcome.practice) return [];
  const run = runSummary(runStats, outcome);
  const life = lifetimeAfter(meta, run);
  const have = new Set(meta.unlocked);
  const out: string[] = [];
  for (const rule of UNLOCKS) {
    if (have.has(rule.id) || !unlockConditionMet(rule, run, life)) continue;
    if (rule.chance >= 1 || new Rng(hashSeed(`${seed}:${meta.runs}:${rule.id}`)).next() < rule.chance) out.push(rule.id);
  }
  return out;
}

/** Record a finished run: returns the updated save (new object) and the newly unlocked ids. */
export function applyRun(meta: MetaSave, runStats: Readonly<RunStats>, outcome: RunOutcome, seed: number): { meta: MetaSave; unlocked: string[] } {
  if (outcome.practice) return { meta, unlocked: [] };
  const unlocked = evaluateUnlocks(meta, runStats, outcome, seed);
  const summary = runSummary(runStats, outcome);
  const next: MetaSave = {
    ...meta,
    version: META_VERSION,
    unlocked: [...meta.unlocked, ...unlocked],
    lifetime: lifetimeAfter(meta, summary),
    runs: meta.runs + 1,
    wins: meta.wins + (outcome.victory ? 1 : 0),
    bestDistrict: Math.max(meta.bestDistrict, summary.district ?? 0),
    bestLevel: Math.max(meta.bestLevel, summary.level ?? 0),
  };
  if (outcome.daily) next.lastDaily = outcome.daily;
  return { meta: next, unlocked };
}

/** Outcome of `world`'s run as seen by player `index`. */
export function outcomeFromWorld(world: World, index = 0, extra: Partial<RunOutcome> = {}): RunOutcome {
  const p = world.players[index];
  return {
    victory: world.run.victory,
    district: Math.max(world.level?.info.district ?? 1, p?.runStats.district ?? 0),
    level: p?.level ?? 1,
    difficulty: world.run.difficulty,
    ticks: world.run.ticks,
    ...extra,
  };
}

// --- Availability ------------------------------------------------------------------------------

export function isUnlocked(meta: MetaSave, unlockId: string | undefined): boolean {
  return !unlockId || meta.unlocked.includes(unlockId);
}

export function availableRaces(meta: MetaSave): RaceDef[] {
  return [...Content.races.values()].filter((r) => r.unlockedByDefault || isUnlocked(meta, r.unlock));
}

export function availableHats(meta: MetaSave): HatDef[] {
  return [...Content.hats.values()].filter((h) => isUnlocked(meta, h.unlock));
}

export function availableCompanions(meta: MetaSave): CompanionDef[] {
  return [...Content.companions.values()].filter((c) => isUnlocked(meta, c.unlock));
}

/** Content ids granted by an unlock id (reverse of RaceDef/HatDef/CompanionDef.unlock). */
export function unlockTargets(unlockId: string): { races: string[]; hats: string[]; companions: string[] } {
  return {
    races: [...Content.races.values()].filter((r) => r.unlock === unlockId).map((r) => r.id),
    hats: [...Content.hats.values()].filter((h) => h.unlock === unlockId).map((h) => h.id),
    companions: [...Content.companions.values()].filter((c) => c.unlock === unlockId).map((c) => c.id),
  };
}

/** Human-readable reward line for an unlock ("New race: Highborn"). */
export function describeUnlock(unlockId: string): string {
  const t = unlockTargets(unlockId);
  const names: string[] = [];
  for (const id of t.races) names.push(`New race: ${Content.races.get(id)!.name}`);
  for (const id of t.hats) names.push(`New hat: ${Content.hats.get(id)!.name}`);
  for (const id of t.companions) names.push(`New companion: ${Content.companions.get(id)!.name}`);
  return names.join(' / ') || Content.unlocks.get(unlockId)?.name || unlockId;
}

// --- Persistence (browser glue) ----------------------------------------------------------------

/** Minimal storage interface (window.localStorage, or a stub in tests / the desktop shell). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | undefined {
  try {
    return (globalThis as { localStorage?: KeyValueStore }).localStorage;
  } catch {
    return undefined;
  }
}

/** Validate / migrate parsed JSON into a MetaSave (unknown fields dropped, bad values reset). */
export function normalizeMeta(raw: unknown): MetaSave {
  const m = emptyMeta();
  if (!raw || typeof raw !== 'object') return m;
  const r = raw as Partial<MetaSave>;
  if (typeof r.version === 'number' && r.version > META_VERSION) return m; // from a newer build: don't clobber-parse
  if (Array.isArray(r.unlocked)) m.unlocked = [...new Set(r.unlocked.filter((x): x is string => typeof x === 'string'))];
  if (r.lifetime && typeof r.lifetime === 'object') {
    for (const [k, v] of Object.entries(r.lifetime)) if (typeof v === 'number' && Number.isFinite(v)) m.lifetime[k] = v;
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  m.runs = num(r.runs);
  m.wins = num(r.wins);
  m.bestDistrict = num(r.bestDistrict);
  m.bestLevel = num(r.bestLevel);
  if (typeof r.lastDaily === 'string') m.lastDaily = r.lastDaily;
  return m;
}

export function loadMeta(store: KeyValueStore | undefined = defaultStore()): MetaSave {
  try {
    const s = store?.getItem(META_KEY);
    return s ? normalizeMeta(JSON.parse(s)) : emptyMeta();
  } catch {
    return emptyMeta();
  }
}

/** Version of the save currently in `store` (0 = none / unreadable). */
function storedVersion(store: KeyValueStore): number {
  try {
    const s = store.getItem(META_KEY);
    const v = s ? (JSON.parse(s) as { version?: unknown } | null)?.version : 0;
    return typeof v === 'number' ? v : 0;
  } catch {
    return 0;
  }
}

/** Persist `meta`. Refuses (returns false) to overwrite a save written by a newer build. */
export function saveMeta(meta: MetaSave, store: KeyValueStore | undefined = defaultStore()): boolean {
  try {
    if (!store) return false;
    if (storedVersion(store) > META_VERSION) return false;
    store.setItem(META_KEY, JSON.stringify({ ...meta, version: META_VERSION }));
    return true;
  } catch {
    return false;
  }
}

/**
 * End-of-run glue: evaluate unlocks for local player `index`, persist, and return what changed so
 * the run-summary screen can play its fanfare.
 */
export function finishRun(world: World, index = 0, opts: { practice?: boolean; daily?: string; store?: KeyValueStore } = {}): { meta: MetaSave; unlocked: string[] } {
  const store = opts.store ?? defaultStore();
  const before = loadMeta(store);
  const p = world.players[index];
  if (!p) return { meta: before, unlocked: [] };
  const outcome = outcomeFromWorld(world, index, { practice: opts.practice, daily: opts.daily });
  const res = applyRun(before, p.runStats, outcome, world.seed);
  if (!opts.practice) saveMeta(res.meta, store);
  return res;
}

// --- Daily run ---------------------------------------------------------------------------------

export { dailySeed };

/** Local calendar date as "YYYY-MM-DD" (browser glue; the sim never reads the clock). */
export function todayString(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
