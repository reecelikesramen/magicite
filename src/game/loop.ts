import { DT } from '../sim/constants';

/**
 * Fixed-timestep driver: runs `step` at exactly 1/DT Hz regardless of display refresh rate and
 * calls `render(alpha)` once per animation frame with the interpolation factor.
 *
 * Browsers stop requestAnimationFrame in hidden tabs. With `keepAliveWhenHidden` (online sessions:
 * a backgrounded host must keep the world running for everyone) a Web Worker heartbeat drives the
 * steps instead — worker timers are not throttled like page timers — and `render` runs a few times
 * a second so presentation events keep draining. Solo play simply pauses while hidden.
 */
export class FixedLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private heartbeat: { stop(): void } | null = null;
  private beats = 0;
  /** Cap on catch-up steps per frame (avoids the spiral of death after a stall). */
  maxSteps = 5;
  running = false;
  keepAliveWhenHidden = false;

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
      this.advance(now, true);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.heartbeat?.stop();
    this.heartbeat = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private advance(now: number, draw: boolean): void {
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let n = 0;
    const max = draw ? this.maxSteps : 30;
    while (this.acc >= DT && n < max) {
      this.step();
      this.acc -= DT;
      n++;
    }
    if (n === max) this.acc = 0;
    if (draw) this.render(this.acc / DT, dt);
  }

  private onVisibility = (): void => {
    if (document.hidden && this.keepAliveWhenHidden && this.running) {
      this.heartbeat ??= startHeartbeat(() => {
        if (!document.hidden || !this.keepAliveWhenHidden) return;
        // Render ~4x/s so events drain; the frame's dt is just bookkeeping for the HUD.
        this.advance(performance.now(), ++this.beats % 15 === 0);
      });
    } else if (!document.hidden) {
      this.heartbeat?.stop();
      this.heartbeat = null;
      this.last = performance.now();
    }
  };
}

/** ~60 Hz callback from a dedicated worker; falls back to setInterval where workers are blocked. */
function startHeartbeat(cb: () => void): { stop(): void } {
  try {
    const src = 'let t=setInterval(()=>postMessage(0),16);onmessage=()=>{clearInterval(t);close()}';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    let revoked = false;
    w.onmessage = () => {
      if (!revoked) URL.revokeObjectURL(url);
      revoked = true;
      cb();
    };
    return { stop: () => (w.postMessage(0), w.terminate()) };
  } catch {
    const t = setInterval(cb, 16);
    return { stop: () => clearInterval(t) };
  }
}
