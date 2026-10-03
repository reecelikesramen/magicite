import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { secs, TILE } from '../../src/sim/constants';
import { SKILL_FX } from '../../src/sim/progression/skills';
import { Tile } from '../../src/sim/tiles';
import type { Entity } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { count, dummy, FLOOR_Y, giveSkill, inp, makeWorld, placePlayer, run, statusOf, statusPower } from './helpers';

const PX = 200;

function setup(id: string, rank = 1): { w: World; e: Entity; slot: number; cy: number } {
  const w = makeWorld();
  const e = placePlayer(w, 0, PX);
  const slot = giveSkill(w.players[0]!, id, rank);
  return { w, e, slot, cy: e.y + e.h / 2 };
}

/** Press the skill once (aiming at ax, ay), then hold nothing for `after` ticks. */
function cast(w: World, slot: number, ax: number, ay: number, after = 0): void {
  run(w, 1, inp({ skill: slot, aimX: ax, aimY: ay }));
  run(w, after, inp({ aimX: ax, aimY: ay }));
}

const projectiles = (w: World, def: string) => w.entities.filter((x) => !x.dead && x.kind === 'projectile' && x.def === def);

describe('skill activation (all 18)', () => {
  const ids = [...Content.skills.keys()];

  it('there are 18 skills, 6 per path, each with an implementation and 3 ranks', () => {
    expect(ids).toHaveLength(18);
    for (const path of ['warrior', 'mage', 'ranger']) expect(ids.filter((id) => Content.skills.get(id)!.path === path)).toHaveLength(6);
  });

  for (const id of ids) {
    it(`${id}: spends its cost, starts its cooldown and cannot be re-cast while cooling down`, () => {
      const def = Content.skills.get(id)!;
      const { w, slot, cy } = setup(id);
      const p = w.players[0]!;
      const target = dummy(w, PX + 16, cy);
      p.mana = 10;
      p.stamina = 5;
      cast(w, slot, target.x + 4, target.y + 4);
      expect(p.skillCooldowns[slot]).toBe(secs(def.cooldown));
      expect(p.mana).toBe(10 - (def.manaCost ?? 0));
      expect(p.stamina).toBe(5 - (def.staminaCost ?? 0));
      const mana = p.mana;
      const stamina = p.stamina;
      cast(w, slot, target.x + 4, target.y + 4);
      expect(p.mana).toBe(mana);
      expect(p.stamina).toBe(stamina);
      expect(p.skillCooldowns[slot]).toBe(secs(def.cooldown) - 1);
      // Cooldown runs out and the skill is usable again.
      run(w, secs(def.cooldown), inp());
      expect(p.skillCooldowns[slot]).toBe(0);
    });
  }

  it('does not fire without enough mana / stamina, and refunds nothing', () => {
    const { w, slot } = setup('meteor');
    const p = w.players[0]!;
    p.mana = 3; // costs 4
    cast(w, slot, PX + 40, FLOOR_Y - 4);
    expect(p.skillCooldowns[slot]).toBe(0);
    expect(p.mana).toBe(3);
    expect(w.events.some((ev) => ev.type === 'message' && /mana/i.test(ev.text))).toBe(true);
  });

  it('downed players cannot use skills', () => {
    const { w, slot } = setup('iron_skin');
    w.players[0]!.downed = true;
    cast(w, slot, PX + 10, FLOOR_Y);
    expect(w.players[0]!.skillCooldowns[slot]).toBe(0);
  });
});

