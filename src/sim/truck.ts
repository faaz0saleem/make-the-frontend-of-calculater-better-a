import { TUNING as T } from '../data/tuning';
import type { CargoDef } from '../data/cargo';
import type { EffectiveHandling } from '../data/upgrades';
import { approach, clamp } from '../core/math';
import type { Rng } from '../core/rng';

export interface StackItem {
  uid: number;
  def: CargoDef;
  /** Absolute lateral offset from the bed centre (truck frame, m). */
  X: number;
  /** Lateral velocity relative to the bed (m/s). */
  V: number;
  /** Slide offset relative to the supporting item below (m). */
  o: number;
  /** Relative slide velocity (m/s). */
  u: number;
  /** Bottom height above the bed floor (m), derived each step. */
  z: number;
  cond: number;
  squished: boolean;
  locked: boolean;
  /** 0 → just landed on the stack, 1 → settled (visual drop-in). */
  settle: number;
  /** Visual vertical bounce. */
  bz: number;
  bv: number;
  /** Ratio of current slide to slip limit (0..1+). */
  ratio: number;
  pickedAt: number;
}

export interface StackColumn {
  items: StackItem[];
  /** Longitudinal placement on the bed relative to the bed centre (m). */
  bedZ: number;
}

export type SpillReason = 'slide' | 'overhead' | 'hook' | 'impact' | 'shed' | 'crash' | 'scrape';

export interface DetachedItem {
  item: StackItem;
  column: number;
  /** Height above road of the item's centre when detached. */
  y: number;
  /** Lateral position in track space. */
  x: number;
  vx: number;
  reason: SpillReason;
}

export interface TruckEnv {
  curvature: number;
  vcurv: number;
  /** Ground height under the truck from ramps (m above road). */
  rampH: number;
  /** Ramp slope at the truck position (rise/run), for launch speed. */
  rampSlope: number;
  /** True if the ground under the truck is a gap (no road). */
  overGap: boolean;
  gust: number; // lateral wind acceleration scale at 1 m height (m/s^2)
  puddle: number; // 0..1
}

let uidCounter = 1;

export class TruckSim {
  s = 0;
  x = 0;
  vs: number;
  vx = 0;
  ax = 0;
  targetSpeed: number;
  y = 0;
  vy = 0;
  airborne = false;
  airTime = 0;
  /** Distance travelled while airborne in the current jump. */
  airDist = 0;
  lastLandingJolt = 0;
  groundH = 0;
  private prevRampSlope = 0;
  susp = 0;
  suspV = 0;
  roll = 0;
  rollV = 0;
  /** Signed tip ratio (|tip| >= 1 means wheels off the ground on one side). */
  tip = 0;
  tipTimer = 0;
  steer = 0;
  feltA = 0;
  impactTimer = 0;
  maxRatio = 0;
  stability = 1;
  critical = false;
  spilledSinceCritical = false;
  columns: StackColumn[];
  readonly bedWidth: number;
  /** Events produced during the last step, consumed by RunSession. */
  detached: DetachedItem[] = [];
  landed = false;
  launched = false;
  time = 0;

  constructor(public h: EffectiveHandling, startSpeed: number, private rng: Rng) {
    this.vs = startSpeed;
    this.targetSpeed = startSpeed;
    this.bedWidth = h.bodyHalf * 1.7;
    this.columns = h.columns === 2
      ? [{ items: [], bedZ: -0.95 }, { items: [], bedZ: 0.95 }]
      : [{ items: [], bedZ: 0 }];
  }

  get itemCount(): number {
    let n = 0;
    for (const c of this.columns) n += c.items.length;
    return n;
  }

  get capacityTotal(): number {
    return this.h.capacity * this.columns.length;
  }

  columnTop(ci: number): number {
    let top = 0;
    for (const it of this.columns[ci].items) top += itemHeight(it);
    return top;
  }

  /** Top of the tallest column above the road surface (m). */
  stackTopAboveRoad(): number {
    let best = 0;
    for (let i = 0; i < this.columns.length; i++) best = Math.max(best, this.columnTop(i));
    return this.h.bedHeight + this.y + this.susp * -0.5 + best;
  }

  allItems(): StackItem[] {
    const out: StackItem[] = [];
    for (const c of this.columns) out.push(...c.items);
    return out;
  }

  canAccept(): boolean {
    return this.columns.some((c) => c.items.length < this.h.capacity);
  }

