import { TUNING as T } from '../data/tuning';
import type { Track } from '../sim/track';
import type { Feature } from '../sim/types';

/**
 * Route reachability validator.
 *
 * Dynamic programming over a grid in track space (1 m rows along s, 0.25 m columns across x).
 * A cell is reachable when the truck's centre can be there without a crash. Between rows the
 * reachable set may spread laterally by the distance the truck can travel sideways at the
 * slowest relevant forward speed bound (we use the highest speed: less time per metre),
 * derated by a slack factor and by corner drift. Ramps commit the truck to a ballistic
 * flight; landing zones must be clear for every speed in [vMin, vMax].
 */
export interface ReachVehicle {
  bodyHalf: number;
  length: number;
  maxLatSpeed: number;
  cabHeight: number;
}

export interface ReachOptions {
  vMin: number;
  vMax: number;
  /** Overheads lower than this are treated as blocking (load clearance guarantee). */
  loadClearance?: number;
  /** Lateral authority slack (0..1). */
  slack?: number;
  margin?: number;
}

export interface ReachResult {
  ok: boolean;
  failS?: number;
  frontier: Uint8Array; // reachable cells at the last row
  rows: number;
}

export const DX = 0.25;
export const XMAX = 9.5;
export const NCOL = Math.round((2 * XMAX) / DX) + 1;
const colX = (c: number): number => -XMAX + c * DX;
const xCol = (x: number): number => Math.round((x + XMAX) / DX);

export function flightDistance(v: number, h: number, slope: number): number {
  const vy = v * slope * T.rampLaunchFactor;
  const t = (vy + Math.sqrt(vy * vy + 2 * T.gravity * h)) / T.gravity;
  return v * t;
}

interface Launch {
  s: number; // launch row s
  x0: number;
  x1: number; // x range of the ramp/platform
  h: number;
  slope: number;
}

export function validateRange(
  track: Track,
  sStart: number,
  sEnd: number,
  veh: ReachVehicle,
  opt: ReachOptions,
  initial?: Uint8Array,
): ReachResult {
  const slack = opt.slack ?? 0.72;
  const margin = opt.margin ?? 0.15;
  const rows = Math.max(1, Math.floor(sEnd - sStart));
  let cur = new Uint8Array(NCOL);
  if (initial) cur.set(initial);
  else {
    // Start anywhere on the road that is free.
    const W = track.halfWidthAt(sStart);
    for (let c = 0; c < NCOL; c++) if (Math.abs(colX(c)) <= W - veh.bodyHalf) cur[c] = 1;
  }
  const feats = track.features.filter((f) => f.s + f.len >= sStart - 20 && f.s <= sEnd + 60);
  const hard = feats.filter((f) => isBlocking(f, veh, opt));
  const gaps = feats.filter((f) => f.kind === 'gap');
  const ramps = feats.filter((f) => f.kind === 'ramp' || f.kind === 'platform');
  // Pending landings: row index -> cells
  const landings = new Map<number, Uint8Array>();
  const halfL = veh.length * 0.5;
  const blocked = new Uint8Array(NCOL);
  const next = new Uint8Array(NCOL);
  const pose = { curvature: 0 } as { curvature: number };

  for (let r = 0; r < rows; r++) {
    const s = sStart + r;
    // Build the blocked mask for row s
    blocked.fill(0);
    const W = track.halfWidthAt(s);
    for (let c = 0; c < NCOL; c++) if (Math.abs(colX(c)) > W - veh.bodyHalf + 0.05) blocked[c] = 1;
    for (const f of hard) {
      if (s < f.s - halfL || s > f.s + f.len + halfL) continue;
      const amp = Math.abs(f.amp ?? 0);
      const reach = veh.bodyHalf + f.hw + amp + margin;
      const c0 = Math.max(0, Math.floor((f.x - reach + XMAX) / DX));
      const c1 = Math.min(NCOL - 1, Math.ceil((f.x + reach + XMAX) / DX));
      for (let c = c0; c <= c1; c++) blocked[c] = 1;
    }
    for (const g of gaps) {
      if (s < g.s - 0.5 || s > g.s + g.len + 0.5) continue;
      const c0 = Math.max(0, xCol(g.x - g.hw - 0.1));
      const c1 = Math.min(NCOL - 1, xCol(g.x + g.hw + 0.1));
      for (let c = c0; c <= c1; c++) blocked[c] = 1;
    }
    // Ramp/platform sides are solid once raised; the top is only reachable from the start.
    const commitThisRow: Feature[] = [];
    for (const f of ramps) {
      if (s < f.s || s > f.s + f.len) continue;
      if (f.kind === 'ramp' && Math.abs(s - f.s) < 0.5) {
        commitThisRow.push(f);
        continue;
      }
      if (f.kind === 'platform' && isFedByRamp(f, ramps)) {
        // fully blocked for ground traffic; elevated traffic handled by launch logic
      }
      const reach = veh.bodyHalf + f.hw;
      const c0 = Math.max(0, Math.floor((f.x - reach + XMAX) / DX));
      const c1 = Math.min(NCOL - 1, Math.ceil((f.x + reach + XMAX) / DX));
      for (let c = c0; c <= c1; c++) blocked[c] = 1;
    }

    // Spread laterally from cur into next
    track.poseAt(s, pose as never);
    const v = opt.vMax;
    const drift = T.cornerDrift * v * v * Math.abs(pose.curvature);
    const lat = Math.max(0.6, (veh.maxLatSpeed - drift) * slack);
    const spread = Math.max(1, Math.floor(lat / v / DX)); // cells per 1 m row
    next.fill(0);
    let any = false;
    for (let c = 0; c < NCOL; c++) {
      if (!cur[c]) continue;
      const lo = Math.max(0, c - spread), hi = Math.min(NCOL - 1, c + spread);
      for (let d = lo; d <= hi; d++) next[d] = 1;
    }
    // Ramp commits: cells inside a ramp's start window launch the truck.
    for (const f of commitThisRow) {
      const c0 = Math.max(0, xCol(f.x - f.hw));
      const c1 = Math.min(NCOL - 1, xCol(f.x + f.hw));
      const launch = launchFor(f, ramps);
      let committed = false;
      const landed = new Uint8Array(NCOL);
      for (let c = c0; c <= c1; c++) {
        if (!next[c]) continue;
        next[c] = 0; // the truck is now on the ramp, out of the ground grid
        committed = true;
        // Elevated platforms allow lateral movement within the platform range.
        if (launch.x1 - launch.x0 > 0.5) {
          const pc0 = Math.max(0, xCol(launch.x0 + veh.bodyHalf * 0.2));
          const pc1 = Math.min(NCOL - 1, xCol(launch.x1 - veh.bodyHalf * 0.2));
          for (let pc = pc0; pc <= pc1; pc++) landed[pc] = 1;
        } else landed[c] = 1;
      }
      if (!committed) continue;
      const dMin = flightDistance(opt.vMin, launch.h, launch.slope);
      const dMax = flightDistance(opt.vMax, launch.h, launch.slope);
      // Landing zone check (gaps and hard obstacles between the shortest and longest landing)
      const zoneStart = launch.s + dMin - 1.5;
      const zoneEnd = launch.s + dMax + 8;
      for (let c = 0; c < NCOL; c++) {
        if (!landed[c]) continue;
        const x = colX(c);
        if (!landingClear(track, feats, x, zoneStart, zoneEnd, veh, opt)) landed[c] = 0;
      }
      const landRow = Math.ceil(zoneEnd - sStart);
      const prev = landings.get(landRow) ?? new Uint8Array(NCOL);
      for (let c = 0; c < NCOL; c++) if (landed[c]) prev[c] = 1;
      landings.set(landRow, prev);
    }
    // Merge landings arriving at this row
    const land = landings.get(r);
    if (land) {
      for (let c = 0; c < NCOL; c++) if (land[c]) next[c] = 1;
      landings.delete(r);
    }
    for (let c = 0; c < NCOL; c++) {
      if (blocked[c]) next[c] = 0;
      if (next[c]) any = true;
    }
    // Trucks in flight survive rows where the ground grid is empty.
    let inFlight = false;
    for (const k of landings.keys()) if (k > r) inFlight = true;
    if (!any && !inFlight) return { ok: false, failS: s, frontier: next.slice(), rows };
    const tmp = cur;
    cur = next.slice();
    tmp.fill(0);
  }
  // Any landings beyond the range still count as reachable continuations.
  let pendingLanding = false;
  for (const [row, cells] of landings) {
    if (row >= rows) for (let c = 0; c < NCOL; c++) if (cells[c]) { cur[c] = 1; pendingLanding = true; }
  }
  let any = pendingLanding;
  for (let c = 0; c < NCOL; c++) if (cur[c]) any = true;
  return { ok: any, failS: any ? undefined : sEnd, frontier: cur, rows };
}

