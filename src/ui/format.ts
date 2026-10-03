/**
 * Pure text helpers for the UI: names, tooltips, recipe lines, feedback strings, run summary.
 * No Pixi/DOM access (measureText is pure glyph-width math).
 */
import { Content, recipeKey } from '../content';
import type { ItemCategory, ItemDef, SkillDef, StatMods } from '../content/types';
import { measureText } from '../render/pixelfont';
import { TICK_RATE } from '../sim/constants';
import type { GameEvent, ItemStack, RunStats } from '../sim/types';
import { PATH_COLORS, PATH_NAMES, UI, tierColor } from './theme';

/** 'iron_bar' → 'Iron Bar', 'bossKills' → 'Boss Kills'. */
export function humanize(id: string): string {
  return id
    .replace(/^#/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

export function itemName(id: string): string {
  const d = Content.items.get(id);
  if (d) return d.name;
  if (id.startsWith('#')) return `Any ${humanize(id)}`;
  return humanize(id);
}

export function fraction(cur: number, max: number): string {
  return `${Math.max(0, Math.floor(cur))}/${Math.max(0, Math.floor(max))}`;
}

/** Greedy word wrap to `maxW` px using the pixel font metrics. */
export function wrapText(text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measureText(next) > maxW) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Truncate with '..' so the text fits in `maxW` px. */
export function fitText(text: string, maxW: number): string {
  if (measureText(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && measureText(`${t}..`) > maxW) t = t.slice(0, -1);
  return `${t}..`;
}

// ---------------------------------------------------------------------------------------------
// Durability
// ---------------------------------------------------------------------------------------------

type DurableDef = ItemDef & { durability?: number; maxDurability?: number };

/** Max durability from the item def if the items workstream defines it (field name tolerant). */
export function defMaxDurability(def: ItemDef | undefined): number | undefined {
  if (!def) return undefined;
  const d = def as DurableDef;
  const v = d.maxDurability ?? d.durability;
  return typeof v === 'number' && v > 0 ? v : undefined;
}

/** 0..1 durability left, or null when the stack has no durability. `seenMax` = best known max. */
export function durabilityFrac(stack: ItemStack | null, def: ItemDef | undefined, seenMax?: number): number | null {
  if (!stack || stack.durability === undefined) return null;
  const max = Math.max(defMaxDurability(def) ?? 0, seenMax ?? 0, stack.durability);
  return max > 0 ? Math.max(0, Math.min(1, stack.durability / max)) : null;
}

/**
 * Remembers the largest durability seen per item id so a bar can be drawn even when the item
 * def has no explicit max (fresh items are first seen at full durability).
 */
export class DurabilityMemory {
  private max = new Map<string, number>();

  frac(stack: ItemStack | null): number | null {
    if (!stack || stack.durability === undefined) return null;
    const prev = this.max.get(stack.id) ?? 0;
    if (stack.durability > prev) this.max.set(stack.id, stack.durability);
    return durabilityFrac(stack, Content.items.get(stack.id), this.max.get(stack.id));
  }

  seenMax(id: string): number | undefined {
    return this.max.get(id);
  }
}

// ---------------------------------------------------------------------------------------------
// Tooltips
// ---------------------------------------------------------------------------------------------

export interface TipLine {
  text: string;
  color: number;
}

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  material: 'Material',
  weapon: 'Weapon',
  tool: 'Tool',
  armor: 'Armor',
  accessory: 'Accessory',
  hat: 'Hat',
  ammo: 'Ammo',
  consumable: 'Consumable',
  placeable: 'Placeable',
  key: 'Key Item',
};

const SLOT_LABEL: Record<string, string> = {
  head: 'Head',
  body: 'Body',
  accessory1: 'Accessory',
  accessory2: 'Accessory',
  ammo: 'Ammo',
  trinket: 'Trinket',
};

const MOD_LABELS: Record<string, [string, 'flat' | 'pct']> = {
  maxHp: ['HP', 'flat'],
  maxMana: ['Mana', 'flat'],
  maxHunger: ['Food', 'flat'],
  maxStamina: ['Stamina', 'flat'],
  atk: ['ATK', 'flat'],
  dex: ['DEX', 'flat'],
  mag: ['MAG', 'flat'],
  lck: ['LCK', 'flat'],
  def: ['DEF', 'flat'],
  moveSpeed: ['Speed', 'pct'],
  jump: ['Jump', 'pct'],
  attackSpeed: ['Attack speed', 'pct'],
  critChance: ['Crit', 'pct'],
  lifeSteal: ['Lifesteal', 'pct'],
  manaRegen: ['Mana regen', 'pct'],
  hungerRate: ['Hunger rate', 'pct'],
  luck: ['Luck', 'pct'],
  airJumps: ['Air jumps', 'flat'],
  lightRadius: ['Light', 'pct'],
  goldFind: ['Gold find', 'pct'],
};

const signed = (v: number): string => (v >= 0 ? `+${v}` : `${v}`);

/** "+1 ATK", "+10% Speed", "+25% fire res" … */
export function modLines(mods: StatMods | undefined): string[] {
  if (!mods) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(mods)) {
    if (k === 'resist') {
      for (const [t, r] of Object.entries(v as Record<string, number>)) if (r) out.push(`${signed(Math.round(r * 100))}% ${t} res`);
      continue;
    }
    if (typeof v !== 'number' || v === 0) continue;
    const [label, kind] = MOD_LABELS[k] ?? [humanize(k), 'flat'];
    out.push(kind === 'pct' ? `${signed(Math.round(v * 100))}% ${label}` : `${signed(v)} ${label}`);
  }
  return out;
}

const secsText = (s: number): string => `${Number.isInteger(s) ? s : s.toFixed(1)}s`;

export interface TooltipOpts {
  /** Wrap width for the description (px). */
  width?: number;
  /** Largest durability seen for this item id (when the def has no max). */
  seenMaxDurability?: number;
  /** Omit the "Right-click to …" action hint (recipe book, shops). */
  noHint?: boolean;
}

/** Tooltip content for an item: name (tier colour), kind, description, stats, mods, hint. */
export function itemTooltip(id: string, stack: ItemStack | null, opts: TooltipOpts = {}): TipLine[] {
  const def = Content.items.get(id);
  const width = opts.width ?? 112;
  if (!def) return [{ text: itemName(id), color: UI.text }, { text: 'Unknown item', color: UI.textMuted }];
  const lines: TipLine[] = [{ text: def.name, color: tierColor(def.tier) }];
  let kind = CATEGORY_LABEL[def.category] ?? humanize(def.category);
  if (def.tool) kind = humanize(def.tool);
  if (def.equipSlot) kind += ` - ${SLOT_LABEL[def.equipSlot] ?? humanize(def.equipSlot)}`;
  lines.push({ text: `${kind} - Tier ${def.tier}`, color: UI.textMuted });
  if (def.description) for (const l of wrapText(def.description, width)) lines.push({ text: l, color: UI.textDim });

  const stat = (text: string, color: number = UI.text) => lines.push({ text, color });
  if (def.damage) stat(`Damage ${def.damage}${def.damageType && def.damageType !== 'physical' ? ` ${def.damageType}` : ''}`);
  if (def.cooldown) stat(`Cooldown ${secsText(def.cooldown)}`);
  if (def.manaCost) stat(`Mana cost ${def.manaCost}`, 0x8fb8ff);
  if (def.tool && def.toolPower) stat(`${humanize(def.tool)} power ${def.toolPower}`);
  if (def.ammoType) stat(`Uses ${def.ammoType}`, UI.textDim);
  for (const s of def.onHit ?? []) stat(`${Math.round(s.chance * 100)}% ${s.id} on hit`, UI.warn);
  const c = def.consume;
  if (c) {
    if (c.heal) stat(`${signed(c.heal)} HP`, UI.good);
    if (c.mana) stat(`${signed(c.mana)} Mana`, UI.good);
    if (c.food) stat(`${signed(c.food)} Food`, UI.good);
    if (c.stamina) stat(`${signed(c.stamina)} Stamina`, UI.good);
    for (const s of c.status ?? []) stat(`${humanize(s.id)} ${secsText(s.duration)}`, UI.good);
    for (const m of modLines(c.permanent)) stat(`${m} forever`, UI.discover);
  }
  for (const m of modLines(def.mods)) stat(m, UI.good);
  const frac = durabilityFrac(stack, def, opts.seenMaxDurability);
  if (frac !== null && stack?.durability !== undefined) {
    const max = Math.max(defMaxDurability(def) ?? 0, opts.seenMaxDurability ?? 0, stack.durability);
    stat(`Durability ${stack.durability}/${max}`, frac < 0.25 ? UI.bad : UI.text);
  }
  if (def.value > 0) stat(`Value ${def.value} gold`, UI.gold);
  const hint = def.equipSlot || def.category === 'hat' || def.category === 'ammo' || def.category === 'accessory'
    ? 'Right-click to equip'
    : def.use === 'consume' || def.consume
      ? 'Right-click to use'
      : '';
  if (hint && !opts.noHint) stat(hint, UI.textMuted);
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Crafting / recipes / pickups
// ---------------------------------------------------------------------------------------------

export interface RecipeEntry {
  key: string;
  a: string;
  b: string;
  result: string;
  count: number;
  station?: string;
}

/** Known recipe keys ("a+b", see recipeKey) → displayable entries, in discovery order. */
export function recipeEntries(known: readonly string[]): RecipeEntry[] {
  const out: RecipeEntry[] = [];
  for (const key of known) {
    const r = Content.recipes.get(key);
    if (r) {
      out.push({ key, a: r.a, b: r.b, result: r.result, count: r.count, station: r.station });
      continue;
    }
    const plus = key.indexOf('+');
    if (plus < 0) continue;
    out.push({ key, a: key.slice(0, plus), b: key.slice(plus + 1), result: '?', count: 1 });
  }
  return out;
}

export function recipeLine(e: RecipeEntry): string {
  const res = e.result === '?' ? '???' : itemName(e.result);
  return `${itemName(e.a)} + ${itemName(e.b)} = ${res}${e.count > 1 ? ` x${e.count}` : ''}`;
}

export { recipeKey };

export interface CraftLike {
  result: string | null;
  count: number;
  discovered: boolean;
}

export function craftFeedback(ev: CraftLike): { text: string; color: number } {
  if (!ev.result) return { text: 'Nothing happens...', color: UI.textDim };
  const name = itemName(ev.result);
  if (ev.discovered) return { text: `Discovered: ${name}!`, color: UI.discover };
  return { text: `Crafted ${name}${ev.count > 1 ? ` x${ev.count}` : ''}`, color: UI.text };
}

export function pickupText(count: number, id: string): string {
  return `+${count} ${itemName(id)}`;
}

export interface ToastSpec {
  text: string;
  color: number;
  /** Seconds on screen. */
  ttl: number;
}

/**
 * The bottom-centre toast (if any) a sim event produces for local player `me`. Craft results
 * toast only while the inventory is closed (it has its own feedback line).
 */
export function eventToast(ev: GameEvent, me: number, nameOf: (player: number) => string, inventoryOpen = false): ToastSpec | null {
  switch (ev.type) {
    case 'message':
      return ev.player === undefined || ev.player === me ? { text: ev.text, color: ev.color ?? UI.text, ttl: 3 } : null;
    case 'downed':
      return ev.player === me ? null : { text: `${nameOf(ev.player)} is down!`, color: UI.bad, ttl: 3 };
    case 'revived':
      return { text: ev.player === me ? "You're back on your feet!" : `${nameOf(ev.player)} is back up!`, color: UI.good, ttl: 2.5 };
    case 'craft': {
      if (ev.player !== me || inventoryOpen) return null;
      const fb = craftFeedback(ev);
      return { ...fb, ttl: 2.5 };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Level banner / skills / run summary
// ---------------------------------------------------------------------------------------------

/** "District 3: Hollow Deep" → "Hollow Deep". */
export function stripDistrictPrefix(name: string): string {
  return name.replace(/^\s*district\s+\d+\s*[:\-]\s*/i, '');
}

export interface LevelLike {
  district: number;
  name: string;
  isTown: boolean;
  isBoss: boolean;
}

export function levelBanner(ev: LevelLike): { kicker: string; title: string; sub: string } {
  const title = stripDistrictPrefix(ev.name) || ev.name;
  const kicker = ev.isTown ? 'Town' : `District ${ev.district}`;
  const sub = ev.isBoss ? 'A giant monster lurks here...' : ev.isTown ? 'Rest, trade and craft in safety' : '';
  return { kicker, title, sub };
}

export interface SkillInfo {
  id: string;
  name: string;
  path: string;
  pathName: string;
  color: number;
  description: string;
  cooldown: number;
  known: boolean;
}

/** Skill display info with graceful placeholders while content is empty. */
export function skillInfo(id: string): SkillInfo {
  const def: SkillDef | undefined = Content.skills.get(id);
  const path = def?.path ?? guessPath(id);
  const pathDef = Content.skillPaths.get(path as SkillDef['path']);
  return {
    id,
    name: def?.name ?? humanize(id || 'unknown'),
    path,
    pathName: pathDef?.name ?? PATH_NAMES[path] ?? humanize(path),
    color: pathDef?.color ?? PATH_COLORS[path] ?? 0x8a7a6a,
    description: def?.description ?? 'A mysterious technique.',
    cooldown: def?.cooldown ?? 0,
    known: !!def,
  };
}

const PATH_HINTS: Record<string, string[]> = {
  warrior: ['whirlwind', 'ground_slam', 'war_cry', 'charge', 'iron_skin', 'cleave'],
  mage: ['fire_burst', 'frost_nova', 'chain_lightning', 'blink', 'arcane_ward', 'meteor'],
  ranger: ['multishot', 'arrow_rain', 'bear_trap', 'smoke_bomb', 'hawk', 'volley_step'],
};

function guessPath(id: string): string {
  for (const [p, ids] of Object.entries(PATH_HINTS)) if (ids.includes(id)) return p;
  return '';
}

export function formatTime(ticks: number): string {
  const total = Math.floor(ticks / TICK_RATE);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

const RUN_LABELS: Record<string, string> = {
  kills: 'Monsters slain',
  bossKills: 'Giants felled',
  damageDealt: 'Damage dealt',
  damageTaken: 'Damage taken',
  itemsCrafted: 'Items crafted',
  recipesDiscovered: 'Recipes found',
  treesChopped: 'Trees chopped',
  oresMined: 'Ores mined',
  bugsCaught: 'Bugs caught',
  plantsHarvested: 'Plants picked',
  goldEarned: 'Gold earned',
  deaths: 'Times downed',
  revives: 'Revives',
  districtsCleared: 'Districts cleared',
};

/** Nicer labels for extra stats other workstreams record (listed only when present). */
const EXTRA_LABELS: Record<string, string> = {
  xpEarned: 'XP earned',
  skillsLearned: 'Skills learned',
  warriorSkills: 'Warrior skills',
  mageSkills: 'Mage skills',
  rangerSkills: 'Ranger skills',
};

/** Extra stats already shown in the header rows (progression records them as `level` / `district`). */
const HEADER_STATS = new Set(['ticksPlayed', 'level', 'district']);

/**
 * Ordered [label, value] rows for the run-over screen (unknown extra stats included). The
 * deepest district / highest level recorded in `stats` win over the current level's values (the
 * run may end in a town whose district number is the one ahead).
 */
export function runSummary(stats: RunStats, extra: { level: number; district: number }): [string, string][] {
  const district = (stats.district ?? 0) > 0 ? stats.district! : extra.district;
  const level = Math.max(extra.level, stats.level ?? 0);
  const rows: [string, string][] = [
    ['Reached', `District ${district}`],
    ['Level', String(level)],
    ['Time', formatTime(stats.ticksPlayed ?? 0)],
  ];
  for (const [k, label] of Object.entries(RUN_LABELS)) rows.push([label, String(Math.round(stats[k] ?? 0))]);
  for (const k of Object.keys(stats)) {
    if (k in RUN_LABELS || HEADER_STATS.has(k)) continue;
    rows.push([EXTRA_LABELS[k] ?? humanize(k), String(Math.round(stats[k] ?? 0))]);
  }
  return rows;
}
