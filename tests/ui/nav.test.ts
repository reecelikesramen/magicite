import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamepadNav } from '../../src/ui/nav';

/** A minimal standard-mapping pad the test can poke. */
function fakePad() {
  return {
    id: 'fake',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
}

describe('GamepadNav', () => {
  let pad: ReturnType<typeof fakePad>;

  beforeEach(() => {
    pad = fakePad();
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a button edge once, on the frame it goes down', () => {
    const nav = new GamepadNav();
    nav.poll(1 / 60);
    pad.buttons[0]!.pressed = true;
    nav.poll(1 / 60);
    expect(nav.pressed('a')).toBe(true);
    expect(nav.buttonPressed('a')).toBe(true);
    expect(nav.anyPressed()).toBe(true);
    nav.poll(1 / 60);
    expect(nav.pressed('a')).toBe(false);
    expect(nav.held('a')).toBe(true);
  });

  it('the left stick emulates d-pad edges for menus but never counts as a d-pad button', () => {
    const nav = new GamepadNav();
    nav.poll(1 / 60);
    pad.axes[0] = 1;
    nav.poll(1 / 60);
    // Menus (inventory cursor) follow the stick...
    expect(nav.pressed('right')).toBe(true);
    expect(nav.anyPressed()).toBe(true);
    // ...but the skill panel must not grab focus while the stick is walking the player.
    expect(nav.buttonPressed('right')).toBe(false);
    pad.axes[0] = 0;
    pad.buttons[15]!.pressed = true;
    nav.poll(1 / 60);
    expect(nav.buttonPressed('right')).toBe(true);
  });

  it('auto-repeats a held stick direction', () => {
    const nav = new GamepadNav();
    nav.poll(1 / 60);
    pad.axes[1] = 1;
    nav.poll(1 / 60);
    expect(nav.pressed('down')).toBe(true);
    nav.poll(0.1);
    expect(nav.pressed('down')).toBe(false);
    nav.poll(0.3);
    expect(nav.pressed('down')).toBe(true);
  });

  it('is inert without a connected pad', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [null] });
    const nav = new GamepadNav();
    nav.poll(1 / 60);
    expect(nav.connected).toBe(false);
    expect(nav.anyPressed()).toBe(false);
  });
});
