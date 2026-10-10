import * as THREE from 'three';
import type { CargoShape } from '../data/cargo';
import { makeCargoMesh } from './models/cargo';

/** Renders small thumbnails of the real cargo models (album / tooltips). Cached data URLs. */
export class Thumbnailer {
  private cache = new Map<string, string>();
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private rt: THREE.WebGLRenderTarget;
  private size = 128;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.rt = new THREE.WebGLRenderTarget(this.size, this.size, { samples: 4 });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a090, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(2, 4, 3);
    this.scene.add(d);
  }

  cargo(shape: CargoShape, silhouette = false): string {
    const key = `${shape}:${silhouette}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const g = makeCargoMesh(shape);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    g.position.sub(c);
    g.rotation.y = -0.6;
    const holder = new THREE.Group();
    holder.add(g);
    this.scene.add(holder);
    const r = Math.max(size.x, size.y, size.z);
    this.cam.position.set(0, r * 0.7, r * 2.6);
    this.cam.lookAt(0, 0, 0);
    const prevOverride = this.scene.overrideMaterial;
    if (silhouette) this.scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0x8a8478 });
    const prevTarget = this.renderer.getRenderTarget();
    const prevTone = this.renderer.toneMapping;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.cam);
    const px = new Uint8Array(this.size * this.size * 4);
    this.renderer.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, px);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.toneMapping = prevTone;
    this.scene.overrideMaterial = prevOverride;
    this.scene.remove(holder);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = this.size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(this.size, this.size);
    // flip Y
    for (let y = 0; y < this.size; y++) {
      const src = (this.size - 1 - y) * this.size * 4;
      img.data.set(px.subarray(src, src + this.size * 4), y * this.size * 4);
    }
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL('image/png');
    this.cache.set(key, url);
    return url;
  }
}
