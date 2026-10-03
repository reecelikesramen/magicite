/**
 * UI-only input helpers: raw key edges the InputManager has no Action for (Enter, arrows, R) and
 * gamepad button edges for menu navigation. Presentation-side only; never feeds the sim directly.
 */

export class UiKeys {
  private q = new Set<string>();
  /** Shift was held when a pointer button went down this frame (robust to Shift released before the frame runs). */
  private shiftClick = false;
  private readonly onKey = (e: KeyboardEvent) => {
    if (!e.repeat) this.q.add(e.code);
  };
  private readonly onPointer = (e: PointerEvent) => {
    if (e.shiftKey) this.shiftClick = true;
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKey);
      window.addEventListener('pointerdown', this.onPointer);
    }
  }

  /** True if a click this frame was made with Shift held (craft pick). */
  get clickShift(): boolean {
    return this.shiftClick;
  }

  pressed(...codes: string[]): boolean {
    for (const c of codes) if (this.q.has(c)) return true;
    return false;
  }

  /** Synthetic press (tests / scripted UI). */
  press(code: string): void {
    this.q.add(code);
  }

  endFrame(): void {
    this.q.clear();
    this.shiftClick = false;
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKey);
      window.removeEventListener('pointerdown', this.onPointer);
    }
  }
}

export type PadBtn = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt' | 'back' | 'start' | 'up' | 'down' | 'left' | 'right';

/** Standard-mapping button indices. */
const PAD_INDEX: Record<PadBtn, number> = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };

/** Pad buttons InputManager.sample() turns into gameplay (jump, attack, interact, alt, dash). */
export const GAMEPLAY_PAD_BTNS: readonly PadBtn[] = ['a', 'x', 'y', 'lb', 'rb', 'lt', 'rt'];

/**
 * "Stay on until released": once `update(true, …)` is seen, keeps returning true while `held`
 * stays true after the trigger ends. The Hud uses it so a press the UI consumed never leaks
 * into gameplay — a click that dropped an item outside the panel (or picked a skill, hiding the
 * panel) keeps the pointer captured until the mouse button is released, and confirming a menu
 * with pad A keeps `uiFocus` until A is released (otherwise the still-held A reads as a jump).
 */
export class HoldLatch {
  private latched = false;

  update(trigger: boolean, held: boolean): boolean {
    if (trigger) this.latched = true;
    else if (!held) this.latched = false;
    return this.latched;
  }

  reset(): void {
    this.latched = false;
  }
}
const N = 17;

export class GamepadNav {
  private prev: boolean[] = new Array(N).fill(false);
  private now: boolean[] = new Array(N).fill(false);
  /** Left-stick → d-pad emulation with auto-repeat. */
  private stickDir = '';
  private stickT = 0;
  private stickEdge = '';
  connected = false;

  /** Call once per frame before querying. */
  poll(dt: number): void {
    const tmp = this.prev;
    this.prev = this.now;
    this.now = tmp;
    this.now.fill(false);
    this.stickEdge = '';
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) {
      pad = p;
      break;
    }
    this.connected = !!pad;
    if (!pad) return;
    for (let i = 0; i < N; i++) this.now[i] = !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const dir = Math.abs(ax) > 0.6 && Math.abs(ax) >= Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : Math.abs(ay) > 0.6 ? (ay > 0 ? 'down' : 'up') : '';
    if (dir !== this.stickDir) {
      this.stickDir = dir;
      this.stickT = 0.35;
      this.stickEdge = dir;
    } else if (dir) {
      this.stickT -= dt;
      if (this.stickT <= 0) {
        this.stickT = 0.12;
        this.stickEdge = dir;
      }
    }
  }

  /** Edge of button `b`; directions also fire from the left stick (menu navigation). */
  pressed(b: PadBtn): boolean {
    return this.buttonPressed(b) || ((b === 'up' || b === 'down' || b === 'left' || b === 'right') && this.stickEdge === b);
  }

  /** Edge of the physical button only (the stick never counts): use where the stick also moves the player. */
  buttonPressed(b: PadBtn): boolean {
    const i = PAD_INDEX[b];
    return this.now[i]! && !this.prev[i];
  }

  held(b: PadBtn): boolean {
    return this.now[PAD_INDEX[b]]!;
  }

  anyHeld(btns: readonly PadBtn[]): boolean {
    for (const b of btns) if (this.now[PAD_INDEX[b]]) return true;
    return false;
  }

  /** Any face/d-pad press this frame (switches the UI into gamepad mode). */
  anyPressed(): boolean {
    for (let i = 0; i < N; i++) if (this.now[i] && !this.prev[i]) return true;
    return this.stickEdge !== '';
  }
}
