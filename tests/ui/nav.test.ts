import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAMEPLAY_PAD_BTNS, GamepadNav, HoldLatch } from '../../src/ui/nav';

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

  it('anyHeld sees the gameplay buttons (A jump, X/RT attack, Y interact, LB/RB dash)', () => {
    const nav = new GamepadNav();
    nav.poll(1 / 60);
    expect(nav.anyHeld(GAMEPLAY_PAD_BTNS)).toBe(false);
    pad.buttons[7]!.pressed = true;
    nav.poll(1 / 60);
    expect(nav.anyHeld(GAMEPLAY_PAD_BTNS)).toBe(true);
    pad.buttons[7]!.pressed = false;
    pad.buttons[1]!.pressed = true; // B is menu-only
    nav.poll(1 / 60);
    expect(nav.anyHeld(GAMEPLAY_PAD_BTNS)).toBe(false);
  });

  it('is inert without a connected pad', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [null] });
    const nav = new GamepadNav();
    nav.poll(1 / 60);
    expect(nav.connected).toBe(false);
    expect(nav.anyPressed()).toBe(false);
  });
});

describe('HoldLatch (UI presses never leak into gameplay)', () => {
  it('a consumed click stays captured until the button is released', () => {
    const l = new HoldLatch();
    // Frame of the click that drops the held item outside the panel: consumed.
    expect(l.update(true, true)).toBe(true);
    // The hand is empty and the cursor is over the world, but the button is still down.
    expect(l.update(false, true)).toBe(true);
    expect(l.update(false, true)).toBe(true);
    // Released: gameplay gets the mouse back.
    expect(l.update(false, false)).toBe(false);
    // A later press in the world is not captured.
    expect(l.update(false, true)).toBe(false);
  });

  it('confirming a menu with A keeps focus until A is released (no jump)', () => {
    const l = new HoldLatch();
    expect(l.update(true, false)).toBe(true); // skill panel focused
    expect(l.update(true, true)).toBe(true); // A goes down: pick sent, focus ends next frame
    expect(l.update(false, true)).toBe(true); // A still held → still suppressed
    expect(l.update(false, false)).toBe(false);
  });

  it('releases at once when nothing is held, and reset() clears it', () => {
    const l = new HoldLatch();
    l.update(true, false);
    expect(l.update(false, false)).toBe(false);
    l.update(true, true);
    l.reset();
    expect(l.update(false, true)).toBe(false);
  });
});
