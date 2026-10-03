import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { animFrame, heldRestAngle, heldSpriteKey, spriteKeyFor, swingAngle } from '../../src/render/entity-keys';
import { createRun } from '../../src/sim';
import type { Entity } from '../../src/sim/types';

const world = createRun(7, [{ name: 'A', race: 'drifter', hat: '', companion: '' }, { name: 'B', race: 'drifter', hat: '', companion: '' }]);

function ent(over: Partial<Entity>): Entity {
  return world.spawn('prop', 'x', 0, 0, over);
}

describe('entity → sprite keys', () => {
  it('players get race art with a per-player suffix', () => {
    expect(spriteKeyFor(world.playerEntity(0)!, world.players)).toBe(`${Content.races.get('drifter')!.sprite}#0`);
    expect(spriteKeyFor(world.playerEntity(1)!, world.players)).toBe(`${Content.races.get('drifter')!.sprite}#1`);
  });

  it('uses content sprite keys and falls back to kind-prefixed keys', () => {
    const slime = Content.enemies.values().next().value!;
    expect(spriteKeyFor(ent({ kind: 'enemy', def: slime.id }), world.players)).toBe(slime.sprite);
    expect(spriteKeyFor(ent({ kind: 'enemy', def: 'nope' }), world.players)).toBe('enemy_nope');
    const res = Content.resources.values().next().value!;
    expect(spriteKeyFor(ent({ kind: 'resource', def: res.id, resource: { def: res.id, hitFlash: 0 } }), world.players)).toBe(res.sprite);
    expect(spriteKeyFor(ent({ kind: 'projectile', def: 'fireball' }), world.players)).toMatch(/fireball/);
  });

  it('pickups show the item icon, gold shows a coin', () => {
    const wood = Content.items.get('wood')!;
    expect(spriteKeyFor(ent({ kind: 'pickup', def: 'wood', pickup: { item: { id: 'wood', count: 1 }, delay: 0, gold: 0 } }), world.players)).toBe(wood.sprite);
    expect(spriteKeyFor(ent({ kind: 'pickup', def: 'gold', pickup: { item: { id: 'gold', count: 1 }, delay: 0, gold: 5 } }), world.players)).toBe('gold_coin');
  });

  it('held items map to generic silhouettes', () => {
    const axe = Content.items.get('axe')!;
    expect(heldSpriteKey(axe)).toMatch(/^held:axe:/);
    expect(heldRestAngle('held:bow:wood')).toBe(0);
    expect(heldRestAngle('held:sword:iron')).toBeLessThan(0);
  });
});

describe('poses and animation', () => {
  it('swing arcs from above the aim to below it, mirrored when facing left', () => {
    const r0 = swingAngle(0, 1, 10, 10);
    const r1 = swingAngle(0, 1, 0, 10);
    expect(r0.angle).toBeLessThan(-1);
    expect(r1.angle).toBeGreaterThan(1);
    const l0 = swingAngle(Math.PI, -1, 10, 10);
    const l1 = swingAngle(Math.PI, -1, 0, 10);
    // Facing left: starts above (sin < 0) and ends below (sin > 0) too.
    expect(Math.sin(l0.angle)).toBeLessThan(0);
    expect(Math.sin(l1.angle)).toBeGreaterThan(0);
    expect(swingAngle(0, 1, 5, 10).progress).toBeGreaterThan(0.5);
  });

  it('animFrame loops or holds', () => {
    expect(animFrame(4, 10, 0)).toBe(0);
    expect(animFrame(4, 10, 0.25)).toBe(2);
    expect(animFrame(4, 10, 0.45)).toBe(0);
    expect(animFrame(4, 10, 5, true)).toBe(3);
    expect(animFrame(1, 10, 3)).toBe(0);
  });
});
