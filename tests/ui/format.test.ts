import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { measureText } from '../../src/render/pixelfont';
import { TICK_RATE } from '../../src/sim/constants';
import type { RunStats } from '../../src/sim/types';
import {
  DurabilityMemory,
  craftFeedback,
  durabilityFrac,
  eventToast,
  fitText,
  formatTime,
  fraction,
  humanize,
  itemName,
  itemTooltip,
  levelBanner,
  modLines,
  pickupText,
  recipeEntries,
  recipeKey,
  recipeLine,
  runSummary,
  skillInfo,
  stripDistrictPrefix,
  wrapText,
} from '../../src/ui/format';
import { PATH_COLORS, UI, tierColor } from '../../src/ui/theme';
import { useTestItems } from './fixtures';

useTestItems();

describe('names and text fitting', () => {
  it('humanizes ids', () => {
    expect(humanize('iron_bar')).toBe('Iron Bar');
    expect(humanize('bossKills')).toBe('Boss Kills');
    expect(humanize('#metal')).toBe('Metal');
  });

  it('uses content names and falls back for unknown ids / tags', () => {
    expect(itemName('wood')).toBe('Wood');
    expect(itemName('test_food')).toBe('Test Jerky');
    expect(itemName('zz_unlisted_bar')).toBe('Zz Unlisted Bar');
    expect(itemName('#metal')).toBe('Any Metal');
  });

  it('formats cur/max as whole numbers', () => {
    expect(fraction(5, 8)).toBe('5/8');
    expect(fraction(2.7, 4)).toBe('2/4');
    expect(fraction(-1, 3)).toBe('0/3');
  });

  it('wraps to the pixel width and fits with ellipsis', () => {
    const lines = wrapText('Chops trees and hits things quite hard indeed', 60);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measureText(l)).toBeLessThanOrEqual(60);
    expect(lines.join(' ')).toBe('Chops trees and hits things quite hard indeed');
    expect(fitText('SHORT', 100)).toBe('SHORT');
    const fit = fitText('A VERY LONG CHARACTER NAME', 40);
    expect(fit.endsWith('..')).toBe(true);
    expect(measureText(fit)).toBeLessThanOrEqual(40);
  });
});

describe('item tooltips', () => {
  it('starts with the name in its tier colour, then kind and description', () => {
    const lines = itemTooltip('test_axe', { id: 'test_axe', count: 1 });
    expect(lines[0]).toEqual({ text: 'Test Hatchet', color: tierColor(1) });
    expect(lines[1]!.text).toBe('Axe - Tier 1');
    expect(lines.some((l) => l.text.includes('Chops trees'))).toBe(true);
    expect(lines.some((l) => l.text === 'Damage 1')).toBe(true);
    expect(lines.some((l) => l.text === 'Cooldown 0.4s')).toBe(true);
    expect(lines.some((l) => l.text === 'Axe power 1')).toBe(true);
  });

  it('lists on-hit effects, mods, durability and an action hint', () => {
    const sword = itemTooltip('test_sword', { id: 'test_sword', count: 1, durability: 15 });
    expect(sword[0]!.color).toBe(tierColor(3));
    expect(sword.some((l) => l.text === '25% bleed on hit')).toBe(true);
    const dur = sword.find((l) => l.text.startsWith('Durability'))!;
    expect(dur.text).toBe('Durability 15/80');
    expect(dur.color).toBe(UI.bad);
    const tunic = itemTooltip('test_tunic', null).map((l) => l.text);
    expect(tunic).toContain('+2 DEF');
    expect(tunic).toContain('+10% Speed');
    expect(tunic).toContain('Right-click to equip');
    expect(itemTooltip('test_robe', null).map((l) => l.text)).toContain('Right-click to equip');
    expect(itemTooltip('test_axe', null).map((l) => l.text).some((t) => t.startsWith('Right-click'))).toBe(false);
    expect(itemTooltip('test_potion', null).map((l) => l.text)).toContain('Right-click to use');
    expect(itemTooltip('test_potion', null).map((l) => l.text)).toContain('+2 HP');
  });

  it('handles unknown items', () => {
    const lines = itemTooltip('mystery_thing', null);
    expect(lines[0]!.text).toBe('Mystery Thing');
    expect(lines[1]!.text).toBe('Unknown item');
  });

  it('formats stat mods', () => {
    expect(modLines({ atk: 2, def: -1, critChance: 0.05, resist: { fire: 0.25 } })).toEqual(['+2 ATK', '-1 DEF', '+5% Crit', '+25% fire res']);
    expect(modLines(undefined)).toEqual([]);
  });
});

