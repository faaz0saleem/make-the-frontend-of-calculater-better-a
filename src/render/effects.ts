import * as THREE from 'three';
import { TEX } from './materials';

/**
 * Pooled particle system (one draw call). Particles: dust, sparks, confetti, sparkles, splashes.
 * Capacity is capped per quality preset; new particles overwrite the oldest.
 */
const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
uniform float uMaxPx;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = -mv.z;
  // Fade out anything that drifts right up to the lens (exhaust and dust left behind by the truck
  // fly back past the chase camera) and cap the on-screen size, so no particle can ever become a
  // translucent sheet over the truck or the screen.
  vAlpha = aAlpha * smoothstep(2.0, 5.0, depth);
  vColor = aColor;
  gl_PointSize = min(aSize * uScale / max(0.1, depth), uMaxPx);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  if (t.a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  // same output transform as the lit scene: without it, presets that draw straight to the screen
  // (Low/Medium) showed every particle in raw linear colour, i.e. muddy dark dust and grey smoke
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** `exhaust` and `trail` are the subtle continuous wisps (tailpipe, wheel dust); the rest are event bursts. */
export type ParticleKind = 'dust' | 'spark' | 'confetti' | 'sparkle' | 'splash' | 'smoke' | 'exhaust' | 'trail';

export class Particles {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grow: Float32Array;
  private grav: Float32Array;
  /** per-particle opacity ceiling (wisps stay faint, bursts can be solid) */
  private amax: Float32Array;
  private next = 0;
  private geo: THREE.BufferGeometry;
  enabled = true;
  scale = 1;

  constructor(capacity: number) {
    this.n = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.amax = new Float32Array(capacity);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      uniforms: { uMap: { value: TEX.dot }, uScale: { value: 400 }, uMaxPx: { value: 200 } },
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setViewport(heightPx: number): void {
    const u = (this.points.material as THREE.ShaderMaterial).uniforms;
    u.uScale.value = heightPx * 0.9;
    // a single particle never covers more than about a fifth of the screen height
    u.uMaxPx.value = Math.max(24, heightPx * 0.22);
  }

  get capacity(): number {
    return this.n;
  }

  active(): number {
    let a = 0;
    for (let i = 0; i < this.n; i++) if (this.life[i] > 0) a++;
    return a;
  }

  emit(kind: ParticleKind, x: number, y: number, z: number, count: number, opts: { color?: number; spread?: number; vx?: number; vy?: number; vz?: number } = {}): void {
    if (!this.enabled) return;
    const c = new THREE.Color();
    const n = Math.max(1, Math.round(count * this.scale));
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const sp = opts.spread ?? 1;
      const r = () => (Math.random() - 0.5) * 2;
      this.pos[i * 3] = x + r() * 0.3 * sp;
      this.pos[i * 3 + 1] = y + Math.random() * 0.2;
      this.pos[i * 3 + 2] = z + r() * 0.3 * sp;
      let vx = (opts.vx ?? 0), vy = (opts.vy ?? 0), vz = (opts.vz ?? 0);
      let life = 1, size = 0.5, grow = 0, grav = 0, amax = 0.85;
      switch (kind) {
        case 'dust':
          c.setHex(opts.color ?? 0xd9b48a);
          vx += r() * 1.2 * sp; vy += Math.random() * 1.2; vz += r() * 1.2 * sp;
          life = 0.6 + Math.random() * 0.4; size = 0.35 + Math.random() * 0.3; grow = 0.9; grav = -0.3;
          break;
        case 'smoke':
          c.setHex(opts.color ?? 0x9aa0aa);
          vx += r() * 0.6; vy += 0.8 + Math.random(); vz += r() * 0.6;
          life = 1.2 + Math.random() * 0.6; size = 0.9; grow = 1.6; grav = -0.6;
          break;
        case 'exhaust':
          // a faint, small, quickly gone puff: reads as a running engine, never as a cloud
          c.setHex(opts.color ?? 0xd6dae2);
          vx += r() * 0.25; vy += 0.35 + Math.random() * 0.3; vz += r() * 0.25;
          life = 0.28 + Math.random() * 0.14; size = 0.12 + Math.random() * 0.05; grow = 0.5; grav = -0.4; amax = 0.3;
          break;
        case 'trail':
          // low wheel dust left on the road behind the truck
          c.setHex(opts.color ?? 0xd9b48a);
          vx += r() * 0.5; vy += 0.2 + Math.random() * 0.4; vz += r() * 0.5;
          life = 0.38 + Math.random() * 0.2; size = 0.22 + Math.random() * 0.12; grow = 0.6; grav = -0.1; amax = 0.38;
          break;
        case 'spark':
          c.setHex(opts.color ?? 0xffd36b);
          vx += r() * 4 * sp; vy += 1.5 + Math.random() * 3; vz += r() * 4 * sp;
          life = 0.25 + Math.random() * 0.3; size = 0.18 + Math.random() * 0.1; grav = 9;
          break;
        case 'confetti': {
          const pal = [0xff5a4e, 0xffc93c, 0x3cc9a7, 0x6cb4ee, 0xff8cc6, 0x9adf3c];
          c.setHex(pal[Math.floor(Math.random() * pal.length)]);
          vx += r() * 4 * sp; vy += 4 + Math.random() * 4; vz += r() * 4 * sp;
          life = 1.4 + Math.random() * 0.8; size = 0.22 + Math.random() * 0.12; grav = 5;
          break;
        }
        case 'sparkle':
          c.setHex(opts.color ?? 0xfff0a0);
          vx += r() * 1.5; vy += 1 + Math.random() * 1.5; vz += r() * 1.5;
          life = 0.45 + Math.random() * 0.3; size = 0.3; grow = -0.5; grav = 1;
          break;
        case 'splash':
          c.setHex(opts.color ?? 0xbfe6ff);
          vx += r() * 2.5; vy += 2 + Math.random() * 3; vz += r() * 2.5;
          life = 0.5 + Math.random() * 0.4; size = 0.35; grav = 9;
          break;
      }
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.size[i] = size;
      this.alpha[i] = 1;
      this.life[i] = life;
      this.maxLife[i] = life;
      this.grow[i] = grow;
      this.grav[i] = grav;
      this.amax[i] = amax;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-1.6 * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = Math.max(0.02, this.size[i] + this.grow[i] * dt);
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.max(0, Math.min(this.amax[i], t * 1.4));
    }
    const g = this.geo;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Shift all particles (render-origin rebasing). */
  shift(dx: number, dz: number): void {
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] -= dx;
      this.pos[i * 3 + 2] -= dz;
    }
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** Wind streaks and rain drawn as pooled line segments around the camera. */
export class Streaks {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private n: number;
  private seeds: Float32Array;
  private mat: THREE.LineBasicMaterial;
  windStrength = 0;
  windDir = 1;
  rain = 0;

  constructor(n = 90) {
    this.n = n;
    this.pos = new Float32Array(n * 6);
    this.seeds = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) this.seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
  }

  update(t: number, center: THREE.Vector3, heading: number, rightX: number, rightZ: number, reduced: boolean): void {
    const wind = this.windStrength;
    const rain = this.rain;
    const target = Math.max(Math.min(0.5, wind * 0.15), rain * 0.35) * (reduced ? 0.5 : 1);
    this.mat.opacity += (target - this.mat.opacity) * 0.08;
    this.lines.visible = this.mat.opacity > 0.01;
    if (!this.lines.visible) return;
    const fx = Math.sin(heading), fz = -Math.cos(heading);
    const p = this.pos;
    for (let i = 0; i < this.n; i++) {
      const s = this.seeds;
      const along = (s[i * 4] - 0.3) * 45;
      const isRain = rain > wind * 0.2 && i % 2 === 0;
      let lat = (s[i * 4 + 1] - 0.5) * 26;
      let y = 0.4 + s[i * 4 + 2] * 7;
      const speed = 0.4 + s[i * 4 + 3];
      if (isRain) {
        y = 10 - ((t * 14 * speed + s[i * 4 + 2] * 10) % 10);
      } else {
        lat = (((s[i * 4 + 1] + t * speed * 0.35 * this.windDir) % 1) + 1) % 1;
        lat = (lat - 0.5) * 28;
      }
      const x = center.x + fx * along + rightX * lat;
      const z = center.z + fz * along + rightZ * lat;
      const yy = center.y + y;
      p[i * 6] = x; p[i * 6 + 1] = yy; p[i * 6 + 2] = z;
      if (isRain) {
        p[i * 6 + 3] = x; p[i * 6 + 4] = yy - 0.7; p[i * 6 + 5] = z;
      } else {
        const len = 1.2 + speed * 1.4;
        p[i * 6 + 3] = x - rightX * len * this.windDir; p[i * 6 + 4] = yy; p[i * 6 + 5] = z - rightZ * len * this.windDir;
      }
    }
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
