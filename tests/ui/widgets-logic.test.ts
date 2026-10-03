import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../../src/sim/constants';
import type { Entity, PlayerState } from '../../src/sim/types';
import { countLabel, measureMini } from '../../src/ui/minifont';
import { Timed, ToastQueue, fadeAlpha } from '../../src/ui/notify';
import { REVIVE_TICKS, reviveFraction, runSummaryRowsPerCol } from '../../src/ui/overlays';
import { clampPage, pageCount } from '../../src/ui/recipebook';
import { chooseSkillCommand, moveFocus, skillPanelVisible, skillTooltip } from '../../src/ui/skillpanel';
import { cooldownFrac, meterValues } from '../../src/ui/topbar';

describe('toasts & timers', () => {
  it('fadeAlpha ramps in, holds and fades out', () => {
    expect(fadeAlpha(0, 3)).toBe(0);
    expect(fadeAlpha(0.06, 3, 0.12)).toBeCloseTo(0.5);
    expect(fadeAlpha(1, 3)).toBe(1);
    expect(fadeAlpha(2.75, 3, 0.12, 0.5)).toBeCloseTo(0.5);
    expect(fadeAlpha(3, 3)).toBe(0);
    expect(fadeAlpha(-1, 3)).toBe(0);
  });

  it('keeps at most `max` toasts and expires them', () => {
    const q = new ToastQueue(2);
    q.push('a', 1, 1);
    q.push('b', 1, 2);
    q.push('c', 1, 3);
    expect(q.items.map((t) => t.text)).toEqual(['b', 'c']);
    q.tick(2.5);
    expect(q.items.map((t) => t.text)).toEqual(['c']);
    q.clear();
    expect(q.items).toHaveLength(0);
  });

  it('merges pickups of the same item into one growing "+N" line', () => {
    const q = new ToastQueue(5, 2);
    const fmt = (n: number) => `+${n} Wood`;
    q.pushMerged('wood', 2, fmt, 0xffffff);
    q.pushMerged('stone', 1, (n) => `+${n} Stone`, 0xffffff);
    q.tick(0.5);
    q.pushMerged('wood', 1, fmt, 0xffffff);
    expect(q.items.map((t) => t.text)).toEqual(['+1 Stone', '+3 Wood']);
    // Outside the merge window a new line starts.
    q.tick(2.1);
    q.pushMerged('wood', 4, fmt, 0xffffff);
    expect(q.items.filter((t) => t.key === 'wood').map((t) => t.text)).toEqual(['+3 Wood', '+4 Wood']);
  });

  it('Timed runs once', () => {
    const t = new Timed(1);
    expect(t.active).toBe(false);
    t.start();
    expect(t.active).toBe(true);
    t.tick(0.5);
    expect(t.alpha(0.1, 0.2)).toBe(1);
    t.tick(0.6);
    expect(t.active).toBe(false);
    expect(t.alpha()).toBe(0);
  });
});

describe('skill path selection', () => {
  const p = { skillPicks: 1, skillOffer: ['whirlwind', 'fire_burst', 'multishot'], skills: {} as Record<string, number> };

  it('is visible only while a pick is pending and something is offered', () => {
    expect(skillPanelVisible(p)).toBe(true);
    expect(skillPanelVisible({ skillPicks: 0, skillOffer: p.skillOffer })).toBe(false);
    expect(skillPanelVisible({ skillPicks: 1, skillOffer: [] })).toBe(false);
  });

  it("emits chooseSkill with the skill id in the 'path' field", () => {
    expect(chooseSkillCommand(p, 1)).toEqual({ type: 'chooseSkill', path: 'fire_burst' });
    expect(chooseSkillCommand(p, 5)).toBeNull();
  });

  it('keyboard/gamepad focus wraps around', () => {
    expect(moveFocus(-1, 1, 3)).toBe(0);
    expect(moveFocus(-1, -1, 3)).toBe(2);
    expect(moveFocus(2, 1, 3)).toBe(0);
    expect(moveFocus(0, -1, 3)).toBe(2);
    expect(moveFocus(1, 1, 0)).toBe(0);
  });

  it('tooltip names the skill, its path and the upgrade rank', () => {
    const t = skillTooltip('fire_burst', 1).map((l) => l.text);
    expect(t[0]).toBe('Fire Burst');
    expect(t[1]).toBe('Mage - upgrade to rank 2');
  });
});

describe('HUD values', () => {
  it('cooldown overlay fraction', () => {
    expect(cooldownFrac(0, 10, 0)).toBe(0);
    expect(cooldownFrac(5 * TICK_RATE, 10, 0)).toBe(0.5);
    // Unknown def: falls back to the largest cooldown seen.
    expect(cooldownFrac(30, 0, 120)).toBe(0.25);
    expect(cooldownFrac(200, 0, 0)).toBe(1);
  });

  it('reads meters from the player state and its entity', () => {
    const p = { mana: 3, hunger: 7, stamina: 2, stats: { maxHp: 6, maxMana: 4, maxHunger: 8, maxStamina: 3 } } as unknown as PlayerState;
    const e = { hp: 5, maxHp: 6 } as Entity;
    expect(meterValues(p, e, 'hp')).toEqual([5, 6]);
    expect(meterValues(p, undefined, 'hp')).toEqual([0, 6]);
    expect(meterValues(p, e, 'mana')).toEqual([3, 4]);
    expect(meterValues(p, e, 'hunger')).toEqual([7, 8]);
    expect(meterValues(p, e, 'stamina')).toEqual([2, 3]);
  });

  it('revive progress is read as ticks (the first tick is not a full bar)', () => {
    expect(reviveFraction(0)).toBe(0);
    expect(reviveFraction(-3)).toBe(0);
    expect(reviveFraction(1)).toBeCloseTo(1 / REVIVE_TICKS);
    expect(reviveFraction(1)).toBeLessThan(0.05);
    expect(reviveFraction(REVIVE_TICKS / 2)).toBe(0.5);
    expect(reviveFraction(REVIVE_TICKS)).toBe(1);
    expect(reviveFraction(REVIVE_TICKS * 3)).toBe(1);
  });

  it('run summary columns are balanced but never taller than the view', () => {
    expect(runSummaryRowsPerCol(17, 180)).toBe(9);
    expect(runSummaryRowsPerCol(22, 180)).toBe(11);
    // 40 rows can't fit in 180 px: cap the column height (panel = 48 px chrome + 9 px per row).
    const per = runSummaryRowsPerCol(40, 180);
    expect(48 + per * 9).toBeLessThanOrEqual(180 - 4);
    expect(runSummaryRowsPerCol(40, 720)).toBe(20);
    expect(runSummaryRowsPerCol(3, 20)).toBe(1);
  });

  it('recipe book paging', () => {
    expect(pageCount(0, 8)).toBe(1);
    expect(pageCount(8, 8)).toBe(1);
    expect(pageCount(9, 8)).toBe(2);
    expect(clampPage(5, 9, 8)).toBe(1);
    expect(clampPage(-1, 9, 8)).toBe(0);
  });

  it('tiny slot digits', () => {
    expect(countLabel(99)).toBe('99');
    expect(countLabel(1234)).toBe('1K');
    expect(measureMini('99')).toBe(7);
    expect(measureMini('')).toBe(0);
  });
});