describe('warrior effects', () => {
  it('whirlwind hits nearby foes several times', () => {
    const { w, slot, cy } = setup('whirlwind');
    const t = dummy(w, PX + 12, cy);
    const far = dummy(w, PX + 60, cy);
    cast(w, slot, PX + 20, cy, SKILL_FX.whirlwind.ticks);
    const per = 1 + w.players[0]!.stats.atk;
    expect(50 - t.hp).toBeGreaterThanOrEqual(per * 3);
    expect(far.hp).toBe(50);
    expect(count(w, (x) => x.def === 'skill_whirlwind')).toBe(0);
  });

  it('ground slam on the ground damages and stuns around you', () => {
    const { w, slot } = setup('ground_slam');
    const t = dummy(w, PX + 14, FLOOR_Y - 6);
    cast(w, slot, PX + 14, FLOOR_Y - 6);
    expect(t.hp).toBeLessThan(50);
    expect(statusOf(t, 'stun')).toBeGreaterThan(0);
  });

  it('ground slam in mid-air dives and explodes on landing', () => {
    const { w, slot } = setup('ground_slam');
    const e = placePlayer(w, 0, PX, FLOOR_Y - 48);
    const t = dummy(w, PX + 14, FLOOR_Y - 6);
    cast(w, slot, PX, FLOOR_Y);
    expect(e.vy).toBeGreaterThan(300);
    expect(t.hp).toBe(50);
    run(w, 20, inp());
    expect(e.onGround).toBe(true);
    expect(t.hp).toBeLessThan(50);
  });

  it('war cry hastes nearby allies and weakens nearby foes', () => {
    const w = makeWorld({ players: [{ name: 'A', race: 'drifter', hat: '', companion: '' }, { name: 'B', race: 'drifter', hat: '', companion: '' }] });
    const a = placePlayer(w, 0, PX);
    const b = placePlayer(w, 1, PX + 30);
    const slot = giveSkill(w.players[0]!, 'war_cry');
    const t = dummy(w, PX + 20, a.y);
    const far = dummy(w, PX + 200, a.y);
    run(w, 1, [inp({ skill: slot }), inp()]);
    expect(statusOf(a, 'haste')).toBe(secs(4));
    expect(statusOf(b, 'haste')).toBe(secs(4));
    expect(statusOf(t, 'weak')).toBe(secs(4));
    expect(statusOf(far, 'weak')).toBe(0);
    // Powers are fractions (combat/status semantics): never a full 100% haste / damage wipe.
    expect(statusPower(a, 'haste')).toBe(SKILL_FX.warCry.haste);
    expect(statusPower(t, 'weak')).toBe(SKILL_FX.warCry.weak);
    expect(SKILL_FX.warCry.haste).toBeLessThan(1);
    expect(SKILL_FX.warCry.weak).toBeLessThan(1);
  });

  it('charge rushes toward the aim, invulnerable, damaging foes in the way', () => {
    const { w, e, slot, cy } = setup('charge');
    const t = dummy(w, PX + 30, cy);
    const x0 = e.x;
    cast(w, slot, PX + 100, cy);
    expect(e.invuln).toBeGreaterThan(0);
    run(w, SKILL_FX.charge.ticks, inp({ aimX: PX + 100, aimY: cy }));
    expect(e.x - x0).toBeGreaterThan(30);
    expect(t.hp).toBeLessThan(50);
  });

  it('iron skin grants a shield status', () => {
    const { w, e, slot } = setup('iron_skin');
    cast(w, slot, PX, FLOOR_Y);
    expect(statusOf(e, 'shield')).toBe(secs(6));
  });

  it('cleave hits only in front and causes bleeding', () => {
    const { w, slot, cy } = setup('cleave');
    const front = dummy(w, PX + 12, cy);
    const back = dummy(w, PX - 14, cy);
    cast(w, slot, PX + 50, cy);
    expect(front.hp).toBe(50 - (2 + 2 * w.players[0]!.stats.atk));
    expect(statusOf(front, 'bleed')).toBeGreaterThan(0);
    expect(back.hp).toBe(50);
  });
});

