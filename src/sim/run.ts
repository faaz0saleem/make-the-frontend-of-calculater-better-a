import { Emitter } from '../core/events';
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { CARGO, type CargoShape, isFragile } from '../data/cargo';
import { ECONOMY } from '../data/economy';
import { TUNING as T } from '../data/tuning';
import type { EffectiveHandling } from '../data/upgrades';
import type { Track } from './track';
import { type DetachedItem, type SpillReason, type StackItem, TruckSim, type TruckEnv, itemHeight } from './truck';
import { type Feature, HARD_KINDS, type Pose } from './types';

export type RunMode = 'tutorial' | 'campaign' | 'endless' | 'daily';
export type CrashReason = 'barrier' | 'rollover' | 'fell' | 'lowbridge';
export type RunState = 'running' | 'crashed' | 'finished';

export interface RunInput {
  steer: number;
  shed: boolean;
}

export interface DeliveredItem {
  cargo: CargoShape;
  base: number;
  cond: number;
  value: number;
  squished: boolean;
}

export interface RunStats {
  coins: number;
  nearMisses: number;
  recoveries: number;
  cleanLandings: number;
  jumps: number;
  heroSheds: number;
  sheds: number;
  spilled: number;
  spilledValue: number;
  collected: number;
  collectedValue: number;
  closeShaves: number;
  landings: number;
  maxItems: number;
  scrapes: number;
  maxItemsColumn: number;
  maxStackHeight: number;
  gates: Record<string, number>;
  delivered: DeliveredItem[];
  banked: number;
  bankCount: number;
  bestMultiplier: number;
  fragileIntact: number;
  cakesIntact: number;
  discovered: CargoShape[];
  timeDriven: number;
}

export type RunEvents = {
  coin: { feature: Feature };
  pickup: { item: StackItem; feature: Feature };
  full: { feature: Feature };
  spill: { items: DetachedItem[]; reason: SpillReason };
  shed: { item: DetachedItem; hero: boolean };
  impact: { kind: string; strength: number; side: number; feature?: Feature };
  scrape: { side: number; strength: number };
  nearMiss: { kind: string; feature: Feature };
  closeShave: { feature: Feature };
  recovery: Record<string, never>;
  launch: { speed: number };
  land: { jolt: number; clean: boolean };
  crash: { reason: CrashReason; feature?: Feature };
  finish: Record<string, never>;
  bank: { value: number; mult: number; items: StackItem[] };
  carry: { mult: number };
  squish: { item: StackItem };
  damage: { item: StackItem };
  gate: { tag: string; feature: Feature };
  tip: { id: string };
  rumble: { side: number };
};

export interface RunConfig {
  mode: RunMode;
  track: Track;
  handling: EffectiveHandling;
  seed: number;
  /** Target forward speed as a function of absolute distance (m). */
  speedAt: (dist: number) => number;
  /** Campaign/daily finish distance (track s). Endless: null. */
  finishS: number | null;
  windScale?: number;
  wet?: boolean;
  /** Called every step for endless generation/recycling. */
  onAdvance?: (session: RunSession) => void;
}

export class RunSession {
  readonly events = new Emitter<RunEvents>();
  readonly truck: TruckSim;
  readonly rng: Rng;
  state: RunState = 'running';
  crashReason: CrashReason | null = null;
  t = 0;
  steps = 0;
  stats: RunStats = {
    coins: 0, nearMisses: 0, recoveries: 0, cleanLandings: 0, jumps: 0, heroSheds: 0, sheds: 0, spilled: 0,
    spilledValue: 0, collected: 0, collectedValue: 0, closeShaves: 0, landings: 0, maxItems: 0, scrapes: 0, maxItemsColumn: 0, maxStackHeight: 0, gates: {}, delivered: [],
    banked: 0, bankCount: 0, bestMultiplier: 1, fragileIntact: 0, cakesIntact: 0, discovered: [], timeDriven: 0,
  };
  multiplierIndex = 0;
  private featIdx = 0;
  private pose: Pose = {} as Pose;
  private puddleLevel = 0;
  private criticalTime = 0;
  private calmTime = 0;
  private recoveryCooldown = 0;
  private finishTimer = 0;
  private rumbleCooldown = 0;
  private lastShedT = -10;
  private onRampId = -1;
  shedRequests = 0;

