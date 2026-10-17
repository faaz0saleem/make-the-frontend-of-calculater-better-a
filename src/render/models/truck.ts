import * as THREE from 'three';
import { type PaintDef, accessoryById } from '../../data/cosmetics';
import type { VehicleKind } from '../../data/vehicles';
import { Kit, shade } from '../geo';
import { MAT } from '../materials';

export interface TruckAnchors {
  roofY: number;
  roofZ: number;
  hoodY: number;
  hoodZ: number;
  frontZ: number;
  rearZ: number;
  bedY: number;
  bedZ: number;
  bedLen: number;
  bedHalfW: number;
  wheelR: number;
  width: number;
  columnsZ: number[];
}

export interface TruckModel {
  root: THREE.Group; // positioned/yawed at the track pose
  body: THREE.Group; // suspension + roll
  cargoAnchor: THREE.Group; // child of body at bed floor centre
  wheels: THREE.Mesh[];
  wheelSpin: number;
  anchors: TruckAnchors;
  beacon?: THREE.Object3D;
  flag?: THREE.Object3D;
  dispose(): void;
}

const GLASS = 0x2b3b52;
const DARK = 0x262a33;
const TIRE = 0x23252b;
const HUB = 0xd9dde4;
const LIGHT_HEAD = 0xfff4cc;
const LIGHT_TAIL = 0xf0302a;
const LIGHT_IND = 0xffb02e;

interface BuildCtx {
  paint: Kit;
  chrome: Kit;
  lights: Kit;
  p: PaintDef;
}

/** Builds a truck model. Pure visuals: cosmetics never reach the simulation. */
export function buildTruck(kind: VehicleKind, paint: PaintDef, accessories: string[]): TruckModel {
  const ctx: BuildCtx = { paint: new Kit(), chrome: new Kit(), lights: new Kit(), p: paint };
  let anchors: TruckAnchors;
  let wheelPos: [number, number, number][] = [];
  switch (kind) {
    case 'van':
      anchors = buildVan(ctx);
      wheelPos = [[-0.86, 0.38, -1.35], [0.86, 0.38, -1.35], [-0.86, 0.38, 1.35], [0.86, 0.38, 1.35]];
      break;
    case 'trike':
      anchors = buildTrike(ctx);
      wheelPos = [[0, 0.34, -1.15], [-0.66, 0.34, 0.95], [0.66, 0.34, 0.95]];
      break;
    case 'flatbed':
      anchors = buildFlatbed(ctx);
      wheelPos = [[-0.9, 0.4, -1.95], [0.9, 0.4, -1.95], [-0.9, 0.4, 1.25], [0.9, 0.4, 1.25], [-0.9, 0.4, 2.15], [0.9, 0.4, 2.15]];
      break;
    case 'offroad':
      anchors = buildOffroad(ctx);
      wheelPos = [[-0.92, 0.55, -1.3], [0.92, 0.55, -1.3], [-0.92, 0.55, 1.3], [0.92, 0.55, 1.3]];
      break;
    default:
      anchors = buildPickup(ctx);
      wheelPos = [[-0.8, 0.36, -1.2], [0.8, 0.36, -1.2], [-0.8, 0.36, 1.2], [0.8, 0.36, 1.2]];
  }
  let beaconObj: THREE.Object3D | undefined;
  let flagObj: THREE.Object3D | undefined;
  const extra: THREE.Object3D[] = [];
  for (const id of accessories) {
    const acc = accessoryById(id);
    if (!acc) continue;
    const res = buildAccessory(id, ctx, anchors);
    if (res) {
      extra.push(res);
      if (id === 'beacon') beaconObj = res;
      if (id === 'flag') flagObj = res;
    }
  }

  const root = new THREE.Group();
  root.name = 'truck';
  const body = new THREE.Group();
  root.add(body);
  const paintMesh = new THREE.Mesh(ctx.paint.build(), MAT.paint);
  paintMesh.castShadow = true;
  body.add(paintMesh);
  if (!ctx.chrome.empty) {
    const m = new THREE.Mesh(ctx.chrome.build(), MAT.chrome);
    m.castShadow = true;
    body.add(m);
  }
  if (!ctx.lights.empty) body.add(new THREE.Mesh(ctx.lights.build(), MAT.lamp));
  for (const e of extra) body.add(e);

  const wheelGeo = wheelGeometry(anchors.wheelR, kind === 'offroad' ? 0.42 : kind === 'trike' ? 0.22 : 0.3);
  const wheels: THREE.Mesh[] = [];
  for (const [x, y, z] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, MAT.paintMatte);
    w.position.set(x, y, z);
    w.castShadow = true;
    root.add(w); // wheels stay on the road while the body rolls
    wheels.push(w);
  }
  const cargoAnchor = new THREE.Group();
  cargoAnchor.position.set(0, anchors.bedY, anchors.bedZ);
  body.add(cargoAnchor);
  return {
    root, body, cargoAnchor, wheels, wheelSpin: 0, anchors, beacon: beaconObj, flag: flagObj,
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry !== wheelGeo) o.geometry.dispose();
      });
      wheelGeo.dispose();
    },
  };
}

