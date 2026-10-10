import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface XForm {
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Accumulates coloured primitives and merges them into a single vertex-coloured geometry.
 * Used for every procedural model so each model is one draw call with a shared material.
 */
export class Kit {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, t: XForm = {}): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    geo.dispose();
    g.deleteAttribute('uv');
    if (g.getAttribute('uv1')) g.deleteAttribute('uv1');
    _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    _c.setHex(color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  /** Rounded box; r = corner radius (0 for a plain box). */
  box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, t: XForm & { r?: number; seg?: number } = {}): this {
    const r = Math.min(t.r ?? 0, Math.min(w, h, d) * 0.49);
    const geo = r > 0.001 ? new RoundedBoxGeometry(w, h, d, t.seg ?? 2, r) : new THREE.BoxGeometry(w, h, d);
    return this.add(geo, color, x, y, z, t);
  }

  cyl(rt: number, rb: number, h: number, color: number, x = 0, y = 0, z = 0, t: XForm & { seg?: number } = {}): this {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, t.seg ?? 14), color, x, y, z, t);
  }

  sphere(r: number, color: number, x = 0, y = 0, z = 0, t: XForm & { seg?: number } = {}): this {
    const seg = t.seg ?? 12;
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), color, x, y, z, t);
  }

  cone(r: number, h: number, color: number, x = 0, y = 0, z = 0, t: XForm & { seg?: number } = {}): this {
    return this.add(new THREE.ConeGeometry(r, h, t.seg ?? 12), color, x, y, z, t);
  }

  torus(r: number, tube: number, color: number, x = 0, y = 0, z = 0, t: XForm & { seg?: number; arc?: number } = {}): this {
    return this.add(new THREE.TorusGeometry(r, tube, 6, t.seg ?? 16, t.arc ?? Math.PI * 2), color, x, y, z, t);
  }

  /** Extruded 2D shape along local Z (depth). */
  shape(pts: [number, number][], depth: number, color: number, x = 0, y = 0, z = 0, t: XForm = {}): this {
    const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    return this.add(geo, color, x, y, z, t);
  }

  /** Add a cached, already-coloured geometry (cloned, never disposed). */
  addColored(geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, t: XForm = {}): this {
    const g = geo.clone();
    _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    this.parts.push(g);
    return this;
  }

  /** Raw triangles (non-indexed positions) with a single colour; normals computed flat. */
  tris(positions: number[], color: number | number[]): this {
    if (positions.length === 0) return this;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    const n = positions.length / 3;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      _c.setHex(Array.isArray(color) ? color[Math.floor(i / 6) % color.length] : color);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  /** Merge another kit's parts into this one with an offset/rotation. */
  absorb(other: Kit, x = 0, y = 0, z = 0, t: XForm = {}): this {
    _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    _m.compose(_p, _q, _s);
    for (const g of other.parts) {
      const c = g.clone();
      c.applyMatrix4(_m);
      this.parts.push(c);
    }
    return this;
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  /** Build without consuming (for caching variants). */
  buildKeep(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts.map((p) => p.clone()), false);
    if (!merged) throw new Error('merge failed');
    return merged;
  }

  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) return new THREE.BufferGeometry();
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!merged) throw new Error('merge failed');
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

/** Darken/lighten a hex colour by factor (in sRGB space, quick and cheap). */
export function shade(hex: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

export function mix(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}
