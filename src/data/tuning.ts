/**
 * Global handling & stack tuning. All values are SI-ish (meters, seconds, kg).
 * Changing these changes feel for every vehicle; per-vehicle values live in vehicles.ts.
 */
export const TUNING = {
  simHz: 120,
  gravity: 9.81,

  // Forward motion
  forwardAccel: 5.5, // m/s^2 recovering toward target speed
  speedRecoverDelay: 0.25, // s after an impact before recovering

  // Lateral control
  steerRampUp: 7.5, // keyboard steer ramp (1/s)
  steerRampDown: 10,
  cornerDrift: 0.11, // fraction of v^2*k converted into outward lateral drift (arcade assist keeps most)
  edgeRumbleWidth: 0.6,
  dropMargin: 0.55, // how far past a drop edge the body centre may go before falling

  // Felt accelerations (scaled for arcade forgiveness)
  feelSteer: 0.12, // multiplier on lateral accel from steering felt by the cargo
  feelLag: 0.1, // s, suspension compliance low-pass on felt acceleration
  feelCorner: 0.42, // multiplier on centripetal accel felt by the cargo
  feelRoll: 0.6, // gravity component from body roll felt by cargo

  // Body roll / rollover
  tipGain: 1.3, // load transfer gain on combined COM height
  rollGain: 0.085, // rad of roll per unit load-transfer ratio
  rollSpring: 60,
  rollDamp: 9,
  wheelLiftLtr: 0.72,
  rolloverLtr: 1.0,
  rolloverTime: 0.45, // s above threshold before the truck goes over

  // Stack (per interface)
  stackK: 55, // base stiffness (per kg, scaled by grip)
  stackLoadStiffen: 0.55, // extra stiffness from load pressing down
  stackMaxStiffRatio: 9,
  stackDampRatio: 0.22, // fraction of critical damping
  stackLever: 0.3, // how much higher items amplify lateral inertia (per meter)
  slipFraction: 0.42, // fraction of supporting half-width an item may slide before falling
  wobbleWarn: 0.55,
  airborneGrip: 0.12,

  // Vertical
  suspensionSpring: 140,
  suspensionDamp: 14,
  rampLaunchFactor: 0.9, // vy = v * slope * factor
  landingJoltRef: 6, // m/s vertical speed considered a hard landing
  bumpJolt: 2.6, // m/s vertical jolt from a speed bump

  // Collisions
  glancingDepth: 0.38, // lateral overlap (m) below which a hard obstacle only scrapes
  nearMissGap: 0.55,
  minorImpulse: 2.4, // m/s lateral velocity given to cargo by cones etc.
  majorImpulse: 4.2,

  // Camera
  camBaseDist: 7.2,
  camBaseHeight: 3.4,
  camLookAhead: 9,
} as const;

export const ROAD = {
  laneWidth: 3,
  halfWidth: 4.5,
} as const;
