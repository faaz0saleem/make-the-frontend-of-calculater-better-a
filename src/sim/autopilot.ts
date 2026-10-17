import { TUNING as T } from '../data/tuning';
import { DX, NCOL, XMAX, isBlocking, type ReachVehicle } from '../modes/reach';
import type { RunSession } from './run';

/**
 * Scripted driver used by automated tests (level completion over all 30 levels) and by
 * capture mode for media. It plans with a backward safety pass over a short lookahead grid
 * and steers toward reachable pickups/coins, shedding when a low beam would hit the stack.
 */
export interface AutopilotOptions {
  /** 0 = careful, 1 = greedy for cargo. */
  greed?: number;
  lookahead?: number;
  shedForBeams?: boolean;
  /** Lateral smoothing (steering gain). */
  gain?: number;
  /** Deliberately ignore pickups (e.g. for crash tests). */
  ignoreCargo?: boolean;
}

export class Autopilot {
  private rows: number;
  private blocked: Uint8Array[];
  private safe: Uint8Array[];
  private target = 0;
  private timer = 0;
  private shedCooldown = 0;
  private steer = 0;
  private tipTime = 0;

  constructor(private opt: AutopilotOptions = {}) {
    this.rows = opt.lookahead ?? 80;
    this.blocked = Array.from({ length: this.rows }, () => new Uint8Array(NCOL));
    this.safe = Array.from({ length: this.rows }, () => new Uint8Array(NCOL));
  }

  input(run: RunSession, dt: number): { steer: number; shed: boolean } {
    const tr = run.truck;
    this.timer -= dt;
    this.shedCooldown -= dt;
    if (this.timer <= 0) {
      this.timer = 0.08;
      this.plan(run);
    }
    let shed = false;
    if ((this.opt.shedForBeams ?? true) && this.shedCooldown <= 0 && tr.itemCount > 0) {
      const top = tr.stackTopAboveRoad();
      for (const f of run.track.features) {
        if (f.s < tr.s) continue;
        if (f.s > tr.s + 22) break;
        if (f.kind === 'overhead' && !f.passed && f.h > tr.h.cabHeight && f.h < top && Math.abs(f.x - this.target) < f.hw + 0.5) {
          shed = true;
          this.shedCooldown = 0.35;
          break;
        }
      }
      if (Math.abs(tr.tip) > 0.85) this.tipTime += dt;
      else this.tipTime = 0;
      if (!shed && this.tipTime > 0.12) {
        shed = true;
        this.shedCooldown = 0.5;
      }
      if (!shed && tr.stability < 0.12 && tr.maxRatio > 0.85) {
        shed = true;
        this.shedCooldown = 0.6;
      }
    }
    const err = this.target - tr.x;
    // Feed-forward against corner drift so the truck holds its line in curves.
    const pose = run.track.poseAt(tr.s);
    const ff = (T.cornerDrift * tr.vs * tr.vs * pose.curvature) / tr.h.maxLatSpeed;
    const want = Math.max(-1, Math.min(1, err * (this.opt.gain ?? 0.7) - tr.vx * 0.12 + ff));
    // Rate-limit like a keyboard ramp so the bot steers smoothly.
    const rate = 5 * dt;
    this.steer += Math.max(-rate, Math.min(rate, want - this.steer));
    return { steer: this.steer, shed };
  }

