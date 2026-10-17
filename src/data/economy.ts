/** All economy values in one place. See ECONOMY.md for the reasoning. */
export const ECONOMY = {
  coinPickupValue: 1,
  nearMissBonus: 3,
  recoveryBonus: 5,
  cleanLandingBonus: 3,
  levelClearBase: 12,
  levelClearPerIndex: 2, // + per campaign level number (1..30)
  firstMedalBonus: 20, // per medal earned the first time
  // Endless
  endlessDistancePoints: 1, // score points per meter
  endlessCoinsPer100m: 2, // coins awarded per 100 m driven
  depotMultipliers: [1, 1.25, 1.5, 1.8, 2.1, 2.5],
  endlessDepotEvery: [700, 950] as [number, number],
  // Daily
  dailyCompletionBonus: 150,
  // Recovery token
  spareTirePrice: 140,
  spareTireMax: 3,
  // Shed bonus: shedding when stability is critical
  heroShedBonus: 4,
  // Cosmetic trial (Full Launch rewarded ad alternative): runs of trial
  cosmeticTrialRuns: 3,
} as const;

/** Value multiplier for item condition (0..1) on delivery. */
export const deliveredValue = (base: number, condition: number): number =>
  Math.round(base * Math.max(0, Math.min(1, condition)));
