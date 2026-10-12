import * as THREE from 'three';
import { Kit, withLowDetail } from './geo';
import { MAT } from './materials';

/**
 * Moving roadside life: gulls and hawks, bobbing boats, tumbleweeds, hot-air balloons, windmill
 * rotors, sky lanterns and people. Purely visual (the simulation never sees any of it).
 *
 * One InstancedMesh per kind is shared by every chunk, so each kind costs at most one draw call
 * however many chunks are loaded, and none while it has no visible instance. Spawn points are
 * stored per chunk in that chunk's local render space, so render-origin and track rebasing need
 * no extra handling, and they disappear with their chunk.
 */
export type AmbientKind = 'bird' | 'boat' | 'tumble' | 'balloon' | 'rotor' | 'lantern' | 'person' | 'head';

export interface AmbientSpawn {
  kind: AmbientKind;
  /** chunk-local anchor */
  x: number;
  y: number;
  z: number;
  /** facing (rotation about Y) */
  ry: number;
  /** road forward direction (unit, XZ) at the anchor */
  fx: number;
  fz: number;
  ph: number;
  /** kind-specific parameters (radius, speed, run length, ...) */
  a: number;
  b: number;
  color: number;
  /** people: cheer harder (finish crowd) */
  crowd?: boolean;
}

export interface AmbientHost {
  group: THREE.Object3D;
  ambient: AmbientSpawn[];
}

/** Per-tier caps (tier 0 = Low, 1 = Medium, 2 = High) and the draw distance. */
const BUDGET: Record<0 | 1 | 2, { far: number; cap: Record<Exclude<AmbientKind, 'head'>, number> }> = {
  0: { far: 115, cap: { bird: 6, boat: 4, tumble: 4, balloon: 2, rotor: 4, lantern: 18, person: 12 } },
  1: { far: 150, cap: { bird: 14, boat: 8, tumble: 8, balloon: 4, rotor: 8, lantern: 40, person: 28 } },
  2: { far: 190, cap: { bird: 24, boat: 12, tumble: 12, balloon: 6, rotor: 10, lantern: 64, person: 48 } },
};

function buildGeo(kind: AmbientKind): THREE.BufferGeometry {
  const k = new Kit();
  switch (kind) {
    case 'bird': // gliding gull / hawk, nose along -Z; white parts take the instance tint
      k.sphere(0.18, 0xffffff, 0, 0, 0, { sz: 2.2, seg: 8 });
      k.sphere(0.11, 0xffffff, 0, 0.06, -0.38, { seg: 8 });
      k.cone(0.05, 0.16, 0xffb02e, 0, 0.05, -0.52, { rx: -Math.PI / 2, seg: 6 });
      k.box(0.62, 0.03, 0.24, 0xffffff, -0.34, 0.05, 0, { rz: 0.16 });
      k.box(0.62, 0.03, 0.24, 0xffffff, 0.34, 0.05, 0, { rz: -0.16 });
      k.box(0.22, 0.035, 0.2, 0x5b5f66, -0.72, 0.1, 0.02, { rz: 0.3 });
      k.box(0.22, 0.035, 0.2, 0x5b5f66, 0.72, 0.1, 0.02, { rz: -0.3 });
      k.box(0.22, 0.03, 0.18, 0xffffff, 0, 0.02, 0.42);
      break;
    case 'boat': // small fishing boat with cabin and mast, bow along -Z
      k.box(1.5, 0.55, 3.6, 0xffffff, 0, 0.1, 0, { r: 0.2 });
      k.box(1.56, 0.12, 3.66, 0x2b3a55, 0, 0.42, 0);
      k.box(0.9, 0.7, 1.1, 0xfff6e6, 0, 0.75, 0.5, { r: 0.08 });
      k.box(0.95, 0.08, 1.2, 0x2b3a55, 0, 1.12, 0.5);
      k.cyl(0.04, 0.05, 2.6, 0xdfe6ee, 0, 1.6, -0.5, { seg: 6 });
      k.shape([[0, 0], [0.9, 0.15], [0, 1.7]], 0.02, 0xfff6e6, 0.03, 0.6, -0.55, { ry: Math.PI / 2 });
      break;
    case 'tumble': {
      k.sphere(0.45, 0xb8945a, 0, 0, 0, { seg: 7 });
      for (let i = 0; i < 4; i++) k.box(0.95, 0.035, 0.035, 0x8a6a40, 0, 0, 0, { ry: (i * Math.PI) / 4, rz: (i % 2 ? 0.6 : -0.5) });
      break;
    }
    case 'balloon': // hot-air balloon: envelope (tinted white), basket, ropes
      k.sphere(2.3, 0xffffff, 0, 3.6, 0, { sy: 1.15, seg: 12 });
      k.cone(1.25, 1.4, 0xffffff, 0, 1.25, 0, { rx: Math.PI, seg: 12 });
      k.box(0.8, 0.6, 0.8, 0x8a5a36, 0, 0.0, 0, { r: 0.06 });
      for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) k.box(0.03, 1.1, 0.03, 0x5b4632, x, 0.85, z);
      break;
    case 'rotor': // windmill blades around the hub, spinning in the XY plane
      k.cyl(0.18, 0.18, 0.3, 0x5b5f66, 0, 0, 0, { rx: Math.PI / 2, seg: 8 });
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        k.box(0.22, 1.9, 0.04, 0xfff0d8, Math.sin(a) * 1.05, Math.cos(a) * 1.05, 0, { rz: -a });
      }
      break;
    case 'lantern': // glowing paper lantern (tinted)
      k.box(0.5, 0.62, 0.5, 0xffffff, 0, 0, 0);
      break;
    case 'person': // body: shirt is white (takes the tint), trousers stay dark after tinting
      k.box(0.34, 0.5, 0.22, 0x2b3a55, 0, 0.25, 0);
      k.box(0.4, 0.55, 0.26, 0xffffff, 0, 0.78, 0, { r: 0.08 });
      k.box(0.09, 0.48, 0.1, 0xffffff, -0.25, 0.8, 0, { rz: 0.12 });
      k.box(0.09, 0.48, 0.1, 0xffffff, 0.25, 0.8, 0, { rz: -0.12 });
      break;
    case 'head':
      k.sphere(0.17, 0xffffff, 0, 1.2, 0, { seg: 8 });
      // hair: dark vertex colour, so the skin tint turns it into a natural dark brown
      k.sphere(0.18, 0x5a3a28, 0, 1.27, 0.02, { sy: 0.6, seg: 8 });
      break;
  }
  return k.build();
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geoFor(kind: AmbientKind, low: boolean): THREE.BufferGeometry {
  const key = `${kind}:${low}`;
  let g = geoCache.get(key);
  if (!g) {
    g = withLowDetail(low, () => buildGeo(kind));
    geoCache.set(key, g);
  }
  return g;
}

