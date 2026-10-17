/**
 * Fixed-timestep loop with bounded catch-up and render interpolation.
 * Pure logic (no rAF dependency) so it can be unit-tested with arbitrary frame deltas.
 */
export interface LoopCallbacks {
  /** Advance simulation by exactly `dt` seconds. */
  step(dt: number): void;
  /** Render with interpolation alpha in [0,1) and the real frame delta. */
  render(alpha: number, frameDt: number): void;
}

export class FixedLoop {
  readonly stepDt: number;
  maxSteps: number;
  private acc = 0;
  /** Total simulated seconds. */
  simTime = 0;
  steps = 0;
  /** Steps dropped because catch-up was bounded (reported to dev overlay). */
  droppedTime = 0;
  running = true;
  /** Largest frame delta accepted (s). Larger gaps (tab switches) are clamped. */
  maxFrameDt = 0.25;

  constructor(private cb: LoopCallbacks, hz = 120, maxSteps = 12) {
    this.stepDt = 1 / hz;
    this.maxSteps = maxSteps;
  }

  /** Feed a real frame delta (seconds). Returns number of sim steps taken. */
  advance(frameDt: number): number {
    // Guard against negative / NaN / giant deltas (tab switches, debugger pauses).
    let dt = Number.isFinite(frameDt) && frameDt > 0 ? frameDt : 0;
    if (dt > this.maxFrameDt) dt = this.maxFrameDt;
    let n = 0;
    if (this.running) {
      this.acc += dt;
      while (this.acc >= this.stepDt && n < this.maxSteps) {
        this.cb.step(this.stepDt);
        this.acc -= this.stepDt;
        this.simTime += this.stepDt;
        this.steps++;
        n++;
      }
      if (n >= this.maxSteps && this.acc >= this.stepDt) {
        // Bounded catch-up: drop the remainder rather than spiralling.
        this.droppedTime += this.acc;
        this.acc = 0;
      }
    } else {
      this.acc = 0;
    }
    this.cb.render(this.running ? this.acc / this.stepDt : 0, dt);
    return n;
  }

  resetAccumulator(): void {
    this.acc = 0;
  }
}
