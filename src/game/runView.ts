import * as THREE from 'three';
import type { PlacedChunk } from '../sim/builder';
import type { RunSession } from '../sim/run';
import type { Track } from '../sim/track';
import type { Pose } from '../sim/types';
import type { GameRenderer } from '../render/renderer';

interface Snap {
  s: number;
  x: number;
  y: number;
  vx: number;
  vs: number;
}

/**
 * Binds a RunSession to the renderer: interpolated truck pose, chunk streaming,
 * event-driven effects (dust, sparks, confetti, debris) and camera behaviour.
 */
export class RunView {
  private prev: Snap = { s: 0, x: 0, y: 0, vx: 0, vs: 0 };
  private cur: Snap = { s: 0, x: 0, y: 0, vx: 0, vs: 0 };
  private pose = {} as Pose;
  private v = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private time = 0;
  private unsub: (() => void)[] = [];
  private finishFx = 0;
  reducedMotion = false;
  /** Endless/daily chunk providers. */
  getChunks: () => PlacedChunk[] = () => [];
  camMode: 'drive' | 'orbit' = 'drive';

  constructor(private r: GameRenderer, public run: RunSession, chunks: PlacedChunk[]) {
    this.r.world.clear();
    this.r.truck.clearDebris();
    this.r.particles.clear();
    this.r.follow.reset();
    this.r.setTheme(run.track.world);
    for (const c of chunks) this.r.world.addChunk(run.track, c);
    this.snapshot();
    this.prev = { ...this.cur };
    this.bindEvents();
  }

  get track(): Track {
    return this.run.track;
  }

  dispose(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
  }

  /** Call after each sim step. */
  snapshot(): void {
    const t = this.run.truck;
    this.prev = this.cur;
    this.cur = { s: t.s, x: t.x, y: t.y, vx: t.vx, vs: t.vs };
  }

  /** Called when s was rebased by `delta` so interpolation stays continuous. */
  rebased(delta: number): void {
    this.prev.s -= delta;
    this.cur.s -= delta;
  }

