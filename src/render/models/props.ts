import * as THREE from 'three';
import { Kit, shade } from '../geo';
import { canvasTexture } from '../materials';
import type { Theme } from '../themes';
import type { WorldId } from '../../sim/types';

/** Prop kits are added into per-chunk Kits (one merged mesh per chunk). Origin = base centre. */
export function coneKit(k: Kit, x: number, y: number, z: number, ry = 0): void {
  k.cyl(0.36, 0.36, 0.06, 0x2b2f3a, x, y + 0.03, z, { seg: 4, ry: ry + Math.PI / 4 });
  k.cone(0.24, 0.66, 0xff6a2b, x, y + 0.39, z, { seg: 12 });
  k.cyl(0.155, 0.19, 0.1, 0xfff6e6, x, y + 0.36, z, { seg: 12 });
  k.cyl(0.08, 0.11, 0.08, 0xfff6e6, x, y + 0.58, z, { seg: 12 });
}

export function cratePileKit(k: Kit, x: number, y: number, z: number, hw: number, ry: number, world: WorldId): void {
  const c = world === 2 ? 0xc9853f : world === 3 ? 0x7a5a8a : 0xb5793f;
  const n = Math.max(1, Math.round(hw * 1.6));
  for (let i = 0; i < n; i++) {
    const ox = -hw + (i + 0.5) * ((hw * 2) / n);
    k.box(0.75, 0.7, 0.75, i % 2 ? shade(c, 0.9) : c, x + Math.cos(ry) * ox, y + 0.35, z - Math.sin(ry) * ox, { r: 0.04, ry: ry + i * 0.2 });
    k.box(0.77, 0.06, 0.77, shade(c, 0.7), x + Math.cos(ry) * ox, y + 0.55, z - Math.sin(ry) * ox, { ry: ry + i * 0.2 });
  }
  if (n >= 2) k.box(0.6, 0.55, 0.6, shade(c, 1.1), x, y + 0.98, z, { r: 0.04, ry: ry + 0.4 });
}

/** Jersey barrier with hazard stripes; length along local X = 2*hw. */
export function barrierKit(k: Kit, x: number, y: number, z: number, hw: number, ry: number, world: WorldId): void {
  const base = world === 3 ? 0x3e3a52 : world === 2 ? 0xd9c3a0 : 0xf2efe8;
  const stripe = world === 3 ? 0xffc93c : 0xff4d3d;
  k.box(hw * 2, 0.35, 0.9, shade(base, 0.92), x, y + 0.18, z, { ry, r: 0.06 });
  k.box(hw * 2, 0.7, 0.55, base, x, y + 0.7, z, { ry, r: 0.08 });
  const n = Math.max(2, Math.round(hw * 2.2));
  for (let i = 0; i < n; i++) {
    const ox = -hw + 0.25 + i * ((hw * 2 - 0.5) / Math.max(1, n - 1));
    k.box(0.28, 0.5, 0.57, stripe, x + Math.cos(ry) * ox, y + 0.72, z - Math.sin(ry) * ox, { ry: ry + 0.0, rz: 0.5 });
  }
}

