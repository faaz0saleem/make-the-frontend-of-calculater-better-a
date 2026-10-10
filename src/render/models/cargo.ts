import * as THREE from 'three';
import { CARGO, type CargoShape } from '../../data/cargo';
import { Kit } from '../geo';
import { MAT } from '../materials';

interface CargoGeo {
  body: THREE.BufferGeometry;
  lamp: THREE.BufferGeometry | null;
}

const cache = new Map<CargoShape, CargoGeo>();

/** Each cargo type is modelled with its CargoDef footprint, origin at bottom centre. */
export function cargoGeometry(shape: CargoShape): CargoGeo {
  const hit = cache.get(shape);
  if (hit) return hit;
  const d = CARGO[shape];
  const W = d.width, H = d.height;
  const k = new Kit();
  const L = new Kit();
  switch (shape) {
    case 'parcel': {
      k.box(W, H, W * 0.85, 0xd9a86c, 0, H / 2, 0, { r: 0.035 });
      k.box(W + 0.01, 0.1, W * 0.86, 0xc2884c, 0, H * 0.98, 0);
      k.box(0.12, H + 0.01, W * 0.86, 0xe8c48e, 0, H / 2, 0);
      k.box(0.3, 0.18, 0.01, 0xfff7ea, W * 0.2, H * 0.55, W * 0.43);
      k.box(0.22, 0.03, 0.012, 0x3a7ca5, W * 0.2, H * 0.6, W * 0.432);
      break;
    }
    case 'crate': {
      k.box(W, H * 0.9, W * 0.85, 0xb5793f, 0, H * 0.45, 0, { r: 0.02 });
      for (let i = 0; i < 3; i++) k.box(W + 0.02, 0.06, W * 0.87, 0x8a5a2e, 0, 0.1 + i * H * 0.32, 0);
      for (const sx of [-1, 1]) k.box(0.06, H * 0.9, W * 0.87, 0x8a5a2e, sx * W * 0.47, H * 0.45, 0);
      // ice + fish tails peeking out
      k.box(W * 0.9, 0.06, W * 0.75, 0xd8f2ff, 0, H * 0.9, 0);
      for (let i = 0; i < 4; i++) {
        const x = -W * 0.3 + i * W * 0.2;
        k.sphere(0.09, 0x7aa6c2, x, H * 0.95, (i % 2 ? 0.1 : -0.1), { sx: 0.8, sy: 0.6, sz: 1.8 });
        k.cone(0.07, 0.12, 0x5d8aa8, x, H * 1.02, (i % 2 ? 0.3 : -0.3), { rx: i % 2 ? Math.PI / 2 : -Math.PI / 2, sz: 0.4 });
      }
      break;
    }
    case 'cake': {
      k.cyl(W * 0.52, W * 0.52, 0.04, 0xf3f3f3, 0, 0.02, 0, { seg: 20 });
      k.cyl(W * 0.46, W * 0.48, H * 0.36, 0xffb3c7, 0, 0.04 + H * 0.18, 0, { seg: 20 });
      k.cyl(W * 0.47, W * 0.47, 0.05, 0xfff4e6, 0, 0.04 + H * 0.37, 0, { seg: 20 });
      k.cyl(W * 0.36, W * 0.38, H * 0.28, 0xffe0a8, 0, 0.06 + H * 0.52, 0, { seg: 20 });
      k.cyl(W * 0.37, W * 0.37, 0.05, 0xfff4e6, 0, 0.06 + H * 0.67, 0, { seg: 20 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.sphere(0.05, 0xfff4e6, Math.cos(a) * W * 0.46, 0.04 + H * 0.33, Math.sin(a) * W * 0.46, { sy: 1.6 });
        k.sphere(0.04, 0xff4f6d, Math.cos(a) * W * 0.3, 0.06 + H * 0.72, Math.sin(a) * W * 0.3);
      }
      for (const x of [-0.08, 0.08]) {
        k.cyl(0.02, 0.02, 0.14, 0x6cb4ee, x, H * 0.8, 0);
        L.sphere(0.03, 0xffc93c, x, H * 0.9, 0, { sy: 1.5 });
      }
      break;
    }
    case 'armchair': {
      const c = 0x2fae9a, c2 = 0x248a7a;
      k.box(W * 0.9, H * 0.3, W * 0.8, c, 0, H * 0.25, 0.04, { r: 0.08 });
      k.box(W * 0.8, H * 0.14, W * 0.65, 0xf2d06b, 0, H * 0.45, 0.08, { r: 0.06 });
      k.box(W * 0.9, H * 0.62, W * 0.2, c2, 0, H * 0.58, -W * 0.32, { r: 0.08 });
      for (const sx of [-1, 1]) k.box(W * 0.16, H * 0.42, W * 0.78, c2, sx * W * 0.42, H * 0.38, 0.04, { r: 0.07 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.04, 0.03, H * 0.12, 0x6b4a2e, sx * W * 0.38, H * 0.06, sz * W * 0.32);
      break;
    }
    case 'plant': {
      k.cyl(W * 0.36, W * 0.26, H * 0.38, 0xd4683a, 0, H * 0.19, 0, { seg: 14 });
      k.cyl(W * 0.4, W * 0.38, 0.06, 0xe07a4a, 0, H * 0.38, 0, { seg: 14 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        k.sphere(0.13, i % 2 ? 0x4caf50 : 0x6cc56a, Math.cos(a) * 0.14, H * 0.58 + (i % 3) * 0.06, Math.sin(a) * 0.14, { sy: 2.0, sx: 0.6, rz: Math.cos(a) * 0.6, rx: Math.sin(a) * 0.6 });
      }
      k.sphere(0.14, 0x58b85a, 0, H * 0.78, 0, { sy: 1.4 });
      break;
    }
    case 'buoy': {
      const r = W / 2;
      for (let i = 0; i < 4; i++) k.cyl(r * (0.85 + (i === 1 || i === 2 ? 0.15 : 0)), r * (0.85 + (i === 1 || i === 2 ? 0.15 : 0)), H * 0.2, i % 2 ? 0xfff6e6 : 0xff4d3d, 0, H * 0.1 + i * H * 0.2, 0, { seg: 18 });
      k.sphere(r * 0.85, 0xff4d3d, 0, H * 0.8, 0, { sy: 0.4 });
      k.torus(0.1, 0.025, 0xd9dde4, 0, H * 0.97, 0, { rx: Math.PI / 2 });
      break;
    }
    case 'cactus': {
      k.cyl(W * 0.4, W * 0.3, H * 0.3, 0x3a7ca5, 0, H * 0.15, 0, { seg: 12 });
      k.cyl(W * 0.42, W * 0.42, 0.05, 0xf2c48a, 0, H * 0.3, 0, { seg: 12 });
      k.cyl(0.12, 0.13, H * 0.55, 0x5e9e52, 0, H * 0.58, 0, { seg: 10 });
      k.sphere(0.12, 0x5e9e52, 0, H * 0.86, 0, { seg: 10 });
      k.cyl(0.06, 0.06, 0.16, 0x5e9e52, 0.16, H * 0.6, 0, { rz: Math.PI / 2 });
      k.cyl(0.06, 0.06, 0.2, 0x5e9e52, 0.22, H * 0.7, 0);
      k.cyl(0.05, 0.05, 0.14, 0x5e9e52, -0.15, H * 0.5, 0, { rz: Math.PI / 2 });
      k.cyl(0.05, 0.05, 0.16, 0x5e9e52, -0.2, H * 0.58, 0);
      k.sphere(0.06, 0xff6fa8, 0, H * 0.97, 0);
      break;
    }
    case 'barrel': {
      const r = W / 2;
      k.cyl(r * 0.88, r * 0.82, H * 0.25, 0xa8673a, 0, H * 0.125, 0, { seg: 16 });
      k.cyl(r, r * 0.88, H * 0.25, 0xb5733f, 0, H * 0.375, 0, { seg: 16 });
      k.cyl(r * 0.88, r, H * 0.25, 0xb5733f, 0, H * 0.625, 0, { seg: 16 });
      k.cyl(r * 0.82, r * 0.88, H * 0.25, 0xa8673a, 0, H * 0.875, 0, { seg: 16 });
      for (const y of [0.12, 0.5, 0.88]) k.cyl(r * (y === 0.5 ? 1.02 : 0.9), r * (y === 0.5 ? 1.02 : 0.9), 0.05, 0x5b5f66, 0, H * y, 0, { seg: 16 });
      k.cyl(r * 0.8, r * 0.8, 0.02, 0x8a5a2e, 0, H, 0, { seg: 16 });
      break;
    }
    case 'washer': {
      k.box(W, H, W * 0.9, 0xf7f9fb, 0, H / 2, 0, { r: 0.06 });
      k.box(W * 0.98, H * 0.16, 0.02, 0xdfe6ee, 0, H * 0.88, W * 0.45);
      k.cyl(W * 0.3, W * 0.3, 0.04, 0xc9d1da, 0, H * 0.45, W * 0.45, { rx: Math.PI / 2, seg: 20 });
      k.cyl(W * 0.24, W * 0.24, 0.05, 0x5a7da8, 0, H * 0.45, W * 0.46, { rx: Math.PI / 2, seg: 20 });
      k.sphere(0.04, 0xff5a4e, W * 0.3, H * 0.88, W * 0.46);
      k.sphere(0.04, 0x3cc9a7, W * 0.18, H * 0.88, W * 0.46);
      break;
    }
    case 'melons': {
      k.box(W, H * 0.55, W * 0.8, 0xc49155, 0, H * 0.275, 0, { r: 0.02 });
      for (const sx of [-1, 1]) k.box(0.05, H * 0.55, W * 0.82, 0x8a5a2e, sx * W * 0.48, H * 0.275, 0);
      const pos: [number, number][] = [[-0.3, -0.15], [0, -0.15], [0.3, -0.15], [-0.15, 0.15], [0.15, 0.15], [0.32, 0.18], [-0.34, 0.16]];
      pos.forEach(([x, z], i) => {
        k.sphere(0.17, 0x3f8f3a, x * W, H * 0.62, z * W, { sx: 1.1, sz: 1.3 });
        k.sphere(0.172, 0x2b6b2b, x * W, H * 0.62, z * W, { sx: 0.3, sz: 1.31, sy: 1.0, ry: i * 0.4 });
      });
      break;
    }
    case 'jukebox': {
      k.box(W, H * 0.7, W * 0.6, 0x8a3a2e, 0, H * 0.35, 0, { r: 0.05 });
      k.cyl(W / 2, W / 2, W * 0.6, 0x8a3a2e, 0, H * 0.7, 0, { rx: Math.PI / 2, seg: 20 });
      k.box(W * 0.6, H * 0.25, 0.02, 0x2b3b52, 0, H * 0.5, W * 0.31);
      k.box(W * 0.8, 0.06, W * 0.62, 0xd9dde4, 0, H * 0.08, 0);
      L.torus(W * 0.42, 0.035, 0xffc93c, 0, H * 0.7, W * 0.3, { arc: Math.PI, seg: 14 });
      L.torus(W * 0.34, 0.03, 0xff4fa3, 0, H * 0.7, W * 0.305, { arc: Math.PI, seg: 14 });
      for (const sx of [-1, 1]) L.box(0.05, H * 0.55, 0.03, 0x3ff2e0, sx * W * 0.42, H * 0.38, W * 0.3);
      break;
    }
    case 'tv': {
      k.box(W, H * 0.82, W * 0.75, 0xb98a58, 0, H * 0.45, 0, { r: 0.07 });
      k.box(W * 0.68, H * 0.56, 0.04, 0x33405a, -W * 0.08, H * 0.48, W * 0.37, { r: 0.05 });
      k.box(W * 0.6, H * 0.46, 0.02, 0x5a7da8, -W * 0.08, H * 0.48, W * 0.39);
      for (const y of [0.62, 0.42]) k.cyl(0.04, 0.04, 0.04, 0xe6d3b5, W * 0.38, H * y, W * 0.38, { rx: Math.PI / 2 });
      for (const sx of [-1, 1]) k.cyl(0.012, 0.012, 0.45, 0x5b5f66, sx * 0.12, H * 0.95, -0.05, { rz: sx * 0.5 });
      for (const sx of [-1, 1]) k.box(0.06, H * 0.06, 0.06, 0x5b4a3a, sx * W * 0.35, H * 0.03, 0);
      break;
    }
    case 'lantern': {
      const pos: [number, number, number, number][] = [[-0.18, 0.18, 0, 0xff5a4e], [0.18, 0.2, 0.05, 0xff9a3a], [0, 0.45, -0.05, 0xff4f6d], [0.12, 0.5, 0.15, 0xffc23a]];
      for (const [x, y, z, c] of pos) {
        k.sphere(0.17, c, x, y, z, { sy: 1.2 });
        k.cyl(0.07, 0.07, 0.04, 0xffd76b, x, y + 0.2, z);
        k.cyl(0.07, 0.07, 0.04, 0xffd76b, x, y - 0.2, z);
        L.sphere(0.08, 0xffe8a0, x, y, z);
      }
      break;
    }
    case 'fishtank': {
      k.box(W, 0.08, W * 0.6, 0x2f3542, 0, 0.04, 0);
      k.box(W, 0.06, W * 0.6, 0x2f3542, 0, H - 0.03, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05, H, 0.05, 0x2f3542, sx * (W / 2 - 0.025), H / 2, sz * (W * 0.3 - 0.025));
      k.box(W * 0.95, H * 0.78, W * 0.55, 0x8fd6ef, 0, H * 0.47, 0);
      k.box(W * 0.95, 0.08, W * 0.55, 0xe8d39a, 0, 0.12, 0);
      const fish: [number, number, number][] = [[-0.2, 0.35, 0x0], [0.15, 0.48, 0x0], [0.05, 0.25, 0x0]];
      fish.forEach(([x, y], i) => {
        k.sphere(0.07, [0xff8a2b, 0xffc23a, 0xff5a8a][i], x, y, W * 0.28, { sx: 1.5 });
        k.cone(0.05, 0.08, [0xff8a2b, 0xffc23a, 0xff5a8a][i], x - 0.12, y, W * 0.28, { rz: Math.PI / 2 });
      });
      k.cyl(0.02, 0.03, 0.25, 0x4caf50, 0.3, 0.25, 0.05);
      k.cyl(0.02, 0.03, 0.2, 0x58b85a, 0.34, 0.22, -0.05);
      break;
    }
    case 'fridge': {
      k.box(W, H, W * 0.85, 0x9fe0cf, 0, H / 2, 0, { r: 0.1 });
      k.box(W * 0.98, 0.02, W * 0.86, 0x7cc3b2, 0, H * 0.66, 0);
      k.box(0.04, H * 0.18, 0.06, 0xdfe6ee, W * 0.36, H * 0.82, W * 0.44, { r: 0.015 });
      k.box(0.04, H * 0.3, 0.06, 0xdfe6ee, W * 0.36, H * 0.4, W * 0.44, { r: 0.015 });
      k.box(0.12, 0.12, 0.01, 0xff5a4e, -W * 0.2, H * 0.78, W * 0.43);
      k.box(0.1, 0.14, 0.01, 0xffc23a, -W * 0.05, H * 0.72, W * 0.43);
      break;
    }
    case 'weddingcake': {
      const tiers = 4;
      let y = 0.03;
      k.cyl(W * 0.52, W * 0.52, 0.04, 0xd9dde4, 0, 0.02, 0, { seg: 22 });
      for (let i = 0; i < tiers; i++) {
        const r = W * (0.46 - i * 0.09);
        const th = H * 0.17;
        k.cyl(r, r, th, 0xfffaf2, 0, y + th / 2, 0, { seg: 22 });
        k.cyl(r + 0.005, r + 0.005, 0.03, 0xffb3c7, 0, y + th * 0.3, 0, { seg: 22 });
        for (let j = 0; j < 10; j++) {
          const a = (j / 10) * Math.PI * 2;
          k.sphere(0.022, 0xffe3ec, Math.cos(a) * r, y + th, Math.sin(a) * r);
        }
        y += th;
      }
      k.cyl(0.015, 0.015, 0.18, 0xe6c46a, 0, y + 0.09, 0);
      k.sphere(0.06, 0xff6f91, 0, y + 0.2, 0);
      break;
    }
    case 'piano': {
      k.box(W, H * 0.92, W * 0.48, 0x3a2418, 0, H * 0.46, -W * 0.06, { r: 0.04 });
      k.box(W * 0.96, 0.06, W * 0.3, 0x2a1810, 0, H * 0.5, W * 0.28);
      k.box(W * 0.9, 0.04, W * 0.18, 0xfaf7ef, 0, H * 0.535, W * 0.3);
      for (let i = 0; i < 9; i++) k.box(0.04, 0.03, W * 0.1, 0x111111, -W * 0.4 + i * W * 0.1, H * 0.56, W * 0.26);
      k.box(W * 0.5, H * 0.18, 0.02, 0xc9a24a, 0, H * 0.75, W * 0.18);
      for (const sx of [-1, 1]) k.box(0.07, H * 0.5, 0.07, 0x2a1810, sx * W * 0.44, H * 0.25, W * 0.32);
      k.box(W * 1.02, 0.05, W * 0.52, 0x4a3020, 0, H * 0.93, -W * 0.06);
      break;
    }
    case 'neon': {
      k.box(W, H * 0.8, 0.1, 0x22253f, 0, H * 0.45, 0, { r: 0.04 });
      k.box(W * 1.02, 0.04, 0.12, 0x5b5f66, 0, H * 0.06, 0);
      // letters O P E N as glowing tubes
      L.torus(0.1, 0.025, 0xff4fa3, -W * 0.33, H * 0.45, 0.06, { seg: 14 });
      L.box(0.03, 0.24, 0.03, 0x3ff2e0, -W * 0.15, H * 0.45, 0.06);
      L.torus(0.06, 0.022, 0x3ff2e0, -W * 0.12, H * 0.51, 0.06, { arc: Math.PI, rz: -Math.PI / 2, seg: 10 });
      L.box(0.03, 0.24, 0.03, 0xffc93c, W * 0.06, H * 0.45, 0.06);
      for (const dy of [-0.11, 0, 0.11]) L.box(0.1, 0.03, 0.03, 0xffc93c, W * 0.1, H * 0.45 + dy, 0.06);
      L.box(0.03, 0.24, 0.03, 0x8a7dff, W * 0.27, H * 0.45, 0.06);
      L.box(0.03, 0.24, 0.03, 0x8a7dff, W * 0.4, H * 0.45, 0.06);
      L.box(0.03, 0.27, 0.03, 0x8a7dff, W * 0.335, H * 0.45, 0.06, { rz: 0.45 });
      break;
    }
    case 'gnome': {
      k.cyl(0.18, 0.22, 0.06, 0x7a7f88, 0, 0.03, 0);
      k.cyl(0.14, 0.2, H * 0.4, 0xf2c14e, 0, H * 0.25, 0);
      k.sphere(0.12, 0xffd9b8, 0, H * 0.55, 0.02);
      k.cone(0.14, H * 0.42, 0xf2c14e, 0, H * 0.8, 0);
      k.cone(0.1, 0.16, 0xfffaf0, 0, H * 0.44, 0.08, { rx: Math.PI });
      k.sphere(0.03, 0xff8a8a, 0, H * 0.55, 0.13);
      L.sphere(0.03, 0xfff4b0, 0, H * 1.0, 0);
      break;
    }
  }
  const res: CargoGeo = { body: k.build(), lamp: L.empty ? null : L.build() };
  cache.set(shape, res);
  return res;
}

/** A cargo item visual (group) sharing cached geometry. */
export function makeCargoMesh(shape: CargoShape): THREE.Group {
  const g = new THREE.Group();
  const geo = cargoGeometry(shape);
  const m = new THREE.Mesh(geo.body, MAT.paint);
  m.castShadow = true;
  g.add(m);
  if (geo.lamp) g.add(new THREE.Mesh(geo.lamp, MAT.lamp));
  g.userData.shape = shape;
  return g;
}

export function setCargoShape(g: THREE.Group, shape: CargoShape): void {
  if (g.userData.shape === shape) return;
  const geo = cargoGeometry(shape);
  const body = g.children[0] as THREE.Mesh;
  body.geometry = geo.body;
  while (g.children.length > 1) g.remove(g.children[1]);
  if (geo.lamp) g.add(new THREE.Mesh(geo.lamp, MAT.lamp));
  g.userData.shape = shape;
}
