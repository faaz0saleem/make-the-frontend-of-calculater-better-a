import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { VEHICLES } from '../../src/data/vehicles';
import { applyUpgrades } from '../../src/data/upgrades';
import { CARGO } from '../../src/data/cargo';
import { TruckSim } from '../../src/sim/truck';
import { Rng } from '../../src/core/rng';

test('diag', () => {
  const out: string[] = [];
  const h = applyUpgrades(VEHICLES.pickup.stats, { suspension: 0, grip: 0, supports: 0 });
  for (const n of [1, 3, 5, 7]) {
    for (const scenario of ['straight', 'lanechange', 'curve55', 'curve100']) {
      const tr = new TruckSim(h, 16, new Rng(1));
      const cr: never[] = [];
      for (let i = 0; i < n; i++) tr.addCargo(i % 2 ? CARGO.crate : CARGO.parcel, cr);
      let maxR = 0, maxTip = 0, lost = 0;
      for (let step = 0; step < 120 * 4; step++) {
        const t = step / 120;
        let steer = 0, k = 0;
        if (scenario === 'lanechange') steer = t > 1 && t < 1.5 ? 1 : t > 2 && t < 2.5 ? -1 : 0;
        if (scenario === 'curve55') k = t > 0.5 ? 1 / 55 : 0;
        if (scenario === 'curve100') k = t > 0.5 ? 1 / 100 : 0;
        if (k) steer = Math.min(1, (0.11 * 16 * 16 * k) / h.maxLatSpeed);
        tr.step(1 / 120, steer, { curvature: k, vcurv: 0, rampH: 0, rampSlope: 0, overGap: false, gust: 0, puddle: 0 });
        maxR = Math.max(maxR, tr.maxRatio);
        maxTip = Math.max(maxTip, Math.abs(tr.tip));
        lost += tr.detached.length;
      }
      out.push(`n=${n} ${scenario.padEnd(10)} maxRatio=${maxR.toFixed(2)} maxTip=${maxTip.toFixed(2)} lost=${lost} felt=${tr.feltA.toFixed(2)} stab=${tr.stability.toFixed(2)}`);
    }
  }
  mkdirSync('qa/tmp', { recursive: true });
  writeFileSync(process.env.OUT ?? 'qa/tmp/diag.txt', out.join('\n'));
});