function wheelGeometry(r: number, w: number): THREE.BufferGeometry {
  const k = new Kit();
  k.cyl(r, r, w, TIRE, 0, 0, 0, { rz: Math.PI / 2, seg: 18 });
  k.cyl(r * 0.62, r * 0.62, w + 0.02, HUB, 0, 0, 0, { rz: Math.PI / 2, seg: 14 });
  k.cyl(r * 0.22, r * 0.22, w + 0.05, 0x8a9099, 0, 0, 0, { rz: Math.PI / 2, seg: 8 });
  // tread blocks so spinning reads
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.box(w * 1.02, r * 0.16, r * 0.3, 0x1a1c21, 0, Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97, { rx: -a });
  }
  return k.build();
}

/** Applies paint pattern details onto a body side/hood region. */
function pattern(ctx: BuildCtx, halfW: number, y0: number, y1: number, z0: number, z1: number, hoodY: number, hoodZ0: number, hoodZ1: number): void {
  const { paint: k, p } = ctx;
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  switch (p.pattern) {
    case 'twoTone':
      k.box(halfW * 2 + 0.02, (y1 - y0) * 0.45, len * 0.98, p.trim, 0, y0 + (y1 - y0) * 0.22, zc, { r: 0.05 });
      break;
    case 'stripe':
      k.box(halfW * 2 + 0.03, 0.12, len * 0.96, p.accent, 0, y0 + (y1 - y0) * 0.55, zc);
      k.box(0.18, 0.02, hoodZ1 - hoodZ0, p.accent, -0.16, hoodY + 0.005, (hoodZ0 + hoodZ1) / 2);
      k.box(0.18, 0.02, hoodZ1 - hoodZ0, p.accent, 0.16, hoodY + 0.005, (hoodZ0 + hoodZ1) / 2);
      break;
    case 'dots':
      for (let i = 0; i < 4; i++) {
        const z = z0 + len * (0.15 + i * 0.23);
        const y = y0 + (y1 - y0) * (i % 2 ? 0.35 : 0.65);
        for (const sx of [-1, 1]) k.cyl(0.13, 0.13, 0.02, p.accent, sx * (halfW + 0.005), y, z, { rz: Math.PI / 2 });
      }
      break;
    case 'checker':
      for (let i = 0; i < Math.floor(len / 0.22); i++) {
        for (let row = 0; row < 2; row++) {
          if ((i + row) % 2) continue;
          const z = z0 + 0.11 + i * 0.22;
          const y = y0 + (y1 - y0) * 0.5 + row * 0.15;
          for (const sx of [-1, 1]) k.box(0.02, 0.15, 0.22, p.accent, sx * (halfW + 0.006), y, z);
        }
      }
      break;
    case 'flames':
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const z = z0 + len * (0.08 + i * 0.12);
          const hgt = (y1 - y0) * (0.55 - i * 0.1);
          k.shape([[0, 0], [0.5 + i * 0.12, hgt * 0.5], [0, hgt]], 0.02, i % 2 ? p.trim : p.accent, sx * (halfW + 0.006), y0 + 0.05, z, { ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2 });
        }
      }
      break;
    default:
      break;
  }
}

