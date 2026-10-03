import { Content } from '../../content';
import { MAX_SKILL_SLOTS } from '../../content/skills';
import { recalcStats } from '../items/stats';
import type { PlayerState } from '../types';
import type { World } from '../world';
import { bumpStat } from './util';

/** Highest rank a skill can reach (= length of its power table). */
export function maxRank(id: string): number {
  return Content.skills.get(id)?.power.length ?? 0;
}

/**
 * Build a "Select Skill Path" offer (GDD §5): while a slot is free, one *unowned* skill from each
 * path (red / blue / green, drawn with world.rng); once all 3 slots are full, rank-ups of the owned
 * skills that are below max rank (offer entry = the owned skill id).
 */
export function makeSkillOffer(world: World, p: PlayerState): string[] {
  const offer: string[] = [];
  if (p.skillSlots.length < MAX_SKILL_SLOTS) {
    const candidates: string[] = [];
    for (const path of Content.skillPaths.values()) {
      candidates.length = 0;
      for (const s of Content.skills.values()) if (s.path === path.id && !(s.id in p.skills)) candidates.push(s.id);
      if (candidates.length) offer.push(world.rng.pick(candidates));
    }
  } else {
    for (const id of p.skillSlots) if ((p.skills[id] ?? 0) < maxRank(id)) offer.push(id);
  }
  return offer;
}

/** Make sure a player with pending picks has an offer (and none without). */
export function refreshSkillOffer(world: World, p: PlayerState): void {
  if (p.skillPicks > 0 && p.skillOffer.length === 0) {
    p.skillOffer = makeSkillOffer(world, p);
    // Nothing left to learn or upgrade: drop the pending picks.
    if (p.skillOffer.length === 0) p.skillPicks = 0;
  } else if (p.skillPicks <= 0 && p.skillOffer.length > 0) {
    p.skillOffer = [];
  }
}

/**
 * Resolve a `{ type: 'chooseSkill', path }` command. `choice` is the chosen skill id from
 * `p.skillOffer` (the UI sends the id in the `path` field); a skill-path id ('warrior' / 'mage' /
 * 'ranger') is also accepted and picks that path's offered skill. Returns true if applied.
 */
export function chooseSkill(world: World, p: PlayerState, choice: string): boolean {
  if (p.skillPicks <= 0 || p.skillOffer.length === 0) return false;
  let id = '';
  for (const s of p.skillOffer) if (s === choice) id = s;
  if (!id) for (const s of p.skillOffer) if (Content.skills.get(s)?.path === choice) id = s;
  const def = Content.skills.get(id);
  if (!def) return false;
  const e = world.get(p.entityId);
  const rank = p.skills[id] ?? 0;
  if (rank > 0) {
    if (rank >= def.power.length) return false;
    p.skills[id] = rank + 1;
  } else {
    if (p.skillSlots.length >= MAX_SKILL_SLOTS) return false;
    p.skills[id] = 1;
    p.skillSlots.push(id);
    p.skillCooldowns.push(0);
    bumpStat(p, 'skillsLearned');
    bumpStat(p, `${def.path}Skills`);
  }
  p.skillPicks--;
  p.skillOffer = [];
  refreshSkillOffer(world, p);

  // Passive mods (e.g. +1 max HP per rank) — grant the new headroom immediately.
  const hpBefore = e?.maxHp ?? 0;
  const manaBefore = p.stats.maxMana;
  const stamBefore = p.stats.maxStamina;
  recalcStats(p, e);
  if (e && e.maxHp > hpBefore && !p.downed && !p.out) e.hp = Math.min(e.maxHp, e.hp + (e.maxHp - hpBefore));
  if (p.stats.maxMana > manaBefore) p.mana = Math.min(p.stats.maxMana, p.mana + (p.stats.maxMana - manaBefore));
  if (p.stats.maxStamina > stamBefore) p.stamina = Math.min(p.stats.maxStamina, p.stamina + (p.stats.maxStamina - stamBefore));

  const newRank = p.skills[id]!;
  const color = Content.skillPaths.get(def.path)?.color;
  world.emit({ type: 'message', text: newRank > 1 ? `${def.name} rank ${newRank}!` : `Learned ${def.name}!`, color, player: p.index });
  const x = e ? e.x + e.w / 2 : 0;
  const y = e ? e.y : 0;
  world.emit({ type: 'sfx', id: 'skill_learn', x, y });
  world.emit({ type: 'particles', preset: 'skill_learn', x, y: e ? e.y + e.h / 2 : 0, count: 16, color });
  return true;
}

/** Process this tick's chooseSkill commands (the items commandSystem ignores that type). */
export function skillCommandSystem(world: World): void {
  for (const p of world.players) {
    const input = world.inputs[p.index];
    if (!input) continue;
    for (const c of input.commands) if (c.type === 'chooseSkill') chooseSkill(world, p, c.path);
  }
}
