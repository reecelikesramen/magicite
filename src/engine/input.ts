import type { PlayerInput } from '../sim/types';
import { emptyInput } from '../sim/types';

export type Action =
  | 'left' | 'right' | 'up' | 'down' | 'jump' | 'dashLeft' | 'dashRight' | 'attack' | 'alt' | 'interact'
  | 'inventory' | 'pause' | 'craftMod' | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5'
  | 'skill1' | 'skill2' | 'skill3';

/** Default keyboard bindings (KeyboardEvent.code). Rebindable later via settings. */
export const DEFAULT_KEYS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  dashLeft: ['KeyQ'],
  dashRight: ['KeyE'],
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

/** Keyboard/facing aim distance (px). */
const AIM_DIST = 48;

function dashDir(left: boolean, right: boolean): -1 | 0 | 1 {
  return left === right ? 0 : left ? -1 : 1;
}

/**
 * Collects raw keyboard / mouse / gamepad state and produces a PlayerInput per tick for the
 * local player(s). Edge-triggered UI actions are exposed through `consumePressed`.
 */
export class InputManager {
  private down = new Set<string>();
  private pressedQ = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseLeft = false;
  mouseRight = false;
  wheel = 0;
  /**
   * Set by the HUD while a menu has focus (gamepad inventory cursor, keyboard skill pick, run-over
   * screen): sample() then zeroes movement/actions so menu keys don't also move or attack. Aim and
   * queued UI commands still go through.
   */
  uiFocus = false;
  /** Set by the game loop each frame: screen px → world px. */
  screenToWorld: (sx: number, sy: number) => { x: number; y: number } = (x, y) => ({ x, y });
  /** True while the UI wants pointer input (inventory open) so clicks don't attack. */
  pointerCaptured = false;
  /**
   * Aim with the mouse pointer instead of the facing direction. Off by default: there is no cursor
   * in play (like the original) — attacks, shots, digging and placing go where the hero faces,
   * tilted with W/S (straight up/down when only W/S is held). The gamepad right stick still aims.
   */
  mouseAim = false;
  /** Last horizontal direction pressed (keyboard aim). */
  private facing: -1 | 1 = 1;
  private queuedCommands: PlayerInput['commands'] = [];
  private keys = DEFAULT_KEYS;
  /**
   * Key presses since the last `sample()` (movement edges). Unlike `pressedQ` (cleared per rendered
   * frame) this survives frames in which no tick runs (high refresh rates), so short taps still land.
   */
  private tapQ = new Set<string>();
  /** Last sampled jump/dash and a press deferred by one tick (see `sample`). */
  private lastJump = false;
  private jumpPending = false;
  private lastDash: -1 | 0 | 1 = 0;
  private dashPending: -1 | 0 | 1 = 0;
  /** Both dash buttons went down together (LB+RB hotbar chord): no dash until both are up again. */
  private dashChord = false;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(e.code)) {
        this.pressedQ.add(e.code);
        this.tapQ.add(e.code);
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
      this.tapQ.add(`Mouse${e.button}`);
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

  /** Pressed since the last `sample()` (movement edges). */
  private tapped(a: Action): boolean {
    return this.keys[a].some((k) => this.tapQ.has(k));
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
    // `|| tapped` catches taps shorter than a tick (keydown + keyup between two samples).
    const jumpTap = this.tapped('jump');
    const tapL = this.tapped('dashLeft');
    const tapR = this.tapped('dashRight');
    // Hotbar/skill/attack/interact taps also come from tapQ (per-tick), not the per-frame queue:
    // frames that run no tick (displays above 60 Hz) would otherwise drop them.
    const attackTap = this.tapped('attack') || this.tapQ.has('Mouse0');
    const altTap = this.tapped('alt') || this.tapQ.has('Mouse2');
    const interactTap = this.tapped('interact');
    let select = -1;
    let skill = -1;
    for (let i = 0; i < 5; i++) if (this.tapped(`slot${i + 1}` as Action)) select = i;
    for (let i = 0; i < 3; i++) if (this.tapped(`skill${i + 1}` as Action)) skill = i;
    this.tapQ.clear();
    inp.jump = this.held('jump') || jumpTap;
    let dashL = this.held('dashLeft') || tapL;
    let dashR = this.held('dashRight') || tapR;
    inp.attack = this.held('attack') || ((this.mouseLeft || attackTap) && !this.pointerCaptured);
    inp.alt = this.held('alt') || ((this.mouseRight || altTap) && !this.pointerCaptured);
    inp.interact = this.held('interact') || interactTap;
    if (inp.moveX !== 0) this.facing = inp.moveX > 0 ? 1 : -1;
    if (this.mouseAim) {
      const w = this.screenToWorld(this.mouseX, this.mouseY);
      inp.aimX = w.x;
      inp.aimY = w.y;
    } else this.keyboardAim(inp, playerCenter);
    const pad = this.gamepad();
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.abs(ax) > 0.3) inp.moveX = ax;
      if (Math.abs(ay) > 0.5) inp.moveY = ay;
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      inp.jump ||= b(0);
      dashL ||= b(4); // LB
      dashR ||= b(5); // RB
      inp.attack ||= b(2) || b(7);
      inp.alt ||= b(6);
      inp.interact ||= b(3);
      const rx = pad.axes[2] ?? 0;
      const ry = pad.axes[3] ?? 0;
      if (Math.hypot(rx, ry) > 0.4) {
        inp.aimX = playerCenter.x + rx * 40;
        inp.aimY = playerCenter.y + ry * 40;
      } else if (Math.abs(ax) > 0.3) {
        this.facing = ax > 0 ? 1 : -1;
        this.keyboardAim(inp, playerCenter);
      }
    }
    // Both dash buttons = no dash (LB+RB is the hotbar-cycle chord). Stay latched until both are
    // released, or letting go of one would read as a fresh press of the other and dash.
    if (dashL && dashR) this.dashChord = true;
    else if (!dashL && !dashR) this.dashChord = false;
    inp.dash = this.dashChord ? 0 : dashDir(dashL, dashR);
    this.keepEdges(inp, jumpTap, this.dashChord ? 0 : dashDir(tapL, tapR));
    inp.select = select;
    inp.skill = skill;
    if (this.uiFocus) {
      inp.moveX = inp.moveY = 0;
      inp.jump = inp.attack = inp.alt = inp.interact = false;
      inp.select = inp.skill = -1;
      inp.dash = 0;
    }
    inp.commands = this.queuedCommands;
    this.queuedCommands = [];
    return inp;
  }

  /** Aim point from facing + vertical tilt (48 px out: far enough for shots, mining rays clamp to reach). */
  private keyboardAim(inp: PlayerInput, c: { x: number; y: number }): void {
    const vertical = inp.moveY !== 0 && inp.moveX === 0;
    inp.aimX = c.x + (vertical ? 0 : this.facing * AIM_DIST);
    inp.aimY = c.y + inp.moveY * (vertical ? AIM_DIST : AIM_DIST * 0.6);
  }

  /**
   * The sim derives jump/dash presses from consecutive ticks, so a release + re-press between two
   * samples (fast double-jump taps at low frame rates) would read as one long hold and be lost.
   * Insert one released tick and deliver the press on the next sample instead (+1 tick latency,
   * only in that case; the jump buffer absorbs it).
   */
  private keepEdges(inp: PlayerInput, jumpTap: boolean, dashTap: -1 | 0 | 1): void {
    if (this.jumpPending) {
      inp.jump = true;
      this.jumpPending = false;
    } else if (jumpTap && this.lastJump) {
      inp.jump = false;
      this.jumpPending = true;
    }
    this.lastJump = inp.jump;
    if (this.dashPending !== 0) {
      inp.dash = this.dashPending;
      this.dashPending = 0;
    } else if (dashTap !== 0 && dashTap === this.lastDash) {
      inp.dash = 0;
      this.dashPending = dashTap;
    }
    this.lastDash = inp.dash;
  }

  /** Clear edge-triggered state; call once per rendered frame after UI has read it. */
  endFrame(): void {
    this.pressedQ.clear();
  }
}