function headTail(ctx: BuildCtx, halfW: number, y: number, frontZ: number, rearZ: number, tail = true): void {
  const L = ctx.lights;
  for (const sx of [-1, 1]) {
    L.box(0.26, 0.16, 0.05, LIGHT_HEAD, sx * (halfW - 0.2), y, frontZ - 0.01, { r: 0.04 });
    if (tail) L.box(0.22, 0.14, 0.05, LIGHT_TAIL, sx * (halfW - 0.18), y, rearZ + 0.01, { r: 0.03 });
    L.box(0.08, 0.06, 0.05, LIGHT_IND, sx * (halfW - 0.04), y - 0.12, frontZ - 0.01);
  }
}

function mirrors(ctx: BuildCtx, halfW: number, y: number, z: number): void {
  for (const sx of [-1, 1]) {
    ctx.paint.box(0.05, 0.05, 0.05, DARK, sx * (halfW + 0.06), y, z);
    ctx.paint.box(0.06, 0.16, 0.2, ctx.p.body, sx * (halfW + 0.12), y + 0.02, z, { r: 0.03 });
    ctx.chrome.box(0.02, 0.12, 0.15, 0xdfe6ee, sx * (halfW + 0.155), y + 0.02, z);
  }
}

function buildPickup(ctx: BuildCtx): TruckAnchors {
  const { paint: k, p } = ctx;
  const hw = 0.86;
  // chassis + wheel arches
  k.box(1.62, 0.22, 3.5, DARK, 0, 0.42, 0, { r: 0.06 });
  // cab body
  k.box(hw * 2, 0.55, 1.75, p.body, 0, 0.78, -0.9, { r: 0.16 });
  k.box(hw * 1.9, 0.52, 1.05, p.body, 0, 1.24, -0.7, { r: 0.2 });
  k.box(hw * 1.7, 0.36, 0.06, GLASS, 0, 1.28, -1.24, { rx: -0.25 });
  for (const sx of [-1, 1]) k.box(0.04, 0.32, 0.8, GLASS, sx * (hw * 0.95), 1.28, -0.7);
  k.box(hw * 1.75, 0.3, 0.05, GLASS, 0, 1.3, -0.17);
  // hood
  k.box(hw * 1.96, 0.12, 0.7, shade(p.body, 1.06), 0, 1.06, -1.42, { r: 0.05 });
  // bed
  k.box(hw * 2, 0.2, 1.75, p.body, 0, 0.72, 0.9, { r: 0.06 });
  for (const sx of [-1, 1]) k.box(0.1, 0.32, 1.75, p.body, sx * (hw - 0.05), 0.95, 0.9, { r: 0.04 });
  k.box(hw * 2, 0.32, 0.1, p.body, 0, 0.95, 1.75, { r: 0.04 });
  k.box(hw * 1.8, 0.04, 1.6, shade(p.body, 0.75), 0, 0.83, 0.9);
  // tailgate face (what the chase camera sees all game): pressed panel, handle, plate, tall tail lamps
  k.box(hw * 1.3, 0.17, 0.02, shade(p.body, 0.86), 0, 0.93, 1.805, { r: 0.008 });
  ctx.chrome.box(0.24, 0.045, 0.03, 0xe6ecf2, 0, 1.05, 1.81);
  k.box(0.36, 0.14, 0.02, 0xf4f1e8, 0, 0.5, 1.92, { r: 0.01 });
  k.box(0.26, 0.035, 0.012, 0x2b3a55, 0, 0.5, 1.932);
  for (const sx of [-1, 1]) ctx.lights.box(0.13, 0.3, 0.04, LIGHT_TAIL, sx * (hw - 0.1), 0.92, 1.805, { r: 0.025 });
  // bumpers & trim
  k.box(hw * 2.04, 0.18, 0.18, p.trim, 0, 0.5, -1.82, { r: 0.07 });
  k.box(hw * 2.04, 0.18, 0.18, p.trim, 0, 0.5, 1.82, { r: 0.07 });
  k.box(0.9, 0.22, 0.04, DARK, 0, 0.82, -1.79, { r: 0.03 });
  for (const sx of [-1, 1]) k.box(0.02, 0.3, 0.02, shade(p.body, 0.7), sx * (hw + 0.002), 0.85, -0.55);
  pattern(ctx, hw, 0.55, 1.05, -1.75, 1.75, 1.13, -1.75, -1.08);
  headTail(ctx, hw, 0.82, -1.8, 1.8, false); // tall tail lamps are on the tailgate above
  mirrors(ctx, hw, 1.12, -1.05);
  ctx.chrome.box(0.86, 0.04, 0.04, 0xe6ecf2, 0, 0.92, -1.8);
  return { roofY: 1.5, roofZ: -0.7, hoodY: 1.12, hoodZ: -1.45, frontZ: -1.9, rearZ: 1.9, bedY: 0.85, bedZ: 0.9, bedLen: 1.6, bedHalfW: 0.78, wheelR: 0.36, width: hw * 2, columnsZ: [0] };
}