  private plan(run: RunSession): void {
    const tr = run.truck;
    const veh: ReachVehicle = { bodyHalf: tr.h.bodyHalf, length: tr.h.length, maxLatSpeed: tr.h.maxLatSpeed, cabHeight: tr.h.cabHeight };
    const s0 = Math.floor(tr.s);
    const v = Math.max(8, tr.vs);
    const spread = Math.max(1, Math.floor((tr.h.maxLatSpeed * 0.6) / v / DX));
    const feats = run.track.features.filter((f) => f.s + f.len >= s0 - 8 && f.s <= s0 + this.rows + 8);
    const halfL = veh.length * 0.5;
    for (let r = 0; r < this.rows; r++) {
      const b = this.blocked[r];
      b.fill(0);
      const s = s0 + r;
      if (s > run.track.endS - 1) { b.fill(0); continue; }
      const W = run.track.halfWidthAt(s);
      for (let c = 0; c < NCOL; c++) if (Math.abs(-XMAX + c * DX) > W - veh.bodyHalf - 0.1) b[c] = 1;
      for (const f of feats) {
        if (s < f.s - halfL - 1 || s > f.s + f.len + halfL) continue;
        let reach = 0;
        let fx = f.x;
        if (isBlocking(f, veh, {} as never) || f.kind === 'crate' || f.kind === 'cone') {
          reach = veh.bodyHalf + f.hw + 0.35;
          if (f.kind === 'movingBarrier') {
            const tArrive = run.t + (f.s - tr.s) / v;
            fx = f.x + (f.amp ?? 0) * Math.sin((f.freq ?? 1) * tArrive + (f.phase ?? 0));
            reach += 0.6;
          }
        } else if (f.kind === 'gap') {
          // Gaps are fine if a ramp at the same x launches us over them.
          const fed = feats.some((q) => q.kind === 'ramp' && q.s < f.s && q.s > f.s - 25 && Math.abs(q.x - f.x) < 0.5);
          if (fed && (tr.airborne || this.onLaunchLine(tr.x, feats, f))) continue;
          reach = f.hw + 0.3;
        } else if (f.kind === 'ramp' || f.kind === 'platform') {
          // Avoid clipping the ramp sides: block the side band unless we are lined up.
          if (s > f.s + 1 && !(Math.abs(tr.x - f.x) < f.hw)) reach = f.hw + veh.bodyHalf;
          else continue;
        } else if (f.kind === 'hook' && tr.stackTopAboveRoad() > f.h) {
          const tArrive = run.t + (f.s - tr.s) / v;
          fx = f.x + (f.amp ?? 0) * Math.sin((f.freq ?? 1) * tArrive + (f.phase ?? 0));
          reach = veh.bodyHalf * 0.7 + f.hw + 0.5;
        } else continue;
        const c0 = Math.max(0, Math.floor((fx - reach + XMAX) / DX));
        const c1 = Math.min(NCOL - 1, Math.ceil((fx + reach + XMAX) / DX));
        for (let c = c0; c <= c1; c++) b[c] = 1;
      }
      // Drop edges: stay well inside
      const pose = run.track.poseAt(s);
      if (pose.left === 'drop' || pose.right === 'drop') {
        for (let c = 0; c < NCOL; c++) {
          const x = -XMAX + c * DX;
          if ((pose.left === 'drop' && x < -(W - veh.bodyHalf - 0.6)) || (pose.right === 'drop' && x > W - veh.bodyHalf - 0.6)) b[c] = 1;
        }
      }
    }
    // Backward safety
    const R = this.rows;
    this.safe[R - 1].set(this.blocked[R - 1].map((x) => (x ? 0 : 1)));
    for (let r = R - 2; r >= 0; r--) {
      const nx = this.safe[r + 1], b = this.blocked[r], sf = this.safe[r];
      for (let c = 0; c < NCOL; c++) {
        if (b[c]) { sf[c] = 0; continue; }
        let ok = 0;
        for (let d = Math.max(0, c - spread); d <= Math.min(NCOL - 1, c + spread); d++) if (nx[d]) { ok = 1; break; }
        sf[c] = ok;
      }
    }
    // Choose a target at ~0.7 s ahead that is safe & reachable; prefer pickups/coins.
    const ahead = Math.min(R - 1, Math.max(6, Math.round(v * 0.7)));
    const c0 = Math.round((tr.x + XMAX) / DX);
    const maxShift = ahead * spread;
    let want = tr.x;
    const greed = this.opt.greed ?? 0.7;
    let bestScore = -Infinity;
    if (!this.opt.ignoreCargo) {
      for (const f of feats) {
        if (f.collected || f.s < tr.s + 3 || f.s > tr.s + 45) continue;
        let w = 0;
        if (f.kind === 'pickup' && tr.canAccept()) w = 3 * greed;
        else if (f.kind === 'coin') w = 0.6;
        else if (f.kind === 'gate' && (f.tag === 'left' || f.tag === 'shortcut' || f.tag === 'rooftop')) w = 2 * greed;
        else if (f.kind === 'depot' && tr.itemCount >= 3) w = 4;
        if (w <= 0) continue;
        const score = w - Math.abs(f.x - tr.x) * 0.15 - (f.s - tr.s) * 0.03;
        if (score > bestScore) {
          bestScore = score;
          want = f.x;
        }
      }
    }
    let best = c0, bestD = Infinity;
    for (let c = Math.max(0, c0 - maxShift); c <= Math.min(NCOL - 1, c0 + maxShift); c++) {
      if (!this.safe[ahead][c] || !this.safe[0][c] && Math.abs(c - c0) < 2) continue;
      // The path from c0 to c must be safe on intermediate rows (approximate with straight line)
      let ok = true;
      for (let r = 1; r < ahead; r += 2) {
        const cc = Math.round(c0 + ((c - c0) * r) / ahead);
        if (!this.safe[r][cc]) { ok = false; break; }
      }
      if (!ok) continue;
      const d = Math.abs(-XMAX + c * DX - want);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (bestD === Infinity) {
      // No straight-line plan: pick any safe cell at the nearest row.
      for (let r = 2; r < R; r++) {
        let found = -1, fd = Infinity;
        for (let c = 0; c < NCOL; c++) if (this.safe[r][c] && Math.abs(c - c0) < fd) { fd = Math.abs(c - c0); found = c; }
        if (found >= 0) { best = found; break; }
      }
    }
    this.target = -XMAX + best * DX;
  }

  private onLaunchLine(x: number, feats: { kind: string; s: number; x: number; hw: number }[], gap: { s: number; x: number }): boolean {
    return feats.some((q) => q.kind === 'ramp' && q.s < gap.s && Math.abs(x - q.x) < q.hw);
  }
}