describe('mage effects', () => {
  it('fire burst releases a ring of fireballs (6 at rank 1, 10 at rank 3)', () => {
    const a = setup('fire_burst');
    cast(a.w, a.slot, PX + 10, a.cy);
    const balls = projectiles(a.w, 'fireball');
    expect(balls).toHaveLength(6);
    for (const b of balls) {
      expect(b.team).toBe('player');
      expect(b.projectile!.owner).toBe(a.e.id);
      expect(b.projectile!.damage).toBe(1 + a.w.players[0]!.stats.mag);
    }
    expect(new Set(balls.map((b) => `${Math.sign(Math.round(b.vx))},${Math.sign(Math.round(b.vy))}`)).size).toBeGreaterThan(3);
    const c = setup('fire_burst', 3);
    cast(c.w, c.slot, PX + 10, c.cy);
    expect(projectiles(c.w, 'fireball')).toHaveLength(10);
  });

  it('frost nova damages and freezes foes in its radius only', () => {
    const { w, slot, cy } = setup('frost_nova');
    const t = dummy(w, PX + 20, cy);
    const far = dummy(w, PX + 120, cy);
    cast(w, slot, PX, cy);
    expect(t.hp).toBeLessThan(50);
    expect(statusOf(t, 'freeze')).toBe(secs(1.5));
    expect(far.hp).toBe(50);
    expect(statusOf(far, 'freeze')).toBe(0);
  });

  it('chain lightning jumps between up to 3 foes at rank 1', () => {
    const { w, slot, cy } = setup('chain_lightning');
    const ds = [40, 80, 120, 160].map((dx) => dummy(w, PX + dx, cy));
    cast(w, slot, PX + 40, cy);
    expect(ds.slice(0, 3).every((d) => d.hp < 50)).toBe(true);
    expect(ds[3]!.hp).toBe(50);
    expect(statusOf(ds[0]!, 'stun')).toBeGreaterThan(0);
  });

  it('chain lightning with no target in range fizzles without cost', () => {
    const { w, slot, cy } = setup('chain_lightning');
    const p = w.players[0]!;
    p.mana = 5;
    cast(w, slot, PX + 40, cy);
    expect(p.mana).toBe(5);
    expect(p.skillCooldowns[slot]).toBe(0);
  });

  it('blink teleports toward the cursor, up to its range, never into walls', () => {
    const { w, e, slot, cy } = setup('blink');
    const x0 = e.x;
    cast(w, slot, PX + 200, cy);
    expect(e.x - x0).toBeGreaterThanOrEqual(36);
    expect(e.x - x0).toBeLessThanOrEqual(40);
    // A wall 2 tiles to the right stops the blink short of it.
    const b = setup('blink');
    const wallTx = Math.floor((PX + 16) / TILE);
    b.w.level.grid.fill(wallTx, 0, wallTx, 29, Tile.BEDROCK);
    const bx0 = b.e.x;
    cast(b.w, b.slot, PX + 200, b.cy);
    expect(b.e.x + b.e.w).toBeLessThanOrEqual(wallTx * TILE);
    expect(b.e.x).toBeGreaterThan(bx0);
  });

  it('arcane ward grants a shield status', () => {
    const { w, e, slot } = setup('arcane_ward');
    cast(w, slot, PX, FLOOR_Y);
    expect(statusOf(e, 'shield')).toBe(secs(8));
  });

  it('meteor falls on the cursor after a delay, damaging and burning in an area', () => {
    const { w, slot } = setup('meteor');
    const t = dummy(w, PX + 60, FLOOR_Y - 8);
    const far = dummy(w, PX + 140, FLOOR_Y - 8);
    cast(w, slot, PX + 60, FLOOR_Y - 8, 10);
    expect(t.hp).toBe(50);
    expect(count(w, (x) => x.def === 'skill_meteor')).toBe(1);
    run(w, 40, inp());
    expect(t.hp).toBe(50 - (4 + 2 * w.players[0]!.stats.mag));
    expect(statusOf(t, 'burn')).toBeGreaterThan(0);
    expect(far.hp).toBe(50);
    expect(count(w, (x) => x.def === 'skill_meteor')).toBe(0);
  });
});

