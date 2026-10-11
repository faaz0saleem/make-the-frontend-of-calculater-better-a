import { test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { LEVELS } from '../../src/data/levels';
import { buildLevel, levelSpeedAt } from '../../src/modes/campaign';
import { RunSession } from '../../src/sim/run';
import { Autopilot } from '../../src/sim/autopilot';
import { computeRewards } from '../../src/progression/rewards';
import { EndlessRoute } from '../../src/modes/endless';
import { handling } from '../unit/helpers';

test('economy sample', () => {
  const out: string[] = ['level,outcome,time_s,delivered_value,road_coins,total_coins_first_clear,total_coins_replay'];
  for (const l of LEVELS) {
    const b = buildLevel(l);
    const run = new RunSession({ mode: 'campaign', track: b.track, handling: handling('pickup'), seed: 3, speedAt: levelSpeedAt(l, b.finishS!), finishS: b.finishS, windScale: l.wind ?? 1, wet: l.wet });
    const ap = new Autopilot({ greed: 0.8 });
    while (run.state === 'running' && run.t < 200) run.step(1 / 120, ap.input(run, 1 / 120));
    const sum = { runId: 'x', mode: 'campaign' as const, levelId: l.id, outcome: run.state === 'finished' ? 'finished' as const : 'crashed' as const, stats: run.stats, distance: run.distance, forfeited: 0, lostCargo: 0, usedToken: false, vehicle: 'pickup' as const };
    const first = computeRewards(sum, null, 0, false);
    const replay = computeRewards(sum, [true, true, true], 1e9, false);
    const dv = run.stats.delivered.reduce((a, d) => a + d.value, 0);
    out.push(`${l.id},${run.state},${run.t.toFixed(0)},${dv},${run.stats.coins},${first.total},${replay.total}`);
  }
  // endless sample: 4 minutes
  const h = handling('pickup');
  for (const seed of [11, 22, 33]) {
    const route = new EndlessRoute({ seed, handling: h, startWorld: 1 });
    const run = new RunSession({ mode: 'endless', track: route.track, handling: h, seed, speedAt: route.speedAt, finishS: null });
    const ap = new Autopilot({ greed: 0.8 });
    while (run.state === 'running' && run.t < 240) {
      run.step(1 / 120, ap.input(run, 1 / 120));
      const { rebased } = route.update(run.truck.s);
      if (rebased) run.truck.s -= rebased;
    }
    const sum = { runId: 'e', mode: 'endless' as const, outcome: 'crashed' as const, stats: run.stats, distance: run.distance, forfeited: run.atRisk, lostCargo: 0, usedToken: false, vehicle: 'pickup' as const };
    const r = computeRewards(sum, null, 0, false);
    out.push(`endless-${seed},${run.state},${run.t.toFixed(0)},banked ${run.stats.banked},${run.stats.coins},${r.total},dist ${Math.round(run.distance)}`);
  }
  mkdirSync('qa/tmp', { recursive: true });
  writeFileSync(process.env.OUT ?? 'qa/tmp/economy.txt', out.join('\n'));
});
