import * as THREE from 'three';
import type { Theme } from './themes';

/** Canvas helper (works in browsers; tests never import the renderer). */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function radialTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  return canvasTexture(size, size, (g) => {
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  });
}

function asphaltTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 256, 256);
    // speckle noise for aggregate
    const img = g.getImageData(0, 0, 256, 256);
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 118 + (rnd() - 0.5) * 34 + (rnd() < 0.02 ? 30 : 0);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
    g.putImageData(img, 0, 0);
    // a few soft patches
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? 90 : 150},${rnd() < 0.5 ? 90 : 150},${rnd() < 0.5 ? 90 : 150},0.06)`;
      g.beginPath();
      g.ellipse(rnd() * 256, rnd() * 256, 20 + rnd() * 40, 10 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const TEX = {
  get blob(): THREE.CanvasTexture { return (_blob ??= radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)')); },
  get glow(): THREE.CanvasTexture { return (_glow ??= radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)')); },
  get asphalt(): THREE.CanvasTexture { return (_asphalt ??= asphaltTexture()); },
  get dot(): THREE.CanvasTexture {
    return (_dot ??= canvasTexture(64, 64, (g) => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    }));
  },
};
let _blob: THREE.CanvasTexture | undefined;
let _glow: THREE.CanvasTexture | undefined;
let _asphalt: THREE.CanvasTexture | undefined;
let _dot: THREE.CanvasTexture | undefined;

class MaterialSet {
  paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide });
  paintMatte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  scenery = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
  chrome = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.92 });
  lamp = new THREE.MeshBasicMaterial({ vertexColors: true });
  neon = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  windowLit = new THREE.MeshBasicMaterial({ vertexColors: true });
  road = new THREE.MeshStandardMaterial({ color: 0x626a78, roughness: 0.85, metalness: 0 });
  water = new THREE.MeshStandardMaterial({ color: 0x2fa3c7, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  /**
   * Road coins: vertex-coloured gold (rim/face/star) with a little self-light so they stay bright gold
   * at night. The glow is tinted by the vertex colour, so rim, face and star keep their contrast.
   */
  coin = coinMaterial();
  puddle = new THREE.MeshStandardMaterial({ color: 0x5a7da8, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55, depthWrite: false });
  blob = new THREE.MeshBasicMaterial({ map: null, transparent: true, depthWrite: false, opacity: 0.85 });
  glowSprite = new THREE.SpriteMaterial({ map: null, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  pickupRing = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  gust = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  chasm = new THREE.MeshBasicMaterial({ color: 0x3a1a10 });
  sign = new Map<string, THREE.MeshStandardMaterial>();
  private inited = false;

  init(): void {
    if (this.inited) return;
    this.inited = true;
    this.road.map = TEX.asphalt;
    this.blob.map = TEX.blob;
    this.glowSprite.map = TEX.glow;
    this.lamp.color.setScalar(1.7);
    this.neon.color.setScalar(1.8);
    this.windowLit.color.setScalar(0.85);
  }

  applyTheme(t: Theme): void {
    this.init();
    this.road.color.setHex(t.road);
    this.road.roughness = t.roadRough;
    this.road.metalness = t.roadMetal;
    this.water.color.setHex(t.water);
    this.scenery.roughness = t.night ? 0.62 : 0.78;
    this.coin.emissiveIntensity = t.night ? 0.55 : 0.22;
    this.road.needsUpdate = true;
  }
}

function coinMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.35, emissive: 0xffffff, emissiveIntensity: 0.2 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;');
  };
  return m;
}

export const MAT = new MaterialSet();