describe('ranger effects', () => {
  it('multishot fires a fan of 3 arrows toward the aim', () => {
    const { w, slot, cy } = setup('multishot');
    cast(w, slot, PX + 100, cy);
    const arrows = projectiles(w, 'arrow');
    expect(arrows).toHaveLength(3);
    for (const a of arrows) {
      expect(a.vx).toBeGreaterThan(0);
      expect(a.projectile!.team).toBe('player');
      expect(a.projectile!.damage).toBe(1 + w.players[0]!.stats.dex);
    }
    expect(new Set(arrows.map((a) => Math.round(a.vy))).size).toBe(3);
  });

  it('arrow rain drops 8 arrows around the cursor over 1.2 s', () => {
    const { w, slot } = setup('arrow_rain');
    const tx = PX + 80;
    cast(w, slot, tx, FLOOR_Y - 4, SKILL_FX.arrowRain.ticks);
    const arrows = projectiles(w, 'arrow');
    expect(arrows).toHaveLength(8);
    for (const a of arrows) {
      expect(Math.abs(a.x - tx)).toBeLessThan(SKILL_FX.arrowRain.width);
      expect(a.projectile!.sourceItem).toBe('skill:arrow_rain');
    }
  });

  it('bear trap snaps on the first foe to step in (damage + hold), max 2 traps', () => {
    const { w, e, slot } = setup('bear_trap');
    cast(w, slot, PX, FLOOR_Y, 3);
    const trap = w.entities.find((x) => x.def === 'skill_bear_trap')!;
    expect(trap).toBeDefined();
    expect(trap.y + trap.h).toBeCloseTo(FLOOR_Y, 0);
    const t = dummy(w, trap.x + trap.w / 2, trap.y + 2);
    run(w, 1, inp());
    expect(t.hp).toBe(50 - (3 + w.players[0]!.stats.dex));
    expect(statusOf(t, 'stun')).toBeGreaterThan(0);
    // Only the first foe: a second one is not hurt.
    const t2 = dummy(w, trap.x + trap.w / 2, trap.y + 2);
    run(w, 1, inp());
    expect(t2.hp).toBe(50);
    // Max 2 traps per player.
    for (let i = 0; i < 3; i++) {
      w.players[0]!.skillCooldowns[slot] = 0;
      placePlayer(w, 0, PX + 40 + i * 30);
      cast(w, slot, e.x, FLOOR_Y);
    }
    expect(count(w, (x) => x.def === 'skill_bear_trap')).toBeLessThanOrEqual(2);
  });

  it('smoke bomb dazes and slows nearby foes and hastes you', () => {
    const { w, e, slot, cy } = setup('smoke_bomb');
    const t = dummy(w, PX + 20, cy);
    cast(w, slot, PX, cy);
    expect(statusOf(t, 'stun')).toBeGreaterThan(0);
    expect(statusOf(t, 'slow')).toBe(secs(2));
    expect(statusOf(e, 'haste')).toBe(secs(2));
    expect(statusPower(t, 'slow')).toBe(SKILL_FX.smokeBomb.slow);
    expect(statusPower(e, 'haste')).toBeLessThan(1);
    expect(e.invuln).toBeGreaterThan(0);
  });

  it('hawk seeks out and strikes a nearby foe', () => {
    const { w, slot, cy } = setup('hawk');
    const t = dummy(w, PX + 70, cy - 10);
    cast(w, slot, PX, cy, secs(2));
    expect(t.hp).toBeLessThan(50);
  });

  it('volley step leaps away from the cursor while firing at it', () => {
    const { w, e, slot, cy } = setup('volley_step');
    cast(w, slot, PX + 100, cy);
    expect(e.vx).toBeLessThan(0);
    expect(e.vy).toBeLessThan(0);
    const arrows = projectiles(w, 'arrow');
    expect(arrows).toHaveLength(2);
    for (const a of arrows) expect(a.vx).toBeGreaterThan(0);
  });
});
