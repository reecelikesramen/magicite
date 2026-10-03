import { describe, expect, it } from 'vitest';
import { Camera, clampAxis } from '../../src/render/camera';

const bounds = { x: 0, y: 0, w: 960, h: 384 };
const still = (x: number, y: number) => ({ x, y, vx: 0, vy: 0, grounded: true });

describe('camera', () => {
  it('clampAxis keeps the view inside the area and centres small areas', () => {
    expect(clampAxis(-50, 320, 0, 960)).toBe(0);
    expect(clampAxis(900, 320, 0, 960)).toBe(640);
    expect(clampAxis(100, 320, 0, 960)).toBe(100);
    expect(clampAxis(100, 320, 0, 200)).toBe(-60);
  });

  it('snaps to the first target and converges on a still target', () => {
    const c = new Camera();
    c.setView(320, 180);
    c.update(1 / 60, still(480, 200), bounds);
    expect(c.x).toBeCloseTo(480 - 160, 5);
    expect(c.y).toBeCloseTo(200 - 90, 5);
    for (let i = 0; i < 240; i++) c.update(1 / 60, still(500, 210), bounds);
    expect(c.x).toBeCloseTo(500 - 160, 1);
    expect(c.y).toBeCloseTo(210 - 90, 1);
  });

  it('looks ahead in the direction of motion (bounded)', () => {
    const c = new Camera();
    c.setView(320, 180);
    c.update(1 / 60, still(480, 200), bounds);
    for (let i = 0; i < 300; i++) c.update(1 / 60, { x: 480, y: 200, vx: 200, vy: 0, grounded: true }, bounds);
    const ahead = c.x + 160 - 480;
    expect(ahead).toBeGreaterThan(10);
    expect(ahead).toBeLessThanOrEqual(32.5);
  });

  it('never leaves the level bounds', () => {
    const c = new Camera();
    c.setView(320, 180);
    for (let i = 0; i < 120; i++) c.update(1 / 60, still(5, 5), bounds);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
    for (let i = 0; i < 400; i++) c.update(1 / 60, still(955, 380), bounds);
    expect(c.x).toBeCloseTo(640, 3);
    expect(c.y).toBeCloseTo(204, 3);
  });

  it('shake decays to zero and the strongest shake wins', () => {
    const c = new Camera();
    c.setView(320, 180);
    let i = 0;
    const rand = () => (i++ % 2 ? 1 : 0);
    c.addShake(4, 30);
    c.addShake(1, 5);
    c.update(1 / 60, still(480, 200), bounds, rand);
    expect(Math.abs(c.shakeX) + Math.abs(c.shakeY)).toBeGreaterThan(2);
    for (let k = 0; k < 40; k++) c.update(1 / 60, still(480, 200), bounds, rand);
    expect(c.shakeX).toBe(0);
    expect(c.shakeY).toBe(0);
  });
});
