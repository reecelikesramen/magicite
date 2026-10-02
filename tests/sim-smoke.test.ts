import { describe, expect, it } from 'vitest';
import { validateContent } from '../src/content';
import { createRun, emptyInput } from '../src/sim';

const setup = { name: 'TEST', race: 'human', hat: '', companion: '' };

describe('simulation smoke', () => {
  it('content cross-references are valid', () => {
    expect(validateContent()).toEqual([]);
  });

  it('player lands on the ground and can walk + jump without leaving the level', () => {
    const world = createRun(1234, [setup]);
    const e = world.playerEntity(0)!;
    for (let i = 0; i < 60; i++) world.step([emptyInput()]);
    expect(e.onGround).toBe(true);
    const startX = e.x;
    for (let i = 0; i < 240; i++) world.step([{ ...emptyInput(), moveX: 1, jump: i % 40 < 20 }]);
    expect(e.x).toBeGreaterThan(startX + 40);
    expect(e.x).toBeGreaterThanOrEqual(0);
    expect(e.y + e.h).toBeLessThanOrEqual(world.level.grid.pixelHeight);
  });

  it('is deterministic for a given seed and input stream', () => {
    const run = () => {
      const w = createRun(99, [setup]);
      for (let i = 0; i < 600; i++) w.step([{ ...emptyInput(), moveX: Math.sin(i / 30) > 0 ? 1 : -1, jump: i % 50 < 10, attack: i % 20 < 5, aimX: 0, aimY: 0 }]);
      const e = w.playerEntity(0)!;
      return [e.x, e.y, w.entities.length, w.rng.getState().d];
    };
    expect(run()).toEqual(run());
  });
});
