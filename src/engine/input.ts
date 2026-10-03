import type { PlayerInput } from '../sim/types';
import { emptyInput } from '../sim/types';

export type Action =
  | 'left' | 'right' | 'up' | 'down' | 'jump' | 'attack' | 'alt' | 'interact'
  | 'inventory' | 'pause' | 'craftMod' | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5'
  | 'skill1' | 'skill2' | 'skill3';

/** Default keyboard bindings (KeyboardEvent.code). Rebindable later via settings. */
export const DEFAULT_KEYS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  attack: ['KeyJ'],
  alt: ['KeyK'],
  interact: ['KeyF'],
  inventory: ['Tab', 'KeyI'],
  pause: ['Escape'],
  craftMod: ['ShiftLeft', 'ShiftRight'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  skill1: ['KeyZ'],
  skill2: ['KeyX'],
  skill3: ['KeyC'],
};

/**
 * Collects raw keyboard / mouse / gamepad state and produces a PlayerInput per tick for the
 * local player(s). Edge-triggered UI actions are exposed through `consumePressed`.
 */
export class InputManager {
  private down = new Set<string>();
  /** Presses since the last rendered frame (UI edge detection; cleared by endFrame). */
  private pressedQ = new Set<string>();
  /**
   * Presses since the last sim tick (cleared by sample). Kept separate from pressedQ because the
   * sim samples at a fixed 60 Hz while frames run at the display rate: on a 120/144 Hz display many
   * frames run no tick, and a press cleared by endFrame() would never reach the sim.
   */
  private tickPressedQ = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseLeft = false;
  mouseRight = false;
  wheel = 0;
  /** Set by the game loop each frame: screen px → world px. */
  screenToWorld: (sx: number, sy: number) => { x: number; y: number } = (x, y) => ({ x, y });
  /** True while the UI wants pointer input (inventory open) so clicks don't attack. */
  pointerCaptured = false;
  /**
   * True while a UI menu has keyboard/gamepad focus (gamepad inventory cursor, skill-path pick,
   * run-over screen): movement/actions are suppressed so menu keys don't also jump or attack.
   * Aim and queued UI commands still flow.
   */
  uiFocus = false;
  private queuedCommands: PlayerInput['commands'] = [];
  private keys = DEFAULT_KEYS;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(e.code)) {
        this.pressedQ.add(e.code);
        this.tickPressedQ.add(e.code);
      }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseLeft = this.mouseRight = false;
    });
    target.addEventListener('pointermove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    target.addEventListener('pointerdown', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (e.button === 0) this.mouseLeft = true;
      if (e.button === 2) this.mouseRight = true;
      this.pressedQ.add(`Mouse${e.button}`);
      this.tickPressedQ.add(`Mouse${e.button}`);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.mouseLeft = false;
      if (e.button === 2) this.mouseRight = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
  }

  held(a: Action): boolean {
    return this.keys[a].some((k) => this.down.has(k));
  }

  /** Edge-triggered: true once per physical press (cleared by `endFrame`). */
  pressed(a: Action): boolean {
    return this.keys[a].some((k) => this.pressedQ.has(k));
  }

  /** Pressed since the last sim tick (survives frames that run no tick). */
  private tickPressed(a: Action): boolean {
    return this.keys[a].some((k) => this.tickPressedQ.has(k));
  }

  mousePressed(button: number): boolean {
    return this.pressedQ.has(`Mouse${button}`);
  }

  /** Accumulated wheel notches since last call (+ = down/next). The game turns it into a slot select. */
  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Queue a deterministic sim command (from UI) for the next tick. */
  command(c: PlayerInput['commands'][number]): void {
    this.queuedCommands.push(c);
  }

  private gamepad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Build the input for the local player for this tick. */
  sample(playerCenter: { x: number; y: number }): PlayerInput {
    const inp = emptyInput();
    inp.moveX = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    inp.moveY = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    // `|| tickPressed`: a tap shorter than one tick still registers for one tick.
    inp.jump = this.held('jump') || this.tickPressed('jump');
    inp.attack = this.held('attack') || this.tickPressed('attack') || ((this.mouseLeft || this.tickPressedQ.has('Mouse0')) && !this.pointerCaptured);
    inp.alt = this.held('alt') || this.tickPressed('alt') || ((this.mouseRight || this.tickPressedQ.has('Mouse2')) && !this.pointerCaptured);
    inp.interact = this.held('interact') || this.tickPressed('interact');
    const w = this.screenToWorld(this.mouseX, this.mouseY);
    inp.aimX = w.x;
    inp.aimY = w.y;
    const pad = this.gamepad();
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.abs(ax) > 0.3) inp.moveX = ax;
      if (Math.abs(ay) > 0.5) inp.moveY = ay;
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      inp.jump ||= b(0);
      inp.attack ||= b(2) || b(7);
      inp.alt ||= b(6);
      inp.interact ||= b(3);
      const rx = pad.axes[2] ?? 0;
      const ry = pad.axes[3] ?? 0;
      if (Math.hypot(rx, ry) > 0.4) {
        inp.aimX = playerCenter.x + rx * 40;
        inp.aimY = playerCenter.y + ry * 40;
      } else if (!this.mouseLeft) {
        inp.aimX = playerCenter.x + (inp.moveX || 1) * 40;
        inp.aimY = playerCenter.y + inp.moveY * 20;
      }
    }
    for (let i = 0; i < 5; i++) if (this.tickPressed(`slot${i + 1}` as Action)) inp.select = i;
    for (let i = 0; i < 3; i++) if (this.tickPressed(`skill${i + 1}` as Action)) inp.skill = i;
    this.tickPressedQ.clear();
    if (this.uiFocus) {
      inp.moveX = inp.moveY = 0;
      inp.jump = inp.attack = inp.alt = inp.interact = false;
      inp.select = inp.skill = -1;
      // Dash (LB/RB, Q/E) lands with the player workstream; LB/RB also page the recipe book.
      if ('dash' in inp) (inp as { dash: number }).dash = 0;
    }
    inp.commands = this.queuedCommands;
    this.queuedCommands = [];
    return inp;
  }

  /** Clear edge-triggered state; call once per rendered frame after UI has read it. */
  endFrame(): void {
    this.pressedQ.clear();
  }
}