  private bindEvents(): void {
    const ev = this.run.events;
    const r = this.r;
    const at = (s: number, lat: number, h: number) => r.world.toWorld(this.track, s, lat, h, new THREE.Vector3());
    this.unsub.push(
      ev.on('coin', ({ feature }) => {
        const p = at(feature.s, feature.x, 0.8);
        r.particles.emit('sparkle', p.x, p.y, p.z, 4, { color: 0xffe27a });
      }),
      ev.on('pickup', ({ feature }) => {
        const p = at(feature.s, feature.x, 0.6);
        r.particles.emit('sparkle', p.x, p.y, p.z, 10, { color: 0xfff3b0 });
        r.follow.shake(0.12);
      }),
      ev.on('spill', ({ items, reason }) => {
        const tr = this.run.truck;
        const p = at(tr.s, tr.x, 0);
        for (const d of items) r.truck.spawnDebris(d, p, this.yaw(), tr.vs, p.y, reason);
        if (reason !== 'crash') r.follow.shake(0.35);
      }),
      ev.on('shed', ({ item }) => {
        const tr = this.run.truck;
        const p = at(tr.s, tr.x, 0);
        r.truck.spawnDebris(item, p, this.yaw(), tr.vs, p.y, 'shed');
      }),
      ev.on('impact', ({ kind, strength, feature }) => {
        const tr = this.run.truck;
        const p = at(feature ? feature.s : tr.s, feature ? feature.x : tr.x, 0.4);
        if (kind === 'cone' || kind === 'crate') {
          r.particles.emit('dust', p.x, p.y, p.z, 8, { color: 0xd9c3a0 });
          r.particles.emit(kind === 'cone' ? 'spark' : 'dust', p.x, p.y + 0.4, p.z, 6, { color: kind === 'cone' ? 0xff8a3d : 0xb5793f });
        } else if (kind === 'bump') {
          r.particles.emit('dust', p.x, p.y - 0.3, p.z, 6, { spread: 3 });
        } else {
          r.particles.emit('spark', p.x, p.y + 2, p.z, 10);
        }
        r.follow.shake(0.25 + strength * 0.4);
      }),
      ev.on('scrape', ({ side, strength }) => {
        const tr = this.run.truck;
        const p = at(tr.s, tr.x - side * tr.h.bodyHalf, 0.5);
        r.particles.emit('spark', p.x, p.y, p.z, 8 + strength * 2);
        r.follow.shake(0.18 + Math.min(0.5, strength * 0.08));
      }),
      ev.on('land', ({ jolt }) => {
        const tr = this.run.truck;
        const p = at(tr.s, tr.x, 0.1);
        r.particles.emit('dust', p.x, p.y, p.z, 10 + jolt * 2, { spread: 2.5, color: r.theme.id === 3 ? 0x8a86a8 : 0xd9b48a });
        r.follow.shake(Math.min(0.9, jolt * 0.12));
      }),
      ev.on('crash', ({ reason }) => {
        const tr = this.run.truck;
        const p = at(tr.s, tr.x, 0.5);
        if (reason === 'fell' && r.theme.id !== 2) r.particles.emit('splash', p.x, p.y - 1.5, p.z, 30, { spread: 3 });
        else r.particles.emit('smoke', p.x, p.y, p.z, 16, { spread: 2 });
        r.particles.emit('spark', p.x, p.y + 0.5, p.z, 16);
        r.follow.shake(1);
      }),
      ev.on('finish', () => {
        this.finishFx = 2.5;
      }),
      ev.on('bank', ({ value }) => {
        if (value <= 0) return;
        const tr = this.run.truck;
        const p = at(tr.s + 6, tr.x, 2.5);
        r.particles.emit('confetti', p.x, p.y, p.z, 40, { spread: 3 });
      }),
      ev.on('nearMiss', ({ feature }) => {
        const p = at(feature.s, feature.x, 1.0);
        r.particles.emit('sparkle', p.x, p.y, p.z, 6, { color: 0x9fe8ff });
      }),
      ev.on('closeShave', ({ feature }) => {
        const p = at(feature.s, this.run.truck.x, feature.h);
        r.particles.emit('spark', p.x, p.y, p.z, 10, { color: 0x9fe8ff });
      }),
      ev.on('squish', () => r.follow.shake(0.15)),
    );
  }

  private yaw(): number {
    const tr = this.run.truck;
    this.track.poseAt(tr.s, this.pose);
    return -(this.pose.heading + Math.atan2(tr.vx, Math.max(4, tr.vs)) * 0.55);
  }

