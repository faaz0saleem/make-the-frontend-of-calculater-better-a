import * as THREE from 'three';
import type { CargoShape } from '../data/cargo';
import type { PaintDef } from '../data/cosmetics';
import type { VehicleKind } from '../data/vehicles';
import type { DetachedItem, StackItem, TruckSim } from '../sim/truck';
import { itemHeight } from '../sim/truck';
import { MAT, TEX } from './materials';
import { makeCargoMesh, setCargoShape } from './models/cargo';
import { buildTruck, type TruckModel } from './models/truck';

/** Visual exaggeration of cargo slide so wobble reads clearly at speed. */
const SLIDE_GAIN = 1.45;
const TILT_GAIN = 0.85;

interface Debris {
  obj: THREE.Group;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  groundY: number;
  bounced: number;
  active: boolean;
}

/** Renders the truck, its cargo stack, falling cargo (pooled) and contact shadows. */
export class TruckView {
  model: TruckModel | null = null;
  readonly group = new THREE.Group();
  private items = new Map<number, THREE.Group>();
  private pool: THREE.Group[] = [];
  private debris: Debris[] = [];
  private blob: THREE.Mesh;
  private warn: THREE.Sprite;
  private kind: VehicleKind = 'pickup';
  readonly maxDebris = 14;
  visualRollGain = 1.5;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    const bm = new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, opacity: 0.9 });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bm);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 2;
    scene.add(this.blob);
    const wm = new THREE.SpriteMaterial({ map: warnTexture(), depthTest: false, transparent: true });
    this.warn = new THREE.Sprite(wm);
    this.warn.scale.set(0.9, 0.9, 1);
    this.warn.visible = false;
    this.warn.renderOrder = 10;
    scene.add(this.warn);
    for (let i = 0; i < this.maxDebris; i++) {
      const g = makeCargoMesh('parcel');
      g.visible = false;
      scene.add(g);
      this.debris.push({ obj: g, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, groundY: 0, bounced: 0, active: false });
    }
  }

  setTruck(kind: VehicleKind, paint: PaintDef, accessories: string[]): void {
    if (this.model) {
      this.group.remove(this.model.root);
      this.model.dispose();
    }
    this.kind = kind;
    this.model = buildTruck(kind, paint, accessories);
    this.group.add(this.model.root);
    this.clearItems();
  }

  get vehicle(): VehicleKind {
    return this.kind;
  }

  clearItems(): void {
    for (const g of this.items.values()) {
      g.parent?.remove(g);
      this.pool.push(g);
    }
    this.items.clear();
  }

  private acquire(shape: CargoShape): THREE.Group {
    const g = this.pool.pop() ?? makeCargoMesh(shape);
    setCargoShape(g, shape);
    g.scale.set(1, 1, 1);
    g.rotation.set(0, 0, 0);
    return g;
  }

  /**
   * Pose the truck. pos/yaw are in render space. Cargo uses the sim stack state directly.
   */
  update(dt: number, tr: TruckSim, pos: THREE.Vector3, yaw: number, pitch: number, time: number, reducedMotion: boolean): void {
    const m = this.model;
    if (!m) return;
    m.root.position.copy(pos);
    m.root.rotation.set(0, yaw, 0);
    m.body.position.y = -tr.susp * 0.5;
    const rollVis = -tr.roll * this.visualRollGain;
    m.body.rotation.set(pitch, 0, rollVis);
    m.wheelSpin += (tr.vs * dt) / m.anchors.wheelR;
    for (const w of m.wheels) w.rotation.x = -m.wheelSpin;
    // wheel lift: raise wheels on the light side with the body
    const lift = Math.max(0, Math.abs(tr.tip) - 0.72) * 0.5;
    for (const w of m.wheels) {
      const side = Math.sign(w.position.x);
      const up = side === Math.sign(tr.tip) || tr.tip === 0 ? 0 : lift;
      w.position.y = m.anchors.wheelR + (tr.airborne ? -0.08 : 0) + up * 0.6;
    }
    if (m.beacon) m.beacon.rotation.y = time * 6;
    if (m.flag) m.flag.rotation.y = Math.sin(time * 9) * 0.25 - 0.2;
    // cargo
    const seen = new Set<number>();
    let topY = 0;
    let topRatio = 0;
    for (let ci = 0; ci < tr.columns.length; ci++) {
      const col = tr.columns[ci];
      const cz = m.anchors.columnsZ[ci] ?? 0;
      for (let i = 0; i < col.items.length; i++) {
        const it = col.items[i];
        seen.add(it.uid);
        let g = this.items.get(it.uid);
        if (!g) {
          g = this.acquire(it.def.id);
          m.cargoAnchor.add(g);
          this.items.set(it.uid, g);
        }
        this.poseItem(g, it, cz, time, reducedMotion);
        const top = it.z + itemHeight(it);
        if (top > topY) topY = top;
        topRatio = Math.max(topRatio, it.ratio);
      }
    }
    for (const [uid, g] of this.items) {
      if (!seen.has(uid)) {
        g.parent?.remove(g);
        this.pool.push(g);
        this.items.delete(uid);
      }
    }
    // shadow blob under the truck
    this.blob.position.set(pos.x, pos.y - tr.y + 0.025, pos.z);
    this.blob.rotation.z = yaw;
    const air = Math.min(1, tr.y / 3);
    this.blob.scale.set(m.anchors.width * 1.5 * (1 + air * 0.4), (Math.abs(m.anchors.frontZ) + m.anchors.rearZ) * 1.25, 1);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - air * 0.6);
    // warning marker over a wobbling stack
    const danger = Math.max(topRatio, Math.abs(tr.tip) / 1.0);
    this.warn.visible = danger > 0.72 && tr.itemCount > 0;
    if (this.warn.visible) {
      const anchor = new THREE.Vector3(0, m.anchors.bedY + topY + 0.8, m.anchors.bedZ);
      m.body.localToWorld(anchor);
      this.warn.position.copy(anchor);
      const pulse = 0.85 + Math.sin(time * 18) * 0.15;
      this.warn.scale.set(pulse, pulse, 1);
    }
  }

  private poseItem(g: THREE.Group, it: StackItem, cz: number, time: number, reduced: boolean): void {
    const h = itemHeight(it);
    const drop = (1 - it.settle) * (1 - it.settle) * 2.2;
    const jitter = it.ratio > 0.75 && !reduced ? Math.sin(time * 45 + it.uid) * 0.015 * (it.ratio - 0.75) * 4 : 0;
    const tilt = -Math.atan((it.o * SLIDE_GAIN) / Math.max(0.3, h)) * TILT_GAIN;
    g.position.set(it.X * SLIDE_GAIN + jitter, it.z + it.bz * 0.25 + drop, cz);
    g.rotation.set(0, (it.uid % 5) * 0.06 - 0.12, tilt);
    if (it.squished) g.scale.set(1.08, 0.72, 1.08);
    else g.scale.set(1, 1, 1);
  }

  /** Start falling cargo from the truck. `fwd`/`right` are render-space unit vectors. */
  spawnDebris(d: DetachedItem, truckPos: THREE.Vector3, yaw: number, speed: number, groundY: number, reason: string): void {
    let slot = this.debris.find((x) => !x.active);
    if (!slot) slot = this.debris.reduce((a, b) => (a.life < b.life ? a : b));
    const g = slot.obj;
    setCargoShape(g, d.item.def.id);
    g.visible = true;
    g.scale.set(1, d.item.squished ? 0.72 : 1, 1);
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const lat = d.item.X * SLIDE_GAIN;
    const m = this.model;
    const bedZ = m ? m.anchors.bedZ : 0.9;
    g.position.copy(truckPos).addScaledVector(right, lat).addScaledVector(fwd, -bedZ);
    g.position.y = truckPos.y + d.y - d.item.def.height * 0.5;
    g.rotation.set(0, yaw, 0);
    const shed = reason === 'shed';
    const fling = shed ? 0.55 : reason === 'overhead' || reason === 'hook' ? 0.35 : 0.75;
    slot.vel.copy(fwd).multiplyScalar(speed * fling);
    slot.vel.addScaledVector(right, (d.vx - 0) * 0.3 + (shed ? Math.sign(d.item.X || 1) * 2.5 : 0));
    slot.vel.y = shed ? 3.5 : reason === 'crash' ? 4 + Math.random() * 3 : 2.2;
    slot.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8 + Math.sign(d.item.X) * 3);
    slot.life = 2.6;
    slot.groundY = groundY;
    slot.bounced = 0;
    slot.active = true;
  }

  updateDebris(dt: number, groundAt: (x: number, z: number) => number, onImpact: (p: THREE.Vector3, strength: number) => void): void {
    for (const d of this.debris) {
      if (!d.active) continue;
      d.life -= dt;
      d.vel.y -= 9.81 * dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.y += d.spin.y * dt;
      d.obj.rotation.z += d.spin.z * dt;
      const gy = groundAt(d.obj.position.x, d.obj.position.z);
      if (d.obj.position.y < gy && d.vel.y < 0 && d.bounced < 2 && gy > -50) {
        d.obj.position.y = gy;
        const strength = -d.vel.y;
        d.vel.y = -d.vel.y * 0.35;
        d.vel.x *= 0.55;
        d.vel.z *= 0.55;
        d.spin.multiplyScalar(0.5);
        d.bounced++;
        if (strength > 2) onImpact(d.obj.position, strength);
      }
      if (d.life < 0.5) d.obj.scale.multiplyScalar(Math.max(0, 1 - dt * 6));
      if (d.life <= 0) {
        d.active = false;
        d.obj.visible = false;
      }
    }
  }

  activeDebris(): number {
    return this.debris.filter((d) => d.active).length;
  }

  shift(dx: number, dz: number): void {
    for (const d of this.debris) {
      if (!d.active) continue;
      d.obj.position.x -= dx;
      d.obj.position.z -= dz;
    }
  }

  clearDebris(): void {
    for (const d of this.debris) {
      d.active = false;
      d.obj.visible = false;
    }
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
    this.blob.visible = v;
    if (!v) this.warn.visible = false;
  }
}

function warnTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#24304a';
  g.beginPath(); g.moveTo(64, 6); g.lineTo(124, 116); g.lineTo(4, 116); g.closePath(); g.fill();
  g.fillStyle = '#ffc93c';
  g.beginPath(); g.moveTo(64, 22); g.lineTo(110, 106); g.lineTo(18, 106); g.closePath(); g.fill();
  g.fillStyle = '#24304a';
  g.font = '900 64px Fredoka, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 64, 76);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { MAT };