  /** Adds cargo to the lowest column. Returns item, or null if full. Also reports crushed items. */
  addCargo(def: CargoDef, crushed: StackItem[]): StackItem | null {
    let best = -1;
    let bestTop = Infinity;
    for (let i = 0; i < this.columns.length; i++) {
      if (this.columns[i].items.length >= this.h.capacity) continue;
      const top = this.columnTop(i);
      if (top < bestTop - 1e-6) {
        best = i;
        bestTop = top;
      }
    }
    if (best < 0) return null;
    const col = this.columns[best];
    const below = col.items[col.items.length - 1];
    const item: StackItem = {
      uid: uidCounter++, def, X: (below ? below.X : 0), V: below ? below.V : 0, o: (this.rng.next() - 0.5) * 0.02, u: 0,
      z: bestTop, cond: 1, squished: false, locked: false, settle: 0, bz: 0, bv: 0, ratio: 0, pickedAt: this.time,
    };
    col.items.push(item);
    this.refreshColumn(col);
    // Crush check: fragile items below with too much mass on top get squished once.
    let massAbove = 0;
    for (let i = col.items.length - 1; i >= 0; i--) {
      const it = col.items[i];
      if (i < col.items.length - 1 && !it.squished && massAbove > it.def.crushLimit) {
        it.squished = true;
        it.cond = Math.min(it.cond, 0.5);
        crushed.push(it);
        this.refreshColumn(col);
      }
      massAbove += it.def.mass;
    }
    return item;
  }

  private refreshColumn(col: StackColumn): void {
    let z = 0;
    for (const it of col.items) {
      it.z = z;
      it.locked = this.h.bedWall > 0 && z < 0.05 && this.h.bedWall >= it.def.height * 0.45;
      z += itemHeight(it);
    }
  }

  /** Remove the item at index `idx` (and everything above) from column `ci`. */
  detachFrom(ci: number, idx: number, reason: SpillReason, kick = 0): DetachedItem[] {
    const col = this.columns[ci];
    if (idx < 0 || idx >= col.items.length) return [];
    const removed = col.items.splice(idx);
    const out: DetachedItem[] = [];
    for (const it of removed) {
      const y = this.h.bedHeight + this.y + it.z + itemHeight(it) * 0.5;
      const d: DetachedItem = { item: it, column: ci, y, x: this.x + it.X, vx: this.vx + it.V + kick, reason };
      out.push(d);
      this.detached.push(d);
    }
    if (reason !== 'shed') this.spilledSinceCritical = true;
    return out;
  }

  /** Shed the top item of the tallest column. */
  shedTop(): DetachedItem | null {
    let ci = -1;
    let best = -1;
    for (let i = 0; i < this.columns.length; i++) {
      if (this.columns[i].items.length === 0) continue;
      const top = this.columnTop(i);
      if (top > best) {
        best = top;
        ci = i;
      }
    }
    if (ci < 0) return null;
    const col = this.columns[ci];
    const side = col.items[col.items.length - 1].X >= 0 ? 1 : -1;
    const res = this.detachFrom(ci, col.items.length - 1, 'shed', side * 2.2);
    return res[0] ?? null;
  }

  /** Knock off everything whose top is above `clearance` (m above road) within the band [lo, hi]. */
  knockAbove(clearance: number, reason: SpillReason, bandTop = Infinity): DetachedItem[] {
    const out: DetachedItem[] = [];
    const base = this.h.bedHeight + this.y;
    for (let ci = 0; ci < this.columns.length; ci++) {
      const col = this.columns[ci];
      for (let i = 0; i < col.items.length; i++) {
        const it = col.items[i];
        const bottom = base + it.z;
        const top = bottom + itemHeight(it);
        if (top > clearance + 0.02 && bottom < bandTop) {
          out.push(...this.detachFrom(ci, i, reason, -this.vx * 0.2));
          break;
        }
      }
    }
    return out;
  }

  /** Lateral impulse on cargo (truck-frame), e.g. from a collision. side = +1 pushes cargo right. */
  impulse(side: number, mag: number): void {
    for (const col of this.columns) {
      for (const it of col.items) {
        if (it.locked) continue;
        const lever = 1 + T.stackLever * (it.z + itemHeight(it) * 0.5) * 2;
        it.u += side * mag * (0.25 + 0.2 * lever) * (0.85 + this.rng.next() * 0.3);
      }
    }
  }

