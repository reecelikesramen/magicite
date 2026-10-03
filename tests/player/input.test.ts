import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../../src/engine/input';

/** Minimal DOM stand-ins: InputManager only needs addEventListener on window/target. */
let win: EventTarget;

function key(type: 'keydown' | 'keyup', code: string): void {
  win.dispatchEvent(Object.assign(new Event(type), { code }));
}

function make(): InputManager {
  return new InputManager(new EventTarget() as unknown as HTMLElement);
}

const at = { x: 0, y: 0 };

describe('InputManager movement edges', () => {
  beforeEach(() => {
    win = new EventTarget();
    vi.stubGlobal('window', win);
    vi.stubGlobal('navigator', {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps Q / E to dash left / right (both = none)', () => {
    const im = make();
    key('keydown', 'KeyQ');
    expect(im.sample(at).dash).toBe(-1);
    key('keyup', 'KeyQ');
    expect(im.sample(at).dash).toBe(0);
    key('keydown', 'KeyE');
    expect(im.sample(at).dash).toBe(1);
    key('keydown', 'KeyQ');
    expect(im.sample(at).dash).toBe(0);
  });

  it('releasing one of two held dash keys does not fire a dash the other way (LB+RB chord)', () => {
    const im = make();
    key('keydown', 'KeyQ');
    expect(im.sample(at).dash).toBe(-1);
    key('keydown', 'KeyE');
    expect(im.sample(at).dash).toBe(0);
    key('keyup', 'KeyE');
    expect(im.sample(at).dash).toBe(0); // still latched: Q alone again is not a new press
    key('keyup', 'KeyQ');
    expect(im.sample(at).dash).toBe(0);
    key('keydown', 'KeyE');
    expect(im.sample(at).dash).toBe(1); // a fresh press works again
  });

  it('a tap shorter than a tick still produces one jump tick', () => {
    const im = make();
    key('keydown', 'Space');
    key('keyup', 'Space');
    expect(im.sample(at).jump).toBe(true);
    expect(im.sample(at).jump).toBe(false);
  });

  it('a tap survives rendered frames in which no tick ran (high refresh rate)', () => {
    const im = make();
    key('keydown', 'KeyE');
    key('keyup', 'KeyE');
    im.endFrame(); // frame with no tick
    expect(im.sample(at).dash).toBe(1);
    expect(im.sample(at).dash).toBe(0);
  });

  it('release + re-press between two samples inserts a released tick so the second press is an edge', () => {
    const im = make();
    key('keydown', 'Space');
    expect(im.sample(at).jump).toBe(true);
    key('keyup', 'Space');
    key('keydown', 'Space');
    const seq = [im.sample(at).jump, im.sample(at).jump, im.sample(at).jump];
    expect(seq).toEqual([false, true, true]);
  });

  it('same for a quick double dash tap', () => {
    const im = make();
    key('keydown', 'KeyE');
    expect(im.sample(at).dash).toBe(1);
    key('keyup', 'KeyE');
    key('keydown', 'KeyE');
    key('keyup', 'KeyE');
    expect([im.sample(at).dash, im.sample(at).dash, im.sample(at).dash]).toEqual([0, 1, 0]);
  });

  it('holding a key across many samples does not flicker', () => {
    const im = make();
    key('keydown', 'Space');
    const seq: boolean[] = [];
    for (let i = 0; i < 5; i++) seq.push(im.sample(at).jump);
    expect(seq.every(Boolean)).toBe(true);
  });
});
