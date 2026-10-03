import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { createRun } from '../../src/sim';
import { secs } from '../../src/sim/constants';
import { spawnPickup } from '../../src/sim/items/drops';
import { COMPANION, companionOf, spawnCompanions } from '../../src/sim/progression/companions';
import { addPlayer } from '../../src/sim/player/create';
import { travel } from '../../src/sim/run';
import type { World } from '../../src/sim/world';
import { dummy, FLOOR_Y, inp, makeWorld, placePlayer, run, statusOf } from './helpers';

function withCompanion(id: string): World {
  const w = makeWorld({ players: [{ name: 'A', race: 'drifter', hat: '', companion: id }] });
  placePlayer(w, 0, 200);
  spawnCompanions(w);
  return w;
}

describe('companions', () => {
  it('6 companions covering every role', () => {
    expect([...Content.companions.keys()]).toEqual(['mend_sprite', 'ember_bat', 'lantern_wisp', 'haste_beetle', 'floaty_slime', 'gizmo_drone']);
    expect(new Set([...Content.companions.values()].map((c) => c.role))).toEqual(new Set(['attack', 'light', 'collect', 'heal', 'shield']));
  });

  it('spawn with the run and again on every level load, owned by the player', () => {
    const w = createRun(3, [{ name: 'A', race: 'drifter', hat: '', companion: 'ember_bat' }, { name: 'B', race: 'drifter', hat: '', companion: '' }]);
    const c = companionOf(w, w.players[0]!)!;
    expect(c).toBeDefined();
    expect(c.kind).toBe('companion');
    expect(c.owner).toBe(w.players[0]!.entityId);
    expect(c.team).toBe('player');
    expect(c.collides).toBe(false);
    expect(companionOf(w, w.players[1]!)).toBeUndefined();
    travel(w, 0);
    const c2 = companionOf(w, w.players[0]!)!;
    expect(c2).toBeDefined();
    expect(c2.id).not.toBe(c.id);
    expect(w.entities.filter((e) => e.kind === 'companion')).toHaveLength(1);
  });

  it('follows its owner smoothly and snaps back after a teleport', () => {
    const w = withCompanion('mend_sprite');
    const c = companionOf(w, w.players[0]!)!;
    const e = placePlayer(w, 0, 300);
    run(w, 1, inp());
    const d1 = Math.abs(c.x - e.x);
    expect(d1).toBeGreaterThan(20); // not instant
    run(w, 60, inp());
    expect(Math.abs(c.x + c.w / 2 - (e.x + e.w / 2))).toBeLessThan(16);
    expect(c.y).toBeLessThan(e.y);
    placePlayer(w, 0, 600);
    run(w, 1, inp());
    expect(Math.abs(c.x + c.w / 2 - (e.x + e.w / 2))).toBeLessThan(16);
  });

  it('attack role zaps nearby enemies periodically (kill credit goes to the owner)', () => {
    const w = withCompanion('ember_bat');
    const e = w.playerEntity(0)!;
    const t = dummy(w, 220, e.y - 8, 3);
    run(w, COMPANION.attackPeriod + 2, inp());
    expect(t.hp).toBeLessThan(3);
    run(w, COMPANION.attackPeriod * 2 + 2, inp());
    expect(t.dead || t.hp <= 0).toBe(true);
    expect(w.players[0]!.runStats.damageDealt).toBeGreaterThan(0);
  });

  it('light role carries a big light', () => {
    const w = withCompanion('lantern_wisp');
    const c = companionOf(w, w.players[0]!)!;
    expect(c.light!.radius).toBe(Content.companions.get('lantern_wisp')!.power);
    expect(c.light!.radius).toBeGreaterThan(80);
  });

  it('collect role pulls nearby drops toward the owner', () => {
    const w = withCompanion('haste_beetle');
    const e = w.playerEntity(0)!;
    spawnPickup(w, 'wood', 1, 240, FLOOR_Y - 4);
    const pk = w.entities.find((x) => x.kind === 'pickup')!;
    run(w, 25, inp());
    expect(pk.vx).toBeLessThan(0);
    expect(Math.abs(pk.x - e.x)).toBeLessThan(40);
  });

  it('heal role restores 1 HP every 30 s, never above max', () => {
    const w = withCompanion('mend_sprite');
    const e = w.playerEntity(0)!;
    e.hp = e.maxHp - 2;
    run(w, secs(29), inp());
    expect(e.hp).toBe(e.maxHp - 2);
    run(w, secs(1) + 2, inp());
    expect(e.hp).toBe(e.maxHp - 1);
    run(w, secs(30) + 2, inp());
    expect(e.hp).toBe(e.maxHp);
    run(w, secs(31), inp());
    expect(e.hp).toBe(e.maxHp);
  });

  it('shield role grants a shield status every 20 s', () => {
    const w = withCompanion('gizmo_drone');
    const e = w.playerEntity(0)!;
    run(w, secs(19), inp());
    expect(statusOf(e, 'shield')).toBe(0);
    run(w, secs(1) + 2, inp());
    expect(statusOf(e, 'shield')).toBeGreaterThan(0);
  });

  it('passive companion mods apply to the owner', () => {
    const w = makeWorld({ players: [{ name: 'A', race: 'drifter', hat: '', companion: 'haste_beetle' }] });
    expect(w.players[0]!.mods.moveSpeed).toBeCloseTo(0.15);
  });

  it('a co-op player joining mid-run gets their companion and race start bonus on the next tick', () => {
    const w = createRun(3, [{ name: 'A', race: 'drifter', hat: '', companion: '' }]);
    run(w, 5, inp());
    const late = addPlayer(w, { name: 'B', race: 'highborn', hat: '', companion: 'ember_bat' });
    run(w, 1, [inp(), inp()]);
    expect(companionOf(w, late)).toBeDefined();
    expect(late.gold).toBe(30);
    expect(late.runStats.district).toBe(1);
    run(w, 5, [inp(), inp()]);
    expect(late.gold).toBe(30); // once only
    expect(w.entities.filter((e) => e.kind === 'companion')).toHaveLength(1);
  });

  it("a departed player's companion leaves with them and returns on reconnect", () => {
    const w = withCompanion('lantern_wisp');
    const owner = w.playerEntity(0)!;
    owner.dead = true; // how the net host hides a departed player
    run(w, 1, inp());
    expect(companionOf(w, w.players[0]!)).toBeUndefined();
    owner.dead = false;
    run(w, 1, inp());
    expect(companionOf(w, w.players[0]!)).toBeDefined();
  });

  it('a companion without an owner disappears', () => {
    const w = withCompanion('ember_bat');
    const c = companionOf(w, w.players[0]!)!;
    c.owner = 9999;
    run(w, 1, inp());
    expect(w.entities.includes(c)).toBe(false);
  });
});
