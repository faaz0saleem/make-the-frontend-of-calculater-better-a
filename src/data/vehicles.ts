export type VehicleKind = 'pickup' | 'van' | 'trike' | 'flatbed' | 'offroad';

export interface VehicleStats {
  maxLatSpeed: number; // m/s lateral speed at full steer
  latAccel: number; // m/s^2 lateral acceleration limit
  rollStiffness: number; // multiplier, higher = less roll
  trackHalf: number; // m half wheel track (rollover lever)
  bodyHalf: number; // m collision half width
  length: number; // m collision length
  cabHeight: number; // m roof height of cab (overhead crash height)
  bedHeight: number; // m height of the cargo floor
  bedWall: number; // m side wall height supporting the lowest cargo (0 = none)
  columns: 1 | 2;
  capacity: number; // items per column
  suspension: number; // 0..1 jolt absorption
  grip: number; // multiplier on lateral response and puddle resistance
  support: number; // multiplier on stack stiffness
  mass: number; // kg
}

export interface VehicleDef {
  id: VehicleKind;
  name: string;
  tagline: string;
  strengths: string;
  weakness: string;
  price: number;
  stats: VehicleStats;
}

export const VEHICLES: Record<VehicleKind, VehicleDef> = {
  pickup: {
    id: 'pickup', name: 'Pip Pickup', tagline: 'The plucky starter that can do a bit of everything.',
    strengths: 'Balanced steering and stability', weakness: 'No special tricks', price: 0,
    stats: { maxLatSpeed: 6.2, latAccel: 21, rollStiffness: 1.0, trackHalf: 0.86, bodyHalf: 0.88, length: 3.6, cabHeight: 1.55, bedHeight: 0.82, bedWall: 0, columns: 1, capacity: 8, suspension: 0.3, grip: 1.0, support: 1.0, mass: 900 },
  },
  van: {
    id: 'van', name: 'Bramble Box Van', tagline: 'Walled cargo box keeps the bottom of your stack locked in.',
    strengths: 'Very stable, cargo walls', weakness: 'Slower steering', price: 1800,
    stats: { maxLatSpeed: 5.5, latAccel: 17.5, rollStiffness: 1.35, trackHalf: 0.95, bodyHalf: 0.98, length: 4.1, cabHeight: 1.8, bedHeight: 0.78, bedWall: 0.55, columns: 1, capacity: 9, suspension: 0.4, grip: 0.95, support: 1.15, mass: 1300 },
  },
  trike: {
    id: 'trike', name: 'Zippi Trike', tagline: 'Three wheels, zero hesitation. Slips through tight gaps.',
    strengths: 'Fast, narrow, nimble', weakness: 'Tips over easily', price: 2400,
    stats: { maxLatSpeed: 7.5, latAccel: 27, rollStiffness: 0.82, trackHalf: 0.72, bodyHalf: 0.74, length: 3.1, cabHeight: 1.45, bedHeight: 0.8, bedWall: 0, columns: 1, capacity: 7, suspension: 0.25, grip: 1.1, support: 0.95, mass: 600 },
  },
  flatbed: {
    id: 'flatbed', name: 'Longbed Hauler', tagline: 'Two cargo columns mean lower, steadier stacks.',
    strengths: 'Huge capacity, low stacks', weakness: 'Wide and slow to steer', price: 3800,
    stats: { maxLatSpeed: 5.2, latAccel: 16.5, rollStiffness: 1.15, trackHalf: 0.98, bodyHalf: 1.06, length: 5.4, cabHeight: 1.7, bedHeight: 0.9, bedWall: 0, columns: 2, capacity: 7, suspension: 0.35, grip: 1.0, support: 1.0, mass: 1600 },
  },
  offroad: {
    id: 'offroad', name: 'Bruiser 4x4', tagline: 'Monster suspension shrugs off bumps, jumps and puddles.',
    strengths: 'Soaks up landings and bumps', weakness: 'High cargo floor', price: 5200,
    stats: { maxLatSpeed: 6.0, latAccel: 20, rollStiffness: 0.95, trackHalf: 1.0, bodyHalf: 1.04, length: 3.9, cabHeight: 2.0, bedHeight: 1.25, bedWall: 0, columns: 1, capacity: 8, suspension: 0.78, grip: 1.2, support: 1.05, mass: 1500 },
  },
};

export const VEHICLE_IDS = Object.keys(VEHICLES) as VehicleKind[];

/** 0..1 comparison values for garage stat bars. */
export function statBars(s: VehicleStats): { label: string; value: number }[] {
  return [
    { label: 'Steering', value: (s.maxLatSpeed - 4.5) / 3.5 * 0.6 + (s.latAccel - 14) / 15 * 0.4 },
    { label: 'Stability', value: (s.rollStiffness * s.trackHalf - 0.5) / 0.85 },
    { label: 'Suspension', value: s.suspension },
    { label: 'Capacity', value: (s.capacity * s.columns - 5) / 10 },
    { label: 'Grip', value: (s.grip - 0.8) / 0.5 },
  ].map((b) => ({ ...b, value: Math.max(0.06, Math.min(1, b.value)) }));
}
