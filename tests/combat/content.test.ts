import { describe, expect, it } from 'vitest';
import { Content, validateContent } from '../../src/content';
import { PROJECTILES } from '../../src/content/projectiles';
import { STATUS_RULES } from '../../src/sim/combat/status';

const CANONICAL = ['arrow', 'bolt', 'fireball', 'ice_shard', 'lightning', 'arcane_orb', 'bomb', 'throwing_knife', 'slime_ball', 'fire_spit', 'magic_orb', 'web_shot'];

describe('projectile content', () => {
  it('defines every canonical projectile id', () => {
    for (const id of CANONICAL) expect(Content.projectiles.has(id), id).toBe(true);
  });

  it('keeps validateContent() green', () => {
    expect(validateContent()).toEqual([]);
  });

  it('has sane numbers and valid status ids', () => {
    for (const p of PROJECTILES) {
      expect(p.speed, p.id).toBeGreaterThan(0);
      expect(p.size, p.id).toBeGreaterThan(0);
      expect(p.life, p.id).toBeGreaterThan(0);
      expect(p.pierce, p.id).toBeGreaterThanOrEqual(0);
      expect(p.sprite.startsWith('proj_'), p.id).toBe(true);
      for (const s of p.onHit ?? []) expect(STATUS_RULES[s.id], `${p.id}:${s.id}`).toBeDefined();
      if (p.recoverItem) expect(Content.items.has(p.recoverItem)).toBe(true);
    }
    expect(Content.projectiles.get('lightning')).toMatchObject({ pierce: 99 });
    expect(Content.projectiles.get('bomb')?.explode?.breaksTiles).toBe(true);
  });
});
