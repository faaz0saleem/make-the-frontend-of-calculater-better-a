import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { WorldId } from '../sim/types';
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
#ifdef SKY_DETAIL
uniform vec3 uDisc;
uniform vec3 uShadowDir;
uniform vec2 uSunFlat;
uniform float uHaze;
#endif
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
  col = mix(col, uTop, smoothstep(0.18, 0.75, h));
#ifdef SKY_DETAIL
  vec3 d = normalize(vDir);
  float sd = max(0.0, dot(d, uSunDir));
  // crisp disc; at night a second, offset disc carves the crescent (uDisc.z = how dark)
  float disc = smoothstep(uDisc.x, uDisc.y, sd) * (1.0 - smoothstep(uDisc.x, uDisc.y, dot(d, uShadowDir)) * uDisc.z);
  col += uSunColor * (disc * 1.5 + pow(sd, 260.0) * 0.2 + pow(sd, 18.0) * 0.18);
  // the low sky brightens on the sun's side, whatever the sun's height
  float az = max(0.0, dot(normalize(d.xz + vec2(1e-4)), uSunFlat));
  col += uSunColor * (uHaze * az * az * (1.0 - smoothstep(0.0, 0.42, h)));
#else
  float sd = max(0.0, dot(normalize(vDir), normalize(uSunDir)));
  col += uSunColor * (pow(sd, 900.0 / uSunSize) * 1.6 + pow(sd, 18.0) * 0.18);
