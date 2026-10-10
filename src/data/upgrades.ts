import type { VehicleStats } from './vehicles';

export type UpgradeTrack = 'suspension' | 'grip' | 'supports';

export interface UpgradeDef {
  id: UpgradeTrack;
  name: string;
  /** Short precise description of what one tier does. */
  perTier: string;
  costs: [number, number, number, number, number];
}

export const UPGRADES: Record<UpgradeTrack, UpgradeDef> = {
  suspension: { id: 'suspension', name: 'Suspension', perTier: '+6% roll resistance, +5% jolt absorption', costs: [300, 600, 1000, 1600, 2500] },
  grip: { id: 'grip', name: 'Tire Grip', perTier: '+5% steering response, +8% puddle resistance', costs: [300, 600, 1000, 1600, 2500] },
  supports: { id: 'supports', name: 'Cargo Supports', perTier: '+6% stack stiffness, +4% slide tolerance', costs: [350, 700, 1100, 1700, 2700] },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeTrack[];
export const MAX_TIER = 5;

export interface UpgradeLevels {
  suspension: number;
  grip: number;
  supports: number;
}

export interface EffectiveHandling extends VehicleStats {
  slipBonus: number; // multiplier on stack slip tolerance
  puddleResist: number; // 0..1
}

/** Apply upgrade tiers to base stats. Pure function; cosmetics are never inputs. */
export function applyUpgrades(base: VehicleStats, lv: UpgradeLevels): EffectiveHandling {
  const s = clampTier(lv.suspension), g = clampTier(lv.grip), c = clampTier(lv.supports);
  return {
    ...base,
    rollStiffness: base.rollStiffness * (1 + 0.06 * s),
    suspension: Math.min(0.95, base.suspension + 0.05 * s),
    latAccel: base.latAccel * (1 + 0.05 * g),
    maxLatSpeed: base.maxLatSpeed * (1 + 0.02 * g),
    grip: base.grip * (1 + 0.03 * g),
    support: base.support * (1 + 0.06 * c),
    slipBonus: 1 + 0.04 * c,
    puddleResist: Math.min(0.9, 0.08 * g * base.grip),
  };
}

export const clampTier = (t: number): number => Math.max(0, Math.min(MAX_TIER, Math.floor(Number.isFinite(t) ? t : 0)));

export function describeTier(track: UpgradeTrack, tier: number): string {
  const t = clampTier(tier);
  switch (track) {
    case 'suspension': return `+${6 * t}% roll resistance, +${5 * t}% jolt absorption`;
    case 'grip': return `+${5 * t}% steering response, +${8 * t}% puddle resistance`;
    case 'supports': return `+${6 * t}% stack stiffness, +${4 * t}% slide tolerance`;
  }
}
