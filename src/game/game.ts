import type { Application } from 'pixi.js';
import type { InputManager } from '../engine/input';
import { HOTBAR_SIZE } from '../sim/constants';
import type { PlayerInput } from '../sim/types';
import { Renderer } from '../render/renderer';
import { Hud } from '../ui/hud';
import { FixedLoop } from './loop';
import type { Session } from './session';

/** Wires session + input + renderer + UI + audio together and runs the fixed-step loop. */
export class Game {
  readonly renderer: Renderer;
  readonly hud = new Hud();
  private loop: FixedLoop;
  private localInputs = new Map<number, PlayerInput>();

  constructor(
    readonly app: Application,
    readonly input: InputManager,
    public session: Session,
  ) {
    this.renderer = new Renderer(app);
    app.stage.addChild(this.hud.root);
    input.screenToWorld = (x, y) => this.renderer.screenToWorld(x, y);
    this.loop = new FixedLoop(
      () => this.step(),
      (alpha) => this.frame(alpha),
    );
  }

  start(): void {
    this.loop.start();
  }

  private step(): void {
    const world = this.session.world;
    const me = this.session.localPlayers[0] ?? 0;
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
    const me = this.session.localPlayers[0] ?? 0;
    this.session.drainEvents();
    this.renderer.draw(world, alpha, world.playerEntity(me));
    this.hud.update(world, me);
    this.input.endFrame();
  }
}