const SKIN = [0xf1c7a1, 0xd9a47a, 0xb07a52, 0x8a5a3a, 0xffd9b8];
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _camF = new THREE.Vector3();

interface Pool {
  mesh: THREE.InstancedMesh;
  n: number;
}

export class AmbientLayer {
  readonly group = new THREE.Group();
  private pools = new Map<AmbientKind, Pool>();
  private tier: 0 | 1 | 2 = 2;
  private low = false;
  reducedMotion = false;

  setTier(tier: 0 | 1 | 2, low: boolean): void {
    if (tier === this.tier && low === this.low) return;
    this.tier = tier;
    this.low = low;
    // rebuild pools lazily with the new detail level and caps
    for (const p of this.pools.values()) {
      this.group.remove(p.mesh);
      p.mesh.dispose();
    }
    this.pools.clear();
  }

  private pool(kind: AmbientKind): Pool {
    let p = this.pools.get(kind);
    if (!p) {
      const capKind = kind === 'head' ? 'person' : kind;
      const cap = Math.max(1, BUDGET[this.tier].cap[capKind]);
      const mat = kind === 'lantern' ? MAT.neon : MAT.scenery;
      const mesh = new THREE.InstancedMesh(geoFor(kind, this.low), mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, _c.setHex(0xffffff));
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
      p = { mesh, n: 0 };
      this.pools.set(kind, p);
    }
    return p;
  }

  /** Total active instances (diagnostics). */
  active(): number {
    let n = 0;
    for (const p of this.pools.values()) n += p.mesh.count;
    return n;
  }

  reset(): void {
    for (const p of this.pools.values()) {
      p.mesh.count = 0;
      p.mesh.visible = false;
    }
  }

