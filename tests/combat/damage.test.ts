import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { applyDamage, computeDamage, damageTakenMul, partyDamageScale } from '../../src/sim/combat/damage';
import { addStatus } from '../../src/sim/combat/status';
import { COMBAT } from '../../src/sim/combat/tuning';
import { isAuto, useCooldownTicks } from '../../src/sim/combat/use';
import { secs } from '../../src/sim/constants';
import { FLOOR_Y, give, makeWorld, spawnEnemy, step } from './helpers';

const item = (id: string) => Content.items.get(id)!;

describe('damage formula', () => {
  it('scales melee with ATK, bows/thrown with DEX, spells with MAG', () => {
    const { world, p } = makeWorld();
    p.stats.atk = 5;
    p.stats.dex = 7;
    p.stats.mag = 9;
    expect(computeDamage(world, p, item('t_sword'), 2, 'physical').amount).toBe(7);
    expect(computeDamage(world, p, item('t_bow'), 2, 'physical').amount).toBe(9);
    expect(computeDamage(world, p, item('t_knife'), 2, 'physical').amount).toBe(9);
    expect(computeDamage(world, p, item('t_wand'), 2, 'fire').amount).toBe(11);
    expect(computeDamage(world, null, item('t_sword'), 2, 'physical').amount).toBe(2);
    p.stats.dex = -5;
    expect(computeDamage(world, p, item('t_bow'), 2, 'physical').amount).toBe(1); // never below 1
  });

  it('crits multiply damage; chance comes from LCK + critChance', () => {
    const { world, p } = makeWorld();
    p.stats.atk = 3;
    p.mods.critChance = 5;
    const r = computeDamage(world, p, item('t_sword'), 2, 'physical');
    expect(r.crit).toBe(true);
    expect(r.amount).toBe(Math.round(5 * COMBAT.crit.mult));
    p.mods.critChance = -5;
    expect(computeDamage(world, p, item('t_sword'), 2, 'physical').crit).toBe(false);
  });

  it('weak attackers deal less', () => {
    const { world, p, e } = makeWorld();
    p.stats.atk = 6;
    addStatus(world, e, 'weak', 60, 0.5);
    expect(computeDamage(world, p, item('t_sword'), 2, 'physical', { attacker: e }).amount).toBe(4);
  });

  it('resistances: player StatMods.resist, enemy tags and element affinity, AI hooks', () => {
    const { world, p, e } = makeWorld();
    p.mods.resist = { fire: 0.5 };
    expect(damageTakenMul(world, e, 'fire')).toBe(0.5);
    expect(damageTakenMul(world, e, 'ice')).toBe(1);
    const golem = spawnEnemy(world, 't_golem', 200);
    expect(damageTakenMul(world, golem, 'fire')).toBe(0);
    expect(damageTakenMul(world, golem, 'ice')).toBe(1.5);
    const imp = spawnEnemy(world, 't_imp', 240);
    expect(damageTakenMul(world, imp, 'fire')).toBe(0.5);
    expect(damageTakenMul(world, imp, 'physical')).toBe(1);
    imp.ai = { state: 'idle', t: 0, target: 0, phase: 0, n: { takenMul: 0.25 } };
    expect(applyDamage(world, imp, 8)).toBe(2);
    imp.ai.n.invulnerable = 1;
    imp.invuln = 0;
    expect(applyDamage(world, imp, 8)).toBe(0);
  });

  it('armour is a flat reduction with a 1-damage floor', () => {
    const { world } = makeWorld();
    const d = spawnEnemy(world, 't_dummy', 200, FLOOR_Y, { armor: 3 });
    expect(applyDamage(world, d, 5)).toBe(2);
    d.invuln = 0;
    expect(applyDamage(world, d, 2)).toBe(1);
  });

  it('armour pieces wear when their wearer is hit', () => {
    const { world, p, e } = makeWorld();
    p.equipment.body = { id: 't_shield', count: 1, durability: 1 };
    applyDamage(world, e, 1);
    expect(p.equipment.body).toBeNull();
  });

  it('life steal heals the attacking player', () => {
    const { world, p, e } = makeWorld();
    give(p, 't_sword');
    p.mods.lifeSteal = 1;
    e.hp = 1;
    spawnEnemy(world, 't_dummy', 89, FLOOR_Y, { kbResist: 1 });
    step(world, 15, { attack: true, aimX: 140, aimY: 122 });
    expect(e.hp).toBe(e.maxHp);
  });

  it('kills credit the player, grant xp and stats (projectiles credit their owner)', () => {
    const { world, p } = makeWorld();
    give(p, 't_bow');
    p.inventory[1] = { id: 't_arrow', count: 5 };
    const b = spawnEnemy(world, 't_biter', 160, FLOOR_Y, { kbResist: 1, hp: 1 });
    step(world, 40, { attack: true, aimX: 200, aimY: 124 });
    expect(b.dead || !world.entities.includes(b)).toBe(true);
    expect(p.runStats.kills).toBe(1);
    expect(p.runStats.damageDealt).toBeGreaterThan(0);
    expect(p.xp).toBe(1);
  });

  it('shields block frontal hits for stamina while Secondary is held', () => {
    const { world, p, e } = makeWorld();
    p.equipment.trinket = { id: 't_shield', count: 1 };
    p.stamina = 2;
    e.facing = 1;
    const biter = spawnEnemy(world, 't_biter', 86, FLOOR_Y, { kbResist: 1 });
    const hp = e.hp;
    step(world, 1, { alt: true });
    expect(e.hp).toBe(hp);
    expect(p.stamina).toBe(1);
    // From behind: no block.
    e.invuln = 0;
    biter.x = e.x - 6;
    step(world, 1, { alt: true });
    expect(e.hp).toBe(hp - 1);
  });

  it('co-op partners can hit the same enemy on the same tick (no i-frame cancelling)', () => {
    const { world } = makeWorld({ players: 2 });
    const d = spawnEnemy(world, 't_dummy', 200);
    const [a, b] = world.players.map((pl) => world.get(pl.entityId)!);
    expect(applyDamage(world, d, 3, { source: a, ignoreIframes: true })).toBe(3);
    expect(applyDamage(world, d, 3, { source: b, ignoreIframes: true })).toBe(3);
    expect(applyDamage(world, d, 3, { source: b })).toBe(0); // i-frames still gate hazards/contact
    expect(partyDamageScale(world)).toBeLessThan(1);
  });
});

describe('use dispatcher details', () => {
  it('attack speed shortens cooldowns', () => {
    const { p } = makeWorld();
    const base = useCooldownTicks(p, item('t_sword'), 'swing');
    expect(base).toBe(secs(0.4));
    p.mods.attackSpeed = 1;
    expect(useCooldownTicks(p, item('t_sword'), 'swing')).toBe(Math.round(secs(0.4) / 2));
    expect(useCooldownTicks(p, item('t_potion'), 'consume')).toBe(secs(COMBAT.defaultCooldown.consume));
  });

  it('auto vs press-only items', () => {
    expect(isAuto(item('t_sword'))).toBe(true);
    expect(isAuto(item('t_bow'))).toBe(true);
    expect(isAuto(item('t_wand'))).toBe(true);
    expect(isAuto(item('t_potion'))).toBe(false);
    expect(isAuto(item('t_bomb'))).toBe(false);
    expect(isAuto(undefined)).toBe(true);
  });
});
