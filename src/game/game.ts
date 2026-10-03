import type { Application } from 'pixi.js';
import { AudioManager } from '../audio/audio';
import type { InputManager } from '../engine/input';
import { HOTBAR_SIZE } from '../sim/constants';
import type { PlayerInput } from '../sim/types';
import { Renderer } from '../render/renderer';
import { Hud } from '../ui/hud';
import { FixedLoop } from './loop';
import { LocalSession, type Session } from './session';

/**
 * Wires session + input + renderer + UI + audio together and runs the fixed-step loop.
 * Presentation modules expose: renderer.draw/handleEvents, ui.layout/update/handleEvents,
 * audio.handleEvents/setListener. Keep this file thin.
 */
/** A full-screen UI layer that, while active, owns input (menus, pause screen). */
export interface GameOverlay {
  active: boolean;
  layout(screenW: number, screenH: number, scale: number): void;
  frame(dt: number): void;
}

export class Game {
  readonly renderer: Renderer;
  ui = new Hud();
  readonly audio = new AudioManager();
  private loop: FixedLoop;
  private localInputs = new Map<number, PlayerInput>();
  private lastW = 0;
  private lastH = 0;
  private lastScale = 0;
  /** Solo pause: the session is not ticked (online sessions can't pause). */
  paused = false;
  overlay: GameOverlay | null = null;

  constructor(
    readonly app: Application,
    readonly input: InputManager,
    public session: Session,
    /** Builds a fresh session for "restart run" (run-over screen). */
    private readonly newSession?: () => Session,
  ) {
    this.renderer = new Renderer(app);
    app.stage.addChild(this.ui.root);
    input.screenToWorld = (x, y) => this.renderer.screenToWorld(x, y);
    this.audio.setLocalPlayer(this.localPlayer);
    this.ui.onRestart = () => this.restart();
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.loop = new FixedLoop(
      () => this.step(),
      (alpha) => this.frame(alpha),
    );
  }

  get localPlayer(): number {
    return this.session.localPlayers[0] ?? 0;
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  /** Replace the session with a fresh run (keeps renderer/UI/audio). */
  restart(): void {
    if (!this.newSession) return;
    this.setSession(this.newSession());
  }

  /** Swap to another session (menu demo → run → menu); disposes the old one and resets the HUD. */
  setSession(next: Session): void {
    if (next !== this.session) this.session.dispose();
    this.session = next;
    this.paused = false;
    // Online worlds must keep ticking when this tab is hidden (others depend on it).
    this.loop.keepAliveWhenHidden = !(next instanceof LocalSession);
    const onRestart = this.ui.onRestart;
    const idx = this.app.stage.getChildIndex(this.ui.root);
    this.ui.root.destroy({ children: true });
    this.ui = new Hud();
    this.ui.onRestart = onRestart;
    this.app.stage.addChildAt(this.ui.root, idx);
    this.lastScale = 0; // force a relayout of the new HUD
    this.audio.setLocalPlayer(this.localPlayer);
  }

  private step(): void {
    if (this.paused) return;
    const world = this.session.world;
    const me = this.localPlayer;
    const e = world.playerEntity(me);
    const center = e ? { x: e.x + e.w / 2, y: e.y + e.h / 2 } : { x: 0, y: 0 };
    const inp = this.input.sample(center);
    const wheel = this.input.consumeWheel();
    const p = world.players[me];
    if (wheel !== 0 && p) inp.select = (((p.selected + Math.sign(wheel)) % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.localInputs.set(me, inp);
    this.session.tick(this.localInputs);
  }

  private lastFrame = performance.now();

  private frame(alpha: number): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const world = this.session.world;
    const me = this.localPlayer;
    const events = this.session.drainEvents();
    const focus = world.playerEntity(me);
    this.renderer.handleEvents(events, world);
    this.renderer.draw(world, alpha, focus);
    const { width, height } = this.app.screen;
    if (width !== this.lastW || height !== this.lastH || this.renderer.scale !== this.lastScale) {
      this.lastW = width;
      this.lastH = height;
      this.lastScale = this.renderer.scale;
      this.ui.layout(width, height, this.renderer.scale);
      this.overlay?.layout(width, height, this.renderer.scale);
    }
    const menu = !!this.overlay?.active;
    this.ui.root.visible = !menu;
    if (!menu) {
      this.ui.handleEvents(events, world, me);
      this.ui.update(world, me, this.input);
    } else this.input.uiFocus = true;
    this.overlay?.frame(dt);
    if (focus) this.audio.setListener(focus.x + focus.w / 2, focus.y + focus.h / 2);
    this.audio.handleEvents(events);
    this.input.endFrame();
  }
}