#endif
  gl_FragColor = vec4(col, 1.0);
}`;

/** Gradient sky dome + distant layered silhouettes + optional stars/moon. Follows the camera. */
export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private ring: THREE.Mesh;
  private ring2: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  /** Silhouettes are drawn once per world; only the active pair is kept on the GPU. */
  private cache = new Map<WorldId, [THREE.CanvasTexture, THREE.CanvasTexture]>();
  private stars = new Map<WorldId, THREE.Points>();

  constructor() {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uSunSize: { value: 1 },
        uDisc: { value: new THREE.Vector3(1, 1, 0) }, uShadowDir: { value: new THREE.Vector3(0, -1, 0) },
        uSunFlat: { value: new THREE.Vector2(1, 0) }, uHaze: { value: 0 },
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

  /** Medium/High: crescent moon and sun-side haze. Low keeps the original shader. */
  setDetail(on: boolean): void {
    if (('SKY_DETAIL' in this.skyMat.defines) === on) return;
    if (on) this.skyMat.defines.SKY_DETAIL = 1;
    else delete this.skyMat.defines.SKY_DETAIL;
    this.skyMat.needsUpdate = true;
  }

  setTheme(t: Theme): void {
    const u = this.skyMat.uniforms;
    (u.uTop.value as THREE.Color).setHex(t.skyTop);
    (u.uMid.value as THREE.Color).setHex(t.skyMid);
    (u.uHorizon.value as THREE.Color).setHex(t.skyHorizon);
    // The night key light is steep; the visible moon sits low on the same bearing so it actually gets on screen.
    const dir = (u.uSunDir.value as THREE.Vector3).set(...t.sunDir).normalize();
    if (t.night) lowerTo(dir, 0.3);
    (u.uSunColor.value as THREE.Color).setHex(t.night ? 0xdfe6ff : 0xfff2d0);
    u.uSunSize.value = t.night ? 0.6 : 1.4;
    const r = t.night ? 0.036 : 0.028;
    (u.uDisc.value as THREE.Vector3).set(Math.cos(r + 0.005), Math.cos(r), t.night ? 0.88 : 0);
    // offset up and sideways, so the lit crescent faces the sun below the horizon
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
    (u.uShadowDir.value as THREE.Vector3).copy(dir).addScaledVector(up, r * 0.62).addScaledVector(side, r * 0.4).normalize();
    (u.uSunFlat.value as THREE.Vector2).set(dir.x, dir.z).normalize();
    u.uHaze.value = t.night ? 0.05 : 0.12;
    let maps = this.cache.get(t.id);
    if (!maps) {
      maps = [silhouette(t, 0), silhouette(t, 1)];
      this.cache.set(t.id, maps);
    }
    const m1 = this.ring.material as THREE.MeshBasicMaterial;
    const m2 = this.ring2.material as THREE.MeshBasicMaterial;
    if (m1.map !== maps[0]) {
      // frees the old world's GPU copies; their canvases stay cached and re-upload on the way back
      m1.map?.dispose();
      m2.map?.dispose();
      if (!m1.map) m1.needsUpdate = m2.needsUpdate = true;
      m1.map = maps[0];
      m2.map = maps[1];
    }
    for (const s of this.stars.values()) s.visible = false;
    if (t.starCount > 0) {
      let s = this.stars.get(t.id);
      if (!s) {
        s = starField(t.starCount, dir);
        this.stars.set(t.id, s);
        this.group.add(s);
      }
      s.visible = true;
    }
  }

  follow(cam: THREE.Camera): void {
    this.group.position.set(cam.position.x, 0, cam.position.z);
  }
}

/** Keeps the bearing of `dir` and sets its elevation to `elev` radians. */
function lowerTo(dir: THREE.Vector3, elev: number): void {
  const flat = Math.hypot(dir.x, dir.z) || 1;
  dir.set((dir.x / flat) * Math.cos(elev), Math.sin(elev), (dir.z / flat) * Math.cos(elev));
}

function starField(count: number, moon: THREE.Vector3): THREE.Points {
  const rng = new Rng('stars');
  const pos: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const th = rng.range(0, Math.PI * 2), ph = rng.range(0.12, 1.3);
    v.set(Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph));
    if (v.dot(moon) > 0.994) continue; // none in front of the moon
    pos.push(v.x * 850, v.y * 850, v.z * 850);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
  stars.renderOrder = -9;
  return stars;
}

const col = (hex: number, a = 1) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
const blend = (a: number, b: number, k: number) => {
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k);
  const gg = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k);
  const bb = Math.round((a & 255) * (1 - k) + (b & 255) * k);
  return (r << 16) | (gg << 8) | bb;
};
const smooth = (k: number) => {
  const x = Math.max(0, Math.min(1, k));
  return x * x * (3 - 2 * x);
};

/** Procedural distant silhouettes per world (layer 0 = far, 1 = nearer). */
function silhouette(t: Theme, layer: number): THREE.CanvasTexture {
  const W = 2048, H = 256;
  const tex = canvasTexture(W, H, (g) => {
    const rng = new Rng(`sil-${t.id}-${layer}`);
    // Extras use their own stream so the original shapes keep their seeded positions.
    const fx = new Rng(`sil-${t.id}-${layer}-fx`);
    g.clearRect(0, 0, W, H);
    const base = H * 0.78;
    if (t.id === 1) {
      // rolling hills + town roofs + lighthouse
      const c = layer === 0 ? blend(0x7fb6a2, t.skyHorizon, 0.55) : blend(0x5f9e8a, t.skyHorizon, 0.3);
      const hill = (x: number) => Math.sin(x * 0.004 + layer * 2) * 26 + Math.sin(x * 0.013) * 10;
      g.fillStyle = col(c);
      g.beginPath();
      g.moveTo(0, H);
      // the last stretch eases into the start so the repeat seam has no step
      for (let x = 0; x <= W; x += 16) g.lineTo(x, base - 30 - hill(x) - (hill(x - W) - hill(x)) * smooth((x - W + 320) / 320));
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
        harborShore(g, t, fx, base);
      } else harborClouds(g, t, fx);
    } else if (t.id === 2) {
      const c = layer === 0 ? blend(0xd47a4a, t.skyHorizon, 0.55) : blend(0xb85a33, t.skyHorizon, 0.25);
      const mesas: [number, number, number][] = [];
      g.fillStyle = col(c);
      g.beginPath();
      g.moveTo(0, H);
      let x = 0;
      while (x < W) {
        const w = rng.range(80, 220), h = rng.range(40, layer === 0 ? 150 : 110);
        const y = base - h;
        mesas.push([x, w, h]);
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
      canyonExtras(g, t, fx, base, layer, c, mesas);
    } else {
      // city skyline with lit windows
      const c = layer === 0 ? blend(0x2a2458, t.skyHorizon, 0.35) : 0x1a1a38;
      const towers: [number, number, number][] = [];
      for (let x = 0; x < W; x += rng.range(18, 50)) {
        const w = rng.range(24, 60), h = rng.range(30, layer === 0 ? 170 : 120);
        g.fillStyle = col(c);
        g.fillRect(x, base - h, w, h + 60);
        towers.push([x, w, h]);
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
      marketExtras(g, fx, base, layer, c, towers);
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

/** Soft ellipse (a squashed radial gradient), repeated across the wrap seam when it straddles it. */
function puff(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, hex: number, a: number, rot = 0): void {
  const W = g.canvas.width;
  for (const ox of [-W, 0, W]) {
    if (x + ox + rx < 0 || x + ox - rx > W) continue;
    g.save();
    g.translate(x + ox, y);
    g.rotate(rot);
    g.scale(rx, ry);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grd.addColorStop(0, col(hex, a));
    grd.addColorStop(0.55, col(hex, a * 0.75));
    grd.addColorStop(1, col(hex, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

/** Highest skyline (px above base) over [x0, x1] from recorded [x, w, h] blocks. */
function topAt(blocks: [number, number, number][], x0: number, x1: number): number {
  let m = 0;
  for (const [x, w, h] of blocks) if (x < x1 && x + w > x0) m = Math.max(m, h);
  return m;
}

/** Centre of the lowest stretch of skyline `half` px either side, away from `avoid`. */
function lowSpot(blocks: [number, number, number][], W: number, half: number, avoid: number[]): number {
  let best = W / 2, bestTop = Infinity;
  for (let x = 160; x < W - 160; x += 8) {
    if (avoid.some((a) => Math.abs(a - x) < 380)) continue;
    const top = topAt(blocks, x - half, x + half);
    if (top < bestTop) {
      bestTop = top;
      best = x;
    }
  }
  return best;
}

function ferrisWheel(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, ground: number, frame: number, cars: number[], lights: number | null): void {
  g.strokeStyle = col(frame);
  g.lineCap = 'round';
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(cx - r * 0.55, ground); g.lineTo(cx, cy); g.lineTo(cx + r * 0.55, ground);
  g.stroke();
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.stroke();
  g.beginPath(); g.arc(cx, cy, r * 0.86, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2.4;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.fillStyle = col(frame);
  g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    g.fillStyle = col(cars[i % cars.length]);
    g.fillRect(cx + Math.cos(a) * r - 2, cy + Math.sin(a) * r, 4, 4);
  }
  if (lights !== null) {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const lx = cx + Math.cos(a) * r, ly = cy + Math.sin(a) * r;
      puff(g, lx, ly, 4.5, 4.5, lights, 0.3);
      g.fillStyle = col(lights);
      g.beginPath(); g.arc(lx, ly, 1.3, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 12; i += 2) {
      const a = (i / 12) * Math.PI * 2;
      for (const k of [0.35, 0.6]) {
        g.fillStyle = col(0xff4fa3, 0.9);
        g.fillRect(cx + Math.cos(a) * r * k - 1, cy + Math.sin(a) * r * k - 1, 2, 2);
      }
    }
    puff(g, cx, cy, 7, 7, lights, 0.45);
  }
}

/** Harbor sky: low cumulus above the far hills. */
function harborClouds(g: CanvasRenderingContext2D, t: Theme, rng: Rng): void {
  const W = g.canvas.width;
  const white = blend(0xffffff, t.skyHorizon, 0.25), under = blend(0xd8e4ee, t.skyHorizon, 0.35);
  const n = rng.int(6, 8);
  for (let i = 0; i < n; i++) {
    const cw = rng.range(120, 260), cx = ((i + rng.range(0.2, 0.8)) * W) / n, cy = rng.range(84, 112);
    const a = rng.range(0.55, 0.8), k = rng.int(5, 7);
    puff(g, cx, cy, cw * 0.52, 8, under, a * 0.8);
    for (let j = 0; j < k; j++) {
      const s = j / (k - 1) - 0.5;
      const r = cw * (0.17 - Math.abs(s) * 0.12) + rng.range(-3, 6);
      puff(g, cx + s * cw * 0.78 + rng.range(-6, 6), cy - r * 0.5, r, r * 0.78, white, a);
    }
  }
}

/** Harbor waterfront: bay, sails, Ferris wheel and a suspension bridge in front of the town. */
function harborShore(g: CanvasRenderingContext2D, t: Theme, rng: Rng, base: number): void {
  const W = g.canvas.width, H = g.canvas.height, hz = t.skyHorizon;
  const shore = base - 22;
  g.fillStyle = col(blend(t.water, hz, 0.45));
  g.fillRect(0, shore, W, H - shore);
  g.fillStyle = col(blend(0xffffff, hz, 0.2), 0.45);
  g.fillRect(0, shore, W, 1.5);
  for (let i = 0; i < 46; i++) {
    g.fillStyle = col(0xffffff, rng.range(0.12, 0.3));
    g.fillRect(rng.range(0, W - 30), shore + rng.range(4, 21), rng.range(8, 30), 1);
  }
  // suspension bridge across the bay
  const bc = blend(0x3e6e8e, hz, 0.4);
  const bx = 1700, half = 66, deck = base - 30, top = base - 80;
  const ends = [bx - half * 2.3, bx + half * 2.3];
  g.fillStyle = col(bc);
  g.fillRect(ends[0], deck, ends[1] - ends[0], 3);
  for (const tx of [bx - half, bx + half]) {
    g.fillRect(tx - 4, top, 8, base - 8 - top);
    g.fillRect(tx - 6, top + 8, 12, 2.5);
    g.fillRect(tx - 6, deck - 16, 12, 2.5);
  }
  g.strokeStyle = col(bc);
  g.lineWidth = 1.6;
  const sag = (x0: number, y0: number, x2: number, y2: number, low: number) => {
    // quadratic whose midpoint is at `low`; x is linear in the curve parameter, so hangers can sample it
    const cy = 2 * low - (y0 + y2) / 2;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x2) / 2, cy, x2, y2); g.stroke();
    g.save();
    g.lineWidth = 0.8;
    g.globalAlpha = 0.7;
    g.beginPath();
    for (let x = Math.min(x0, x2) + 6; x < Math.max(x0, x2) - 3; x += 7) {
      const s = (x - x0) / (x2 - x0);
      const y = (1 - s) * (1 - s) * y0 + 2 * (1 - s) * s * cy + s * s * y2;
      if (deck - y > 2) { g.moveTo(x, y); g.lineTo(x, deck); }
    }
    g.stroke();
    g.restore();
  };
  sag(bx - half, top + 2, bx + half, top + 2, deck - 4);
  sag(ends[0], deck, bx - half, top + 2, deck - 14);
  sag(bx + half, top + 2, ends[1], deck, deck - 14);
  // Ferris wheel on the far quay
  const cars = t.buildings.slice(0, 5).map((b) => blend(b, hz, 0.3));
  ferrisWheel(g, 600, shore - 40, 34, shore, blend(0xff5a4e, hz, 0.4), cars, null);
  // sailing boats
  const n = rng.int(6, 10);
  for (let i = 0; i < n; i++) {
    const x = rng.range(30, W - 30), y = base - rng.range(2, 14), h = rng.range(8, 14);
    g.fillStyle = col(blend(0x2c4a7a, hz, 0.4));
    g.fillRect(x - h * 0.35, y, h * 0.85, 2);
    g.fillStyle = col(blend(0xfffbf2, hz, 0.12));
    g.beginPath(); g.moveTo(x, y - 1); g.lineTo(x, y - 1 - h); g.lineTo(x + h * 0.55, y - 1); g.fill();
    g.fillStyle = col(blend(0xe8e2d6, hz, 0.2));
    g.beginPath(); g.moveTo(x - 1, y - 1 - h * 0.8); g.lineTo(x - 1, y - 1); g.lineTo(x - h * 0.38, y - 1); g.fill();
  }
}

/** Canyon: rock strata, cirrus, a natural arch, a water tower and hot-air balloons. */
function canyonExtras(g: CanvasRenderingContext2D, t: Theme, rng: Rng, base: number, layer: number, c: number, mesas: [number, number, number][]): void {
  const W = g.canvas.width, hz = t.skyHorizon;
  const ground = base - 10;
  if (layer === 1) {
    // natural arch over the gap nearest the target: a rock fin with its opening cut out
    let gap: [number, number] = [740, 810];
    let bestD = Infinity;
    for (let i = 0; i + 1 < mesas.length; i++) {
      const a = mesas[i][0] + mesas[i][1], b = mesas[i + 1][0];
      const d = Math.abs((a + b) / 2 - 820);
      if (b - a >= 40 && b - a <= 90 && d < bestD) {
        bestD = d;
        gap = [a, b];
      }
    }
    const l = gap[0] - 22, r = gap[1] + 22, ax = (gap[0] + gap[1]) / 2, rx = (gap[1] - gap[0]) / 2 - 2, open = 50, top = ground - open - 20;
    g.fillStyle = col(c);
    g.beginPath();
    g.moveTo(l, ground);
    g.lineTo(l + 6, top + 16);
    g.quadraticCurveTo(l + 10, top + 1, l + 28, top + 2);
    g.lineTo(r - 30, top - 3);
    g.quadraticCurveTo(r - 8, top, r - 5, top + 18);
    g.lineTo(r, ground);
    g.fill();
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse(ax, ground, rx, open, 0, Math.PI, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = col(0x8a3e22, 0.35);
    g.lineWidth = 3;
    g.beginPath(); g.ellipse(ax, ground, rx + 1, open + 1, 0, Math.PI, Math.PI * 2); g.stroke();
    g.restore();
  }
  // horizontal strata, painted only where rock already is
  g.save();
  g.globalCompositeOperation = 'source-atop';
  const step = layer === 0 ? 30 : 24;
  for (let k = 0; k < 6; k++) {
    const y = base - 22 - k * step - (k % 2) * 5, th = 4 + (k % 3) * 2;
    g.fillStyle = col(0x8a3e22, layer === 0 ? 0.12 : 0.16);
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= W; x += 32) g.lineTo(x, y + Math.sin((x / W) * Math.PI * 14 + k) * 1.5);
    g.lineTo(W, y + th);
    g.lineTo(0, y + th);
    g.fill();
    g.fillStyle = col(0xffe2b8, layer === 0 ? 0.08 : 0.12);
    g.fillRect(0, y - 2, W, 1.5);
  }
  g.restore();
  if (layer === 0) {
    // wispy cirrus, tucked behind the mesas
    g.save();
    g.globalCompositeOperation = 'destination-over';
    const white = blend(0xffffff, hz, 0.2);
    const n = rng.int(4, 6);
    for (let i = 0; i < n; i++) {
      const cx = ((i + rng.range(0.2, 0.8)) * W) / n, cy = rng.range(24, 72), len = rng.range(140, 260), tilt = rng.range(-0.05, 0.05);
      for (let j = 0; j < 3; j++) puff(g, cx + (j - 1) * len * 0.32 + rng.range(-12, 12), cy + rng.range(-3, 3), len * rng.range(0.3, 0.42), rng.range(2.5, 5), white, 0.3, tilt);
    }
    g.restore();
    return;
  }
  // water tower on stilts in front of a tall mesa
  let tx = 1500, best = Infinity;
  for (const [x, w, h] of mesas) {
    const d = Math.abs(x + w / 2 - 1500);
    if (h >= 75 && w >= 90 && d < best) {
      best = d;
      tx = x + w / 2;
    }
  }
  const legs = blend(0x5e3a24, hz, 0.3), tank = ground - 36;
  g.strokeStyle = col(legs);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(tx - 11, ground); g.lineTo(tx - 8, tank);
  g.moveTo(tx + 11, ground); g.lineTo(tx + 8, tank);
  g.moveTo(tx - 3, ground); g.lineTo(tx - 3, tank);
  g.moveTo(tx + 3, ground); g.lineTo(tx + 3, tank);
  g.stroke();
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(tx - 10.5, ground - 2); g.lineTo(tx + 9, tank + 17); g.moveTo(tx + 10.5, ground - 2); g.lineTo(tx - 9, tank + 17);
  g.moveTo(tx - 9, tank + 17); g.lineTo(tx + 8.5, tank + 1); g.moveTo(tx + 9, tank + 17); g.lineTo(tx - 8.5, tank + 1);
  g.stroke();
  g.fillStyle = col(blend(0xeadcc4, hz, 0.25));
  g.fillRect(tx - 13, tank - 15, 26, 13);
  g.beginPath(); g.ellipse(tx, tank - 2, 13, 2.5, 0, 0, Math.PI); g.fill();
  g.fillStyle = col(blend(0xb88a62, hz, 0.25));
  g.fillRect(tx - 13, tank - 7, 26, 2);
  g.fillStyle = col(blend(0x8c5a36, hz, 0.3));
  g.beginPath(); g.moveTo(tx - 15, tank - 16); g.lineTo(tx, tank - 25); g.lineTo(tx + 15, tank - 16); g.fill();
  // hot-air balloons drifting above the mesas
  const balloons: [number, number][] = [[0xd9534f, 0xfff0d8], [0xffc23a, 0xd9534f], [0x3a7ca5, 0xfff0d8]];
  for (let i = 0; i < 3; i++) {
    const x = ((i + rng.range(0.25, 0.75)) * W) / 3, y = rng.range(34, 78), r = rng.range(6, 9.5);
    balloon(g, x, y, r, blend(balloons[i][0], hz, 0.25), blend(balloons[i][1], hz, 0.25));
  }
}

function balloon(g: CanvasRenderingContext2D, x: number, y: number, r: number, body: number, stripe: number): void {
  g.save();
  g.beginPath();
  g.arc(x, y, r, Math.PI - 0.45, 0.45);
  g.lineTo(x + r * 0.28, y + r * 1.35);
  g.lineTo(x - r * 0.28, y + r * 1.35);
  g.closePath();
  g.fillStyle = col(body);
  g.fill();
  g.clip();
  g.fillStyle = col(stripe);
  g.beginPath(); g.ellipse(x, y + r * 0.2, r * 0.3, r * 1.3, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  g.strokeStyle = col(0x5e3a24, 0.8);
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(x - r * 0.26, y + r * 1.35); g.lineTo(x - r * 0.18, y + r * 1.7);
  g.moveTo(x + r * 0.26, y + r * 1.35); g.lineTo(x + r * 0.18, y + r * 1.7);
  g.stroke();
  g.fillStyle = col(0x7a4a2e);
  g.fillRect(x - r * 0.22, y + r * 1.7, r * 0.44, r * 0.34);
}

/** Midnight Market: aircraft lights and city glow (far); pagodas and a lit Ferris wheel (near). */
function marketExtras(g: CanvasRenderingContext2D, rng: Rng, base: number, layer: number, c: number, towers: [number, number, number][]): void {
  const W = g.canvas.width;
  if (layer === 0) {
    // antenna spires with red lights on the six tallest towers whose roofs are actually visible
    const picked: number[] = [];
    for (const [x, w, h] of [...towers].sort((a, b) => b[2] - a[2])) {
      const cx = Math.round(x + w / 2);
      if (picked.length >= 6) break;
      if (topAt(towers, cx - 1, cx + 1) > h + 0.5 || picked.some((p) => Math.abs(p - cx) < 60)) continue;
      picked.push(cx);
      g.fillStyle = col(c);
      g.fillRect(cx - 1, base - h - 20, 2, 20);
      g.fillRect(cx - 3, base - h - 7, 6, 7);
      puff(g, cx, base - h - 21, 6, 6, 0xff3b3b, 0.5);
      g.fillStyle = col(0xff5a5a);
      g.beginPath(); g.arc(cx, base - h - 21, 1.7, 0, Math.PI * 2); g.fill();
    }
    // light pollution behind the skyline
    g.save();
    g.globalCompositeOperation = 'destination-over';
    const glow = g.createLinearGradient(0, base, 0, 8);
    glow.addColorStop(0, col(0xff4fa3, 0.25));
    glow.addColorStop(0.45, col(0xff4fa3, 0.08));
    glow.addColorStop(1, col(0xff4fa3, 0));
    g.fillStyle = glow;
    g.fillRect(0, 8, W, base - 8);
    g.restore();
    return;
  }
  // lit Ferris wheel where the skyline dips lowest
  const wx = lowSpot(towers, W, 44, []);
  ferrisWheel(g, wx, base - 52, 38, base - 6, 0x3a3560, [0xff4fa3, 0x3ff2e0, 0xffc93c, 0x8a7dff], 0xffe8b0);
  // pagoda roofs rising out of the low blocks
  const spots = [wx];
  for (let i = 0; i < 2; i++) {
    const px = lowSpot(towers, W, 24, spots);
    spots.push(px);
    pagoda(g, px, base, Math.min(150, topAt(towers, px - 24, px + 24) + 44), c, rng);
  }
}

function pagoda(g: CanvasRenderingContext2D, cx: number, ground: number, height: number, c: number, rng: Rng): void {
  const n = Math.max(3, Math.min(5, Math.round((height - 12) / 24)));
  const th = (height - 12) / n;
  let hw = 22;
  for (let k = 0; k < n; k++) {
    const yb = ground - k * th, ey = yb - th * 0.55, rw = hw + 6;
    g.fillStyle = col(c);
    g.fillRect(cx - hw * 0.72, ey, hw * 1.44, yb - ey + 1);
    g.beginPath();
    g.moveTo(cx - rw, ey - 4);
    g.quadraticCurveTo(cx - rw * 0.55, ey + 1, cx, ey + 1);
    g.quadraticCurveTo(cx + rw * 0.55, ey + 1, cx + rw, ey - 4);
    g.quadraticCurveTo(cx + rw * 0.5, ey - th * 0.2, cx + hw * 0.45, ey - th * 0.45);
    g.lineTo(cx - hw * 0.45, ey - th * 0.45);
    g.quadraticCurveTo(cx - rw * 0.5, ey - th * 0.2, cx - rw, ey - 4);
    g.fill();
    // neon along the eaves
    g.strokeStyle = col(k % 2 ? 0xff4fa3 : 0xffc93c, 0.85);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx - rw, ey - 4);
    g.quadraticCurveTo(cx - rw * 0.55, ey + 1, cx, ey + 1);
    g.quadraticCurveTo(cx + rw * 0.55, ey + 1, cx + rw, ey - 4);
    g.stroke();
    for (let wx = cx - hw * 0.5; wx < cx + hw * 0.5; wx += 6) {
      if (rng.chance(0.6)) {
        g.fillStyle = col(0xffd890, 0.85);
        g.fillRect(wx, ey + 4, 2.5, 3.5);
      }
    }
    hw *= 0.84;
  }
  const top = ground - n * th;
  g.fillStyle = col(c);
  g.fillRect(cx - 0.8, top - 12, 1.6, 12);
  g.fillStyle = col(0xffc93c);
  g.beginPath(); g.arc(cx, top - 12, 1.6, 0, Math.PI * 2); g.fill();
}
