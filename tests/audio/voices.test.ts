import { describe, expect, it } from 'vitest';
import { spatialize, SPATIAL } from '../../src/audio/spatial';
import { VoiceLimiter } from '../../src/audio/voices';

describe('VoiceLimiter', () => {
  it('drops retriggers of the same id within the gap', () => {
    const v = new VoiceLimiter();
    expect(v.tryStart('hit', 0, 0.2, 4, 0.03)).toBe(true);
    expect(v.tryStart('hit', 0, 0.2, 4, 0.03)).toBe(false);
    expect(v.tryStart('hit', 0.02, 0.2, 4, 0.03)).toBe(false);
    expect(v.tryStart('hit', 0.04, 0.2, 4, 0.03)).toBe(true);
    // Other ids are independent.
    expect(v.tryStart('coin', 0.04, 0.2, 4, 0.03)).toBe(true);
  });

  it('caps concurrent voices per id and frees them when they end', () => {
    const v = new VoiceLimiter();
    let t = 0;
    let started = 0;
    for (let i = 0; i < 10; i++, t += 0.05) if (v.tryStart('arrow_hit', t, 1, 3, 0.03)) started++;
    expect(started).toBe(3);
    expect(v.tryStart('arrow_hit', 1.01, 1, 3, 0.03)).toBe(true); // first voice ended at 1.0
  });

  it('enforces a global cap across ids', () => {
    const v = new VoiceLimiter(5);
    let started = 0;
    for (let i = 0; i < 12; i++) if (v.tryStart(`id${i}`, 0, 1, 3, 0)) started++;
    expect(started).toBe(5);
    expect(v.playing(0.5)).toBe(5);
    expect(v.playing(1.5)).toBe(0);
    expect(v.tryStart('later', 1.5, 1, 3, 0)).toBe(true);
  });

  it('reset forgets everything', () => {
    const v = new VoiceLimiter();
    v.tryStart('a', 0, 1, 1, 0);
    v.reset();
    expect(v.tryStart('a', 0, 1, 1, 0)).toBe(true);
  });
});

describe('spatialize', () => {
  const out = { gain: 0, pan: 0 };
  it('is full volume and centred on the listener', () => {
    expect(spatialize(0, 0, out)).toEqual({ gain: 1, pan: 0 });
  });

  it('falls off with distance and is silent beyond the far radius', () => {
    const near = spatialize(SPATIAL.near + 20, 0, out).gain;
    const mid = spatialize((SPATIAL.near + SPATIAL.far) / 2, 0, out).gain;
    const far = spatialize(SPATIAL.far + 1, 0, out).gain;
    expect(near).toBeLessThan(1);
    expect(mid).toBeLessThan(near);
    expect(mid).toBeGreaterThan(0);
    expect(far).toBe(0);
  });

  it('weights vertical distance more than horizontal', () => {
    const h = spatialize(200, 0, out).gain;
    const v = spatialize(0, 200, out).gain;
    expect(v).toBeLessThan(h);
  });

  it('pans by horizontal offset, never fully hard', () => {
    expect(spatialize(-50, 0, out).pan).toBeLessThan(0);
    expect(spatialize(50, 0, out).pan).toBeGreaterThan(0);
    expect(Math.abs(spatialize(5000, 0, out).pan)).toBeCloseTo(SPATIAL.maxPan, 9);
    expect(spatialize(0, 100, out).pan).toBe(0);
  });
});