function buildVan(ctx: BuildCtx): TruckAnchors {
  const { paint: k, p } = ctx;
  const hw = 0.97;
  k.box(1.8, 0.24, 4.0, DARK, 0, 0.44, 0, { r: 0.06 });
  // cab
  k.box(hw * 2, 1.1, 1.35, p.body, 0, 1.12, -1.3, { r: 0.22 });
  k.box(hw * 1.8, 0.42, 0.06, GLASS, 0, 1.38, -1.98, { rx: -0.18 });
  for (const sx of [-1, 1]) k.box(0.04, 0.36, 0.7, GLASS, sx * (hw - 0.01), 1.38, -1.35);
  k.box(hw * 2.02, 0.08, 1.3, p.trim, 0, 1.69, -1.3, { r: 0.04 });
  // cargo box with walls (open top)
  k.box(hw * 2, 0.16, 2.5, p.body, 0, 0.68, 0.72, { r: 0.05 });
  for (const sx of [-1, 1]) k.box(0.1, 0.62, 2.5, p.body, sx * (hw - 0.05), 1.05, 0.72, { r: 0.04 });
  k.box(hw * 2, 0.62, 0.1, p.body, 0, 1.05, 1.95, { r: 0.04 });
  k.box(hw * 2, 0.62, 0.1, shade(p.body, 0.9), 0, 1.05, -0.5, { r: 0.04 });
  k.box(hw * 1.8, 0.03, 2.3, shade(p.body, 0.72), 0, 0.77, 0.72);
  // rails
  for (const sx of [-1, 1]) ctx.chrome.box(0.05, 0.05, 2.4, 0xdfe6ee, sx * (hw - 0.05), 1.38, 0.72);
  k.box(hw * 2.04, 0.2, 0.2, p.trim, 0, 0.5, -2.02, { r: 0.08 });
  k.box(hw * 2.04, 0.2, 0.2, p.trim, 0, 0.5, 2.02, { r: 0.08 });
  k.box(1.0, 0.24, 0.04, DARK, 0, 0.82, -1.99);
  pattern(ctx, hw, 0.62, 1.32, -0.4, 1.9, 1.7, -1.9, -0.7);
  headTail(ctx, hw, 0.84, -2.0, 2.0);
  mirrors(ctx, hw, 1.3, -1.7);
  return { roofY: 1.74, roofZ: -1.3, hoodY: 1.7, hoodZ: -1.6, frontZ: -2.1, rearZ: 2.1, bedY: 0.79, bedZ: 0.72, bedLen: 2.3, bedHalfW: 0.86, wheelR: 0.38, width: hw * 2, columnsZ: [0] };
}

