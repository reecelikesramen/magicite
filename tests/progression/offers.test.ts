import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { chooseSkill, makeSkillOffer } from '../../src/sim/progression/offers';
import { grantXp, totalXpForLevel } from '../../src/sim/progression/xp';
import type { PlayerState } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { inp, makeWorld, run } from './helpers';

function toLevel(w: World, p: PlayerState, level: number): void {
  grantXp(w, p, totalXpForLevel(level) - (totalXpForLevel(p.level) + p.xp));
}

const pathOf = (id: string) => Content.skills.get(id)!.path;

describe('skill offers', () => {
  it('reaching Lv5 offers one unowned skill from each path', () => {
    const w = makeWorld();
    const p = w.players[0]!;
    toLevel(w, p, 5);
    expect(p.skillPicks).toBe(1);
    expect(p.skillOffer).toHaveLength(3);
    expect(p.skillOffer.map(pathOf).sort()).toEqual(['mage', 'ranger', 'warrior']);
    for (const id of p.skillOffer) expect(p.skills[id]).toBeUndefined();
  });

  it('a chooseSkill command (skill id in `path`) learns and slots the skill', () => {
    const w = makeWorld();
    const p = w.players[0]!;
    toLevel(w, p, 5);
    const pick = p.skillOffer[1]!;
    run(w, 1, inp({ commands: [{ type: 'chooseSkill', path: pick }] }));
    expect(p.skills[pick]).toBe(1);
    expect(p.skillSlots).toEqual([pick]);
    expect(p.skillCooldowns).toEqual([0]);
    expect(p.skillPicks).toBe(0);
    expect(p.skillOffer).toEqual([]);
    expect(p.runStats.skillsLearned).toBe(1);
    expect(p.runStats[`${pathOf(pick)}Skills`]).toBe(1);
  });

  it('accepts a path id and ignores choices that are not on offer', () => {
    const w = makeWorld();
    const p = w.players[0]!;
    toLevel(w, p, 5);
    const offered = new Set(p.skillOffer);
    const notOffered = [...Content.skills.keys()].find((id) => !offered.has(id))!;
    expect(chooseSkill(w, p, notOffered)).toBe(false);
    expect(p.skillPicks).toBe(1);
    const mage = p.skillOffer.find((id) => pathOf(id) === 'mage')!;
    expect(chooseSkill(w, p, 'mage')).toBe(true);
    expect(p.skills[mage]).toBe(1);
  });

  it('ignores chooseSkill without a pending pick', () => {
    const w = makeWorld();
    const p = w.players[0]!;
    expect(chooseSkill(w, p, 'whirlwind')).toBe(false);
    expect(p.skillSlots).toEqual([]);
  });

  it('with several pending picks a fresh offer follows each choice', () => {
    const w = makeWorld();
    const p = w.players[0]!;
    toLevel(w, p, 10);
    expect(p.skillPicks).toBe(2);
    const first = p.skillOffer[0]!;
    chooseSkill(w, p, first);
    expect(p.skillPicks).toBe(1);
    expect(p.skillOffer).toHaveLength(3);
    expect(p.skillOffer).not.toContain(first);
  });

  it('once 3 slots are full, picks offer rank-ups of owned skills (maxed ones excluded)', () => {
    const w = makeWorld();
    const p = w.players[0]!;
    toLevel(w, p, 15);
    for (let i = 0; i < 3; i++) chooseSkill(w, p, p.skillOffer[0]!);
    expect(p.skillSlots).toHaveLength(3);
    expect(p.skillPicks).toBe(0);
    toLevel(w, p, 20);
    expect(p.skillPicks).toBe(1);
    expect([...p.skillOffer].sort()).toEqual([...p.skillSlots].sort());
    const up = p.skillOffer[2]!;
    chooseSkill(w, p, up);
    expect(p.skills[up]).toBe(2);
    p.skills[up] = 3; // maxed
    expect(makeSkillOffer(w, p)).not.toContain(up);
    expect(makeSkillOffer(w, p)).toHaveLength(2);
  });

  it('passive skill mods apply per rank (Iron Skin: +1 max HP per rank)', () => {
    const w = makeWorld();
    const p = w.players[0]!;
    const e = w.playerEntity(0)!;
    const hp0 = e.maxHp;
    p.skillPicks = 1;
    p.skillOffer = ['iron_skin'];
    chooseSkill(w, p, 'iron_skin');
    expect(e.maxHp).toBe(hp0 + 1);
    expect(e.hp).toBe(e.maxHp);
  });

  it('offers are deterministic for a seed', () => {
    const offer = (seed: number) => {
      const w = makeWorld({ seed });
      const p = w.players[0]!;
      toLevel(w, p, 5);
      return p.skillOffer.join(',');
    };
    expect(offer(5)).toBe(offer(5));
  });
});