  constructor(public cfg: RunConfig) {
    this.rng = new Rng(cfg.seed);
    this.truck = new TruckSim(cfg.handling, cfg.speedAt(0), this.rng);
  }

  get track(): Track {
    return this.cfg.track;
  }

  /** Absolute distance driven (independent of s rebasing). */
  get distance(): number {
    return this.truck.s + this.cfg.track.sOffset;
  }

  get multiplier(): number {
    const m = ECONOMY.depotMultipliers;
    return m[Math.min(m.length - 1, this.multiplierIndex)];
  }

  /** Unbanked cargo value at risk (current stack, including multiplier). */
  get atRisk(): number {
    let v = 0;
    for (const it of this.truck.allItems()) v += it.def.value * it.cond;
    return Math.round(v * this.multiplier);
  }

  get cargoValue(): number {
    let v = 0;
    for (const it of this.truck.allItems()) v += it.def.value * it.cond;
    return Math.round(v);
  }

  get progress(): number {
    if (this.cfg.finishS == null) return 0;
    return clamp(this.truck.s / this.cfg.finishS, 0, 1);
  }

  step(dt: number, input: RunInput): void {
    this.steps++;
    if (this.state !== 'running') {
      this.stepAftermath(dt);
      return;
    }
    this.t += dt;
    this.stats.timeDriven += dt;
    const tr = this.truck;
    tr.targetSpeed = this.cfg.speedAt(this.distance);
    this.cfg.onAdvance?.(this);
    const track = this.cfg.track;
    track.poseAt(tr.s, this.pose, true);

    // Environment from features near the truck.
    const env: TruckEnv = { curvature: this.pose.curvature, vcurv: this.pose.vcurv, rampH: 0, rampSlope: 0, overGap: false, gust: 0, puddle: 0 };
    const front = tr.s + tr.h.length * 0.5;
    const rear = tr.s - tr.h.length * 0.5;
    const feats = track.features;
    while (this.featIdx > 0 && this.featIdx >= feats.length) this.featIdx = feats.length - 1;
    // Walk back over recently started features (long medians/gusts are kept because the forward
    // scan below never skips a feature that is not fully behind the truck).
    while (this.featIdx > 0 && feats[this.featIdx - 1].s + 100 > rear) this.featIdx--;
    while (this.featIdx < feats.length && feats[this.featIdx].s + feats[this.featIdx].len < rear - 30) this.featIdx++;
    let inPuddle = false;
    for (let i = this.featIdx; i < feats.length; i++) {
      const f = feats[i];
      if (f.s > front + 1) break;
      const sOverlap = f.s <= front && f.s + f.len >= rear;
      const centreIn = tr.s >= f.s && tr.s <= f.s + f.len;
      switch (f.kind) {
        case 'ramp':
        case 'platform':
          if (centreIn && Math.abs(tr.x - f.x) <= f.hw + 0.25) {
            const u = (tr.s - f.s) / f.len;
            // Ramps can only be mounted from the front (or while already on them).
            if (this.onRampId === f.id || u < 0.15 || tr.airborne) {
              if (!tr.airborne) this.onRampId = f.id;
              const rh = f.kind === 'ramp' ? f.h * u : f.h;
              if (rh >= env.rampH) {
                env.rampH = rh;
                env.rampSlope = f.kind === 'ramp' ? f.h / f.len : 0;
              }
            }
          }
          break;
        case 'gap':
          if (centreIn && Math.abs(tr.x - f.x) < f.hw) env.overGap = true;
          break;
        case 'gust':
          if (centreIn) env.gust += (f.strength ?? 2) * (f.dir ?? 1) * (0.65 + 0.35 * Math.sin(this.t * 1.7 + (f.phase ?? 0))) * (this.cfg.windScale ?? 1);
          break;
        case 'puddle':
          if (sOverlap && Math.abs(tr.x - f.x) < f.hw + tr.h.bodyHalf * 0.6) inPuddle = true;
          break;
        default:
          break;
      }
    }
    this.puddleLevel = clamp(this.puddleLevel + (inPuddle ? dt * 5 : -dt * 2.5), 0, 1);
    env.puddle = Math.max(this.puddleLevel, this.cfg.wet ? 0.18 : 0);

    const prevFront = front;
    tr.step(dt, input.steer, env);
    const newFront = tr.s + tr.h.length * 0.5;
    const newRear = tr.s - tr.h.length * 0.5;

    if (tr.launched) {
      this.stats.jumps++;
      this.events.emit('launch', { speed: tr.vs });
    }
    if (tr.landed) {
      if (env.overGap) {
        this.crash('fell');
        return;
      }
      const damaged: StackItem[] = [];
      const j = tr.lastLandingJolt;
      tr.jolt(j, damaged);
      for (const it of damaged) this.events.emit('damage', { item: it });
      this.stats.landings++;
      const clean = Math.abs(tr.vx) < 2.2 && tr.stability > 0.35;
      if (clean) this.stats.cleanLandings++;
      this.events.emit('land', { jolt: j, clean });
    }

    // Edges
    const W = track.halfWidthAt(tr.s);
    this.handleEdges(W, dt);
    if (this.state !== 'running') return;

    // Feature interactions
    for (let i = this.featIdx; i < feats.length; i++) {
      const f = feats[i];
      if (f.s > newFront + 1) break;
      if (f.s + f.len < newRear - 2) {
        this.checkPassed(f, newRear);
        continue;
      }
      this.interact(f, prevFront, newFront, newRear);
      if (this.state !== 'running') return;
    }

    // Shedding
    if (input.shed && this.t - this.lastShedT > 0.2) {
      this.lastShedT = this.t;
      this.shedRequests++;
      this.doShed();
    }

    // Spills from the stack simulation (slides) and other detaches this step.
    this.flushDetached();

    // Recovery tracking
    if (this.recoveryCooldown > 0) this.recoveryCooldown -= dt;
    if (tr.stability < 0.18 && tr.itemCount > 0) {
      this.criticalTime += dt;
      if (!tr.critical && this.criticalTime > 0.12) {
        tr.critical = true;
        tr.spilledSinceCritical = false;
        this.calmTime = 0;
      }
    } else {
      this.criticalTime = 0;
    }
    if (tr.critical) {
      if (tr.stability > 0.6) this.calmTime += dt;
      else this.calmTime = 0;
      if (this.calmTime > 0.45) {
        tr.critical = false;
        if (!tr.spilledSinceCritical && tr.itemCount > 0 && this.recoveryCooldown <= 0) {
          this.stats.recoveries++;
          this.recoveryCooldown = 2;
          this.events.emit('recovery', {});
        }
      }
    }

    // Rollover
    if (tr.rolledOver) {
      this.crash('rollover');
      return;
    }

    // Track stats
    this.stats.maxItems = Math.max(this.stats.maxItems, tr.itemCount);
    for (let ci = 0; ci < tr.columns.length; ci++) {
      this.stats.maxItemsColumn = Math.max(this.stats.maxItemsColumn, tr.columns[ci].items.length);
    }
    this.stats.maxStackHeight = Math.max(this.stats.maxStackHeight, tr.stackTopAboveRoad() - tr.h.bedHeight - tr.y);

    // Finish
    if (this.cfg.finishS != null && tr.s >= this.cfg.finishS) this.finish();
  }