function buildTrike(ctx: BuildCtx): TruckAnchors {
  const { paint: k, p } = ctx;
  const hw = 0.72;
  k.box(0.5, 0.18, 1.6, DARK, 0, 0.38, -0.7, { r: 0.05 });
  k.box(1.4, 0.2, 1.5, DARK, 0, 0.42, 0.85, { r: 0.05 });
  // rounded front cab shell
  k.box(1.3, 0.75, 1.2, p.body, 0, 0.92, -0.75, { r: 0.32 });
  k.box(1.2, 0.34, 0.06, GLASS, 0, 1.18, -1.33, { rx: -0.35 });
  // canopy
  k.box(1.36, 0.08, 1.3, p.trim, 0, 1.47, -0.6, { r: 0.04 });
  for (const sx of [-1, 1]) k.cyl(0.03, 0.03, 0.55, DARK, sx * 0.6, 1.2, -0.05);
  k.box(1.32, 0.1, 0.18, p.accent, 0, 1.43, -1.24, { r: 0.04 });
  // bed
  k.box(hw * 2, 0.16, 1.45, p.body, 0, 0.72, 0.85, { r: 0.05 });
  for (const sx of [-1, 1]) k.box(0.08, 0.26, 1.45, p.body, sx * (hw - 0.04), 0.9, 0.85, { r: 0.03 });
  k.box(hw * 2, 0.26, 0.08, p.body, 0, 0.9, 1.56, { r: 0.03 });
  k.box(hw * 1.8, 0.03, 1.3, shade(p.body, 0.75), 0, 0.81, 0.85);
  // front fork/fender
  k.box(0.36, 0.14, 0.6, p.body, 0, 0.72, -1.15, { r: 0.06 });
  k.box(1.5, 0.14, 0.14, p.trim, 0, 0.48, 1.62, { r: 0.05 });
  pattern(ctx, 0.65, 0.6, 1.15, -1.2, -0.25, 1.3, -1.2, -0.9);
  ctx.lights.sphere(0.12, LIGHT_HEAD, 0, 0.98, -1.38, { sz: 0.5 });
  for (const sx of [-1, 1]) ctx.lights.box(0.18, 0.12, 0.05, LIGHT_TAIL, sx * 0.55, 0.86, 1.6);
  mirrors(ctx, 0.62, 1.16, -1.05);
  return { roofY: 1.52, roofZ: -0.6, hoodY: 1.3, hoodZ: -1.05, frontZ: -1.45, rearZ: 1.65, bedY: 0.82, bedZ: 0.85, bedLen: 1.3, bedHalfW: 0.66, wheelR: 0.34, width: hw * 2, columnsZ: [0] };
}

function buildFlatbed(ctx: BuildCtx): TruckAnchors {
  const { paint: k, p } = ctx;
  const hw = 1.02;
  k.box(1.7, 0.26, 5.3, DARK, 0, 0.48, 0.1, { r: 0.06 });
  // cab (cab-over style)
  k.box(hw * 2, 1.05, 1.45, p.body, 0, 1.12, -1.95, { r: 0.22 });
  k.box(hw * 1.8, 0.45, 0.06, GLASS, 0, 1.36, -2.69, { rx: -0.12 });
  for (const sx of [-1, 1]) k.box(0.04, 0.38, 0.7, GLASS, sx * (hw - 0.01), 1.36, -2.0);
  k.box(hw * 1.6, 0.18, 0.9, p.accent, 0, 1.74, -2.0, { r: 0.08 });
  k.box(1.2, 0.3, 0.04, DARK, 0, 0.8, -2.69);
  // flatbed deck with stake pockets
  k.box(hw * 2, 0.16, 3.7, 0x9a6b44, 0, 0.82, 0.85, { r: 0.03 });
  for (let i = 0; i < 6; i++) k.box(hw * 2 - 0.02, 0.02, 0.06, 0x7c5434, 0, 0.91, -0.9 + i * 0.7);
  for (const sx of [-1, 1]) {
    k.box(0.1, 0.12, 3.7, p.body, sx * (hw - 0.05), 0.84, 0.85);
    for (let i = 0; i < 4; i++) ctx.chrome.cyl(0.035, 0.035, 0.4, 0xc9d1da, sx * (hw - 0.05), 1.08, -0.6 + i * 1.0);
  }
  k.box(hw * 2, 0.5, 0.12, p.body, 0, 1.12, -1.15, { r: 0.04 });
  k.box(hw * 2.04, 0.2, 0.2, p.trim, 0, 0.52, -2.78, { r: 0.08 });
  k.box(hw * 2.04, 0.16, 0.16, p.trim, 0, 0.5, 2.75, { r: 0.06 });
  pattern(ctx, hw, 0.65, 1.3, -2.65, -1.25, 1.65, -2.6, -1.4);
  headTail(ctx, hw, 0.85, -2.72, 2.8);
  mirrors(ctx, hw, 1.38, -2.35);
  return { roofY: 1.84, roofZ: -2.0, hoodY: 1.66, hoodZ: -2.3, frontZ: -2.85, rearZ: 2.85, bedY: 0.91, bedZ: 0.85, bedLen: 3.6, bedHalfW: 0.95, wheelR: 0.4, width: hw * 2, columnsZ: [-0.95, 0.95] };
}

