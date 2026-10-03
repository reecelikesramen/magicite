import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim';
import { enemyScale, scaleEnemyDamage } from '../../src/sim/progression/difficulty';

const hero = (name: string, difficulty: 'normal' | 'madcap' = 'normal') => ({ name, race: 'drifter', hat: '', companion: '', difficulty });

describe('co-op and Madcap enemy scaling (GDD §2b.6)', () => {
  it('+50% HP and +40% damage per extra player, multiplied by Madcap', () => {
    expect(enemyScale(createRun(1, [hero('A')]))).toEqual({ hp: 1, damage: 1 });
    const three = enemyScale(createRun(1, [hero('A'), hero('B'), hero('C')]));
    expect(three.hp).toBeCloseTo(2);
    expect(three.damage).toBeCloseTo(1.8);
    const mad = enemyScale(createRun(1, [hero('A', 'madcap'), hero('B')]));
    expect(mad.hp).toBeCloseTo(1.6 * 1.5);
    expect(mad.damage).toBeCloseTo(1.5 * 1.4);
  });

  it('spawned enemies get the HP multiplier; damage rounds up', () => {
    const solo = createRun(7, [hero('A')]);
    const duo = createRun(7, [hero('A'), hero('B')]);
    const hp = (w: typeof solo) => w.entities.filter((e) => e.kind === 'enemy' && e.def !== 'blight_wraith').map((e) => e.maxHp);
    const a = hp(solo);
    const b = hp(duo);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a.map((x) => Math.ceil(x * 1.5)));
    expect(scaleEnemyDamage(duo, 1)).toBe(2); // ceil(1.4)
    expect(scaleEnemyDamage(solo, 1)).toBe(1);
  });
});