  private handleEdges(W: number, dt: number): void {
    const tr = this.truck;
    const pose = this.pose;
    for (const side of [-1, 1] as const) {
      const edge = side < 0 ? pose.left : pose.right;
      const outer = side * tr.x + tr.h.bodyHalf;
      if (edge === 'drop') {
        if (side * tr.x > W + 0.1 && !tr.airborne) {
          this.crash('fell');
          return;
        }
        if (outer > W - T.edgeRumbleWidth && this.rumbleCooldown <= 0) {
          this.rumbleCooldown = 0.35;
          this.events.emit('rumble', { side });
        }
      } else if (outer > W) {
        const over = outer - W;
        if (edge === 'wall') {
          tr.x = side * (W - tr.h.bodyHalf);
          const into = side * tr.vx;
          if (into > 0.3) {
            this.scrape(side, into);
          }
          if (into > 0) tr.vx = -side * into * 0.25;
        } else {
          // curb: soft push-back with a rumble
          tr.vx -= side * over * 45 * dt;
          if (over > 0.45) tr.x = side * (W + 0.45 - tr.h.bodyHalf);
          if (this.rumbleCooldown <= 0) {
            this.rumbleCooldown = 0.3;
            this.events.emit('rumble', { side });
          }
        }
      }
    }
    if (this.rumbleCooldown > 0) this.rumbleCooldown -= dt;
  }