function buildOffroad(ctx: BuildCtx): TruckAnchors {
  const { paint: k, p } = ctx;
  const hw = 0.98;
  k.box(1.6, 0.3, 3.6, DARK, 0, 0.72, 0, { r: 0.08 });
  // lift kit visible
  for (const z of [-1.3, 1.3]) k.box(1.5, 0.12, 0.2, 0x3b3f48, 0, 0.6, z);
  k.box(hw * 2, 0.6, 1.8, p.body, 0, 1.14, -0.9, { r: 0.18 });
  k.box(hw * 1.9, 0.55, 1.05, p.body, 0, 1.62, -0.7, { r: 0.18 });
  k.box(hw * 1.7, 0.38, 0.06, GLASS, 0, 1.66, -1.24, { rx: -0.2 });
  for (const sx of [-1, 1]) k.box(0.04, 0.34, 0.82, GLASS, sx * (hw * 0.96), 1.66, -0.7);
  k.box(hw * 2.1, 0.12, 0.85, shade(p.body, 1.05), 0, 1.47, -1.4, { r: 0.05 });
  // fender flares
  for (const sx of [-1, 1]) for (const z of [-1.3, 1.3]) k.box(0.22, 0.14, 1.0, DARK, sx * (hw + 0.04), 1.02, z, { r: 0.06 });
  // bed (high floor)
  k.box(hw * 2, 0.22, 1.8, p.body, 0, 1.12, 0.9, { r: 0.06 });
  for (const sx of [-1, 1]) k.box(0.1, 0.3, 1.8, p.body, sx * (hw - 0.05), 1.36, 0.9, { r: 0.04 });
  k.box(hw * 2, 0.3, 0.1, p.body, 0, 1.36, 1.78, { r: 0.04 });
  k.box(hw * 1.8, 0.04, 1.65, shade(p.body, 0.75), 0, 1.24, 0.9);
  // roll bar
  ctx.chrome.box(0.08, 0.6, 0.08, 0xc9d1da, -0.8, 1.6, 0.1);
  ctx.chrome.box(0.08, 0.6, 0.08, 0xc9d1da, 0.8, 1.6, 0.1);
  ctx.chrome.box(1.68, 0.08, 0.08, 0xc9d1da, 0, 1.9, 0.1);
  k.box(hw * 2.08, 0.24, 0.22, p.trim, 0, 0.82, -1.86, { r: 0.08 });
  k.box(hw * 2.08, 0.24, 0.22, p.trim, 0, 0.82, 1.86, { r: 0.08 });
  pattern(ctx, hw, 0.9, 1.42, -1.75, 1.75, 1.53, -1.8, -1.0);
  headTail(ctx, hw, 1.18, -1.84, 1.84);
  mirrors(ctx, hw, 1.52, -1.05);
  // spare tire on the back
  k.cyl(0.32, 0.32, 0.2, TIRE, 0, 1.2, 1.98, { rx: Math.PI / 2 });
  return { roofY: 1.9, roofZ: -0.7, hoodY: 1.53, hoodZ: -1.45, frontZ: -1.98, rearZ: 2.1, bedY: 1.26, bedZ: 0.9, bedLen: 1.65, bedHalfW: 0.88, wheelR: 0.55, width: hw * 2, columnsZ: [0] };
}

