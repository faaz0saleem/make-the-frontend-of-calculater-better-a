import type * as THREE from 'three';
import { Rng } from '../core/rng';
import type { WorldId } from '../sim/types';
import { Kit, isLowDetail, mix, shade } from './geo';
import { THEMES, type Theme } from './themes';

/**
 * Pre-built scenery variants per world (cached geometry, vertex coloured).
 * Local frame: width along X (parallel to the road), depth along Z, facade faces +Z, base at y=0.
 */
export interface SceneryPiece {
  body: THREE.BufferGeometry;
  glow: THREE.BufferGeometry | null;
  lit: THREE.BufferGeometry | null;
  w: number;
  d: number;
  h: number;
  /** Local positions of glow sprites (night lamps / neon), facade space. */
  lights: [number, number, number, number][];
  kind: 'building' | 'prop' | 'tall';
}

const cache = new Map<string, SceneryPiece[]>();

export function sceneryFor(world: WorldId, kind: 'building' | 'prop' | 'tall'): SceneryPiece[] {
  const base = `${world}:${kind}`;
  // Cached per detail level; the seed ignores detail so Low and High build the same town.
  const key = `${base}:${isLowDetail() ? 'low' : 'full'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = THEMES[world];
  const rng = new Rng(`scenery-${base}`);
  const out: SceneryPiece[] = [];
  if (kind === 'building') {
    for (let i = 0; i < 8; i++) out.push(world === 1 ? harborHouse(t, rng, i) : world === 2 ? adobe(t, rng, i) : marketBuilding(t, rng, i));
  } else if (kind === 'tall') {
    for (let i = 0; i < 4; i++) out.push(world === 1 ? harborLandmark(t, rng, i) : world === 2 ? cliffBlock(t, rng, i) : tower(t, rng, i));
  } else {
    for (let i = 0; i < 6; i++) out.push(world === 1 ? harborProp(t, rng, i) : world === 2 ? canyonProp(t, rng, i) : marketProp(t, rng, i));
  }
  cache.set(key, out);
  return out;
}

function piece(k: Kit, g: Kit, w: number, d: number, h: number, lights: [number, number, number, number][], kind: SceneryPiece['kind'], lit?: Kit): SceneryPiece {
  return { body: k.buildKeep(), glow: g.empty ? null : g.buildKeep(), lit: lit && !lit.empty ? lit.buildKeep() : null, w, d, h, lights, kind };
}

function windowsGrid(k: Kit, g: Kit | null, w: number, d: number, y0: number, floors: number, floorH: number, cols: number, frame: number, glass: number, litChance: number, rng: Rng, lit: number[] = []): void {
  const ww = Math.min(0.9, (w / cols) * 0.55);
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (c + 0.5) * (w / cols);
      const y = y0 + f * floorH + floorH * 0.5;
      k.box(ww + 0.16, floorH * 0.55 + 0.16, 0.08, frame, x, y, d / 2 + 0.02);
      const isLit = g && rng.chance(litChance);
      if (isLit) g!.box(ww, floorH * 0.55, 0.06, lit.length ? rng.pick(lit) : 0xffe1a0, x, y, d / 2 + 0.06);
      else k.box(ww, floorH * 0.55, 0.06, glass, x, y, d / 2 + 0.05);
      // little sill
      k.box(ww + 0.24, 0.07, 0.18, frame, x, y - floorH * 0.3, d / 2 + 0.08);
    }
  }
}

function stripedAwning(k: Kit, w: number, y: number, z: number, depth: number, c1: number, c2: number): void {
  const n = Math.max(4, Math.round(w / 0.45));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    k.box(w / n + 0.01, 0.06, depth, i % 2 ? c2 : c1, x, y, z + depth / 2, { rx: 0.42 });
    k.box(w / n + 0.01, 0.22, 0.05, i % 2 ? c2 : c1, x, y - 0.25, z + depth * 0.95);
  }
}

// ------------------------------------------------------------------ Sunlit Harbor
function harborHouse(t: Theme, rng: Rng, i: number): SceneryPiece {
  const k = new Kit(), g = new Kit();
  const w = rng.range(4.6, 6.4), d = rng.range(5, 6.5);
  const floors = rng.int(2, 3);
  const fh = 2.6;
  const h = floors * fh + 0.6;
  const col = t.buildings[i % t.buildings.length];
  const trim = rng.pick(t.trims);
  k.box(w, h, d, col, 0, h / 2, 0, { r: 0.12 });
  k.box(w + 0.1, 0.5, d + 0.1, shade(col, 0.78), 0, 0.25, 0, { r: 0.06 });
  k.box(w + 0.2, 0.18, d + 0.2, trim, 0, h, 0, { r: 0.06 });
  // gable roof
  const roof = rng.pick(t.roofs);
  const rh = rng.range(1.4, 2.2);
  k.shape([[-w / 2 - 0.25, 0], [w / 2 + 0.25, 0], [0, rh]], d + 0.4, roof, 0, h + 0.09, 0);
  k.shape([[-w / 2 + 0.1, 0], [w / 2 - 0.1, 0], [0, rh - 0.3]], 0.1, col, 0, h + 0.1, d / 2 + 0.16);
  if (rng.chance(0.6)) k.box(0.5, 1.2, 0.5, shade(roof, 0.8), w * 0.25, h + rh * 0.6, -d * 0.1, { r: 0.05 });
  windowsGrid(k, null, w, d, 0.8 + fh * 0.5, floors - 1, fh, rng.int(2, 3), trim, 0x3a5a7a, 0, rng);
  // shop front with striped awning
  const [a1, a2] = t.awnings[rng.int(0, t.awnings.length - 1)];
  k.box(w * 0.8, 1.9, 0.1, 0x3a5a7a, 0, 1.45, d / 2 + 0.04);
  k.box(w * 0.82, 0.12, 0.14, trim, 0, 2.45, d / 2 + 0.06);
  k.box(1.0, 1.9, 0.14, shade(col, 0.6), -w * 0.25, 1.45, d / 2 + 0.07);
  stripedAwning(k, w * 0.9, 2.7, d / 2, 1.1, a1, a2);
  // shop sign
  k.box(w * 0.5, 0.5, 0.1, trim, 0, 3.15, d / 2 + 0.06, { r: 0.08 });
  k.box(w * 0.42, 0.3, 0.12, rng.pick([0xff5a4e, 0x1fb5a5, 0x2c4a7a]), 0, 3.15, d / 2 + 0.07, { r: 0.05 });
  // flower boxes
  if (rng.chance(0.7)) {
    for (const sx of [-0.25, 0.25]) {
      k.box(0.9, 0.22, 0.3, 0x8f4a3a, sx * w, 0.8 + fh * 0.5 + fh * 0.2, d / 2 + 0.2);
      for (let j = 0; j < 3; j++) k.sphere(0.13, rng.pick([0xff6f91, 0xffd166, 0xff8a65]), sx * w - 0.3 + j * 0.3, 1.18 + fh * 0.7, d / 2 + 0.25);
    }
  }
  return piece(k, g, w, d, h + rh, [], 'building');
}

function harborLandmark(_t: Theme, rng: Rng, i: number): SceneryPiece {
  const k = new Kit(), g = new Kit();
  if (i % 2 === 0) {
    // striped lighthouse
    const h = rng.range(16, 22);
    for (let j = 0; j < 6; j++) k.cyl(1.9 - j * 0.15, 2.0 - j * 0.15, h / 6, j % 2 ? 0xfff6e6 : 0xff5a4e, 0, h / 12 + (j * h) / 6, 0, { seg: 16 });
    k.cyl(1.4, 1.4, 0.3, 0x2b3a55, 0, h + 0.15, 0, { seg: 16 });
    g.cyl(1.0, 1.0, 1.2, 0xfff2b0, 0, h + 0.9, 0, { seg: 12 });
    k.cone(1.4, 1.2, 0x2b3a55, 0, h + 2.1, 0, { seg: 16 });
    return piece(k, g, 4, 4, h + 3, [[0, h + 0.9, 0, 0xfff2b0]], 'tall');
  }
  // dockside gantry crane (static backdrop)
  const h = rng.range(12, 16);
  const c = i % 4 === 1 ? 0xffb02e : 0x2f8fb8;
  for (const sx of [-2.2, 2.2]) for (const sz of [-1.6, 1.6]) k.box(0.4, h, 0.4, c, sx, h / 2, sz);
  k.box(5, 1, 4, c, 0, h, 0);
  k.box(1.2, 0.8, 14, c, 0, h + 0.9, 3);
  k.box(2.2, 2.2, 2.2, shade(c, 0.8), 0, h + 2, -3);
  k.cyl(0.04, 0.04, h * 0.5, 0x333333, 0, h * 0.68, 8);
  k.box(2.6, 1.3, 1.2, rng.pick([0xff5a4e, 0x1fb5a5, 0xffc23a]), 0, h * 0.4, 8, { r: 0.08 });
  return piece(k, g, 6, 6, h + 3, [], 'tall');
}

function harborProp(t: Theme, rng: Rng, i: number): SceneryPiece {
  const k = new Kit(), g = new Kit();
  switch (i) {
    case 0: // lamp post
      k.cyl(0.08, 0.1, 3.6, 0x2b3a55, 0, 1.8, 0, { seg: 8 });
      k.cyl(0.18, 0.22, 0.2, 0x2b3a55, 0, 0.1, 0, { seg: 8 });
      k.box(0.08, 0.08, 0.7, 0x2b3a55, 0, 3.55, 0.3);
      g.sphere(0.2, 0xfff0c0, 0, 3.35, 0.6);
      k.cone(0.3, 0.25, 0x2b3a55, 0, 3.62, 0.6, { seg: 8 });
      return piece(k, g, 0.6, 0.6, 3.8, [[0, 3.35, 0.6, 0xffe8a0]], 'prop');
    case 1: // crate stack
      for (let j = 0; j < 3; j++) k.box(1, 0.9, 1, j % 2 ? 0xb5793f : 0xc9894c, (j % 2) * 0.4 - 0.2, 0.45 + j * 0.9, 0, { r: 0.04, ry: j * 0.3 });
      return piece(k, g, 1.4, 1.2, 2.7, [], 'prop');
    case 2: // bollard + rope
      k.cyl(0.18, 0.22, 0.7, 0x2b3a55, 0, 0.35, 0, { seg: 10 });
      k.sphere(0.2, 0x2b3a55, 0, 0.72, 0, { sy: 0.5 });
      return piece(k, g, 0.5, 0.5, 0.9, [], 'prop');
    case 3: // café table with umbrella
      k.cyl(0.4, 0.4, 0.05, 0xfff6e6, 0, 0.75, 0);
      k.cyl(0.04, 0.04, 2.2, 0xdfe6ee, 0, 1.1, 0);
      k.cone(1.2, 0.5, rng.pick([0xff5a4e, 0x1fb5a5, 0xffc23a]), 0, 2.3, 0, { seg: 10 });
      for (const sx of [-0.6, 0.6]) k.box(0.35, 0.45, 0.35, 0x8f4a3a, sx, 0.23, 0, { r: 0.05 });
      return piece(k, g, 2, 2, 2.6, [], 'prop');
    case 4: // flower planter
      k.box(1.6, 0.6, 0.8, 0x8f4a3a, 0, 0.3, 0, { r: 0.08 });
      for (let j = 0; j < 5; j++) k.sphere(0.25, rng.pick([0x4caf50, 0x6cc56a]), -0.6 + j * 0.3, 0.75, 0);
      for (let j = 0; j < 4; j++) k.sphere(0.12, rng.pick([0xff6f91, 0xffd166, 0xffffff]), -0.45 + j * 0.3, 0.95, 0.15);
      return piece(k, g, 1.8, 1, 1.1, [], 'prop');
    default: // bunting pole with flags
      k.cyl(0.06, 0.06, 4.2, 0xfff6e6, 0, 2.1, 0, { seg: 8 });
      for (let j = 0; j < 4; j++) k.shape([[0, 0], [0.35, 0.2], [0, 0.4]], 0.02, t.awnings[j % t.awnings.length][0], 0.05, 3.6 - j * 0.45, 0, { ry: Math.PI / 2 });
      return piece(k, g, 0.6, 0.6, 4.2, [], 'prop');
  }
}

// ------------------------------------------------------------------ Canyon Express
function adobe(t: Theme, rng: Rng, i: number): SceneryPiece {
  const k = new Kit(), g = new Kit();
  const w = rng.range(4.5, 7), d = rng.range(4.5, 6), h = rng.range(3.2, 5.5);
  const col = t.buildings[i % t.buildings.length];
  k.box(w, h, d, col, 0, h / 2, 0, { r: 0.35 });
  k.box(w * 0.6, h * 0.5, d * 0.7, shade(col, 1.08), -w * 0.15, h + h * 0.25 - 0.1, -d * 0.1, { r: 0.3 });
  for (let j = 0; j < 4; j++) k.cyl(0.09, 0.09, 0.8, 0x6b4a33, -w / 2 + 0.7 + j * (w - 1.4) / 3, h - 0.4, d / 2 + 0.2, { rx: Math.PI / 2, seg: 6 });
  k.box(1.0, 2.0, 0.12, 0x6b4a33, w * 0.2, 1.0, d / 2 + 0.03, { r: 0.05 });
  for (const sx of [-0.28, 0.0]) k.box(0.8, 0.8, 0.1, 0x3a4a5a, sx * w - 0.3, h * 0.55, d / 2 + 0.03, { r: 0.05 });
  if (rng.chance(0.5)) {
    const [a1, a2] = t.awnings[rng.int(0, t.awnings.length - 1)];
    stripedAwning(k, w * 0.5, 2.4, d / 2, 1.0, a1, a2);
  }
  // water tower or sign
  if (rng.chance(0.4)) {
    k.cyl(0.9, 0.9, 1.6, 0x8a5a36, w * 0.25, h + 1.8, 0);
    k.cone(1.0, 0.6, 0x5e3a24, w * 0.25, h + 2.9, 0);
    for (const sx of [-0.6, 0.6]) k.cyl(0.06, 0.06, 1.2, 0x5e3a24, w * 0.25 + sx, h + 0.6, 0);
  }
  return piece(k, g, w, d, h + 2, [], 'building');
}

function cliffBlock(_t: Theme, rng: Rng, i: number): SceneryPiece {
  const k = new Kit(), g = new Kit();
  const w = rng.range(9, 14), d = rng.range(8, 12), h = rng.range(9, 18);
  const bands = [0xc8643b, 0xe08a4f, 0xa84e2d, 0xd9774a, 0xb85a33];
  let y = 0;
  let j = 0;
  while (y < h) {
    const bh = rng.range(1.6, 3.2);
    const shrink = 1 - (y / h) * 0.25;
    k.box(w * shrink * rng.range(0.92, 1.05), bh, d * shrink * rng.range(0.9, 1.05), bands[(i + j) % bands.length], rng.range(-0.4, 0.4), y + bh / 2, rng.range(-0.3, 0.3), { r: 0.5 });
    y += bh * 0.92;
    j++;
  }
  k.box(w * 0.7, 0.4, d * 0.6, 0x7a9a4a, 0, y + 0.1, 0, { r: 0.2 });
  return piece(k, g, w, d, y, [], 'tall');
}

function canyonProp(_t: Theme, rng: Rng, i: number): SceneryPiece {
  const k = new Kit(), g = new Kit();
  switch (i) {
    case 0: case 1: { // saguaro cactus
      const h = rng.range(2.4, 3.6);
      k.cyl(0.24, 0.28, h, 0x5e9e52, 0, h / 2, 0, { seg: 10 });
      k.sphere(0.24, 0x5e9e52, 0, h, 0, { seg: 10 });
      const armY = h * rng.range(0.45, 0.6);
      k.cyl(0.14, 0.14, 0.6, 0x5e9e52, 0.38, armY, 0, { rz: Math.PI / 2 });
      k.cyl(0.14, 0.14, 0.9, 0x5e9e52, 0.66, armY + 0.4, 0);
      k.sphere(0.14, 0x5e9e52, 0.66, armY + 0.85, 0);
      if (i === 1) {
        k.cyl(0.12, 0.12, 0.5, 0x5e9e52, -0.32, armY - 0.3, 0, { rz: Math.PI / 2 });
        k.cyl(0.12, 0.12, 0.7, 0x5e9e52, -0.55, armY, 0);
        k.sphere(0.12, 0x5e9e52, -0.55, armY + 0.35, 0);
      }
      return piece(k, g, 1.6, 0.6, h + 0.3, [], 'prop');
    }
    case 2: // boulder pile
      k.sphere(0.9, 0xc77a4a, 0, 0.6, 0, { sx: 1.3, sy: 0.8, seg: 8 });
      k.sphere(0.6, 0xa85e38, 0.9, 0.45, 0.3, { seg: 8 });
      k.sphere(0.45, 0xd98a5a, -0.8, 0.35, -0.2, { seg: 8 });
      return piece(k, g, 2.6, 2, 1.4, [], 'prop');
    case 3: // fence segment
      for (let j = 0; j < 3; j++) k.box(0.12, 1.1, 0.12, 0x8a5a36, -1.2 + j * 1.2, 0.55, 0);
      k.box(2.6, 0.1, 0.08, 0x9a6a40, 0, 0.8, 0);
      k.box(2.6, 0.1, 0.08, 0x9a6a40, 0, 0.45, 0);
      return piece(k, g, 2.6, 0.3, 1.1, [], 'prop');
    case 4: { // windmill
      const h = 7;
      for (const sx of [-0.6, 0.6]) k.box(0.12, h, 0.12, 0x6b4a33, sx * (1 - 0.4), h / 2, 0, { rz: -sx * 0.12 });
      k.cyl(0.2, 0.2, 0.4, 0x5b5f66, 0, h, 0.2, { rx: Math.PI / 2 });
      for (let j = 0; j < 8; j++) k.box(0.16, 1.4, 0.03, 0xdfe6ee, Math.cos((j / 8) * Math.PI * 2) * 0.7, h + Math.sin((j / 8) * Math.PI * 2) * 0.7, 0.42, { rz: (j / 8) * Math.PI * 2 - Math.PI / 2 });
      k.box(0.05, 0.5, 1.2, 0xff5a4e, 0, h, -0.6);
      return piece(k, g, 2, 1.4, h + 1, [], 'prop');
    }
    default: // tumbleweed-ish dry shrub
      k.sphere(0.45, 0xb8945a, 0, 0.4, 0, { seg: 7 });
      k.sphere(0.3, 0x9a7a4a, 0.4, 0.3, 0.2, { seg: 6 });
      return piece(k, g, 1.2, 1, 0.8, [], 'prop');
  }
}

// ------------------------------------------------------------------ Midnight Market
function marketBuilding(t: Theme, rng: Rng, i: number): SceneryPiece {
  const k = new Kit(), g = new Kit(), lit = new Kit();
  const w = rng.range(5, 7.5), d = rng.range(5, 7);
  const floors = rng.int(3, 5);
  const fh = 2.7;
  const h = floors * fh + 0.4;
  const col = t.buildings[i % t.buildings.length];
  const neon = t.glow[i % (t.glow.length - 1)];
  const lights: [number, number, number, number][] = [];
  k.box(w, h, d, col, 0, h / 2, 0, { r: 0.08 });
  k.box(w + 0.2, 0.25, d + 0.2, shade(col, 0.7), 0, h, 0);
  windowsGrid(k, lit, w, d, fh, floors - 1, fh, rng.int(2, 3), shade(col, 0.6), 0x1a1f33, 0.5, rng, [0xd9a860, 0xcf9a50, 0xe0c890, 0x7fa8c8]);
  // ground floor shopfront glow + canopy with neon trim
  lit.box(w * 0.75, 1.7, 0.06, mix(0xe0b070, neon, 0.2), 0, 1.25, d / 2 + 0.05);
  const [a1, a2] = t.awnings[i % t.awnings.length];
  stripedAwning(k, w * 0.9, 2.5, d / 2, 1.0, a2, shade(a2, 1.3));
  g.box(w * 0.9, 0.06, 0.06, a1, 0, 2.08, d / 2 + 0.95);
  // vertical neon sign
  const sh = rng.range(2.2, 3.5);
  const sx = rng.chance(0.5) ? w * 0.38 : -w * 0.38;
  k.box(0.7, sh + 0.2, 0.25, 0x1a1a2a, sx, fh + sh / 2 + 0.4, d / 2 + 0.25, { r: 0.05 });
  g.box(0.5, sh, 0.06, neon, sx, fh + sh / 2 + 0.4, d / 2 + 0.4);
  lights.push([sx, fh + sh / 2 + 0.4, d / 2 + 0.6, neon]);
  // rooftop water tank / sign
  if (rng.chance(0.5)) {
    k.cyl(0.8, 0.8, 1.4, 0x3a3a4a, -w * 0.2, h + 1.1, 0);
    for (const ox of [-0.4, 0.4]) k.cyl(0.05, 0.05, 0.6, 0x3a3a4a, -w * 0.2 + ox, h + 0.3, 0);
  }
  return piece(k, g, w, d, h + 1, lights, 'building', lit);
}

function tower(t: Theme, rng: Rng, i: number): SceneryPiece {
  const k = new Kit(), g = new Kit(), lit = new Kit();
  const w = rng.range(8, 12), d = rng.range(8, 12), h = rng.range(22, 38);
  const col = t.buildings[(i + 2) % t.buildings.length];
  k.box(w, h, d, shade(col, 0.85), 0, h / 2, 0, { r: 0.2 });
  windowsGrid(k, lit, w, d, 2, Math.floor(h / 3) - 1, 3, 4, shade(col, 0.6), 0x141a2a, 0.35, rng, [0xd9a860, 0x7fa8c8, 0xcf9a50]);
  const neon = t.glow[i % (t.glow.length - 1)];
  g.box(w * 0.7, 0.4, 0.08, neon, 0, h - 1.5, d / 2 + 0.06);
  g.sphere(0.4, 0xff4f4f, 0, h + 0.8, 0);
  k.cyl(0.08, 0.08, 1.6, 0x2a2a3a, 0, h + 0.4, 0);
  return piece(k, g, w, d, h, [[0, h - 1.5, d / 2 + 0.3, neon]], 'tall', lit);
}

function marketProp(t: Theme, rng: Rng, i: number): SceneryPiece {
  const k = new Kit(), g = new Kit();
  switch (i) {
    case 0: case 1: { // stall with canopy and lanterns
      const c = t.awnings[(i * 2 + 1) % t.awnings.length][0];
      k.box(2.4, 0.9, 1.2, 0x6a4a3a, 0, 0.45, 0, { r: 0.05 });
      for (let j = 0; j < 4; j++) k.box(0.4, 0.25, 0.4, rng.pick([0xff8a3d, 0xffd166, 0x9adf3c, 0xff5a8a]), -0.9 + j * 0.6, 1.02, 0, { r: 0.08 });
      for (const sx of [-1.1, 1.1]) k.cyl(0.04, 0.04, 2.4, 0x2a2a3a, sx, 1.2, -0.5);
      k.box(2.8, 0.1, 1.6, c, 0, 2.45, 0.1, { rx: 0.15 });
      g.box(2.8, 0.05, 0.05, c, 0, 2.38, 0.9);
      const lights: [number, number, number, number][] = [];
      for (const sx of [-0.9, 0.9]) {
        g.sphere(0.16, 0xff7a4a, sx, 2.05, 0.8, { sy: 1.25 });
        lights.push([sx, 2.05, 0.8, 0xff9a5a]);
      }
      return piece(k, g, 2.8, 1.6, 2.6, lights, 'prop');
    }
    case 2: { // string-light pole
      k.cyl(0.06, 0.06, 4.6, 0x2a2a3a, 0, 2.3, 0, { seg: 8 });
      for (let j = 0; j < 6; j++) g.sphere(0.07, rng.pick([0xffe8b0, 0xff4fa3, 0x3ff2e0]), 0, 4.4 - j * 0.12, 0.3 + j * 0.4);
      return piece(k, g, 0.6, 2.5, 4.6, [[0, 4.3, 0.8, 0xffe8b0]], 'prop');
    }
    case 3: { // paper lantern cluster on post
      k.cyl(0.05, 0.05, 3.2, 0x2a2a3a, 0, 1.6, 0);
      k.box(1.4, 0.05, 0.05, 0x2a2a3a, 0, 3.1, 0);
      const lights: [number, number, number, number][] = [];
      for (const sx of [-0.6, 0, 0.6]) {
        const c = rng.pick([0xff5a4e, 0xffc23a, 0xff4f6d]);
        g.sphere(0.22, c, sx, 2.7, 0, { sy: 1.2 });
        lights.push([sx, 2.7, 0, c]);
      }
      return piece(k, g, 1.6, 0.6, 3.3, lights, 'prop');
    }
    case 4: // crates and baskets
      k.box(0.9, 0.7, 0.9, 0x7a5a3a, 0, 0.35, 0, { r: 0.05 });
      k.cyl(0.4, 0.3, 0.5, 0xb88a4a, 0.9, 0.25, 0.2);
      for (let j = 0; j < 4; j++) k.sphere(0.12, 0xff8a3d, 0.8 + (j % 2) * 0.2, 0.55, 0.1 + j * 0.06);
      return piece(k, g, 1.8, 1, 0.8, [], 'prop');
    default: // vending machine
      k.box(0.9, 1.8, 0.7, 0xe8e4ff, 0, 0.9, 0, { r: 0.06 });
      g.box(0.7, 1.0, 0.04, 0x9fd8ff, 0, 1.1, 0.36);
      return piece(k, g, 1, 0.8, 1.8, [[0, 1.1, 0.5, 0x9fd8ff]], 'prop');
  }
}
