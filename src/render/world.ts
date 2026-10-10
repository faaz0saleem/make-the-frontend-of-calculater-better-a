import * as THREE from 'three';
import { Rng } from '../core/rng';
import { FORK_LANE } from '../data/chunks';
import type { PlacedChunk } from '../sim/builder';
import type { Track } from '../sim/track';
import type { EdgeKind, Feature, Pose, WorldId } from '../sim/types';
import { Kit, shade, withLowDetail } from './geo';
import { MAT, TEX } from './materials';
import { makeCargoMesh } from './models/cargo';
import { barrierKit, bumpKit, cartKit, coneKit, signMaterial, signPostKit } from './models/props';
import { sceneryFor, type SceneryPiece } from './scenery';
import { THEMES, type Theme } from './themes';

export interface WorldQuality {
  sceneryDensity: number; // 0..1
  glow: boolean;
  shadows: boolean;
}

interface PickupView {
  feature: Feature;
  group: THREE.Group;
  ring: THREE.Mesh;
  baseY: number;
  phase: number;
}

interface Mover {
  feature: Feature;
  child: THREE.Object3D;
  kind: 'barrier' | 'hook';
  cable?: THREE.Object3D;
}

interface InstancedSet {
  mesh: THREE.InstancedMesh;
  features: Feature[];
  hidden: boolean[];
}

interface ChunkView {
  serial: number;
  group: THREE.Group;
  pickups: PickupView[];
  movers: Mover[];
  coins: Feature[];
  cones: InstancedSet | null;
  crates: InstancedSet | null;
  world: WorldId;
  minElev: number;
}

const _pose = {} as Pose;
const _v = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

let coneGeo: THREE.BufferGeometry | null = null;
let crateGeo: THREE.BufferGeometry | null = null;
let coinGeo: THREE.BufferGeometry | null = null;
const ringGeo = new THREE.RingGeometry(0.75, 0.95, 28);
const blobGeo = new THREE.PlaneGeometry(1, 1);
const signGeo = new THREE.PlaneGeometry(1.25, 1.25);

function getConeGeo(): THREE.BufferGeometry {
  if (!coneGeo) {
    const k = new Kit();
    coneKit(k, 0, 0, 0);
    coneGeo = k.build();
  }
  return coneGeo;
}

function getCrateGeo(): THREE.BufferGeometry {
  if (!crateGeo) {
    const k = new Kit();
    k.box(0.78, 0.74, 0.78, 0xb5793f, 0, 0.37, 0, { r: 0.04 });
    k.box(0.8, 0.07, 0.8, 0x8a5a2e, 0, 0.6, 0);
    k.box(0.8, 0.07, 0.8, 0x8a5a2e, 0, 0.15, 0);
    k.box(0.07, 0.74, 0.8, 0x8a5a2e, -0.36, 0.37, 0);
    k.box(0.07, 0.74, 0.8, 0x8a5a2e, 0.36, 0.37, 0);
    crateGeo = k.build();
  }
  return crateGeo;
}

export function getCoinGeo(): THREE.BufferGeometry {
  if (!coinGeo) {
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 20);
    g.rotateX(Math.PI / 2);
    coinGeo = g;
  }
  return coinGeo;
}

export class WorldView {
  readonly root = new THREE.Group();
  originX = 0;
  originZ = 0;
  chunks = new Map<number, ChunkView>();
  theme: Theme = THEMES[1];
  coinMesh: THREE.InstancedMesh;
  private ground: THREE.Mesh;
  private time = 0;
  private quality: WorldQuality = { sceneryDensity: 1, glow: true, shadows: true };