  /** Vertical jolt (m/s) from landing or bumps: bounces the stack, kicks laterally, damages fragile cargo. */
  jolt(j: number, damaged: StackItem[]): void {
    const absorb = this.h.suspension;
    const eff = j * (1 - absorb * 0.75);
    this.suspV += j * 0.55;
    for (const col of this.columns) {
      for (const it of col.items) {
        const hgt = it.z + itemHeight(it) * 0.5;
        it.bv += eff * 0.35 * (1 + hgt * 0.25);
        if (!it.locked) it.u += (this.rng.next() - 0.5) * eff * 0.1 * (1 + hgt * 0.3);
        const over = eff - 1.6;
        if (over > 0 && it.def.fragility > 0) {
          const dmg = it.def.fragility * over * 0.11 * (1 + hgt * 0.08);
          if (dmg > 0.01) {
            it.cond = Math.max(0, it.cond - dmg);
            damaged.push(it);
          }
        }
      }
    }
  }

  step(dt: number, steerInput: number, env: TruckEnv): void {
    const h = this.h;
    this.time += dt;
    this.detached.length = 0;
    this.landed = false;
    this.launched = false;
    this.steer = clamp(steerInput, -1, 1);

    // --- Forward speed ---
    if (this.impactTimer > 0) this.impactTimer -= dt;
    else this.vs = approach(this.vs, this.targetSpeed, T.forwardAccel * dt);
    this.s += this.vs * dt;

    // --- Lateral ---
    const puddleLoss = env.puddle * (1 - h.puddleResist) * 0.7;
    const grip = h.grip * (1 - puddleLoss);
    let latAccel = h.latAccel * grip;
    let vxT = this.steer * h.maxLatSpeed - T.cornerDrift * this.vs * this.vs * env.curvature;
    if (env.puddle > 0) vxT += Math.sin(this.time * 7.3) * puddleLoss * 1.6;
    if (this.airborne) {
      vxT = this.vx;
      latAccel = 0;
    }
    const dv = clamp(vxT - this.vx, -latAccel * dt, latAccel * dt);
    this.vx += dv;
    this.ax = dv / dt;
    this.x += this.vx * dt;

    // --- Vertical: ramps, jumps, crests ---
    if (!this.airborne) {
      const leavingRamp = env.rampH < this.groundH - 0.05;
      if (leavingRamp) {
        this.airborne = true;
        this.launched = true;
        this.airTime = 0;
        this.airDist = 0;
        this.vy = this.vs * this.prevRampSlope * T.rampLaunchFactor;
        this.y = this.groundH;
      } else {
        this.y = env.rampH;
        this.vy = env.rampSlope * this.vs;
      }
      this.groundH = env.rampH;
      this.prevRampSlope = env.rampSlope;
    }
    if (this.airborne) {
      this.airTime += dt;
      this.airDist += this.vs * dt;
      this.vy -= T.gravity * dt;
      this.y += this.vy * dt;
      const ground = env.overGap ? -Infinity : env.rampH;
      if (this.y <= ground) {
        this.y = ground;
        this.airborne = false;
        this.landed = true;
        this.lastLandingJolt = Math.max(0, -this.vy);
        this.vy = 0;
        this.groundH = ground;
        this.prevRampSlope = 0;
      }
    }

    // Normal-load factor: crests make cargo light, dips press it down.
    let nf = this.airborne ? T.airborneGrip : clamp(1 + (this.vs * this.vs * env.vcurv) / T.gravity - this.suspV * 0.04, 0.15, 2.4);
    if (!Number.isFinite(nf)) nf = 1;

    // --- Suspension (visual compression + bounce) ---
    const suspK = T.suspensionSpring * (1 + h.suspension * 0.4);
    const suspAcc = -suspK * this.susp - T.suspensionDamp * this.suspV;
    this.suspV += suspAcc * dt;
    this.susp += this.suspV * dt;
    this.susp = clamp(this.susp, -0.25, 0.25);

    // --- Felt lateral acceleration ---
    const rawA = this.airborne ? 0 : T.feelSteer * this.ax + T.feelCorner * this.vs * this.vs * env.curvature;
    this.feltA += (rawA - this.feltA) * (1 - Math.exp(-dt / T.feelLag));

    // --- Tip / rollover ---
    const ballast = h.mass * 0.1;
    let mC = 0, mz = 0, mX = 0, gustTorque = 0;
    for (const col of this.columns) {
      for (const it of col.items) {
        const hc = h.bedHeight + it.z + itemHeight(it) * 0.5;
        mC += it.def.mass;
        mz += it.def.mass * hc;
        mX += it.def.mass * it.X;
        gustTorque += env.gust * (0.4 + hc * 0.35) * it.def.height * it.def.width * 6 * hc;
      }
    }
    const denom = ballast * T.gravity * h.trackHalf * h.rollStiffness;
    // Combined centre-of-mass height of truck ballast + cargo drives load transfer.
    const com = (ballast * 0.5 + mz) / (ballast + mC);
    const tipA = (-this.feltA * com * T.tipGain) / (T.gravity * h.trackHalf * h.rollStiffness);
    const tipM = (mX / ((ballast + mC) * h.trackHalf)) * 0.9;
    const tipG = (gustTorque / denom) * 0.8;
    this.tip = this.airborne ? this.tip * 0.98 : tipA + tipM + tipG;
    if (Math.abs(this.tip) > T.rolloverLtr) this.tipTimer += dt;
    else this.tipTimer = Math.max(0, this.tipTimer - dt * 2);

    const lift = Math.max(0, Math.abs(this.tip) - T.wheelLiftLtr) * Math.sign(this.tip);
    const rollT = T.rollGain * this.tip + lift * 0.35;
    const rAcc = T.rollSpring * (rollT - this.roll) - T.rollDamp * this.rollV;
    this.rollV += rAcc * dt;
    this.roll += this.rollV * dt;

    // --- Cargo stack: chain of spring-damper interfaces per column ---
    const a0 = -this.feltA + T.feelRoll * T.gravity * Math.sin(this.roll);
    let maxRatio = 0;
    for (let ci = 0; ci < this.columns.length; ci++) {
      const col = this.columns[ci];
      const items = col.items;
      const n = items.length;
      if (n === 0) continue;
      // mass at-and-above each index
      let M = 0;
      const massAbove = scratchMass(n);
      for (let i = n - 1; i >= 0; i--) {
        M += items[i].def.mass;
        massAbove[i] = M;
      }
      // Each interface is a damped oscillator driven by the inertial acceleration at its height.
      // Load pressing down stiffens lower interfaces, so the top item is always the most exposed.
      let Xacc = 0, Vacc = 0;
      for (let i = 0; i < n; i++) {
        const it = items[i];
        const m = it.def.mass;
        if (it.locked) {
          it.o = 0;
          it.u = 0;
          it.X = Xacc;
          it.V = Vacc;
          continue;
        }
        const ratio = Math.min(T.stackMaxStiffRatio, 1 + (T.stackLoadStiffen * (massAbove[i] - m)) / m);
        const w2 = T.stackK * (0.45 + 0.55 * it.def.grip) * h.support * nf * ratio;
        const cdamp = 2 * T.stackDampRatio * Math.sqrt(w2);
        const hc = it.z + itemHeight(it) * 0.5;
        const lever = 1 + T.stackLever * hc;
        const gustA = (env.gust * (0.4 + (h.bedHeight + hc) * 0.35) * it.def.height * it.def.width * 6) / m;
        const acc = a0 * lever + gustA - w2 * it.o - cdamp * it.u;
        it.u += acc * dt;
        it.o += it.u * dt;
        Xacc += it.o;
        Vacc += it.u;
        it.X = Xacc;
        it.V = Vacc;
      }
      // Slip check bottom→top; first failure takes everything above with it.
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const below = i > 0 ? items[i - 1] : null;
        const supportW = below ? below.def.width : this.bedWidth;
        const limit = T.slipFraction * h.slipBonus * 0.5 * Math.min(it.def.width, supportW) * (below ? 1 : 1.6);
        const off = it.o;
        it.ratio = it.locked ? 0 : Math.abs(off) / limit;
        if (it.ratio > 1) {
          this.detachFrom(ci, i, 'slide', Math.sign(off) * 1.2);
          break;
        }
        if (it.ratio > maxRatio) maxRatio = it.ratio;
      }
      // Visual settle / bounce
      for (const it of items) {
        if (it.settle < 1) it.settle = Math.min(1, it.settle + dt * 4);
        it.bv += (-90 * it.bz - 9 * it.bv) * dt;
        it.bz += it.bv * dt;
      }
    }
    this.maxRatio = maxRatio;
    const tipDanger = Math.abs(this.tip) / T.rolloverLtr;
    this.stability = clamp(1 - Math.max(maxRatio, tipDanger * 0.95), 0, 1);
  }

  resetGround(): void {
    this.groundH = 0;
    this.prevRampSlope = 0;
  }

  /** True when the truck has been past rollover threshold long enough. */
  get rolledOver(): boolean {
    return this.tipTimer > T.rolloverTime;
  }
}

export const itemHeight = (it: StackItem): number => it.def.height * (it.squished ? 0.72 : 1);

// Scratch arrays to avoid per-step allocation.
type F64 = Float64Array<ArrayBuffer>;
let _m: F64 = new Float64Array(16);
const grow = (a: F64, n: number): F64 => (a.length >= n ? a : new Float64Array(Math.max(n, a.length * 2)));
function scratchMass(n: number): F64 { return (_m = grow(_m, n)); }
