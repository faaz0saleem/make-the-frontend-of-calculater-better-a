import * as THREE from 'three';
import { Rng } from '../core/rng';
import { canvasTexture } from './materials';
import type { Theme } from './themes';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
  col = mix(col, uTop, smoothstep(0.18, 0.75, h));
  float sd = max(0.0, dot(normalize(vDir), normalize(uSunDir)));
  col += uSunColor * (pow(sd, 900.0 / uSunSize) * 1.6 + pow(sd, 18.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
}`;

/** Gradient sky dome + distant layered silhouettes + optional stars/moon. Follows the camera. */
export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private ring: THREE.Mesh;
  private ring2: THREE.Mesh;
  private stars: THREE.Points | null = null;
  private skyMat: THREE.ShaderMaterial;

  constructor() {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uSunSize: { value: 1 },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), this.skyMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
    const ringGeo = new THREE.CylinderGeometry(620, 620, 160, 48, 1, true);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.ring.position.y = 40;
    this.ring.renderOrder = -9;
    this.ring2 = new THREE.Mesh(new THREE.CylinderGeometry(480, 480, 120, 48, 1, true), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.ring2.position.y = 30;
    this.ring2.renderOrder = -8;
    this.group.add(this.ring, this.ring2);
  }

  setTheme(t: Theme): void {
    const u = this.skyMat.uniforms;
    (u.uTop.value as THREE.Color).setHex(t.skyTop);
    (u.uMid.value as THREE.Color).setHex(t.skyMid);
    (u.uHorizon.value as THREE.Color).setHex(t.skyHorizon);
    (u.uSunDir.value as THREE.Vector3).set(...t.sunDir).normalize();
    (u.uSunColor.value as THREE.Color).setHex(t.night ? 0xdfe6ff : 0xfff2d0);
    u.uSunSize.value = t.night ? 0.6 : 1.4;
    const far = silhouette(t, 0);
    const near = silhouette(t, 1);
    const m1 = this.ring.material as THREE.MeshBasicMaterial;
    const m2 = this.ring2.material as THREE.MeshBasicMaterial;
    m1.map?.dispose();
    m2.map?.dispose();
    m1.map = far;
    m2.map = near;
    m1.needsUpdate = m2.needsUpdate = true;
    if (this.stars) {
      this.group.remove(this.stars);
      this.stars.geometry.dispose();
      this.stars = null;
    }
    if (t.starCount > 0) {
      const rng = new Rng('stars');
      const pos = new Float32Array(t.starCount * 3);
      for (let i = 0; i < t.starCount; i++) {
        const th = rng.range(0, Math.PI * 2), ph = rng.range(0.12, 1.3);
        pos[i * 3] = Math.cos(th) * Math.cos(ph) * 850;
        pos[i * 3 + 1] = Math.sin(ph) * 850;
        pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * 850;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
      this.stars.renderOrder = -9;
      this.group.add(this.stars);
    }
  }

  follow(cam: THREE.Camera): void {
    this.group.position.set(cam.position.x, 0, cam.position.z);
  }
}

/** Procedural distant silhouettes per world (layer 0 = far, 1 = nearer). */
function silhouette(t: Theme, layer: number): THREE.CanvasTexture {
  const W = 2048, H = 256;
  const tex = canvasTexture(W, H, (g) => {
    const rng = new Rng(`sil-${t.id}-${layer}`);
    const col = (hex: number, a = 1) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
    const blend = (a: number, b: number, k: number) => {
      const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k);
      const gg = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k);
      const bb = Math.round((a & 255) * (1 - k) + (b & 255) * k);
      return (r << 16) | (gg << 8) | bb;
    };
    g.clearRect(0, 0, W, H);
    const base = H * 0.78;
    if (t.id === 1) {
      // rolling hills + town roofs + lighthouse
      const c = layer === 0 ? blend(0x7fb6a2, t.skyHorizon, 0.55) : blend(0x5f9e8a, t.skyHorizon, 0.3);
      g.fillStyle = col(c);
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) g.lineTo(x, base - 30 - Math.sin(x * 0.004 + layer * 2) * 26 - Math.sin(x * 0.013) * 10);
      g.lineTo(W, H);
      g.fill();
      if (layer === 1) {
        for (let x = 0; x < W; x += rng.range(30, 70)) {
          const h = rng.range(14, 40);
          g.fillStyle = col(blend(rng.pick(t.buildings), t.skyHorizon, 0.45));
          g.fillRect(x, base - 20 - h, rng.range(20, 40), h + 30);
          g.fillStyle = col(blend(rng.pick(t.roofs), t.skyHorizon, 0.4));
          g.beginPath(); g.moveTo(x - 3, base - 20 - h); g.lineTo(x + 15, base - 34 - h); g.lineTo(x + 40, base - 20 - h); g.fill();
        }
        g.fillStyle = col(blend(0xfff6e6, t.skyHorizon, 0.3));
        g.fillRect(1400, base - 130, 16, 110);
        g.fillStyle = col(blend(0xff5a4e, t.skyHorizon, 0.3));
        g.fillRect(1400, base - 100, 16, 18);
        g.fillRect(1400, base - 60, 16, 18);
      }
    } else if (t.id === 2) {
      const c = layer === 0 ? blend(0xd47a4a, t.skyHorizon, 0.55) : blend(0xb85a33, t.skyHorizon, 0.25);
      g.fillStyle = col(c);
      g.beginPath();
      g.moveTo(0, H);
      let x = 0;
      while (x < W) {
        const w = rng.range(80, 220), h = rng.range(40, layer === 0 ? 150 : 110);
        const y = base - h;
        g.lineTo(x, base - 10);
        g.lineTo(x + w * 0.12, y + 8);
        g.lineTo(x + w * 0.2, y);
        g.lineTo(x + w * 0.8, y);
        g.lineTo(x + w * 0.88, y + 8);
        g.lineTo(x + w, base - 10);
        x += w + rng.range(10, 80);
      }
      g.lineTo(W, H);
      g.fill();
    } else {
      // city skyline with lit windows
      const c = layer === 0 ? blend(0x2a2458, t.skyHorizon, 0.35) : 0x1a1a38;
      for (let x = 0; x < W; x += rng.range(18, 50)) {
        const w = rng.range(24, 60), h = rng.range(30, layer === 0 ? 170 : 120);
        g.fillStyle = col(c);
        g.fillRect(x, base - h, w, h + 60);
        if (layer === 1 || rng.chance(0.5)) {
          for (let wy = base - h + 6; wy < base; wy += 9) {
            for (let wx = x + 4; wx < x + w - 4; wx += 7) {
              if (rng.chance(0.28)) {
                g.fillStyle = col(rng.pick([0xffd890, 0xffc070, 0x9fd8ff, 0xff4fa3]), layer === 0 ? 0.5 : 0.85);
                g.fillRect(wx, wy, 3, 4);
              }
            }
          }
        }
      }
    }
    // fade the bottom into haze
    const grd = g.createLinearGradient(0, base - 20, 0, H);
    grd.addColorStop(0, col(t.fog, 0));
    grd.addColorStop(1, col(t.fog, 1));
    g.fillStyle = grd;
    g.fillRect(0, base - 20, W, H - base + 20);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}
