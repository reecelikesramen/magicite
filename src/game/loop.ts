import { DT } from '../sim/constants';

/**
 * Fixed-timestep driver: runs `step` at exactly 1/DT Hz regardless of display refresh rate and
 * calls `render(alpha)` once per animation frame with the interpolation factor.
 */
export class FixedLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  /** Cap on catch-up steps per frame (avoids the spiral of death after a stall). */
  maxSteps = 5;
  running = false;

  constructor(
    private readonly step: () => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.25, (now - this.last) / 1000);
      this.last = now;
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < this.maxSteps) {
        this.step();
        this.acc -= DT;
        n++;
      }
      if (n === this.maxSteps) this.acc = 0;
      this.render(this.acc / DT, dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
