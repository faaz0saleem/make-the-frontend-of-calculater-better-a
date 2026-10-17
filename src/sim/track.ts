import { smoothstep } from '../core/math';
import type { EdgeKind, Feature, Pose, Segment, WorldId } from './types';

export const SAMPLE_STEP = 1;

export interface TrackSnapshot {
  segs: number;
  featIds: Set<number>;
  endS: number;
  endX: number;
  endZ: number;
  endHeading: number;
  endElev: number;
  endWidth: number;
}

export interface SegmentSpec {
  len: number;
  k0?: number;
  k1?: number;
  w0?: number;
  w1?: number;
  rise?: number;
  left?: EdgeKind;
  right?: EdgeKind;
}

/**
 * Track in "track space": s = distance along the centreline, x = lateral offset (+ right).
 * World-space centreline is integrated incrementally as segments are appended, so the
 * same structure serves fixed campaign routes and the endless generator.
 */
export class Track {
  segments: Segment[] = [];
  features: Feature[] = [];
  private nextFeatureId = 1;
  private cursor = 0;
  /** End of the last appended segment. */
  endS = 0;
  private endX = 0;
  private endZ = 0;
  private endHeading = 0;
  private endElev = 0;
  private endWidth = 4.5;
  /** Accumulated s removed by rebasing (for absolute distance). */
  sOffset = 0;

  constructor(public world: WorldId) {}

  get endPose(): { x: number; z: number; heading: number; elev: number; width: number } {
    return { x: this.endX, z: this.endZ, heading: this.endHeading, elev: this.endElev, width: this.endWidth };
  }

  appendSegment(spec: SegmentSpec, world: WorldId, chunk: number): Segment {
    const len = Math.max(1, spec.len);
    const k0 = spec.k0 ?? 0;
    const k1 = spec.k1 ?? k0;
    const w0 = spec.w0 ?? this.endWidth;
    const w1 = spec.w1 ?? w0;
    const e0 = this.endElev;
    const e1 = e0 + (spec.rise ?? 0);
    const n = Math.ceil(len / SAMPLE_STEP) + 1;
    const px = new Float64Array(n);
    const pz = new Float64Array(n);
    const hd = new Float64Array(n);
    let x = this.endX, z = this.endZ, h = this.endHeading;
    px[0] = x; pz[0] = z; hd[0] = h;
    // Integrate with midpoint rule over sub-steps for accuracy.
    const sub = 4;
    for (let i = 1; i < n; i++) {
      const uA = (i - 1) * SAMPLE_STEP;
      const uB = Math.min(len, i * SAMPLE_STEP);
      const du = (uB - uA) / sub;
      for (let j = 0; j < sub; j++) {
        const um = uA + (j + 0.5) * du;
        const k = k0 + (k1 - k0) * (um / len);
        const hm = h + k * du * 0.5;
        x += Math.sin(hm) * du;
        z -= Math.cos(hm) * du;
        h += k * du;
      }
      px[i] = x; pz[i] = z; hd[i] = h;
    }
    const seg: Segment = {
      s0: this.endS, len, k0, k1, w0, w1, e0, e1,
      left: spec.left ?? 'curb', right: spec.right ?? 'curb', world, chunk, px, pz, hd,
    };
    this.segments.push(seg);
    this.endS += len;
    this.endX = x; this.endZ = z; this.endHeading = h; this.endElev = e1; this.endWidth = w1;
    return seg;
  }

  addFeature(f: Omit<Feature, 'id'>): Feature {
    const feat = { ...f, id: this.nextFeatureId++ } as Feature;
    // keep features sorted by s (insertion near end typical)
    let i = this.features.length;
    while (i > 0 && this.features[i - 1].s > feat.s) i--;
    this.features.splice(i, 0, feat);
    return feat;
  }

  segmentAt(s: number): Segment {
    const segs = this.segments;
    if (segs.length === 0) throw new Error('empty track');
    let i = Math.min(this.cursor, segs.length - 1);
    if (s < segs[i].s0) {
      while (i > 0 && s < segs[i].s0) i--;
    } else {
      while (i < segs.length - 1 && s >= segs[i].s0 + segs[i].len) i++;
    }
    this.cursor = i;
    return segs[i];
  }