  private scrape(side: number, into: number): void {
    const tr = this.truck;
    this.stats.scrapes++;
    tr.impulse(side, Math.min(T.majorImpulse, 1 + into * 0.6));
    tr.vs *= 0.94;
    tr.impactTimer = T.speedRecoverDelay;
    this.events.emit('scrape', { side, strength: into });
    if (into > 3.2) {
      // A hard scrape knocks the top item loose
      this.knockTop('scrape');
    }
  }

  private knockTop(reason: SpillReason): void {
    const tr = this.truck;
    let ci = -1, best = -1;
    for (let i = 0; i < tr.columns.length; i++) {
      const top = tr.columnTop(i);
      if (tr.columns[i].items.length > 0 && top > best) {
        best = top;
        ci = i;
      }
    }
    if (ci >= 0) tr.detachFrom(ci, tr.columns[ci].items.length - 1, reason);
  }

  private interact(f: Feature, prevFront: number, front: number, rear: number): void {
    const tr = this.truck;
    const sOverlap = f.s <= front && f.s + f.len >= rear;
    if (!sOverlap) return;
    const fx = f.kind === 'movingBarrier' ? f.x + (f.amp ?? 0) * Math.sin((f.freq ?? 1) * this.t + (f.phase ?? 0)) : f.x;
    const dx = tr.x - fx;
    const lateralGap = Math.abs(dx) - (tr.h.bodyHalf + f.hw);
    switch (f.kind) {
      case 'coin':
        if (!f.collected && Math.abs(dx) < tr.h.bodyHalf + 0.5 && tr.y < 2.5) {
          f.collected = true;
          this.stats.coins += ECONOMY.coinPickupValue;
          this.events.emit('coin', { feature: f });
        }
        return;
      case 'pickup':
        if (!f.collected && !f.touched && Math.abs(dx) < tr.h.bodyHalf + 0.55 && tr.y < 2.5) {
          const def = CARGO[f.cargo ?? 'parcel'];
          if (!tr.canAccept()) {
            f.touched = true;
            this.events.emit('full', { feature: f });
            return;
          }
          f.collected = true;
          const crushed: StackItem[] = [];
          const item = tr.addCargo(def, crushed);
          if (item) {
            this.stats.collected++;
            this.stats.collectedValue += def.value;
            if (!this.stats.discovered.includes(def.id)) this.stats.discovered.push(def.id);
            this.events.emit('pickup', { item, feature: f });
            for (const c of crushed) this.events.emit('squish', { item: c });
          }
        }
        return;
      case 'cone':
      case 'crate': {
        if (f.hit || lateralGap >= 0 || tr.y > f.h) {
          this.trackNear(f, lateralGap);
          return;
        }
        f.hit = true;
        const side = dx >= 0 ? 1 : -1; // obstacle on our left => cargo lurches left
        const major = f.kind === 'crate';
        tr.impulse(-side, major ? T.majorImpulse * 0.8 : T.minorImpulse);
        tr.vs *= major ? 0.86 : 0.95;
        tr.impactTimer = T.speedRecoverDelay;
        const damaged: StackItem[] = [];
        tr.jolt(major ? 2.4 : 1.0, damaged);
        for (const it of damaged) this.events.emit('damage', { item: it });
        if (major) this.knockTop('impact');
        this.events.emit('impact', { kind: f.kind, strength: major ? 1 : 0.5, side, feature: f });
        return;
      }
      case 'barrier':
      case 'cart':
      case 'movingBarrier':
      case 'wall': {
        if (tr.y > f.h + 0.1) {
          this.trackNear(f, lateralGap);
          return;
        }
        if (lateralGap >= 0) {
          this.trackNear(f, lateralGap);
          return;
        }
        // Wedge-shaped noses on long walls (medians) deflect rather than stop.
        const wedge = f.kind === 'wall' ? clamp((front - f.s) / 4, 0.15, 1) : 1;
        const effHw = f.hw * wedge;
        const depth = tr.h.bodyHalf + effHw - Math.abs(dx);
        if (depth <= 0) {
          this.trackNear(f, lateralGap);
          return;
        }
        const headOn = f.kind !== 'wall' && prevFront < f.s + 0.35 && depth > T.glancingDepth;
        if (headOn && !f.hit) {
          f.hit = true;
          this.crash('barrier', f);
          return;
        }
        // Glancing contact: push out, scrape, wobble.
        const side = dx >= 0 ? 1 : -1;
        tr.x = fx + side * (tr.h.bodyHalf + effHw + 0.01);
        const into = -side * tr.vx;
        tr.vx = side * Math.max(1.2, into * 0.35);
        if (!f.touched || into > 1.5) {
          f.touched = true;
          f.hit = f.kind !== 'wall';
          this.scrape(-side, Math.max(1.5, into + depth * 4));
        }
        return;
      }
      case 'overhead': {
        if (f.passed || tr.s < f.s) return;
        if (Math.abs(dx) > f.hw + tr.h.bodyHalf) return;
        f.passed = true;
        if (f.h < tr.h.cabHeight + tr.y - 0.05) {
          this.crash('lowbridge', f);
          return;
        }
        const top = tr.stackTopAboveRoad();
        const knocked = tr.knockAbove(f.h, 'overhead');
        if (knocked.length > 0) {
          this.events.emit('impact', { kind: 'overhead', strength: 0.8, side: 0, feature: f });
          tr.impulse(0, 0);
        } else if (tr.itemCount > 0 && f.h - top < 0.35) {
          this.stats.nearMisses++;
          this.stats.closeShaves++;
          this.events.emit('closeShave', { feature: f });
        }
        return;
      }
      case 'hook': {
        if (f.hit || tr.s < f.s || tr.s > f.s + f.len) return;
        const hx = f.x + (f.amp ?? 0) * Math.sin((f.freq ?? 1) * this.t + (f.phase ?? 0));
        if (Math.abs(tr.x - hx) > tr.h.bodyHalf * 0.7 + f.hw) return;
        f.hit = true;
        const knocked = tr.knockAbove(f.h, 'hook', f.h2 ?? f.h + 1.2);
        if (knocked.length > 0) {
          this.events.emit('impact', { kind: 'hook', strength: 0.9, side: Math.sign(tr.x - hx) || 1, feature: f });
          tr.impulse(Math.sign(tr.x - hx) || 1, T.minorImpulse);
        } else {
          f.hit = false; // passed beneath
        }
        return;
      }
      case 'ramp':
      case 'platform': {
        // Solid sides: driving into a raised ramp/platform from the side scrapes along it.
        if (this.onRampId === f.id || tr.airborne || tr.s < f.s + f.len * 0.15 || tr.s > f.s + f.len) return;
        const raised = f.kind === 'ramp' ? f.h * ((tr.s - f.s) / f.len) : f.h;
        if (raised < 0.35 || lateralGap >= 0) return;
        const side = dx >= 0 ? 1 : -1;
        tr.x = f.x + side * (tr.h.bodyHalf + f.hw + 0.01);
        const into = -side * tr.vx;
        if (into > 0) tr.vx = side * Math.max(1, into * 0.3);
        if (!f.touched) {
          f.touched = true;
          this.scrape(-side, Math.max(1.5, into));
        }
        return;
      }
      case 'bump':
        if (!f.hit && prevFront < f.s && front >= f.s && !tr.airborne) {
          f.hit = true;
          const damaged: StackItem[] = [];
          tr.jolt(T.bumpJolt, damaged);
          for (const it of damaged) this.events.emit('damage', { item: it });
          this.events.emit('impact', { kind: 'bump', strength: 0.4, side: 0, feature: f });
        }
        return;
      case 'depot':
        if (!f.collected && tr.s >= f.s + 4 && Math.abs(dx) < f.hw) {
          f.collected = true;
          this.bank();
        }
        return;
      case 'gate':
        if (!f.passed && tr.s >= f.s) {
          f.passed = true;
          if (Math.abs(dx) < f.hw) {
            const tag = f.tag ?? 'gate';
            this.stats.gates[tag] = (this.stats.gates[tag] ?? 0) + 1;
            this.events.emit('gate', { tag, feature: f });
          }
        }
        return;
      case 'sign':
        if (!f.passed && tr.s >= f.s) {
          f.passed = true;
          if (f.label?.startsWith('tip:')) this.events.emit('tip', { id: f.label.slice(4) });
        }
        return;
      default:
        return;
    }
  }

