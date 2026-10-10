import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { LEVELS } from '../../src/data/levels';
import { VEHICLES } from '../../src/data/vehicles';
import { applyUpgrades } from '../../src/data/upgrades';
import { buildLevel, levelSpeedAt, evaluateMedals } from '../../src/modes/campaign';
import { RunSession } from '../../src/sim/run';
import { Autopilot } from '../../src/sim/autopilot';

test('explore', () => {
  const veh = (process.env.VEH ?? 'pickup') as keyof typeof VEHICLES;
  const h = applyUpgrades(VEHICLES[veh].stats, { suspension: 0, grip: 0, supports: 0 });
  const rows: string[] = [];
  for (const lv of LEVELS) {
    const built = buildLevel(lv);
    const run = new RunSession({ mode: 'campaign', track: built.track, handling: h, seed: 1, speedAt: levelSpeedAt(lv, built.finishS!), finishS: built.finishS, windScale: 1, wet: lv.wet });
    const ap = new Autopilot({ greed: 0.8 });
    const dt = 1 / 120;
    let minStab = 1;
    const spills: string[] = [];
    run.events.on('spill', (e) => spills.push(e.reason + ':' + e.items.length));
    while (run.state === 'running' && run.t < 200) {
      run.step(dt, ap.input(run, dt));
      minStab = Math.min(minStab, run.truck.stability);
    }
    const m = evaluateMedals(lv, run.stats, run.state === 'finished');
    rows.push(`${lv.id.padEnd(4)} ${run.state.padEnd(8)} ${String(run.crashReason ?? '').padEnd(9)} t=${run.t.toFixed(1).padStart(5)} len=${built.finishS!.toFixed(0)} coll=${run.stats.collected} del=${run.stats.delivered.length} val=${m.deliveredValue}/${lv.objectives.target} spill=${run.stats.spilled} shed=${run.stats.sheds} coins=${run.stats.coins} nm=${run.stats.nearMisses} rec=${run.stats.recoveries} minStab=${minStab.toFixed(2)} medals=${+m.delivery}${+m.route}${+m.care} [${spills.join(',')}]`);
  }
  writeFileSync(process.env.OUT ?? '/tmp/explore.txt', rows.join('\n'));
}, 120000);
