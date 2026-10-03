import { BIOMES } from './biomes';
import { BOSSES } from './bosses';
import { COMPANIONS } from './companions';
import { ENEMIES } from './enemies';
import { HATS } from './hats';
import { ITEMS } from './items';
import { NPCS } from './npcs';
import { PROJECTILES } from './projectiles';
import { RACES } from './races';
import { RECIPES } from './recipes';
import { RESOURCES } from './resources';
import { SKILL_PATHS, SKILLS } from './skills';
import { TRAITS } from './traits';
import type {
  BiomeDef,
  BossDef,
  CompanionDef,
  EnemyDef,
  HatDef,
  ItemDef,
  NpcDef,
  ProjectileDef,
  RaceDef,
  RecipeDef,
  ResourceDef,
  SkillDef,
  SkillPathDef,
  TraitDef,
  UnlockDef,
} from './types';
import { UNLOCKS } from './unlocks';

export type * from './types';

function indexById<T extends { id: string }>(arr: readonly T[], what: string): ReadonlyMap<string, T> {
  const m = new Map<string, T>();
  for (const t of arr) {
    if (m.has(t.id)) throw new Error(`Duplicate ${what} id "${t.id}"`);
    m.set(t.id, t);
  }
  return m;
}

/** Order-independent key for a two-item recipe. */
export function recipeKey(a: string, b: string): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

function indexRecipes(arr: readonly RecipeDef[]): ReadonlyMap<string, RecipeDef> {
  const m = new Map<string, RecipeDef>();
  for (const r of arr) {
    const k = recipeKey(r.a, r.b);
    if (m.has(k)) throw new Error(`Duplicate recipe ${k}`);
    m.set(k, r);
  }
  return m;
}

/** Global read-only content database. */
export const Content = {
  items: indexById<ItemDef>(ITEMS, 'item'),
  recipes: indexRecipes(RECIPES),
  recipeList: RECIPES as readonly RecipeDef[],
  projectiles: indexById<ProjectileDef>(PROJECTILES, 'projectile'),
  enemies: indexById<EnemyDef>(ENEMIES, 'enemy'),
  bosses: indexById<BossDef>(BOSSES, 'boss'),
  resources: indexById<ResourceDef>(RESOURCES, 'resource'),
  biomes: indexById<BiomeDef>(BIOMES, 'biome'),
  races: indexById<RaceDef>(RACES, 'race'),
  hats: indexById<HatDef>(HATS, 'hat'),
  companions: indexById<CompanionDef>(COMPANIONS, 'companion'),
  skillPaths: indexById<SkillPathDef>(SKILL_PATHS, 'skill path'),
  skills: indexById<SkillDef>(SKILLS, 'skill'),
  traits: indexById<TraitDef>(TRAITS, 'trait'),
  unlocks: indexById<UnlockDef>(UNLOCKS, 'unlock'),
  npcs: indexById<NpcDef>(NPCS, 'npc'),
};

export function item(id: string): ItemDef {
  const d = Content.items.get(id);
  if (!d) throw new Error(`Unknown item "${id}"`);
  return d;
}

export function maybeItem(id: string | undefined): ItemDef | undefined {
  return id ? Content.items.get(id) : undefined;
}

/**
 * Validate every cross-reference in the content database. Returns a list of problems
 * (empty = OK). Run by tests so broken ids never ship.
 */
export function validateContent(): string[] {
  const errs: string[] = [];
  const hasItem = (id: string) => Content.items.has(id);
  const checkDrops = (owner: string, drops: { item: string }[]) => {
    for (const d of drops) if (!hasItem(d.item)) errs.push(`${owner}: drop references unknown item "${d.item}"`);
  };
  const tagged = (tag: string) => [...Content.items.values()].some((i) => i.tags?.includes(tag));
  for (const r of Content.recipeList) {
    for (const side of [r.a, r.b]) {
      if (side.startsWith('#') ? !tagged(side.slice(1)) : !hasItem(side)) errs.push(`recipe ${r.a}+${r.b}: unknown input "${side}"`);
    }
    if (!hasItem(r.result)) errs.push(`recipe ${r.a}+${r.b}: unknown result "${r.result}"`);
  }
  for (const i of Content.items.values()) {
    if (i.projectile && !Content.projectiles.has(i.projectile)) errs.push(`item ${i.id}: unknown projectile "${i.projectile}"`);
    if ((i.use === 'shoot' || i.use === 'cast' || i.use === 'throw') && !i.projectile) errs.push(`item ${i.id}: ranged use without projectile`);
    if (i.use === 'shoot' && !i.ammoType) errs.push(`item ${i.id}: shoot without ammoType`);
  }
  for (const p of Content.projectiles.values()) {
    if (p.recoverItem && !hasItem(p.recoverItem)) errs.push(`projectile ${p.id}: unknown recoverItem "${p.recoverItem}"`);
  }
  for (const e of Content.enemies.values()) {
    checkDrops(`enemy ${e.id}`, e.drops);
    if (e.projectile && !Content.projectiles.has(e.projectile)) errs.push(`enemy ${e.id}: unknown projectile "${e.projectile}"`);
    for (const b of e.biomes) if (!Content.biomes.has(b)) errs.push(`enemy ${e.id}: unknown biome "${b}"`);
  }
  for (const b of Content.bosses.values()) {
    checkDrops(`boss ${b.id}`, b.drops);
    if (b.projectile && !Content.projectiles.has(b.projectile)) errs.push(`boss ${b.id}: unknown projectile "${b.projectile}"`);
  }
  for (const r of Content.resources.values()) {
    checkDrops(`resource ${r.id}`, r.drops);
    for (const b of r.biomes) if (!Content.biomes.has(b)) errs.push(`resource ${r.id}: unknown biome "${b}"`);
  }
  for (const b of Content.biomes.values()) {
    // Skipped while no boss content exists yet (bosses workstream lands later).
    if (b.boss && Content.bosses.size > 0 && !Content.bosses.has(b.boss)) errs.push(`biome ${b.id}: unknown boss "${b.boss}"`);
  }
  for (const s of Content.skills.values()) if (!Content.skillPaths.has(s.path) && Content.skillPaths.size > 0) errs.push(`skill ${s.id}: unknown path "${s.path}"`);
  for (const r of Content.races.values()) for (const s of r.startItems) if (!hasItem(s.item)) errs.push(`race ${r.id}: unknown start item "${s.item}"`);
  for (const c of Content.companions.values()) for (const s of c.startItems ?? []) if (!hasItem(s.item)) errs.push(`companion ${c.id}: unknown start item "${s.item}"`);
  for (const n of Content.npcs.values()) for (const s of n.stock ?? []) if (!hasItem(s)) errs.push(`npc ${n.id}: unknown stock item "${s}"`);
  return errs;
}
