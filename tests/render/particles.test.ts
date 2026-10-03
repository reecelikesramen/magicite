import { describe, expect, it } from 'vitest';
import { lightTint, flicker } from '../../src/render/lights';
import { damageColor, DAMAGE_COLORS } from '../../src/render/overlay';
import { AMBIENT, resolveAmbient, updateAmbient } from '../../src/render/particles/ambient';
import { biomeStyle } from '../../src/render/style';
import { emitPreset, GENERIC, PRESETS, resolvePreset } from '../../src/render/particles/presets';
import { PF, ParticleSystem } from '../../src/render/particles/system';

describe('particle system', () => {
  it('spawns, integrates gravity/drag and expires particles', () => {
    const ps = new ParticleSystem(16);
    ps.spawn(0, 0, 10, 0, 0.5, 1, 0xffffff, 0, 100, 0);
    ps.update(0.1, 0);
    expect(ps.count).toBe(1);
    expect(ps.x[0]).toBeCloseTo(1, 3);
    expect(ps.vy[0]).toBeCloseTo(10, 3);
    for (let i = 0; i < 10; i++) ps.update(0.1, 0);
    expect(ps.count).toBe(0);
  });

  it('recycles when full instead of growing', () => {
    const ps = new ParticleSystem(8);
    for (let i = 0; i < 20; i++) ps.spawn(i, 0, 0, 0, 1 + i, 1, 0, 0);
    expect(ps.count).toBe(8);
  });

  it('swap-removes dead particles and keeps the rest intact', () => {
    const ps = new ParticleSystem(8);
    ps.spawn(1, 0, 0, 0, 0.05, 1, 0x111111, 0);
    ps.spawn(2, 0, 0, 0, 5, 1, 0x222222, 0);
    ps.spawn(3, 0, 0, 0, 5, 1, 0x333333, 0);
    ps.update(0.1, 0);
    expect(ps.count).toBe(2);
    expect([...ps.color.slice(0, 2)].sort()).toEqual([0x222222, 0x333333]);
  });

  it('COLLIDE particles settle on solid ground', () => {
    const ps = new ParticleSystem(4);
    ps.spawn(0, 0, 0, 50, 5, 1, 0, PF.COLLIDE, 400);
    const solid = (_x: number, y: number) => y >= 10;
    for (let i = 0; i < 30; i++) ps.update(1 / 60, 0, solid);
    expect(ps.count).toBe(1);
    expect(ps.y[0]).toBeLessThan(10);
    expect(ps.vy[0]).toBe(0);
  });

  it('FADE lowers alpha over life; SHRINK reduces size', () => {
    const ps = new ParticleSystem(4);
    ps.spawn(0, 0, 0, 0, 1, 2, 0, PF.FADE | PF.SHRINK);
    ps.update(0.8, 0);
    expect(ps.alpha[0]).toBeLessThan(0.5);
    expect(ps.sizeOf(0)).toBe(1);
  });
});

describe('presets', () => {
  it('known presets emit their default count; aliases resolve; unknown → generic', () => {
    const ps = new ParticleSystem(512);
    for (const [name, p] of Object.entries(PRESETS)) {
      ps.clear();
      expect(emitPreset(ps, name, 10, 10), name).toBe(p.count);
    }
    expect(resolvePreset('spark')).toBe(PRESETS.hit_spark);
    expect(resolvePreset('totally_new_effect')).toBe(GENERIC);
  });

  it('event colour and count override the preset', () => {
    const ps = new ParticleSystem(64);
    expect(emitPreset(ps, 'wood_chips', 0, 0, { count: 3, color: 0x123456 })).toBe(3);
    const colors = new Set([...ps.color.slice(0, 3)]);
    expect([...colors].every((c) => c !== PRESETS.wood_chips!.colors[0])).toBe(true);
  });

  it('directional presets follow the event direction', () => {
    const ps = new ParticleSystem(64);
    emitPreset(ps, 'hit_spark', 0, 0, { count: 20, dirX: 1, dirY: 0 });
    let right = 0;
    for (let i = 0; i < ps.count; i++) if (ps.vx[i]! > 0) right++;
    expect(right).toBeGreaterThan(5);
  });
});

describe('ambient particles', () => {
  it('fills the view up to the biome density and culls when the camera leaves', () => {
    const ps = new ParticleSystem(1024);
    const view = { x: 0, y: 0, w: 320, h: 180 };
    for (let i = 0; i < 200; i++) updateAmbient(ps, 'fireflies', view);
    const target = Math.round((AMBIENT.fireflies!.density * (320 + 48) * (180 + 48)) / 10000);
    expect(ps.ambientCount).toBe(target);
    for (let i = 0; i < ps.count; i++) expect(ps.flags[i]! & PF.AMBIENT).toBeTruthy();
    updateAmbient(ps, 'fireflies', { x: 5000, y: 5000, w: 320, h: 180 });
    ps.update(0.01, 0);
    for (let i = 0; i < ps.count; i++) expect(ps.x[i]).toBeGreaterThan(4000);
  });

  it('resolves the names biome content uses (aliases) and has a kind for every family default', () => {
    // Names used by the gen workstream's biome defs and the render spec.
    for (const name of ['fireflies', 'spores', 'dust', 'snow', 'crystal_motes', 'embers', 'blight_motes', 'bubbles']) {
      expect(resolveAmbient(name), name).toBeDefined();
    }
    expect(resolveAmbient('crystal_motes')).toBe(AMBIENT.sparkles);
    expect(resolveAmbient('blight_motes')).toBe(AMBIENT.spores_pink);
    expect(resolveAmbient('none')).toBeUndefined();
    for (const fam of ['woods', 'fen', 'hollow', 'rime', 'amethyst', 'cinder', 'lair']) {
      expect(resolveAmbient(biomeStyle(fam).ambientDefault), fam).toBeDefined();
    }
    const ps = new ParticleSystem(256);
    expect(updateAmbient(ps, 'crystal_motes', { x: 0, y: 0, w: 320, h: 180 })).toBeGreaterThan(0);
  });

  it('never spawns inside solid tiles and ignores unknown kinds', () => {
    const ps = new ParticleSystem(256);
    updateAmbient(ps, 'embers', { x: 0, y: 0, w: 320, h: 180 }, (_x, y) => y > 90, 50);
    for (let i = 0; i < ps.count; i++) expect(ps.y[i]).toBeLessThanOrEqual(90);
    expect(updateAmbient(ps, 'none', { x: 0, y: 0, w: 320, h: 180 })).toBe(0);
  });
});

describe('light helpers', () => {
  it('encodes light tints at half range so lights can over-expose', () => {
    expect(lightTint(0xffffff, 1)).toBe(0x7f7f7f);
    expect(lightTint(0xffffff, 2)).toBe(0xffffff);
    expect(lightTint(0xff0000, 4)).toBe(0xff0000);
    expect(lightTint(0xffffff, 1, 1)).toBe(0xffffff);
  });

  it('flicker stays in 0..1', () => {
    for (let t = 0; t < 10; t += 0.07) {
      const f = flicker(3, t);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it('damage numbers: red for player damage, yellow crits, typed colours', () => {
    expect(damageColor(true, false, 'physical')).toBe(DAMAGE_COLORS.toPlayer);
    expect(damageColor(false, true, 'physical')).toBe(DAMAGE_COLORS.crit);
    expect(damageColor(false, false, 'fire')).toBe(DAMAGE_COLORS.fire);
    expect(damageColor(false, false, 'physical')).toBe(DAMAGE_COLORS.toEnemy);
  });
});