  constructor(private scene: THREE.Scene) {
    scene.add(this.root);
    this.coinMesh = new THREE.InstancedMesh(getCoinGeo(), MAT.coin, 700);
    this.coinMesh.count = 0;
    this.coinMesh.frustumCulled = false;
    this.root.add(this.coinMesh);
    const gg = new THREE.CircleGeometry(700, 40);
    gg.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0xd9c8a4, roughness: 1 }));
    this.ground.receiveShadow = false;
    this.scene.add(this.ground);
  }

  setQuality(q: WorldQuality): void {
    this.quality = q;
  }

  setTheme(world: WorldId): void {
    this.theme = THEMES[world];
    (this.ground.material as THREE.MeshStandardMaterial).color.setHex(world === 1 ? 0x2fa3c7 : world === 2 ? 0xc9804a : 0x1e1a2c);
  }

  /** World position (render space) of a track-space point. */
  toWorld(track: Track, s: number, lat: number, h: number, out: THREE.Vector3): THREE.Vector3 {
    track.poseAt(s, _pose);
    out.set(_pose.x + Math.cos(_pose.heading) * lat - this.originX, _pose.elev + h, _pose.z + Math.sin(_pose.heading) * lat - this.originZ);
    return out;
  }

  /** Shift the render origin to keep float32 coordinates small on long runs. */
  rebase(dx: number, dz: number): void {
    this.originX += dx;
    this.originZ += dz;
    for (const c of this.chunks.values()) {
      c.group.position.x -= dx;
      c.group.position.z -= dz;
    }
  }

  clear(): void {
    for (const serial of [...this.chunks.keys()]) this.removeChunk(serial);
    this.originX = 0;
    this.originZ = 0;
  }

  removeChunk(serial: number): void {
    const c = this.chunks.get(serial);
    if (!c) return;
    this.root.remove(c.group);
    c.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.InstancedMesh) {
        if (o.userData.ownGeo) o.geometry.dispose();
      }
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.chunks.delete(serial);
  }

  get groundMinElev(): number {
    let m = Infinity;
    for (const c of this.chunks.values()) m = Math.min(m, c.minElev);
    return Number.isFinite(m) ? m : 0;
  }

  addChunk(track: Track, pc: PlacedChunk): void {
    if (this.chunks.has(pc.serial)) return;
    const theme = THEMES[pc.world];
    const rng = new Rng(pc.serial * 7919 + pc.world * 31 + Math.round(pc.s0));
    track.poseAt(pc.s0, _pose);
    const ax = _pose.x, az = _pose.z;
    const group = new THREE.Group();
    group.position.set(ax - this.originX, 0, az - this.originZ);
    const view: ChunkView = { serial: pc.serial, group, pickups: [], movers: [], coins: [], cones: null, crates: null, world: pc.world, minElev: Infinity };
    const ctx = new ChunkCtx(track, ax, az, theme, rng, this.quality);
    // ---------------- road surface with gap cut-outs
    const gaps = pc.features.filter((f) => f.kind === 'gap');
    const roadGeo = buildRoad(track, pc.s0, pc.s1, ax, az, gaps);
    const road = new THREE.Mesh(roadGeo, MAT.road);
    road.receiveShadow = this.quality.shadows;
    road.userData.ownGeo = true;
    group.add(road);
    // ---------------- markings, curbs, edges, ground, scenery
    withLowDetail(this.quality.sceneryDensity < 0.5, () => {
      ctx.markings(pc.s0, pc.s1, gaps);
      ctx.edges(pc.s0, pc.s1, gaps);
      ctx.scenery(pc.s0, pc.s1, pc.features);
      for (const f of pc.features) this.addFeature(ctx, view, track, f, pc);
    });
    // ---------------- assemble merged meshes
    const stat = ctx.kit.build();
    const mesh = new THREE.Mesh(stat, MAT.scenery);
    mesh.receiveShadow = this.quality.shadows;
    mesh.castShadow = false;
    mesh.userData.ownGeo = true;
    group.add(mesh);
    if (!ctx.paint.empty) {
      const pm = new THREE.Mesh(ctx.paint.build(), MAT.paint);
      pm.castShadow = this.quality.shadows;
      pm.receiveShadow = this.quality.shadows;
      pm.userData.ownGeo = true;
      group.add(pm);
    }
    if (!ctx.glow.empty) {
      const gm = new THREE.Mesh(ctx.glow.build(), MAT.neon);
      gm.userData.ownGeo = true;
      group.add(gm);
    }
    if (!ctx.lit.empty) {
      const lm = new THREE.Mesh(ctx.lit.build(), MAT.windowLit);
      lm.userData.ownGeo = true;
      group.add(lm);
    }
    if (!ctx.water.empty) {
      const wm = new THREE.Mesh(ctx.water.build(), MAT.water);
      wm.userData.ownGeo = true;
      group.add(wm);
    }
    if (!ctx.puddles.empty) {
      const pm = new THREE.Mesh(ctx.puddles.build(), MAT.puddle);
      pm.userData.ownGeo = true;
      pm.renderOrder = 1;
      group.add(pm);
    }
    if (!ctx.roofRoad.empty) {
      const rm = new THREE.Mesh(ctx.roofRoad.build(), MAT.road);
      rm.receiveShadow = this.quality.shadows;
      rm.userData.ownGeo = true;
      group.add(rm);
    }
    for (const s of ctx.signs) group.add(s);
    if (this.quality.glow && ctx.glowPts.length) {
      const n = ctx.glowPts.length / 4;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        pos[i * 3] = ctx.glowPts[i * 4];
        pos[i * 3 + 1] = ctx.glowPts[i * 4 + 1];
        pos[i * 3 + 2] = ctx.glowPts[i * 4 + 2];
        c.setHex(ctx.glowPts[i * 4 + 3]);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, glowPointsMaterial(theme.night));
      pts.userData.ownGeo = true;
      pts.frustumCulled = true;
      group.add(pts);
    }
    view.minElev = ctx.minElev;
    this.root.add(group);
    this.chunks.set(pc.serial, view);
  }

  private addFeature(ctx: ChunkCtx, view: ChunkView, track: Track, f: Feature, pc: PlacedChunk): void {
    const sMid = f.s + f.len * 0.5;
    track.poseAt(f.kind === 'ramp' || f.kind === 'platform' || f.kind === 'wall' || f.kind === 'cart' ? sMid : f.s, _pose);
    const ry = -_pose.heading;
    const p = ctx.local(_pose, f.x, 0, _v);
    const px = p.x, py = p.y, pz = p.z;
    const world = pc.world;
    switch (f.kind) {
      case 'coin':
        view.coins.push(f);
        break;
      case 'pickup': {
        const g = new THREE.Group();
        const cargo = makeCargoMesh(f.cargo ?? 'parcel');
        cargo.scale.setScalar(1.08);
        g.add(cargo);
        const ring = new THREE.Mesh(ringGeo, MAT.pickupRing);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.06;
        g.add(ring);
        const blob = new THREE.Mesh(blobGeo, MAT.blob);
        blob.rotation.x = -Math.PI / 2;
        blob.scale.setScalar(1.3);
        blob.position.y = 0.03;
        g.add(blob);
        g.position.set(px, py, pz);
        g.rotation.y = ry;
        view.group.add(g);
        view.pickups.push({ feature: f, group: g, ring, baseY: py, phase: f.id * 0.7 });
        break;
      }
      case 'cone': {
        if (!view.cones) view.cones = this.makeInstanced(view, getConeGeo(), 40, MAT.scenery);
        this.pushInstance(view.cones, f, px, py, pz, ry + f.id);
        break;
      }
      case 'crate': {
        if (!view.crates) view.crates = this.makeInstanced(view, getCrateGeo(), 40, MAT.scenery);
        const n = Math.max(1, Math.round(f.hw * 1.6));
        for (let i = 0; i < n; i++) {
          const ox = -f.hw + (i + 0.5) * ((f.hw * 2) / n);
          track.poseAt(f.s, _pose);
          const q = ctx.local(_pose, f.x + ox, 0, new THREE.Vector3());
          this.pushInstance(view.crates, f, q.x, q.y, q.z, ry + i * 0.25);
        }
        break;
      }
      case 'barrier':
        barrierKit(ctx.paint, px, py, pz, f.hw, ry, world);
        break;
      case 'cart':
        cartKit(ctx.paint, px, py, pz, f.hw, f.len, ry, world, f.variant ?? 0);
        break;
      case 'wall':
        ctx.median(f);
        break;
      case 'bump':
        bumpKit(ctx.paint, px, py, pz, ctx.track.halfWidthAt(f.s), ry);
        break;
      case 'puddle':
        ctx.puddle(f);
        break;
      case 'ramp':
        ctx.ramp(f);
        break;
      case 'platform':
        ctx.platform(f);
        break;
      case 'gap':
        ctx.chasm(f);
        break;
      case 'overhead':
        ctx.overhead(f);
        break;
      case 'gust':
        ctx.gustPoles(f);
        break;
      case 'depot':
        ctx.depot(f);
        break;
      case 'sign':
        ctx.sign(f);
        break;
      case 'movingBarrier': {
        const g = new THREE.Group();
        g.position.set(px - (f.x * Math.cos(_pose.heading)), py, pz - (f.x * Math.sin(_pose.heading)));
        g.rotation.y = ry;
        const bk = new Kit();
        barrierKit(bk, 0, 0, 0, f.hw, 0, world);
        bk.box(f.hw * 2 + 0.2, 0.1, 0.1, 0xffc93c, 0, 1.15, 0);
        const child = new THREE.Mesh(bk.build(), MAT.paint);
        child.castShadow = this.quality.shadows;
        child.userData.ownGeo = true;
        const holder = new THREE.Group();
        holder.add(child);
        const lampK = new Kit();
        for (const sx of [-f.hw, f.hw]) lampK.sphere(0.12, 0xffb02e, sx, 1.25, 0);
        const lamp = new THREE.Mesh(lampK.build(), MAT.lamp);
        lamp.userData.ownGeo = true;
        holder.add(lamp);
        holder.position.x = f.x;
        g.add(holder);
        // slot rails across the sweep
        const rk = new Kit();
        const amp = Math.abs(f.amp ?? 0) + f.hw;
        rk.box(amp * 2 + 0.4, 0.03, 0.25, 0x1e2230, f.x, 0.015, 0);
        for (const sx of [f.x - amp - 0.3, f.x + amp + 0.3]) {
          rk.box(0.3, 1.4, 0.3, 0x3e3a52, sx, 0.7, 0, { r: 0.05 });
        }
        const rails = new THREE.Mesh(rk.build(), MAT.scenery);
        rails.userData.ownGeo = true;
        g.add(rails);
        view.group.add(g);
        view.movers.push({ feature: f, child: holder, kind: 'barrier' });
        break;
      }
      case 'hook': {
        const W = ctx.track.halfWidthAt(f.s);
        // static gantry
        const gk = ctx.paint;
        const gantryH = 8.2;
        const colr = 0xffb02e;
        for (const side of [-1, 1]) {
          const q = ctx.local(_pose, side * (W + 1.2), 0, new THREE.Vector3());
          gk.box(0.5, gantryH, 0.5, colr, q.x, q.y + gantryH / 2, q.z, { ry, r: 0.05 });
          gk.box(1.2, 0.4, 1.2, shade(colr, 0.7), q.x, q.y + 0.2, q.z, { ry });
        }
        const qc = ctx.local(_pose, 0, gantryH, new THREE.Vector3());
        gk.box((W + 1.6) * 2, 0.7, 0.8, colr, qc.x, qc.y, qc.z, { ry, r: 0.06 });
        gk.box((W + 1.6) * 2, 0.12, 0.12, 0x2b3a55, qc.x, qc.y - 0.42, qc.z, { ry });
        // dynamic trolley + cable + container
        const g = new THREE.Group();
        track.poseAt(f.s, _pose);
        const base = ctx.local(_pose, 0, 0, new THREE.Vector3());
        g.position.copy(base);
        g.rotation.y = ry;
        const tk = new Kit();
        tk.box(1.1, 0.5, 1.0, 0x2b3a55, 0, gantryH - 0.7, 0, { r: 0.06 });
        const band = (f.h2 ?? f.h + 1.4) - f.h;
        const cont = new Kit();
        cont.box(1.5, band, 1.2, rngColor(f.id), 0, f.h + band / 2, 0, { r: 0.05 });
        for (let i = 0; i < 5; i++) cont.box(0.06, band * 0.9, 1.22, shade(rngColor(f.id), 0.8), -0.6 + i * 0.3, f.h + band / 2, 0);
        cont.box(0.3, 0.3, 0.3, 0x5b5f66, 0, f.h + band + 0.15, 0);
        const trolley = new THREE.Mesh(tk.build(), MAT.paint);
        trolley.userData.ownGeo = true;
        const container = new THREE.Mesh(cont.build(), MAT.paint);
        container.castShadow = this.quality.shadows;
        container.userData.ownGeo = true;
        const holder = new THREE.Group();
        holder.add(trolley);
        holder.add(container);
        const cableGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6);
        const cable = new THREE.Mesh(cableGeo, MAT.paintMatte);
        cable.userData.ownGeo = true;
        const top = gantryH - 0.95, bottom = f.h + band + 0.3;
        cable.scale.y = top - bottom;
        cable.position.y = (top + bottom) / 2;
        holder.add(cable);
        g.add(holder);
        view.group.add(g);
        view.movers.push({ feature: f, child: holder, kind: 'hook' });
        break;
      }
      default:
        break;
    }
  }

  private makeInstanced(view: ChunkView, geo: THREE.BufferGeometry, cap: number, mat: THREE.Material): InstancedSet {
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.count = 0;
    mesh.castShadow = this.quality.shadows;
    view.group.add(mesh);
    return { mesh, features: [], hidden: [] };
  }

  private pushInstance(set: InstancedSet, f: Feature, x: number, y: number, z: number, ry: number): void {
    const i = set.mesh.count;
    if (i >= set.mesh.instanceMatrix.count) return;
    _q.setFromAxisAngle(UP, ry);
    _m4.compose(_v.set(x, y, z), _q, _sc.set(1, 1, 1));
    set.mesh.setMatrixAt(i, _m4);
    set.mesh.count = i + 1;
    set.features.push(f);
    set.hidden.push(false);
    set.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Per-frame animation of dynamic world pieces. */
  update(dt: number, simT: number, track: Track, cam: THREE.Camera, truckS: number): void {
    this.time += dt;
    // Coins: rebuild instance list from active chunks (cheap: a few hundred matrices)
    let n = 0;
    const spin = this.time * 3.2;
    const camPos = cam.position;
    for (const c of this.chunks.values()) {
      for (const f of c.coins) {
        if (f.collected || f.s < truckS - 6 || f.s > truckS + 170) continue;
        if (n >= 700) break;
        this.toWorld(track, f.s, f.x, 0.75 + Math.sin(this.time * 4 + f.id) * 0.06, _v);
        if (_v.distanceToSquared(camPos) > 200 * 200) continue;
        _q.setFromAxisAngle(UP, spin + f.id * 0.3);
        _m4.compose(_v, _q, _sc.set(1, 1, 1));
        this.coinMesh.setMatrixAt(n++, _m4);
      }
      for (const p of c.pickups) {
        const f = p.feature;
        if (f.collected) {
          if (p.group.visible) p.group.visible = false;
          continue;
        }
        p.group.children[0].position.y = 0.35 + Math.sin(this.time * 2.4 + p.phase) * 0.12;
        p.group.children[0].rotation.y = this.time * 0.9 + p.phase;
        const pulse = 1 + Math.sin(this.time * 5 + p.phase) * 0.08;
        p.ring.scale.setScalar(f.touched ? 0.6 : pulse);
        (p.ring.material as THREE.MeshBasicMaterial).opacity = 0.55;
      }
      for (const m of c.movers) {
        const f = m.feature;
        const x = f.x + (f.amp ?? 0) * Math.sin((f.freq ?? 1) * simT + (f.phase ?? 0));
        m.child.position.x = x;
        if (m.kind === 'hook') m.child.rotation.z = Math.cos((f.freq ?? 1) * simT + (f.phase ?? 0)) * 0.08;
      }
      for (const set of [c.cones, c.crates]) {
        if (!set) continue;
        let changed = false;
        for (let i = 0; i < set.features.length; i++) {
          if (set.features[i].hit && !set.hidden[i]) {
            set.hidden[i] = true;
            set.mesh.getMatrixAt(i, _m4);
            _m4.scale(_sc.set(0.0001, 0.0001, 0.0001));
            set.mesh.setMatrixAt(i, _m4);
            changed = true;
          }
        }
        if (changed) set.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
    // ground disc follows the camera below the lowest visible road
    this.ground.position.set(camPos.x, this.groundMinElev - (this.theme.id === 2 ? 34 : this.theme.id === 1 ? 2.2 : 1.9), camPos.z);
  }

  /** Returns cone/crate world positions that were hit this frame (for debris). */
  stats(): { chunks: number; objects: number } {
    let objects = 0;
    for (const c of this.chunks.values()) objects += c.group.children.length;
    return { chunks: this.chunks.size, objects };
  }
}

function rngColor(id: number): number {
  const cols = [0xff5a4e, 0x1fb5a5, 0x2c4a7a, 0xffc23a, 0x8a5cf0];
  return cols[id % cols.length];
}

const glowMats: Record<string, THREE.PointsMaterial> = {};
function glowPointsMaterial(night: boolean): THREE.PointsMaterial {
  const key = night ? 'n' : 'd';
  return (glowMats[key] ??= new THREE.PointsMaterial({
    size: night ? 1.5 : 1.1, map: TEX.dot, vertexColors: true, transparent: true, opacity: night ? 0.42 : 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
}

// =====================================================================================
function buildRoad(track: Track, s0: number, s1: number, ax: number, az: number, gaps: Feature[]): THREE.BufferGeometry {
  const pose = {} as Pose;
  const len = s1 - s0;
  const ns = Math.max(2, Math.ceil(len / 2) + 1);
  let maxW = 0;
  for (let i = 0; i < ns; i++) maxW = Math.max(maxW, track.halfWidthAt(s0 + (len * i) / (ns - 1)));
  const ncol = Math.max(4, Math.ceil((2 * maxW) / 1.5));
  const pos = new Float32Array(ns * (ncol + 1) * 3);
  const uv = new Float32Array(ns * (ncol + 1) * 2);
  const idx: number[] = [];
  for (let i = 0; i < ns; i++) {
    const s = s0 + (len * i) / (ns - 1);
    track.poseAt(s, pose);
    const W = pose.halfWidth;
    const cx = Math.cos(pose.heading), cz = Math.sin(pose.heading);
    for (let j = 0; j <= ncol; j++) {
      const lat = -W + (2 * W * j) / ncol;
      const o = (i * (ncol + 1) + j) * 3;
      pos[o] = pose.x + cx * lat - ax;
      pos[o + 1] = pose.elev;
      pos[o + 2] = pose.z + cz * lat - az;
      const u = (i * (ncol + 1) + j) * 2;
      uv[u] = lat / 4.5;
      uv[u + 1] = s / 4.5;
    }
  }
  for (let i = 0; i < ns - 1; i++) {
    const sA = s0 + (len * i) / (ns - 1);
    const sB = s0 + (len * (i + 1)) / (ns - 1);
    const sm = (sA + sB) / 2;
    const W = track.halfWidthAt(sm);
    for (let j = 0; j < ncol; j++) {
      const latM = -W + (2 * W * (j + 0.5)) / ncol;
      let cut = false;
      for (const g of gaps) {
        if (sm >= g.s && sm <= g.s + g.len && Math.abs(latM - g.x) < g.hw) {
          cut = true;
          break;
        }
      }
      if (cut) continue;
      const a = i * (ncol + 1) + j, b = a + 1, c = a + ncol + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Per-chunk build context: road-aligned helpers and merged kits. */
class ChunkCtx {
  kit = new Kit(); // matte scenery
  paint = new Kit(); // glossy props
  glow = new Kit(); // emissive neon (may bloom)
  lit = new Kit(); // lit windows (no bloom)
  water = new Kit();
  puddles = new Kit();
  roofRoad = new Kit();
  signs: THREE.Mesh[] = [];
  gantries = new Set<number>();
  glowPts: number[] = [];
  minElev = Infinity;
  private pose = {} as Pose;

  constructor(public track: Track, private ax: number, private az: number, public theme: Theme, public rng: Rng, private q: WorldQuality) {}

  local(pose: Pose, lat: number, h: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(pose.x + Math.cos(pose.heading) * lat - this.ax, pose.elev + h, pose.z + Math.sin(pose.heading) * lat - this.az);
  }

  /** Ribbon along s with a cross-section polyline [lat, h] (colours per polyline segment). */
  ribbon(s0: number, s1: number, cross: (pose: Pose, s: number) => [number, number][], colors: number[], kit: Kit = this.kit, step = 2): void {
    const len = s1 - s0;
    if (len <= 0.01) return;
    const ns = Math.max(2, Math.ceil(len / step) + 1);
    const pts: { p: [number, number][]; pose: Pose }[] = [];
    for (let i = 0; i < ns; i++) {
      const si = s0 + (len * i) / (ns - 1);
      const pose = this.track.poseAt(si, {} as Pose);
      this.minElev = Math.min(this.minElev, pose.elev);
      pts.push({ p: cross(pose, si), pose });
    }
    const segs = pts[0].p.length - 1;
    for (let k = 0; k < segs; k++) {
      const tri: number[] = [];
      for (let i = 0; i < ns - 1; i++) {
        const A = pts[i], B = pts[i + 1];
        const a0 = this.lp(A.pose, A.p[k]), a1 = this.lp(A.pose, A.p[k + 1]);
        const b0 = this.lp(B.pose, B.p[k]), b1 = this.lp(B.pose, B.p[k + 1]);
        tri.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
      }
      kit.tris(tri, colors[k % colors.length]);
    }
  }

  private lp(pose: Pose, [lat, h]: [number, number]): [number, number, number] {
    return [pose.x + Math.cos(pose.heading) * lat - this.ax, pose.elev + h, pose.z + Math.sin(pose.heading) * lat - this.az];
  }

  private runs(s0: number, s1: number, side: -1 | 1): { a: number; b: number; edge: EdgeKind }[] {
    const out: { a: number; b: number; edge: EdgeKind }[] = [];
    let cur: EdgeKind | null = null;
    let start = s0;
    for (let s = s0; s <= s1 + 0.001; s += 1) {
      const pose = this.track.poseAt(Math.min(s, s1 - 0.01), this.pose);
      const e = side < 0 ? pose.left : pose.right;
      if (cur === null) cur = e;
      if (e !== cur) {
        out.push({ a: start, b: s, edge: cur });
        start = s;
        cur = e;
      }
    }
    if (cur) out.push({ a: start, b: s1, edge: cur });
    return out;
  }

  markings(s0: number, s1: number, gaps: Feature[]): void {
    const t = this.theme;
    const inGap = (s: number, lat: number) => gaps.some((g) => s >= g.s - 0.5 && s <= g.s + g.len + 0.5 && Math.abs(lat - g.x) < g.hw + 0.3);
    // edge lines
    for (const side of [-1, 1]) {
      const segs = this.splitBy(s0, s1, (s) => !inGap(s, side * (this.track.halfWidthAt(s) - 0.35)));
      for (const [a, b] of segs) {
        this.ribbon(a, b, (p) => [[side * (p.halfWidth - 0.42), 0.012], [side * (p.halfWidth - 0.27), 0.012]], [t.roadEdge], this.kit);
      }
    }
    // lane dashes
    for (let s = Math.ceil(s0 / 7) * 7; s < s1 - 3; s += 7) {
      const W = this.track.halfWidthAt(s + 1.5);
      const lanes = W < 3.6 ? [0] : W < 5.3 ? [-1.5, 1.5] : W > 7.6 ? [-FORK_LANE, FORK_LANE] : [];
      for (const lat of lanes) {
        if (inGap(s, lat) || inGap(s + 3, lat)) continue;
        this.ribbon(s, s + 3, () => [[lat - 0.08, 0.012], [lat + 0.08, 0.012]], [t.roadLine], this.kit, 3);
      }
    }
  }

  private splitBy(s0: number, s1: number, ok: (s: number) => boolean): [number, number][] {
    const out: [number, number][] = [];
    let start: number | null = null;
    for (let s = s0; s <= s1; s += 1) {
      if (ok(s)) {
        if (start === null) start = s;
      } else if (start !== null) {
        out.push([start, s - 1]);
        start = null;
      }
    }
    if (start !== null) out.push([start, s1]);
    return out.filter(([a, b]) => b - a > 0.5);
  }

  edges(s0: number, s1: number, gaps: Feature[]): void {
    const t = this.theme;
    for (const side of [-1, 1] as const) {
      for (const run of this.runs(s0, s1, side)) {
        const fullGap = gaps.some((g) => g.hw >= 4.4 && run.a >= g.s - 1 && run.b <= g.s + g.len + 1);
        if (run.edge === 'drop' || fullGap) this.dropEdge(run.a, run.b, side);
        else {
          // curb + sidewalk + ground strip
          this.ribbon(run.a, run.b, (p) => [[side * p.halfWidth, 0], [side * p.halfWidth, 0.16], [side * (p.halfWidth + 0.25), 0.16]], [t.curb, shade(t.curb, 1.1)]);
          this.ribbon(run.a, run.b, (p) => [[side * (p.halfWidth + 0.25), 0.16], [side * (p.halfWidth + 3.0), 0.16]], [t.sidewalk]);
          this.ribbon(run.a, run.b, (p) => [[side * (p.halfWidth + 3.0), 0.16], [side * (p.halfWidth + 3.0), 0.02], [side * (p.halfWidth + 18), 0.02]], [shade(t.sidewalk, 0.85), t.ground], this.kit, 4);
          if (run.edge === 'wall') this.wall(run.a, run.b, side);
        }
      }
    }
  }

  private wall(a: number, b: number, side: -1 | 1): void {
    const t = this.theme;
    if (t.id === 2) {
      // terracotta cliff wall right next to the road
      const bands = [0xc8643b, 0xe08a4f, 0xa84e2d, 0xd9774a];
      this.ribbon(a, b, (p) => [[side * (p.halfWidth + 0.35), 0.1], [side * (p.halfWidth + 0.55), 2.2], [side * (p.halfWidth + 0.9), 4.2], [side * (p.halfWidth + 1.6), 6.5], [side * (p.halfWidth + 3), 7.5]], bands, this.kit, 3);
    } else if (t.id === 3) {
      this.ribbon(a, b, (p) => [[side * (p.halfWidth + 0.3), 0.16], [side * (p.halfWidth + 0.3), 0.95], [side * (p.halfWidth + 0.5), 0.95], [side * (p.halfWidth + 0.5), 0.16]], [0x5e5670, 0xffc93c, 0x4a4458]);
    } else {
      this.ribbon(a, b, (p) => [[side * (p.halfWidth + 0.3), 0.16], [side * (p.halfWidth + 0.35), 0.75], [side * (p.halfWidth + 0.5), 0.95], [side * (p.halfWidth + 0.65), 0.75], [side * (p.halfWidth + 0.7), 0.16]], [t.wall, 0xff5a4e, 0xff5a4e, t.wall]);
    }
  }

  private dropEdge(a: number, b: number, side: -1 | 1): void {
    const t = this.theme;
    if (t.id === 1) {
      // timber dock edge, water below
      this.ribbon(a, b, (p) => [[side * p.halfWidth, 0], [side * (p.halfWidth + 0.15), 0.05], [side * (p.halfWidth + 0.3), -0.1], [side * (p.halfWidth + 0.3), -2.0]], [0xfff6e6, 0x8a5a36, 0x6b4a33], this.kit);
      this.ribbon(a, b, (p) => [[side * (p.halfWidth + 0.3), -1.6], [side * (p.halfWidth + 70), -1.6]], [t.water], this.water, 4);
      for (let s = Math.ceil(a / 6) * 6; s < b; s += 6) {
        const pose = this.track.poseAt(s, this.pose);
        const q = this.local(pose, side * (pose.halfWidth + 0.15), 0, _v);
        this.kit.cyl(0.14, 0.16, 0.55, 0x2b3a55, q.x, q.y + 0.27, q.z, { seg: 8 });
        const pw = this.local(pose, side * (pose.halfWidth + 0.35), 0, _v);
        this.kit.cyl(0.18, 0.18, 2.2, 0x6b4a33, pw.x, pw.y - 1.1, pw.z, { seg: 8 });
      }
      // a boat now and then
      if (this.rng.chance(0.6) && this.q.sceneryDensity > 0.4) {
        const s = (a + b) / 2;
        const pose = this.track.poseAt(s, this.pose);
        const q = this.local(pose, side * (pose.halfWidth + 9 + this.rng.range(0, 8)), -1.6, _v);
        const boat = new Kit();
        boat.box(2.6, 0.9, 6, this.rng.pick([0xff5a4e, 0xfff6e6, 0x1fb5a5]), 0, 0.3, 0, { r: 0.4 });
        boat.box(1.8, 1.0, 2.0, 0xfff6e6, 0, 1.1, 0.6, { r: 0.15 });
        boat.cyl(0.05, 0.05, 4, 0xdfe6ee, 0, 2.5, -1);
        this.paint.absorb(boat, q.x, q.y, q.z, { ry: -pose.heading + this.rng.range(-0.3, 0.3) });
      }
    } else if (t.id === 2) {
      this.ribbon(a, b, (p) => [[side * p.halfWidth, 0], [side * (p.halfWidth + 0.4), -0.6], [side * (p.halfWidth + 1.4), -8], [side * (p.halfWidth + 2.6), -20], [side * (p.halfWidth + 4), -34]], [0xb85a33, 0xc8643b, 0xa84e2d, 0x8a3e22], this.kit, 3);
      for (let s = Math.ceil(a / 5) * 5; s < b; s += 5) {
        const pose = this.track.poseAt(s, this.pose);
        const q = this.local(pose, side * (pose.halfWidth - 0.1), 0, _v);
        this.kit.box(0.18, 0.5, 0.18, 0xfff6e6, q.x, q.y + 0.25, q.z, { ry: -pose.heading });
        this.kit.box(0.2, 0.12, 0.2, 0xff4d3d, q.x, q.y + 0.45, q.z, { ry: -pose.heading });
      }
    } else {
      this.ribbon(a, b, (p) => [[side * p.halfWidth, 0], [side * (p.halfWidth + 0.2), 0.12], [side * (p.halfWidth + 0.4), 0], [side * (p.halfWidth + 0.4), -1.4]], [0x8a86a8, 0x5e5670, 0x3e3a52], this.kit);
      this.ribbon(a, b, (p) => [[side * (p.halfWidth + 0.4), -1.3], [side * (p.halfWidth + 60), -1.3]], [t.water], this.water, 4);
      for (let s = Math.ceil(a / 8) * 8; s < b; s += 8) {
        const pose = this.track.poseAt(s, this.pose);
        const q = this.local(pose, side * (pose.halfWidth + 0.25), 0, _v);
        this.kit.cyl(0.05, 0.05, 1.2, 0x2a2a3a, q.x, q.y + 0.6, q.z);
        this.glow.sphere(0.12, 0xffe8b0, q.x, q.y + 1.25, q.z);
        if (this.q.glow) this.glowPts.push(q.x, q.y + 1.25, q.z, 0xffe8b0);
      }
    }
  }

  scenery(s0: number, s1: number, feats: Feature[]): void {
    const t = this.theme;
    const dens = this.q.sceneryDensity;
    const buildings = sceneryFor(t.id, 'building');
    const props = sceneryFor(t.id, 'prop');
    const tall = sceneryFor(t.id, 'tall');
    const blockedS = feats.filter((f) => f.kind === 'overhead' || f.kind === 'hook' || f.kind === 'depot').map((f) => [f.s - 4, f.s + f.len + 4]);
    for (const side of [-1, 1] as const) {
      for (const run of this.runs(s0, s1, side)) {
        if (run.edge === 'drop') continue;
        const wallOff = run.edge === 'wall' ? (t.id === 2 ? 3.4 : 0.9) : 0;
        // buildings row
        let s = run.a + this.rng.range(0, 3);
        while (s < run.b - 2) {
          const b = this.rng.pick(buildings);
          const center = s + b.w / 2;
          if (center > run.b) break;
          if (this.rng.next() < 0.85 * dens) {
            const pose = this.track.poseAt(center, {} as Pose);
            const gap = this.rng.range(0.4, 1.4);
            const lat = side * (pose.halfWidth + 3.1 + wallOff + gap + b.d / 2);
            this.placePiece(b, pose, lat, side);
          }
          s += b.w + this.rng.range(0.6, 2.4);
        }
        // sidewalk props
        if (wallOff === 0) {
          for (let ps = run.a + this.rng.range(2, 6); ps < run.b - 1; ps += this.rng.range(7, 13) / Math.max(0.35, dens)) {
            if (blockedS.some(([a, b]) => ps > a && ps < b)) continue;
            const pr = this.rng.pick(props);
            const pose = this.track.poseAt(ps, {} as Pose);
            this.placePiece(pr, pose, side * (pose.halfWidth + 1.4), side);
          }
        }
        // backdrop landmarks
        if (this.rng.next() < 0.5 * dens) {
          const tl = this.rng.pick(tall);
          const ss = (run.a + run.b) / 2;
          if (run.b - run.a > 20) {
            const pose = this.track.poseAt(ss, {} as Pose);
            this.placePiece(tl, pose, side * (pose.halfWidth + 22 + this.rng.range(0, 18)), side);
          }
        }
      }
    }
  }

  private placePiece(pc: SceneryPiece, pose: Pose, lat: number, side: -1 | 1): void {
    const q = this.local(pose, lat, 0.02, _v);
    const ry = -pose.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    this.kit.addColored(pc.body, q.x, q.y, q.z, { ry });
    if (pc.glow) this.glow.addColored(pc.glow, q.x, q.y, q.z, { ry });
    if (pc.lit) this.lit.addColored(pc.lit, q.x, q.y, q.z, { ry });
    if (this.q.glow && pc.lights.length) {
      const c = Math.cos(ry), s = Math.sin(ry);
      for (const [lx, ly, lz, col] of pc.lights) {
        this.glowPts.push(q.x + lx * c + lz * s, q.y + ly, q.z - lx * s + lz * c, col);
      }
    }
  }

  median(f: Feature): void {
    const t = this.theme;
    const s0 = f.s, s1 = f.s + f.len;
    const noseLen = 4;
    const top = t.id === 2 ? 1.3 : 0.95;
    const col = t.id === 1 ? 0x8f4a3a : t.id === 2 ? 0xb85a33 : 0x3e3a52;
    // wedge nose grows from a narrow point to the full median width (matches the deflecting collider)
    this.ribbon(s0, s0 + noseLen, (_p, s) => {
      const w = f.hw * Math.max(0.15, Math.min(1, (s - s0) / noseLen));
      return [[f.x - w, 0], [f.x - w, top], [f.x + w, top], [f.x + w, 0]];
    }, [col, shade(col, 1.15), col], this.kit, 1);
    this.ribbon(s0 + noseLen, s1, () => [[f.x - f.hw, 0], [f.x - f.hw, top], [f.x + f.hw, top], [f.x + f.hw, 0]], [col, shade(col, 1.15), col]);
    // decorations along the median
    for (let s = s0 + 6; s < s1 - 3; s += t.id === 3 ? 6 : 5) {
      const pose = this.track.poseAt(s, this.pose);
      const q = this.local(pose, f.x, top, _v);
      if (t.id === 1) {
        this.kit.sphere(0.45, this.rng.pick([0x4caf50, 0x6cc56a]), q.x, q.y + 0.25, q.z, { seg: 8 });
        this.kit.sphere(0.16, this.rng.pick([0xff6f91, 0xffd166, 0xffffff]), q.x + 0.2, q.y + 0.5, q.z, { seg: 6 });
      } else if (t.id === 2) {
        this.kit.sphere(0.55, this.rng.pick([0xc77a4a, 0xa85e38]), q.x, q.y + 0.1, q.z, { seg: 7, sy: 0.7 });
      } else {
        this.glow.box(0.12, 0.08, 4.5, this.rng.pick(t.glow), q.x - f.hw + 0.06, q.y - 0.05, q.z, { ry: -pose.heading });
        this.glow.box(0.12, 0.08, 4.5, this.rng.pick(t.glow), q.x + f.hw - 0.06, q.y - 0.05, q.z, { ry: -pose.heading });
      }
    }
    // nose marker
    const pose = this.track.poseAt(s0 + 0.5, this.pose);
    const q = this.local(pose, f.x, 0, _v);
    this.paint.cyl(0.35, 0.4, 1.0, 0xffc93c, q.x, q.y + 0.5, q.z);
    this.paint.cyl(0.36, 0.36, 0.18, 0x2b2f3a, q.x, q.y + 0.55, q.z);
  }

  puddle(f: Feature): void {
    const pose = this.track.poseAt(f.s + f.len / 2, this.pose);
    const q = this.local(pose, f.x, 0.018, _v);
    this.puddles.cyl(1, 1, 0.01, 0xffffff, q.x, q.y, q.z, { sx: f.hw, sz: f.len / 2, ry: -pose.heading, seg: 18 });
  }

  ramp(f: Feature): void {
    const s0 = f.s, s1 = f.s + f.len;
    const tri: number[] = [];
    const side: number[] = [];
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const sa = s0 + (f.len * i) / steps, sb = s0 + (f.len * (i + 1)) / steps;
      const ha = (f.h * i) / steps, hb = (f.h * (i + 1)) / steps;
      const pa = this.track.poseAt(sa, {} as Pose), pb = this.track.poseAt(sb, {} as Pose);
      const L = (p: Pose, lat: number, h: number) => this.local(p, lat, h, new THREE.Vector3()).toArray();
      const a0 = L(pa, f.x - f.hw, ha), a1 = L(pa, f.x + f.hw, ha), b0 = L(pb, f.x - f.hw, hb), b1 = L(pb, f.x + f.hw, hb);
      tri.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
      const g0 = L(pa, f.x - f.hw, 0), g1 = L(pb, f.x - f.hw, 0), r0 = L(pa, f.x + f.hw, 0), r1 = L(pb, f.x + f.hw, 0);
      side.push(...g0, ...g1, ...a0, ...a0, ...g1, ...b0);
      side.push(...r0, ...a1, ...r1, ...r1, ...a1, ...b1);
    }
    this.paint.tris(tri, [0xffc93c, 0xffc93c, 0x2b2f3a, 0xffc93c]);
    this.paint.tris(side, 0xd9a03a);
    // back face at the lip
    const pe = this.track.poseAt(s1, {} as Pose);
    const L2 = (lat: number, h: number) => this.local(pe, lat, h, new THREE.Vector3()).toArray();
    const back = [...L2(f.x - f.hw, 0), ...L2(f.x - f.hw, f.h), ...L2(f.x + f.hw, 0), ...L2(f.x + f.hw, 0), ...L2(f.x - f.hw, f.h), ...L2(f.x + f.hw, f.h)];
    this.paint.tris(back, 0x8a6a2a);
    // chevrons on the deck
    for (let i = 1; i < 4; i++) {
      const s = s0 + (f.len * i) / 4;
      const p = this.track.poseAt(s, this.pose);
      const q = this.local(p, f.x, (f.h * i) / 4 + 0.02, _v);
      this.paint.box(Math.min(1.6, f.hw), 0.03, 0.25, 0xfff6e6, q.x, q.y, q.z, { ry: -p.heading, rx: -Math.atan2(f.h, f.len) });
    }
  }

  platform(f: Feature): void {
    const s0 = f.s, s1 = f.s + f.len;
    // rooftop driving surface
    this.ribbon(s0, s1, () => [[f.x - f.hw, f.h], [f.x + f.hw, f.h]], [0xffffff], this.roofRoad, 2);
    // building mass under the roof
    const t = this.theme;
    const col = t.buildings[(f.id * 3) % t.buildings.length];
    this.ribbon(s0, s1, () => [[f.x + f.hw, f.h], [f.x + f.hw, 0]], [col], this.kit, 2);
    this.ribbon(s0, s1, () => [[f.x - f.hw - 0.1, 0], [f.x - f.hw - 0.1, f.h + 0.6], [f.x - f.hw + 0.25, f.h + 0.6]], [col, shade(col, 0.8)], this.kit, 2);
    this.ribbon(s0, s1, () => [[f.x + f.hw - 0.25, f.h + 0.6], [f.x + f.hw + 0.1, f.h + 0.6], [f.x + f.hw + 0.1, f.h]], [shade(col, 0.8), col], this.kit, 2);
    // lit windows on the street-facing wall
    for (let s = s0 + 3; s < s1 - 2; s += 3.5) {
      const p = this.track.poseAt(s, this.pose);
      const q = this.local(p, f.x + f.hw + 0.06, f.h * 0.5, _v);
      this.lit.box(0.05, 0.7, 1.2, this.rng.pick([0xd9a860, 0xcf9a50, 0x7fa8c8]), q.x, q.y, q.z, { ry: -p.heading });
    }
    // rooftop edge lights
    for (let s = s0 + 2; s < s1; s += 6) {
      const p = this.track.poseAt(s, this.pose);
      for (const lat of [f.x - f.hw + 0.1, f.x + f.hw - 0.1]) {
        const q = this.local(p, lat, f.h + 0.7, _v);
        this.glow.sphere(0.09, 0xff4fa3, q.x, q.y, q.z);
        if (this.q.glow) this.glowPts.push(q.x, q.y, q.z, 0xff4fa3);
      }
    }
  }

  chasm(f: Feature): void {
    const deep = this.theme.id === 2 ? -34 : -2;
    const L = (s: number, lat: number, h: number) => this.local(this.track.poseAt(s, {} as Pose), lat, h, new THREE.Vector3()).toArray();
    const tri: number[] = [];
    for (const s of [f.s, f.s + f.len]) {
      const a = L(s, f.x - f.hw, 0), b = L(s, f.x + f.hw, 0), c = L(s, f.x - f.hw, deep), d = L(s, f.x + f.hw, deep);
      tri.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
    this.kit.tris(tri, 0x7a3a22);
    this.ribbon(f.s, f.s + f.len, () => [[f.x - f.hw, deep], [f.x + f.hw, deep]], [0x4a2a18], this.kit, 2);
    // hazard stripes at the lip
    const p = this.track.poseAt(f.s - 0.3, this.pose);
    const q = this.local(p, f.x, 0.02, _v);
    this.paint.box(f.hw * 2, 0.04, 0.4, 0xffc93c, q.x, q.y, q.z, { ry: -p.heading });
  }

  overhead(f: Feature): void {
    const t = this.theme;
    const pose = this.track.poseAt(f.s, this.pose);
    const ry = -pose.heading;
    const W = this.track.halfWidthAt(f.s);
    const full = f.hw >= W - 0.1;
    const xl = full ? -W - 0.45 : f.x - f.hw - 0.2;
    const xr = full ? W + 0.45 : f.x + f.hw + 0.2;
    const span = xr - xl;
    const cx = (xl + xr) / 2;
    const beamH = 0.5;
    const c = this.local(pose, cx, f.h + beamH / 2, new THREE.Vector3());
    if (f.variant === 9 || f.variant === 8) {
      // tunnel: portal facade (9) or interior ribs (8)
      const h2 = f.h + (f.variant === 9 ? 4 : 0.6);
      const portal = f.variant === 9;
      this.paint.box(span + (portal ? 1.2 : 0), h2 - f.h, portal ? 1.2 : 0.6, portal ? 0x3e3a52 : 0x2e2a40, c.x, pose.elev + f.h + (h2 - f.h) / 2, c.z, { ry });
      if (portal) {
        this.glow.box(span * 0.9, 0.1, 0.1, 0xffc93c, c.x, pose.elev + f.h + 0.05, c.z, { ry });
        const sideK = (lat: number) => this.local(pose, lat, 0, new THREE.Vector3());
        for (const lat of [xl - 0.2, xr + 0.2]) {
          const q = sideK(lat);
          this.paint.box(1.0, h2, 1.2, 0x3e3a52, q.x, q.y + h2 / 2, q.z, { ry });
        }
      } else {
        for (const lat of [xl, xr]) {
          const q = this.local(pose, lat, 0, new THREE.Vector3());
          this.paint.box(0.5, f.h + 0.6, 0.6, 0x2e2a40, q.x, q.y + (f.h + 0.6) / 2, q.z, { ry });
        }
        for (let i = 0; i < 3; i++) {
          const q = this.local(pose, xl + span * (0.2 + i * 0.3), f.h - 0.05, new THREE.Vector3());
          this.glow.box(0.8, 0.06, 0.2, 0xfff0d0, q.x, q.y, q.z, { ry });
        }
      }
      this.clearanceStripe(pose, cx, span, f.h, ry);
      return;
    }
    for (const lat of [xl, xr]) {
      const q = this.local(pose, lat, 0, new THREE.Vector3());
      this.paint.box(0.32, f.h + beamH, 0.32, t.id === 2 ? 0x6b4a33 : t.id === 3 ? 0x3e3a52 : 0xfff6e6, q.x, q.y + (f.h + beamH) / 2, q.z, { ry, r: 0.05 });
    }
    if (t.id === 1) {
      // striped awning canopy across the road
      const n = Math.max(6, Math.round(span / 0.6));
      const [c1, c2] = t.awnings[f.id % t.awnings.length];
      for (let i = 0; i < n; i++) {
        const lat = xl + (i + 0.5) * (span / n);
        const q = this.local(pose, lat, f.h + beamH * 0.5, new THREE.Vector3());
        this.paint.box(span / n + 0.01, beamH, 1.4, i % 2 ? c2 : c1, q.x, q.y, q.z, { ry, r: 0.03 });
        const sc = this.local(pose, lat, f.h + 0.06, new THREE.Vector3());
        this.paint.box(span / n * 0.5, 0.12, 0.08, i % 2 ? c1 : c2, sc.x, sc.y, sc.z + 0, { ry });
      }
    } else if (t.id === 2) {
      this.paint.box(span + 0.6, beamH, 0.5, 0x8a5a36, c.x, c.y, c.z, { ry, r: 0.04 });
      for (const lat of [xl + 0.3, xr - 0.3]) {
        const q = this.local(pose, lat, f.h + beamH, new THREE.Vector3());
        this.paint.box(0.5, 0.25, 0.6, 0x6b4a33, q.x, q.y, q.z, { ry });
      }
    } else {
      this.paint.box(span + 0.4, beamH, 0.5, 0x3e3a52, c.x, c.y, c.z, { ry, r: 0.04 });
      this.glow.box(span, 0.06, 0.06, t.glow[f.id % 4], c.x, pose.elev + f.h + 0.02, c.z, { ry });
      for (let i = 0; i < 4; i++) {
        const q = this.local(pose, xl + span * (0.15 + i * 0.23), f.h - 0.35, new THREE.Vector3());
        this.glow.sphere(0.18, [0xff5a4e, 0xffc23a, 0xff4f6d][i % 3], q.x, q.y, q.z, { sy: 1.2 });
        if (this.q.glow) this.glowPts.push(q.x, q.y, q.z, 0xff8a5a);
      }
    }
    this.clearanceStripe(pose, cx, span, f.h, ry);
    // tell-tale strips 9 m before low beams
    if (f.h < 4.2) {
      const pt = this.track.poseAt(Math.max(0, f.s - 9), {} as Pose);
      for (const lat of [xl, xr]) {
        const q = this.local(pt, lat, 0, new THREE.Vector3());
        this.kit.box(0.12, f.h + 0.8, 0.12, 0x5b5f66, q.x, q.y + (f.h + 0.8) / 2, q.z, { ry: -pt.heading });
      }
      const n = Math.round(span / 0.5);
      for (let i = 0; i < n; i++) {
        const lat = xl + (i + 0.5) * (span / n);
        const q = this.local(pt, lat, f.h + 0.35, new THREE.Vector3());
        this.paint.box(0.06, 0.7, 0.04, i % 2 ? 0xffc93c : 0xff5a4e, q.x, q.y, q.z, { ry: -pt.heading });
      }
      const qb = this.local(pt, (xl + xr) / 2, f.h + 0.75, new THREE.Vector3());
      this.kit.box(span, 0.06, 0.06, 0x5b5f66, qb.x, qb.y, qb.z, { ry: -pt.heading });
    }
  }

  private clearanceStripe(pose: Pose, cx: number, span: number, h: number, ry: number): void {
    // yellow/black stripe on the beam underside edge marks the exact clearance
    const n = Math.max(4, Math.round(span / 0.6));
    for (let i = 0; i < n; i++) {
      const lat = cx - span / 2 + (i + 0.5) * (span / n);
      const q = this.local(pose, lat, h + 0.06, new THREE.Vector3());
      this.paint.box(span / n, 0.12, 0.06, i % 2 ? 0x24304a : 0xffc93c, q.x, q.y, q.z + 0, { ry });
    }
  }

  gustPoles(f: Feature): void {
    for (const s of [f.s + 4, f.s + f.len * 0.6]) {
      const pose = this.track.poseAt(s, this.pose);
      for (const side of [-1, 1]) {
        const q = this.local(pose, side * (pose.halfWidth + 1.2), 0, new THREE.Vector3());
        this.kit.cyl(0.05, 0.05, 3.2, 0xdfe6ee, q.x, q.y + 1.6, q.z, { seg: 6 });
        const dir = f.dir ?? 1;
        const sock = new Kit();
        for (let i = 0; i < 4; i++) sock.cyl(0.2 - i * 0.03, 0.17 - i * 0.03, 0.3, i % 2 ? 0xfff6e6 : 0xff6a2b, 0.15 + i * 0.3, 0, 0, { rz: Math.PI / 2, seg: 8 });
        this.paint.absorb(sock, q.x, q.y + 3.05, q.z, { ry: -pose.heading + (dir > 0 ? 0 : Math.PI) });
      }
    }
  }

  depot(f: Feature): void {
    const pose = this.track.poseAt(f.s + f.len / 2, this.pose);
    const ry = -pose.heading;
    const W = this.track.halfWidthAt(f.s + f.len / 2);
    const side = Math.sign(f.x) || 1;
    // canopy over the depot lane
    const xl = f.x - f.hw - 0.3, xr = f.x + f.hw + 0.3;
    for (const s of [f.s + 2, f.s + f.len - 2]) {
      const p = this.track.poseAt(s, {} as Pose);
      for (const lat of [xl, xr]) {
        const q = this.local(p, lat, 0, new THREE.Vector3());
        this.paint.box(0.35, 5.2, 0.35, 0x24304a, q.x, q.y + 2.6, q.z, { ry: -p.heading });
      }
    }
    this.ribbon(f.s + 1, f.s + f.len - 1, () => [[xl - 0.4, 5.2], [xr + 0.4, 5.2]], [0x3cc9a7], this.paint, 2);
    this.ribbon(f.s + 1, f.s + f.len - 1, () => [[xl - 0.4, 5.6], [xr + 0.4, 5.6]], [0x2fa08a], this.paint, 2);
    const c = this.local(pose, f.x, 5.4, new THREE.Vector3());
    this.paint.box(3.2, 1.0, 0.3, 0xfff6e6, c.x, c.y + 0.6, c.z, { ry, r: 0.1 });
    // ground arrows
    for (let s = f.s + 3; s < f.s + f.len - 3; s += 6) {
      const p = this.track.poseAt(s, this.pose);
      const q = this.local(p, f.x, 0.014, new THREE.Vector3());
      this.glow.box(1.4, 0.01, 0.5, 0x3cc9a7, q.x, q.y, q.z, { ry: -p.heading });
    }
    // warehouse beyond the road edge
    const wq = this.local(pose, side * (W + 9), 0, new THREE.Vector3());
    const wk = new Kit();
    wk.box(12, 6, 18, 0xe8e2d6, 0, 3, 0, { r: 0.2 });
    wk.box(12.6, 0.6, 18.6, 0x3cc9a7, 0, 6.2, 0);
    for (let i = 0; i < 3; i++) wk.box(0.1, 3.6, 4, 0x5b5f66, side > 0 ? -6.05 : 6.05, 1.8, -6 + i * 6);
    this.kit.absorb(wk, wq.x, wq.y, wq.z, { ry });
    if (this.q.glow) this.glowPts.push(c.x, c.y + 0.6, c.z, 0x3cc9a7);
  }

  sign(f: Feature): void {
    const label = f.label ?? '';
    if (label.startsWith('tip:')) return;
    const pose = this.track.poseAt(f.s, this.pose);
    if (label === 'finish') {
      this.finishArch(pose, f.s);
      return;
    }
    const W = pose.halfWidth;
    const inRoad = Math.abs(f.x) < W - 0.5;
    const lat = inRoad ? f.x : Math.sign(f.x || 1) * (W + 0.9);
    const q = this.local(pose, lat, 0, new THREE.Vector3());
    if (inRoad) {
      // overhead gantry spanning the road (one per s), plates hang above their routes
      const key = Math.round(f.s);
      if (!this.gantries.has(key)) {
        this.gantries.add(key);
        for (const side of [-1, 1]) {
          const pp = this.local(pose, side * (W + 0.5), 0, new THREE.Vector3());
          this.paint.box(0.3, 6.4, 0.3, 0x5b5f66, pp.x, pp.y + 3.2, pp.z, { ry: -pose.heading });
        }
        const pc = this.local(pose, 0, 6.3, new THREE.Vector3());
        this.paint.box(2 * W + 1.2, 0.35, 0.35, 0x5b5f66, pc.x, pc.y, pc.z, { ry: -pose.heading });
      }
    } else signPostKit(this.kit, q.x, q.y, q.z);
    const m = new THREE.Mesh(signGeo, signMaterial(label));
    m.position.set(q.x, q.y + (inRoad ? 5.3 : 2.45), q.z);
    m.rotation.y = -pose.heading;
    if (inRoad) m.scale.setScalar(1.5);
    this.signs.push(m);
  }

  private finishArch(pose: Pose, sFinish: number): void {
    const W = pose.halfWidth;
    for (const side of [-1, 1]) {
      const q = this.local(pose, side * (W + 0.6), 0, new THREE.Vector3());
      this.paint.box(0.6, 8.2, 0.6, 0x24304a, q.x, q.y + 4.1, q.z, { ry: -pose.heading, r: 0.08 });
    }
    const n = 16;
    for (let i = 0; i < n; i++) {
      for (let row = 0; row < 2; row++) {
        const lat = -W - 0.6 + (i + 0.5) * ((2 * W + 1.2) / n);
        const q = this.local(pose, lat, 7.2 + row * 0.5, new THREE.Vector3());
        this.paint.box((2 * W + 1.2) / n, 0.5, 0.3, (i + row) % 2 ? 0x24304a : 0xfff6e6, q.x, q.y, q.z, { ry: -pose.heading });
      }
    }
    // depot building past the finish
    const after = this.track.poseAt(Math.min(this.track.endS - 2, sFinish + 74), {} as Pose);
    const wq = this.local(after, 0, 0, new THREE.Vector3());
    const wk = new Kit();
    wk.box(16, 7, 6, 0xfff1d6, 0, 3.5, -4, { r: 0.25 });
    wk.box(16.6, 0.7, 6.6, 0xff5a4e, 0, 7.2, -4);
    wk.box(8, 4.5, 0.2, 0x3a5a7a, 0, 2.25, -0.95);
    wk.box(6, 1.2, 0.3, 0x3cc9a7, 0, 8.4, -2.5, { r: 0.1 });
    this.kit.absorb(wk, wq.x, wq.y, wq.z, { ry: -after.heading });
  }
}