export function isBlocking(f: Feature, veh: ReachVehicle, opt: ReachOptions): boolean {
  if (f.kind === 'barrier' || f.kind === 'cart' || f.kind === 'movingBarrier' || f.kind === 'wall') return true;
  if (f.kind === 'overhead') return f.h < veh.cabHeight + 0.05 || (opt.loadClearance !== undefined && f.h < opt.loadClearance);
  return false;
}

function isFedByRamp(p: Feature, ramps: Feature[]): boolean {
  return ramps.some((r) => r.kind === 'ramp' && Math.abs(r.s + r.len - p.s) < 0.6 && Math.abs(r.x - p.x) < 0.2);
}

function launchFor(ramp: Feature, ramps: Feature[]): Launch {
  const plat = ramps.find((p) => p.kind === 'platform' && Math.abs(ramp.s + ramp.len - p.s) < 0.6 && Math.abs(ramp.x - p.x) < 0.2);
  if (plat) return { s: plat.s + plat.len, x0: plat.x - plat.hw, x1: plat.x + plat.hw, h: plat.h, slope: 0 };
  return { s: ramp.s + ramp.len, x0: ramp.x, x1: ramp.x, h: ramp.h, slope: ramp.h / ramp.len };
}

function landingClear(track: Track, feats: Feature[], x: number, s0: number, s1: number, veh: ReachVehicle, opt: ReachOptions): boolean {
  for (let s = s0; s <= s1; s += 1) {
    const W = track.halfWidthAt(s);
    if (Math.abs(x) > W - veh.bodyHalf * 0.5) return false;
  }
  for (const f of feats) {
    if (f.s > s1 + veh.length || f.s + f.len < s0 - veh.length) continue;
    if (f.kind === 'gap') {
      if (Math.abs(x - f.x) < f.hw + 0.2) {
        // Landing inside a gap zone is fatal; the zone starts after the shortest landing so
        // a gap fully before s0 is fine.
        if (f.s + f.len > s0) return false;
      }
      continue;
    }
    if (isBlocking(f, veh, opt) && Math.abs(x - f.x) < veh.bodyHalf + f.hw + Math.abs(f.amp ?? 0) + 0.1) return false;
  }
  return true;
}

export const reachVehicleFrom = (h: { bodyHalf: number; length: number; maxLatSpeed: number; cabHeight: number }): ReachVehicle => ({
  bodyHalf: h.bodyHalf, length: h.length, maxLatSpeed: h.maxLatSpeed, cabHeight: h.cabHeight,
});