function buildAccessory(id: string, ctx: BuildCtx, a: TruckAnchors): THREE.Object3D | null {
  const k = new Kit();
  const chrome = new Kit();
  const lamp = new Kit();
  const g = new THREE.Group();
  switch (id) {
    case 'beacon':
      k.cyl(0.14, 0.16, 0.08, DARK, 0, 0.04, 0);
      lamp.sphere(0.13, 0xffa62b, 0, 0.14, 0, { sy: 0.9 });
      g.position.set(0, a.roofY, a.roofZ);
      break;
    case 'duck':
      k.sphere(0.13, 0xffd23a, 0, 0.12, 0, { sz: 1.25 });
      k.sphere(0.085, 0xffd23a, 0, 0.27, -0.08);
      k.cone(0.04, 0.09, 0xff8a2b, 0, 0.26, -0.18, { rx: -Math.PI / 2 });
      k.sphere(0.015, 0x111111, 0.04, 0.3, -0.13);
      k.sphere(0.015, 0x111111, -0.04, 0.3, -0.13);
      g.position.set(0.25, a.hoodY, a.hoodZ);
      break;
    case 'flag':
      chrome.cyl(0.012, 0.012, 1.0, 0xd9dde4, 0, 0.5, 0);
      k.shape([[0, 0], [0.42, 0.11], [0, 0.22]], 0.02, ctx.p.accent, 0.01, 0.75, 0, { ry: Math.PI / 2 });
      g.position.set(-a.width / 2 + 0.12, a.roofY - 0.05, a.roofZ + 0.3);
      break;
    case 'bullbar':
      chrome.cyl(0.04, 0.04, a.width * 0.85, 0xe6ecf2, 0, 0.75, 0, { rz: Math.PI / 2 });
      chrome.cyl(0.04, 0.04, a.width * 0.6, 0xe6ecf2, 0, 1.0, 0.02, { rz: Math.PI / 2 });
      for (const sx of [-1, 1]) chrome.cyl(0.04, 0.04, 0.6, 0xe6ecf2, sx * a.width * 0.3, 0.75, 0.0);
      g.position.set(0, -0.08, a.frontZ - 0.12);
      break;
    case 'spoiler':
      k.box(a.width * 0.9, 0.05, 0.32, ctx.p.accent, 0, 0.32, 0, { r: 0.02, rx: -0.12 });
      for (const sx of [-1, 1]) k.box(0.05, 0.3, 0.12, DARK, sx * a.width * 0.35, 0.15, 0);
      g.position.set(0, a.roofY - 0.05, a.roofZ + 0.45);
      break;
    case 'horns':
      for (const sx of [-1, 1]) chrome.cone(0.07, 0.5, 0xe6ecf2, sx * 0.18, 0.08, 0, { rx: Math.PI / 2 });
      k.box(0.5, 0.06, 0.12, DARK, 0, 0.03, 0.1);
      g.position.set(0, a.roofY, a.roofZ);
      break;
    case 'crown':
      k.cyl(0.16, 0.16, 0.12, 0xf2c14e, 0, 0.06, 0, { seg: 10 });
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        k.cone(0.045, 0.14, 0xf2c14e, Math.cos(ang) * 0.14, 0.18, Math.sin(ang) * 0.14);
        lamp.sphere(0.025, 0xff4fa3, Math.cos(ang) * 0.14, 0.27, Math.sin(ang) * 0.14);
      }
      g.position.set(0, a.hoodY, a.hoodZ);
      break;
    default:
      return null;
  }
  if (!k.empty) {
    const m = new THREE.Mesh(k.build(), MAT.paint);
    m.castShadow = true;
    g.add(m);
  }
  if (!chrome.empty) g.add(new THREE.Mesh(chrome.build(), MAT.chrome));
  if (!lamp.empty) g.add(new THREE.Mesh(lamp.build(), MAT.lamp));
  return g;
}
