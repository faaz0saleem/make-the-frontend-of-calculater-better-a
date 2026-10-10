import type { CargoShape } from './cargo';

export type ContractKind = 'fragileIntact' | 'noShedLevel' | 'bankEndless' | 'coinsRun' | 'itemsDelivered' | 'nearMisses' | 'deliverType' | 'jumps';

export interface ContractTemplate {
  kind: ContractKind;
  label: (n: number, extra?: string) => string;
  amounts: number[];
  reward: (n: number) => number;
}

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  { kind: 'fragileIntact', label: (n) => `Deliver ${n} fragile items without damage`, amounts: [2, 3, 4], reward: (n) => 60 + n * 25 },
  { kind: 'noShedLevel', label: () => 'Finish a campaign level without shedding cargo', amounts: [1], reward: () => 90 },
  { kind: 'bankEndless', label: (n) => `Bank ${n} coins at Long Haul depots in one run`, amounts: [80, 150, 250], reward: (n) => 50 + Math.round(n * 0.5) },
  { kind: 'coinsRun', label: (n) => `Grab ${n} road coins in one run`, amounts: [25, 40, 60], reward: (n) => 40 + n * 2 },
  { kind: 'itemsDelivered', label: (n) => `Deliver ${n} items in one run`, amounts: [6, 8, 10], reward: (n) => 40 + n * 12 },
  { kind: 'nearMisses', label: (n) => `Pull off ${n} near misses in one run`, amounts: [5, 8, 12], reward: (n) => 40 + n * 8 },
  { kind: 'deliverType', label: (n, extra) => `Deliver ${n} × ${extra}`, amounts: [2, 3], reward: (n) => 70 + n * 20 },
  { kind: 'jumps', label: (n) => `Land ${n} ramp jumps in one run`, amounts: [2, 3, 4], reward: (n) => 50 + n * 15 },
];

export const CONTRACT_TYPE_POOL: CargoShape[] = ['cake', 'crate', 'plant', 'washer', 'tv', 'barrel', 'lantern', 'fishtank', 'neon'];