  private trackNear(f: Feature, gap: number): void {
    if (f.hit) return;
    if (!HARD_KINDS.has(f.kind) || f.kind === 'wall') return;
    f.nearMin = Math.min(f.nearMin ?? Infinity, gap);
  }

  private checkPassed(f: Feature, rear: number): void {
    if (f.passed || f.hit) return;
    if (f.s + f.len < rear && HARD_KINDS.has(f.kind) && f.kind !== 'wall') {
      f.passed = true;
      if (f.nearMin !== undefined && f.nearMin >= 0 && f.nearMin < T.nearMissGap) {
        this.stats.nearMisses++;
        this.events.emit('nearMiss', { kind: f.kind, feature: f });
      }
    }
    if (f.kind === 'depot' && !f.collected && !f.passed && f.s + f.len < rear) {
      f.passed = true;
      if (this.truck.itemCount > 0) {
        this.multiplierIndex = Math.min(ECONOMY.depotMultipliers.length - 1, this.multiplierIndex + 1);
        this.stats.bestMultiplier = Math.max(this.stats.bestMultiplier, this.multiplier);
        this.events.emit('carry', { mult: this.multiplier });
      }
    }
  }

  private doShed(): void {
    const tr = this.truck;
    if (tr.itemCount === 0) return;
    // Hero shed: critical stability, or a low clearance coming up that the stack would not clear.
    let hero = tr.stability < 0.3;
    if (!hero) {
      const top = tr.stackTopAboveRoad();
      for (let i = this.featIdx; i < this.track.features.length; i++) {
        const f = this.track.features[i];
        if (f.s > tr.s + 30) break;
        if ((f.kind === 'overhead' || f.kind === 'hook') && f.s > tr.s && f.h < top && Math.abs(f.x - tr.x) < f.hw + 1.5) {
          hero = true;
          break;
        }
      }
    }
    const d = tr.shedTop();
    if (!d) return;
    this.stats.sheds++;
    if (hero && tr.time - d.item.pickedAt > 0.5) this.stats.heroSheds++;
    this.events.emit('shed', { item: d, hero });
  }