  update(t: number, chunks: Iterable<AmbientHost>, cam: THREE.Camera, truck: THREE.Vector3): void {
    const B = BUDGET[this.tier];
    const far2 = B.far * B.far;
    const cp = cam.position;
    cam.getWorldDirection(_camF);
    for (const p of this.pools.values()) p.n = 0;
    const rm = this.reducedMotion ? 0.35 : 1;
    for (const c of chunks) {
      const gp = c.group.position;
      for (const sp of c.ambient) {
        const wx = gp.x + sp.x, wy = gp.y + sp.y, wz = gp.z + sp.z;
        const dx = wx - cp.x, dz = wz - cp.z;
        // balloons hang far out; give them extra range so they read as a backdrop
        const reach = sp.kind === 'balloon' ? 2.2 : 1;
        if (dx * dx + dz * dz > far2 * reach * reach) continue;
        if (dx * _camF.x + dz * _camF.z < -12) continue; // behind the camera
        const capKind = sp.kind === 'head' ? 'person' : sp.kind;
        const pool = this.pool(sp.kind);
        if (pool.n >= B.cap[capKind]) continue;
        let x = wx, y = wy, z = wz, rx = 0, ry = sp.ry, rz = 0, sc = 1;
        let col = sp.color;
        switch (sp.kind) {
          case 'bird': {
            // circle the anchor, banking into the turn, with a gentle vertical swell
            const th = t * sp.b + sp.ph;
            x += Math.cos(th) * sp.a;
            z += Math.sin(th) * sp.a;
            y += Math.sin(th * 2.3 + sp.ph) * 0.8;
            ry = -th + (sp.b > 0 ? Math.PI : 0);
            rz = (sp.b > 0 ? 0.35 : -0.35) + Math.sin(t * 3 + sp.ph) * 0.12 * rm;
            break;
          }
          case 'boat':
            y += Math.sin(t * 1.3 + sp.ph) * 0.09 * rm;
            rz = Math.sin(t * 1.1 + sp.ph) * 0.05 * rm;
            rx = Math.sin(t * 0.8 + sp.ph * 1.7) * 0.03 * rm;
            break;
          case 'tumble': {
            // roll along the road side (never across it), hopping, fading in and out at the ends
            const L = sp.a;
            const u = (t * sp.b * rm + sp.ph * L) % L;
            x += sp.fx * u;
            z += sp.fz * u;
            y += 0.45 + Math.abs(Math.sin(u * 1.4)) * 0.35;
            const edge = Math.min(u, L - u);
            sc = Math.min(1, edge / 1.5);
            ry = sp.ry;
            rx = -u / 0.45;
            break;
          }
          case 'balloon':
            y += Math.sin(t * 0.25 + sp.ph) * 2.5;
            x += sp.fx * Math.sin(t * 0.05 + sp.ph) * 6;
            z += sp.fz * Math.sin(t * 0.05 + sp.ph) * 6;
            ry = t * 0.1 + sp.ph;
            break;
          case 'rotor':
            rz = (t * 1.4 * rm + sp.ph) % (Math.PI * 2);
            break;
          case 'lantern': {
            // rise from street level to ~45 m and loop, swaying; colour fades at both ends
            const H = 42;
            const u = (t * sp.b + sp.ph * H) % H;
            y += u;
            x += Math.sin(t * 0.7 + sp.ph * 3) * 1.2;
            z += Math.cos(t * 0.6 + sp.ph * 2) * 1.2;
            const fade = Math.min(1, u / 3, (H - u) / 8);
            col = _c.setHex(sp.color).multiplyScalar(Math.max(0, fade)).getHex();
            sc = 0.6 + 0.4 * fade;
            ry = t * 0.4 + sp.ph;
            break;
          }
          case 'person':
          case 'head': {
            const tdx = truck.x - wx, tdz = truck.z - wz;
            const d2 = tdx * tdx + tdz * tdz;
            const near = sp.crowd ? 35 : 18;
            if (d2 < near * near) {
              // cheer: hop and face the truck
              y += Math.abs(Math.sin(t * 9 + sp.ph)) * (sp.crowd ? 0.28 : 0.18) * rm;
              ry = Math.atan2(tdx, tdz);
            } else {
              rz = Math.sin(t * 1.3 + sp.ph) * 0.05 * rm;
            }
            break;
          }
        }
        _e.set(rx, ry, rz, 'YXZ');
        _q.setFromEuler(_e);
        _m.compose(_p.set(x, y, z), _q, _s.set(sc, sc, sc));
        pool.mesh.setMatrixAt(pool.n, _m);
        pool.mesh.setColorAt(pool.n, _c.setHex(col));
        pool.n++;
      }
    }
    for (const p of this.pools.values()) {
      p.mesh.count = p.n;
      p.mesh.visible = p.n > 0;
      if (p.n > 0) {
        p.mesh.instanceMatrix.needsUpdate = true;
        p.mesh.instanceColor!.needsUpdate = true;
      }
    }
  }
}

/** Deterministic skin tone for a person spawn. */
export function skinTone(ph: number): number {
  return SKIN[Math.floor(Math.abs(ph * 97.3)) % SKIN.length];
}