  /** Non-mutating lookup (does not move the shared cursor). */
  private findSeg(s: number): Segment {
    const segs = this.segments;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].s0 <= s) lo = mid; else hi = mid - 1;
    }
    return segs[lo];
  }

  poseAt(s: number, out?: Pose, useCursor = false): Pose {
    const seg = useCursor ? this.segmentAt(s) : this.findSeg(s);
    const u = Math.max(0, Math.min(seg.len, s - seg.s0));
    const fi = u / SAMPLE_STEP;
    const i0 = Math.min(seg.px.length - 2, Math.floor(fi));
    const t = Math.min(1, fi - i0);
    const tt = u / seg.len;
    const st = smoothstep(tt);
    const o = out ?? ({} as Pose);
    o.x = seg.px[i0] + (seg.px[i0 + 1] - seg.px[i0]) * t;
    o.z = seg.pz[i0] + (seg.pz[i0 + 1] - seg.pz[i0]) * t;
    o.heading = seg.hd[i0] + (seg.hd[i0 + 1] - seg.hd[i0]) * t;
    o.elev = seg.e0 + (seg.e1 - seg.e0) * st;
    o.halfWidth = seg.w0 + (seg.w1 - seg.w0) * st;
    o.curvature = seg.k0 + (seg.k1 - seg.k0) * tt;
    o.vcurv = ((seg.e1 - seg.e0) * (6 - 12 * tt)) / (seg.len * seg.len);
    o.left = seg.left;
    o.right = seg.right;
    o.world = seg.world;
    return o;
  }

  halfWidthAt(s: number): number {
    const seg = this.findSeg(s);
    const tt = Math.max(0, Math.min(1, (s - seg.s0) / seg.len));
    return seg.w0 + (seg.w1 - seg.w0) * smoothstep(tt);
  }

  snapshot(): TrackSnapshot {
    return {
      segs: this.segments.length, featIds: new Set(this.features.map((f) => f.id)), endS: this.endS, endX: this.endX,
      endZ: this.endZ, endHeading: this.endHeading, endElev: this.endElev, endWidth: this.endWidth,
    };
  }

  /** Roll back to a snapshot taken after the last trim (used for trial chunk placement). */
  restore(snap: TrackSnapshot): void {
    this.segments.length = snap.segs;
    this.features = this.features.filter((f) => snap.featIds.has(f.id));
    this.endS = snap.endS; this.endX = snap.endX; this.endZ = snap.endZ;
    this.endHeading = snap.endHeading; this.endElev = snap.endElev; this.endWidth = snap.endWidth;
    this.cursor = Math.min(this.cursor, Math.max(0, this.segments.length - 1));
  }

  /** Drop segments/features entirely behind `s` (endless recycling). Returns removed chunk ids. */
  trimBefore(s: number): Set<number> {
    const removed = new Set<number>();
    while (this.segments.length > 2 && this.segments[0].s0 + this.segments[0].len < s) {
      const seg = this.segments.shift()!;
      removed.add(seg.chunk);
      this.cursor = Math.max(0, this.cursor - 1);
    }
    let cut = 0;
    while (cut < this.features.length && this.features[cut].s + this.features[cut].len < s) cut++;
    if (cut > 0) this.features.splice(0, cut);
    // A chunk only counts as removed if none of its segments remain.
    for (const seg of this.segments) removed.delete(seg.chunk);
    return removed;
  }

  /** Shift all s values by -delta (precision rebasing for very long runs). */
  rebaseS(delta: number): void {
    for (const seg of this.segments) seg.s0 -= delta;
    for (const f of this.features) f.s -= delta;
    this.endS -= delta;
    this.sOffset += delta;
  }

  /** Shift world-space centreline by (-dx, -dz) (render-origin rebasing). */
  rebaseXZ(dx: number, dz: number): void {
    for (const seg of this.segments) {
      for (let i = 0; i < seg.px.length; i++) {
        seg.px[i] -= dx;
        seg.pz[i] -= dz;
      }
    }
    this.endX -= dx;
    this.endZ -= dz;
  }
}