export function cartKit(k: Kit, x: number, y: number, z: number, hw: number, len: number, ry: number, world: WorldId, variant: number): void {
  // ry aligns the cart with the road; local Z = along road
  const L = new Kit();
  if (world === 1) {
    // fish market cart with umbrella
    L.box(hw * 2, 0.7, len * 0.9, 0x2f6f8f, 0, 0.75, 0, { r: 0.08 });
    L.box(hw * 2.05, 0.08, len * 0.92, 0xfff6e6, 0, 1.12, 0);
    for (let i = 0; i < 4; i++) L.sphere(0.12, 0x9cc7dd, -0.4 + i * 0.27, 1.2, 0, { sx: 1.6, sz: 0.7 });
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) L.cyl(0.18, 0.18, 0.1, 0x262a33, sx * hw * 0.9, 0.25, sz * len * 0.3, { rz: Math.PI / 2 });
    L.cyl(0.03, 0.03, 1.3, 0xdfe6ee, 0, 1.75, 0);
    L.cone(1.0, 0.35, variant % 2 ? 0xff5a4e : 0x1fb5a5, 0, 2.4, 0, { seg: 8 });
  } else if (world === 2) {
    // mine cart with ore
    L.box(hw * 1.9, 0.9, len * 0.85, 0x6b4a33, 0, 0.75, 0, { r: 0.06 });
    for (const yy of [0.45, 1.05]) L.box(hw * 1.95, 0.08, len * 0.87, 0x4a4f58, 0, yy, 0);
    for (let i = 0; i < 5; i++) L.sphere(0.25, i % 2 ? 0xe0a066 : 0xc77a4a, -0.5 + i * 0.25, 1.25, (i % 2) * 0.3 - 0.15);
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) L.cyl(0.2, 0.2, 0.1, 0x30343c, sx * hw * 0.92, 0.22, sz * len * 0.3, { rz: Math.PI / 2 });
  } else {
    // night market food cart with neon roof trim
    L.box(hw * 2, 0.95, len * 0.88, variant % 2 ? 0xff7a5a : 0x5a8aff, 0, 0.85, 0, { r: 0.1 });
    L.box(hw * 2.1, 0.08, len * 0.95, 0xf2efe8, 0, 1.35, 0);
    L.box(hw * 2.2, 0.12, len * 1.0, 0x2a2148, 0, 2.3, 0, { r: 0.05 });
    for (const sx of [-1, 1]) L.cyl(0.03, 0.03, 0.95, 0xdfe6ee, sx * hw * 0.95, 1.8, len * 0.4);
    for (const sx of [-1, 1]) L.cyl(0.03, 0.03, 0.95, 0xdfe6ee, sx * hw * 0.95, 1.8, -len * 0.4);
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) L.cyl(0.17, 0.17, 0.1, 0x262a33, sx * hw * 0.9, 0.2, sz * len * 0.3, { rz: Math.PI / 2 });
  }
  k.absorb(L, x, y, z, { ry });
}

export function bumpKit(k: Kit, x: number, y: number, z: number, hw: number, ry: number): void {
  const n = Math.max(2, Math.round(hw * 2 / 0.9));
  for (let i = 0; i < n; i++) {
    const ox = -hw + (i + 0.5) * ((hw * 2) / n);
    k.cyl(0.16, 0.16, (hw * 2) / n - 0.02, i % 2 ? 0x2b2f3a : 0xffc93c, x + Math.cos(ry) * ox, y + 0.02, z - Math.sin(ry) * ox, { rz: Math.PI / 2, ry, sx: 1, sy: 1, sz: 1.8, seg: 10 });
  }
}

/** Canvas sign textures (cached). */
const signCache = new Map<string, THREE.MeshStandardMaterial>();
export function signMaterial(label: string): THREE.MeshStandardMaterial {
  const hit = signCache.get(label);
  if (hit) return hit;
  const tex = canvasTexture(256, 256, (g) => drawSign(g, label));
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0, transparent: true, alphaTest: 0.05 });
  signCache.set(label, m);
  return m;
}

