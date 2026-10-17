import * as THREE from 'three';
import type { PaintDef } from '../data/cosmetics';
import type { VehicleKind } from '../data/vehicles';
import { Kit } from './geo';
import { MAT, TEX } from './materials';
import { buildTruck, type TruckModel } from './models/truck';

/** Turntable scene for the garage (rendered instead of the world while open). */
export class GarageStage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private model: TruckModel | null = null;
  private turntable = new THREE.Group();
  private podium: THREE.Mesh;
  angle = -0.6;
  private spinVel = 0.35;
  private dragging = false;
  private key = '';
  private viewW = 1;
  private viewH = 1;
  /** Fraction of screen width the truck should be centred in (0.5 = centre). */
  centerX = 0.3;
  centerY = 0.5;

  constructor() {
    const sky = new THREE.SphereGeometry(40, 32, 16);
    const cols: number[] = [];
    const top = new THREE.Color(0x3a4f7a), bot = new THREE.Color(0xffd8a8);
    const p = sky.getAttribute('position');
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 40;
      c.copy(bot).lerp(top, Math.min(1, Math.max(0, y * 1.3 + 0.35)));
      cols.push(c.r, c.g, c.b);
    }
    sky.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.scene.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const k = new Kit();
    k.cyl(3.4, 3.6, 0.35, 0xfff6e6, 0, 0.17, 0, { seg: 40 });
    k.cyl(3.62, 3.62, 0.08, 0xff5a4e, 0, 0.3, 0, { seg: 40 });
    k.cyl(3.0, 3.0, 0.02, 0xffe8c8, 0, 0.36, 0, { seg: 40 });
    this.podium = new THREE.Mesh(k.build(), MAT.paintMatte);
    this.podium.receiveShadow = true;
    this.scene.add(this.podium);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshStandardMaterial({ color: 0xe8c9a0, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.37;
    blob.scale.set(3.4, 6, 1);
    this.turntable.add(blob);
    this.turntable.position.y = 0.36;
    this.scene.add(this.turntable);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0xc9a07a, 1.3));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.6);
    key.position.set(5, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc8ff, 1.2);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);
  }

  setEnvironment(env: THREE.Texture | null): void {
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.5;
  }

  show(kind: VehicleKind, paint: PaintDef, acc: string[]): void {
    const key = `${kind}|${paint.id}|${acc.join(',')}`;
    if (key === this.key) return;
    this.key = key;
    if (this.model) {
      this.turntable.remove(this.model.root);
      this.model.dispose();
    }
    this.model = buildTruck(kind, paint, acc);
    this.model.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.turntable.add(this.model.root);
    // pop animation
    this.model.root.scale.setScalar(0.85);
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.camera.aspect = w / h;
    const portrait = w < h;
    this.centerX = portrait ? 0.5 : 0.3;
    this.centerY = portrait ? 0.24 : 0.52;
    this.camera.fov = portrait ? 42 : 30;
    this.camera.setViewOffset(w, h, (0.5 - this.centerX) * w, (0.5 - this.centerY) * h, w, h);
    this.camera.updateProjectionMatrix();
  }

  drag(dx: number): void {
    this.angle += dx * 0.01;
    this.spinVel = dx * 0.6;
  }

  setDragging(v: boolean): void {
    this.dragging = v;
  }

  update(dt: number, reducedMotion: boolean): void {
    if (!this.dragging) {
      const target = reducedMotion ? 0 : 0.35;
      this.spinVel += (target - this.spinVel) * Math.min(1, dt * 1.5);
      this.angle += this.spinVel * dt;
    }
    this.turntable.rotation.y = this.angle;
    if (this.model) {
      const s = this.model.root.scale.x;
      this.model.root.scale.setScalar(s + (1 - s) * Math.min(1, dt * 8));
      this.model.wheelSpin += dt * 0.0;
    }
    const portrait = this.viewW < this.viewH;
    const dist = portrait ? 12.5 : 11.5;
    this.camera.position.set(0, 3.4, dist);
    this.camera.lookAt(0, 0.9, 0);
  }
}