  private flushDetached(): void {
    const tr = this.truck;
    if (tr.detached.length === 0) return;
    const byReason = new Map<SpillReason, DetachedItem[]>();
    for (const d of tr.detached) {
      if (d.reason === 'shed') continue;
      this.stats.spilled++;
      this.stats.spilledValue += Math.round(d.item.def.value * d.item.cond);
      const arr = byReason.get(d.reason) ?? [];
      arr.push(d);
      byReason.set(d.reason, arr);
    }
    for (const [reason, items] of byReason) this.events.emit('spill', { items, reason });
    tr.detached.length = 0;
  }

  private bank(): void {
    const tr = this.truck;
    const items = tr.allItems();
    if (items.length === 0) {
      this.events.emit('bank', { value: 0, mult: this.multiplier, items: [] });
      return;
    }
    const mult = this.multiplier;
    let value = 0;
    for (const it of items) {
      const v = Math.round(it.def.value * it.cond * mult);
      value += v;
      this.recordDelivered(it, v);
    }
    this.stats.banked += value;
    this.stats.bankCount++;
    for (const col of tr.columns) col.items.length = 0;
    this.multiplierIndex = 0;
    this.events.emit('bank', { value, mult, items });
  }

  private recordDelivered(it: StackItem, value: number): void {
    this.stats.delivered.push({ cargo: it.def.id, base: it.def.value, cond: it.cond, value, squished: it.squished });
    if (it.cond >= 0.98 && isFragile(it.def)) this.stats.fragileIntact++;
    if (it.cond >= 0.98 && (it.def.id === 'cake' || it.def.id === 'weddingcake')) this.stats.cakesIntact++;
  }

  finish(): void {
    if (this.state !== 'running') return;
    this.state = 'finished';
    const tr = this.truck;
    for (const it of tr.allItems()) this.recordDelivered(it, Math.round(it.def.value * it.cond));
    this.events.emit('finish', {});
  }

  crash(reason: CrashReason, feature?: Feature): void {
    if (this.state !== 'running') return;
    this.state = 'crashed';
    this.crashReason = reason;
    const tr = this.truck;
    // Cargo goes flying (visual); its value is lost.
    for (let ci = 0; ci < tr.columns.length; ci++) {
      if (tr.columns[ci].items.length) tr.detachFrom(ci, 0, 'crash', (this.rng.next() - 0.5) * 4);
    }
    this.flushDetachedCrash();
    this.events.emit('crash', { reason, feature });
  }