function drawSign(g: CanvasRenderingContext2D, label: string): void {
  const [kind, arg] = label.split(':');
  g.clearRect(0, 0, 256, 256);
  const font = (s: number) => `800 ${s}px Fredoka, "Trebuchet MS", system-ui, sans-serif`;
  const plate = (fill: string, stroke = '#24304a') => {
    g.fillStyle = stroke;
    roundRect(g, 8, 8, 240, 240, 34);
    g.fill();
    g.fillStyle = fill;
    roundRect(g, 20, 20, 216, 216, 26);
    g.fill();
  };
  const diamond = (fill: string) => {
    g.save();
    g.translate(128, 128);
    g.rotate(Math.PI / 4);
    g.fillStyle = '#24304a';
    roundRect(g, -84, -84, 168, 168, 22);
    g.fill();
    g.fillStyle = fill;
    roundRect(g, -72, -72, 144, 144, 16);
    g.fill();
    g.restore();
  };
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  switch (kind) {
    case 'clear': {
      plate('#ffc93c');
      g.fillStyle = '#24304a';
      // up/down arrows
      g.beginPath();
      g.moveTo(128, 34); g.lineTo(100, 70); g.lineTo(156, 70); g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(128, 222); g.lineTo(100, 186); g.lineTo(156, 186); g.closePath(); g.fill();
      g.font = font(74);
      g.fillText(`${arg}m`, 128, 130);
      break;
    }
    case 'hazard': {
      g.fillStyle = '#24304a';
      g.beginPath(); g.moveTo(128, 18); g.lineTo(244, 226); g.lineTo(12, 226); g.closePath(); g.fill();
      g.fillStyle = '#ff5a4e';
      g.beginPath(); g.moveTo(128, 50); g.lineTo(216, 208); g.lineTo(40, 208); g.closePath(); g.fill();
      g.fillStyle = '#fff6e6';
      g.font = font(110);
      g.fillText('!', 128, 150);
      break;
    }
    case 'route': {
      const risky = arg === 'risky';
      const roof = arg === 'roof';
      plate(risky ? '#ff8a3d' : roof ? '#8a7dff' : '#3cc9a7');
      g.fillStyle = '#fff6e6';
      g.font = font(risky ? 50 : 54);
      g.fillText(risky ? 'RISKY' : roof ? 'ROOF' : 'SAFE', 128, 88);
      g.font = font(70);
      g.fillText(risky ? '$$$' : roof ? '▲' : '✓', 128, 168);
      break;
    }
    case 'depot': {
      const bank = arg === 'bank';
      plate(bank ? '#3cc9a7' : '#ffc93c');
      g.fillStyle = bank ? '#fff6e6' : '#24304a';
      g.font = font(56);
      g.fillText(bank ? 'BANK' : 'CARRY', 128, 92);
      g.font = font(bank ? 74 : 54);
      g.fillText(bank ? '▶' : '◀ ×UP', 128, 168);
      break;
    }
    default: {
      diamond('#ffc93c');
      g.fillStyle = '#24304a';
      g.strokeStyle = '#24304a';
      g.lineWidth = 12;
      g.lineCap = 'round';
      if (kind === 'wind') {
        g.beginPath(); g.moveTo(70, 100); g.lineTo(150, 100); g.quadraticCurveTo(190, 100, 180, 75); g.stroke();
        g.beginPath(); g.moveTo(60, 135); g.lineTo(175, 135); g.stroke();
        g.beginPath(); g.moveTo(80, 170); g.lineTo(140, 170); g.quadraticCurveTo(175, 170, 165, 195); g.stroke();
      } else if (kind === 'curve-right' || kind === 'curve-left') {
        const d = kind === 'curve-right' ? 1 : -1;
        g.beginPath(); g.moveTo(128 - d * 30, 190); g.lineTo(128 - d * 30, 120); g.quadraticCurveTo(128 - d * 30, 80, 128 + d * 20, 80); g.stroke();
        g.beginPath(); g.moveTo(128 + d * 10, 55); g.lineTo(128 + d * 50, 80); g.lineTo(128 + d * 10, 105); g.closePath(); g.fill();
      } else if (kind === 'bumps') {
        g.beginPath(); g.moveTo(50, 170); g.quadraticCurveTo(90, 100, 128, 170); g.quadraticCurveTo(166, 100, 206, 170); g.stroke();
      } else if (kind === 'narrow') {
        g.beginPath(); g.moveTo(90, 200); g.lineTo(90, 150); g.lineTo(110, 110); g.lineTo(110, 60); g.stroke();
        g.beginPath(); g.moveTo(166, 200); g.lineTo(166, 150); g.lineTo(146, 110); g.lineTo(146, 60); g.stroke();
      } else if (kind === 'jump') {
        g.beginPath(); g.moveTo(50, 185); g.lineTo(150, 185); g.lineTo(150, 130); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(160, 120); g.quadraticCurveTo(190, 80, 210, 110); g.stroke();
      } else if (kind === 'hook') {
        g.beginPath(); g.moveTo(128, 45); g.lineTo(128, 140); g.stroke();
        g.beginPath(); g.arc(112, 150, 18, 0, Math.PI); g.stroke();
        g.fillRect(90, 165, 76, 36);
      } else if (kind === 'moving') {
        g.fillRect(60, 110, 136, 36);
        g.beginPath(); g.moveTo(40, 128); g.lineTo(62, 100); g.lineTo(62, 156); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(216, 128); g.lineTo(194, 100); g.lineTo(194, 156); g.closePath(); g.fill();
      } else {
        g.font = font(60);
        g.fillText('!', 128, 128);
      }
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Simple kit for a roadside sign post (plate mesh is separate, textured). */
export function signPostKit(k: Kit, x: number, y: number, z: number): void {
  k.cyl(0.05, 0.05, 2.2, 0x8a9099, x, y + 1.1, z, { seg: 8 });
}

export function themeAwning(t: Theme, i: number): [number, number] {
  return t.awnings[i % t.awnings.length];
}
