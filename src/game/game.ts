import type { Application } from 'pixi.js';
import { AudioManager } from '../audio/audio';
import type { InputManager } from '../engine/input';
import { HOTBAR_SIZE } from '../sim/constants';
import type { PlayerInput } from '../sim/types';
import { Renderer } from '../render/renderer';
import { Hud } from '../ui/hud';
import { FixedLoop } from './loop';
import type { Session } from './session';

/**
 * Wires session + input + renderer + UI + audio together and runs the fixed-step loop.
 * Presentation modules expose: renderer.draw/handleEvents, ui.layout/update/handleEvents,
 * audio.handleEvents/setListener. Keep this file thin.
 */
export class Game {
  readonly renderer: Renderer;
  readonly ui = new Hud();
  readonly audio = new AudioManager();
  private loop: FixedLoop;
  private localInputs = new Map<number, PlayerInput>();
  private lastW = 0;
  private lastH = 0;
  private lastScale = 0;

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
    this.session.dispose();
    this.session = this.newSession();
    this.audio.setLocalPlayer(this.localPlayer);
  }

  private step(): void {
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

  private frame(alpha: number): void {
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
    }
    this.ui.handleEvents(events, world, me);
    this.ui.update(world, me, this.input);
    if (focus) this.audio.setListener(focus.x + focus.w / 2, focus.y + focus.h / 2);
    this.audio.handleEvents(events);
    this.input.endFrame();
  }
}
