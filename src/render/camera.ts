import * as THREE from 'three';
import { TUNING as T } from '../data/tuning';

/** Low follow camera that frames the whole stack and the road ahead. */
export class FollowCamera {
  readonly cam: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private shakeAmt = 0;
  private shakeT = 0;
  private stackH = 0;
  private initialized = false;
  shakeScale = 1;
  reducedMotion = false;
  aspect = 16 / 9;

  constructor() {
    this.cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 1200);
  }

  setAspect(a: number): void {
    this.aspect = a;
    this.cam.aspect = a;
    // Portrait screens: wider vertical FOV so the road ahead stays visible.
    this.cam.fov = a < 1 ? 74 : a < 1.4 ? 66 : 58;
    this.cam.updateProjectionMatrix();
  }

  shake(amount: number): void {
    if (this.reducedMotion) amount *= 0.25;
    this.shakeAmt = Math.min(1.2, this.shakeAmt + amount * this.shakeScale);
  }

  reset(): void {
    this.initialized = false;
  }

  /**
   * truckPos: render-space truck position. fwd/right: road-aligned unit vectors.
   * stackTop: stack height above the bed (m). speed in m/s.
   */
  update(dt: number, truckPos: THREE.Vector3, fwd: THREE.Vector3, right: THREE.Vector3, lat: number, stackTop: number, speed: number, mode: 'drive' | 'crash' | 'finish' | 'orbit', time: number, ceiling = Infinity): void {
    this.stackH += (stackTop - this.stackH) * (1 - Math.exp(-2.2 * dt));
    const portrait = this.aspect < 1;
    const k = portrait ? 1.28 : 1;
    let dist = (T.camBaseDist + this.stackH * 0.85 + Math.max(0, speed - 14) * 0.12) * k;
    let height = T.camBaseHeight + this.stackH * 0.62;
    let ahead = T.camLookAhead + speed * 0.25;
    const lookUp = 0.9 + this.stackH * 0.42;
    const desired = new THREE.Vector3();
    const target = new THREE.Vector3();
    if (mode === 'orbit') {
      // Sweep in front of the truck but stay inside the street corridor (never inside buildings).
      const a = Math.sin(time * 0.16) * 1.1;
      desired.copy(truckPos).addScaledVector(right, Math.sin(a) * 3.6).addScaledVector(fwd, Math.cos(a) * 10.5);
      desired.y += 3.0 + this.stackH * 0.4;
      // look slightly below the truck so it sits in the upper half, clear of menu panels
      target.copy(truckPos);
      target.y += -0.9 + this.stackH * 0.3;
    } else {
      if (mode === 'crash') {
        dist *= 1.35;
        height *= 1.25;
        ahead = 2;
      } else if (mode === 'finish') {
        dist *= 1.1;
        ahead = 4;
      }
      desired.copy(truckPos).addScaledVector(fwd, -dist).addScaledVector(right, -lat * 0.25);
      desired.y += height;
      target.copy(truckPos).addScaledVector(fwd, ahead).addScaledVector(right, -lat * 0.15);
      target.y += lookUp;
    }
    // Never let the camera pass through low structures (beams, tunnels, the finish arch).
    if (desired.y > truckPos.y + ceiling) desired.y = truckPos.y + ceiling;
    if (!this.initialized) {
      this.pos.copy(desired);
      this.look.copy(target);
      this.initialized = true;
    } else {
      const kp = 1 - Math.exp(-(mode === 'drive' ? 7 : 2.5) * dt);
      const kl = 1 - Math.exp(-(mode === 'drive' ? 10 : 3) * dt);
      this.pos.lerp(desired, kp);
      this.look.lerp(target, kl);
    }
    if (this.pos.y > truckPos.y + ceiling) this.pos.y = truckPos.y + ceiling;
    this.cam.position.copy(this.pos);
    if (this.shakeAmt > 0.001) {
      this.shakeT += dt * 38;
      const s = this.shakeAmt * 0.18;
      this.cam.position.x += Math.sin(this.shakeT * 1.3) * s;
      this.cam.position.y += Math.sin(this.shakeT * 1.7 + 1) * s * 0.7;
      this.cam.position.z += Math.cos(this.shakeT * 1.1) * s;
      this.shakeAmt *= Math.exp(-5.5 * dt);
    }
    this.cam.lookAt(this.look);
  }
}
