import { describe, expect, it } from 'vitest';
import { Content } from '../../src/content';
import { hueSat, luminance, mix, normalizeHue, shade } from '../../src/render/color';
import { biomeFamily, biomeStyle, FAMILY_PALETTES } from '../../src/render/style';

describe('colour helpers', () => {
  it('mix / shade / normalizeHue', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x7f7f7f);
    expect(shade(0x804020, 2)).toBe(0xff8040);
    expect(normalizeHue(0x1a1410) >> 16).toBe(0xff);
    expect(luminance(0xffffff)).toBeCloseTo(1, 5);
    expect(hueSat(0xff0000).hue).toBe(0);
  });
});

describe('biome styles', () => {
  it('maps GDD biome ids (and legacy ids) to visual families', () => {
    for (const id of ['woods', 'fen', 'hollow', 'rime', 'amethyst', 'cinder', 'lair'] as const) expect(biomeFamily(id)).toBe(id);
    expect(biomeFamily('toadvale_forest')).toBe('woods');
    expect(biomeFamily('volcano_depths')).toBe('cinder');
  });

  it('falls back to palette analysis for unknown ids', () => {
    expect(biomeFamily('zzz', FAMILY_PALETTES.cinder)).toBe('cinder');
    expect(biomeFamily('zzz', FAMILY_PALETTES.rime)).toBe('rime');
    expect(biomeFamily('zzz', FAMILY_PALETTES.fen)).toBe('fen');
    expect(biomeFamily('zzz', FAMILY_PALETTES.woods)).toBe('woods');
  });

  it('resolves per-family fringe / special looks', () => {
    expect(biomeStyle('woods').fringe).toBe('grass');
    expect(biomeStyle('rime').fringe).toBe('snow');
    expect(biomeStyle('rime').special).toBe('ice');
    expect(biomeStyle('cinder').fringe).toBe('crust');
    expect(biomeStyle('cinder').fringeEmissive).toBe(true);
    expect(biomeStyle('amethyst').special).toBe('crystal');
  });

  it('uses the content palette when a def exists', () => {
    for (const def of Content.biomes.values()) {
      const st = biomeStyle(def.id, def);
      expect(st.pal).toBe(def.palette);
      expect(st.ambientParticles).toBe(def.ambientParticles);
    }
  });

  it('every family palette has full ramps', () => {
    for (const pal of Object.values(FAMILY_PALETTES)) {
      for (const k of ['wall', 'ground', 'fringe', 'rock', 'accent'] as const) expect(pal[k].length).toBe(4);
      expect(pal.ambientLevel).toBeGreaterThan(0);
      expect(pal.ambientLevel).toBeLessThan(0.3);
    }
  });
});