describe('durability', () => {
  it('uses the def max when present, else the largest seen value', () => {
    expect(durabilityFrac({ id: 'test_sword', count: 1, durability: 40 }, { durability: 80 } as never)).toBe(0.5);
    expect(durabilityFrac({ id: 'test_axe', count: 1 }, undefined)).toBeNull();
    const mem = new DurabilityMemory();
    expect(mem.frac({ id: 'test_axe', count: 1, durability: 40 })).toBe(1);
    expect(mem.frac({ id: 'test_axe', count: 1, durability: 10 })).toBe(0.25);
    expect(mem.seenMax('test_axe')).toBe(40);
    // A def max wins over what has been seen.
    expect(mem.frac({ id: 'test_sword', count: 1, durability: 40 })).toBe(0.5);
    expect(mem.frac(null)).toBeNull();
  });
});

describe('crafting & pickups', () => {
  it('craft feedback strings', () => {
    expect(craftFeedback({ result: null, count: 0, discovered: false }).text).toBe('Nothing happens...');
    expect(craftFeedback({ result: 'test_helmet', count: 1, discovered: true })).toEqual({ text: 'Discovered: Test Helmet!', color: UI.discover });
    expect(craftFeedback({ result: 'test_food', count: 2, discovered: false }).text).toBe('Crafted Test Jerky x2');
  });

  it('pickup popups', () => {
    expect(pickupText(3, 'wood')).toBe('+3 Wood');
  });

  it('recipe book lines from known recipe keys', () => {
    const entries = recipeEntries([recipeKey('wood', 'wood'), 'zz_herb+zz_rock']);
    expect(entries).toHaveLength(2);
    expect(recipeLine(entries[0]!)).toBe('Wood + Wood = Plank');
    expect(entries[1]!.result).toBe('?');
    expect(recipeLine(entries[1]!)).toBe('Zz Herb + Zz Rock = ???');
    expect(recipeEntries(['garbage'])).toEqual([]);
  });
});

describe('event toasts', () => {
  const nameOf = (i: number) => ['RALVAND', 'BRYNNA'][i] ?? 'Someone';

  it('shows global messages and ones addressed to the local player only', () => {
    expect(eventToast({ type: 'message', text: 'A chill creeps into the air...' }, 0, nameOf)?.text).toBe('A chill creeps into the air...');
    expect(eventToast({ type: 'message', text: 'Hi', color: 0x123456, player: 0 }, 0, nameOf)).toEqual({ text: 'Hi', color: 0x123456, ttl: 3 });
    expect(eventToast({ type: 'message', text: 'Not you', player: 1 }, 0, nameOf)).toBeNull();
  });

  it('announces teammates getting back up (going down has its own notice)', () => {
    // Down: the persistent revive notice (and the sim's own message) say it; no duplicate toast.
    expect(eventToast({ type: 'downed', player: 1 }, 0, nameOf)).toBeNull();
    expect(eventToast({ type: 'downed', player: 0 }, 0, nameOf)).toBeNull();
    expect(eventToast({ type: 'revived', player: 1 }, 0, nameOf)?.text).toBe('BRYNNA is back up!');
    expect(eventToast({ type: 'revived', player: 0 }, 0, nameOf)?.text).toBe("You're back on your feet!");
  });

  it('toasts own craft results only while the inventory is closed', () => {
    const ev = { type: 'craft', player: 0, a: 'test_ring', b: 'test_ring', result: 'test_helmet', count: 1, discovered: true } as const;
    expect(eventToast(ev, 0, nameOf)?.text).toBe('Discovered: Test Helmet!');
    expect(eventToast(ev, 0, nameOf, true)).toBeNull();
    expect(eventToast(ev, 1, nameOf)).toBeNull();
    expect(eventToast({ ...ev, result: null, discovered: false }, 0, nameOf)?.text).toBe('Nothing happens...');
  });

  it('ignores presentation-only events', () => {
    expect(eventToast({ type: 'shake', amount: 2, ticks: 4 }, 0, nameOf)).toBeNull();
  });
});

