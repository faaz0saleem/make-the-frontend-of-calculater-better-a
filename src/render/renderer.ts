import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { WorldId } from '../sim/types';
import { FollowCamera } from './camera';
import { Particles, Streaks } from './effects';
import { MAT } from './materials';
import { Sky } from './sky';
import { THEMES, type Theme } from './themes';
import { TruckView } from './truckView';
import { WorldView } from './world';

export type QualityName = 'low' | 'medium' | 'high';
export type QualitySetting = QualityName | 'auto';

export interface QualityPreset {
  name: QualityName;
  pixelCap: number;
  shadows: boolean;
  shadowSize: number;
  bloom: boolean;
  glow: boolean;
  density: number;
  particles: number;
}

export const PRESETS: Record<QualityName, QualityPreset> = {
  low: { name: 'low', pixelCap: 1, shadows: false, shadowSize: 0, bloom: false, glow: true, density: 0.45, particles: 90 },
  medium: { name: 'medium', pixelCap: 1.5, shadows: true, shadowSize: 1024, bloom: false, glow: true, density: 0.75, particles: 200 },
  high: { name: 'high', pixelCap: 2, shadows: true, shadowSize: 2048, bloom: true, glow: true, density: 1, particles: 320 },
};

/** Picks a starting preset from coarse device signals; FPS monitoring can lower it later. */
export function autoQuality(): QualityName {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 600;
  const mem = nav.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  if ((coarse && small) || mem <= 2 || cores <= 2) return 'low';
  if (coarse || mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly follow = new FollowCamera();
  readonly world: WorldView;
  readonly truck: TruckView;
  readonly sky = new Sky();
  particles: Particles;
  readonly streaks = new Streaks(110);
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  preset: QualityPreset;
  setting: QualitySetting;
  resolutionScale = 1;
  theme: Theme = THEMES[1];
  private envCache = new Map<WorldId, THREE.Texture>();
  private pmrem: THREE.PMREMGenerator;
  private width = 1;
  private height = 1;
  /** Optional alternate scene (garage) rendered instead of the world. */
  overlayScene: { scene: THREE.Scene; camera: THREE.Camera } | null = null;
  contextLost = false;

  constructor(readonly canvas: HTMLCanvasElement, setting: QualitySetting, resolutionScale: number) {
    this.setting = setting;
    this.preset = PRESETS[setting === 'auto' ? autoQuality() : setting];
    this.resolutionScale = resolutionScale;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: this.preset.name !== 'low', powerPreference: 'high-performance', alpha: false, stencil: false, preserveDrawingBuffer: __CAPTURE_MODE__,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
    });
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    MAT.init();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    const sc = this.sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 80;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.add(this.sky.group);
    this.world = new WorldView(this.scene);
    this.truck = new TruckView(this.scene);
    this.particles = new Particles(this.preset.particles);
    this.scene.add(this.particles.points);
    this.scene.add(this.streaks.lines);
    this.applyPreset();
    this.setTheme(1);
  }

  setQuality(setting: QualitySetting, resolutionScale: number): void {
    this.setting = setting;
    this.resolutionScale = resolutionScale;
    const next = PRESETS[setting === 'auto' ? autoQuality() : setting];
    this.preset = next;
    this.applyPreset();
  }

  /** Auto mode: step down one preset when frame time stays high. */
  degrade(): boolean {
    if (this.setting !== 'auto') return false;
    if (this.preset.name === 'high') this.preset = PRESETS.medium;
    else if (this.preset.name === 'medium') this.preset = PRESETS.low;
    else return false;
    this.applyPreset();
    return true;
  }

  private applyPreset(): void {
    const p = this.preset;
    this.renderer.shadowMap.enabled = p.shadows;
    this.sun.castShadow = p.shadows;
    if (p.shadows) {
      this.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.world.setQuality({ sceneryDensity: p.density, glow: p.glow, shadows: p.shadows });
    // particles capacity
    this.scene.remove(this.particles.points);
    this.particles.dispose();
    this.particles = new Particles(p.particles);
    this.scene.add(this.particles.points);
    this.setupComposer();
    this.resize(this.width, this.height);
    // materials need recompiling when shadow state changes
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
    });
  }

  private setupComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloomPass = null;
    if (!this.preset.bloom) return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.follow.cam));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.4, 1.0);
    this.bloomPass.strength = this.theme.night ? 0.42 : 0.22;
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  setTheme(world: WorldId): void {
    const t = THEMES[world];
    this.theme = t;
    MAT.applyTheme(t);
    this.sky.setTheme(t);
    this.world.setTheme(world);
    this.scene.fog = new THREE.Fog(t.fog, t.fogNear * (this.preset.name === 'low' ? 0.85 : 1), t.fogFar * (this.preset.name === 'low' ? 0.85 : 1));
    this.scene.background = new THREE.Color(t.skyHorizon);
    this.hemi.color.setHex(t.hemiSky);
    this.hemi.groundColor.setHex(t.hemiGround);
    this.hemi.intensity = t.hemiIntensity;
    this.sun.color.setHex(t.sun);
    this.sun.intensity = t.sunIntensity;
    this.renderer.toneMappingExposure = t.exposure;
    this.scene.environment = this.envFor(world);
    this.scene.environmentIntensity = t.night ? 0.55 : 0.4;
    if (this.bloomPass) this.bloomPass.strength = t.night ? 0.42 : 0.22;
  }

  /** Cheap image-based lighting: a gradient room with a few bright panels, prefiltered once. */
  private envFor(world: WorldId): THREE.Texture {
    const hit = this.envCache.get(world);
    if (hit) return hit;
    const t = THEMES[world];
    const env = new THREE.Scene();
    const geo = new THREE.SphereGeometry(50, 24, 12);
    const cols: number[] = [];
    const pos = geo.getAttribute('position');
    const c = new THREE.Color();
    const top = new THREE.Color(t.skyTop), hor = new THREE.Color(t.skyHorizon), gr = new THREE.Color(t.hemiGround);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      if (y >= 0) c.copy(hor).lerp(top, Math.min(1, y * 1.4));
      else c.copy(hor).lerp(gr, Math.min(1, -y * 3));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const panel = (color: number, intensity: number, x: number, y: number, z: number, w: number, h: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      (m.material as THREE.MeshBasicMaterial).color.multiplyScalar(intensity);
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    if (t.night) {
      t.glow.forEach((g, i) => panel(g, 3, Math.cos(i * 1.6) * 30, 6 + i * 2, Math.sin(i * 1.6) * 30, 14, 4));
    } else {
      panel(t.sun, 6, t.sunDir[0] * 40, t.sunDir[1] * 40, t.sunDir[2] * 40, 16, 16);
      panel(0xffffff, 1.5, -30, 20, -20, 30, 10);
    }
    const rt = this.pmrem.fromScene(env, 0.02);
    env.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.envCache.set(world, rt.texture);
    return rt.texture;
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    const dpr = Math.min(window.devicePixelRatio || 1, this.preset.pixelCap) * this.resolutionScale;
    this.renderer.setPixelRatio(Math.max(0.35, dpr));
    this.renderer.setSize(this.width, this.height, false);
    this.follow.setAspect(this.width / this.height);
    this.composer?.setPixelRatio(Math.max(0.35, dpr));
    this.composer?.setSize(this.width, this.height);
    if (this.bloomPass) this.bloomPass.resolution.set(this.width * 0.5, this.height * 0.5);
    this.particles.setViewport(this.height * Math.max(0.35, dpr));
  }

  /** Keep the shadow camera centred on the truck. */
  focusShadow(p: THREE.Vector3): void {
    const d = this.theme.sunDir;
    this.sun.position.set(p.x + d[0] * 40, p.y + d[1] * 40, p.z + d[2] * 40);
    this.sun.target.position.copy(p);
  }

  render(): void {
    if (this.contextLost) return;
    if (this.overlayScene) {
      this.renderer.render(this.overlayScene.scene, this.overlayScene.camera);
      return;
    }
    this.sky.follow(this.follow.cam);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.follow.cam);
  }

  info(): { calls: number; triangles: number; geometries: number; textures: number; programs: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0 };
  }
}
