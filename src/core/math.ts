export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
/** Frame-rate independent exponential approach: returns factor for lerp. */
export const damp = (lambda: number, dt: number): number => 1 - Math.exp(-lambda * dt);
export const approach = (cur: number, target: number, maxDelta: number): number =>
  cur < target ? Math.min(cur + maxDelta, target) : Math.max(cur - maxDelta, target);
export const TAU = Math.PI * 2;
export const wrapAngle = (a: number): number => {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x < -Math.PI) x += TAU;
  return x;
};
export const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US');