  private flushDetachedCrash(): void {
    const tr = this.truck;
    const items = tr.detached.slice();
    tr.detached.length = 0;
    if (items.length) this.events.emit('spill', { items, reason: 'crash' });
  }

  revives = 0;

  /**
   * Continue after a crash (Spare Tire). Cargo that fell stays lost. The truck is placed just
   * past whatever stopped it, on a lane that is clear for the next stretch.
   */
  revive(): boolean {
    if (this.state !== 'crashed') return false;
    const tr = this.truck;
    let s = tr.s;
    const feats = this.track.features;
    // advance past the obstacle/gap that caused the crash
    for (const f of feats) {
      if (f.s > s + 12) break;
      if (f.s + f.len < s - 6) continue;
      if ((HARD_KINDS.has(f.kind) && f.kind !== 'wall') || f.kind === 'gap' || (f.kind === 'overhead' && f.h < tr.h.cabHeight)) {
        s = Math.max(s, f.s + f.len + tr.h.length + 1.5);
      }
    }
    s = Math.min(s, this.track.endS - 5);
    const W = this.track.halfWidthAt(s);
    const lim = W - tr.h.bodyHalf - 0.2;
    let bestX = 0, bestScore = Infinity;
    for (let x = -lim; x <= lim + 1e-6; x += 0.5) {
      let blocked = false;
      for (const f of feats) {
        if (f.s > s + 28) break;
        if (f.s + f.len < s - 3) continue;
        const reach = tr.h.bodyHalf + f.hw + Math.abs(f.amp ?? 0) + 0.3;
        if ((HARD_KINDS.has(f.kind) || f.kind === 'gap' || f.kind === 'ramp' || f.kind === 'platform') && Math.abs(x - f.x) < reach) {
          blocked = true;
          break;
        }
      }
      const pose = this.track.poseAt(s);
      if ((pose.left === 'drop' && x < -lim + 0.5) || (pose.right === 'drop' && x > lim - 0.5)) blocked = true;
      const score = Math.abs(x) + (blocked ? 1000 : 0);
      if (score < bestScore) {
        bestScore = score;
        bestX = x;
      }
    }
    tr.s = s;
    tr.x = bestX;
    tr.vx = 0;
    tr.y = 0;
    tr.vy = 0;
    tr.airborne = false;
    tr.resetGround();
    this.onRampId = -1;
    tr.roll = 0;
    tr.rollV = 0;
    tr.tip = 0;
    tr.tipTimer = 0;
    tr.feltA = 0;
    tr.vs = tr.targetSpeed * 0.6;
    tr.critical = false;
    this.state = 'running';
    this.crashReason = null;
    this.finishTimer = 0;
    this.revives++;
    // forget features behind us so near-miss/pass bookkeeping stays sane
    for (const f of feats) if (f.s + f.len < s) f.passed = true;
    return true;
  }

  /** After finish/crash the truck coasts to a halt (visual only, no scoring). */
  private stepAftermath(dt: number): void {
    const tr = this.truck;
    this.finishTimer += dt;
    const decel = this.state === 'crashed' ? 26 : 9;
    tr.vs = Math.max(0, tr.vs - decel * dt);
    tr.s += tr.vs * dt;
    tr.vx *= Math.exp(-4 * dt);
    if (this.state === 'crashed' && this.crashReason !== 'fell') tr.x += tr.vx * dt;
    if (this.state === 'crashed' && this.crashReason === 'rollover') {
      tr.roll += Math.sign(tr.tip || 1) * dt * 3.2 * Math.max(0, 1 - Math.abs(tr.roll) / 1.6);
    }
    if (this.state === 'crashed' && this.crashReason === 'fell') {
      tr.vy -= T.gravity * dt;
      tr.y += tr.vy * dt;
    }
    tr.time += dt;
  }

  get aftermathTime(): number {
    return this.finishTimer;
  }

  /** Item heights helper for UI. */
  stackSummary(): { count: number; height: number } {
    const tr = this.truck;
    let h = 0;
    for (let i = 0; i < tr.columns.length; i++) h = Math.max(h, tr.columnTop(i));
    return { count: tr.itemCount, height: h };
  }
}

export { itemHeight };