  /** Render-time update with interpolation alpha. */
  frame(dt: number, alpha: number): void {
    this.time += dt;
    const r = this.r;
    const run = this.run;
    const tr = run.truck;
    // stream chunks (endless) — add new, drop recycled
    const placed = this.getChunks();
    if (placed.length) {
      const keep = new Set(placed.map((p) => p.serial));
      for (const p of placed) if (!r.world.chunks.has(p.serial)) r.world.addChunk(this.track, p);
      for (const serial of [...r.world.chunks.keys()]) if (!keep.has(serial)) r.world.removeChunk(serial);
    }
    const a = Math.max(0, Math.min(1, alpha));
    const s = this.prev.s + (this.cur.s - this.prev.s) * a;
    const x = this.prev.x + (this.cur.x - this.prev.x) * a;
    const y = this.prev.y + (this.cur.y - this.prev.y) * a;
    const vx = this.prev.vx + (this.cur.vx - this.prev.vx) * a;
    const vs = this.prev.vs + (this.cur.vs - this.prev.vs) * a;
    this.track.poseAt(Math.min(s, this.track.endS - 0.01), this.pose);
    const h = this.pose.heading;
    this.fwd.set(Math.sin(h), 0, -Math.cos(h));
    this.right.set(Math.cos(h), 0, Math.sin(h));
    const pos = r.world.toWorld(this.track, Math.min(s, this.track.endS - 0.01), x, y, this.v);
    // render-origin rebasing for long runs
    if (Math.abs(pos.x) > 1200 || Math.abs(pos.z) > 1200) {
      const dx = pos.x, dz = pos.z;
      r.world.rebase(dx, dz);
      r.particles.shift(dx, dz);
      r.truck.shift(dx, dz);
      pos.x -= dx;
      pos.z -= dz;
      r.follow.reset();
    }
    const slip = Math.atan2(vx, Math.max(4, vs)) * 0.55;
    let yaw = -(h + slip);
    let pitch = 0;
    if (tr.airborne) pitch = Math.max(-0.25, Math.min(0.25, tr.vy * 0.025));
    pitch += Math.max(-0.05, Math.min(0.05, -this.pose.vcurv * 6));
    if (run.state === 'crashed' && run.crashReason === 'barrier') yaw += Math.min(0.6, run.aftermathTime * 1.2) * Math.sign(tr.vx || 1);
    if (run.state === 'crashed' && run.crashReason === 'fell') pitch -= Math.min(0.9, run.aftermathTime * 1.5);
    r.truck.update(dt, tr, pos, yaw, pitch, this.time, this.reducedMotion);
    // dust behind wheels at speed / in canyon / puddle spray
    if (run.state === 'running' && !tr.airborne && r.theme.id === 2 && Math.random() < dt * 10) {
      const back = pos.clone().addScaledVector(this.fwd, -1.8);
      r.particles.emit('dust', back.x, back.y + 0.1, back.z, 1, { color: 0xd9b48a, vx: -this.fwd.x * 2, vz: -this.fwd.z * 2 });
    }
    if (this.finishFx > 0) {
      this.finishFx -= dt;
      if (Math.random() < dt * 12) {
        const p = pos.clone().addScaledVector(this.fwd, 6);
        r.particles.emit('confetti', p.x + (Math.random() - 0.5) * 8, p.y + 5, p.z + (Math.random() - 0.5) * 8, 6, { spread: 2 });
      }
    }
    r.truck.updateDebris(dt, () => this.pose.elev, (p, st) => {
      r.particles.emit('dust', p.x, p.y, p.z, Math.min(8, st));
    });
    // camera
    const stackTop = run.stackSummary().height;
    const mode = this.camMode === 'orbit' ? 'orbit' : run.state === 'crashed' ? 'crash' : run.state === 'finished' ? 'finish' : 'drive';
    // camera ceiling from overhead structures near the camera's position along the road
    const camS = s - 12;
    let ceiling = Infinity;
    for (const f of this.track.features) {
      if (f.s > camS + 8) break;
      if (f.s + f.len < camS - 8) continue;
      if (f.kind === 'overhead') ceiling = Math.min(ceiling, f.h - 0.45);
      if (f.kind === 'sign' && f.label === 'finish') ceiling = Math.min(ceiling, 6.2);
      if (f.kind === 'depot') ceiling = Math.min(ceiling, 4.6);
    }
    r.follow.update(dt, pos, this.fwd, this.right, x, stackTop, vs, mode, this.time, ceiling - y);
    r.focusShadow(pos);
    // world animation
    r.world.update(dt, run.t, this.track, r.follow.cam, s);
    // weather streaks
    let gust = 0;
    for (const f of this.track.features) {
      if (f.kind !== 'gust') continue;
      if (s >= f.s - 10 && s <= f.s + f.len) {
        gust = Math.max(gust, f.strength ?? 0);
        r.streaks.windDir = Math.sign(f.dir ?? 1);
      }
      if (f.s > s + 30) break;
    }
    r.streaks.windStrength += (gust - r.streaks.windStrength) * Math.min(1, dt * 3);
    r.streaks.update(this.time, pos, h, this.right.x, this.right.z, this.reducedMotion);
    r.particles.update(dt);
  }

  setRain(v: number): void {
    this.r.streaks.rain = v;
  }
}