describe('level banners', () => {
  it('strips the "District N:" prefix for the big title', () => {
    expect(stripDistrictPrefix('District 3: Hollow Deep')).toBe('Hollow Deep');
    expect(stripDistrictPrefix('Hollow Deep')).toBe('Hollow Deep');
    expect(levelBanner({ district: 1, name: 'District 1: Mossgrave Woods', isTown: false, isBoss: false })).toEqual({ kicker: 'District 1', title: 'Mossgrave Woods', sub: '' });
  });

  it('labels towns and boss districts', () => {
    expect(levelBanner({ district: 2, name: 'Fenmire Town', isTown: true, isBoss: false }).kicker).toBe('Town');
    expect(levelBanner({ district: 3, name: 'District 3: Hollow Deep', isTown: false, isBoss: true }).sub).toContain('giant monster');
  });
});

describe('skills (graceful with empty content)', () => {
  // Content.skillPaths / Content.skills are filled by the progression workstream; until then the
  // UI guesses the path from the GDD's canonical ids and uses fallback colours.
  const pathColor = (p: 'warrior' | 'mage' | 'ranger') => Content.skillPaths.get(p)?.color ?? PATH_COLORS[p];

  it('knows the path of canonical GDD skill ids and colours by path', () => {
    const s = skillInfo('fire_burst');
    expect(s.path).toBe('mage');
    expect(s.color).toBe(pathColor('mage'));
    expect(s.name).toBe('Fire Burst');
    expect(skillInfo('whirlwind').color).toBe(pathColor('warrior'));
    expect(skillInfo('multishot').color).toBe(pathColor('ranger'));
    expect(new Set([pathColor('warrior'), pathColor('mage'), pathColor('ranger')]).size).toBe(3);
  });

  it('renders unknown skills with a neutral placeholder', () => {
    const s = skillInfo('zzz');
    expect(s.path).toBe('');
    expect(s.description.length).toBeGreaterThan(0);
    expect(s.known).toBe(false);
  });
});

describe('run summary', () => {
  it('formats play time', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75 * TICK_RATE)).toBe('1:15');
    expect(formatTime(3725 * TICK_RATE)).toBe('1:02:05');
  });

  it('lists reached district, level, time and every run stat', () => {
    const stats = { kills: 23, bossKills: 1, damageDealt: 141, damageTaken: 19, itemsCrafted: 12, recipesDiscovered: 4, treesChopped: 9, oresMined: 7, bugsCaught: 0, plantsHarvested: 0, goldEarned: 312, deaths: 0, revives: 0, districtsCleared: 3, ticksPlayed: 600, wraithEscapes: 2 } as RunStats;
    const rows = runSummary(stats, { level: 5, district: 4 });
    expect(rows[0]).toEqual(['Reached', 'District 2']); // run level 4 (town after District 2)
    expect(rows[1]).toEqual(['Level', '5']);
    expect(rows[2]).toEqual(['Time', '0:10']);
    expect(rows).toContainEqual(['Monsters slain', '23']);
    expect(rows).toContainEqual(['Gold earned', '312']);
    expect(rows).toContainEqual(['Wraith Escapes', '2']);
    expect(rows.some(([l]) => l === 'Ticks Played')).toBe(false);
  });

  it('does not repeat level/district recorded in run stats, and prefers the deepest district reached', () => {
    // Progression records runStats.level / .district / .xpEarned; the run may end in the town ahead.
    const stats = { kills: 1, ticksPlayed: 60, level: 7, district: 5, xpEarned: 120, skillsLearned: 1, mageSkills: 1 } as unknown as RunStats;
    const rows = runSummary(stats, { level: 6, district: 6 });
    expect(rows[0]).toEqual(['Reached', 'District 3']); // run level 5 = 3rd combat district
    expect(rows[1]).toEqual(['Level', '7']);
    expect(rows.filter(([l]) => l === 'Level')).toHaveLength(1);
    expect(rows.some(([l]) => l === 'District')).toBe(false);
    expect(rows).toContainEqual(['XP earned', '120']);
    expect(rows).toContainEqual(['Skills learned', '1']);
    expect(rows).toContainEqual(['Mage skills', '1']);
    // Without recorded values the current level's numbers are used.
    expect(runSummary({ kills: 0 } as RunStats, { level: 2, district: 3 }).slice(0, 2)).toEqual([['Reached', 'District 2'], ['Level', '2']]); // run level 3
  });
});
