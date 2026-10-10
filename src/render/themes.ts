import type { WorldId } from '../sim/types';

/** Art direction per world. All colours are sRGB hex. */
export interface Theme {
  id: WorldId;
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sun: number;
  sunIntensity: number;
  sunDir: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  exposure: number;
  road: number;
  roadLine: number;
  roadEdge: number;
  roadRough: number;
  roadMetal: number;
  sidewalk: number;
  curb: number;
  ground: number;
  wall: number;
  buildings: number[];
  roofs: number[];
  trims: number[];
  awnings: [number, number][];
  water: number;
  glow: number[];
  night: boolean;
  starCount: number;
}

export const THEMES: Record<WorldId, Theme> = {
  1: {
    id: 1,
    skyTop: 0x4fb3f2, skyMid: 0x9fd8ff, skyHorizon: 0xffe6c4,
    fog: 0xf7e2c6, fogNear: 70, fogFar: 260,
    sun: 0xffe0b0, sunIntensity: 2.6, sunDir: [-0.45, 0.8, 0.35],
    hemiSky: 0xcfe8ff, hemiGround: 0xe7c49b, hemiIntensity: 1.25, exposure: 1.0,
    road: 0x5d6573, roadLine: 0xd9d0bc, roadEdge: 0xffcc4d, roadRough: 0.85, roadMetal: 0.0,
    sidewalk: 0xdcc9a8, curb: 0xc2b090, ground: 0xd9c8a4, wall: 0xe8e2d6,
    buildings: [0xff8a65, 0xffd166, 0x7fd1ae, 0x6cb4ee, 0xf28cb1, 0xfff1d6, 0xe9786a, 0x9ad0c2, 0xffb347],
    roofs: [0xc4553b, 0x3e6e8e, 0x8f4a3a, 0x2f5d62, 0xb5523b],
    trims: [0xfff6e6, 0xffffff, 0xf5e6c8],
    awnings: [[0xff5a4e, 0xfff6e6], [0x1fb5a5, 0xfff6e6], [0x2c4a7a, 0xfff2dc], [0xffc23a, 0xfff6e6]],
    water: 0x2fa3c7, glow: [0xffe8a0], night: false, starCount: 0,
  },
  2: {
    id: 2,
    skyTop: 0x5e9ee0, skyMid: 0xa9c8e8, skyHorizon: 0xffc58a,
    fog: 0xf3c596, fogNear: 60, fogFar: 240,
    sun: 0xffc27a, sunIntensity: 2.8, sunDir: [0.55, 0.55, 0.45],
    hemiSky: 0xbcd4f0, hemiGround: 0xd88a52, hemiIntensity: 1.15, exposure: 1.02,
    road: 0x7d6656, roadLine: 0xfff0d0, roadEdge: 0xf2f2f2, roadRough: 0.92, roadMetal: 0.0,
    sidewalk: 0xd9a066, curb: 0xb87c4a, ground: 0xdd9a5e, wall: 0xb8673e,
    buildings: [0xe0a066, 0xf2c48a, 0xc77a4a, 0xe8d0a8, 0x9ab37a],
    roofs: [0x7a4a2e, 0x5e3a24, 0x8c5a36],
    trims: [0xfff0d8, 0xf2dcb8],
    awnings: [[0xd9534f, 0xfff0d8], [0x3a7ca5, 0xfff0d8]],
    water: 0x4a90b8, glow: [0xffd38a], night: false, starCount: 0,
  },
  3: {
    id: 3,
    skyTop: 0x0d1330, skyMid: 0x2a2458, skyHorizon: 0x6b3f78,
    fog: 0x2a2148, fogNear: 45, fogFar: 200,
    sun: 0xa9b8ff, sunIntensity: 0.9, sunDir: [-0.3, 0.75, -0.4],
    hemiSky: 0x4a5aa8, hemiGround: 0x3a2638, hemiIntensity: 0.9, exposure: 1.12,
    road: 0x2c3040, roadLine: 0xe8e4ff, roadEdge: 0xffc93c, roadRough: 0.32, roadMetal: 0.25,
    sidewalk: 0x4a4458, curb: 0x5e5670, ground: 0x2e2a3c, wall: 0x3e3a52,
    buildings: [0x3b3f6b, 0x5a3a6a, 0x2f4f6a, 0x6a4a5a, 0x44507a, 0x7a5a3a],
    roofs: [0x22253f, 0x2e2240, 0x1e2d3a],
    trims: [0x8a86a8, 0x6a6488],
    awnings: [[0xff4fa3, 0x2a2148], [0x3ff2e0, 0x1d2a4d], [0xffc93c, 0x3a2a1a], [0x8a7dff, 0x1d1d3d]],
    water: 0x1d2d4d, glow: [0xff4fa3, 0x3ff2e0, 0xffc93c, 0x8a7dff, 0xffe8b0], night: true, starCount: 260,
  },
};
